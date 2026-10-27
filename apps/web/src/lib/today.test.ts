import { describe, expect, it } from "vitest";

import type { Portfolio } from "@/lib/api";

import { attentionItems, changeSinceLast, portfolioSnapshot, upcomingReports, type Quote } from "./today";

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
