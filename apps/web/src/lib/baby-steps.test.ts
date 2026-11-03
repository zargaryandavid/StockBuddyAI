import { describe, expect, it } from "vitest";

import type { FireEntry } from "@/lib/fire";

import { babySteps, iraLimit } from "./baby-steps";

const entry = (overrides: Partial<FireEntry>): FireEntry => ({
  id: overrides.name ?? "x",
  kind: "income",
  category: "salary",
  name: "x",
  amount: 0,
  currency: "USD",
  frequency: "monthly",
  starts_on: "2026-01-01",
  ends_on: null,
  principal: null,
  yield_pct: null,
  note: null,
  ...overrides,
});

describe("iraLimit", () => {
  it("uses the IRS limit for the year, higher from age 50, and the latest known year after that", () => {
    expect(iraLimit(2026, 38).limit).toBe(7500);
    expect(iraLimit(2026, 50).limit).toBe(8600);
    expect(iraLimit(2026, null).limit).toBe(7500);
    expect(iraLimit(2025, 40).limit).toBe(7000);
    expect(iraLimit(2030, 40)).toMatchObject({ year: 2026, limit: 7500 });
  });
});

describe("babySteps", () => {
  const today = "2026-11-03";

  it("ticks off each step from what was entered", () => {
    const steps = babySteps({
      entries: [
        entry({ kind: "expense", category: "rent", amount: 2000 }),
        entry({ name: "Savings", category: "savings", principal: 9000 }),
        entry({ name: "CD", category: "cd", principal: 1000 }),
        entry({ name: "Roth", category: "roth_ira", principal: 8000 }),
        entry({ name: "Old Roth", category: "roth_ira", principal: 5000, ends_on: "2025-12-31" }),
      ],
      today,
      stocks: 50000,
      bonds: 0,
      age: 38,
    });
    const [emergency, roth, invest, college] = steps;
    // $2,000 a month + 30% = $2,600; $10,000 saved is about 3.8 months, so done.
    expect(emergency).toMatchObject({ key: "emergency", done: true, have: 10000, month: 2600 });
    expect(emergency.key === "emergency" && emergency.months).toBeCloseTo(3.85, 2);
    // Only the open account counts toward the balance; with no contributions from pay the
    // step isn't done yet.
    expect(roth).toMatchObject({ key: "roth", done: false, have: 8000, accounts: 1, contributions: 0, limit: 7500, year: 2026 });
    expect(invest).toMatchObject({ key: "invest", done: false, stocks: 50000, bonds: 0 });
    expect(college).toMatchObject({ key: "college", done: false, accounts: 0 });
  });

  it("is not done without expenses, a big enough Roth, or a funded 529", () => {
    const steps = babySteps({
      entries: [
        entry({ name: "Savings", category: "savings", principal: 50000 }),
        entry({ name: "Roth", category: "roth_ira", principal: 7600 }),
        entry({ name: "529", category: "college_529", principal: 0 }),
      ],
      today,
      stocks: 1,
      bonds: 1,
      age: 55,
    });
    expect(steps.map((step) => [step.key, step.done])).toEqual([
      ["emergency", false],
      ["roth", false],
      ["invest", true],
      ["college", false],
    ]);
    expect(steps[1]).toMatchObject({ limit: 8600 });
  });
});

describe("Roth contributions from pay", () => {
  it("count this calendar year's contributions toward the limit, and stay out of the emergency fund", () => {
    const steps = babySteps({
      entries: [
        entry({ kind: "expense", category: "rent", amount: 2000 }),
        entry({ name: "Roth", category: "roth_ira", principal: 20000 }),
        // $625 on the 15th of each month from January: 12 × $625 = $7,500 for 2026.
        entry({ kind: "expense", category: "roth_contribution", amount: 625, starts_on: "2026-01-15" }),
      ],
      today: "2026-11-03",
      stocks: 0,
      bonds: 0,
      age: 30,
    });
    const roth = steps.find((step) => step.key === "roth");
    expect(roth).toMatchObject({ contributions: 7500, limit: 7500, done: true, have: 20000 });
    const emergency = steps.find((step) => step.key === "emergency");
    expect(emergency).toMatchObject({ month: 2600 });
  });

  it("is not done on a big balance alone", () => {
    const [, roth] = babySteps({
      entries: [entry({ name: "Roth", category: "roth_ira", principal: 90000 })],
      today: "2026-11-03",
      stocks: 0,
      bonds: 0,
      age: 30,
    });
    expect(roth).toMatchObject({ done: false, contributions: 0 });
  });
});
