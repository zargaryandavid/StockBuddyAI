import type { FireAsset, FireEntry, FireSettings, FxRates } from "@/lib/fire";
import type { NetWorthPoint } from "@/lib/today";

export type SharedHolding = {
  ticker: string;
  name: string | null;
  shares: number;
  purchase_price: number | null;
  price: number | null;
  /** Today's move of one share, in the portfolio's currency (newer links only). */
  day_change?: number | null;
  day_change_percent: number | null;
  price_date?: string | null;
  sector: string | null;
  asset_type: string | null;
  is_etf_index?: boolean;
};

export type SharedPortfolio = {
  name: string;
  cash: number;
  other_cash?: { currency: string; amount: number }[];
  base_currency: string;
  benchmark: string | null;
  positions: SharedHolding[];
};

/** What the public share endpoint returns for a link. */
export type SharedPage = {
  kind: "fire" | "portfolio" | "today";
  owner_name: string | null;
  generated_at: string;
  portfolio: SharedPortfolio | null;
  entries?: FireEntry[];
  settings?: Partial<FireSettings>;
  assets?: FireAsset[];
  currency?: string;
  rates?: FxRates;
  /** Today links: every portfolio, and the daily net worth readings. */
  portfolios?: SharedPortfolio[];
  history?: NetWorthPoint[];
};

/** Market value of the holdings plus cash, in the portfolio's base currency. */
export function portfolioTotals(portfolio: SharedPortfolio | null) {
  if (!portfolio) return { holdings: 0, cash: 0, total: 0, cost: 0 };
  const holdings = portfolio.positions.reduce(
    (sum, position) => sum + (position.price == null ? 0 : position.price * Number(position.shares)),
    0,
  );
  const cost = portfolio.positions.reduce(
    (sum, position) =>
      sum + (position.purchase_price == null || position.price == null ? 0 : position.purchase_price * Number(position.shares)),
    0,
  );
  const cash = Number(portfolio.cash) || 0;
  return { holdings, cash, total: holdings + cash, cost };
}
