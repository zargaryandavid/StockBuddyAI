import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "globals.css"), "utf8");

describe("entry animations", () => {
  it("leave no transform behind on anything that can hold a pop-up", () => {
    // With fill "both", a finished animation keeps an (identity) transform, which makes the
    // element the frame for position: fixed children; pop-ups then open off-screen.
    for (const selector of [".simple-page", ".modal-backdrop", ".today-info-popup"]) {
      const rules = [...css.matchAll(/([^{}]+)\{([^}]*animation:[^}]*)\}/g)].filter(([, selectors]) =>
        selectors.split(",").some((item) => item.trim() === selector),
      );
      expect(rules.length, selector).toBeGreaterThan(0);
      for (const [, , body] of rules) expect(body, selector).not.toMatch(/\bboth\b/);
    }
  });
});
