// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/lib/api";
import { PortfolioAnalyticsDashboard } from "./portfolio-analytics-dashboard";

vi.mock("@/lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...original,
    api: vi.fn(async (path: string) =>
      path.startsWith("/api/funds/holdings")
        ? {
            VOO: {
              holdings: [
                { ticker: "AAPL", name: "Apple Inc", weight: 0.07 },
                { ticker: "NVDA", name: "NVIDIA Corp", weight: 0.08 },
              ],
              sectors: { "Information Technology": 0.4, "Health Care": 0.6 },
            },
          }
        : {
      SPY: [
        { date: "2025-10-23", close: 100 },
        { date: "2026-10-23", close: 110 },
      ],
      AAPL: [
        { date: "2025-10-23", close: 160 },
        { date: "2026-10-23", close: 200 },
      ],
      VOO: [
        { date: "2025-10-23", close: 450 },
        { date: "2026-10-23", close: 500 },
      ],
          },
    ),
  };
});

const positions = [
  {
    ticker: "AAPL",
    name: "Apple Inc.",
    shares: 10,
    price: 200,
    purchase_price: 100,
    price_date: "2026-10-23",
    sector: "Information Technology",
    industry: "Consumer Electronics",
    asset_type: "Common Stock" as const,
    lifecycle_phase: "Capital Return" as const,
  },
  {
    ticker: "VOO",
    name: "Vanguard S&P 500 ETF",
    shares: 1,
    price: 500,
    purchase_price: 450,
    price_date: "2026-10-23",
    asset_type: "ETF" as const,
    is_etf_index: true,
    lifecycle_phase: "Not Applicable" as const,
  },
];

describe("PortfolioAnalyticsDashboard", () => {
  afterEach(cleanup);

  it("provides portfolio, benchmark, date-range, and allocation controls", () => {
    render(
      <PortfolioAnalyticsDashboard
        portfolios={[
          {
            id: "one",
            name: "Core",
            cash: 100,
            portfolio_positions: positions,
          },
        ]}
        selectedId="one"
        positions={positions}
        cash={100}
        asOfDate="2026-10-23"
        limits={{ maxPositionPct: 0.5 }}
        onSelectPortfolio={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Portfolio")).toBeTruthy();
    expect(screen.getByLabelText("Benchmark")).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "Portfolio summary" }).children,
    ).toHaveLength(8);
    expect(screen.getByText("Cash balance")).toBeTruthy();
    expect(screen.getByText(/^Target 5% · (\$[\d,.]+ to add|met)$/)).toBeTruthy();
    expect(
      screen.getByRole("img", { name: /at least 5% of your portfolio in cash/ }),
    ).toBeTruthy();
    expect(screen.queryByText("Cash Percentage")).toBeNull();
    expect(screen.queryByText("Unrealized gain/loss %")).toBeNull();
    expect(
      screen.getByText("Holdings / risk warnings"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "3M" }));
    expect(
      screen.getByRole("button", { name: "3M" }).getAttribute("aria-pressed"),
    ).toBe("true");

    expect(screen.getByRole("heading", { name: "Positions" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Asset types" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Sectors" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Industries" })).toBeTruthy();
    expect(
      [...document.querySelectorAll(".allocation-box > h3")].map(
        (heading) => heading.textContent,
      ),
    ).toEqual(["Positions", "Industries", "Sectors", "Asset types"]);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByText("Information Technology")).toBeTruthy();
    expect(screen.queryByLabelText("Exposure View")).toBeNull();
    expect(screen.getByText("ETF")).toBeTruthy();
    expect(screen.getAllByText("Excluded from risk limits").length).toBeGreaterThan(0);
  });

  it("shows benchmark and current-holdings performance and every current risk warning", async () => {
    render(
      <PortfolioAnalyticsDashboard
        portfolios={[]}
        selectedId=""
        positions={positions}
        cash={0}
        asOfDate="2026-10-23"
        limits={{ maxPositionPct: 0.25, minCashPct: 0.05 }}
        onSelectPortfolio={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    // Benchmark and current-holdings performance come from completed daily closes.
    const benchmarkCard = (await screen.findByText("Benchmark return")).closest("article");
    await waitFor(() => expect(benchmarkCard?.textContent).toContain("+10.0%"));
    expect(benchmarkCard?.textContent).toContain("pts");
    expect(screen.queryByText(/current holdings as if held/)).toBeNull();
    expect(screen.getByRole("img", { name: /Percentage return from 2025-10-23 to 2026-10-23/ })).toBeTruthy();
    expect(
      vi.mocked(api).mock.calls.some(([path]) => path.startsWith("/api/prices/history?tickers=")),
    ).toBe(true);
    expect(
      screen.getAllByText(/AAPL represents 80.0% of portfolio value/).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/Cash represents 0.0%/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
    // Portfolio, benchmark, and refresh sit in the chart box; the review summary is gone.
    const chartBox = screen
      .getByRole("group", { name: "Analytics controls" })
      .closest(".performance-module");
    expect(chartBox?.contains(screen.getByRole("button", { name: "Refresh" }))).toBe(true);
    expect(chartBox?.contains(screen.getByRole("button", { name: "6M" }))).toBe(true);
    expect(screen.queryByText("StockBuddy Portfolio Review")).toBeNull();
    expect(screen.getByRole("heading", { name: "Risk limits" })).toBeTruthy();
    const guide = screen.getByRole("complementary", { name: "What is a normal allocation" });
    expect(guide.textContent).toContain("One position:");
    // The education note can be hidden and shown again, and the choice is remembered.
    const toggle = within(guide).getByRole("button", { name: /What's considered normal\?/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(guide.textContent).not.toContain("One position:");
    expect(window.localStorage.getItem("stockbuddy.allocationGuideOpen")).toBe("false");
    fireEvent.click(toggle);
    expect(guide.textContent).toContain("One position:");
    // The page title links to each section by anchor.
    const jump = screen.getByRole("navigation", { name: "Jump to section" });
    for (const [name, id] of [
      ["Allocation", "analytics-allocation"],
      ["Gains / Losses", "analytics-gains-losses"],
      ["Risk analysis", "analytics-risk"],
    ]) {
      expect(within(jump).getByRole("link", { name }).getAttribute("href")).toBe(`#${id}`);
      expect(document.getElementById(id)).toBeTruthy();
    }
  });

  it("counts funds through their top holdings and lets the person switch to direct holdings", async () => {
    render(
      <PortfolioAnalyticsDashboard
        portfolios={[]}
        selectedId=""
        positions={positions}
        cash={0}
        asOfDate="2026-10-23"
        limits={{ maxPositionPct: 0.5 }}
        onSelectPortfolio={vi.fn()}
        onRefresh={vi.fn()}
      />,
    );

    expect(
      vi.mocked(api).mock.calls.some(([path]) => path === "/api/funds/holdings?tickers=VOO"),
    ).toBe(true);
    const include = await screen.findByRole("button", { name: "Include fund holdings" });
    await waitFor(() => expect(include.getAttribute("aria-pressed")).toBe("true"));
    expect(screen.getByText(/Funds count through their top 10 holdings/)).toBeTruthy();
    const positionsBox = screen.getByRole("heading", { name: "Positions" }).closest("section")!;
    // AAPL is held directly and through VOO; NVDA only through VOO.
    expect(within(positionsBox).getByText("AAPL, VOO")).toBeTruthy();
    expect(within(positionsBox).getByText("NVDA")).toBeTruthy();
    expect(within(positionsBox).getByText("VOO · other holdings")).toBeTruthy();
    const sectorsBox = screen.getByRole("heading", { name: "Sectors" }).closest("section")!;
    expect(within(sectorsBox).getByText("Health Care")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Direct holdings" }));
    expect(
      screen.getByRole("button", { name: "Direct holdings" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(within(positionsBox).queryByText("VOO · other holdings")).toBeNull();
    expect(within(positionsBox).queryByText("NVDA")).toBeNull();
    expect(screen.queryByText(/Funds count through their top 10 holdings/)).toBeNull();
  });

  it("shows the empty portfolio and refreshing states", async () => {
    const refresh = vi.fn(
      () => new Promise<void>((resolve) => setTimeout(resolve, 1)),
    );
    const { rerender } = render(
      <PortfolioAnalyticsDashboard
        portfolios={[]}
        selectedId=""
        positions={[]}
        cash={0}
        asOfDate="2026-10-23"
        limits={{}}
        onSelectPortfolio={vi.fn()}
        onRefresh={refresh}
      />,
    );
    expect(
      screen.getByRole("heading", {
        name: "Add holdings to see portfolio analytics",
      }),
    ).toBeTruthy();

    rerender(
      <PortfolioAnalyticsDashboard
        portfolios={[]}
        selectedId=""
        positions={positions}
        cash={0}
        asOfDate="2026-10-23"
        limits={{}}
        onSelectPortfolio={vi.fn()}
        onRefresh={refresh}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
    expect(screen.getByRole("button", { name: "Refreshing" })).toBeTruthy();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
