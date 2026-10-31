"use client";

import type { Portfolio } from "@/lib/api";
import { buildPlan, yearsLabel, type FireSettings } from "@/lib/fire";
import { useT } from "@/lib/i18n/client";
import { money, signedMoney } from "@/lib/portfolio-metrics";
import { holdingTiles, portfolioSnapshot, todayMovers, type Quote } from "@/lib/today";
import { HoldingsHeatmap } from "@/components/today/holdings-heatmap";
import { NetWorthChart } from "@/components/today/net-worth-chart";
import { TodayMovers } from "@/components/today/today-sections";

import { Tile } from "./shared-portfolio";
import type { SharedPage } from "./types";

const DEFAULTS: FireSettings = {
  expected_return_pct: 7,
  retirement_annual_spend: null,
  monthly_invest: null,
  withdrawal_rate_pct: 4,
  inflation_pct: 3,
};

/** Read-only Today page: net worth, FIRE progress, cash, the holdings heat map, today's moves and history. */
export function SharedTodayView({ page, today }: { page: SharedPage; today: string }) {
  const t = useT();
  const currency = page.currency || "USD";
  const rates = page.rates ?? {};
  // The shared holdings, shaped like the app's own portfolios and quotes so the same math applies.
  const portfolios: Portfolio[] = (page.portfolios ?? []).map((portfolio, index) => ({
    id: `shared-${index}`,
    name: portfolio.name,
    cash: Number(portfolio.cash) || 0,
    other_cash: portfolio.other_cash ?? [],
    base_currency: portfolio.base_currency,
    portfolio_positions: portfolio.positions.map((position) => ({ ticker: position.ticker, shares: Number(position.shares) })),
  })) as Portfolio[];
  const quotes = new Map<string, Quote>();
  for (const portfolio of page.portfolios ?? []) {
    for (const position of portfolio.positions) {
      quotes.set(position.ticker.trim().toUpperCase(), {
        ticker: position.ticker,
        company_name: position.name,
        price: position.price,
        day_change: position.day_change ?? null,
        day_change_percent: position.day_change_percent,
        price_date: position.price_date ?? null,
        sector: position.sector,
        asset_type: (position.asset_type ?? undefined) as Quote["asset_type"],
        is_etf_index: position.is_etf_index,
      });
    }
  }

  const snapshots = portfolios.map((portfolio) => portfolioSnapshot(portfolio, quotes, rates));
  const investments = snapshots.reduce((sum, snapshot) => sum + snapshot.total, 0);
  const cash = snapshots.reduce((sum, snapshot) => sum + snapshot.cash, 0);
  const dayChange = snapshots.reduce((sum, snapshot) => sum + snapshot.dayChange, 0);
  const plan = buildPlan({
    entries: page.entries ?? [],
    assets: page.assets ?? [],
    settings: { ...DEFAULTS, ...(page.settings ?? {}) },
    portfolioValue: investments,
    today,
    rates,
    baseCurrency: currency,
  });
  const otherAssets = plan.heldAssets.reduce((sum, item) => sum + item.value, 0);
  const netWorth = investments + plan.savingsBalances + plan.bondBalances + otherAssets;
  const progress = plan.fireNumber ? Math.min(1, plan.currentAssets / plan.fireNumber) : null;
  const m = (value: number) => money(value, currency);

  return (
    <div className="shared-today">
      <div className="share-tiles">
        <Tile
          label={t("Net worth")}
          value={m(netWorth)}
          note={t("Markets today: {amount}", { amount: signedMoney(dayChange, currency) })}
          tone={dayChange >= 0 ? "up" : "down"}
        />
        <Tile
          label={t("FIRE progress")}
          value={progress == null ? "—" : `${(progress * 100).toFixed(1)}%`}
          note={
            plan.fireNumber
              ? t("{assets} of {target} · {years}", {
                  assets: m(plan.currentAssets),
                  target: m(plan.fireNumber),
                  years: yearsLabel(plan.hitMonth, t),
                })
              : undefined
          }
        />
        <Tile label={t("Cash")} value={m(cash)} note={investments ? t("{share} of the portfolios", { share: `${((cash / investments) * 100).toFixed(1)}%` }) : undefined} />
      </div>
      {portfolios.some((portfolio) => portfolio.portfolio_positions.length > 0) && (
        <HoldingsHeatmap tiles={holdingTiles(portfolios, quotes)} currency={currency} hidden={false} />
      )}
      <div className="today-columns shared-today-columns">
        <TodayMovers
          movers={todayMovers(portfolios, quotes)}
          dayChange={dayChange}
          holdingsValue={investments - cash}
          currency={currency}
          today={today}
        />
        <article className="panel today-chart">
          <div className="today-section-heading">
            <h2>{t("Net worth over time")}</h2>
          </div>
          <NetWorthChart points={page.history ?? []} current={{ day: today, total: netWorth }} currency={currency} today={today} />
        </article>
      </div>
    </div>
  );
}
