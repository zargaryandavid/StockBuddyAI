"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

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
        const text = friendlyError(cause instanceof Error ? cause : new Error("Could not start the review"));
        // One holding without enough filings shouldn't stop the others.
        if (/can't be reviewed yet/.test(text)) {
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
          <h1 id="run-test-title">Ask Buddy</h1>
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
            label="Portfolios"
            summary={allPortfolios ? `All (${portfolios.length})` : `${pickedPortfolioCount} of ${portfolios.length}`}
            disabled={working}
          >
            <label className="run-test-check run-test-all">
              <input
                type="checkbox"
                checked={allPortfolios}
                onChange={() => setPickedPortfolios(allPortfolios ? new Set() : null)}
              />
              All portfolios
            </label>
            {portfolios.map((portfolio) => (
              <label key={portfolio.id} className="run-test-check">
                <input type="checkbox" checked={portfolioOn(portfolio.id)} onChange={() => togglePortfolio(portfolio.id)} />
                {portfolio.name}
              </label>
            ))}
          </Picker>

          <Picker
            label="Holdings"
            summary={allRows ? `All (${visible.length})` : `${chosen.length} of ${visible.length}`}
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
                        aria-label="Select all holdings"
                        checked={allRows}
                        ref={(input) => {
                          if (input) input.indeterminate = chosen.length > 0 && !allRows;
                        }}
                        onChange={toggleAllRows}
                      />
                    </th>
                    <th scope="col">Ticker</th>
                    <th scope="col">Company</th>
                    <th scope="col">Portfolio</th>
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
                          aria-label={`Review ${row.ticker} in ${row.portfolioName}`}
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
                            <Ban size={13} aria-hidden="true" /> Can&apos;t review yet: {blockedWhy(row)}
                          </span>
                        )}
                      </td>
                      <td>{row.portfolioName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="muted">{rows.length ? "Pick at least one portfolio." : "Add holdings to a portfolio first."}</p>
            )}
          </Picker>

          <label className="run-test-date">
            As-of close
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
              Run {plural(chosen.length, "review")}
            </button>
          )}
        </div>

        {blockedVisible.length > 0 && (
          <p className="run-test-left-out">
            <Ban size={15} aria-hidden="true" />
            <span>
              <strong>
                {plural(blockedVisible.length, "holding")} can&apos;t be reviewed yet and{" "}
                {blockedVisible.length === 1 ? "is" : "are"} left out:
              </strong>{" "}
              {[...new Set(blockedVisible.map((row) => row.ticker))].join(", ")}. Buddy needs 4 quarters of
              company financials filed with the SEC; ETFs, funds, and new listings don&apos;t have them yet.
            </span>
          </p>
        )}
        <p className="muted run-test-note">
          Uses the close of {asOf}. Prices are final through {latest}; today&apos;s close is used once the day is over.
        </p>
      </article>
      {buying && <BuyTokensDialog limit={usage?.limit ?? dailyLimit} onClose={() => setBuying(false)} />}

      {items.length > 0 && (
        <section className="panel run-test-progress" aria-label="Review progress">
          <div className="run-test-progress-head">
            <p>
              <strong>
                {phase === "finished"
                  ? "Finished"
                  : phase === "stopped"
                    ? "Stopped"
                    : phase === "paused"
                      ? "Paused"
                      : phase === "stopping"
                        ? "Stopping after this review…"
                        : current
                          ? `Reviewing ${current.row.ticker}`
                          : "Starting…"}
              </strong>{" "}
              <span className="muted">
                {done} of {items.length} done
                {failed ? ` · ${failed} failed` : ""}
                {skipped ? ` · ${skipped} not started (no tokens used)` : ""}
              </span>
            </p>
            {working && (
              <div className="run-test-progress-buttons">
                <button type="button" className="button" onClick={pause} disabled={phase === "stopping"}>
                  {phase === "paused" ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />}
                  {phase === "paused" ? "Resume" : "Pause"}
                </button>
                <button type="button" className="button danger" onClick={stop} disabled={phase === "stopping"}>
                  <Square size={14} aria-hidden="true" />
                  Stop
                </button>
              </div>
            )}
          </div>
          <div
            className={`run-test-bar ${phase}`}
            role="progressbar"
            aria-label="Reviews done"
            aria-valuemin={0}
            aria-valuemax={items.length}
            aria-valuenow={done}
          >
            <span style={{ width: `${progress}%` }} />
          </div>
          {working && (
            <p className="muted run-test-note">
              Pause or Stop takes effect after the review in progress. Holdings not started use no tokens.
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
                    <span className="run-test-status">{statusText(item)}</span>
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
  const known = left !== null && limit !== null;
  const share = known && limit ? Math.min(100, Math.round(((used ?? limit - left) / limit) * 100)) : 0;
  const empty = known && left === 0;
  const short = known && !empty && needed > left;
  const warn = empty || short;
  return (
    <section className={`run-test-wallet${warn ? " warn" : ""}`} aria-label="Your tokens">
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
                <strong>You&apos;ve used this month&apos;s {plural(limit, "free token")}.</strong> They come back on{" "}
                {resetDate(resetsOn)}, or you can buy more tokens.
              </>
            ) : (
              <>
                <strong>
                  This run needs {plural(needed, "token")}, but you have {left} left.
                </strong>{" "}
                The first {left} will run and the rest won&apos;t start. Untick{" "}
                {plural(needed - left, "holding")} to choose which, or buy more tokens.
              </>
            )}
          </p>
        )}
        <p className="run-test-wallet-title">
          <span>This month&apos;s free tokens</span>
          <span className="run-test-wallet-free">Free during early access</span>
        </p>
        {known ? (
          <>
            <p className="run-test-wallet-count">
              <strong>{left}</strong> of {limit} left
              <span className="muted"> · {used ?? limit - left} used · resets on {resetDate(resetsOn)}</span>
            </p>
            <div
              className="run-test-meter"
              role="meter"
              aria-label="Tokens used this month"
              aria-valuemin={0}
              aria-valuemax={limit}
              aria-valuenow={used ?? limit - left}
            >
              <span style={{ width: `${share}%` }} />
            </div>
          </>
        ) : (
          <p className="run-test-wallet-count">{limit != null ? `${plural(limit, "token")} a day` : "Loading…"}</p>
        )}
        <p className="muted run-test-wallet-rule">
          1 token = 1 holding review. This run: {plural(needed, "token")}
          {known && !warn ? `, ${left - needed} left after.` : "."}
        </p>
      </div>
      <button type="button" className={`button run-test-buy${warn ? " accent" : ""}`} onClick={onBuy}>
        <ShoppingCart size={15} aria-hidden="true" />
        Buy tokens
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
          <h2 id="buy-tokens-title">Buy tokens</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted">
          Tokens pay for AI reviews: 1 token reviews 1 holding with all five personas. Bought tokens
          don&apos;t expire and are used after your free monthly ones.
        </p>
        <ul className="buy-tokens-packs">
          {PACKS.map((pack) => (
            <li key={pack.name}>
              <p className="buy-tokens-name">{pack.name}</p>
              <p className="buy-tokens-amount">
                <Coins size={16} aria-hidden="true" /> {pack.tokens} tokens
              </p>
              <p className="muted">{pack.note}</p>
              <button type="button" className="button" disabled>
                Coming soon
              </button>
            </li>
          ))}
        </ul>
        <p className="run-test-note muted">
          Buying isn&apos;t open yet. During early access you get{" "}
          {limit != null ? plural(limit, "free token") : "free tokens"} every month.
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

function statusText(item: Item) {
  if (item.note) return "Can't review yet";
  if (item.skipped) return "Not started";
  if (item.pending) return "Reviewing…";
  if (!item.run) return "Waiting";
  if (isActive(item.run)) return "Reviewing…";
  if (item.run.status === "failed") return "Failed";
  if (notEnoughData(item.run)) return "Not enough data";
  const label = item.run.recommendations?.[0]?.label;
  return label ? label[0].toUpperCase() + label.slice(1) : "Done";
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
