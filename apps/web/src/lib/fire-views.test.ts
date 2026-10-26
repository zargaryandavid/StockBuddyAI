import { describe, expect, it } from "vitest";

import { ageOn, fireTiming, monthYearLabel } from "./age";
import type { FireEntry } from "./fire";
import {
  breakdown,
  cashFlowByPeriod,
  currencyView,
  fireProgress,
  forPeriod,
} from "./fire-views";

const entry = (overrides: Partial<FireEntry>): FireEntry => ({
  id: "e1",
  kind: "income",
  category: "salary",
  name: "Pay",
  amount: 5000,
  currency: "USD",
  frequency: "monthly",
  starts_on: "2026-01-15",
  ends_on: null,
  principal: null,
  yield_pct: null,
  note: null,
  ...overrides,
});

describe("FIRE progress", () => {
  it("is current assets ÷ FIRE target with the remaining amount", () => {
    const progress = fireProgress(345400.71, 748971.43);
    expect(progress.percent).toBeCloseTo(46.117, 3);
    expect(progress.remaining).toBeCloseTo(403570.72, 2);
  });

  it("never reports a negative remaining amount, and handles zero or missing values", () => {
    expect(fireProgress(900000, 750000)).toEqual({ percent: 120, remaining: 0 });
    expect(fireProgress(100, 0)).toEqual({ percent: null, remaining: 0 });
    expect(fireProgress(Number.NaN, 1000)).toEqual({ percent: 0, remaining: 1000 });
  });
});

describe("monthly and annual values", () => {
  it("shows annual as normalized monthly × 12", () => {
    expect(forPeriod(4369, "monthly")).toBe(4369);
    expect(forPeriod(4369, "annual")).toBe(52428);
  });
});

describe("currency display", () => {
  it("converts a quarterly AMD coupon with the actual rate", () => {
    const view = currencyView(
      entry({ currency: "AMD", amount: 521812.5, frequency: "quarterly", category: "bond" }),
      "2026-10-24",
      { AMD: 1 / 360 },
    );
    expect(view.cadence).toBe("every 3 months");
    expect(view.basePerPayment).toBeCloseTo(1449.48, 2);
    expect(view.baseMonthly).toBeCloseTo(483.16, 2);
    expect(view.unitsPerBase).toBeCloseTo(360);
  });

  it("leaves converted values empty without a rate", () => {
    const view = currencyView(entry({ currency: "EUR" }), "2026-10-24", {});
    expect(view.basePerPayment).toBeNull();
    expect(view.unitsPerBase).toBeNull();
  });
});

describe("income and expense breakdowns", () => {
  const entries = [
    entry({ id: "pay", name: "Bazzar PM", amount: 5000 }),
    entry({
      id: "bond",
      name: "FNCABI",
      category: "bond",
      currency: "AMD",
      amount: 360000,
      frequency: "quarterly",
    }),
    entry({ id: "old", name: "Old job", amount: 900, ends_on: "2026-01-31" }),
    entry({ id: "rent", kind: "expense", category: "rent", name: "Rent", amount: 2975 }),
    entry({ id: "ins1", kind: "expense", category: "insurance", name: "Car", amount: 190 }),
    entry({ id: "ins2", kind: "expense", category: "insurance", name: "Renters", amount: 17 }),
    entry({
      id: "mac",
      kind: "expense",
      category: "finance",
      name: "Mac",
      amount: 200,
      ends_on: "2026-03-31",
    }),
  ];

  it("lists income by source with original currency and shares", () => {
    const result = breakdown(entries, "income", "2026-10-24", { AMD: 1 / 360 });
    expect(result.rows.map((row) => [row.label, Math.round(row.monthly * 100) / 100])).toEqual([
      ["Bazzar PM", 5000],
      ["FNCABI", 333.33],
    ]);
    expect(result.rows[1].original).toEqual({
      amount: 360000,
      currency: "AMD",
      cadence: "every 3 months",
    });
    expect(result.totalMonthly).toBeCloseTo(5333.33, 2);
    expect(result.rows[0].share + result.rows[1].share).toBeCloseTo(1);
  });

  it("groups expenses by category and leaves out entries that have ended", () => {
    const result = breakdown(entries, "expense", "2026-10-24", {});
    expect(result.rows.map((row) => [row.label, row.monthly])).toEqual([
      ["Rent / mortgage", 2975],
      ["Insurance", 207],
    ]);
    expect(result.totalMonthly).toBe(3182);
  });
});

describe("age", () => {
  it("counts whole years and only adds one after the birthday", () => {
    expect(ageOn("1987-11-02", "2026-10-24")).toBe(38);
    expect(ageOn("1987-10-24", "2026-10-24")).toBe(39);
    expect(ageOn("1987-02-28", "2026-03-01")).toBe(39);
    expect(ageOn(null, "2026-10-24")).toBeNull();
    expect(ageOn("2030-01-01", "2026-10-24")).toBeNull();
  });

  it("estimates the FIRE age and date, hiding ages without a date of birth", () => {
    expect(fireTiming("1987-05-10", "2026-10-24", 157)).toEqual({
      fireDate: "2039-11-01",
      currentAge: 39,
      fireAge: 52,
    });
    expect(monthYearLabel("2039-11-01")).toBe("November 2039");
    expect(fireTiming(null, "2026-10-24", 157)).toEqual({
      fireDate: "2039-11-01",
      currentAge: null,
      fireAge: null,
    });
    expect(fireTiming("1987-05-10", "2026-10-24", null).fireAge).toBeNull();
  });
});

describe("income and expenses by week and month", () => {
  const entries = [
    entry({ id: "pay", name: "Paycheck", amount: 5000, starts_on: "2026-01-15" }),
    entry({
      id: "bond",
      name: "FNCABI",
      category: "bond",
      currency: "AMD",
      amount: 360000,
      frequency: "quarterly",
      starts_on: "2026-12-01",
    }),
    entry({ id: "bonus", name: "Bonus", amount: 2000, frequency: "once", starts_on: "2026-11-20" }),
    entry({ id: "old", name: "Old job", amount: 900, ends_on: "2026-11-30" }),
    entry({ id: "rent", kind: "expense", category: "rent", name: "Rent", amount: 2975, starts_on: "2026-01-01" }),
  ];

  it("groups payments into calendar months from their own dates", () => {
    const months = cashFlowByPeriod(entries, "income", "2026-10-24", { AMD: 1 / 360 }, "USD", "month", 3);
    expect(months.map((month) => [month.label, month.total])).toEqual([
      ["Oct 2026", 5900],
      ["Nov 2026", 7900],
      ["Dec 2026", 6000],
    ]);
    expect(months[2].items.map((item) => item.name)).toEqual(["FNCABI", "Paycheck"]);
    expect(months[2].items[0]).toMatchObject({ amount: 360000, currency: "AMD", baseAmount: 1000 });
  });

  it("groups payments into weeks starting on Monday", () => {
    const weeks = cashFlowByPeriod(entries, "expense", "2026-10-24", {}, "USD", "week", 2);
    expect(weeks.map((week) => [week.start, week.end, week.label])).toEqual([
      ["2026-10-19", "2026-10-25", "Week of Oct 19"],
      ["2026-10-26", "2026-11-01", "Week of Oct 26"],
    ]);
    expect(weeks[1].total).toBe(2975);
    expect(weeks[0].items).toEqual([]);
  });
});
