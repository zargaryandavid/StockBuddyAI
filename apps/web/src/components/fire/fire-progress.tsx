"use client";

import { Pencil } from "lucide-react";

import { fireTiming, monthYearLabel } from "@/lib/age";
import { fireProgress } from "@/lib/fire-views";
import { money } from "@/lib/portfolio-metrics";

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
  const progress = fireProgress(currentAssets, fireTarget);
  const timing = fireTiming(dateOfBirth, today, hitMonth);
  const width = progress.percent == null ? 0 : Math.min(100, progress.percent);
  return (
    <section className="panel fire-progress" aria-labelledby="fire-progress-title">
      <div className="fire-progress-main">
        <h2 id="fire-progress-title">FIRE progress</h2>
        {progress.percent == null ? (
          <p className="muted">Add expenses or a retirement spending amount to set a FIRE target.</p>
        ) : (
          <>
            <p className="fire-progress-percent">
              <strong>{progress.percent.toFixed(1)}%</strong> funded
            </p>
            <div
              className="fire-progress-bar"
              role="progressbar"
              aria-label="FIRE target funded"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(width * 10) / 10}
            >
              <span style={{ width: `${width}%` }} />
            </div>
            <p className="fire-progress-amounts">
              <span>
                {money(currentAssets, currency)} of {money(fireTarget, currency)}
              </span>
              <strong>{money(progress.remaining, currency)} remaining</strong>
            </p>
          </>
        )}
      </div>
      <dl className="fire-progress-timing">
        {timing.currentAge != null && (
          <div>
            <dt>Current age</dt>
            <dd className="fire-progress-age">
              {timing.currentAge}
              {onEditProfile && (
                <button
                  type="button"
                  className="fire-age-edit"
                  aria-label="Edit date of birth"
                  title="Edit date of birth"
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
            <dt>Estimated FIRE age</dt>
            <dd>{timing.fireAge}</dd>
          </div>
        )}
        <div>
          <dt>Estimated FIRE date</dt>
          <dd>
            {timing.fireDate
              ? hitMonth === 0
                ? "Reached"
                : monthYearLabel(timing.fireDate)
              : progress.percent == null
                ? "—"
                : "Not within 50 years"}
          </dd>
        </div>
        {dateOfBirth == null && onEditProfile && (
          <button type="button" className="fire-progress-dob" onClick={onEditProfile}>
            Add your date of birth to see ages
          </button>
        )}
      </dl>
    </section>
  );
}
