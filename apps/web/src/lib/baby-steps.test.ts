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
    const [emergency, roth, invest] = steps;
    // $2,000 a month + 30% = $2,600; $10,000 saved is about 3.8 months, so done.
    expect(emergency).toMatchObject({ key: "emergency", done: true, have: 10000, month: 2600 });
    expect(emergency.key === "emergency" && emergency.months).toBeCloseTo(3.85, 2);
    // Only the open account counts toward the balance; with no contributions from pay the
    // step isn't done yet.
    expect(roth).toMatchObject({ key: "roth", done: false, have: 8000, accounts: 1, contributions: 0, limit: 7500, year: 2026 });
    expect(invest).toMatchObject({ key: "invest", done: false, stocks: 50000, bonds: 0 });
    // No 529 account and no education costs: no education goal, so no 529 step.
    expect(steps).toHaveLength(3);
  });

  it("shows the 529 step to a US person with education costs", () => {
    const steps = babySteps({
      entries: [entry({ kind: "expense", category: "education", amount: 300 })],
      today,
      stocks: 0,
      bonds: 0,
      age: 38,
    });
    expect(steps.map((step) => step.key)).toEqual(["emergency", "roth", "invest", "college"]);
    expect(steps[3]).toMatchObject({ done: false, accounts: 0 });
  });

  it("gives Armenia pension savings instead of a Roth IRA, and no 529", () => {
    const steps = babySteps({
      entries: [
        entry({ kind: "expense", category: "rent", amount: 500, currency: "USD" }),
        entry({ name: "Deposit", category: "cd", principal: 3000 }),
        entry({ name: "Pension fund", category: "pension", principal: 4200 }),
        entry({ kind: "expense", category: "pension_contribution", amount: 100, starts_on: "2026-01-10" }),
        entry({ kind: "expense", category: "education", amount: 200 }),
      ],
      today,
      stocks: 0,
      bonds: 0,
      age: 38,
      country: "AM",
    });
    expect(steps.map((step) => step.key)).toEqual(["emergency", "pension", "invest"]);
    expect(steps[0]).toMatchObject({ have: 3000 }); // deposits count toward the emergency fund
    expect(steps[1]).toMatchObject({ done: true, have: 4200, accounts: 1, contributions: 1200 });
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

  it("adds what was put into the account this year, but not last year's deposit", () => {
    const [, roth] = babySteps({
      entries: [
        entry({ name: "Roth", category: "roth_ira", principal: 2000, contributed: 2000, contributed_year: 2026 }),
        entry({ name: "Old Roth", category: "roth_ira", principal: 9000, contributed: 6000, contributed_year: 2025 }),
        // $500 a month from September: Sep–Dec = $2,000.
        entry({ kind: "expense", category: "roth_contribution", amount: 500, starts_on: "2026-09-01" }),
      ],
      today: "2026-11-16",
      stocks: 0,
      bonds: 0,
      age: 30,
    });
    expect(roth).toMatchObject({ contributions: 4000, have: 11000, done: false });
  });
});
