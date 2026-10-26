// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));

import { api, type Portfolio } from "@/lib/api";
import { latestReviewDate, notEnoughData, resetDate, RunTest } from "./run-test";

const PORTFOLIOS = [
  {
    id: "p1",
    name: "Long term",
    cash: 0,
    portfolio_positions: [
      { ticker: "AAPL", shares: 2, company_name: "Apple Inc." },
      { ticker: "MSFT", shares: 1, name: "Microsoft" },
    ],
  },
  { id: "p2", name: "Kids", cash: 0, portfolio_positions: [{ ticker: "AAPL", shares: 5 }] },
] as Portfolio[];

function renderPage() {
  return render(
    <RunTest
      portfolios={PORTFOLIOS}
      dailyLimit={10}
      subtitle="Review holdings"
      friendlyError={(error) => error.message}
      renderReport={(run) => <p>Report {run.ticker}</p>}
    />,
  );
}

const open = (name: RegExp) => fireEvent.click(screen.getByRole("button", { name }));

describe("RunTest", () => {
  let posted: { portfolio_id: string; ticker: string; as_of: string }[];
  let left: number;
  let firstStatus: string;
  beforeEach(() => {
    posted = [];
    left = 10;
    firstStatus = "completed";
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/ai-usage") return { ai_review: { used: 10 - left, limit: 10, left, period: "month", resets_on: "2026-11-01" } };
      if (path === "/api/analyses" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posted.push(body);
        const status = posted.length === 1 ? firstStatus : "completed";
        return { id: `run-${posted.length}`, ticker: body.ticker, status, as_of: body.as_of };
      }
      if (path.startsWith("/api/analyses/")) {
        return { id: path.split("/").at(-1), ticker: "AAPL", status: "completed", as_of: "2026-10-25" };
      }
      return undefined;
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("uses yesterday in New York as the latest close", () => {
    // 03:00 UTC on 27 Oct is still 26 Oct in New York.
    expect(latestReviewDate(new Date("2026-10-27T03:00:00Z"))).toBe("2026-10-25");
    expect(latestReviewDate(new Date("2026-10-27T15:00:00Z"))).toBe("2026-10-26");
  });

  it("picks everything by default and shows what it costs in tokens", async () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Portfolios: All (2)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Holdings: All (3)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run 3 reviews" })).toBeTruthy();
    const wallet = screen.getByRole("region", { name: "Your tokens" });
    expect((await screen.findByRole("meter", { name: "Tokens used this month" })).getAttribute("aria-valuenow")).toBe("0");
    expect(wallet.textContent).toContain("10 of 10 left");
    expect(wallet.textContent).toContain("This run: 3 tokens, 7 left after.");
    expect(screen.queryByRole("alert")).toBeNull();

    open(/^Holdings/);
    expect(screen.getByRole("checkbox", { name: "Review AAPL in Long term" })).toHaveProperty("checked", true);
    expect(screen.getByRole("checkbox", { name: "Review AAPL in Kids" })).toHaveProperty("checked", true);
    expect(screen.getByText("Apple Inc.")).toBeTruthy();
  });

  it("narrows by portfolio and holding from the dropdowns", () => {
    renderPage();
    open(/^Portfolios/);
    fireEvent.click(screen.getByRole("checkbox", { name: "Kids" }));
    expect(screen.getByRole("button", { name: "Portfolios: 1 of 2" })).toBeTruthy();

    open(/^Holdings/);
    expect(screen.queryByRole("checkbox", { name: "Review AAPL in Kids" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "Review MSFT in Long term" }));
    expect(screen.getByRole("button", { name: "Run 1 review" })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all holdings" }));
    expect(screen.getByRole("button", { name: "Run 2 reviews" })).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all holdings" }));
    expect(screen.getByRole("button", { name: "Run 0 reviews" })).toHaveProperty("disabled", true);
  });

  it("warns when the run needs more tokens than are left but still lets it run", async () => {
    left = 2;
    let limited = 0;
    const base = vi.mocked(api).getMockImplementation()!;
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST" && ++limited > 2) {
        throw new Error("You've used today's AI reviews. Try again tomorrow.");
      }
      return base(path, init);
    });
    renderPage();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "This run needs 3 tokens, but you have 2 left. The first 2 will run and the rest won't start.",
    );
    const run = screen.getByRole("button", { name: "Run 3 reviews" });
    expect(run).toHaveProperty("disabled", false);
    fireEvent.click(run);

    expect(await screen.findByText(/1 not started \(no tokens used\)/)).toBeTruthy();
    expect(posted).toHaveLength(2);
  });

  it("says when today's free tokens are used up and previews buying more", async () => {
    left = 0;
    renderPage();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "You've used this month's 10 free tokens. They come back on Nov 1, or you can buy more tokens.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Buy tokens" }));
    const dialog = screen.getByRole("dialog", { name: "Buy tokens" });
    expect(dialog.textContent).toContain("100 tokens");
    expect(screen.getAllByRole("button", { name: "Coming soon" })[0]).toHaveProperty("disabled", true);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the monthly reset date", () => {
    expect(resetDate("2026-11-01")).toBe("Nov 1");
    expect(resetDate(null, new Date("2026-12-31T23:00:00Z"))).toBe("Jan 1");
  });

  it("reviews the holdings one at a time with a progress bar", async () => {
    renderPage();
    await screen.findByRole("meter", { name: "Tokens used this month" });
    fireEvent.click(screen.getByRole("button", { name: "Run 3 reviews" }));

    expect(await screen.findByText("Finished")).toBeTruthy();
    expect(posted).toEqual([
      { portfolio_id: "p1", ticker: "AAPL", as_of: latestReviewDate() },
      { portfolio_id: "p1", ticker: "MSFT", as_of: latestReviewDate() },
      { portfolio_id: "p2", ticker: "AAPL", as_of: latestReviewDate() },
    ]);
    expect(screen.getByRole("progressbar", { name: "Reviews done" }).getAttribute("aria-valuenow")).toBe("3");
    expect(screen.getAllByText("Report AAPL")).toHaveLength(2);
  });

  it("stops after the review in progress and starts nothing else", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    firstStatus = "running";
    renderPage();
    await screen.findByRole("meter", { name: "Tokens used this month" });
    fireEvent.click(screen.getByRole("button", { name: "Run 3 reviews" }));

    expect(await screen.findByText("Reviewing AAPL")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(screen.getByText("Stopping after this review…")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500);
    });

    await waitFor(() => expect(screen.getByText("Stopped")).toBeTruthy());
    expect(posted).toHaveLength(1);
    expect(screen.getByText(/2 not started \(no tokens used\)/)).toBeTruthy();
  });

  it("stops the queue when the AI key is broken", async () => {
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/ai-usage") return { ai_review: { used: 0, limit: 10, left: 10 } };
      if (init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)));
        throw new Error("AI reviews can't run right now: Anthropic rejected the API key. No token was used.");
      }
      return undefined;
    });
    renderPage();
    await screen.findByRole("meter", { name: "Tokens used this month" });
    fireEvent.click(screen.getByRole("button", { name: "Run 3 reviews" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Anthropic rejected the API key");
    expect(posted).toHaveLength(1);
    expect(screen.getByText(/3 not started/)).toBeTruthy();
  });

  it("leaves out holdings that can't be reviewed and skips a refused one without stopping", async () => {
    const base = vi.mocked(api).getMockImplementation()!;
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/api/analyses/readiness")) {
        expect(path).toContain("tickers=AAPL%2CMSFT");
        return { AAPL: null, MSFT: "Only 2 of 4 quarters of financials are filed so far." };
      }
      return base(path, init);
    });
    renderPage();

    expect(await screen.findByText(/1 holding can't be reviewed yet and is left out:/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run 2 reviews" })).toBeTruthy();
    open(/^Holdings/);
    const msft = screen.getByRole("checkbox", { name: "Review MSFT in Long term" });
    expect(msft).toHaveProperty("checked", false);
    expect(msft).toHaveProperty("disabled", true);
    expect(screen.getByText(/Can't review yet: Only 2 of 4 quarters/)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Select all holdings" })).toHaveProperty("checked", true);
  });

  it("keeps going when the server refuses one holding for missing filings", async () => {
    const base = vi.mocked(api).getMockImplementation()!;
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === "POST" && String(init.body).includes("MSFT")) {
        throw new Error("MSFT can't be reviewed yet. Only 2 of 4 quarters are filed. No token was used.");
      }
      return base(path, init);
    });
    renderPage();
    await screen.findByRole("meter", { name: "Tokens used this month" });
    fireEvent.click(screen.getByRole("button", { name: "Run 3 reviews" }));

    expect(await screen.findByText("Finished")).toBeTruthy();
    expect(screen.getByText("Can't review yet")).toBeTruthy();
    expect(posted.map((body) => body.ticker)).toEqual(["AAPL", "AAPL"]);
  });

  it("calls a review where every persona lacked filed data 'not enough data'", () => {
    const abstain = { abstained: true, reasoning: "abstained: insufficient data: only 0 filed periods (need 4)" };
    expect(notEnoughData({ analysis_signals: [abstain, abstain] } as never)).toBe(true);
    expect(notEnoughData({ analysis_signals: [abstain, { abstained: false, reasoning: "bullish" }] } as never)).toBe(false);
    expect(notEnoughData({ analysis_signals: [] } as never)).toBe(false);
  });
});
