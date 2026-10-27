"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, CalendarClock, Check, Flame, PiggyBank, Wallet } from "lucide-react";

import { api, type Portfolio } from "@/lib/api";
import { buildPlan, yearsLabel, type FireAsset, type FireEntry, type FireSettings, type FxRates } from "@/lib/fire";
import { useT } from "@/lib/i18n/client";
import { money, signedMoney } from "@/lib/portfolio-metrics";
import {
  attentionItems,
  changeSinceLast,
  portfolioSnapshot,
  setupSteps,
  upcomingReports,
  type NetWorthPoint,
  type Quote,
} from "@/lib/today";
import type { BookSettings } from "@/lib/workspace";

import { NetWorthChart } from "./net-worth-chart";

export type TodayDestination = "fire" | "portfolio" | "assets" | "analytics";

type ResolveResult = { query: string; data?: Quote; error?: string };

const SKIP_SETUP_KEY = "stockbuddy.setup.skipped";

const FIRE_DEFAULTS: FireSettings = {
  expected_return_pct: 7,
  withdrawal_rate_pct: 4,
  inflation_pct: 3,
  retirement_annual_spend: null,
  monthly_invest: null,
} as FireSettings;

/** First screen after sign-in: what the money looks like today and what needs a look. */
export function TodayPage({
  portfolios,
  loadingPortfolios,
  book,
  today,
  onOpen,
}: {
  portfolios: Portfolio[];
  loadingPortfolios: boolean;
  book: BookSettings;
  today: string;
  onOpen: (destination: TodayDestination) => void;
}) {
  const t = useT();
  const currency = portfolios[0]?.base_currency ?? "USD";

  const [entries, setEntries] = useState<FireEntry[] | null>(null);
  const [assets, setAssets] = useState<FireAsset[] | null>(null);
  const [settings, setSettings] = useState<FireSettings>(FIRE_DEFAULTS);
  const [rates, setRates] = useState<FxRates>({});
  const [quotes, setQuotes] = useState<Map<string, Quote> | null>(null);
  const [history, setHistory] = useState<NetWorthPoint[]>([]);
  const [skipped, setSkipped] = useState(() => {
    try {
      return window.localStorage.getItem(SKIP_SETUP_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let active = true;
    Promise.all([
      api<FireEntry[]>("/api/fire/entries").catch(() => []),
      api<FireAsset[]>("/api/fire/assets").catch(() => []),
      api<FireSettings>("/api/fire/settings").catch(() => null),
      api<NetWorthPoint[]>("/api/net-worth").catch(() => []),
    ]).then(([rows, held, saved, points]) => {
      if (!active) return;
      setEntries(Array.isArray(rows) ? rows : []);
      setAssets(Array.isArray(held) ? held : []);
      setSettings({ ...FIRE_DEFAULTS, ...(saved ?? {}) });
      setHistory(Array.isArray(points) ? points : []);
    });
    return () => {
      active = false;
    };
  }, []);

  // Exchange rates for income, expenses and assets kept in another currency.
  const foreign = useMemo(
    () =>
      [...new Set([...(entries ?? []), ...(assets ?? [])].map((item) => item.currency).filter((code) => code && code !== currency))]
        .sort()
        .join(","),
    [entries, assets, currency],
  );
  useEffect(() => {
    if (!foreign) return;
    let active = true;
    Promise.allSettled(
      foreign.split(",").map((code) =>
        api<{ rate: number }>(`/api/fx?from=${encodeURIComponent(code)}&to=${encodeURIComponent(currency)}`).then(
          (result) => [code, result.rate] as const,
        ),
      ),
    ).then((results) => {
      if (!active) return;
      const next: FxRates = {};
      for (const result of results) if (result.status === "fulfilled") next[result.value[0]] = result.value[1];
      setRates(next);
    });
    return () => {
      active = false;
    };
  }, [foreign, currency]);

  // Prices for every holding in every portfolio, one request per currency.
  const tickerKey = useMemo(
    () =>
      portfolios
        .map((portfolio) => `${portfolio.base_currency ?? "USD"}:${portfolio.portfolio_positions.map((p) => p.ticker.trim().toUpperCase()).sort().join(",")}`)
        .sort()
        .join("|"),
    [portfolios],
  );
  useEffect(() => {
    if (loadingPortfolios) return;
    let active = true;
    const byCurrency = new Map<string, Set<string>>();
    for (const portfolio of portfolios) {
      const code = portfolio.base_currency ?? "USD";
      const set = byCurrency.get(code) ?? new Set<string>();
      for (const position of portfolio.portfolio_positions) {
        const ticker = position.ticker.trim().toUpperCase();
        if (ticker) set.add(ticker);
      }
      byCurrency.set(code, set);
    }
    const requests = [...byCurrency.entries()]
      .filter(([, set]) => set.size)
      .map(([code, set]) =>
        api<ResolveResult[]>("/api/securities/resolve-batch", {
          method: "POST",
          body: JSON.stringify({ queries: [...set].sort(), base_currency: code }),
        }).catch(() => [] as ResolveResult[]),
      );
    Promise.all(requests).then((answers) => {
      if (!active) return;
      const next = new Map<string, Quote>();
      for (const item of answers.flat()) if (item.data) next.set(item.query.toUpperCase(), item.data);
      setQuotes(next);
    });
    return () => {
      active = false;
    };
    // The key changes exactly when the tickers or currencies change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickerKey, loadingPortfolios]);

  const snapshots = useMemo(
    () => (quotes ? portfolios.map((portfolio) => portfolioSnapshot(portfolio, quotes)) : []),
    [portfolios, quotes],
  );
  const investments = snapshots.reduce((sum, snapshot) => sum + snapshot.total, 0);
  const dayChange = snapshots.reduce((sum, snapshot) => sum + snapshot.dayChange, 0);
  const totalCash = snapshots.reduce((sum, snapshot) => sum + snapshot.cash, 0);
  const plan = useMemo(
    () =>
      buildPlan({
        entries: entries ?? [],
        assets: assets ?? [],
        settings,
        portfolioValue: investments,
        today,
        rates,
        baseCurrency: currency,
      }),
    [entries, assets, settings, investments, today, rates, currency],
  );
  const savings = plan.savingsBalances + plan.bondBalances;
  const otherAssets = plan.heldAssets.reduce((sum, item) => sum + item.value, 0);
  const netWorth = investments + savings + otherAssets;
  const ready = quotes != null && entries != null && assets != null && !loadingPortfolios;
  const hasAnything = portfolios.length > 0 || Boolean(entries?.length) || Boolean(assets?.length);

  // Save today's reading once, when everything has loaded, so the chart grows by a day.
  const saved = useRef(false);
  useEffect(() => {
    if (!ready || !hasAnything || saved.current) return;
    saved.current = true;
    const reading = { day: today, investments, savings, other_assets: otherAssets, currency };
    api<NetWorthPoint>("/api/net-worth/today", { method: "PUT", body: JSON.stringify(reading) })
      .then(() =>
        setHistory((current) => [
          ...current.filter((point) => point.day !== today),
          { ...reading, total: netWorth },
        ]),
      )
      .catch(() => {
        // Try again the next time this page opens.
        saved.current = false;
      });
  }, [ready, hasAnything, today, investments, savings, otherAssets, netWorth, currency]);

  const change = changeSinceLast(history, today, netWorth);
  const attention = useMemo(
    () => (quotes ? attentionItems(snapshots, portfolios, book) : []),
    [quotes, snapshots, portfolios, book],
  );
  // Fresh filing dates and fund types from today's lookup, where the saved ones may be older.
  const reports = useMemo(
    () =>
      upcomingReports(
        portfolios.map((portfolio) => ({
          ...portfolio,
          portfolio_positions: portfolio.portfolio_positions.map((position) => {
            const quote = quotes?.get(position.ticker.trim().toUpperCase());
            return quote
              ? {
                  ...position,
                  report_date: quote.report_date ?? position.report_date,
                  asset_type: quote.asset_type ?? position.asset_type,
                  is_etf_index: quote.is_etf_index ?? position.is_etf_index,
                }
              : position;
          }),
        })),
        today,
      ),
    [portfolios, quotes, today],
  );
  const unpriced = [...new Set(snapshots.flatMap((snapshot) => snapshot.unpriced))];
  const progress = plan.fireNumber ? Math.min(1, plan.currentAssets / plan.fireNumber) : null;
  const cashGoal = snapshots.reduce((sum, snapshot) => {
    const item = attention.find((entry) => entry.kind === "cash" && entry.portfolio === snapshot.name);
    return sum + (item && item.kind === "cash" ? item.missing : 0);
  }, 0);

  const steps = setupSteps({
    hasEntries: Boolean(entries?.length),
    hasPortfolio: portfolios.some((portfolio) => portfolio.portfolio_positions.length > 0 || Number(portfolio.cash) > 0),
    hasAssets: Boolean(assets?.length),
  });
  const showSetup = ready && !skipped && steps.some((step) => !step.done);
  const m = (value: number) => money(value, currency);

  function skipSetup() {
    setSkipped(true);
    try {
      window.localStorage.setItem(SKIP_SETUP_KEY, "1");
    } catch {
      // Private windows may refuse; the guide just comes back next time.
    }
  }

  const stepCopy = {
    plan: {
      title: t("Add your income and expenses"),
      text: t("Your salary, rent and bills. FIRE uses them to work out how much you save and when you could stop working."),
      action: t("Open FIRE"),
      to: "fire" as const,
    },
    portfolio: {
      title: t("Add your portfolio"),
      text: t("Type your holdings, upload a broker file (CSV), or a screenshot of your broker app."),
      action: t("Open Portfolio"),
      to: "portfolio" as const,
    },
    assets: {
      title: t("Add savings and other assets"),
      text: t("Savings accounts, CDs, bonds, a home or a car, so your net worth is complete."),
      action: t("Open Assets"),
      to: "assets" as const,
    },
  };

  return (
    <section className="today-page" aria-labelledby="today-title">
      <header className="today-heading">
        <h1 id="today-title">{t("Today")}</h1>
        <p className="muted">{t("Your money at a glance, and what needs a look.")}</p>
      </header>

      {showSetup && (
        <article className="panel setup-guide" aria-labelledby="setup-title">
          <div className="setup-guide-heading">
            <div>
              <h2 id="setup-title">{t("Set up StockBuddy in three steps")}</h2>
              <p className="muted">
                {t("{done} of 3 done", { done: steps.filter((step) => step.done).length })}
              </p>
            </div>
            <button type="button" className="text-button" onClick={skipSetup}>
              {t("Skip for now")}
            </button>
          </div>
          <ol className="setup-steps">
            {steps.map((step, index) => {
              const copy = stepCopy[step.key];
              return (
                <li key={step.key} className={step.done ? "done" : ""}>
                  <span className="setup-step-mark" aria-hidden="true">
                    {step.done ? <Check size={15} /> : index + 1}
                  </span>
                  <div>
                    <strong>{copy.title}</strong>
                    <span className="muted">{copy.text}</span>
                  </div>
                  {step.done ? (
                    <span className="setup-step-done">{t("Done")}</span>
                  ) : (
                    <button type="button" className="button" onClick={() => onOpen(copy.to)}>
                      {copy.action}
                      <ArrowRight size={14} aria-hidden="true" />
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </article>
      )}

      <div className="today-cards">
        <article className="today-card">
          <span className="today-card-label">
            <Wallet size={16} aria-hidden="true" />
            {t("Net worth")}
          </span>
          <strong>{ready ? m(netWorth) : "…"}</strong>
          {ready && (
            <small className={dayChange >= 0 ? "positive" : "negative"}>
              {t("Markets today: {amount}", { amount: signedMoney(dayChange, currency) })}
            </small>
          )}
          {ready && change && (
            <small className={change.amount >= 0 ? "positive" : "negative"}>
              {t("{amount} since {day}", { amount: signedMoney(change.amount, currency), day: change.since })}
            </small>
          )}
          {ready && (
            <small className="muted">
              {t("Investments {investments} · Savings {savings} · Other {other}", {
                investments: m(investments),
                savings: m(savings),
                other: m(otherAssets),
              })}
            </small>
          )}
        </article>

        <button type="button" className="today-card" onClick={() => onOpen("fire")}>
          <span className="today-card-label">
            <Flame size={16} aria-hidden="true" />
            {t("FIRE progress")}
          </span>
          <strong>{progress == null ? "—" : `${(progress * 100).toFixed(1)}%`}</strong>
          {progress != null && (
            <span className="today-progress" aria-hidden="true">
              <span style={{ width: `${progress * 100}%` }} />
            </span>
          )}
          <small className="muted">
            {plan.fireNumber
              ? t("{assets} of {target} · {years}", {
                  assets: m(plan.currentAssets),
                  target: m(plan.fireNumber),
                  years: yearsLabel(plan.hitMonth, t),
                })
              : t("Add your expenses to see your FIRE number.")}
          </small>
        </button>

        <button type="button" className="today-card" onClick={() => onOpen("portfolio")}>
          <span className="today-card-label">
            <PiggyBank size={16} aria-hidden="true" />
            {t("Cash")}
          </span>
          <strong>{ready ? m(totalCash) : "…"}</strong>
          <small className={cashGoal > 0.005 ? "negative" : "muted"}>
            {!ready
              ? ""
              : !portfolios.length
                ? t("No portfolio yet")
                : cashGoal > 0.005
                  ? t("{amount} below your cash target", { amount: m(cashGoal) })
                  : t("At or above your cash target")}
          </small>
        </button>
      </div>

      <article className="panel today-chart">
        <div className="today-section-heading">
          <h2>{t("Net worth over time")}</h2>
        </div>
        <NetWorthChart
          points={history}
          current={ready && hasAnything ? { day: today, total: netWorth } : null}
          currency={currency}
          today={today}
        />
      </article>

      <div className="today-columns">
        <article className="panel today-list" aria-labelledby="attention-title">
          <h2 id="attention-title">
            <AlertTriangle size={17} aria-hidden="true" />
            {t("Needs a look")}
          </h2>
          {!ready ? (
            <p className="muted">{t("Checking your limits…")}</p>
          ) : attention.length === 0 ? (
            <p className="muted">
              {portfolios.length ? t("Everything is within your limits.") : t("Add a portfolio to check its limits.")}
            </p>
          ) : (
            <ul>
              {attention.slice(0, 6).map((item) =>
                item.kind === "position" ? (
                  <li key={`${item.portfolio}-${item.ticker}`}>
                    <button type="button" className="today-row" onClick={() => onOpen("analytics")}>
                      <strong>{item.ticker}</strong>
                      <span>
                        {t("{weight} of {portfolio}, above your {limit} limit by about {amount}", {
                          weight: `${(item.weight * 100).toFixed(1)}%`,
                          portfolio: item.portfolio,
                          limit: `${(item.limit * 100).toFixed(0)}%`,
                          amount: m(item.excess),
                        })}
                      </span>
                    </button>
                  </li>
                ) : (
                  <li key={`${item.portfolio}-cash`}>
                    <button type="button" className="today-row" onClick={() => onOpen("portfolio")}>
                      <strong>{t("Cash")}</strong>
                      <span>
                        {t("{share} of {portfolio}; target {target}, {amount} to add", {
                          share: `${(item.share * 100).toFixed(1)}%`,
                          portfolio: item.portfolio,
                          target: `${(item.target * 100).toFixed(0)}%`,
                          amount: m(item.missing),
                        })}
                      </span>
                    </button>
                  </li>
                ),
              )}
            </ul>
          )}
          {unpriced.length > 0 && (
            <p className="muted today-note">
              {t("No price for {tickers}; they are left out of these numbers.", { tickers: unpriced.join(", ") })}
            </p>
          )}
        </article>

        <article className="panel today-list" aria-labelledby="reports-title">
          <h2 id="reports-title">
            <CalendarClock size={17} aria-hidden="true" />
            {t("Reports coming up")}
          </h2>
          {reports.length === 0 ? (
            <p className="muted">{t("No company reports expected in the next 30 days.")}</p>
          ) : (
            <ul>
              {reports.slice(0, 8).map((report) => (
                <li key={report.ticker} className="today-row static">
                  <strong>{report.ticker}</strong>
                  <span>
                    {report.expected < today
                      ? t("Expected any day now (last report {last})", { last: report.lastReport })
                      : t("Expected around {day} (last report {last})", {
                          day: report.expected,
                          last: report.lastReport,
                        })}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="muted today-note">{t("Estimated as about three months after each company's last report.")}</p>
        </article>
      </div>
    </section>
  );
}
