"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2 } from "lucide-react";

import { AmountInput } from "@/components/amount-input";
import { api } from "@/lib/api";
import { allocationSummary, type AllocationItem, type AllocationPlan } from "@/lib/allocation";
import { PORTFOLIO_CURRENCIES } from "@/lib/currencies";
import { useT } from "@/lib/i18n/client";
import { loadTargets, type Targets } from "@/lib/targets";
import { money } from "@/lib/portfolio-metrics";
import type { Quote } from "@/lib/today";

import { WatchlistChart, type RangeKey } from "@/components/watchlist-chart";

const PERIOD_LABEL: Record<RangeKey, string> = {
  "1M": "Last 1 month",
  "6M": "Last 6 months",
  "1Y": "Last 1 year",
  "5Y": "Last 5 years",
};

type ResolveResult = { query: string; data?: Quote; error?: string };

const emptyItem = (): AllocationItem => ({ label: "", ticker: "", name: "", mode: "pct", value: 0, expected_return_pct: null });

/** Signed percent, or a dash when unknown. */
function signedPct(value: number | null, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}%`;
}

/**
 * Plan where future money goes: a budget split across stocks, funds and other investments,
 * with what each amount buys at today's price and how each moved over the last year.
 */
export function FutureAllocation({ today = new Date().toISOString().slice(0, 10) }: { today?: string } = {}) {
  const t = useT();
  const [plan, setPlan] = useState<AllocationPlan | null>(null);
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
  const [notFound, setNotFound] = useState<Set<string>>(new Set());
  // US dollars per one unit of each currency, as they are looked up.
  const [usdRates, setUsdRates] = useState<Record<string, number>>({ USD: 1 });
  const looked = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    api<AllocationPlan>("/api/allocation-plan")
      .then((loaded) => {
        if (!active) return;
        const next = {
          budget: Number(loaded?.budget) || 0,
          currency: loaded?.currency || "USD",
          items: Array.isArray(loaded?.items) && loaded.items.length ? loaded.items : [emptyItem()],
        };
        setPlan(next);
        setSaved(JSON.stringify(next));
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setPlan({ budget: 0, currency: "USD", items: [emptyItem()] });
        setError(cause instanceof Error ? cause.message : "Could not load your plan");
      });
    return () => {
      active = false;
    };
  }, []);

  // Prices and past moves for every symbol in the plan, in US dollars.
  const tickers = useMemo(
    () => [...new Set((plan?.items ?? []).map((item) => item.ticker.trim().toUpperCase()).filter(Boolean))].sort().join(","),
    [plan],
  );
  // Looked up once typing pauses, so "V", "VX", "VXU" aren't each searched on the way to VXUS.
  const [settled, setSettled] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(tickers), 600);
    return () => window.clearTimeout(timer);
  }, [tickers]);
  useEffect(() => {
    const wanted = settled ? settled.split(",").filter((ticker) => !looked.current.has(ticker)) : [];
    if (!wanted.length) return;
    wanted.forEach((ticker) => looked.current.add(ticker));
    let active = true;
    api<ResolveResult[]>("/api/securities/resolve-batch", {
      method: "POST",
      body: JSON.stringify({ queries: wanted, base_currency: "USD" }),
    })
      .then((answers) => {
        if (!active) return;
        setQuotes((current) => {
          const next = new Map(current);
          for (const answer of answers ?? []) if (answer.data) next.set(answer.query.toUpperCase(), answer.data);
          return next;
        });
        setNotFound((current) => {
          const next = new Set(current);
          for (const answer of answers ?? []) if (!answer.data) next.add(answer.query.toUpperCase());
          return next;
        });
      })
      .catch(() => {
        wanted.forEach((ticker) => looked.current.delete(ticker));
      });
    return () => {
      active = false;
    };
  }, [settled]);

  // Analysts' 1-year price targets (the consensus TradingView shows), via Financial Modeling Prep.
  const [targets, setTargets] = useState<Targets>({});
  const [targetsNote, setTargetsNote] = useState<string | null>(null);
  const [analyzingTargets, setAnalyzingTargets] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!settled) return;
    let active = true;
    loadTargets(
      settled.split(","),
      (state) => {
        setTargets((current) => ({ ...current, ...state.targets }));
        setAnalyzingTargets(state.analyzing);
        setTargetsNote(state.note);
      },
      () => active,
    ).catch(() => undefined); // the column simply stays empty
    return () => {
      active = false;
    };
  }, [settled]);

  const currency = plan?.currency ?? "USD";
  const usdPerUnit = usdRates[currency] ?? null;
  useEffect(() => {
    if (usdRates[currency]) return;
    let active = true;
    api<{ rate: number }>(`/api/fx?from=${encodeURIComponent(currency)}&to=USD`)
      .then((result) => {
        if (active && result?.rate) setUsdRates((current) => ({ ...current, [currency]: result.rate }));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [currency, usdRates]);

  const summary = useMemo(() => (plan ? allocationSummary(plan, quotes, usdPerUnit) : null), [plan, quotes, usdPerUnit]);
  const dirty = plan != null && JSON.stringify(plan) !== saved;
  // The chart's period also sets the change column, so both always show the same numbers.
  const [range, setRange] = useState<RangeKey>("1Y");
  const [rangeChanges, setRangeChanges] = useState<Record<string, number>>({});
  const periodChange = (row: { item: AllocationItem; return1m: number | null; return6m: number | null; return1y: number | null }) => {
    if (!row.item.ticker) return row.return1y; // your own estimate for a non-stock row
    const fromChart = rangeChanges[row.item.ticker.toUpperCase()];
    if (fromChart != null) return fromChart;
    return range === "1M" ? row.return1m : range === "6M" ? row.return6m : range === "1Y" ? row.return1y : null;
  };
  const weightedRows = (summary?.rows ?? []).filter((row) => row.amount > 0 && periodChange(row) != null);
  const weightedTotal = weightedRows.reduce((sum, row) => sum + row.amount, 0);
  const weightedChange = weightedTotal > 0 ? weightedRows.reduce((sum, row) => sum + (periodChange(row) as number) * row.amount, 0) / weightedTotal : null;

  if (!plan || !summary) {
    return (
      <section className="future-allocation">
        <h1>{t("Watchlist")}</h1>
        <p className="muted">
          <Loader2 size={15} className="spinning" aria-hidden="true" /> {t("Loading your plan…")}
        </p>
      </section>
    );
  }

  const m = (value: number) => money(value, currency).replace(/\.00$/, "");
  const usd = (value: number | null) => (value == null ? "—" : money(value, "USD").replace(/\.00$/, ""));
  const setItem = (index: number, patch: Partial<AllocationItem>) =>
    setPlan({ ...plan, items: plan.items.map((item, at) => (at === index ? { ...item, ...patch } : item)) });
  const move = (index: number, by: number) => {
    const items = [...plan.items];
    const [row] = items.splice(index, 1);
    items.splice(index + by, 0, row);
    setPlan({ ...plan, items });
  };

  async function save() {
    if (!plan) return;
    setSaving(true);
    setError(null);
    try {
      const cleaned = { ...plan, items: plan.items.filter((item) => item.ticker || item.name || item.label || item.value) };
      await api("/api/allocation-plan", { method: "PUT", body: JSON.stringify(cleaned) });
      const next = { ...cleaned, items: cleaned.items.length ? cleaned.items : [emptyItem()] };
      setPlan(next);
      setSaved(JSON.stringify(next));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your plan");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="future-allocation" aria-labelledby="allocation-title">
      <div className="page-heading">
        <div>
          <h1 id="allocation-title">{t("Watchlist")}</h1>
          <p className="page-subtitle">
            {t("Plan where your next money goes. Type a symbol and a share or amount: you see what it buys at today's price and how it moved over the last year.")}
          </p>
        </div>
        <button type="button" className="button primary allocation-save" onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? <Loader2 size={15} className="spinning" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
          {dirty ? t("Save plan") : t("Saved")}
        </button>
      </div>

      <WatchlistChart
        tickers={plan.items.map((item) => item.ticker)}
        today={today}
        range={range}
        onRange={setRange}
        onChanges={setRangeChanges}
      />

      <article className="panel allocation-panel">
        <div className="allocation-budget">
          <label>
            {t("Money to invest")}
            <AmountInput value={plan.budget} onChange={(value) => setPlan({ ...plan, budget: value })} aria-label={t("Money to invest")} />
          </label>
          <label>
            {t("Currency")}
            <select value={plan.currency} onChange={(event) => setPlan({ ...plan, currency: event.target.value })}>
              {PORTFOLIO_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <div className="allocation-budget-note">
            {currency !== "USD" && (
              <small className="muted">
                {usdPerUnit
                  ? t("≈ {usd} · 1 {code} = {rate} USD", { usd: usd(plan.budget * usdPerUnit), code: currency, rate: usdPerUnit.toPrecision(3) })
                  : t("Looking up the {code} exchange rate…", { code: currency })}
              </small>
            )}
          </div>
        </div>

        {targetsNote && (
          <p className="targets-note" role="note">
            {t("1Y forecasts aren't connected yet: an admin adds a free Financial Modeling Prep key in Admin → Connections, then analysts' targets appear here.")}
          </p>
        )}
        <div className="allocation-table" role="table" aria-label={t("Watchlist")}>
          <div className="allocation-row allocation-head" role="row">
            <span role="columnheader">{t("Investment")}</span>
            <span role="columnheader">{t("Industry")}</span>
            <span role="columnheader">{t("Share or amount")}</span>
            <span role="columnheader">{t("Amount")}</span>
            <span role="columnheader">{t("≈ USD")}</span>
            <span role="columnheader">{t("Shares at today's price")}</span>
            <span role="columnheader">{t(PERIOD_LABEL[range])}</span>
            <span role="columnheader" title={t("Analysts' average 1-year price target (Financial Modeling Prep). An estimate, not a promise.")}>{t("1Y forecast")}</span>
            <span role="columnheader">
              <span className="sr-only">{t("Actions")}</span>
            </span>
          </div>
          {summary.rows.map((row, index) => {
            const { item } = row;
            const symbol = item.ticker.toUpperCase();
            const missing = symbol && notFound.has(symbol);
            return (
              <div className="allocation-row" role="row" key={index}>
                <span role="cell" className="allocation-investment">
                  <input
                    className="allocation-ticker"
                    value={item.ticker}
                    maxLength={15}
                    placeholder={t("Symbol")}
                    aria-label={t("Symbol")}
                    onChange={(event) => setItem(index, { ticker: event.target.value.toUpperCase().replace(/\s/g, "") })}
                  />
                  {item.ticker ? (
                    <small className={missing ? "negative" : "muted"} title={row.name ?? undefined}>
                      {missing ? t("Not found. Check the symbol.") : row.name ?? t("Looking up…")}
                      {row.fund && !missing ? ` · ${t("Fund")}` : ""}
                    </small>
                  ) : (
                    <input
                      value={item.name}
                      maxLength={80}
                      placeholder={t("or a name, e.g. Armenian bonds")}
                      aria-label={t("Name")}
                      onChange={(event) => setItem(index, { name: event.target.value })}
                    />
                  )}
                </span>
                <span role="cell" className="allocation-industry" title={[row.sector, row.industry].filter(Boolean).join(" · ") || undefined}>
                  {row.sector || row.industry ? (
                    <>
                      <strong>{row.sector ? t(row.sector) : t(row.industry ?? "")}</strong>
                      {row.sector && row.industry && <small className="muted">{t(row.industry)}</small>}
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </span>
                <span role="cell" className="allocation-value">
                  <AmountInput
                    value={item.value}
                    onChange={(value) => setItem(index, { value })}
                    aria-label={item.mode === "pct" ? t("Share of the money (%)") : t("Amount ({currency})", { currency })}
                  />
                  <select
                    value={item.mode}
                    aria-label={t("Percent or amount")}
                    onChange={(event) => {
                      const mode = event.target.value as AllocationItem["mode"];
                      // Keep the same money when switching between a share and an amount.
                      const value = mode === "pct" ? (plan.budget ? Number(((row.amount / plan.budget) * 100).toFixed(2)) : 0) : Math.round(row.amount);
                      setItem(index, { mode, value });
                    }}
                  >
                    <option value="pct">%</option>
                    <option value="amount">{currency}</option>
                  </select>
                </span>
                <span role="cell" className="allocation-num">
                  <strong>{m(row.amount)}</strong>
                  {item.mode === "amount" && <small className="muted">{`${row.pct.toFixed(1)}%`}</small>}
                </span>
                <span role="cell" className="allocation-num">{usd(row.usd)}</span>
                <span role="cell" className="allocation-num">
                  {row.shares != null && row.price != null ? (
                    <span title={t("{whole} whole at {price}", { whole: row.wholeShares ?? 0, price: usd(row.price) })}>
                      <strong>{row.shares.toLocaleString("en-US", { maximumFractionDigits: 2 })}</strong>
                      <small className="muted">{` @ ${usd(row.price)}`}</small>
                    </span>
                  ) : item.ticker ? (
                    "—"
                  ) : (
                    <small className="muted">{t("No market price")}</small>
                  )}
                </span>
                <span role="cell" className="allocation-num">
                  {item.ticker ? (
                    (() => {
                      const change = periodChange(row);
                      return (
                        <span title={t("1M {m} · 6M {s} · 1Y {y}", { m: signedPct(row.return1m), s: signedPct(row.return6m), y: signedPct(row.return1y) })}>
                          <strong className={change == null ? "" : change >= 0 ? "positive" : "negative"}>{signedPct(change)}</strong>
                        </span>
                      );
                    })()
                  ) : (
                    <input
                      className="allocation-typed"
                      type="number"
                      step="0.1"
                      value={item.expected_return_pct ?? ""}
                      placeholder={t("est. %")}
                      title={t("your estimate")}
                      aria-label={t("Expected yearly return (%)")}
                      onChange={(event) => setItem(index, { expected_return_pct: event.target.value === "" ? null : Number(event.target.value) })}
                    />
                  )}
                </span>
                {(() => {
                  const found = item.ticker ? targets[item.ticker.toUpperCase()] ?? null : null;
                  const target = found?.target ?? null;
                  const gain = target != null && row.price ? (target / row.price - 1) * 100 : null;
                  const title = targetsNote
                    ? t(targetsNote)
                    : target == null
                      ? t("No analyst target for this holding")
                      : found?.approximate
                        ? t("Approximate analysts' consensus from {source}, {date}. An estimate, not a promise.", { source: found.source ?? "", date: found.as_of ?? "" })
                        : t("Analysts' average 1-year price target (Financial Modeling Prep). An estimate, not a promise.");
                  return (
                    <span role="cell" className="allocation-num allocation-forecast" title={item.ticker ? title : undefined}>
                      {target == null && analyzingTargets.has(item.ticker.toUpperCase()) ? (
                        <span className="analyzing" title={t("Researching analysts' 1-year target for this stock. It's saved for everyone, so it shows instantly next time.")}>
                          <Loader2 size={12} className="spinning" aria-hidden="true" /> {t("Analyzing…")}
                        </span>
                      ) : target == null || gain == null ? (
                        <span className="muted">—</span>
                      ) : (
                        <>
                          <small>{found?.approximate ? "≈ " : ""}{usd(target)}</small>
                          <strong className={gain >= 0 ? "positive" : "negative"}>{signedPct(gain)}</strong>
                        </>
                      )}
                    </span>
                  );
                })()}
                <span role="cell" className="allocation-actions">
                  <button type="button" aria-label={t("Move up")} disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUp size={14} aria-hidden="true" />
                  </button>
                  <button type="button" aria-label={t("Move down")} disabled={index === plan.items.length - 1} onClick={() => move(index, 1)}>
                    <ArrowDown size={14} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("Remove")}
                    onClick={() => setPlan({ ...plan, items: plan.items.length > 1 ? plan.items.filter((_, at) => at !== index) : [emptyItem()] })}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </span>
              </div>
            );
          })}
          <div className="allocation-row allocation-total" role="row">
            <span role="cell">
              <strong>{t("Total")}</strong>
            </span>
            <span role="cell" />
            <span role="cell" className={Math.abs(summary.allocatedPct - 100) < 0.05 ? "positive" : summary.allocatedPct > 100 ? "negative" : ""}>
              <strong>{`${summary.allocatedPct.toFixed(1)}%`}</strong>
            </span>
            <span role="cell" className="allocation-num">
              <strong>{m(summary.allocated)}</strong>
            </span>
            <span role="cell" className="allocation-num">
              <strong>{usd(summary.usd)}</strong>
            </span>
            <span role="cell" />
            <span role="cell" className="allocation-num">
              <strong title={t("weighted")}>{signedPct(weightedChange)}</strong>
            </span>
            <span role="cell" />
            <span role="cell" />
          </div>
        </div>

        <div className="allocation-footer">
          <button type="button" className="button" disabled={plan.items.length >= 40} onClick={() => setPlan({ ...plan, items: [...plan.items, emptyItem()] })}>
            <Plus size={15} aria-hidden="true" /> {t("Add investment")}
          </button>
          <span className={summary.left < -0.005 ? "negative" : "muted"}>
            {plan.budget <= 0
              ? t("Type the money you plan to invest to see shares and amounts.")
              : summary.left < -0.005
                ? t("{amount} over your budget", { amount: m(-summary.left) })
                : summary.left > 0.005
                  ? t("{amount} not allocated yet", { amount: m(summary.left) })
                  : t("Every {currency} is allocated.", { currency })}
          </span>
        </div>
        {error && (
          <p className="alert" role="alert">
            {t(error)}
          </p>
        )}
        <p className="muted allocation-note">
          {t(
            "Last 1 year is the price change over the past 12 months (dividends not included), from Yahoo Finance. Past moves don't promise future ones. Shares are worked out at the latest close; real prices and exchange rates will differ when you buy. This is a planning tool, not advice.",
          )}
        </p>
      </article>
    </section>
  );
}
