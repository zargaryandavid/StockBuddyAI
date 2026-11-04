import type { Quote } from "@/lib/today";

export type AllocationItem = {
  label: string;
  /** Market symbol; empty for something without one, such as a local bond or a deposit. */
  ticker: string;
  /** The name typed for an item without a symbol. */
  name: string;
  /** The value is a share of the budget (percent) or an amount in the plan's currency. */
  mode: "pct" | "amount";
  value: number;
  /** Used without a symbol, e.g. a bond's coupon. */
  expected_return_pct: number | null;
};

export type AllocationPlan = { budget: number; currency: string; items: AllocationItem[] };

export type AllocationRow = {
  item: AllocationItem;
  /** Amount in the plan's currency. */
  amount: number;
  /** Share of the budget, 0–100. */
  pct: number;
  /** Amount in US dollars; null without an exchange rate. */
  usd: number | null;
  /** Price of one share in US dollars; null without a symbol or quote. */
  price: number | null;
  /** Shares the amount buys: exact, and whole ones you can actually buy. */
  shares: number | null;
  wholeShares: number | null;
  /** Price change over the last year, month and six months (percent); null when unknown. */
  return1y: number | null;
  return1m: number | null;
  return6m: number | null;
  /** What the row's return figure is based on. */
  returnSource: "market" | "typed" | null;
  name: string | null;
  fund: boolean;
};

export type AllocationSummary = {
  rows: AllocationRow[];
  /** Amount and share of the budget given out. */
  allocated: number;
  allocatedPct: number;
  /** Budget not given out yet; negative when the rows add up to more than the budget. */
  left: number;
  usd: number | null;
  /** Average last-year move, weighted by amount, over rows with a figure. */
  weightedReturn: number | null;
};

/**
 * Works out a future allocation: each row's amount and share of the budget, the shares it
 * buys at today's price, and the last year's move. `usdPerUnit` is US dollars per one unit of
 * the plan's currency (1 for USD); quotes are priced in US dollars.
 */
export function allocationSummary(plan: AllocationPlan, quotes: Map<string, Quote>, usdPerUnit: number | null): AllocationSummary {
  const budget = Math.max(0, Number(plan.budget) || 0);
  const rows: AllocationRow[] = plan.items.map((item) => {
    const value = Math.max(0, Number(item.value) || 0);
    const amount = item.mode === "pct" ? (budget * value) / 100 : value;
    const pct = budget > 0 ? (amount / budget) * 100 : 0;
    const usd = usdPerUnit == null ? null : amount * usdPerUnit;
    const quote = item.ticker ? quotes.get(item.ticker.toUpperCase()) : undefined;
    const price = quote?.price != null && quote.price > 0 ? quote.price : null;
    const shares = price != null && usd != null ? usd / price : null;
    const typed = item.expected_return_pct;
    const market = quote?.growth_1y ?? null;
    const return1y = item.ticker ? market : typed;
    return {
      item,
      amount,
      pct,
      usd,
      price,
      shares,
      wholeShares: shares == null ? null : Math.floor(shares + 1e-9),
      return1y,
      return1m: quote?.growth_1m ?? null,
      return6m: quote?.growth_6m ?? null,
      returnSource: item.ticker ? (market == null ? null : "market") : typed == null ? null : "typed",
      name: item.ticker ? (quote?.company_name ?? quote?.name ?? null) : item.name || null,
      fund: Boolean(quote?.is_etf_index),
    };
  });
  const allocated = rows.reduce((sum, row) => sum + row.amount, 0);
  const weighted = rows.filter((row) => row.return1y != null && row.amount > 0);
  const weight = weighted.reduce((sum, row) => sum + row.amount, 0);
  return {
    rows,
    allocated,
    allocatedPct: budget > 0 ? (allocated / budget) * 100 : 0,
    left: budget - allocated,
    usd: usdPerUnit == null ? null : allocated * usdPerUnit,
    weightedReturn: weight > 0 ? weighted.reduce((sum, row) => sum + (row.return1y as number) * row.amount, 0) / weight : null,
  };
}
