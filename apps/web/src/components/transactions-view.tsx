"use client";

import { useEffect, useMemo, useState } from "react";
import { History, Plus, Search } from "lucide-react";

import type { Portfolio, PortfolioTransaction } from "@/lib/api";
import { money } from "@/lib/portfolio-metrics";

export type TransactionInput = {
  ticker: string;
  kind: "buy" | "sell";
  quantity: number;
  price: number;
  transacted_at: string;
};

type Holding = { ticker: string; shares: number; price?: number | null; name?: string | null };
type Filter = "all" | "buy" | "sell";

export function TransactionsView({
  portfolios,
  selectedId,
  onSelectPortfolio,
  transactions,
  loading,
  holdings,
  currency,
  today,
  blockedReason,
  onRecord,
}: {
  portfolios: Portfolio[];
  selectedId: string;
  onSelectPortfolio: (id: string) => void;
  transactions: PortfolioTransaction[];
  loading: boolean;
  holdings: Holding[];
  currency: string;
  today: string;
  /** Why recording is not possible right now (for example unsaved portfolio changes). */
  blockedReason: string | null;
  onRecord: (transaction: TransactionInput) => Promise<void>;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState(false);

  const names = useMemo(
    () => new Map(holdings.map((holding) => [holding.ticker.toUpperCase(), holding.name])),
    [holdings],
  );
  const totals = useMemo(() => {
    let bought = 0;
    let sold = 0;
    for (const item of transactions) {
      const total = Number(item.quantity) * Number(item.price);
      if (item.kind === "buy") bought += total;
      else sold += total;
    }
    return { bought, sold, net: bought - sold };
  }, [transactions]);
  const visible = transactions.filter(
    (item) =>
      (filter === "all" || item.kind === filter) &&
      (!query.trim() || item.ticker.toUpperCase().includes(query.trim().toUpperCase())),
  );

  return (
    <section className="panel transactions-page" aria-labelledby="transactions-title">
      <header className="transactions-top">
        <div>
          <h1 id="transactions-title">Transactions</h1>
          <p className="muted page-subtitle">
            Every buy and sell updates your holdings and average cost.
          </p>
        </div>
        <div className="transactions-actions">
          <label>
            Portfolio
            <select
              aria-label="Transaction portfolio"
              value={selectedId}
              onChange={(event) => onSelectPortfolio(event.target.value)}
            >
              {portfolios.map((portfolio) => (
                <option key={portfolio.id} value={portfolio.id}>
                  {portfolio.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="button primary transactions-record"
            disabled={Boolean(blockedReason)}
            title={blockedReason ?? undefined}
            onClick={() => setRecording(true)}
          >
            <Plus size={16} aria-hidden="true" />
            Record transaction
          </button>
        </div>
      </header>
      {blockedReason && <p className="notice">{blockedReason}</p>}

      <div className="transactions-summary" aria-label="Transaction totals">
        <article className="summary-card">
          <span>Transactions</span>
          <strong>{transactions.length}</strong>
        </article>
        <article className="summary-card">
          <span>Bought</span>
          <strong>{money(totals.bought, currency)}</strong>
        </article>
        <article className="summary-card">
          <span>Sold</span>
          <strong>{money(totals.sold, currency)}</strong>
        </article>
        <article className={`summary-card ${totals.net >= 0 ? "" : "negative"}`}>
          <span>Net invested</span>
          <strong>{money(totals.net, currency)}</strong>
        </article>
      </div>

      {loading ? (
        <p className="muted">Loading transactions…</p>
      ) : transactions.length === 0 ? (
        <div className="transactions-empty">
          <History size={32} aria-hidden="true" />
          <h2>No transactions yet</h2>
          <p>
            Record what you bought and sold, with dates and prices. StockBuddy updates your
            holdings and average cost for you.
          </p>
          <button
            type="button"
            className="button primary transactions-record"
            disabled={Boolean(blockedReason)}
            onClick={() => setRecording(true)}
          >
            <Plus size={16} aria-hidden="true" />
            Record your first transaction
          </button>
        </div>
      ) : (
        <>
          <div className="transactions-filters">
            <div className="segmented" role="group" aria-label="Show">
              {(["all", "buy", "sell"] as const).map((option) => (
                <button
                  type="button"
                  key={option}
                  aria-pressed={filter === option}
                  className={filter === option ? "active" : ""}
                  onClick={() => setFilter(option)}
                >
                  {option === "all" ? "All" : option === "buy" ? "Buys" : "Sells"}
                </button>
              ))}
            </div>
            <label className="transactions-search">
              <Search size={15} aria-hidden="true" />
              <input
                aria-label="Filter by symbol"
                placeholder="Filter by symbol"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          <div className="transactions-table" role="table" aria-label="Portfolio transaction history">
            <div className="transactions-row transactions-header" role="row">
              <span role="columnheader">Date</span>
              <span role="columnheader">Type</span>
              <span role="columnheader">Symbol</span>
              <span role="columnheader">Quantity</span>
              <span role="columnheader">Price</span>
              <span role="columnheader">Total</span>
            </div>
            {visible.map((item) => (
              <div className="transactions-row" role="row" key={item.id}>
                <time role="cell" dateTime={item.transacted_at}>
                  {formatDate(item.transacted_at)}
                </time>
                <span role="cell">
                  <span className={`transaction-kind ${item.kind}`}>
                    {item.kind === "buy" ? "Buy" : "Sell"}
                  </span>
                </span>
                <span role="cell" className="transactions-symbol">
                  <strong>{item.ticker}</strong>
                  {names.get(item.ticker.toUpperCase()) && (
                    <small>{names.get(item.ticker.toUpperCase())}</small>
                  )}
                </span>
                <span role="cell">{Number(item.quantity).toLocaleString("en-US")}</span>
                <span role="cell">{money(Number(item.price), currency)}</span>
                <strong role="cell" className={item.kind === "buy" ? "negative" : "positive"}>
                  {item.kind === "buy" ? "−" : "+"}
                  {money(Number(item.quantity) * Number(item.price), currency)}
                </strong>
              </div>
            ))}
            {visible.length === 0 && (
              <p className="muted transactions-none">No transactions match this filter.</p>
            )}
          </div>
        </>
      )}

      {recording && (
        <RecordDialog
          holdings={holdings}
          currency={currency}
          today={today}
          onClose={() => setRecording(false)}
          onSave={async (transaction) => {
            await onRecord(transaction);
            setRecording(false);
          }}
        />
      )}
    </section>
  );
}

function RecordDialog({
  holdings,
  currency,
  today,
  onClose,
  onSave,
}: {
  holdings: Holding[];
  currency: string;
  today: string;
  onClose: () => void;
  onSave: (transaction: TransactionInput) => Promise<void>;
}) {
  const [kind, setKind] = useState<"buy" | "sell">("buy");
  const [ticker, setTicker] = useState(holdings[0]?.ticker ?? "");
  const [quantity, setQuantity] = useState("");
  const held = holdings.find((holding) => holding.ticker.toUpperCase() === ticker.trim().toUpperCase());
  const [price, setPrice] = useState(
    held?.price != null ? String(Math.round(Number(held.price) * 100) / 100) : "",
  );
  const [date, setDate] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function chooseTicker(next: string) {
    setTicker(next);
    const match = holdings.find((holding) => holding.ticker.toUpperCase() === next.trim().toUpperCase());
    if (match?.price != null) setPrice(String(Math.round(Number(match.price) * 100) / 100));
  }

  const total = Number(quantity) * Number(price);

  async function submit() {
    const symbol = ticker.trim().toUpperCase();
    const shares = Number(quantity);
    const each = Number(price);
    if (!/^[A-Z0-9.-]{1,12}$/.test(symbol)) return setError("Enter a valid ticker symbol.");
    if (!(shares > 0) || !Number.isInteger(shares)) return setError("Enter a whole number of shares above 0.");
    if (!(each >= 0) || price === "") return setError("Enter the price per share.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return setError("Pick a date that is not in the future.");
    if (kind === "sell") {
      if (!held) return setError(`You don't hold ${symbol} in this portfolio.`);
      if (shares > Number(held.shares)) {
        return setError(`You hold ${Number(held.shares).toLocaleString("en-US")} ${symbol}; you can't sell more than that.`);
      }
    }
    setError(null);
    setSaving(true);
    try {
      await onSave({ ticker: symbol, kind, quantity: shares, price: each, transacted_at: `${date}T12:00:00Z` });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record the transaction");
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="add-holding-modal" role="dialog" aria-modal="true" aria-labelledby="record-title">
        <div className="modal-heading">
          <h2 id="record-title">Record transaction</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        <form
          className="modal-fields"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="segmented record-kind" role="group" aria-label="Transaction type">
            {(["buy", "sell"] as const).map((option) => (
              <button
                type="button"
                key={option}
                aria-pressed={kind === option}
                className={kind === option ? `active ${option}` : ""}
                onClick={() => {
                  setKind(option);
                  if (option === "sell" && !held && holdings[0]) chooseTicker(holdings[0].ticker);
                }}
              >
                {option === "buy" ? "Buy" : "Sell"}
              </button>
            ))}
          </div>
          {kind === "sell" ? (
            <label>
              Holding
              <select value={held?.ticker ?? ""} onChange={(event) => chooseTicker(event.target.value)}>
                {holdings.map((holding) => (
                  <option key={holding.ticker} value={holding.ticker}>
                    {holding.ticker} · {Number(holding.shares).toLocaleString("en-US")} shares
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Symbol
              <input
                list="record-holdings"
                value={ticker}
                placeholder="AAPL"
                onChange={(event) => chooseTicker(event.target.value.toUpperCase())}
              />
              <datalist id="record-holdings">
                {holdings.map((holding) => (
                  <option key={holding.ticker} value={holding.ticker} />
                ))}
              </datalist>
            </label>
          )}
          <div className="fire-dialog-row">
            <label>
              Quantity
              <input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </label>
            <label>
              Price per share ({currency})
              <input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} />
            </label>
          </div>
          <label>
            Date
            <input type="date" max={today} value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          {Number.isFinite(total) && total > 0 && (
            <p className="notice" role="status">
              {kind === "buy" ? "Pays" : "Receives"} {money(total, currency)}
              {held ? ` · you hold ${Number(held.shares).toLocaleString("en-US")} ${held.ticker} now` : ""}
            </p>
          )}
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button primary" disabled={saving}>
            {saving ? "Saving…" : kind === "buy" ? "Record buy" : "Record sell"}
          </button>
        </form>
      </section>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}
