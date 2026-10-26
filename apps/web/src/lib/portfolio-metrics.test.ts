import { describe, expect, it } from "vitest";

import {
  calculatePortfolioMetrics,
  positionStatus,
} from "./portfolio-metrics";

describe("portfolio metrics", () => {
  it("calculates cash-inclusive weights, cost, unrealized, and daily returns", () => {
    const metrics = calculatePortfolioMetrics(
      [
        {
          ticker: "AAPL",
          shares: 10,
          purchase_price: 80,
          price: 100,
          day_change: 2,
          day_change_percent: 2.04,
        },
      ],
      1000,
    );

    expect(metrics.totalValue).toBe(2000);
    expect(metrics.totalCostBasis).toBe(800);
    expect(metrics.unrealizedAmount).toBe(200);
    expect(metrics.unrealizedPercent).toBe(25);
    expect(metrics.dayAmount).toBe(20);
    expect(metrics.cashPercentage).toBe(0.5);
    expect(metrics.byTicker.get("AAPL")?.weight).toBe(0.5);
  });

  it("handles zero basis and missing prices without invalid numbers", () => {
    const metrics = calculatePortfolioMetrics(
      [
        { ticker: "ZERO", shares: 2, purchase_price: 0, price: 10 },
        { ticker: "MISS", shares: 3, purchase_price: 4, price: null },
      ],
      0,
    );

    expect(metrics.byTicker.get("ZERO")?.unrealizedPercent).toBeNull();
    expect(metrics.byTicker.get("MISS")?.marketValue).toBeNull();
    expect(metrics.hasPartialPrices).toBe(true);
  });

  it("explains concentration and stale-data review states", () => {
    const position = {
      ticker: "NVDA",
      shares: 10,
      price: 100,
      price_date: "2026-10-01",
      lifecycle_phase: "Hyper Growth" as const,
    };
    const metric = calculatePortfolioMetrics([position], 0).byTicker.get("NVDA")!;
    const result = positionStatus(position, metric, {
      positionLimit: 0.15,
      today: "2026-10-23",
    });

    expect(result.status).toBe("Review");
    expect(result.warnings.join(" ")).toContain("Position limit exceeded");
    expect(result.warnings.join(" ")).toContain("Stale market data");
  });
});
