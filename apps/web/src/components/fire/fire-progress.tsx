"use client";

import { Pencil } from "lucide-react";

import { fireTiming } from "@/lib/age";
import { fireProgress } from "@/lib/fire-views";
import { useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/core";
import { money } from "@/lib/portfolio-metrics";
import { AnimatedNumber } from "@/components/animated-number";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "November 2039" in the reader's language. */
function monthYear(date: string, t: Translate) {
  return t("{month} {year}", { month: t(MONTHS[Number(date.slice(5, 7)) - 1]), year: date.slice(0, 4) });
}

/** How much of the FIRE target is funded, what is left, and when (and at what age) it lands. */
export function FireProgressPanel({
  currentAssets,
  fireTarget,
  hitMonth,
  today,
  dateOfBirth,
  currency,
  onEditProfile,
}: {
  currentAssets: number;
  fireTarget: number;
  hitMonth: number | null;
  today: string;
  dateOfBirth: string | null;
  currency: string;
  onEditProfile?: () => void;
}) {
  const t = useT();
  const progress = fireProgress(currentAssets, fireTarget);
  const timing = fireTiming(dateOfBirth, today, hitMonth);
  const width = progress.percent == null ? 0 : Math.min(100, progress.percent);
  return (
    <section className="panel fire-progress" aria-labelledby="fire-progress-title">
      <div className="fire-progress-main">
        <h2 id="fire-progress-title">{t("FIRE progress")}</h2>
        {progress.percent == null ? (
          <p className="muted">{t("Add expenses or a retirement spending amount to set a FIRE target.")}</p>
        ) : (
          <>
            <p className="fire-progress-percent">
              <strong>
                <AnimatedNumber value={progress.percent} format={(n) => `${n.toFixed(1)}%`} />
              </strong>{" "}
              {t("funded")}
            </p>
            <div
              className="fire-progress-bar"
              role="progressbar"
              aria-label={t("FIRE target funded")}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(width * 10) / 10}
            >
              <span style={{ width: `${width}%` }} />
            </div>
            <p className="fire-progress-amounts">
              <span>
                {t("{current} of {target}", {
                  current: money(currentAssets, currency),
                  target: money(fireTarget, currency),
                })}
              </span>
              <strong>{t("{amount} remaining", { amount: money(progress.remaining, currency) })}</strong>
            </p>
          </>
        )}
      </div>
      <dl className="fire-progress-timing">
        {timing.currentAge != null && (
          <div>
            <dt>{t("Current age")}</dt>
            <dd className="fire-progress-age">
              {timing.currentAge}
              {onEditProfile && (
                <button
                  type="button"
                  className="fire-age-edit"
                  aria-label={t("Edit date of birth")}
                  title={t("Edit date of birth")}
                  onClick={onEditProfile}
                >
                  <Pencil size={14} aria-hidden="true" />
                </button>
              )}
            </dd>
          </div>
        )}
        {timing.fireAge != null && (
          <div>
            <dt>{t("Estimated FIRE age")}</dt>
            <dd>{timing.fireAge}</dd>
          </div>
        )}
        <div>
          <dt>{t("Estimated FIRE date")}</dt>
          <dd>
            {timing.fireDate
              ? hitMonth === 0
                ? t("Reached")
                : monthYear(timing.fireDate, t)
              : progress.percent == null
                ? "—"
                : t("Not within 50 years")}
          </dd>
        </div>
        {dateOfBirth == null && onEditProfile && (
          <button type="button" className="fire-progress-dob" onClick={onEditProfile}>
            {t("Add your date of birth to see ages")}
          </button>
        )}
      </dl>
    </section>
  );
}
