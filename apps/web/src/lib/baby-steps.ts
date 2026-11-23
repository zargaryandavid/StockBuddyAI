import type { Country } from "@/lib/country";
import { categoryFor, monthlyAmount, occurrences, toBase, type FireEntry, type FxRates } from "@/lib/fire";

/** IRA limits per year (traditional and Roth together): [under 50, 50 and over]. IRS Notice 2025-67. */
export const IRA_LIMITS: Record<number, [number, number]> = {
  2025: [7000, 8000],
  2026: [7500, 8600],
};

/** This year's IRA limit for someone of `age`, using the latest published year if this one isn't out yet. */
export function iraLimit(year: number, age: number | null) {
  const known = Object.keys(IRA_LIMITS).map(Number).sort((a, b) => a - b);
  const use = IRA_LIMITS[year] ? year : known.filter((item) => item <= year).at(-1) ?? known[0];
  const [base, older] = IRA_LIMITS[use];
  return { year: use, limit: age != null && age >= 50 ? older : base, base, older };
}

export type BabyStep =
  | {
      key: "emergency";
      done: boolean;
      /** Savings accounts and CDs. */
      have: number;
      /** Monthly expenses with a 30% cushion; 0 when no expenses are entered. */
      month: number;
      months: number;
    }
  | {
      key: "roth";
      done: boolean;
      /** Roth IRA balance. */
      have: number;
      accounts: number;
      /** Contributions from pay planned for this calendar year. */
      contributions: number;
      limit: number;
      year: number;
      base: number;
      older: number;
    }
  | {
      key: "pension";
      done: boolean;
      /** Pension savings balance (Armenia's funded pension, or another country's plan). */
      have: number;
      accounts: number;
      /** Pension contributions planned for this calendar year. */
      contributions: number;
    }
  | { key: "invest"; done: boolean; stocks: number; bonds: number }
  | { key: "college"; done: boolean; have: number; accounts: number };

/**
 * The baby steps that fit the person. Everyone gets the emergency fund and stocks and bonds.
 * Retirement is a Roth IRA in the US and pension savings elsewhere (Armenia has no IRA). A
 * 529 only exists in the US and only shows for someone with an education goal: a 529 account
 * already, or education costs among their expenses.
 *
 * The four US baby steps, from Path2Wealth: an emergency fund of 3–6 months of expenses (plus
 * 30%), Roth IRA contributions from pay up to this year's limit, both stocks and bonds, and a 529
 * education account. Each is worked out from what the person already entered.
 */
export function babySteps({
  entries,
  today,
  rates = {},
  baseCurrency = "USD",
  stocks,
  bonds,
  age,
  country = "US",
}: {
  entries: FireEntry[];
  today: string;
  rates?: FxRates;
  baseCurrency?: string;
  /** Value of the portfolio holdings (not cash). */
  stocks: number;
  /** Bonds entered in FIRE, at face value. */
  bonds: number;
  age: number | null;
  country?: Country;
}): BabyStep[] {
  const running = entries.filter((entry) => !entry.ends_on || entry.ends_on >= today);
  const balance = (category: string) =>
    running
      .filter((entry) => entry.kind === "income" && entry.category === category)
      .reduce((sum, entry) => sum + (toBase(Number(entry.principal) || 0, entry.currency, rates, baseCurrency) ?? 0), 0);
  const count = (category: string) => running.filter((entry) => entry.kind === "income" && entry.category === category).length;

  // Living costs only: contributions to your own accounts would pause in an emergency.
  const monthlySpend = running
    .filter((entry) => entry.kind === "expense" && !categoryFor("expense", entry.category).into)
    .reduce((sum, entry) => sum + monthlyAmount(entry, today, rates, baseCurrency), 0);
  const month = monthlySpend * 1.3;
  const cash = balance("savings") + balance("cd");

  const thisYear = Number(today.slice(0, 4));
  const { limit, base, older } = iraLimit(thisYear, age);
  const year = thisYear;
  const roth = balance("roth_ira");
  // Money put straight into a Roth account this year, as entered on the account itself.
  const deposited = entries
    .filter((entry) => entry.kind === "income" && entry.category === "roth_ira")
    .filter((entry) => entry.contributed_year === thisYear)
    .reduce((sum, entry) => sum + (toBase(Number(entry.contributed) || 0, entry.currency, rates, baseCurrency) ?? 0), 0);
  // Every Roth contribution paid this calendar year, past and still to come.
  const contributions = deposited + entries
    .filter((entry) => entry.kind === "expense" && categoryFor("expense", entry.category).into === "roth_ira")
    .reduce(
      (sum, entry) =>
        sum +
        occurrences(entry, `${thisYear}-01-01`, `${thisYear}-12-31`).length *
          (toBase(Number(entry.amount) || 0, entry.currency, rates, baseCurrency) ?? 0),
      0,
    );
  const college = balance("college_529");
  const pension = balance("pension");
  const pensionContributions = entries
    .filter((entry) => entry.kind === "expense" && categoryFor("expense", entry.category).into === "pension")
    .reduce(
      (sum, entry) =>
        sum +
        occurrences(entry, `${thisYear}-01-01`, `${thisYear}-12-31`).length *
          (toBase(Number(entry.amount) || 0, entry.currency, rates, baseCurrency) ?? 0),
      0,
    );
  const educationGoal =
    count("college_529") > 0 || running.some((entry) => entry.kind === "expense" && entry.category === "education");

  const steps: BabyStep[] = [
    { key: "emergency", done: month > 0 && cash >= month * 3, have: cash, month, months: month > 0 ? cash / month : 0 },
    country === "US"
      ? { key: "roth", done: contributions >= limit - 0.005, have: roth, accounts: count("roth_ira"), contributions, limit, year, base, older }
      : {
          key: "pension",
          done: count("pension") > 0 && pension > 0,
          have: pension,
          accounts: count("pension"),
          contributions: pensionContributions,
        },
    { key: "invest", done: stocks > 0 && bonds > 0, stocks, bonds },
  ];
  if (country === "US" && educationGoal) {
    steps.push({ key: "college", done: count("college_529") > 0 && college > 0, have: college, accounts: count("college_529") });
  }
  return steps;
}
