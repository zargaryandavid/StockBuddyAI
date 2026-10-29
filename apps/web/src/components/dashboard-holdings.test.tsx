// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { api } from "@/lib/api";
import { Dashboard } from "./dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut: vi.fn() } }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return { ...original, api: vi.fn(), apiUpload: vi.fn() };
});

const portfolio = {
  id: "portfolio-1",
  name: "Book",
  cash: 0,
  portfolio_positions: [
    { ticker: "AAA", shares: 10, purchase_price: 10, display_order: 0 },
    { ticker: "BBB", shares: 5, purchase_price: 20, display_order: 1 },
    { ticker: "VOO", shares: 1, purchase_price: 500, display_order: 2 },
  ],
};

const quotes: Record<string, Record<string, unknown>> = {
  AAA: {
    ticker: "AAA",
    name: "Alpha Corp.",
    price: 12,
    asset_type: "Common Stock",
    pe_ratio: 18.24,
    report_date: "2026-08-01",
    report_source: "SEC EDGAR",
  },
  BBB: {
    ticker: "BBB",
    name: "Beta Inc.",
    price: 25,
    asset_type: "Common Stock",
    pe_ratio: null,
    report_date: "2026-07-15",
  },
  VOO: {
    ticker: "VOO",
    name: "Vanguard S&P 500 ETF",
    price: 600,
    asset_type: "ETF",
    is_etf_index: true,
    pe_ratio: null,
  },
};

function mockApi() {
  vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/api/portfolios" && !init) return [portfolio];
    if (path === "/api/securities/resolve-batch") {
      const { queries } = JSON.parse(String(init?.body)) as { queries: string[] };
      return queries.map((query) => ({ query, data: quotes[query.toUpperCase()] }));
    }
    if (path.startsWith("/api/securities/resolve")) {
      const query = new URL(`http://x${path}`).searchParams.get("query") ?? "";
      return quotes[query.toUpperCase()];
    }
    if (path === "/api/reminders" && !init) return [];
    if (path === "/api/reminders" && init?.method === "POST") {
      return { id: "reminder-1", status: "pending", ...JSON.parse(String(init.body)) };
    }
    if (path === `/api/portfolios/${portfolio.id}` && init?.method === "PUT") {
      return { ...portfolio, ...JSON.parse(String(init.body)) };
    }
    return [];
  });
}

function tickers() {
  return Array.from(document.querySelectorAll<HTMLInputElement>(".holding-identity input")).map(
    (input) => input.value,
  );
}

function dataTransfer() {
  return { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: "", dropEffect: "" };
}

describe("Holdings table", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    mockApi();
  });
  afterEach(cleanup);

  it("shows P/E for operating companies and N/A for funds", async () => {
    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);

    expect(await screen.findByText("18.2")).toBeTruthy();
    expect(screen.getByText("P/E")).toBeTruthy();
    const fundRow = screen.getByDisplayValue("VOO").closest(".holdings-primary-row");
    expect(fundRow?.textContent).toContain("N/A");
  });

  it("reorders rows by dragging and saves the new order", async () => {
    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);
    await screen.findByText("18.2");
    expect(tickers()).toEqual(["AAA", "BBB", "VOO"]);

    const handle = screen.getByRole("button", { name: /^Move VOO/ });
    const target = screen.getByDisplayValue("AAA").closest(".holding-record") as Element;
    const transfer = dataTransfer();
    fireEvent.dragStart(handle, { dataTransfer: transfer });
    fireEvent.dragOver(target, { dataTransfer: transfer });
    fireEvent.drop(target, { dataTransfer: transfer });

    expect(tickers()).toEqual(["VOO", "AAA", "BBB"]);

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(vi.mocked(api)).toHaveBeenCalledWith(
        `/api/portfolios/${portfolio.id}`,
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    const saveCall = vi
      .mocked(api)
      .mock.calls.find(([path, init]) => path === `/api/portfolios/${portfolio.id}` && init?.method === "PUT");
    const body = JSON.parse(String(saveCall?.[1]?.body));
    expect(body.positions.map((position: { ticker: string }) => position.ticker)).toEqual([
      "VOO",
      "AAA",
      "BBB",
    ]);
  });

  it("opens a saved portfolio in its saved order, not alphabetically", async () => {
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/portfolios" && !init) {
        return [
          {
            ...portfolio,
            portfolio_positions: [
              { ticker: "AAA", shares: 10, display_order: 2 },
              { ticker: "BBB", shares: 5, display_order: 0 },
              { ticker: "VOO", shares: 1, display_order: 1 },
            ],
          },
        ];
      }
      if (path === "/api/securities/resolve-batch") {
      const { queries } = JSON.parse(String(init?.body)) as { queries: string[] };
      return queries.map((query) => ({ query, data: quotes[query.toUpperCase()] }));
    }
    if (path.startsWith("/api/securities/resolve")) {
        const query = new URL(`http://x${path}`).searchParams.get("query") ?? "";
        return quotes[query.toUpperCase()];
      }
      return [];
    });
    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);
    await screen.findByText("18.2");

    expect(tickers()).toEqual(["BBB", "VOO", "AAA"]);
  });

  it("keeps the portfolio in its own currency when the cash is typed in another", async () => {
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/api/fx")) return { rate: 0.0025 };
      if (path === `/api/portfolios/${portfolio.id}` && init?.method === "PUT") {
        return { ...portfolio, ...JSON.parse(String(init.body)) };
      }
      if (path === "/api/portfolios" && !init) return [portfolio];
      if (path === "/api/securities/resolve-batch") {
        const { queries } = JSON.parse(String(init?.body)) as { queries: string[] };
        return queries.map((query) => ({ query, data: quotes[query.toUpperCase()] }));
      }
      return [];
    });
    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);
    await screen.findByText("18.2");
    const lookups = () =>
      vi.mocked(api).mock.calls.filter(([path]) => path === "/api/securities/resolve-batch").length;
    const before = lookups();

    fireEvent.change(screen.getByLabelText("Cash currency"), { target: { value: "AMD" } });
    const amount = screen.getByRole("textbox", { name: "Cash" });
    fireEvent.focus(amount);
    fireEvent.change(amount, { target: { value: "400000" } });

    // ֏400,000 at 0.0025 is $1,000, shown in the portfolio's own currency.
    expect(await screen.findByText(/All cash together: \$1,000\.00/)).toBeTruthy();
    expect(lookups()).toBe(before); // holdings are not priced again
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => {
      const put = vi.mocked(api).mock.calls.find(([path, init]) => path === `/api/portfolios/${portfolio.id}` && init?.method === "PUT");
      expect(put).toBeTruthy();
      const body = JSON.parse(String(put?.[1]?.body));
      expect(body.base_currency).toBe("USD");
      expect(body.cash).toBe(0);
      expect(body.other_cash).toEqual([{ currency: "AMD", amount: 400000 }]);
    });
  });

  it("shows cash typed on Portfolio on Today before it is saved, and says so", async () => {
    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);
    await screen.findByText("18.2");
    const amount = screen.getByRole("textbox", { name: "Cash" });
    fireEvent.focus(amount);
    fireEvent.change(amount, { target: { value: "1000" } });
    fireEvent.blur(amount);

    fireEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(await screen.findByText(/changes to .* that are not saved yet/)).toBeTruthy();
    const card = (await screen.findAllByText("Cash")).map((node) => node.closest(".today-card")).find(Boolean);
    // Amounts start hidden on this device until the eye button shows them.
    await waitFor(() => expect(card?.textContent).toContain("•••••"));
    expect(card?.textContent).not.toContain("$1,000.00");
    fireEvent.click(screen.getByRole("button", { name: "Show amounts" }));
    await waitFor(() => expect(card?.textContent).toContain("$1,000.00"));
    // The Cash card is not a link; its explanation opens from the (i) button.
    expect(card?.tagName).toBe("ARTICLE");
    expect(screen.queryByText(/cash kept aside covers emergencies/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "About the cash target" }));
    expect(screen.getByRole("dialog", { name: "About the cash target" }).textContent).toContain(
      "cash kept aside covers emergencies",
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "About the cash target" })).toBeNull();
    const breakdown = document.querySelector(".today-breakdown")?.textContent ?? "";
    expect(breakdown).toContain("Reserved cash $1,000.00");
    expect(breakdown).toMatch(/^Portfolio \$[\d,.]+ · Reserved cash \$1,000\.00 · Savings \$0\.00 · Bonds \$0\.00$/);
    // Hiding again is remembered.
    fireEvent.click(screen.getByRole("button", { name: "Hide amounts" }));
    expect(card?.textContent).not.toContain("$1,000.00");
    expect(window.localStorage.getItem("mpb.showAmounts")).toBe("0");
  });

  it("moves a row with the arrow keys on its handle", async () => {
    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);
    await screen.findByText("18.2");

    fireEvent.keyDown(screen.getByRole("button", { name: /^Move BBB/ }), { key: "ArrowUp" });

    expect(tickers()).toEqual(["BBB", "AAA", "VOO"]);
  });

  it("opens a report reminder from the report date and saves it", async () => {
    // The page uses the browser's own date; pin it to the day the test is written for.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 23, 12));
    onTestFinished(() => {
      vi.useRealTimers();
    });
    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);
    await screen.findByText("18.2");

    fireEvent.click(
      screen.getByRole("button", { name: "Set a report reminder for AAA, last report 2026-08-01" }),
    );

    const dialog = screen.getByRole("dialog", { name: "Report reminder for AAA" });
    expect(dialog.textContent).toContain("around 2026-10-31");
    expect(screen.getByLabelText("Email me on")).toHaveProperty("value", "2026-10-28");
    expect(screen.getByLabelText("Send to")).toHaveProperty("value", "owner@example.com");

    fireEvent.click(screen.getByRole("button", { name: "Send me a reminder" }));

    expect(await screen.findByText(/Reminder set\. We’ll email owner@example\.com on 2026-10-28/)).toBeTruthy();
    const postCall = vi
      .mocked(api)
      .mock.calls.find(([path, init]) => path === "/api/reminders" && init?.method === "POST");
    expect(JSON.parse(String(postCall?.[1]?.body))).toEqual({
      ticker: "AAA",
      remind_on: "2026-10-28",
      portfolio_id: "portfolio-1",
      company_name: "Alpha Corp.",
      last_report_date: "2026-08-01",
    });
  });

  it("does not offer a reminder for funds", async () => {
    render(<Dashboard initialTab="portfolio" email="owner@example.com" today="2026-10-23" />);
    await screen.findByText("18.2");

    expect(screen.queryByRole("button", { name: /report reminder for VOO/ })).toBeNull();
  });
});
