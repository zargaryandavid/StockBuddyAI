"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Loader2, Plus, Save, Trash2 } from "lucide-react";

import { AmountInput } from "@/components/amount-input";
import { api } from "@/lib/api";
import { allocationSummary, type AllocationItem, type AllocationPlan } from "@/lib/allocation";
import { PORTFOLIO_CURRENCIES } from "@/lib/currencies";
import { useT } from "@/lib/i18n/client";
import { money } from "@/lib/portfolio-metrics";
import type { Quote } from "@/lib/today";

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
export function FutureAllocation() {
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

  if (!plan || !summary) {
    return (
      <section className="future-allocation">
        <h1>{t("Future allocation")}</h1>
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
          <h1 id="allocation-title">{t("Future allocation")}</h1>
          <p className="page-subtitle">
            {t("Plan where your next money goes. Type a symbol and a share or amount: you see what it buys at today's price and how it moved over the last year.")}
          </p>
        </div>
        <button type="button" className="button primary allocation-save" onClick={() => void save()} disabled={saving || !dirty}>
          {saving ? <Loader2 size={15} className="spinning" aria-hidden="true" /> : <Save size={15} aria-hidden="true" />}
          {dirty ? t("Save plan") : t("Saved")}
        </button>
      </div>

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

        <div className="allocation-table" role="table" aria-label={t("Future allocation")}>
          <div className="allocation-row allocation-head" role="row">
            <span role="columnheader">{t("Allocation")}</span>
            <span role="columnheader">{t("Investment")}</span>
            <span role="columnheader">{t("Share or amount")}</span>
            <span role="columnheader">{t("Amount")}</span>
            <span role="columnheader">{t("≈ USD")}</span>
            <span role="columnheader">{t("Shares at today's price")}</span>
            <span role="columnheader">{t("Last 1 year")}</span>
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
                <span role="cell">
                  <input
                    value={item.label}
                    maxLength={60}
                    placeholder={t("e.g. International stocks")}
                    aria-label={t("Allocation")}
                    onChange={(event) => setItem(index, { label: event.target.value })}
                  />
                </span>
                <span role="cell" className="allocation-investment">
                  <input
                    className="allocation-ticker"
                    value={item.ticker}
                    maxLength={15}
                    placeholder={t("Symbol, e.g. VXUS")}
                    aria-label={t("Symbol")}
                    onChange={(event) => setItem(index, { ticker: event.target.value.toUpperCase().replace(/\s/g, "") })}
                  />
                  {item.ticker ? (
                    <small className={missing ? "negative" : "muted"}>
                      {missing ? t("Not found. Check the symbol.") : row.name ?? t("Looking up…")}
                      {row.fund && !missing ? ` · ${t("Fund")}` : ""}
                    </small>
                  ) : (
                    <input
                      value={item.name}
                      maxLength={80}
                      placeholder={t("Or a name, e.g. Armenian bonds")}
                      aria-label={t("Name")}
                      onChange={(event) => setItem(index, { name: event.target.value })}
                    />
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
                  <small className="muted">{t("{pct} of the money", { pct: `${row.pct.toFixed(1)}%` })}</small>
                </span>
                <span role="cell" className="allocation-num">{usd(row.usd)}</span>
                <span role="cell" className="allocation-num">
                  {row.shares != null && row.price != null ? (
                    <>
                      <strong>{row.shares.toLocaleString("en-US", { maximumFractionDigits: 2 })}</strong>
                      <small className="muted">
                        {t("{whole} whole at {price}", { whole: row.wholeShares ?? 0, price: usd(row.price) })}
                      </small>
                    </>
                  ) : item.ticker ? (
                    "—"
                  ) : (
                    <small className="muted">{t("No market price")}</small>
                  )}
                </span>
                <span role="cell" className="allocation-num">
                  {item.ticker ? (
                    <>
                      <strong className={row.return1y == null ? "" : row.return1y >= 0 ? "positive" : "negative"}>{signedPct(row.return1y)}</strong>
                      <small className="muted">
                        {t("1M {m} · 6M {s}", { m: signedPct(row.return1m), s: signedPct(row.return6m) })}
                      </small>
                    </>
                  ) : (
                    <label className="allocation-typed">
                      <input
                        type="number"
                        step="0.1"
                        value={item.expected_return_pct ?? ""}
                        placeholder="%"
                        aria-label={t("Expected yearly return (%)")}
                        onChange={(event) => setItem(index, { expected_return_pct: event.target.value === "" ? null : Number(event.target.value) })}
                      />
                      <small className="muted">{t("your estimate")}</small>
                    </label>
                  )}
                </span>
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
              <strong>{signedPct(summary.weightedReturn)}</strong>
              <small className="muted">{t("weighted")}</small>
            </span>
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
