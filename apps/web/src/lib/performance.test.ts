import { describe, expect, it } from "vitest";

import { holdingsPerformance, rangeStart } from "./performance";

describe("current holdings performance", () => {
  it("finds the start of each range", () => {
    expect(rangeStart("1M", "2026-10-24")).toBe("2026-09-24");
    expect(rangeStart("YTD", "2026-10-24")).toBe("2026-01-01");
    expect(rangeStart("1Y", "2026-10-24")).toBe("2025-10-24");
    expect(rangeStart("All", "2026-10-24")).toBe("2021-10-24");
  });

  it("values today's shares at past closes and compares with the benchmark", () => {
    const result = holdingsPerformance({
      holdings: [
        { ticker: "AAA", shares: 10 },
        { ticker: "BBB", shares: 5 },
        { ticker: "NEW", shares: 1 },
        { ticker: "AMD1", shares: 1, quote_currency: "AMD" },
      ],
      closes: {
        SPY: [
          { date: "2026-01-02", close: 100 },
          { date: "2026-01-05", close: 105 },
          { date: "2026-01-06", close: 110 },
        ],
        AAA: [
          { date: "2026-01-02", close: 10 },
          { date: "2026-01-06", close: 12 },
        ],
        BBB: [
          { date: "2026-01-02", close: 20 },
          { date: "2026-01-05", close: 30 },
          { date: "2026-01-06", close: 30 },
        ],
        NEW: [{ date: "2026-01-05", close: 50 }],
        AMD1: [{ date: "2026-01-02", close: 1000 }],
      },
      benchmark: "SPY",
    });

    // Start 10×10 + 5×20 = 200; day 2 carries AAA forward: 100 + 150 = 250; end 120 + 150 = 270.
    expect(result.points.map((point) => point.value)).toEqual([200, 250, 270]);
    expect(result.portfolioReturn).toBeCloseTo(35);
    expect(result.benchmarkReturn).toBeCloseTo(10);
    expect(result.excluded).toEqual(["NEW", "AMD1"]);
    expect(result.startDate).toBe("2026-01-02");
  });

  it("reports nothing when the benchmark or holdings have no history", () => {
    const result = holdingsPerformance({
      holdings: [{ ticker: "AAA", shares: 1 }],
      closes: {},
      benchmark: "SPY",
    });
    expect(result.points).toEqual([]);
    expect(result.portfolioReturn).toBeNull();
  });
});
