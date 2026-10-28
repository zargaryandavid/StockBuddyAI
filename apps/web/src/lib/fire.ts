// FIRE planning math, modeled on Path2Wealth: repeating incomes and expenses,
// a month-by-month projection to the FIRE number, and a short plain-language read.
// Dates are "YYYY-MM-DD" calendar keys handled in UTC so they never shift a day.
// Display text goes through an optional translator `t`; without one it reads in English.

import { translator, type Translate } from "./i18n/core";

const english: Translate = translator("en");

export type FireKind = "income" | "expense";
export type FireFrequency = "once" | "monthly" | "quarterly" | "semiannual" | "annual";

export type FireEntry = {
  id: string;
  kind: FireKind;
  category: string;
  name: string;
  amount: number;
  currency: string;
  frequency: FireFrequency;
  starts_on: string;
  ends_on: string | null;
  principal: number | null;
  yield_pct: number | null;
  /** Bonds: how many, and the price of one; face value = quantity × unit_price. */
  quantity?: number | null;
  unit_price?: number | null;
  note: string | null;
  /** Rental income: the asset that earns it. */
  asset_id?: string | null;
};

export type FireAssetType =
  | "residential"
  | "vacation"
  | "commercial"
  | "land"
  | "vehicle"
  | "equipment"
  | "other";

/** Something owned outside the portfolio, such as a rental property, with its market value. */
export type FireAsset = {
  id: string;
  asset_type: FireAssetType;
  name: string;
  market_value: number | null;
  currency: string;
  /** Optional address, city, or area. */
  location?: string | null;
  note: string | null;
};

/** Rental types; each belongs to a group shown as one slice of "What you own today". */
export const ASSET_TYPES: {
  key: FireAssetType;
  label: string;
  icon: string;
  group: "real_estate" | "vehicles_equipment" | "other_assets";
}[] = [
  { key: "residential", label: "Residential Property", icon: "home", group: "real_estate" },
  { key: "vacation", label: "Vacation / Short-Term Rental", icon: "plane", group: "real_estate" },
  { key: "commercial", label: "Commercial Property", icon: "building-2", group: "real_estate" },
  { key: "land", label: "Land", icon: "map", group: "real_estate" },
  { key: "vehicle", label: "Vehicle Rental", icon: "car", group: "vehicles_equipment" },
  { key: "equipment", label: "Equipment Rental", icon: "wrench", group: "vehicles_equipment" },
  { key: "other", label: "Other Rental Income", icon: "ellipsis", group: "other_assets" },
];

const ASSET_GROUPS = [
  { key: "real_estate", label: "Real estate" },
  { key: "vehicles_equipment", label: "Vehicles & equipment" },
  { key: "other_assets", label: "Other assets" },
] as const;

export function assetTypeFor(key: string) {
  return ASSET_TYPES.find((type) => type.key === key) ?? ASSET_TYPES[ASSET_TYPES.length - 1];
}

export type HeldAsset = { key: string; label: string; value: number };

/**
 * Market value of owned assets by group, in the base currency. A rental income that
 * still carries a property value and no linked asset counts as real estate.
 */
export function heldAssets(
  assets: FireAsset[],
  entries: FireEntry[],
  rates: FxRates = {},
  base = "USD",
): HeldAsset[] {
  const totals = new Map<string, number>();
  const add = (group: string, value: number | null) => {
    if (value) totals.set(group, (totals.get(group) ?? 0) + value);
  };
  for (const asset of assets) {
    add(assetTypeFor(asset.asset_type).group, toBase(Number(asset.market_value ?? 0), asset.currency, rates, base));
  }
  for (const entry of entries) {
    if (entry.kind !== "income" || entry.category !== "rent_income" || entry.asset_id) continue;
    add("real_estate", toBase(Number(entry.principal ?? 0), entry.currency, rates, base));
  }
  return ASSET_GROUPS.map((group) => ({ ...group, value: totals.get(group.key) ?? 0 })).filter(
    (group) => group.value > 0,
  );
}

export type FireSettings = {
  expected_return_pct: number;
  retirement_annual_spend: number | null;
  monthly_invest: number | null;
  withdrawal_rate_pct: number;
  /** Expected yearly inflation; the projection is shown in today's dollars. */
  inflation_pct?: number;
};

export type FireCategory = {
  key: string;
  label: string;
  icon: string;
  /** Savings accounts, CDs, and bonds pay a yield on a balance or face value. */
  yields?: "balance" | "face";
  /** Rental income is earned by an asset (property, land, vehicle, equipment). */
  rental?: boolean;
};

export const INCOME_CATEGORIES: FireCategory[] = [
  { key: "salary", label: "Salary", icon: "briefcase" },
  { key: "rent_income", label: "Rental income", icon: "building-2", rental: true },
  { key: "savings", label: "Savings account", icon: "piggy-bank", yields: "balance" },
  { key: "cd", label: "CD", icon: "landmark", yields: "balance" },
  { key: "bond", label: "Bond", icon: "scroll-text", yields: "face" },
  { key: "dividends", label: "Dividends", icon: "chart-line" },
  { key: "bonus", label: "Bonus", icon: "gift" },
  { key: "freelance", label: "Freelance", icon: "laptop" },
  { key: "other", label: "Other income", icon: "plus" },
];

export const EXPENSE_CATEGORIES: FireCategory[] = [
  { key: "rent", label: "Rent / mortgage", icon: "key-round" },
  { key: "bills", label: "Bills & utilities", icon: "receipt" },
  { key: "food", label: "Food", icon: "utensils" },
  { key: "transport", label: "Transport", icon: "car" },
  { key: "insurance", label: "Insurance", icon: "shield-check" },
  { key: "health", label: "Health", icon: "heart-pulse" },
  { key: "lease", label: "Lease", icon: "file-signature" },
  { key: "finance", label: "Loans & finance", icon: "landmark" },
  { key: "tax", label: "Taxes", icon: "file-text" },
  { key: "education", label: "Education", icon: "graduation-cap" },
  { key: "shopping", label: "Shopping", icon: "shopping-bag" },
  { key: "home", label: "Home", icon: "home" },
  { key: "travel", label: "Travel", icon: "plane" },
  { key: "fun", label: "Fun", icon: "party-popper" },
  { key: "investment", label: "Investment", icon: "trending-up" },
  { key: "saving", label: "Saving", icon: "piggy-bank" },
  { key: "other", label: "Other expense", icon: "ellipsis" },
];

export const FREQUENCIES: { key: FireFrequency; label: string }[] = [
  { key: "once", label: "One time" },
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Every 3 months" },
  { key: "semiannual", label: "Every 6 months" },
  { key: "annual", label: "Yearly" },
];

export function categoryFor(kind: FireKind, key: string): FireCategory {
  const list = kind === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  return list.find((item) => item.key === key) ?? { key, label: key, icon: "ellipsis" };
}

export function periodsPerYear(frequency: FireFrequency) {
  return { once: 0, monthly: 12, quarterly: 4, semiannual: 2, annual: 1 }[frequency];
}

function monthsBetween(frequency: FireFrequency) {
  return { once: 0, monthly: 1, quarterly: 3, semiannual: 6, annual: 12 }[frequency];
}

/** Interest or coupon paid each period: balance × yearly rate ÷ payments per year. */
export function yieldPayment(principal: number, yieldPct: number, frequency: FireFrequency) {
  const perYear = periodsPerYear(frequency) || 1;
  return Math.round(((principal * yieldPct) / 100 / perYear) * 100) / 100;
}

function parseKey(key: string) {
  const [year, month, day] = key.slice(0, 10).split("-").map(Number);
  return { year, month: month - 1, day };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function keyFor(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month, 1));
  const clamped = Math.min(day, daysInMonth(date.getUTCFullYear(), date.getUTCMonth()));
  date.setUTCDate(clamped);
  return date.toISOString().slice(0, 10);
}

/** Every date the entry occurs between `from` and `to`, inclusive. */
export function occurrences(entry: FireEntry, from: string, to: string): string[] {
  const start = entry.starts_on.slice(0, 10);
  const end = entry.ends_on && entry.ends_on < to ? entry.ends_on : to;
  if (entry.frequency === "once") {
    return start >= from && start <= end ? [start] : [];
  }
  const step = monthsBetween(entry.frequency);
  const { year, month, day } = parseKey(start);
  const out: string[] = [];
  for (let index = 0; index < 1200; index += 1) {
    const key = keyFor(year, month + index * step, day);
    if (key > end) break;
    if (key >= from) out.push(key);
  }
  return out;
}

/** Units of the base currency per one unit of each other currency, e.g. { AMD: 0.0027 }. */
export type FxRates = Record<string, number>;

/** Converts a value in the entry's currency to the base currency; null when no rate is known. */
export function toBase(value: number, currency: string, rates: FxRates = {}, base = "USD") {
  if (!currency || currency === base) return value;
  const rate = rates[currency];
  return rate == null ? null : value * rate;
}

/** The entry's average monthly cash flow, counting only entries still running. */
export function monthlyAmount(
  entry: FireEntry,
  today: string,
  rates: FxRates = {},
  base = "USD",
) {
  if (entry.frequency === "once") return 0;
  if (entry.ends_on && entry.ends_on < today) return 0;
  const monthly = (Number(entry.amount) * periodsPerYear(entry.frequency)) / 12;
  return toBase(monthly, entry.currency, rates, base) ?? 0;
}

export type FirePlan = {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyNet: number;
  savingsRate: number | null;
  yieldBalances: number;
  /** Savings accounts and CDs, in the base currency. */
  savingsBalances: number;
  /** Bond face values, in the base currency. */
  bondBalances: number;
  /** Owned assets by group (real estate, vehicles…), in the base currency; not FIRE assets. */
  heldAssets: HeldAsset[];
  /** Average coupon of running bonds, weighted by face value; null without bonds. */
  bondYieldPct: number | null;
  /** Average APY of savings accounts and CDs, weighted by balance; null without any. */
  savingsYieldPct: number | null;
  currentAssets: number;
  monthlyInvest: number;
  /** What "Invest each month" uses when left on Auto: income − expenses, excluding interest. */
  autoInvest: number;
  annualSpend: number;
  fireNumber: number;
  hitMonth: number | null;
  data: { year: number; value: number }[];
  /** Currencies left out of the totals because no exchange rate is available. */
  missingRates: string[];
  /** Monthly projection from today; see ProjectionPoint. */
  series: ProjectionPoint[];
  /** The same plan at the classic 4% rate, when the chosen rate is above 4.5%. */
  atFourPercent: { fireNumber: number; hitMonth: number | null } | null;
};

/** Whole months from `today`'s month to the month of `date`. */
function monthsFrom(today: string, date: string) {
  const a = parseKey(today);
  const b = parseKey(date);
  return (b.year - a.year) * 12 + (b.month - a.month);
}

const HORIZON_MONTHS = 600;

/**
 * One projected month in today's dollars. Growth is what is left after starting assets and
 * contributions: total − startAssets − contributed (it can be negative, for example when
 * inflation shrinks fixed bond values).
 */
export type ProjectionPoint = {
  month: number;
  total: number;
  startAssets: number;
  contributed: number;
};

/**
 * Projects assets month by month from the user's own entries, in today's dollars.
 *
 * Each kind of asset grows at its own rate:
 * - Stocks and portfolio cash grow at the expected yearly return.
 * - Each bond grows at its own coupon rate and each savings account or CD at its own APY,
 *   with the interest reinvested. A bond or CD moves into stocks when it matures.
 * - Each month's new money (income minus expenses, without that interest, which is
 *   already inside the bond and savings growth) is added to stocks. "Invest each month",
 *   when set, replaces it with a fixed amount.
 * Incomes and expenses are assumed to rise with inflation; balances grow in dollars and
 * are shown in today's dollars by removing inflation.
 */
export function projectFromEntries({
  entries,
  settings,
  growthAssets,
  today,
  annualSpend,
  withdrawalRatePct,
  rates = {},
  baseCurrency = "USD",
}: {
  entries: FireEntry[];
  settings: FireSettings;
  growthAssets: number;
  today: string;
  annualSpend: number;
  withdrawalRatePct: number;
  rates?: FxRates;
  baseCurrency?: string;
}) {
  const inflation = (Number(settings.inflation_pct) || 0) / 100;
  const monthlyRate = (yearlyPct: number) => Math.pow(1 + (Number(yearlyPct) || 0) / 100, 1 / 12) - 1;
  const stockMonthly = monthlyRate(settings.expected_return_pct);
  const prices = (month: number) => Math.pow(1 + inflation, month / 12);
  const fireNumber = annualSpend > 0 ? annualSpend / ((withdrawalRatePct || 4) / 100) : 0;

  const start = parseKey(today);
  const horizonEnd = keyFor(start.year, start.month + HORIZON_MONTHS, 28);
  // New money per month in today's dollars; interest stays inside its own account.
  const flows = new Array<number>(HORIZON_MONTHS + 1).fill(0);
  const accounts: { value: number; monthly: number; maturesAt: number | null; open: boolean }[] = [];

  for (const entry of entries) {
    const category = categoryFor(entry.kind, entry.category);
    const running = !(entry.ends_on && entry.ends_on < today);
    if (entry.kind === "income" && category.yields) {
      const principal = toBase(Number(entry.principal ?? 0), entry.currency, rates, baseCurrency);
      if (running && principal) {
        accounts.push({
          value: principal,
          monthly: monthlyRate(Number(entry.yield_pct ?? 0)),
          maturesAt: entry.ends_on ? Math.max(1, monthsFrom(today, entry.ends_on)) : null,
          open: true,
        });
      }
      continue;
    }
    for (const date of occurrences(entry, today, horizonEnd)) {
      if (date <= today) continue;
      // Month 0 is the rest of the current month; it is settled before growth starts.
      const month = monthsFrom(today, date);
      if (month > HORIZON_MONTHS) continue;
      const amount = toBase(Number(entry.amount), entry.currency, rates, baseCurrency);
      if (amount == null) continue;
      flows[month] += entry.kind === "income" ? amount : -amount;
    }
  }

  const openValue = () =>
    accounts.filter((item) => item.open).reduce((sum, item) => sum + item.value, 0);
  const startAssets = growthAssets + openValue();
  let contributed = settings.monthly_invest == null ? flows[0] : 0;
  let stocks = growthAssets + contributed;
  const startTotal = stocks + openValue();
  const data = [{ year: 0, value: startTotal }];
  // Each month's total split into what you own today, what you add, and the rest (growth).
  const series: ProjectionPoint[] = [{ month: 0, total: startTotal, startAssets, contributed }];
  let hitMonth: number | null = fireNumber > 0 && startTotal >= fireNumber ? 0 : null;
  for (let month = 1; month <= HORIZON_MONTHS; month += 1) {
    const contribution = settings.monthly_invest ?? flows[month];
    contributed += contribution;
    stocks = stocks * (1 + stockMonthly) + contribution * prices(month);
    for (const item of accounts) {
      if (!item.open) continue;
      item.value *= 1 + item.monthly;
      if (item.maturesAt === month) {
        stocks += item.value;
        item.open = false;
      }
    }
    const total = (stocks + openValue()) / prices(month);
    if (hitMonth === null && fireNumber > 0 && total >= fireNumber) hitMonth = month;
    if (month % 12 === 0) data.push({ year: month / 12, value: total });
    series.push({ month, total, startAssets, contributed });
  }
  let years = 25;
  if (hitMonth === 0) years = 10;
  else if (hitMonth != null) years = Math.min(40, Math.max(8, Math.ceil(hitMonth / 12) + 5));
  const firstYear = flows.slice(1, 13);
  // Income minus expenses over the next year, leaving out interest kept in its account.
  const autoInvest = firstYear.reduce((sum, value) => sum + value, 0) / firstYear.length;
  const averageInvest = settings.monthly_invest ?? autoInvest;
  return {
    fireNumber,
    hitMonth,
    data: data.slice(0, years + 1),
    averageInvest,
    autoInvest,
    series,
  };
}

export function buildPlan({
  entries,
  assets = [],
  settings,
  portfolioValue,
  today,
  rates = {},
  baseCurrency = "USD",
}: {
  entries: FireEntry[];
  assets?: FireAsset[];
  settings: FireSettings;
  portfolioValue: number;
  today: string;
  rates?: FxRates;
  baseCurrency?: string;
}): FirePlan {
  const missingRates = [
    ...new Set(
      entries
        .map((entry) => entry.currency)
        .filter((currency) => toBase(1, currency, rates, baseCurrency) == null),
    ),
  ];
  const sum = (kind: FireKind) =>
    entries
      .filter((entry) => entry.kind === kind)
      .reduce((total, entry) => total + monthlyAmount(entry, today, rates, baseCurrency), 0);
  const monthlyIncome = sum("income");
  const monthlyExpenses = sum("expense");
  const monthlyNet = monthlyIncome - monthlyExpenses;
  const balance = (matches: (category: FireCategory) => boolean) =>
    entries
      .filter(
        (entry) =>
          entry.kind === "income" &&
          matches(categoryFor("income", entry.category)) &&
          !(entry.ends_on && entry.ends_on < today),
      )
      .reduce(
        (total, entry) =>
          total + (toBase(Number(entry.principal ?? 0), entry.currency, rates, baseCurrency) ?? 0),
        0,
      );
  // Average rate of a group of accounts, weighted by their balance in the base currency.
  const weightedYield = (yields: "balance" | "face") => {
    let weight = 0;
    let sum = 0;
    for (const entry of entries) {
      if (entry.kind !== "income" || categoryFor("income", entry.category).yields !== yields) continue;
      if (entry.ends_on && entry.ends_on < today) continue;
      const value = toBase(Number(entry.principal ?? 0), entry.currency, rates, baseCurrency) ?? 0;
      if (value <= 0) continue;
      weight += value;
      sum += value * (Number(entry.yield_pct) || 0);
    }
    return weight > 0 ? sum / weight : null;
  };
  const savingsBalances = balance((category) => category.yields === "balance");
  const bondBalances = balance((category) => category.yields === "face");
  const yieldBalances = savingsBalances + bondBalances;
  const currentAssets = portfolioValue + yieldBalances;
  const annualSpend = settings.retirement_annual_spend ?? monthlyExpenses * 12;
  const projectAt = (withdrawalRatePct: number) =>
    projectFromEntries({
      entries,
      settings,
      growthAssets: portfolioValue,
      today,
      annualSpend,
      withdrawalRatePct,
      rates,
      baseCurrency,
    });
  const { averageInvest, autoInvest, ...projection } = projectAt(settings.withdrawal_rate_pct);
  const monthlyInvest = Math.max(0, averageInvest);
  const fourPercent = settings.withdrawal_rate_pct > 4.5 ? projectAt(4) : null;
  return {
    monthlyIncome,
    monthlyExpenses,
    monthlyNet,
    savingsRate: monthlyIncome > 0 ? monthlyNet / monthlyIncome : null,
    yieldBalances,
    savingsBalances,
    bondBalances,
    // Rent is already counted as income, so the assets themselves stay out of FIRE assets.
    heldAssets: heldAssets(assets, entries, rates, baseCurrency),
    bondYieldPct: weightedYield("face"),
    savingsYieldPct: weightedYield("balance"),
    currentAssets,
    monthlyInvest,
    autoInvest: Math.max(0, autoInvest),
    annualSpend,
    ...projection,
    missingRates,
    atFourPercent: fourPercent
      ? { fireNumber: fourPercent.fireNumber, hitMonth: fourPercent.hitMonth }
      : null,
  };
}

/**
 * Grows the pot month by month and finds when it reaches the FIRE number:
 * yearly spending ÷ the safe withdrawal rate (25× spending at the classic 4%).
 */
export function project({
  start,
  monthly,
  ratePct,
  annualSpend,
  withdrawalRatePct = 4,
}: {
  start: number;
  monthly: number;
  ratePct: number;
  annualSpend: number;
  withdrawalRatePct?: number;
}) {
  const monthlyRate = Math.pow(1 + (Number(ratePct) || 0) / 100, 1 / 12) - 1;
  const fireNumber = annualSpend > 0 ? annualSpend / ((withdrawalRatePct || 4) / 100) : 0;
  let pot = Number(start) || 0;
  const data = [{ year: 0, value: pot }];
  let hitMonth: number | null = fireNumber > 0 && pot >= fireNumber ? 0 : null;
  for (let month = 1; month <= 600; month += 1) {
    pot = pot * (1 + monthlyRate) + (Number(monthly) || 0);
    if (hitMonth === null && fireNumber > 0 && pot >= fireNumber) hitMonth = month;
    if (month % 12 === 0) data.push({ year: month / 12, value: pot });
  }
  let years = 25;
  if (hitMonth === 0) years = 10;
  else if (hitMonth != null) years = Math.min(40, Math.max(8, Math.ceil(hitMonth / 12) + 5));
  return { fireNumber, hitMonth, data: data.slice(0, years + 1) };
}

export type AssetSlice = { key: string; label: string; value: number; share: number };

/** Current assets by kind, largest first, leaving out empty kinds. */
export function assetMix({
  portfolioValue,
  cash,
  savingsBalances,
  bondBalances,
  held = [],
}: {
  portfolioValue: number;
  cash: number;
  savingsBalances: number;
  bondBalances: number;
  held?: HeldAsset[];
}): AssetSlice[] {
  const parts = [
    { key: "stocks", label: "Stocks", value: Math.max(0, portfolioValue - cash) },
    { key: "bonds", label: "Bonds", value: bondBalances },
    { key: "savings", label: "Savings & CDs", value: savingsBalances },
    { key: "cash", label: "Cash", value: Math.max(0, cash) },
    ...held,
  ].filter((part) => part.value > 0);
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  return parts
    .map((part) => ({ ...part, share: total ? part.value / total : 0 }))
    .sort((a, b) => b.value - a.value);
}

export function yearsLabel(hitMonth: number | null, t: Translate = english) {
  if (hitMonth == null) return t("50+ years");
  if (hitMonth === 0) return t("Reached");
  const years = Math.floor(hitMonth / 12);
  const months = hitMonth % 12;
  if (years === 0) return t("{months} mo", { months });
  if (!months) return years === 1 ? t("{years} yr", { years }) : t("{years} yrs", { years });
  return years === 1
    ? t("{years} yr {months} mo", { years, months })
    : t("{years} yrs {months} mo", { years, months });
}

const wholeMoney = (value: number) => {
  const rounded = Math.round(value);
  return `${rounded < 0 ? "-" : ""}$${Math.abs(rounded).toLocaleString("en-US")}`;
};

export type PlanNote = { title: string; text: string; tone?: "good" | "warn" | "bad" };

/** A short read of the plan: FIRE date, emergency fund, and the biggest bottleneck. */
export function planNotes(plan: FirePlan, cash: number, t: Translate = english) {
  const notes: PlanNote[] = [];
  const targetMonthly = plan.annualSpend / 12;
  // The FIRE number is spending ÷ withdrawal rate, so the rate is spending ÷ FIRE number.
  const withdrawalRate = plan.fireNumber > 0 ? plan.annualSpend / plan.fireNumber : 0.04;
  if (plan.fireNumber <= 0) {
    notes.push({
      title: "FIRE",
      text: t("Add your expenses (or a retirement spending amount) to set a FIRE number."),
    });
  } else if (plan.hitMonth === 0) {
    notes.push({
      title: "FIRE",
      text: t(
        "You're there: {assets} would pay about {pays}/mo at your {rate}% withdrawal rate, covering {spending}/mo of spending. Protect the balance.",
        {
          assets: wholeMoney(plan.currentAssets),
          pays: wholeMoney((plan.currentAssets * withdrawalRate) / 12),
          rate: Math.round(withdrawalRate * 1000) / 10,
          spending: wholeMoney(targetMonthly),
        },
      ),
    });
  } else if (plan.hitMonth != null) {
    notes.push({
      title: "FIRE",
      text: t(
        "Your {target} target pays about {spending}/mo in retirement. Investing {invest}/mo, you reach it in about {time}.",
        {
          target: wholeMoney(plan.fireNumber),
          spending: wholeMoney(targetMonthly),
          invest: wholeMoney(plan.monthlyInvest),
          time: yearsLabel(plan.hitMonth, t),
        },
      ),
    });
  } else {
    notes.push({
      title: "FIRE",
      text: t(
        "At {invest}/mo the {target} target is more than 50 years away. Investing more or spending less in retirement is what moves it.",
        { invest: wholeMoney(plan.monthlyInvest), target: wholeMoney(plan.fireNumber) },
      ),
    });
  }

  const bills = plan.monthlyExpenses;
  if (bills > 0) {
    // Only money you can reach quickly counts: portfolio cash, savings accounts, and CDs.
    const have = Math.max(0, cash) + plan.savingsBalances;
    const months = have / bills;
    const tone = months >= 5 ? "good" : months >= 3 ? "warn" : "bad";
    const vars = {
      low: wholeMoney(bills * 5),
      high: wholeMoney(bills * 6),
      have: wholeMoney(have),
      months: months.toFixed(1),
      more: wholeMoney(bills * 5 - have),
    };
    const text =
      months >= 6
        ? t(
            "Aim for 5–6 months of expenses ({low}–{high}). Cash and savings accounts ({have}) cover about {months} months: fully covered. Bonds are not counted here.",
            vars,
          )
        : months >= 5
          ? t(
              "Aim for 5–6 months of expenses ({low}–{high}). Cash and savings accounts ({have}) cover about {months} months: covered. Bonds are not counted here.",
              vars,
            )
          : months >= 3
            ? t(
                "Aim for 5–6 months of expenses ({low}–{high}). Cash and savings accounts ({have}) cover about {months} months: close; {more} more reaches 5 months. Bonds are not counted here.",
                vars,
              )
            : t(
                "Aim for 5–6 months of expenses ({low}–{high}). Cash and savings accounts ({have}) cover about {months} months: keep building; {more} more reaches 5 months. Bonds are not counted here.",
                vars,
              );
    notes.push({ title: t("Emergency fund"), tone, text });
  } else {
    notes.push({
      title: t("Emergency fund"),
      text: t("Add repeating expenses such as rent and bills to size a 5–6 month emergency fund."),
    });
  }

  if (plan.atFourPercent) {
    const rate = plan.annualSpend > 0 ? (plan.annualSpend / plan.fireNumber) * 100 : 0;
    const four = plan.atFourPercent;
    notes.push({
      title: t("Withdrawal rate"),
      tone: rate > 6 ? "bad" : "warn",
      text: t(
        "{rate}% a year is aggressive: long studies of retirements support about 4% (3.5% for early retirees). At 4% you need {target} and reach it in {time}.",
        {
          rate: Math.round(rate * 10) / 10,
          target: wholeMoney(four.fireNumber),
          time: yearsLabel(four.hitMonth, t),
        },
      ),
    });
  }

  let bottleneck: string;
  if (plan.monthlyIncome > 0 && bills >= plan.monthlyIncome) {
    bottleneck = t("Expenses ({bills}/mo) use your whole income, so nothing is left to invest.", {
      bills: wholeMoney(bills),
    });
  } else if (plan.savingsRate != null && plan.savingsRate < 0.15) {
    bottleneck = t("You keep {rate}% of income; raising that is the biggest lever on your FIRE date.", {
      rate: Math.round(plan.savingsRate * 100),
    });
  } else if (plan.hitMonth == null || plan.hitMonth > 360) {
    bottleneck = t(
      "Retirement spending of {spending}/yr sets a {target} target; lowering it pulls the date in fastest.",
      { spending: wholeMoney(plan.annualSpend), target: wholeMoney(plan.fireNumber) },
    );
  } else {
    bottleneck = t("Nothing major stands out. Consistency is the whole game from here.");
  }
  notes.push({ title: t("Bottleneck"), text: bottleneck });
  return notes;
}

export type CalendarEvent = {
  date: string;
  kind: FireKind | "report";
  title: string;
  /** Amount in the entry's own currency. */
  amount: number | null;
  currency?: string;
  /** Amount in the base currency, for month totals; null when no rate is known. */
  baseAmount?: number | null;
  estimated?: boolean;
};

/** Incomes, expenses, and holdings' report dates for one calendar month. */
export function monthEvents({
  entries,
  reports,
  year,
  month,
  rates = {},
  baseCurrency = "USD",
  t = english,
}: {
  entries: FireEntry[];
  reports: { ticker: string; report_date: string }[];
  year: number;
  month: number;
  rates?: FxRates;
  baseCurrency?: string;
  t?: Translate;
}): CalendarEvent[] {
  const from = keyFor(year, month, 1);
  const to = keyFor(year, month, 31);
  const events: CalendarEvent[] = [];
  for (const entry of entries) {
    for (const date of occurrences(entry, from, to)) {
      const amount = Number(entry.amount);
      events.push({
        date,
        kind: entry.kind,
        title: entry.name,
        amount,
        currency: entry.currency,
        baseAmount: toBase(amount, entry.currency, rates, baseCurrency),
      });
    }
  }
  for (const report of reports) {
    const last = report.report_date.slice(0, 10);
    if (last >= from && last <= to) {
      events.push({ date: last, kind: "report", title: t("{ticker} report", { ticker: report.ticker }), amount: null });
    }
    // Quarterly filers report again about three months later (an estimate).
    const { year: y, month: m, day } = parseKey(last);
    for (let quarter = 1; quarter <= 8; quarter += 1) {
      const next = keyFor(y, m + quarter * 3, day);
      if (next > to) break;
      if (next >= from) {
        events.push({
          date: next,
          kind: "report",
          title: t("{ticker} report (est.)", { ticker: report.ticker }),
          amount: null,
          estimated: true,
        });
      }
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

export type BondHolding = {
  id: string;
  name: string;
  /** Face value in the portfolio's currency; null when its currency has no rate yet. */
  faceValue: number | null;
  /** Face value in the bond's own currency. */
  faceValueOwn: number;
  currency: string;
  couponPct: number;
  frequency: FireFrequency;
  maturity: string | null;
  /** Coupons over a year in the portfolio's currency; null without a rate. */
  yearlyIncome: number | null;
  quantity: number | null;
  unitPrice: number | null;
};

/** The bonds entered in FIRE that have not matured, valued at face value. */
export function bondHoldings(
  entries: FireEntry[],
  today: string,
  rates: FxRates = {},
  baseCurrency = "USD",
): BondHolding[] {
  return entries
    .filter(
      (entry) =>
        entry.kind === "income" &&
        categoryFor("income", entry.category).yields === "face" &&
        !(entry.ends_on && entry.ends_on < today),
    )
    .map((entry) => {
      const own = Number(entry.principal ?? 0);
      const coupon = Number(entry.yield_pct) || 0;
      const faceValue = toBase(own, entry.currency, rates, baseCurrency);
      return {
        id: entry.id,
        name: entry.name,
        faceValue,
        faceValueOwn: own,
        currency: entry.currency,
        couponPct: coupon,
        frequency: entry.frequency,
        maturity: entry.ends_on,
        yearlyIncome: faceValue == null ? null : (faceValue * coupon) / 100,
        quantity: entry.quantity ?? null,
        unitPrice: entry.unit_price ?? null,
      };
    })
    .sort((a, b) => (a.maturity ?? "9999").localeCompare(b.maturity ?? "9999"));
}

/** Expense categories counted as needs in the 50/30/20 budget; saving categories are savings. */
const NEEDS = new Set(["rent", "bills", "food", "transport", "insurance", "health", "lease", "finance", "tax", "education", "home"]);
const SAVINGS = new Set(["investment", "saving"]);

export type BudgetSplit = {
  income: number;
  /** Ideal monthly amounts: 50% needs, 30% wants, 20% saving and investing. */
  ideal: { needs: number; wants: number; savings: number };
  /** What the entries actually spend each month; savings include what is left over. */
  actual: { needs: number; wants: number; savings: number };
};

/** The 50/30/20 rule applied to a month of the plan's income and expenses. */
export function budgetSplit(
  entries: FireEntry[],
  monthlyIncome: number,
  today: string,
  rates: FxRates = {},
  baseCurrency = "USD",
): BudgetSplit {
  let needs = 0;
  let wants = 0;
  let saved = 0;
  for (const entry of entries) {
    if (entry.kind !== "expense") continue;
    const monthly = monthlyAmount(entry, today, rates, baseCurrency);
    if (SAVINGS.has(entry.category)) saved += monthly;
    else if (NEEDS.has(entry.category)) needs += monthly;
    else wants += monthly;
  }
  const leftover = Math.max(0, monthlyIncome - needs - wants - saved);
  return {
    income: monthlyIncome,
    ideal: { needs: monthlyIncome * 0.5, wants: monthlyIncome * 0.3, savings: monthlyIncome * 0.2 },
    actual: { needs, wants, savings: saved + leftover },
  };
}
