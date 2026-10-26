"use client";

import { ProjectionChart } from "@/components/fire/projection-chart";
import { monthYearLabel } from "@/lib/age";
import {
  FREQUENCIES,
  assetTypeFor,
  buildPlan,
  categoryFor,
  monthlyAmount,
  yearsLabel,
  type FireEntry,
  type FireSettings,
} from "@/lib/fire";
import { fireProgress } from "@/lib/fire-views";
import { money } from "@/lib/portfolio-metrics";

import { Tile } from "./shared-portfolio";
import { portfolioTotals, type SharedPage } from "./types";

const DEFAULTS: FireSettings = {
  expected_return_pct: 7,
  retirement_annual_spend: null,
  monthly_invest: null,
  withdrawal_rate_pct: 4,
  inflation_pct: 3,
};

/** Read-only FIRE plan built with the same math as the app. */
export function SharedFireView({ page, today }: { page: SharedPage; today: string }) {
  const currency = page.currency || "USD";
  const rates = page.rates ?? {};
  const entries = page.entries ?? [];
  const totals = portfolioTotals(page.portfolio);
  // The shared data never changes on this page, so the plan is simply worked out once.
  const plan = buildPlan({
    entries,
    assets: page.assets ?? [],
    settings: { ...DEFAULTS, ...(page.settings ?? {}) },
    portfolioValue: totals.total,
    today,
    rates,
    baseCurrency: currency,
  });
  const progress = fireProgress(plan.currentAssets, plan.fireNumber);
  const fireDate =
    plan.hitMonth != null && plan.hitMonth > 0
      ? monthYearLabel(new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1 + plan.hitMonth, 1)).toISOString().slice(0, 10))
      : null;

  return (
    <>
      <section className="share-tiles" aria-label="FIRE summary">
        <Tile label="Monthly income" value={money(plan.monthlyIncome, currency)} tone="up" />
        <Tile label="Monthly expenses" value={money(plan.monthlyExpenses, currency)} tone="down" />
        <Tile label="Savings rate" value={plan.savingsRate == null ? "—" : `${(plan.savingsRate * 100).toFixed(1)}%`} />
        <Tile label="Current assets" value={money(plan.currentAssets, currency)} note="Portfolio + savings" />
        <Tile label="FIRE number" value={money(plan.fireNumber, currency)} note={`${plan.annualSpend ? Math.round(100 / (Number(page.settings?.withdrawal_rate_pct) || 4)) : 25}× yearly spending`} />
        <Tile
          label="Time to FIRE"
          value={plan.fireNumber ? yearsLabel(plan.hitMonth) : "—"}
          note={fireDate ? `Around ${fireDate}` : progress.percent != null ? `${progress.percent.toFixed(1)}% funded` : undefined}
        />
      </section>

      <section className="share-panel" aria-labelledby="share-path-title">
        <h2 id="share-path-title">Path to FIRE</h2>
        <ProjectionChart plan={plan} currency={currency} today={today} />
      </section>

      <div className="share-columns">
        {(["income", "expense"] as const).map((kind) => (
          <EntryList key={kind} kind={kind} entries={entries.filter((entry) => entry.kind === kind)} today={today} rates={rates} currency={currency} />
        ))}
      </div>

      {(page.assets?.length ?? 0) > 0 && (
        <section className="share-panel" aria-labelledby="share-assets-title">
          <h2 id="share-assets-title">Assets · {page.assets?.length}</h2>
          <ul className="share-list">
            {page.assets?.map((asset) => (
              <li key={asset.id}>
                <div>
                  <strong>{asset.name}</strong>
                  <span>
                    {assetTypeFor(asset.asset_type).label}
                    {asset.location ? ` · ${asset.location}` : ""}
                  </span>
                </div>
                <strong>{asset.market_value == null ? "—" : money(Number(asset.market_value), asset.currency)}</strong>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function EntryList({
  kind,
  entries,
  today,
  rates,
  currency,
}: {
  kind: "income" | "expense";
  entries: FireEntry[];
  today: string;
  rates: Record<string, number>;
  currency: string;
}) {
  const title = kind === "income" ? "Incomes" : "Expenses";
  const total = entries.reduce((sum, entry) => sum + monthlyAmount(entry, today, rates, currency), 0);
  return (
    <section className={`share-panel share-entries ${kind}`} aria-labelledby={`share-${kind}-title`}>
      <h2 id={`share-${kind}-title`}>
        {title} · {money(total, currency)}/mo
      </h2>
      {entries.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <ul className="share-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <div>
                <strong>{entry.name}</strong>
                <span>
                  {categoryFor(entry.kind, entry.category).label} ·{" "}
                  {FREQUENCIES.find((item) => item.key === entry.frequency)?.label ?? entry.frequency}
                  {entry.ends_on ? ` · until ${entry.ends_on}` : ""}
                </span>
              </div>
              <strong>
                {kind === "income" ? "+" : "−"}
                {money(Number(entry.amount), entry.currency)}
              </strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
