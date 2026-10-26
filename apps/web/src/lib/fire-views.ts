// Display-ready figures for the FIRE page, kept apart from the components that show them.
import {
  categoryFor,
  FREQUENCIES,
  monthlyAmount,
  occurrences,
  periodsPerYear,
  toBase,
  type FireEntry,
  type FireFrequency,
  type FireKind,
  type FxRates,
} from "./fire";
import { translator, type Translate } from "./i18n/core";

// Display text goes through an optional translator `t`; without one it reads in English.
const english: Translate = translator("en");

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 2026" from a "YYYY-MM-DD" key (or a Date), in the reader's language. */
export function shortMonthYear(date: string | Date, t: Translate = english) {
  const value = typeof date === "string" ? new Date(`${date.slice(0, 10)}T00:00:00Z`) : date;
  return t("{month} {year}", {
    month: t(SHORT_MONTHS[value.getUTCMonth()]),
    year: value.getUTCFullYear(),
  });
}

/** "Oct 26" from a "YYYY-MM-DD" key, in the reader's language. */
export function shortMonthDay(date: string, t: Translate = english) {
  const value = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  return t("{month} {day}", { month: t(SHORT_MONTHS[value.getUTCMonth()]), day: value.getUTCDate() });
}

export type Period = "monthly" | "annual";

/** Normalized monthly value shown per month or per year (annual = monthly × 12). */
export function forPeriod(monthly: number, period: Period) {
  return period === "annual" ? monthly * 12 : monthly;
}

export function periodSuffix(period: Period, t: Translate = english) {
  return period === "annual" ? t("/yr") : t("/mo");
}

export type FireProgress = {
  /** Share of the FIRE target already funded, 0–100+; null without a target. */
  percent: number | null;
  remaining: number;
};

/** progress = current assets ÷ FIRE target × 100; remaining = max(target − assets, 0). */
export function fireProgress(currentAssets: number, fireTarget: number): FireProgress {
  const assets = Number.isFinite(currentAssets) ? Math.max(0, currentAssets) : 0;
  if (!Number.isFinite(fireTarget) || fireTarget <= 0) {
    return { percent: null, remaining: 0 };
  }
  return {
    percent: (assets / fireTarget) * 100,
    remaining: Math.max(fireTarget - assets, 0),
  };
}

export type CurrencyView = {
  currency: string;
  /** Amount of one payment in its own currency. */
  amount: number;
  /** "every 3 months", "monthly", "one time", … */
  cadence: string;
  /** One payment converted to the base currency; null without a rate. */
  basePerPayment: number | null;
  /** Normalized monthly amount in the base currency; null without a rate. */
  baseMonthly: number | null;
  /** How many units of the entry's currency one base unit buys (e.g. 360 AMD per USD). */
  unitsPerBase: number | null;
};

const CADENCE: Record<FireFrequency, string> = {
  once: "one time",
  monthly: "monthly",
  quarterly: "every 3 months",
  semiannual: "every 6 months",
  annual: "yearly",
};

/** How a foreign-currency entry reads after conversion, from the actual exchange rate. */
export function currencyView(
  entry: FireEntry,
  today: string,
  rates: FxRates,
  base = "USD",
  t: Translate = english,
): CurrencyView {
  const amount = Number(entry.amount) || 0;
  const rate = entry.currency === base ? 1 : rates[entry.currency];
  const basePerPayment = toBase(amount, entry.currency, rates, base);
  const monthlyNative =
    entry.frequency === "once" || (entry.ends_on && entry.ends_on < today)
      ? 0
      : (amount * periodsPerYear(entry.frequency)) / 12;
  return {
    currency: entry.currency,
    amount,
    cadence: t(CADENCE[entry.frequency] ?? FREQUENCIES[0].label),
    basePerPayment,
    baseMonthly: toBase(monthlyNative, entry.currency, rates, base),
    unitsPerBase: rate ? 1 / rate : null,
  };
}

export type BreakdownRow = {
  key: string;
  label: string;
  /** Normalized monthly amount in the base currency. */
  monthly: number;
  share: number;
  /** Set when the source is paid in another currency. */
  original: { amount: number; currency: string; cadence: string } | null;
};

export type Breakdown = { rows: BreakdownRow[]; totalMonthly: number };

/**
 * Monthly income by source (one row per entry) or monthly expenses by category, largest
 * first. One-time, finished, and unconvertible entries contribute nothing.
 */
export function breakdown(
  entries: FireEntry[],
  kind: FireKind,
  today: string,
  rates: FxRates,
  base = "USD",
  t: Translate = english,
): Breakdown {
  const grouped = new Map<string, BreakdownRow>();
  for (const entry of entries) {
    if (entry.kind !== kind) continue;
    const monthly = monthlyAmount(entry, today, rates, base);
    if (monthly <= 0) continue;
    const key = kind === "income" ? entry.id : entry.category;
    const label = kind === "income" ? entry.name : t(categoryFor(kind, entry.category).label);
    const existing = grouped.get(key);
    const foreign = entry.currency && entry.currency !== base;
    grouped.set(key, {
      key,
      label,
      monthly: (existing?.monthly ?? 0) + monthly,
      share: 0,
      original:
        kind === "income" && foreign
          ? { amount: Number(entry.amount), currency: entry.currency, cadence: t(CADENCE[entry.frequency]) }
          : null,
    });
  }
  const rows = [...grouped.values()].sort((a, b) => b.monthly - a.monthly);
  const totalMonthly = rows.reduce((sum, row) => sum + row.monthly, 0);
  return {
    rows: rows.map((row) => ({ ...row, share: totalMonthly ? row.monthly / totalMonthly : 0 })),
    totalMonthly,
  };
}

export type Granularity = "week" | "month";

export type PeriodItem = { date: string; name: string; amount: number; currency: string; baseAmount: number | null };

export type CashPeriod = {
  start: string;
  end: string;
  label: string;
  /** Sum in the base currency; items without an exchange rate are left out. */
  total: number;
  items: PeriodItem[];
};

function utcKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(key: string, days: number) {
  const date = new Date(`${key}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return utcKey(date);
}

/** Weeks start on Monday; months on the 1st. The first period contains today. */
function periodBounds(today: string, granularity: Granularity, count: number, t: Translate) {
  const bounds: { start: string; end: string; label: string }[] = [];
  if (granularity === "month") {
    const [year, month] = today.split("-").map(Number);
    for (let i = 0; i < count; i += 1) {
      const start = new Date(Date.UTC(year, month - 1 + i, 1));
      const end = new Date(Date.UTC(year, month + i, 0));
      bounds.push({
        start: utcKey(start),
        end: utcKey(end),
        label: shortMonthYear(start, t),
      });
    }
    return bounds;
  }
  const day = new Date(`${today}T00:00:00Z`).getUTCDay();
  const monday = addDays(today, -((day + 6) % 7));
  for (let i = 0; i < count; i += 1) {
    const start = addDays(monday, i * 7);
    bounds.push({
      start,
      end: addDays(start, 6),
      label: t("Week of {date}", { date: shortMonthDay(start, t) }),
    });
  }
  return bounds;
}

/**
 * Upcoming income or expense payments grouped by week or month, from each entry's own
 * dates and frequency. Entries stop at their end dates; amounts are converted to the
 * base currency.
 */
export function cashFlowByPeriod(
  entries: FireEntry[],
  kind: FireKind,
  today: string,
  rates: FxRates,
  base: string,
  granularity: Granularity,
  count = 12,
  t: Translate = english,
): CashPeriod[] {
  const periods = periodBounds(today, granularity, count, t).map((bound) => ({
    ...bound,
    total: 0,
    items: [] as PeriodItem[],
  }));
  if (!periods.length) return periods;
  const from = periods[0].start;
  const to = periods[periods.length - 1].end;
  for (const entry of entries) {
    if (entry.kind !== kind) continue;
    for (const date of occurrences(entry, from, to)) {
      const period = periods.find((item) => date >= item.start && date <= item.end);
      if (!period) continue;
      const amount = Number(entry.amount) || 0;
      const baseAmount = toBase(amount, entry.currency, rates, base);
      period.items.push({ date, name: entry.name, amount, currency: entry.currency, baseAmount });
      period.total += baseAmount ?? 0;
    }
  }
  for (const period of periods) period.items.sort((a, b) => a.date.localeCompare(b.date));
  return periods;
}
