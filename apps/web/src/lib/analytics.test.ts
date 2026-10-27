import { describe, expect, it } from "vitest";

import {
  cashShortfall,
  cashTarget,
  buildAllocations,
  calculatePortfolioAnalytics,
  formatAllocationPercentage,
  type AnalyticsLimits,
  type FundHoldingsMap,
} from "./analytics";
import type { Position } from "./portfolio";

const limits: AnalyticsLimits = {
  maxPositionPct: 0.5,
  maxSectorPct: 0.5,
  maxAssetTypePct: 0.8,
  minCashPct: 0.05,
  maxSpeculativePct: 0.2,
  maxTopThreePct: 0.75,
  maxTopFivePct: 0.9,
  rebalancingThresholdPct: 0.05,
};

const positions: Position[] = [
  {
    ticker: "AAA",
    shares: 10,
    price: 20,
    purchase_price: 10,
    sector: "Technology",
    industry: "Software",
    asset_type: "Common Stock",
    previous_close: 19,
  },
  {
    ticker: "FUND",
    shares: 2,
    price: 50,
    purchase_price: 40,
    sector: null,
    asset_type: "ETF",
    is_etf_index: true,
  },
];

describe("portfolio analytics", () => {
  it("calculates value, cost basis, gain/loss, weights, cash, and daily change", () => {
    const result = calculatePortfolioAnalytics(positions, 100, limits);
    expect(result.holdingsValue).toBe(300);
    expect(result.portfolioValue).toBe(400);
    expect(result.totalCostBasis).toBe(180);
    expect(result.unrealizedGainLoss).toBe(120);
    expect(result.unrealizedGainLossPct).toBeCloseTo(66.6667);
    expect(result.cashPercentage).toBe(0.25);
    expect(result.positions[0].weight).toBe(0.5);
    expect(result.todayGainLoss).toBe(10);
  });

  it("handles missing prices and missing or zero cost basis safely", () => {
    const result = calculatePortfolioAnalytics(
      [
        { ticker: "MISSING", shares: 1, purchase_price: 4 },
        { ticker: "ZERO", shares: 1, price: 5, purchase_price: 0 },
        { ticker: "UNKNOWN", shares: 1, price: 7 },
      ],
      0,
      limits,
    );
    expect(result.missingPrices).toEqual(["MISSING"]);
    expect(result.missingCostBasis).toEqual(["UNKNOWN"]);
    expect(result.positions[1].gainLossPct).toBeNull();
    expect(Number.isFinite(result.portfolioValue)).toBe(true);
  });

  it("excludes funds from concentration and position-limit warnings", () => {
    const result = calculatePortfolioAnalytics(positions, 0, {
      ...limits,
      maxTopThreePct: 0.6,
      maxTopFivePct: 0.6,
    });
    expect(result.topThreeConcentration).toBeCloseTo(2 / 3);
    expect(result.topFiveConcentration).toBeCloseTo(2 / 3);
    expect(result.warnings.map((warning) => warning.id)).toEqual(
      expect.arrayContaining(["position-AAA", "cash-minimum", "top-three", "top-five"]),
    );
    expect(result.warnings.map((warning) => warning.id)).not.toContain("position-FUND");
    expect(
      result.warnings.flatMap((warning) => warning.affectedHoldings),
    ).not.toContain("FUND");
  });

  it("excludes funds only from selected allocation views", () => {
    const result = calculatePortfolioAnalytics(positions, 100, limits);
    const direct = buildAllocations(
      result.positions,
      result.portfolioValue,
      "asset_type",
      "direct",
      null,
    );
    const excluded = buildAllocations(
      result.positions,
      result.portfolioValue,
      "asset_type",
      "exclude-funds",
      null,
    );
    expect(direct.map((row) => row.label)).toContain("ETF");
    expect(excluded.map((row) => row.label)).not.toContain("ETF");
    expect(result.portfolioValue).toBe(400);
  });

  it("keeps allocations tied to total portfolio value and formats tiny weights", () => {
    const result = calculatePortfolioAnalytics(positions, 100, limits);
    const rows = buildAllocations(
      result.positions,
      result.portfolioValue,
      "position",
      "direct",
      0.4,
    );
    expect(rows.reduce((total, row) => total + row.percentage, 0)).toBe(0.75);
    expect(
      rows.reduce((total, row) => total + row.percentage, result.cashPercentage),
    ).toBe(1);
    expect(rows[0].warning).toBe(true);
    expect(formatAllocationPercentage(0.0005)).toBe("<0.1%");
  });

  describe("fund look-through", () => {
    const owned: Position[] = [
      {
        ticker: "NVDA",
        shares: 1,
        price: 100,
        sector: "Information Technology",
        asset_type: "Common Stock",
      },
      {
        ticker: "VOO",
        shares: 1,
        price: 1000,
        asset_type: "ETF",
        is_etf_index: true,
      },
      { ticker: "BND", shares: 1, price: 400, asset_type: "ETF" },
    ];
    const funds: FundHoldingsMap = {
      VOO: {
        holdings: [
          { ticker: "NVDA", name: "NVIDIA Corp", weight: 0.08 },
          { ticker: "AAPL", name: "Apple Inc", weight: 0.07 },
        ],
        sectors: { "Information Technology": 0.4, "Health Care": 0.1, Financials: 0.5 },
      },
    };
    const analytics = () => calculatePortfolioAnalytics(owned, 500, limits);

    it("merges a fund's share of a company with the direct holding", () => {
      const result = analytics();
      const rows = buildAllocations(
        result.positions,
        result.portfolioValue,
        "position",
        "look-through",
        0.1,
        funds,
      );
      const nvda = rows.find((row) => row.key === "NVDA");
      expect(nvda?.value).toBeCloseTo(180);
      expect(nvda?.holdings).toEqual(["NVDA", "VOO"]);
      expect(nvda?.lookThrough).toBe(true);
      expect(rows.find((row) => row.key === "AAPL")?.holdings).toEqual(["VOO"]);
      expect(rows.reduce((total, row) => total + row.value, 0)).toBeCloseTo(1500);
    });

    it("shows the rest of the fund as one other-holdings row without a limit", () => {
      const result = analytics();
      const rows = buildAllocations(
        result.positions,
        result.portfolioValue,
        "position",
        "look-through",
        0.1,
        funds,
      );
      const other = rows.find((row) => row.fund === "VOO");
      expect(other?.label).toBe("VOO · other holdings");
      expect(other?.value).toBeCloseTo(850);
      expect(other?.limit).toBeNull();
      expect(other?.warning).toBe(false);
      // A fund without data stays as one row.
      expect(rows.find((row) => row.key === "BND")?.value).toBe(400);
      expect(rows.find((row) => row.key === "VOO")).toBeUndefined();
    });

    it("keeps limit warnings on the combined numbers", () => {
      const result = analytics();
      const rows = buildAllocations(
        result.positions,
        result.portfolioValue,
        "position",
        "look-through",
        0.08,
        funds,
      );
      // NVDA alone is 5% of 2000; with VOO's share it is 9%.
      expect(rows.find((row) => row.key === "NVDA")?.warning).toBe(true);
    });

    it("splits a fund by its sector weights", () => {
      const result = analytics();
      const rows = buildAllocations(
        result.positions,
        result.portfolioValue,
        "sector",
        "look-through",
        0.5,
        funds,
      );
      const tech = rows.find((row) => row.key === "Information Technology");
      expect(tech?.value).toBeCloseTo(500);
      expect(tech?.holdings).toEqual(["NVDA", "VOO"]);
      expect(rows.find((row) => row.key === "Financials")?.value).toBeCloseTo(500);
      expect(rows.find((row) => row.key === "Health Care")?.value).toBeCloseTo(100);
      expect(rows.find((row) => row.key === "ETF/Index")?.holdings).toEqual(["BND"]);
      expect(rows.some((row) => row.fund)).toBe(false);
    });

    it("keeps the direct view unchanged when fund data is supplied", () => {
      const result = analytics();
      const rows = buildAllocations(
        result.positions,
        result.portfolioValue,
        "position",
        "direct",
        null,
        funds,
      );
      expect(rows.map((row) => row.key)).toEqual(["VOO", "BND", "NVDA"]);
    });
  });

  it("reports sector and asset-type limit violations with affected holdings", () => {
    const result = calculatePortfolioAnalytics(positions, 0, {
      ...limits,
      maxSectorPct: 0.5,
      maxAssetTypePct: 0.5,
    });
    const sector = result.warnings.find((warning) =>
      warning.id.startsWith("sector-"),
    );
    const assetType = result.warnings.find((warning) =>
      warning.id.startsWith("asset-type-"),
    );
    expect(sector?.affectedHoldings).toEqual(["AAA"]);
    expect(assetType?.affectedHoldings).toEqual(["AAA"]);
  });

  it("uses complete transaction history for cost basis and realized return", () => {
    const result = calculatePortfolioAnalytics(
      [{ ticker: "AAA", shares: 10, price: 20, purchase_price: 99 }],
      0,
      limits,
      [
        {
          id: "buy-1",
          portfolio_id: "portfolio-1",
          ticker: "AAA",
          kind: "buy",
          quantity: 15,
          price: 8,
          transacted_at: "2026-01-01T00:00:00Z",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "sell-1",
          portfolio_id: "portfolio-1",
          ticker: "AAA",
          kind: "sell",
          quantity: 5,
          price: 12,
          transacted_at: "2026-02-01T00:00:00Z",
          created_at: "2026-02-01T00:00:00Z",
        },
      ],
      true,
    );

    expect(result.transactionHistoryApplied).toBe(true);
    expect(result.totalCostBasis).toBe(80);
    expect(result.realizedGainLoss).toBe(20);
    expect(result.transactionReturnPct).toBeCloseTo(116.6667);
  });

  it("keeps snapshot cost basis when transaction history is disabled or incomplete", () => {
    const positions = [
      { ticker: "AAA", shares: 10, price: 20, purchase_price: 9 },
    ];
    const buy = {
      id: "buy-1",
      portfolio_id: "portfolio-1",
      ticker: "AAA",
      kind: "buy" as const,
      quantity: 10,
      price: 8,
      transacted_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
    };

    const disabled = calculatePortfolioAnalytics(positions, 0, limits, [buy], false);
    expect(disabled.transactionHistoryApplied).toBe(false);
    expect(disabled.transactionHistoryComplete).toBe(true);
    expect(disabled.totalCostBasis).toBe(90);
    expect(disabled.realizedGainLoss).toBeNull();
    expect(disabled.transactionReturnPct).toBeNull();

    const incomplete = calculatePortfolioAnalytics(
      positions,
      0,
      limits,
      [{ ...buy, quantity: 4 }],
      true,
    );
    expect(incomplete.transactionHistoryApplied).toBe(false);
    expect(incomplete.transactionHistoryComplete).toBe(false);
    expect(incomplete.totalCostBasis).toBe(90);
  });

  it("groups fund sectors and industries as ETF/Index", () => {
    const { positions, portfolioValue } = calculatePortfolioAnalytics(
      [
        { ticker: "VOO", shares: 1, price: 100, asset_type: "ETF", sector: "Not Applicable" },
        { ticker: "AAA", shares: 1, price: 100, asset_type: "Common Stock", sector: "Energy" },
      ],
      0,
      limits,
    );

    const sectors = buildAllocations(positions, portfolioValue, "sector", "direct", null);
    const industries = buildAllocations(positions, portfolioValue, "industry", "direct", null);

    expect(sectors.map((row) => row.label).sort()).toEqual(["ETF/Index", "Energy"]);
    expect(industries.find((row) => row.holdings.includes("VOO"))?.label).toBe("ETF/Index");
  });
});

describe("cash target", () => {
  it("uses the portfolio's own minimum, or 5% when it has none", () => {
    expect(cashTarget(0)).toBe(0.05);
    expect(cashTarget(null)).toBe(0.05);
    expect(cashTarget(0.1)).toBe(0.1);
    expect(cashTarget(0, 0.08)).toBe(0.08);
    expect(cashTarget(0.1, 0.08)).toBe(0.1);
  });

  it("says how much cash is missing for the target", () => {
    expect(cashShortfall(0, 100_000, 0.05)).toBe(5000);
    expect(cashShortfall(2000, 100_000, 0.05)).toBe(3000);
    expect(cashShortfall(6000, 100_000, 0.05)).toBe(0);
  });
});
