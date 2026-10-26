"use client";

import { ProjectionChart } from "@/components/fire/projection-chart";
import { monthYearLabel } from "@/lib/age";
import {
  FREQUENCIES,
  assetTypeFor,
  buildPlan,
  categoryFor,
  monthlyAmount,
  type FireEntry,
  type FireSettings,
} from "@/lib/fire";
import { fireProgress } from "@/lib/fire-views";
import type { Translate } from "@/lib/i18n/core";
import { useT } from "@/lib/i18n/client";
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

/** Time until FIRE, like `yearsLabel` in the app, with each form as a whole translatable phrase. */
function timeToFire(hitMonth: number | null, t: Translate) {
  if (hitMonth == null) return t("50+ years");
  if (hitMonth === 0) return t("Reached");
  const years = Math.floor(hitMonth / 12);
  const months = hitMonth % 12;
  if (years === 0) return t("{months} mo", { months });
  if (!months) return years === 1 ? t("{years} yr", { years }) : t("{years} yrs", { years });
  return years === 1 ? t("{years} yr {months} mo", { years, months }) : t("{years} yrs {months} mo", { years, months });
}

/** Read-only FIRE plan built with the same math as the app. */
export function SharedFireView({ page, today }: { page: SharedPage; today: string }) {
  const t = useT();
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
      <section className="share-tiles" aria-label={t("FIRE summary")}>
        <Tile label={t("Monthly income")} value={money(plan.monthlyIncome, currency)} tone="up" />
        <Tile label={t("Monthly expenses")} value={money(plan.monthlyExpenses, currency)} tone="down" />
        <Tile label={t("Savings rate")} value={plan.savingsRate == null ? "—" : `${(plan.savingsRate * 100).toFixed(1)}%`} />
        <Tile label={t("Current assets")} value={money(plan.currentAssets, currency)} note={t("Portfolio + savings")} />
        <Tile
          label={t("FIRE number")}
          value={money(plan.fireNumber, currency)}
          note={t("{multiple}× yearly spending", {
            multiple: plan.annualSpend ? Math.round(100 / (Number(page.settings?.withdrawal_rate_pct) || 4)) : 25,
          })}
        />
        <Tile
          label={t("Time to FIRE")}
          value={plan.fireNumber ? timeToFire(plan.hitMonth, t) : "—"}
          note={
            fireDate
              ? t("Around {date}", { date: fireDate })
              : progress.percent != null
                ? t("{percent}% funded", { percent: progress.percent.toFixed(1) })
                : undefined
          }
        />
      </section>

      <section className="share-panel" aria-labelledby="share-path-title">
        <h2 id="share-path-title">{t("Path to FIRE")}</h2>
        <ProjectionChart plan={plan} currency={currency} today={today} />
      </section>

      <div className="share-columns">
        {(["income", "expense"] as const).map((kind) => (
          <EntryList key={kind} kind={kind} entries={entries.filter((entry) => entry.kind === kind)} today={today} rates={rates} currency={currency} />
        ))}
      </div>

      {(page.assets?.length ?? 0) > 0 && (
        <section className="share-panel" aria-labelledby="share-assets-title">
          <h2 id="share-assets-title">{t("Assets · {count}", { count: page.assets?.length ?? 0 })}</h2>
          <ul className="share-list">
            {page.assets?.map((asset) => (
              <li key={asset.id}>
                <div>
                  <strong>{asset.name}</strong>
                  <span>
                    {t(assetTypeFor(asset.asset_type).label)}
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
  const t = useT();
  const total = entries.reduce((sum, entry) => sum + monthlyAmount(entry, today, rates, currency), 0);
  return (
    <section className={`share-panel share-entries ${kind}`} aria-labelledby={`share-${kind}-title`}>
      <h2 id={`share-${kind}-title`}>
        {kind === "income"
          ? t("Incomes · {total}/mo", { total: money(total, currency) })
          : t("Expenses · {total}/mo", { total: money(total, currency) })}
      </h2>
      {entries.length === 0 ? (
        <p className="muted">{t("None yet.")}</p>
      ) : (
        <ul className="share-list">
          {entries.map((entry) => (
            <li key={entry.id}>
              <div>
                <strong>{entry.name}</strong>
                <span>
                  {t(categoryFor(entry.kind, entry.category).label)} ·{" "}
                  {t(FREQUENCIES.find((item) => item.key === entry.frequency)?.label ?? entry.frequency)}
                  {entry.ends_on ? ` · ${t("until {date}", { date: entry.ends_on })}` : ""}
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
