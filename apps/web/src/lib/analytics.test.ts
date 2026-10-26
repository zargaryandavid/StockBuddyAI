import { describe, expect, it } from "vitest";

import {
  buildAllocations,
  calculatePortfolioAnalytics,
  formatAllocationPercentage,
  type AnalyticsLimits,
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
