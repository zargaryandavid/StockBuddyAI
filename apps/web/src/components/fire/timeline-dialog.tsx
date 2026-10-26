"use client";

import { useEffect, useMemo, useState } from "react";

import type { FireEntry, FxRates } from "@/lib/fire";
import { cashFlowByPeriod, type Granularity } from "@/lib/fire-views";
import { money } from "@/lib/portfolio-metrics";

const compact = (value: number) =>
  value >= 1e6
    ? `$${(value / 1e6).toFixed(1).replace(/\.0$/, "")}M`
    : value >= 1e3
      ? `$${(value / 1e3).toFixed(value >= 1e4 ? 0 : 1).replace(/\.0$/, "")}k`
      : `$${Math.round(value)}`;

const shortDate = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

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
  const [granularity, setGranularity] = useState<Granularity>("month");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const periods = useMemo(
    () => cashFlowByPeriod(entries, kind, today, rates, currency, granularity),
    [entries, kind, today, rates, currency, granularity],
  );
  const noun = kind === "income" ? "Income" : "Expenses";
  const grandTotal = periods.reduce((sum, period) => sum + period.total, 0);
  const peak = Math.max(...periods.map((period) => period.total), 1);

  const width = 600;
  const height = 210;
  const pad = { left: 8, right: 8, top: 22, bottom: 42 };
  const slot = (width - pad.left - pad.right) / periods.length;
  const barWidth = slot * 0.62;
  const plotBottom = height - pad.bottom;
  const barHeight = (value: number) => (value / peak) * (plotBottom - pad.top);
  const axisLabel = (label: string) => label.replace("Week of ", "").replace(/ 20(\d\d)$/, " ’$1");

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
          <h2 id="timeline-title">{noun} by {granularity === "week" ? "week" : "month"}</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="timeline-toolbar">
          <div className="segmented" role="group" aria-label="Group by">
            {(["week", "month"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={granularity === value ? "active" : ""}
                aria-pressed={granularity === value}
                onClick={() => setGranularity(value)}
              >
                {value === "week" ? "Weeks" : "Months"}
              </button>
            ))}
          </div>
          <span className="muted">
            Next 12 {granularity === "week" ? "weeks" : "months"}:{" "}
            <strong className={`fire-list-total ${kind}`}>{money(grandTotal, currency)}</strong>
          </span>
        </div>
        {grandTotal === 0 ? (
          <p className="muted">
            No {kind === "income" ? "income" : "expenses"} dated in the next 12{" "}
            {granularity === "week" ? "weeks" : "months"}.
          </p>
        ) : (
          <>
            <svg
              className={`timeline-chart ${kind}`}
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label={`${noun} by ${granularity}: ${periods
                .map((period) => `${period.label} ${money(period.total, currency)}`)
                .join(", ")}`}
            >
              <line x1={pad.left} x2={width - pad.right} y1={plotBottom} y2={plotBottom} className="fire-chart-grid" />
              {periods.map((period, index) => {
                const center = pad.left + slot * index + slot / 2;
                const h = barHeight(period.total);
                return (
                  <g key={period.start} className={index === 0 ? "timeline-current" : undefined}>
                    <title>{`${index === 0 ? (granularity === "week" ? "This week" : "This month") : period.label}: ${money(period.total, currency)}`}</title>
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
                      {axisLabel(period.label)}
                    </text>
                    {index === 0 && (
                      <text x={center} y={plotBottom + 29} textAnchor="middle" className="fire-chart-label timeline-now">
                        {granularity === "week" ? "This week" : "This month"}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            <table className="breakdown-table timeline-table">
              <thead>
                <tr>
                  <th scope="col">{granularity === "week" ? "Week" : "Month"}</th>
                  <th scope="col">{kind === "income" ? "Income" : "Expenses"}</th>
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
                              {shortDate(item.date)} · {item.name} ·{" "}
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
