import { describe, expect, it } from "vitest";

import { chartMonths } from "./projection-chart";

describe("projection chart range", () => {
  it("runs two years past the FIRE month, ten years when already there, the horizon when never", () => {
    expect(chartMonths(224, 600)).toBe(248);
    expect(chartMonths(5, 600)).toBe(29);
    expect(chartMonths(590, 600)).toBe(600);
    expect(chartMonths(0, 600)).toBe(120);
    expect(chartMonths(null, 600)).toBe(600);
  });
});
