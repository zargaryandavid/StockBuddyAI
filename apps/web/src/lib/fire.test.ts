import { describe, expect, it } from "vitest";

import {
  bondHoldings,
  budgetSplit,
  assetMix,
  buildPlan,
  heldAssets,
  projectFromEntries,
  monthEvents,
  occurrences,
  planNotes,
  project,
  yieldPayment,
  type FireEntry,
  type FireSettings,
} from "./fire";

const entry = (overrides: Partial<FireEntry>): FireEntry => ({
  id: "e1",
  kind: "expense",
  category: "rent",
  name: "Rent",
  amount: 1000,
  currency: "USD",
  frequency: "monthly",
  starts_on: "2026-01-31",
  ends_on: null,
  principal: null,
  yield_pct: null,
  note: null,
  ...overrides,
});

const settings: FireSettings = {
  expected_return_pct: 0,
  retirement_annual_spend: null,
  monthly_invest: null,
  withdrawal_rate_pct: 4,
};

describe("FIRE planning", () => {
  it("repeats on the same day, clamping to short months, and stops at the end date", () => {
    const rent = entry({ ends_on: "2026-04-15" });
    expect(occurrences(rent, "2026-01-01", "2026-12-31")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
    const bond = entry({ frequency: "semiannual", starts_on: "2026-06-15" });
    expect(occurrences(bond, "2026-01-01", "2027-12-31")).toEqual([
      "2026-06-15",
      "2026-12-15",
      "2027-06-15",
      "2027-12-15",
    ]);
    expect(occurrences(entry({ frequency: "once", starts_on: "2026-05-02" }), "2026-05-01", "2026-05-31")).toEqual([
      "2026-05-02",
    ]);
  });

  it("pays interest and coupons as balance × rate ÷ payments per year", () => {
    expect(yieldPayment(12000, 4.5, "monthly")).toBe(45);
    expect(yieldPayment(10000, 4, "semiannual")).toBe(200);
  });

  it("projects to 25× yearly spending at a 4% withdrawal rate", () => {
    const result = project({ start: 0, monthly: 1000, ratePct: 0, annualSpend: 12000 });
    expect(result.fireNumber).toBe(300000);
    expect(result.hitMonth).toBe(300);
    expect(project({ start: 400000, monthly: 0, ratePct: 0, annualSpend: 12000 }).hitMonth).toBe(0);
  });

  it("builds monthly totals and counts savings balances and the portfolio as assets", () => {
    const plan = buildPlan({
      entries: [
        entry({ kind: "income", category: "salary", name: "Pay", amount: 6000 }),
        entry({ amount: 2000 }),
        entry({ name: "Car insurance", category: "insurance", amount: 1200, frequency: "annual" }),
        entry({ name: "Vacation", category: "travel", amount: 5000, frequency: "once" }),
        entry({
          kind: "income",
          category: "savings",
          name: "HYSA",
          amount: 40,
          principal: 12000,
          yield_pct: 4,
        }),
        entry({ name: "Old loan", category: "finance", amount: 500, ends_on: "2025-12-01" }),
      ],
      settings,
      portfolioValue: 50000,
      today: "2026-10-24",
    });

    expect(plan.monthlyIncome).toBe(6040);
    expect(plan.monthlyExpenses).toBe(2100);
    expect(plan.monthlyNet).toBe(3940);
    expect(plan.currentAssets).toBe(62000);
    // New money is income minus expenses without the $40 of savings interest, which is
    // reinvested on its own.
    expect(plan.monthlyInvest).toBe(3900);
    expect(plan.autoInvest).toBe(3900);
    expect(plan.annualSpend).toBe(25200);
    expect(plan.fireNumber).toBe(630000);
    // October's paycheck and rent settle at once, then about $3,900/mo goes in while the
    // $12,000 savings account compounds at its own 4% APY: $630,000 after 143 months.
    expect(plan.hitMonth).toBe(143);
    const notes = planNotes(plan, 0);
    expect(notes.map((note) => note.title)).toEqual(["FIRE", "Emergency fund", "Bottleneck"]);
    // Only cash and savings count toward the emergency fund: $12,000 ÷ $2,100 ≈ 5.7 months.
    expect(notes[1].text).toContain("5.7 months");
    expect(notes[1].tone).toBe("good");
    expect(planNotes({ ...plan, savingsBalances: 2100 }, 0)[1].tone).toBe("bad");
    expect(planNotes({ ...plan, savingsBalances: 7000 }, 0)[1].tone).toBe("warn");
  });

  it("puts incomes, expenses, and last and estimated report dates on the calendar", () => {
    const events = monthEvents({
      entries: [
        entry({ kind: "income", category: "salary", name: "Pay", amount: 6000, starts_on: "2026-01-15" }),
        entry({ starts_on: "2026-01-01" }),
      ],
      reports: [{ ticker: "AAPL", report_date: "2026-07-31" }],
      year: 2026,
      month: 9,
    });

    expect(events).toEqual([
      { date: "2026-10-01", kind: "expense", title: "Rent", amount: 1000, currency: "USD", baseAmount: 1000 },
      { date: "2026-10-15", kind: "income", title: "Pay", amount: 6000, currency: "USD", baseAmount: 6000 },
      { date: "2026-10-31", kind: "report", title: "AAPL report (est.)", amount: null, estimated: true },
    ]);
  });

  it("converts other currencies to the base currency and flags missing rates", () => {
    const bond = entry({
      kind: "income",
      category: "bond",
      name: "AMTLB",
      currency: "AMD",
      frequency: "semiannual",
      amount: 1270750,
      principal: 22100000,
      yield_pct: 11.5,
    });
    const plan = buildPlan({
      entries: [bond, entry({ kind: "income", category: "salary", name: "Pay", amount: 100, currency: "EUR" })],
      settings,
      portfolioValue: 0,
      today: "2026-10-24",
      rates: { AMD: 0.0025 },
    });

    expect(plan.monthlyIncome).toBeCloseTo(529.48, 2);
    expect(plan.yieldBalances).toBeCloseTo(55250);
    expect(plan.missingRates).toEqual(["EUR"]);
  });

  it("averages bond coupons and savings APYs by balance", () => {
    const plan = buildPlan({
      entries: [
        entry({ kind: "income", category: "bond", name: "A", principal: 30000, yield_pct: 11.5 }),
        entry({ kind: "income", category: "bond", name: "B", principal: 10000, yield_pct: 7.5 }),
        entry({ kind: "income", category: "bond", name: "Old", principal: 50000, yield_pct: 2, ends_on: "2025-01-01" }),
        entry({ kind: "income", category: "savings", name: "HYSA", principal: 30000, yield_pct: 4 }),
      ],
      settings,
      portfolioValue: 0,
      today: "2026-10-24",
    });
    // (30,000 × 11.5 + 10,000 × 7.5) ÷ 40,000 = 10.5; the matured bond is left out.
    expect(plan.bondYieldPct).toBeCloseTo(10.5);
    expect(plan.savingsYieldPct).toBe(4);
    expect(buildPlan({ entries: [], settings, portfolioValue: 0, today: "2026-10-24" }).bondYieldPct).toBeNull();
  });

  it("splits current assets into stocks, bonds, savings, and cash", () => {
    const mix = assetMix({
      portfolioValue: 100000,
      cash: 10000,
      savingsBalances: 30000,
      bondBalances: 60000,
    });

    expect(mix.map((slice) => [slice.label, slice.value])).toEqual([
      ["Stocks", 90000],
      ["Bonds", 60000],
      ["Savings & CDs", 30000],
      ["Cash", 10000],
    ]);
    expect(mix.map((slice) => Math.round(slice.share * 1000) / 10)).toEqual([47.4, 31.6, 15.8, 5.3]);
    expect(
      assetMix({
        portfolioValue: 0,
        cash: 0,
        savingsBalances: 0,
        bondBalances: 0,
        held: [
          { key: "real_estate", label: "Real estate", value: 450000 },
          { key: "vehicles_equipment", label: "Vehicles & equipment", value: 20000 },
        ],
      }).map((slice) => slice.label),
    ).toEqual(["Real estate", "Vehicles & equipment"]);
    expect(assetMix({ portfolioValue: 0, cash: 0, savingsBalances: 0, bondBalances: 0 })).toEqual([]);
  });

  describe("month-by-month projection", () => {
    const base = {
      settings: { ...settings, expected_return_pct: 0, inflation_pct: 0 },
      growthAssets: 0,
      today: "2026-10-24",
      annualSpend: 12000,
      withdrawalRatePct: 4,
    };
    const pay = entry({ kind: "income", category: "salary", name: "Pay", amount: 3000, starts_on: "2026-11-01" });

    it("invests more once an expense ends", () => {
      const forever = projectFromEntries({
        ...base,
        entries: [pay, entry({ name: "Mac", category: "finance", amount: 1000, starts_on: "2026-11-01" })],
      });
      const ending = projectFromEntries({
        ...base,
        entries: [
          pay,
          entry({ name: "Mac", category: "finance", amount: 1000, starts_on: "2026-11-01", ends_on: "2027-03-31" }),
        ],
      });
      // $300,000 at $2,000/mo takes 150 months; after the Mac ends it is $3,000/mo.
      expect(forever.hitMonth).toBe(150);
      expect(ending.hitMonth).toBe(102);
    });

    it("splits the projection into starting assets, contributions, and growth", () => {
      const result = projectFromEntries({
        ...base,
        settings: { ...base.settings, expected_return_pct: 12 },
        growthAssets: 10000,
        entries: [pay],
        annualSpend: 1e9,
      });
      const year = result.series[12];
      expect(year.startAssets).toBe(10000);
      expect(year.contributed).toBe(36000);
      const growth = year.total - year.startAssets - year.contributed;
      expect(growth).toBeGreaterThan(0);
      expect(result.series[0]).toEqual({ month: 0, total: 10000, startAssets: 10000, contributed: 0 });
    });

    it("keeps reinvesting bond interest when a fixed monthly investment is set", () => {
      const bond = entry({
        kind: "income",
        category: "bond",
        name: "Bond",
        amount: 1000,
        frequency: "monthly",
        starts_on: "2026-11-01",
        principal: 100000,
        yield_pct: 12,
      });
      const result = projectFromEntries({
        ...base,
        settings: { ...base.settings, monthly_invest: 0 },
        entries: [bond, pay],
        annualSpend: 1e9,
      });
      const year = result.series[12];
      // No new money, but twelve $1,000 coupons are reinvested and count as growth.
      expect(year.contributed).toBe(0);
      expect(year.total).toBeCloseTo(112000, 6);
      expect(year.total - year.startAssets - year.contributed).toBeCloseTo(12000, 6);
    });

    it("stops bond coupons at maturity and reinvests the principal", () => {
      const bond = entry({
        kind: "income",
        category: "bond",
        name: "Bond",
        amount: 500,
        frequency: "semiannual",
        starts_on: "2026-12-01",
        ends_on: "2027-12-01",
        principal: 10000,
        yield_pct: 10,
      });
      const result = projectFromEntries({ ...base, entries: [bond], annualSpend: 1e9 });
      // The bond compounds at its own 10% until it matures in Dec 2027 (14 months), then
      // the proceeds move into stocks, which earn 0% in this test.
      expect(result.data[1].value).toBeCloseTo(11000, 6);
      expect(result.data[2].value).toBeCloseTo(10000 * Math.pow(1.1, 14 / 12), 6);
      expect(result.data[3].value).toBeCloseTo(result.data[2].value, 6);
    });

    it("shows growth in today's dollars and shrinks fixed bond income with inflation", () => {
      const inflated = projectFromEntries({
        ...base,
        settings: { ...base.settings, expected_return_pct: 3, inflation_pct: 3 },
        growthAssets: 100000,
        entries: [],
        annualSpend: 1e9,
      });
      // A 3% return with 3% inflation is a 0% real return.
      expect(inflated.data[10].value).toBeCloseTo(100000, 0);

      const bond = entry({
        kind: "income",
        category: "bond",
        name: "Bond",
        amount: 0,
        frequency: "annual",
        starts_on: "2027-10-01",
        principal: 10000,
        yield_pct: 0,
      });
      const fixed = projectFromEntries({
        ...base,
        settings: { ...base.settings, inflation_pct: 10 },
        entries: [bond],
        annualSpend: 1e9,
      });
      // A 0% bond keeps its dollar value, so 10% inflation leaves about $9,091 of today's money.
      expect(fixed.data[1].value).toBeCloseTo(10000 / 1.1, 6);
    });

    it("describes a reached FIRE with the chosen withdrawal rate", () => {
      const plan = buildPlan({
        entries: [],
        settings: { ...base.settings, withdrawal_rate_pct: 3, retirement_annual_spend: 3000 },
        portfolioValue: 120000,
        today: "2026-10-24",
      });
      expect(plan.hitMonth).toBe(0);
      // $120,000 × 3% ÷ 12 = $300/mo.
      expect(planNotes(plan, 0)[0].text).toContain("would pay about $300/mo at your 3% withdrawal rate");
    });

    it("grows stocks at the expected return and each account at its own rate", () => {
      const result = projectFromEntries({
        ...base,
        settings: { ...base.settings, expected_return_pct: 11 },
        growthAssets: 100000,
        entries: [
          entry({
            kind: "income",
            category: "bond",
            name: "AMTLB",
            amount: 0,
            frequency: "semiannual",
            starts_on: "2026-12-01",
            principal: 50000,
            yield_pct: 7,
          }),
          entry({
            kind: "income",
            category: "savings",
            name: "HYSA",
            amount: 0,
            starts_on: "2026-11-01",
            principal: 20000,
            yield_pct: 4,
          }),
        ],
        annualSpend: 1e9,
      });
      // One year: $100,000 × 1.11 + $50,000 × 1.07 + $20,000 × 1.04.
      expect(result.data[1].value).toBeCloseTo(111000 + 53500 + 20800, 6);
    });

    it("compares an aggressive withdrawal rate with 4%", () => {
      const plan = buildPlan({
        entries: [pay],
        settings: { ...base.settings, withdrawal_rate_pct: 7, retirement_annual_spend: 12000 },
        portfolioValue: 0,
        today: "2026-10-24",
      });
      expect(plan.fireNumber).toBeCloseTo(171428.57, 1);
      expect(plan.atFourPercent?.fireNumber).toBe(300000);
      const note = planNotes(plan, 0).find((item) => item.title === "Withdrawal rate");
      expect(note?.tone).toBe("bad");
      expect(note?.text).toContain("At 4% you need $300,000");

      const safe = buildPlan({
        entries: [pay],
        settings: { ...base.settings, withdrawal_rate_pct: 4, retirement_annual_spend: 12000 },
        portfolioValue: 0,
        today: "2026-10-24",
      });
      expect(safe.atFourPercent).toBeNull();
    });
  });
});

describe("owned assets", () => {
  const asset = (overrides: Record<string, unknown>) => ({
    id: "a1",
    asset_type: "residential" as const,
    name: "Condo",
    market_value: 350000,
    currency: "USD",
    note: null,
    ...overrides,
  });

  it("groups market values by kind and converts currencies", () => {
    const held = heldAssets(
      [
        asset({}),
        asset({ id: "a2", asset_type: "land", market_value: 36000000, currency: "AMD" }),
        asset({ id: "a3", asset_type: "vehicle", market_value: 18000 }),
        asset({ id: "a4", asset_type: "equipment", market_value: null }),
      ],
      [],
      { AMD: 1 / 360 },
    );
    expect(held).toEqual([
      { key: "real_estate", label: "Real estate", value: 450000 },
      { key: "vehicles_equipment", label: "Vehicles & equipment", value: 18000 },
    ]);
  });

  it("still counts an unlinked rental's old property value, never a linked one twice", () => {
    const rental = {
      id: "r1",
      kind: "income" as const,
      category: "rent_income",
      name: "Old rental",
      amount: 1000,
      currency: "USD",
      frequency: "monthly" as const,
      starts_on: "2026-01-01",
      ends_on: null,
      principal: 200000,
      yield_pct: null,
      note: null,
    };
    expect(heldAssets([], [rental])).toEqual([{ key: "real_estate", label: "Real estate", value: 200000 }]);
    expect(heldAssets([asset({})], [{ ...rental, asset_id: "a1" }])[0].value).toBe(350000);
  });
});

describe("bondHoldings", () => {
  const bond = (id: string, ends_on: string | null, principal: number, currency = "USD") => ({
    id, kind: "income" as const, category: "bond", name: `Bond ${id}`, amount: 0, currency,
    frequency: "semiannual" as const, starts_on: "2026-01-01", ends_on, principal, yield_pct: 4,
    note: null, quantity: 10, unit_price: principal / 10,
  });

  it("lists running bonds at face value with their yearly coupons, soonest maturity first", () => {
    const rows = bondHoldings(
      [
        bond("a", "2030-06-01", 10000),
        bond("b", "2027-01-01", 5000, "EUR"),
        bond("old", "2026-01-01", 9999),
        { ...bond("cd", null, 1000), category: "cd" },
      ],
      "2026-10-27",
      { EUR: 1.1 },
    );
    expect(rows.map((row) => row.id)).toEqual(["b", "a"]);
    expect(rows[0].faceValue).toBeCloseTo(5500);
    expect(rows[0].yearlyIncome).toBeCloseTo(220);
    expect(rows[1].yearlyIncome).toBe(400);
  });
});

describe("budgetSplit", () => {
  const expense = (category: string, amount: number) => ({
    id: category, kind: "expense" as const, category, name: category, amount, currency: "USD",
    frequency: "monthly" as const, starts_on: "2026-01-01", ends_on: null, principal: null,
    yield_pct: null, note: null,
  });

  it("splits income 50/30/20 and sorts expenses into needs, wants and savings", () => {
    const split = budgetSplit(
      [expense("rent", 2000), expense("food", 600), expense("travel", 400), expense("investment", 500)],
      5000,
      "2026-10-27",
    );
    expect(split.ideal).toEqual({ needs: 2500, wants: 1500, savings: 1000 });
    // What is left over (5000 − 3500 = 1500) counts as saving too.
    expect(split.actual).toEqual({ needs: 2600, wants: 400, savings: 2000 });
  });
});
