import { describe, expect, it } from "vitest";

import { passwordProblem } from "./password";

describe("passwordProblem", () => {
  it("asks for 10 characters with letters and numbers", () => {
    expect(passwordProblem("short1")).toBe("Use at least 10 characters.");
    expect(passwordProblem("onlyletters")).toBe("Use both letters and numbers.");
    expect(passwordProblem("1234567890")).toBe("Use both letters and numbers.");
    expect(passwordProblem("money-tree-42")).toBeNull();
  });
});
