import { describe, expect, it } from "vitest";

import { niceTicks, projectGrowth } from "./growth";

describe("projectGrowth", () => {
  it("compounds to exactly the yearly rate, like the FIRE plan", () => {
    // With nothing added, a year at 10.75% grows by exactly 10.75%.
    const lump = projectGrowth({ principal: 100000, monthly: 0, years: 20, annualReturnPct: 10.75 });
    expect(lump.points[1].value).toBeCloseTo(110750, 6);
    expect(lump.futureValue).toBeCloseTo(100000 * 1.1075 ** 20, 4);
    // $100,000 + $875 a month for 20 years at 10.75% ≈ $1,457,447.
    const result = projectGrowth({ principal: 100000, monthly: 875, years: 20, annualReturnPct: 10.75 });
    expect(result.futureValue).toBeCloseTo(1457446.52, 1);
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
