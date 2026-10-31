import { describe, expect, it } from "vitest";

import type { Portfolio } from "@/lib/api";

import type { FireEntry } from "@/lib/fire";

import {
  attentionItems,
  cashFlowsBetween,
  changeSinceLast,
  holdingTiles,
  portfolioSnapshot,
  todayMovers,
  upcomingReports,
  type Quote,
} from "./today";

const portfolio: Portfolio = {
  id: "p1",
  name: "Core",
  cash: 0,
  portfolio_positions: [
    { ticker: "NVDA", shares: 10, report_date: "2026-08-27" },
    { ticker: "VOO", shares: 10, asset_type: "ETF" },
    { ticker: "GONE", shares: 5 },
  ],
};

const quotes = new Map<string, Quote>([
  ["NVDA", { ticker: "NVDA", price: 100, day_change: 2 }],
  ["VOO", { ticker: "VOO", price: 50, day_change: -1, is_etf_index: true }],
]);

describe("Today numbers", () => {
  it("values a portfolio from its quotes and names holdings without a price", () => {
    const snapshot = portfolioSnapshot(portfolio, quotes);
    expect(snapshot.total).toBe(1500);
    expect(snapshot.dayChange).toBe(10);
    expect(snapshot.unpriced).toEqual(["GONE"]);
    expect(snapshot.holdings.find((row) => row.ticker === "VOO")?.isFund).toBe(true);
  });

  it("flags a company above its limit and missing cash, but not a fund", () => {
    const snapshot = portfolioSnapshot(portfolio, quotes);
    const items = attentionItems([snapshot], [portfolio], { max_position_pct: 0.25 });
    expect(items).toEqual([
      expect.objectContaining({ kind: "position", ticker: "NVDA", limit: 0.25, excess: 1000 - 375 }),
      expect.objectContaining({ kind: "cash", target: 0.05, missing: 75 }),
    ]);
  });

  it("expects the next company report about three months after the last", () => {
    expect(upcomingReports([portfolio], "2026-11-10")).toEqual([
      { ticker: "NVDA", expected: "2026-11-26", lastReport: "2026-08-27" },
    ]);
    expect(upcomingReports([portfolio], "2026-10-01")).toEqual([]);
  });

  it("compares with the last reading before today", () => {
    const points = [
      { day: "2026-10-20", investments: 0, savings: 0, other_assets: 0, total: 900 },
      { day: "2026-10-27", investments: 0, savings: 0, other_assets: 0, total: 990 },
    ];
    expect(changeSinceLast(points, "2026-10-27", 1000)).toEqual({ amount: 100, since: "2026-10-20" });
    expect(changeSinceLast([], "2026-10-27", 1000)).toBeNull();
  });
});

describe("cash in other currencies", () => {
  it("adds it at today's rate and leaves out a currency without one", () => {
    const mixed: Portfolio = {
      ...portfolio,
      cash: 100,
      other_cash: [
        { currency: "AMD", amount: 40000 },
        { currency: "EUR", amount: 10 },
      ],
    };
    expect(portfolioSnapshot(mixed, quotes, { AMD: 0.0025 }).cash).toBe(200);
  });
});

describe("todayMovers", () => {
  const holding = (positions: { ticker: string; shares: number }[]) =>
    ({ id: "p", name: "Main", cash: 0, portfolio_positions: positions }) as unknown as Portfolio;

  it("ranks rises and falls by percent and adds up shares across portfolios", () => {
    const quotes = new Map<string, Quote>([
      ["NVDA", { ticker: "NVDA", company_name: "NVIDIA", day_change: 4, day_change_percent: 2.5, price_date: "2026-10-28" }],
      ["AAPL", { ticker: "AAPL", day_change: 1, day_change_percent: 0.5 }],
      ["SMCI", { ticker: "SMCI", day_change: -2, day_change_percent: -5 }],
      ["XE", { ticker: "XE", day_change: -0.5, day_change_percent: -1 }],
      ["FLAT", { ticker: "FLAT", day_change: 0, day_change_percent: 0 }],
      ["NEW", { ticker: "NEW", day_change: null, day_change_percent: null }],
    ]);
    const { up, down } = todayMovers(
      [
        holding([{ ticker: "nvda", shares: 10 }, { ticker: "AAPL", shares: 1 }, { ticker: "SMCI", shares: 3 }]),
        holding([{ ticker: "NVDA", shares: 5 }, { ticker: "XE", shares: 2 }, { ticker: "FLAT", shares: 1 }, { ticker: "NEW", shares: 1 }]),
      ],
      quotes,
    );
    expect(up.map((item) => item.ticker)).toEqual(["NVDA", "AAPL"]);
    expect(up[0]).toMatchObject({ name: "NVIDIA", change: 4, pct: 2.5, impact: 60, shares: 15, priceDate: "2026-10-28" });
    expect(down.map((item) => [item.ticker, item.impact])).toEqual([["SMCI", -6], ["XE", -1]]);
  });

  it("shows at most three each way", () => {
    const tickers = ["A", "B", "C", "D"];
    const quotes = new Map<string, Quote>(
      tickers.map((ticker, index) => [ticker, { ticker, day_change: 1, day_change_percent: index + 1 }]),
    );
    const { up } = todayMovers([holding(tickers.map((ticker) => ({ ticker, shares: 1 })))], quotes);
    expect(up.map((item) => item.ticker)).toEqual(["D", "C", "B"]);
  });
});

describe("cashFlowsBetween", () => {
  const entry = (overrides: Partial<FireEntry>): FireEntry => ({
    id: overrides.name ?? "x",
    kind: "expense",
    category: "other",
    name: "Rent",
    amount: 100,
    currency: "USD",
    frequency: "monthly",
    starts_on: "2026-01-01",
    ends_on: null,
    principal: null,
    yield_pct: null,
    note: null,
    ...overrides,
  });

  it("lists income and expenses due in the window, converted to the base currency", () => {
    const flows = cashFlowsBetween(
      [
        entry({ name: "Rent", starts_on: "2026-01-28", amount: 2975 }),
        entry({ name: "Salary", kind: "income", starts_on: "2026-02-01", amount: 5000 }),
        entry({ name: "Bond coupon", kind: "income", currency: "AMD", starts_on: "2026-11-03", amount: 36000, frequency: "quarterly" }),
        entry({ name: "Gym", starts_on: "2026-01-15", amount: 39 }),
        entry({ name: "Old", starts_on: "2025-01-28", ends_on: "2026-06-30" }),
      ],
      "2026-10-28",
      "2026-11-04",
      { AMD: 0.0026 },
    );
    expect(flows.map((item) => [item.date, item.name])).toEqual([
      ["2026-10-28", "Rent"],
      ["2026-11-01", "Salary"],
      ["2026-11-03", "Bond coupon"],
    ]);
    expect(flows[2].baseAmount).toBeCloseTo(93.6);
  });
});

describe("holdingTiles", () => {
  it("lists every priced holding by value, with its sector and today's move", () => {
    const quotes = new Map<string, Quote>([
      ["NVDA", { ticker: "NVDA", price: 200, sector: "Information Technology", day_change: 4, day_change_percent: 2 }],
      ["VOO", { ticker: "VOO", price: 500, is_etf_index: true, day_change: -1, day_change_percent: -0.2 }],
      ["ODD", { ticker: "ODD", price: 10, sector: "Unknown", day_change: null, day_change_percent: null }],
    ]);
    const tiles = holdingTiles(
      [{ id: "p", name: "Main", cash: 0, portfolio_positions: [
        { ticker: "NVDA", shares: 5 },
        { ticker: "VOO", shares: 1 },
        { ticker: "ODD", shares: 3 },
        { ticker: "NOPRICE", shares: 1 },
      ] } as unknown as Portfolio],
      quotes,
    );
    expect(tiles.map((tile) => [tile.ticker, tile.sector, tile.value, tile.pct, tile.impact])).toEqual([
      ["NVDA", "Information Technology", 1000, 2, 20],
      ["VOO", "Funds", 500, -0.2, -1],
      ["ODD", "Other", 30, null, null],
    ]);
  });
});
