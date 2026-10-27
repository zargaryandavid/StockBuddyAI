import type { Portfolio } from "@/lib/api";
import { cashShortfall, cashTarget, isFund } from "@/lib/analytics";
import type { Position } from "@/lib/portfolio";

/** Market data for one ticker, as the batch lookup returns it. */
export type Quote = Omit<Position, "shares">;

export type PortfolioSnapshot = {
  id: string;
  name: string;
  currency: string;
  holdingsValue: number;
  cash: number;
  total: number;
  dayChange: number;
  /** Holdings whose price could not be found; their value is left out. */
  unpriced: string[];
  holdings: { ticker: string; value: number; weight: number; isFund: boolean }[];
};

/** What one portfolio is worth today, from its holdings, their quotes and its cash. */
export function portfolioSnapshot(
  portfolio: Portfolio,
  quotes: Map<string, Quote>,
  /** Exchange rates into the portfolio's currency, for cash held in other currencies. */
  rates: Record<string, number> = {},
): PortfolioSnapshot {
  const own = portfolio.base_currency ?? "USD";
  const cash =
    (Number(portfolio.cash) || 0) +
    (portfolio.other_cash ?? []).reduce((sum, item) => {
      const rate = item.currency === own ? 1 : rates[item.currency];
      return rate ? sum + (Number(item.amount) || 0) * rate : sum;
    }, 0);
  const unpriced: string[] = [];
  const priced = portfolio.portfolio_positions.flatMap((position) => {
    const ticker = position.ticker.trim().toUpperCase();
    const quote = quotes.get(ticker);
    const price = quote?.price;
    if (price == null || !Number.isFinite(price)) {
      unpriced.push(ticker);
      return [];
    }
    const shares = Number(position.shares) || 0;
    return [
      {
        ticker,
        value: shares * price,
        dayChange: shares * (quote?.day_change ?? 0),
        isFund: isFund({ ...position, ...quote, shares }),
      },
    ];
  });
  const holdingsValue = priced.reduce((sum, row) => sum + row.value, 0);
  const total = holdingsValue + cash;
  return {
    id: portfolio.id,
    name: portfolio.name,
    currency: portfolio.base_currency ?? "USD",
    holdingsValue,
    cash,
    total,
    dayChange: priced.reduce((sum, row) => sum + row.dayChange, 0),
    unpriced,
    holdings: priced.map(({ ticker, value, isFund }) => ({
      ticker,
      value,
      weight: total ? value / total : 0,
      isFund,
    })),
  };
}

export type AttentionItem =
  | { kind: "position"; portfolio: string; ticker: string; weight: number; limit: number; excess: number }
  | { kind: "cash"; portfolio: string; share: number; target: number; missing: number };

/**
 * The portfolio's own limits that are broken today: a single company above its maximum
 * position, or cash below its target. Funds are spread over many companies, so they are
 * not held to the single-position limit.
 */
export function attentionItems(
  snapshots: PortfolioSnapshot[],
  portfolios: Portfolio[],
  book: { max_position_pct: number; min_cash_pct?: number },
): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const snapshot of snapshots) {
    if (!snapshot.total) continue;
    const portfolio = portfolios.find((item) => item.id === snapshot.id);
    const limit = portfolio?.max_position_pct ?? book.max_position_pct;
    for (const holding of snapshot.holdings) {
      if (!holding.isFund && holding.weight > limit) {
        items.push({
          kind: "position",
          portfolio: snapshot.name,
          ticker: holding.ticker,
          weight: holding.weight,
          limit,
          excess: holding.value - limit * snapshot.total,
        });
      }
    }
    const target = cashTarget(portfolio?.min_cash_pct, book.min_cash_pct);
    const missing = cashShortfall(snapshot.cash, snapshot.total, target);
    if (missing > 0.005) {
      items.push({
        kind: "cash",
        portfolio: snapshot.name,
        share: snapshot.cash / snapshot.total,
        target,
        missing,
      });
    }
  }
  return items;
}

const QUARTER_DAYS = 91;

function addDays(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type ExpectedReport = { ticker: string; expected: string; lastReport: string };

/**
 * Companies report every quarter, so the next report is expected about 91 days after the
 * last one on file. Only companies (not funds) expected within `withinDays` are listed.
 */
export function upcomingReports(portfolios: Portfolio[], today: string, withinDays = 30): ExpectedReport[] {
  const horizon = addDays(today, withinDays);
  const seen = new Map<string, ExpectedReport>();
  for (const portfolio of portfolios) {
    for (const position of portfolio.portfolio_positions) {
      const ticker = position.ticker.trim().toUpperCase();
      const last = position.report_date;
      if (!last || isFund(position) || seen.has(ticker)) continue;
      let expected = addDays(last, QUARTER_DAYS);
      // A report that is late still counts for a week; after that, look at the next quarter.
      while (expected < addDays(today, -7)) expected = addDays(expected, QUARTER_DAYS);
      if (expected <= horizon) seen.set(ticker, { ticker, expected, lastReport: last });
    }
  }
  return [...seen.values()].sort((a, b) => a.expected.localeCompare(b.expected));
}

export type NetWorthPoint = {
  day: string;
  investments: number;
  savings: number;
  other_assets: number;
  total: number;
  currency?: string;
};

/** The change since the reading before today, or null without one. */
export function changeSinceLast(points: NetWorthPoint[], today: string, total: number) {
  const before = [...points].reverse().find((point) => point.day < today);
  if (!before) return null;
  return { amount: total - Number(before.total), since: before.day };
}

export type SetupStep = { key: "plan" | "portfolio" | "assets"; done: boolean };

/** The three steps that make the app useful; shown until all are done or skipped. */
export function setupSteps({
  hasEntries,
  hasPortfolio,
  hasAssets,
}: {
  hasEntries: boolean;
  hasPortfolio: boolean;
  hasAssets: boolean;
}): SetupStep[] {
  return [
    { key: "plan", done: hasEntries },
    { key: "portfolio", done: hasPortfolio },
    { key: "assets", done: hasAssets },
  ];
}
