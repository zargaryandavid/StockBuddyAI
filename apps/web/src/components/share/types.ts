import type { FireAsset, FireEntry, FireSettings, FxRates } from "@/lib/fire";

export type SharedHolding = {
  ticker: string;
  name: string | null;
  shares: number;
  purchase_price: number | null;
  price: number | null;
  day_change_percent: number | null;
  sector: string | null;
  asset_type: string | null;
};

export type SharedPortfolio = {
  name: string;
  cash: number;
  base_currency: string;
  benchmark: string | null;
  positions: SharedHolding[];
};

/** What the public share endpoint returns for a link. */
export type SharedPage = {
  kind: "fire" | "portfolio";
  owner_name: string | null;
  generated_at: string;
  portfolio: SharedPortfolio | null;
  entries?: FireEntry[];
  settings?: Partial<FireSettings>;
  assets?: FireAsset[];
  currency?: string;
  rates?: FxRates;
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
