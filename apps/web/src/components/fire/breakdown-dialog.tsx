"use client";

import { useEffect } from "react";

import { forPeriod, periodSuffix, type Breakdown, type Period } from "@/lib/fire-views";
import { money } from "@/lib/portfolio-metrics";

import { DonutRing, sliceColor } from "./donut";

/** The same popup for income (by source) and expenses (by category). */
export function BreakdownDialog({
  kind,
  data,
  period,
  currency,
  onClose,
}: {
  kind: "income" | "expense";
  data: Breakdown;
  period: Period;
  currency: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const noun = kind === "income" ? "Income" : "Expense";
  const title = `${period === "annual" ? "Annual" : "Monthly"} ${noun} Breakdown`;
  const suffix = periodSuffix(period);
  const total = forPeriod(data.totalMonthly, period);
  const slices = data.rows.map((row, index) => ({
    key: row.key,
    label: row.label,
    share: row.share,
    color: sliceColor(index),
  }));

  return (
    <div
      className="modal-backdrop breakdown-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="add-holding-modal breakdown-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="breakdown-title"
      >
        <div className="modal-heading">
          <h2 id="breakdown-title">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {data.rows.length === 0 ? (
          <p className="muted">
            No repeating {kind === "income" ? "income" : "expenses"} yet. One-time and finished
            entries are not included.
          </p>
        ) : (
          <div className="breakdown-body">
            <DonutRing
              slices={slices}
              label={`${title}: ${data.rows.map((row) => `${row.label} ${(row.share * 100).toFixed(1)}%`).join(", ")}`}
              total={money(total, currency).replace(/\.\d{2}$/, "")}
              caption={suffix === "/yr" ? "per year" : "per month"}
            />
            <table className="breakdown-table">
              <thead>
                <tr>
                  <th scope="col">{kind === "income" ? "Source" : "Category"}</th>
                  <th scope="col">{period === "annual" ? "Annual" : "Monthly"}</th>
                  <th scope="col">Share</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, index) => (
                  <tr key={row.key}>
                    <th scope="row">
                      <span className="fire-donut-swatch" style={{ background: sliceColor(index) }} />
                      <span>
                        {row.label}
                        {row.original && (
                          <small>
                            {money(row.original.amount, row.original.currency)} {row.original.cadence}
                          </small>
                        )}
                      </span>
                    </th>
                    <td>{money(forPeriod(row.monthly, period), currency)}</td>
                    <td>{(row.share * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Total {kind === "income" ? "income" : "expenses"}</th>
                  <td>
                    {money(total, currency)}
                    {suffix}
                  </td>
                  <td>100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
