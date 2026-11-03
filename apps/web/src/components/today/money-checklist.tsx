"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Circle, Info, ListChecks } from "lucide-react";

import type { BabyStep } from "@/lib/baby-steps";
import { useT } from "@/lib/i18n/client";
import { money } from "@/lib/portfolio-metrics";
import { HIDDEN_AMOUNT } from "@/lib/privacy";

import type { FireStart } from "@/components/fire/fire-dashboard";

import type { TodayDestination } from "./today-page";

/** The baby steps to financial freedom, ticked off from what the person has entered. */
export function MoneyChecklist({
  steps,
  currency,
  hidden,
  onOpen,
}: {
  /** Null while loading. */
  steps: BabyStep[] | null;
  currency: string;
  hidden: boolean;
  onOpen: (destination: TodayDestination, account?: FireStart) => void;
}) {
  const t = useT();
  const [rothInfo, setRothInfo] = useState(false);
  const m = (value: number) => (hidden ? HIDDEN_AMOUNT : money(value, currency));
  const whole = (value: number) => (hidden ? HIDDEN_AMOUNT : money(Math.round(value), currency).replace(/\.00$/, ""));
  // IRS limits are public, so they show even while the person's own amounts are hidden.
  const limit = (value: number) => money(value, "USD").replace(/\.00$/, "");
  const done = steps?.filter((step) => step.done).length ?? 0;

  return (
    <article className="panel money-checklist" aria-labelledby="checklist-title">
      <div className="checklist-heading">
        <div>
          <h2 id="checklist-title">
            <ListChecks size={17} aria-hidden="true" />
            {t("Your money to-do list")}
          </h2>
          <p className="muted">{t("The baby steps to financial freedom, ticked off from what you've entered.")}</p>
        </div>
        {steps && (
          <span className="checklist-count">
            <strong>{t("{done} of {total} done", { done, total: steps.length })}</strong>
            <span className="today-progress" aria-hidden="true">
              <span style={{ width: `${(done / steps.length) * 100}%` }} />
            </span>
          </span>
        )}
      </div>

      {!steps ? null : (
        <ol className="checklist-steps">
          {steps.map((step, index) => {
            const Mark = step.done ? CheckCircle2 : Circle;
            let title = "";
            let hint = "";
            let meta = "";
            let action: { label: string; go: () => void } | null = null;
            if (step.key === "emergency") {
              title = t("Emergency fund");
              hint =
                step.month > 0
                  ? t("{months} months saved · aim for {low}–{high} (3–6 months of expenses + 30%)", {
                      months: step.months.toFixed(1),
                      low: whole(step.month * 3),
                      high: whole(step.month * 6),
                    })
                  : t("3–6 months of your expenses + 30%, in savings accounts or CDs. Add your expenses in FIRE first.");
              meta = m(step.have);
              action = step.done ? null : { label: t("Add savings in FIRE"), go: () => onOpen("fire") };
            } else if (step.key === "roth") {
              title = t("Roth IRA");
              const over = step.contributions > step.limit + 0.005;
              hint = [
                t("Put in up to {limit} for {year} ({older} if you're 50 or older), from your pay. It grows and comes out tax-free in retirement.", {
                  limit: limit(step.base),
                  older: limit(step.older),
                  year: step.year,
                }),
                step.accounts ? t("Balance {amount}.", { amount: m(step.have) }) : "",
                over ? t("You plan more than the limit; the IRS charges 6% a year on the extra.") : "",
              ]
                .filter(Boolean)
                .join(" ");
              meta = step.contributions || step.accounts ? `${m(step.contributions)} / ${limit(step.limit)}` : t("No account yet");
              action = !step.accounts
                ? { label: t("Add your Roth IRA"), go: () => onOpen("fire", "roth_ira") }
                : step.done
                  ? null
                  : { label: t("Add a contribution"), go: () => onOpen("fire", "roth_contribution") };
            } else if (step.key === "invest") {
              title = t("Stocks and bonds");
              hint = t("Stocks {stocks} · Bonds {bonds}", {
                stocks: step.stocks ? m(step.stocks) : t("none"),
                bonds: step.bonds ? m(step.bonds) : t("none"),
              });
              meta = step.stocks + step.bonds ? m(step.stocks + step.bonds) : t("none");
              action = step.done
                ? null
                : step.stocks
                  ? { label: t("Add bonds in FIRE"), go: () => onOpen("fire") }
                  : { label: t("Open Portfolio"), go: () => onOpen("portfolio") };
            } else {
              title = t("529 education account");
              hint = t("Tax-advantaged savings for a child's education.");
              meta = step.accounts ? m(step.have) : t("No account yet");
              action = step.accounts ? null : { label: t("Add a 529 account"), go: () => onOpen("fire", "college_529") };
            }
            if (!step.done && !action) action = { label: t("Update in FIRE"), go: () => onOpen("fire") };
            return (
              <li key={step.key} className={step.done ? "done" : ""}>
                <Mark size={22} aria-hidden="true" className="checklist-mark" />
                <div className="checklist-text">
                  <strong>
                    {index + 1}. {title}
                    <span className="sr-only">{step.done ? t("Done") : t("Not done yet")}</span>
                    {step.key === "roth" && (
                      <button
                        type="button"
                        className="today-info-button checklist-info"
                        aria-label={t("About the Roth IRA")}
                        aria-expanded={rothInfo}
                        onClick={() => setRothInfo((open) => !open)}
                      >
                        <Info size={14} aria-hidden="true" />
                      </button>
                    )}
                  </strong>
                  <small className="muted">{hint}</small>
                  {step.key === "roth" && rothInfo && (
                    <div className="checklist-more" role="note">
                      <p>{t("A Roth IRA is a retirement account you fill with money you've already paid tax on. In return, it grows tax-free, and in retirement everything comes out tax-free.")}</p>
                      <ul>
                        <li>{t("You can take out what you put in at any time, tax- and penalty-free. Earnings are tax-free after age 59½ once the account is 5 years old.")}</li>
                        <li>{t("For 2026 you can contribute if your income is under $153,000 (single) or $242,000 (married filing jointly); the amount shrinks to zero at $168,000 or $252,000.")}</li>
                        <li>{t("You have until the tax deadline, around April 15 of the next year, to put money in for this year.")}</li>
                        <li>{t("Open one at any broker (Fidelity, Schwab, Vanguard…), then add it in FIRE → Add income → Roth IRA with its balance.")}</li>
                        <li>{t("Then add what you put in from pay as a Roth IRA contribution expense, as an amount or a % of your salary. It leaves your paycheck like an expense, but in your FIRE plan it keeps growing in the Roth instead of being spent.")}</li>
                      </ul>
                      <p className="muted">{t("A summary of IRS rules, not tax advice. Check with a tax professional for your situation.")}</p>
                    </div>
                  )}
                </div>
                <span className="checklist-meta">{meta}</span>
                {action ? (
                  <button type="button" className="text-button checklist-action" onClick={action.go}>
                    {action.label}
                    <ArrowRight size={13} aria-hidden="true" />
                  </button>
                ) : (
                  <span className="checklist-action done-label">{t("Done")}</span>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </article>
  );
}
