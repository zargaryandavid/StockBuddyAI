"use client";

import { useEffect, useMemo, useState } from "react";

import type { FireEntry, FxRates } from "@/lib/fire";
import { cashFlowByPeriod, shortMonthDay, shortMonthYear, type Granularity } from "@/lib/fire-views";
import { useT } from "@/lib/i18n/client";
import { money } from "@/lib/portfolio-metrics";

const compact = (value: number) =>
  value >= 1e6
    ? `$${(value / 1e6).toFixed(1).replace(/\.0$/, "")}M`
    : value >= 1e3
      ? `$${(value / 1e3).toFixed(value >= 1e4 ? 0 : 1).replace(/\.0$/, "")}k`
      : `$${Math.round(value)}`;

/** When income arrives or expenses are paid, week by week or month by month. */
export function TimelineDialog({
  kind,
  entries,
  today,
  rates,
  currency,
  onClose,
}: {
  kind: "income" | "expense";
  entries: FireEntry[];
  today: string;
  rates: FxRates;
  currency: string;
  onClose: () => void;
}) {
  const t = useT();
  const [granularity, setGranularity] = useState<Granularity>("month");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const periods = useMemo(
    () => cashFlowByPeriod(entries, kind, today, rates, currency, granularity, 12, t),
    [entries, kind, today, rates, currency, granularity, t],
  );
  const title =
    granularity === "week"
      ? kind === "income"
        ? t("Income by week")
        : t("Expenses by week")
      : kind === "income"
        ? t("Income by month")
        : t("Expenses by month");
  const grandTotal = periods.reduce((sum, period) => sum + period.total, 0);
  const peak = Math.max(...periods.map((period) => period.total), 1);

  const width = 600;
  const height = 210;
  const pad = { left: 8, right: 8, top: 22, bottom: 42 };
  const slot = (width - pad.left - pad.right) / periods.length;
  const barWidth = slot * 0.62;
  const plotBottom = height - pad.bottom;
  const barHeight = (value: number) => (value / peak) * (plotBottom - pad.top);
  // Short labels under the bars: "Oct 26" for a week, "Oct ’26" for a month.
  const axisLabel = (start: string) =>
    granularity === "week"
      ? shortMonthDay(start, t)
      : shortMonthYear(start, t).replace(/ 20(\d\d)$/, " ’$1");
  const thisPeriod = granularity === "week" ? t("This week") : t("This month");

  return (
    <div
      className="modal-backdrop breakdown-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="add-holding-modal breakdown-dialog timeline-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="timeline-title"
      >
        <div className="modal-heading">
          <h2 id="timeline-title">{title}</h2>
          <button type="button" aria-label={t("Close")} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="timeline-toolbar">
          <div className="segmented" role="group" aria-label={t("Group by")}>
            {(["week", "month"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={granularity === value ? "active" : ""}
                aria-pressed={granularity === value}
                onClick={() => setGranularity(value)}
              >
                {value === "week" ? t("Weeks") : t("Months")}
              </button>
            ))}
          </div>
          <span className="muted">
            {granularity === "week" ? t("Next 12 weeks:") : t("Next 12 months:")}{" "}
            <strong className={`fire-list-total ${kind}`}>{money(grandTotal, currency)}</strong>
          </span>
        </div>
        {grandTotal === 0 ? (
          <p className="muted">
            {kind === "income"
              ? granularity === "week"
                ? t("No income dated in the next 12 weeks.")
                : t("No income dated in the next 12 months.")
              : granularity === "week"
                ? t("No expenses dated in the next 12 weeks.")
                : t("No expenses dated in the next 12 months.")}
          </p>
        ) : (
          <>
            <svg
              className={`timeline-chart ${kind}`}
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label={`${title}: ${periods
                .map((period) => `${period.label} ${money(period.total, currency)}`)
                .join(", ")}`}
            >
              <line x1={pad.left} x2={width - pad.right} y1={plotBottom} y2={plotBottom} className="fire-chart-grid" />
              {periods.map((period, index) => {
                const center = pad.left + slot * index + slot / 2;
                const h = barHeight(period.total);
                return (
                  <g key={period.start} className={index === 0 ? "timeline-current" : undefined}>
                    <title>{`${index === 0 ? thisPeriod : period.label}: ${money(period.total, currency)}`}</title>
                    {period.total > 0 && (
                      <>
                        <rect
                          x={center - barWidth / 2}
                          y={plotBottom - h}
                          width={barWidth}
                          height={Math.max(h, 1)}
                          rx={3}
                          className="timeline-bar"
                        />
                        <text x={center} y={plotBottom - h - 6} textAnchor="middle" className="fire-chart-label value">
                          {compact(period.total)}
                        </text>
                      </>
                    )}
                    <text x={center} y={plotBottom + 16} textAnchor="middle" className="fire-chart-label">
                      {axisLabel(period.start)}
                    </text>
                    {index === 0 && (
                      <text x={center} y={plotBottom + 29} textAnchor="middle" className="fire-chart-label timeline-now">
                        {thisPeriod}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            <table className="breakdown-table timeline-table">
              <thead>
                <tr>
                  <th scope="col">{granularity === "week" ? t("Week") : t("Month")}</th>
                  <th scope="col">{kind === "income" ? t("Income") : t("Expenses")}</th>
                </tr>
              </thead>
              <tbody>
                {periods
                  .filter((period) => period.items.length)
                  .map((period) => (
                    <tr key={period.start} className={period.start === periods[0].start ? "timeline-current" : undefined}>
                      <th scope="row">
                        <span>
                          {period.label}
                          {period.items.map((item, index) => (
                            <small key={`${item.date}-${item.name}-${index}`}>
                              {shortMonthDay(item.date, t)} · {item.name} ·{" "}
                              {item.currency !== currency
                                ? `${money(item.amount, item.currency)}${item.baseAmount != null ? ` ≈ ${money(item.baseAmount, currency)}` : ""}`
                                : money(item.amount, currency)}
                            </small>
                          ))}
                        </span>
                      </th>
                      <td>{money(period.total, currency)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}
      </section>
    </div>
  );
}
