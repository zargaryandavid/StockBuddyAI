"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { api } from "@/lib/api";
import { useT } from "@/lib/i18n/client";
import type { CloseHistory } from "@/lib/performance";

const RANGES = [
  { key: "1M", days: 31 },
  { key: "6M", days: 183 },
  { key: "1Y", days: 366 },
  { key: "5Y", days: 366 * 5 },
] as const;
export type RangeKey = (typeof RANGES)[number]["key"];

/** Distinct, colour-blind-friendly line colours; they repeat after ten symbols. */
const COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d", "#475569", "#b45309"];

const HEIGHT = 280;
const PAD = { top: 14, right: 16, bottom: 28, left: 56 };

export type ChartSeries = { ticker: string; color: string; points: { date: string; close: number; pct: number }[] };

/** Each symbol's closes as a % change from its first close in the range, so any mix compares fairly. */
export function percentSeries(closes: CloseHistory, tickers: string[]): ChartSeries[] {
  return tickers.map((ticker, index) => {
    const bars = (closes[ticker] ?? []).filter((bar) => Number.isFinite(bar.close) && bar.close > 0);
    const first = bars[0]?.close;
    return {
      ticker,
      color: COLORS[index % COLORS.length],
      points: first ? bars.map((bar) => ({ ...bar, pct: (bar.close / first - 1) * 100 })) : [],
    };
  });
}

function startFor(days: number, today: string) {
  const start = new Date(`${today}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - days);
  return start.toISOString().slice(0, 10);
}

/** "2026-05-26" → "May 26, 2026". */
function shortDate(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? day : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function signed(value: number) {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}%`;
}

/**
 * Price moves of every watchlist symbol, from Yahoo Finance daily closes. Tick symbols to show
 * one alone or compare several; lines start at 0% so different prices compare fairly.
 */
export function WatchlistChart({
  tickers,
  today,
  range: shownRange,
  onRange,
  onChanges,
}: {
  tickers: string[];
  today: string;
  /** The chosen period, when the page shares it with its table; otherwise kept here. */
  range?: RangeKey;
  onRange?: (range: RangeKey) => void;
  /** Each symbol's change over the chosen period, so a table can show the same numbers. */
  onChanges?: (changes: Record<string, number>) => void;
}) {
  const t = useT();
  const [ownRange, setOwnRange] = useState<RangeKey>("1Y");
  const sentChanges = useRef("");
  const range = shownRange ?? ownRange;
  const setRange = (next: RangeKey) => {
    setOwnRange(next);
    onRange?.(next);
  };
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at the card's real width, so labels stay a normal reading size on any screen.
  const frame = useRef<HTMLDivElement>(null);
  const [WIDTH, setWidth] = useState(720);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const measure = () => setWidth(Math.max(280, Math.round(element.clientWidth)));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  });
  // Keyed by the symbols' text, so a new array with the same symbols doesn't redraw or reload.
  const symbolKey = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))].slice(0, 40).join(",");
  const symbols = useMemo(() => (symbolKey ? symbolKey.split(",") : []), [symbolKey]);
  const days = RANGES.find((item) => item.key === range)?.days ?? 366;
  const from = startFor(days, today);
  const key = `${symbols.join(",")}|${from}`;
  const [loaded, setLoaded] = useState<{ key: string; closes: CloseHistory | null; error: string | null } | null>(null);

  useEffect(() => {
    if (!symbols.length) return;
    let active = true;
    api<CloseHistory>(`/api/prices/history?tickers=${encodeURIComponent(symbols.join(","))}&from=${from}`)
      .then((closes) => active && setLoaded({ key, closes, error: null }))
      .catch((cause: unknown) =>
        active && setLoaded({ key, closes: null, error: cause instanceof Error ? cause.message : "Price history is unavailable" }),
      );
    return () => {
      active = false;
    };
  }, [key, symbols, from]);

  const ready = loaded?.key === key;
  const series = useMemo(() => (ready && loaded?.closes ? percentSeries(loaded.closes, symbols) : []), [ready, loaded, symbols]);
  useEffect(() => {
    if (!onChanges || !ready) return;
    const changes: Record<string, number> = {};
    for (const item of series) {
      const last = item.points.at(-1)?.pct;
      if (last != null) changes[item.ticker] = last;
    }
    // Only tell the page when the numbers actually change, so it doesn't re-render in a loop.
    const key = JSON.stringify(changes);
    if (key === sentChanges.current) return;
    sentChanges.current = key;
    onChanges(changes);
  }, [series, ready, onChanges]);
  const shown = series.filter((item) => !hidden.has(item.ticker) && item.points.length > 1);

  // The longest shown series sets the dates along the bottom and what the pointer reads.
  const axis = shown.reduce<ChartSeries | null>((best, item) => (!best || item.points.length > best.points.length ? item : best), null);
  const values = shown.flatMap((item) => item.points.map((point) => point.pct));
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const spread = high - low || 1;
  const x = (index: number, count: number) => PAD.left + (count > 1 ? (index / (count - 1)) * (WIDTH - PAD.left - PAD.right) : 0);
  const y = (pct: number) => PAD.top + ((high - pct) / spread) * (HEIGHT - PAD.top - PAD.bottom);
  const hoverDate = axis && hover != null ? axis.points[Math.min(hover, axis.points.length - 1)]?.date : null;

  if (!symbols.length) return null;

  const toggle = (ticker: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });

  return (
    <article className="panel watchlist-chart" aria-labelledby="watchlist-chart-title">
      <div className="watchlist-chart-head">
        <div>
          <h2 id="watchlist-chart-title">{t("Price moves")}</h2>
          <p className="muted">{t("Daily closes from Yahoo Finance, as a change from the start of the period. Tick symbols to show one or compare several.")}</p>
        </div>
        <div className="segmented" role="group" aria-label={t("Chart range")}>
          {RANGES.map((item) => (
            <button key={item.key} type="button" className={range === item.key ? "active" : ""} aria-pressed={range === item.key} onClick={() => setRange(item.key)}>
              {t(item.key)}
            </button>
          ))}
        </div>
      </div>

      <div className="watchlist-chart-picks" role="group" aria-label={t("Symbols on the chart")}>
        {symbols.map((ticker, index) => {
          const item = series.find((entry) => entry.ticker === ticker);
          const last = item?.points.at(-1)?.pct;
          return (
            <label key={ticker} className="watchlist-chart-pick">
              <input type="checkbox" checked={!hidden.has(ticker)} onChange={() => toggle(ticker)} />
              <span className="watchlist-swatch" style={{ background: COLORS[index % COLORS.length] }} aria-hidden="true" />
              <strong>{ticker}</strong>
              {last != null && <span className={last >= 0 ? "positive" : "negative"}>{signed(last)}</span>}
            </label>
          );
        })}
        <button type="button" className="text-button" onClick={() => setHidden(new Set())}>
          {t("Show all")}
        </button>
        <button type="button" className="text-button" onClick={() => setHidden(new Set(symbols))}>
          {t("Clear")}
        </button>
      </div>

      {!ready ? (
        <p className="muted">
          <Loader2 size={15} className="spinning" aria-hidden="true" /> {t("Loading prices…")}
        </p>
      ) : loaded?.error ? (
        <p className="alert">{t(loaded.error)}</p>
      ) : !shown.length ? (
        <p className="muted">{t("Tick a symbol to see its price moves.")}</p>
      ) : (
        <div className="watchlist-chart-frame" ref={frame}>
          <svg
            width={WIDTH}
            height={HEIGHT}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            role="img"
            aria-label={t("Price moves for {symbols}", { symbols: shown.map((item) => `${item.ticker} ${signed(item.points.at(-1)?.pct ?? 0)}`).join(", ") })}
            onMouseMove={(event) => {
              if (!axis) return;
              const box = event.currentTarget.getBoundingClientRect();
              const ratio = (event.clientX - box.left) / box.width;
              const inner = (ratio * WIDTH - PAD.left) / (WIDTH - PAD.left - PAD.right);
              setHover(Math.max(0, Math.min(axis.points.length - 1, Math.round(inner * (axis.points.length - 1)))));
            }}
            onMouseLeave={() => setHover(null)}
          >
            {[high, 0, low]
              .filter((value, index, all) => index !== 1 || (Math.abs(y(value) - y(all[0])) > 18 && Math.abs(y(value) - y(all[2])) > 18))
              .map((value) => (
              <g key={value}>
                <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(value)} y2={y(value)} className="watchlist-grid" />
                <text x={PAD.left - 8} y={y(value) + 4} textAnchor="end" className="watchlist-axis">
                  {value === 0 ? "0%" : signed(value)}
                </text>
              </g>
              ))}
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(0)} y2={y(0)} className="watchlist-zero" />
            {axis && (
              <>
                <text x={PAD.left} y={HEIGHT - 8} className="watchlist-axis">{shortDate(axis.points[0].date)}</text>
                <text x={WIDTH - PAD.right} y={HEIGHT - 8} textAnchor="end" className="watchlist-axis">{shortDate(axis.points.at(-1)?.date ?? "")}</text>
              </>
            )}
            {shown.map((item) => (
              <polyline
                key={item.ticker}
                fill="none"
                stroke={item.color}
                strokeWidth={1.75}
                strokeLinejoin="round"
                points={item.points.map((point, index) => `${x(index, item.points.length).toFixed(1)},${y(point.pct).toFixed(1)}`).join(" ")}
              />
            ))}
            {axis && hover != null && (
              <line x1={x(hover, axis.points.length)} x2={x(hover, axis.points.length)} y1={PAD.top} y2={HEIGHT - PAD.bottom} className="watchlist-cursor" />
            )}
          </svg>
          {hoverDate && (
            <div className="watchlist-tooltip" role="status">
              <strong>{hoverDate}</strong>
              {shown.map((item) => {
                const point = item.points.find((entry) => entry.date >= hoverDate) ?? item.points.at(-1);
                return point ? (
                  <span key={item.ticker}>
                    <span className="watchlist-swatch" style={{ background: item.color }} aria-hidden="true" />
                    {item.ticker} {signed(point.pct)} · ${point.close.toFixed(2)}
                  </span>
                ) : null;
              })}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
