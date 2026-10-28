import { describe, expect, it } from "vitest";

import { niceTicks, projectGrowth } from "./growth";

describe("projectGrowth", () => {
  it("matches the usual monthly-compounding calculators", () => {
    // $100,000 + $875 a month for 20 years at 10.75% ≈ $1,583,164.
    const result = projectGrowth({ principal: 100000, monthly: 875, years: 20, annualReturnPct: 10.75 });
    expect(result.futureValue).toBeGreaterThan(1583000);
    expect(result.futureValue).toBeLessThan(1583400);
    expect(result.contributed).toBe(310000);
    expect(result.growth).toBeCloseTo(result.futureValue - 310000);
    expect(result.points).toHaveLength(21);
  });

  it("only adds contributions at 0%", () => {
    const result = projectGrowth({ principal: 1000, monthly: 100, years: 2, annualReturnPct: 0 });
    expect(result.futureValue).toBe(3400);
    expect(result.growth).toBe(0);
  });
});

describe("niceTicks", () => {
  it("picks round steps that reach the top", () => {
    expect(niceTicks(1583164)).toEqual([0, 500000, 1000000, 1500000, 2000000]);
    expect(niceTicks(0)).toEqual([0]);
  });
});
