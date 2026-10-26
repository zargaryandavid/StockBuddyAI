"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Ban,
  CircleDashed,
  Coins,
  Loader2,
  Pause,
  Play,
  ShoppingCart,
  Square,
  TriangleAlert,
} from "lucide-react";

import { api, type AnalysisRun, type Portfolio } from "@/lib/api";
import { useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/core";

/** The newest close the AI review accepts: yesterday in New York, as YYYY-MM-DD. */
export function latestReviewDate(now = new Date()) {
  const newYork = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const day = new Date(`${newYork}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

type Row = { key: string; portfolioId: string; portfolioName: string; ticker: string; name: string };
// pending: the review was asked for and hasn't answered yet (on Vercel it answers when done).
type Item = { row: Row; run: AnalysisRun | null; skipped?: boolean; note?: string; pending?: boolean };
type Phase = "idle" | "running" | "paused" | "stopping" | "finished" | "stopped";
type Usage = { used: number; limit: number; left: number; period?: string; resets_on?: string };

const POLL_MS = 2000;
const isActive = (run: AnalysisRun | null) => run?.status === "pending" || run?.status === "running";
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * Ask Buddy (formerly Run test): pick portfolios and holdings (all by default) and review them one at a time.
 * Each holding review uses one AI token from the monthly allowance.
 */
export function RunTest({
  portfolios,
  dailyLimit,
  subtitle,
  friendlyError,
  renderReport,
}: {
  portfolios: Portfolio[];
  dailyLimit: number | null;
  subtitle: ReactNode;
  friendlyError: (error: Error) => string;
  renderReport: (run: AnalysisRun) => ReactNode;
}) {
  const t = useT();
  const latest = latestReviewDate();
  const rows = useMemo<Row[]>(
    () =>
      portfolios.flatMap((portfolio) =>
        portfolio.portfolio_positions
          .filter((position) => Number(position.shares) > 0)
          .map((position) => ({
            key: `${portfolio.id}:${position.ticker}`,
            portfolioId: portfolio.id,
            portfolioName: portfolio.name,
            ticker: position.ticker,
            name: position.name || position.company_name || "",
          })),
      ),
    [portfolios],
  );
  // null means "everything", so new portfolios and holdings start selected too
  // (holdings that can't be reviewed excepted).
  const [pickedPortfolios, setPickedPortfolios] = useState<Set<string> | null>(null);
  const [pickedRows, setPickedRows] = useState<Set<string> | null>(null);
  const [asOf, setAsOf] = useState(latest);
  // Why a ticker can't get a review (too few SEC filings, a fund…), checked before any token is used.
  const [blockers, setBlockers] = useState<Record<string, string | null>>({});
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [buying, setBuying] = useState(false);
  const control = useRef({ paused: false, stopped: false });

  const portfolioOn = (id: string) => pickedPortfolios === null || pickedPortfolios.has(id);
  const visible = rows.filter((row) => portfolioOn(row.portfolioId));
  const blockedWhy = (row: Row) => blockers[row.ticker.toUpperCase()] ?? null;
  const reviewable = rows.filter((row) => !blockedWhy(row));
  const rowOn = (key: string) => {
    const row = rows.find((item) => item.key === key);
    if (row && blockedWhy(row)) return false;
    return pickedRows === null || pickedRows.has(key);
  };
  const visibleReviewable = visible.filter((row) => !blockedWhy(row));
  const chosen = visible.filter((row) => rowOn(row.key));
  const blockedVisible = visible.filter((row) => blockedWhy(row));
  const pickedPortfolioCount = portfolios.filter((portfolio) => portfolioOn(portfolio.id)).length;
  const allPortfolios = pickedPortfolioCount === portfolios.length;
  const allRows = visibleReviewable.length > 0 && chosen.length === visibleReviewable.length;
  const working = phase === "running" || phase === "paused" || phase === "stopping";
  const left = usage?.left ?? null;

  async function refreshUsage() {
    try {
      const all = await api<Record<string, Usage>>("/api/ai-usage");
      if (all?.ai_review) setUsage(all.ai_review);
    } catch {
      // The counter is a convenience; the server still enforces the limit.
    }
  }

  useEffect(() => {
    let active = true;
    api<Record<string, Usage>>("/api/ai-usage")
      .then((all) => {
        if (active && all?.ai_review) setUsage(all.ai_review);
      })
      .catch(() => undefined);
    const flags = control.current;
    return () => {
      active = false;
      flags.stopped = true;
    };
  }, []);

  const tickerList = [...new Set(rows.map((row) => row.ticker.toUpperCase()))].sort().join(",");
  useEffect(() => {
    if (!tickerList) return;
    let active = true;
    api<Record<string, string | null>>(
      `/api/analyses/readiness?tickers=${encodeURIComponent(tickerList)}&as_of=${asOf}`,
    )
      .then((found) => {
        if (active && found) setBlockers(found);
      })
      .catch(() => undefined); // without the check, the server still refuses before using a token
    return () => {
      active = false;
    };
  }, [tickerList, asOf]);

  function togglePortfolio(id: string) {
    const next = new Set(pickedPortfolios ?? portfolios.map((portfolio) => portfolio.id));
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPickedPortfolios(next.size === portfolios.length ? null : next);
  }

  function toggleRow(key: string) {
    const row = rows.find((item) => item.key === key);
    if (row && blockedWhy(row)) return;
    const next = new Set(pickedRows ?? reviewable.map((item) => item.key));
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPickedRows(next.size === reviewable.length ? null : next);
  }

  function toggleAllRows() {
    const next = new Set(pickedRows ?? reviewable.map((row) => row.key));
    for (const row of visibleReviewable) {
      if (allRows) next.delete(row.key);
      else next.add(row.key);
    }
    setPickedRows(next.size === reviewable.length ? null : next);
  }

  function update(index: number, change: Partial<Item>) {
    setItems((current) => current.map((item, at) => (at === index ? { ...item, ...change } : item)));
  }

  /** Reviews the queue one holding at a time, so Pause and Stop take effect between reviews. */
  async function start() {
    if (!chosen.length) return;
    const queue = chosen;
    control.current = { paused: false, stopped: false };
    setItems(queue.map((row) => ({ row, run: null })));
    setMessage(null);
    setPhase("running");
    let index = 0;
    let halted = false;
    for (; index < queue.length; index += 1) {
      while (control.current.paused && !control.current.stopped) await wait(300);
      if (control.current.stopped) break;
      let run: AnalysisRun;
      update(index, { pending: true });
      try {
        run = await api<AnalysisRun>("/api/analyses", {
          method: "POST",
          body: JSON.stringify({ portfolio_id: queue[index].portfolioId, ticker: queue[index].ticker, as_of: asOf }),
        });
      } catch (cause) {
        const error = cause instanceof Error ? cause : new Error("Could not start the review");
        const text = friendlyError(error);
        // One holding without enough filings shouldn't stop the others.
        if (/can't be reviewed yet/.test(error.message) || /can't be reviewed yet/.test(text)) {
          update(index, { pending: false, skipped: true, note: text });
          continue;
        }
        update(index, { pending: false });
        setMessage(text);
        halted = true;
        break;
      }
      update(index, { run, pending: false });
      while (isActive(run)) {
        await wait(POLL_MS);
        try {
          run = await api<AnalysisRun>(`/api/analyses/${run.id}`);
          update(index, { run });
        } catch {
          // A missed refresh is retried on the next tick.
        }
      }
      void refreshUsage();
      // A broken AI key fails every review the same way; don't spend the rest.
      if (run.status === "failed" && /API key|AI service/.test(run.error ?? "")) {
        setMessage(run.error);
        index += 1;
        halted = true;
        break;
      }
    }
    const notStarted = index < queue.length;
    if (notStarted) {
      setItems((current) => current.map((item, at) => (at >= index && !item.run ? { ...item, skipped: true } : item)));
    }
    setPhase(control.current.stopped || halted ? "stopped" : "finished");
    void refreshUsage();
  }

  function pause() {
    control.current.paused = !control.current.paused;
    setPhase(control.current.paused ? "paused" : "running");
  }

  function stop() {
    control.current.stopped = true;
    setPhase("stopping");
  }

  const done = items.filter((item) => item.run && !isActive(item.run)).length;
  const current = items.find((item) => item.pending || isActive(item.run));
  const failed = items.filter((item) => item.run?.status === "failed").length;
  const skipped = items.filter((item) => item.skipped).length;
  const progress = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <section className="simple-page test-page run-test" aria-labelledby="run-test-title">
      <div className="page-heading">
        <div>
          <h1 id="run-test-title">{t("Ask Buddy")}</h1>
          <p className="page-subtitle">{subtitle}</p>
        </div>
      </div>

      <article className="panel run-test-panel">
        <TokenWallet
          used={usage?.used ?? null}
          limit={usage?.limit ?? dailyLimit}
          left={left}
          resetsOn={usage?.resets_on ?? null}
          needed={chosen.length}
          onBuy={() => setBuying(true)}
        />

        <div className="run-test-controls">
          <Picker
            label={t("Portfolios")}
            summary={
              allPortfolios
                ? t("All ({count})", { count: portfolios.length })
                : t("{count} of {total}", { count: pickedPortfolioCount, total: portfolios.length })
            }
            disabled={working}
          >
            <label className="run-test-check run-test-all">
              <input
                type="checkbox"
                checked={allPortfolios}
                onChange={() => setPickedPortfolios(allPortfolios ? new Set() : null)}
              />
              {t("All portfolios")}
            </label>
            {portfolios.map((portfolio) => (
              <label key={portfolio.id} className="run-test-check">
                <input type="checkbox" checked={portfolioOn(portfolio.id)} onChange={() => togglePortfolio(portfolio.id)} />
                {portfolio.name}
              </label>
            ))}
          </Picker>

          <Picker
            label={t("Holdings")}
            summary={
              allRows
                ? t("All ({count})", { count: visible.length })
                : t("{count} of {total}", { count: chosen.length, total: visible.length })
            }
            disabled={working}
            wide
          >
            {visible.length ? (
              <table className="run-test-table">
                <thead>
                  <tr>
                    <th scope="col">
                      <input
                        type="checkbox"
                        aria-label={t("Select all holdings")}
                        checked={allRows}
                        ref={(input) => {
                          if (input) input.indeterminate = chosen.length > 0 && !allRows;
                        }}
                        onChange={toggleAllRows}
                      />
                    </th>
                    <th scope="col">{t("Ticker")}</th>
                    <th scope="col">{t("Company")}</th>
                    <th scope="col">{t("Portfolio")}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr
                      key={row.key}
                      className={blockedWhy(row) ? "blocked" : rowOn(row.key) ? "on" : undefined}
                      onClick={() => toggleRow(row.key)}
                    >
                      <td>
                        <input
                          type="checkbox"
                          aria-label={t("Review {ticker} in {portfolio}", { ticker: row.ticker, portfolio: row.portfolioName })}
                          checked={rowOn(row.key)}
                          disabled={Boolean(blockedWhy(row))}
                          onClick={(event) => event.stopPropagation()}
                          onChange={() => toggleRow(row.key)}
                        />
                      </td>
                      <th scope="row">{row.ticker}</th>
                      <td>
                        {row.name || "—"}
                        {blockedWhy(row) && (
                          <span className="run-test-blocked">
                            <Ban size={13} aria-hidden="true" />{" "}
                            {t("Can't review yet: {reason}", { reason: blockedWhy(row) ?? "" })}
                          </span>
                        )}
                      </td>
                      <td>{row.portfolioName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">{rows.length ? t("Pick at least one portfolio.") : t("Add holdings to a portfolio first.")}</p>
            )}
          </Picker>

          <label className="run-test-date">
            {t("As-of close")}
            <input
              type="date"
              value={asOf}
              max={latest}
              disabled={working}
              onChange={(event) => setAsOf(event.target.value || latest)}
            />
          </label>

          {!working && (
            <button
              type="button"
              className="button accent run-test-start"
              disabled={!chosen.length}
              onClick={() => void start()}
            >
              <Play size={16} aria-hidden="true" />
              {chosen.length === 1
                ? t("Run {count} review", { count: chosen.length })
                : t("Run {count} reviews", { count: chosen.length })}
            </button>
          )}
        </div>

        {blockedVisible.length > 0 && (
          <p className="run-test-left-out">
            <Ban size={15} aria-hidden="true" />
            <span>
              <strong>
                {blockedVisible.length === 1
                  ? t("{count} holding can't be reviewed yet and is left out:", { count: blockedVisible.length })
                  : t("{count} holdings can't be reviewed yet and are left out:", { count: blockedVisible.length })}
              </strong>{" "}
              {t(
                "{tickers}. Buddy needs 4 quarters of company financials filed with the SEC; ETFs, funds, and new listings don't have them yet.",
                { tickers: [...new Set(blockedVisible.map((row) => row.ticker))].join(", ") },
              )}
            </span>
          </p>
        )}
        <p className="muted run-test-note">
          {t("Uses the close of {date}. Prices are final through {latest}; today's close is used once the day is over.", {
            date: asOf,
            latest,
          })}
        </p>
      </article>
      {buying && <BuyTokensDialog limit={usage?.limit ?? dailyLimit} onClose={() => setBuying(false)} />}

      {items.length > 0 && (
        <section className="panel run-test-progress" aria-label={t("Review progress")}>
          <div className="run-test-progress-head">
            <p>
              <strong>
                {phase === "finished"
                  ? t("Finished")
                  : phase === "stopped"
                    ? t("Stopped")
                    : phase === "paused"
                      ? t("Paused")
                      : phase === "stopping"
                        ? t("Stopping after this review…")
                        : current
                          ? t("Reviewing {ticker}", { ticker: current.row.ticker })
                          : t("Starting…")}
              </strong>{" "}
              <span className="muted">
                {t("{done} of {total} done", { done, total: items.length })}
                {failed ? ` · ${t("{count} failed", { count: failed })}` : ""}
                {skipped ? ` · ${t("{count} not started (no tokens used)", { count: skipped })}` : ""}
              </span>
            </p>
            {working && (
              <div className="run-test-progress-buttons">
                <button type="button" className="button" onClick={pause} disabled={phase === "stopping"}>
                  {phase === "paused" ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
                  {phase === "paused" ? t("Resume") : t("Pause")}
                </button>
                <button type="button" className="button danger" onClick={stop} disabled={phase === "stopping"}>
                  <Square size={14} aria-hidden="true" />
                  {t("Stop")}
                </button>
              </div>
            )}
          </div>
          <div
            className={`run-test-bar ${phase}`}
            role="progressbar"
            aria-label={t("Reviews done")}
            aria-valuemin={0}
            aria-valuemax={items.length}
            aria-valuenow={done}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          {working && (
            <p className="muted run-test-note">
              {t("Pause or Stop takes effect after the review in progress. Holdings not started use no tokens.")}
            </p>
          )}
          {message && (
            <p className="alert" role="alert">
              {message}
            </p>
          )}
          <ul className="run-test-results">
            {items.map((item) => (
              <li key={item.row.key} className={item.skipped ? "skipped" : (item.run?.status ?? "queued")}>
                <details>
                  <summary>
                    <StatusIcon item={item} />
                    <strong>{item.row.ticker}</strong>
                    <span className="muted">{item.row.portfolioName}</span>
                    <span className="run-test-status">{statusText(item, t)}</span>
                  </summary>
                  {item.note && <p className="run-test-row-note">{item.note}</p>}
                  {item.run && !isActive(item.run) && renderReport(item.run)}
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

/** When the monthly tokens come back, e.g. "Nov 1": the 1st of next month (UTC), or the
 *  date the server gives. */
export function resetDate(resetsOn: string | null = null, now = new Date()) {
  const day = resetsOn
    ? new Date(`${resetsOn}T00:00:00Z`)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(day);
}

/** This month's free tokens: a meter, when they come back, a way to buy more, and a warning
 *  when the picked holdings need more tokens than are left. */
function TokenWallet({
  used,
  limit,
  left,
  needed,
  resetsOn,
  onBuy,
}: {
  used: number | null;
  limit: number | null;
  left: number | null;
  needed: number;
  resetsOn: string | null;
  onBuy: () => void;
}) {
  const t = useT();
  const known = left !== null && limit !== null;
  const share = known && limit ? Math.min(100, Math.round(((used ?? limit - left) / limit) * 100)) : 0;
  const empty = known && left === 0;
  const short = known && !empty && needed > left;
  const warn = empty || short;
  return (
    <section className={`run-test-wallet${warn ? " warn" : ""}`} aria-label={t("Your tokens")}>
      {warn ? (
        <TriangleAlert size={22} aria-hidden="true" className="run-test-wallet-icon" />
      ) : (
        <Coins size={22} aria-hidden="true" className="run-test-wallet-icon" />
      )}
      <div className="run-test-wallet-body">
        {warn && (
          <p className="run-test-wallet-warning" role="alert">
            {empty ? (
              <>
                <strong>
                  {limit === 1
                    ? t("You've used this month's {count} free token.", { count: limit })
                    : t("You've used this month's {count} free tokens.", { count: limit ?? 0 })}
                </strong>{" "}
                {t("They come back on {date}, or you can buy more tokens.", { date: resetDate(resetsOn) })}
              </>
            ) : (
              <>
                <strong>
                  {needed === 1
                    ? t("This run needs {count} token, but you have {left} left.", { count: needed, left: left ?? 0 })
                    : t("This run needs {count} tokens, but you have {left} left.", { count: needed, left: left ?? 0 })}
                </strong>{" "}
                {needed - (left ?? 0) === 1
                  ? t(
                      "The first {left} will run and the rest won't start. Untick {count} holding to choose which, or buy more tokens.",
                      { left: left ?? 0, count: needed - (left ?? 0) },
                    )
                  : t(
                      "The first {left} will run and the rest won't start. Untick {count} holdings to choose which, or buy more tokens.",
                      { left: left ?? 0, count: needed - (left ?? 0) },
                    )}
              </>
            )}
          </p>
        )}
        <p className="run-test-wallet-title">
          <span>{t("This month's free tokens")}</span>
          <span className="run-test-wallet-free">{t("Free during early access")}</span>
        </p>
        {known ? (
          <>
            <p className="run-test-wallet-count">
              {/* The translated sentence, with the number left in bold wherever the language puts it. */}
              {t("{left} of {limit} left", { left: "\u0000", limit })
                .split("\u0000")
                .map((part, at) => (
                  <Fragment key={at}>
                    {at > 0 && <strong>{left}</strong>}
                    {part}
                  </Fragment>
                ))}
              <span className="muted">
                {" · "}
                {t("{used} used · resets on {date}", { used: used ?? limit - left, date: resetDate(resetsOn) })}
              </span>
            </p>
            <div
              className="run-test-meter"
              role="meter"
              aria-label={t("Tokens used this month")}
              aria-valuemin={0}
              aria-valuemax={limit}
              aria-valuenow={used ?? limit - left}
            >
              <span style={{ width: `${share}%` }} />
            </div>
          </>
        ) : (
          <p className="run-test-wallet-count">{limit != null
            ? limit === 1
              ? t("{count} token a day", { count: limit })
              : t("{count} tokens a day", { count: limit })
            : t("Loading…")}</p>
        )}
        <p className="muted run-test-wallet-rule">
          {known && !warn
            ? needed === 1
              ? t("1 token = 1 holding review. This run: {count} token, {after} left after.", {
                  count: needed,
                  after: left - needed,
                })
              : t("1 token = 1 holding review. This run: {count} tokens, {after} left after.", {
                  count: needed,
                  after: left - needed,
                })
            : needed === 1
              ? t("1 token = 1 holding review. This run: {count} token.", { count: needed })
              : t("1 token = 1 holding review. This run: {count} tokens.", { count: needed })}
        </p>
      </div>
      <button type="button" className={`button run-test-buy${warn ? " accent" : ""}`} onClick={onBuy}>
        <ShoppingCart size={15} aria-hidden="true" />
        {t("Buy tokens")}
      </button>
    </section>
  );
}

const PACKS = [
  { name: "Starter", tokens: 25, note: "A few extra reviews" },
  { name: "Plus", tokens: 100, note: "Review every holding weekly" },
  { name: "Pro", tokens: 300, note: "For several portfolios" },
];

/** Token packs preview. Buying isn't open yet; the free monthly tokens stay. */
function BuyTokensDialog({ limit, onClose }: { limit: number | null; onClose: () => void }) {
  const t = useT();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="add-holding-modal buy-tokens" role="dialog" aria-modal="true" aria-labelledby="buy-tokens-title">
        <div className="modal-heading">
          <h2 id="buy-tokens-title">{t("Buy tokens")}</h2>
          <button type="button" aria-label={t("Close")} onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted">
          {t(
            "Tokens pay for AI reviews: 1 token reviews 1 holding with all five personas. Bought tokens don't expire and are used after your free monthly ones.",
          )}
        </p>
        <ul className="buy-tokens-packs">
          {PACKS.map((pack) => (
            <li key={pack.name}>
              <p className="buy-tokens-name">{pack.name}</p>
              <p className="buy-tokens-amount">
                <Coins size={16} aria-hidden="true" /> {t("{count} tokens", { count: pack.tokens })}
              </p>
              <p className="muted">{t(pack.note)}</p>
              <button type="button" className="button" disabled>
                {t("Coming soon")}
              </button>
            </li>
          ))}
        </ul>
        <p className="run-test-note muted">
          {limit == null
            ? t("Buying isn't open yet. During early access you get free tokens every month.")
            : limit === 1
              ? t("Buying isn't open yet. During early access you get {count} free token every month.", { count: limit })
              : t("Buying isn't open yet. During early access you get {count} free tokens every month.", { count: limit })}
        </p>
      </section>
    </div>
  );
}

/** True when every persona abstained for lack of filed data, so there is no real review. */
export function notEnoughData(run: AnalysisRun) {
  const signals = run.analysis_signals ?? [];
  return (
    signals.length > 0 &&
    signals.every((signal) => signal.abstained && /insufficient data/i.test(signal.reasoning ?? ""))
  );
}

function statusText(item: Item, t: Translate) {
  if (item.note) return t("Can't review yet");
  if (item.skipped) return t("Not started");
  if (item.pending) return t("Reviewing…");
  if (!item.run) return t("Waiting");
  if (isActive(item.run)) return t("Reviewing…");
  if (item.run.status === "failed") return t("Failed");
  if (notEnoughData(item.run)) return t("Not enough data");
  const label = item.run.recommendations?.[0]?.label;
  // The label is data ("hold"); only its displayed form is translated.
  return label ? t(label[0].toUpperCase() + label.slice(1)) : t("Done");
}

function StatusIcon({ item }: { item: Item }) {
  if (item.pending) return <Loader2 size={16} className="spinning" aria-hidden="true" />;
  if (item.skipped || !item.run) return <CircleDashed size={16} aria-hidden="true" />;
  if (isActive(item.run)) return <Loader2 size={16} className="spinning" aria-hidden="true" />;
  if (item.run.status === "failed") return <CircleAlert size={16} aria-hidden="true" />;
  return <CheckCircle2 size={16} aria-hidden="true" />;
}

/** A compact dropdown with checkboxes inside; closes on outside click or Escape. */
function Picker({
  label,
  summary,
  disabled,
  wide = false,
  children,
}: {
  label: string;
  summary: string;
  disabled?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={`run-test-picker${wide ? " wide" : ""}`} ref={box}>
      <span className="run-test-picker-label">{label}</span>
      <button
        type="button"
        className="run-test-picker-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${label}: ${summary}`}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        {summary}
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className={`run-test-menu${wide ? " wide" : ""}`} role="group" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  );
}
