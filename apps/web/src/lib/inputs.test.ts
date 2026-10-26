import { describe, expect, it } from "vitest";

import { stripLeadingZeros } from "./inputs";

describe("stripLeadingZeros", () => {
  it("removes zeros in front of a number", () => {
    expect(stripLeadingZeros("03")).toBe("3");
    expect(stripLeadingZeros("0003")).toBe("3");
    expect(stripLeadingZeros("007.5")).toBe("7.5");
    expect(stripLeadingZeros("-03")).toBe("-3");
  });

  it("keeps a lone zero, decimals below one, and empty fields", () => {
    expect(stripLeadingZeros("0")).toBe("0");
    expect(stripLeadingZeros("0.5")).toBe("0.5");
    expect(stripLeadingZeros("10")).toBe("10");
    expect(stripLeadingZeros("")).toBe("");
  });
});
