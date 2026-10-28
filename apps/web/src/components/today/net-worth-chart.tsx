"use client";

import { useMemo, useState } from "react";

import { useT } from "@/lib/i18n/client";
import { money } from "@/lib/portfolio-metrics";
import type { NetWorthPoint } from "@/lib/today";

const RANGES = [
  { key: "1M", days: 31 },
  { key: "6M", days: 183 },
  { key: "1Y", days: 366 },
  { key: "All", days: null },
] as const;

const WIDTH = 720;
const HEIGHT = 200;
const PAD = { top: 8, right: 0, bottom: 4, left: 0 };

function daysBefore(day: string, days: number) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/** A line of the daily net worth readings, saved each day the app is opened. */
export function NetWorthChart({
  points: saved,
  current,
  currency,
  today,
}: {
  points: NetWorthPoint[];
  /** Today's value as shown on the page, so the chart has today even before it is saved. */
  current?: { day: string; total: number } | null;
  currency: string;
  today: string;
}) {
  const t = useT();
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("6M");
  const [hover, setHover] = useState<number | null>(null);

  const points = useMemo(
    () =>
      current && !saved.some((point) => point.day === current.day)
        ? [...saved, { ...current, investments: 0, savings: 0, other_assets: 0 }]
        : saved,
    [saved, current],
  );
  const shown = useMemo(() => {
    const days = RANGES.find((item) => item.key === range)?.days;
    const from = days ? daysBefore(today, days) : "";
    return [...points]
      .filter((point) => point.day >= from)
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((point) => ({ ...point, total: Number(point.total) }));
  }, [points, range, today]);

  if (shown.length < 2) {
    return (
      <div className="net-worth-empty">
        <p className="muted">
          {points.length
            ? t("Your chart starts today. Each day you open StockBuddy adds a point, so come back tomorrow to see the line grow.")
            : t("Your chart starts the first day your net worth is saved. Add a portfolio or your savings to begin.")}
        </p>
        {points.length > 0 && (
          <strong>{money(Number(points[points.length - 1].total), currency)}</strong>
        )}
      </div>
    );
  }

  const start = Date.parse(shown[0].day);
  const span = Math.max(1, Date.parse(shown[shown.length - 1].day) - start);
  const values = shown.map((point) => point.total);
  const low = Math.min(...values);
  const high = Math.max(...values);
  // At least 2% of the value from top to bottom, so a change of a few cents draws a flat
  // line instead of filling the whole chart.
  const height = Math.max((high - low) * 1.2, Math.abs(high) * 0.02, 1);
  const middle = (high + low) / 2;
  const min = middle - height / 2;
  const max = middle + height / 2;
  const x = (day: string) => PAD.left + ((Date.parse(day) - start) / span) * (WIDTH - PAD.left - PAD.right);
  const y = (value: number) => PAD.top + (1 - (value - min) / (max - min)) * (HEIGHT - PAD.top - PAD.bottom);
  const line = shown.map((point, index) => `${index ? "L" : "M"}${x(point.day).toFixed(1)},${y(point.total).toFixed(1)}`).join(" ");
  const area = `${line} L${x(shown[shown.length - 1].day).toFixed(1)},${HEIGHT - PAD.bottom} L${x(shown[0].day).toFixed(1)},${HEIGHT - PAD.bottom} Z`;
  const first = shown[0];
  const last = shown[shown.length - 1];
  const change = last.total - first.total;
  const active = hover == null ? last : shown[hover];

  return (
    <div className="net-worth-chart">
      <div className="net-worth-summary">
        <div>
          <strong>{money(active.total, currency)}</strong>
          <span className="muted">{active.day}</span>
        </div>
        <span className={change >= 0 ? "positive" : "negative"}>
          {t("{amount} in this period", {
            amount: `${change >= 0 ? "+" : "−"}${money(Math.abs(change), currency)}`,
          })}
        </span>
        <div className="segmented" role="group" aria-label={t("Chart range")}>
          {RANGES.map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={range === item.key}
              className={range === item.key ? "active" : ""}
              onClick={() => setRange(item.key)}
            >
              {item.key === "All" ? t("All") : item.key}
            </button>
          ))}
        </div>
      </div>
      <div className="net-worth-plot">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t("Net worth from {from} ({start}) to {to} ({end})", {
          from: first.day,
          start: money(first.total, currency),
          to: last.day,
          end: money(last.total, currency),
        })}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const at = ((event.clientX - box.left) / box.width) * WIDTH;
          let nearest = 0;
          shown.forEach((point, index) => {
            if (Math.abs(x(point.day) - at) < Math.abs(x(shown[nearest].day) - at)) nearest = index;
          });
          setHover(nearest);
        }}
      >
        {/* Keyed by range so the line draws itself again when the range changes. */}
        <path key={`area-${range}`} d={area} className="net-worth-area" />
        <path key={`line-${range}`} d={line} className="net-worth-line" />
      </svg>
      {hover != null && (
        // Drawn outside the stretched chart so it stays round.
        <span
          className="net-worth-dot"
          aria-hidden="true"
          style={{
            left: `${(x(shown[hover].day) / WIDTH) * 100}%`,
            top: `${(y(shown[hover].total) / HEIGHT) * 100}%`,
          }}
        />
      )}
      </div>
      <div className="net-worth-axis">
        <span>{first.day}</span>
        <span>{last.day}</span>
      </div>
    </div>
  );
}
