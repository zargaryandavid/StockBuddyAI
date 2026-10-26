"use client";

import { yearsLabel, type FirePlan } from "@/lib/fire";
import { shortMonthYear } from "@/lib/fire-views";
import { useT } from "@/lib/i18n/client";
import { money } from "@/lib/portfolio-metrics";

function niceStep(max: number, count: number) {
  const raw = max / count;
  const power = Math.pow(10, Math.floor(Math.log10(raw)));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10) * power;
}

const compact = (value: number) =>
  Math.abs(value) >= 1e6
    ? `$${(value / 1e6).toFixed(Math.abs(value) >= 1e7 ? 0 : 1).replace(/\.0$/, "")}M`
    : Math.abs(value) >= 1e3
      ? `$${Math.round(value / 1e3)}k`
      : `$${Math.round(value)}`;

/** Months after the FIRE date the chart keeps going, so the FIRE point sits inside it. */
export const MONTHS_AFTER_FIRE = 24;

/** Months shown: the FIRE month plus two years; 10 years if already there; the horizon if never. */
export function chartMonths(hitMonth: number | null, horizon: number) {
  if (hitMonth == null) return horizon;
  if (hitMonth === 0) return Math.min(120, horizon);
  return Math.min(horizon, hitMonth + MONTHS_AFTER_FIRE);
}

/**
 * Projected assets from today to two years past the estimated FIRE date, in today's
 * dollars, stacked as
 * starting assets, new contributions, and estimated investment growth, with the FIRE
 * target line. Built from the plan's own month-by-month projection.
 */
export function ProjectionChart({
  plan,
  currency,
  today,
}: {
  plan: FirePlan;
  currency: string;
  today: string;
}) {
  const t = useT();
  const width = 640;
  const height = 250;
  const pad = { left: 56, right: 16, top: 16, bottom: 44 };
  const end = Math.min(chartMonths(plan.hitMonth, plan.series.length - 1), plan.series.length - 1);
  const points = plan.series.slice(0, end + 1);
  if (points.length < 2) return null;

  const peak =
    Math.max(
      plan.fireNumber,
      ...points.map((point) => Math.max(point.total, point.startAssets + Math.max(0, point.contributed))),
      1,
    ) * 1.08;
  const plotBottom = height - pad.bottom;
  const x = (month: number) => pad.left + (month / end) * (width - pad.left - pad.right);
  const y = (value: number) =>
    pad.top + (1 - Math.min(1, Math.max(0, value / peak))) * (plotBottom - pad.top);

  // Band edges, clamped so a negative piece (spending more than you earn, or inflation
  // shrinking fixed bonds) draws as an empty band instead of overlapping another.
  const startTop = points.map((point) => Math.max(0, point.startAssets));
  const contribTop = points.map((point, i) => startTop[i] + Math.max(0, point.contributed));
  const totalTop = points.map((point, i) => Math.max(contribTop[i], point.total));
  const band = (lower: number[], upper: number[]) =>
    [
      ...upper.map((value, i) => `${x(points[i].month)},${y(value)}`),
      ...lower
        .map((value, i) => `${x(points[i].month)},${y(value)}`)
        .reverse(),
    ].join(" ");
  const zero = points.map(() => 0);
  const line = points.map((point) => `${x(point.month)},${y(point.total)}`).join(" ");

  const startYear = Number(today.slice(0, 4));
  const startMonth = Number(today.slice(5, 7)) - 1;
  const lastYear = end / 12;
  const yearStep = lastYear <= 12 ? 1 : lastYear <= 25 ? 2 : 5;
  const years = Array.from({ length: Math.floor(lastYear / yearStep) + 1 }, (_, i) => i * yearStep);
  const valueStep = niceStep(peak, 4);
  const values = Array.from({ length: Math.floor(peak / valueStep) + 1 }, (_, i) => i * valueStep);
  const reached = plan.hitMonth != null && plan.hitMonth > 0;
  const hitDate = reached
    ? new Date(Date.UTC(startYear, startMonth + (plan.hitMonth as number), 1))
    : null;
  const hitLabel = hitDate ? shortMonthYear(hitDate, t) : null;
  const timeToFire = yearsLabel(plan.hitMonth, t);
  const hitX = reached ? x(plan.hitMonth as number) : null;
  // Year labels that would sit under the centered FIRE date label are hidden.
  const nearHit = (year: number) => hitX != null && Math.abs(hitX - x(year * 12)) < 40;
  const last = points[points.length - 1];
  const atFire = reached ? points[plan.hitMonth as number] ?? last : last;
  // Short money like "$1.32M" for labels on the chart.
  const short = (value: number) =>
    Math.abs(value) >= 1e6 ? `$${(value / 1e6).toFixed(2)}M` : `$${Math.round(value / 1e3)}k`;

  return (
    <figure className="fire-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={
          plan.hitMonth === 0
            ? t("Projected assets over the next 10 years; the {target} FIRE target is already reached", {
                target: money(plan.fireNumber, currency),
              })
            : hitLabel
              ? t("Projected assets reach {target} in {time}, around {date}", {
                  target: money(plan.fireNumber, currency),
                  time: timeToFire,
                  date: hitLabel,
                })
              : t("Projected assets reach {target} in {time}", {
                  target: money(plan.fireNumber, currency),
                  time: timeToFire,
                })
        }
      >
        {values.map((value) => (
          <g key={`v-${value}`}>
            <line x1={pad.left} x2={width - pad.right} y1={y(value)} y2={y(value)} className="fire-chart-grid" />
            <text x={pad.left - 6} y={y(value) + 4} textAnchor="end" className="fire-chart-label">
              {compact(value)}
            </text>
          </g>
        ))}
        {years.map((year) => (
          <g key={`y-${year}`}>
            <line x1={x(year * 12)} x2={x(year * 12)} y1={pad.top} y2={plotBottom} className="fire-chart-grid" />
            {!nearHit(year) && (
              <>
                <text x={x(year * 12)} y={plotBottom + 15} textAnchor="middle" className="fire-chart-label">
                  {year === 0 ? t("Today") : t("{years}y", { years: year })}
                </text>
                <text x={x(year * 12)} y={plotBottom + 29} textAnchor="middle" className="fire-chart-label year">
                  {startYear + year}
                </text>
              </>
            )}
          </g>
        ))}
        <polygon points={band(zero, startTop)} className="projection-band start" />
        <polygon points={band(startTop, contribTop)} className="projection-band contributions" />
        <polygon points={band(contribTop, totalTop)} className="projection-band growth" />
        <polyline points={line} className="fire-chart-line" />
        {plan.fireNumber > 0 && (
          <>
            <line x1={pad.left} x2={width - pad.right} y1={y(plan.fireNumber)} y2={y(plan.fireNumber)} className="fire-chart-target" />
            {/* Left end: the line rises through the right side once FIRE is reached. */}
            <text x={pad.left + 6} y={y(plan.fireNumber) - 6} textAnchor="start" className="fire-chart-label target strong">
              {t("FIRE target {amount}", { amount: compact(plan.fireNumber) })}
            </text>
          </>
        )}
        {reached && hitX != null && (
          <>
            <line x1={hitX} x2={hitX} y1={y(atFire.total)} y2={plotBottom} className="fire-chart-target" />
            <circle cx={hitX} cy={y(atFire.total)} r={5} className="fire-chart-hit" />
            <text x={hitX - 8} y={y(atFire.total) - 8} textAnchor="end" className="fire-chart-label value">
              {short(atFire.total)}
            </text>
            <text x={hitX} y={plotBottom + 15} textAnchor="middle" className="fire-chart-label target strong">
              {timeToFire}
            </text>
            <text x={hitX} y={plotBottom + 29} textAnchor="middle" className="fire-chart-label target">
              {hitLabel}
            </text>
          </>
        )}
        {end > 0 && (
          <>
            <circle cx={x(end)} cy={y(last.total)} r={3.5} className="fire-chart-end" />
            <text x={x(end) - 6} y={y(last.total) - 8} textAnchor="end" className="fire-chart-label value">
              {short(last.total)}
            </text>
          </>
        )}
      </svg>
      <figcaption className="projection-legend">
        {reached && <span className="legend-when">{t("At FIRE ({date}):", { date: hitLabel ?? "" })}</span>}
        <span className="start">
          {t("Starting assets")} <strong>{money(Math.max(0, atFire.startAssets), currency).replace(/\.\d{2}$/, "")}</strong>
        </span>
        <span className="contributions">
          {t("New contributions")} <strong>{money(atFire.contributed, currency).replace(/\.\d{2}$/, "")}</strong>
        </span>
        <span className="growth">
          {t("Estimated growth")}{" "}
          <strong>
            {money(atFire.total - atFire.startAssets - atFire.contributed, currency).replace(/\.\d{2}$/, "")}
          </strong>
        </span>
        <span className="target">{t("FIRE target")}</span>
      </figcaption>
    </figure>
  );
}
