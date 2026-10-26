import { describe, expect, it } from "vitest";

import { errorDetail } from "./errors";

describe("API error messages", () => {
  it("keeps plain messages and turns validation lists into text", () => {
    expect(errorDetail("Wish not found", 404)).toBe("Wish not found");
    expect(
      errorDetail(
        [
          { loc: ["body", "port"], msg: "Value error, Port must be a number" },
          { loc: ["body"], msg: "Field required" },
        ],
        422,
      ),
    ).toBe("port: Port must be a number; Field required");
    expect(errorDetail(undefined, 500)).toBe("Request failed (500)");
  });
});
