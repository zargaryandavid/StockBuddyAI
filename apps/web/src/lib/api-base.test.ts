// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.myportfoliobuddy.com/"}
import { describe, expect, it } from "vitest";

import { apiBase } from "./api";

describe("API calls on the live site", () => {
  it("go to the same address the page was opened on", () => {
    expect(window.location.hostname).toBe("www.myportfoliobuddy.com");
    expect(apiBase()).toBe("");
  });
});
