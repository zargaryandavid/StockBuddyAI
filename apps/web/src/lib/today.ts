import type { Portfolio } from "@/lib/api";
import { cashShortfall, cashTarget, isFund } from "@/lib/analytics";
import { occurrences, toBase, type FireEntry, type FxRates } from "@/lib/fire";
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

export type Mover = {
  ticker: string;
  name: string | null;
  /** Price move of one share today, in the portfolio's currency. */
  change: number;
  /** Price move today, in percent (2.5 means +2.5%). */
  pct: number;
  /** What the move means for all the shares held, across portfolios. */
  impact: number;
  /** Price of one share now. */
  price: number | null;
  /** Shares held, across portfolios. */
  shares: number;
  /** What those shares are worth now. */
  value: number | null;
  /** The trading day the prices are from. */
  priceDate: string | null;
};

/**
 * The holdings that moved most today, biggest first: up to `limit` that rose and up to
 * `limit` that fell, ranked by percent. A ticker held in several portfolios counts once.
 */
export function todayMovers(
  portfolios: Portfolio[],
  quotes: Map<string, Quote>,
  limit = 3,
): { up: Mover[]; down: Mover[] } {
  const shares = new Map<string, number>();
  for (const portfolio of portfolios) {
    for (const position of portfolio.portfolio_positions) {
      const ticker = position.ticker.trim().toUpperCase();
      if (ticker) shares.set(ticker, (shares.get(ticker) ?? 0) + (Number(position.shares) || 0));
    }
  }
  const movers: Mover[] = [];
  for (const [ticker, held] of shares) {
    const quote = quotes.get(ticker);
    const change = quote?.day_change;
    const pct = quote?.day_change_percent;
    if (change == null || pct == null || !Number.isFinite(change) || !Number.isFinite(pct) || held <= 0) continue;
    movers.push({
      ticker,
      name: quote?.company_name ?? quote?.name ?? null,
      change,
      pct,
      impact: change * held,
      price: quote?.price ?? null,
      shares: held,
      value: quote?.price == null ? null : quote.price * held,
      priceDate: quote?.price_date ?? null,
    });
  }
  return {
    up: movers.filter((item) => item.pct > 0).sort((a, b) => b.pct - a.pct).slice(0, limit),
    down: movers.filter((item) => item.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, limit),
  };
}

export type CashFlowDay = {
  date: string;
  kind: "income" | "expense";
  name: string;
  amount: number;
  currency: string;
  /** In the base currency; null when no exchange rate is known yet. */
  baseAmount: number | null;
};

/** FIRE income and expenses that fall between `from` and `to` (inclusive), by date. */
export function cashFlowsBetween(
  entries: FireEntry[],
  from: string,
  to: string,
  rates: FxRates = {},
  baseCurrency = "USD",
): CashFlowDay[] {
  const flows: CashFlowDay[] = [];
  for (const entry of entries) {
    for (const date of occurrences(entry, from, to)) {
      const amount = Number(entry.amount) || 0;
      flows.push({
        date,
        kind: entry.kind,
        name: entry.name,
        amount,
        currency: entry.currency,
        baseAmount: toBase(amount, entry.currency, rates, baseCurrency),
      });
    }
  }
  return flows.sort(
    (a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || b.amount - a.amount,
  );
}

export type HoldingTile = {
  ticker: string;
  name: string | null;
  sector: string;
  /** What the shares are worth now, across portfolios. */
  value: number;
  /** Today's price move in percent; null when unknown. */
  pct: number | null;
  /** Today's gain or loss on the shares held. */
  impact: number | null;
};

function knownSector(sector: string | null | undefined) {
  const name = sector?.trim();
  return !name || name === "Unknown" || name === "Not Applicable" ? "Other" : name;
}

/** Every priced holding with its value, sector and today's move, for the heat map. */
export function holdingTiles(portfolios: Portfolio[], quotes: Map<string, Quote>): HoldingTile[] {
  const shares = new Map<string, number>();
  for (const portfolio of portfolios) {
    for (const position of portfolio.portfolio_positions) {
      const ticker = position.ticker.trim().toUpperCase();
      if (ticker) shares.set(ticker, (shares.get(ticker) ?? 0) + (Number(position.shares) || 0));
    }
  }
  const tiles: HoldingTile[] = [];
  for (const [ticker, held] of shares) {
    const quote = quotes.get(ticker);
    const price = quote?.price;
    if (price == null || !Number.isFinite(price) || held <= 0) continue;
    const pct = quote?.day_change_percent;
    const change = quote?.day_change;
    tiles.push({
      ticker,
      name: quote?.company_name ?? quote?.name ?? null,
      sector: quote && isFund({ ...quote, shares: held }) ? "Funds" : knownSector(quote?.sector),
      value: price * held,
      pct: pct != null && Number.isFinite(pct) ? pct : null,
      impact: change != null && Number.isFinite(change) ? change * held : null,
    });
  }
  return tiles.sort((a, b) => b.value - a.value);
}
