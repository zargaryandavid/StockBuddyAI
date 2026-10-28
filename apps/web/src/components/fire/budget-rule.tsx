"use client";

import { InfoPopover } from "@/components/info-popover";
import type { BudgetSplit } from "@/lib/fire";
import { useT } from "@/lib/i18n/client";
import { money } from "@/lib/portfolio-metrics";

const ROWS = [
  { key: "needs", label: "Needs", share: 50, hint: "Rent, bills, food, transport, insurance, health, loans, taxes" },
  { key: "wants", label: "Wants", share: 30, hint: "Shopping, travel, fun and other" },
  { key: "savings", label: "Saving and investing", share: 20, hint: "Saving and investment expenses, plus what is left over" },
] as const;

/** 50/30/20: what your income would ideally go to, next to what your plan spends. */
export function BudgetRule({ split, currency }: { split: BudgetSplit; currency: string }) {
  const t = useT();
  const m = (value: number) => money(value, currency);
  return (
    <section className="panel budget-rule" aria-labelledby="budget-rule-title">
      <div className="budget-rule-head">
        <h2 id="budget-rule-title">
          {t("50/30/20 budget")}
          <InfoPopover label={t("About the 50/30/20 rule")} align="left">
            <strong>{t("The 50/30/20 rule")}</strong>
            <span>
              {t(
                "Spend about half of what you earn on needs, up to 30% on wants, and put at least 20% into saving and investing. It is a simple starting point; raising the 20% gets you to financial freedom sooner.",
              )}
            </span>
          </InfoPopover>
        </h2>
        <p className="muted">
          {split.income > 0
            ? t("Based on your income of {amount} a month.", { amount: m(split.income) })
            : t("Add your income in FIRE to see your budget.")}
        </p>
      </div>
      {split.income > 0 && (
        <ul className="budget-rows">
          {ROWS.map((row) => {
            const ideal = split.ideal[row.key];
            const actual = split.actual[row.key];
            const share = split.income ? actual / split.income : 0;
            // Savings should reach the ideal; needs and wants should stay under it.
            const ok = row.key === "savings" ? actual >= ideal - 0.5 : actual <= ideal + 0.5;
            return (
              <li key={row.key} className={`budget-row budget-${row.key}`}>
                <div className="budget-row-title">
                  <strong>
                    {t(row.label)} <span className="muted">{row.share}%</span>
                  </strong>
                  <span className="muted">{t(row.hint)}</span>
                </div>
                <div className="budget-bar" aria-hidden="true">
                  <span className="budget-bar-actual" style={{ width: `${Math.min(100, share * 100)}%` }} />
                  <span className="budget-bar-ideal" style={{ left: `${row.share}%` }} />
                </div>
                <div className="budget-row-numbers">
                  <span>{t("Ideal {amount}", { amount: m(ideal) })}</span>
                  <span className={ok ? "positive" : "negative"}>
                    {t("Yours {amount} ({share}%)", { amount: m(actual), share: (share * 100).toFixed(0) })}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
