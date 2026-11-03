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
  | { key: "invest"; done: boolean; stocks: number; bonds: number }
  | { key: "college"; done: boolean; have: number; accounts: number };

/**
 * The four baby steps, from Path2Wealth: an emergency fund of 3–6 months of expenses (plus
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
  // Every Roth contribution paid this calendar year, past and still to come.
  const contributions = entries
    .filter((entry) => entry.kind === "expense" && categoryFor("expense", entry.category).into === "roth_ira")
    .reduce(
      (sum, entry) =>
        sum +
        occurrences(entry, `${thisYear}-01-01`, `${thisYear}-12-31`).length *
          (toBase(Number(entry.amount) || 0, entry.currency, rates, baseCurrency) ?? 0),
      0,
    );
  const college = balance("college_529");

  return [
    { key: "emergency", done: month > 0 && cash >= month * 3, have: cash, month, months: month > 0 ? cash / month : 0 },
    { key: "roth", done: contributions >= limit - 0.005, have: roth, accounts: count("roth_ira"), contributions, limit, year, base, older },
    { key: "invest", done: stocks > 0 && bonds > 0, stocks, bonds },
    { key: "college", done: count("college_529") > 0 && college > 0, have: college, accounts: count("college_529") },
  ];
}
