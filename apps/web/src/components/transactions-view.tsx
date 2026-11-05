"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";

import type { Portfolio, PortfolioTransaction } from "@/lib/api";
import { useT } from "@/lib/i18n/client";
import { money } from "@/lib/portfolio-metrics";
import { EmptyState } from "@/components/empty-state";

export type TransactionInput = {
  ticker: string;
  kind: "buy" | "sell";
  quantity: number;
  price: number;
  transacted_at: string;
  /** A past trade already in the holdings: kept in the history without changing them. */
  history_only?: boolean;
};

type Holding = { ticker: string; shares: number; price?: number | null; name?: string | null };

/** The stock list's choice for typing a symbol that isn't held. */
const NEW_SYMBOL = "__new__";
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
  onEdit,
  onRemove,
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
  /** Changes a recorded trade; `adjustHoldings` makes the holdings follow. */
  onEdit?: (id: string, transaction: TransactionInput, adjustHoldings: boolean) => Promise<void>;
  /** Removes a recorded trade; `adjustHoldings` undoes its effect on the holdings. */
  onRemove?: (id: string, adjustHoldings: boolean) => Promise<void>;
}) {
  const t = useT();
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<PortfolioTransaction | null>(null);
  const [removing, setRemoving] = useState<PortfolioTransaction | null>(null);
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
          <h1 id="transactions-title">{t("Transactions")}</h1>
          <p className="muted page-subtitle">
            {t("Every buy and sell updates your holdings and average cost.")}
          </p>
        </div>
        <div className="transactions-actions">
          <label>
            {t("Portfolio")}
            <select
              aria-label={t("Transaction portfolio")}
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
            {t("Record transaction")}
          </button>
        </div>
      </header>
      {blockedReason && <p className="notice">{blockedReason}</p>}

      <div className="transactions-summary" aria-label={t("Transaction totals")}>
        <article className="summary-card">
          <span>{t("Transactions")}</span>
          <strong>{transactions.length}</strong>
        </article>
        <article className="summary-card">
          <span>{t("Bought")}</span>
          <strong>{money(totals.bought, currency)}</strong>
        </article>
        <article className="summary-card">
          <span>{t("Sold")}</span>
          <strong>{money(totals.sold, currency)}</strong>
        </article>
        <article className={`summary-card ${totals.net >= 0 ? "" : "negative"}`}>
          <span>{t("Net invested")}</span>
          <strong>{money(totals.net, currency)}</strong>
        </article>
      </div>

      {loading ? (
        <p className="muted">{t("Loading transactions…")}</p>
      ) : transactions.length === 0 ? (
        <EmptyState
          art="transactions"
          title={t("No transactions yet")}
          text={t(
            "Record what you bought and sold, with dates and prices. MyPortfolioBuddy updates your holdings and average cost for you.",
          )}
          action={
            <button
              type="button"
              className="button primary transactions-record"
              disabled={Boolean(blockedReason)}
              onClick={() => setRecording(true)}
            >
              <Plus size={16} aria-hidden="true" />
              {t("Record your first transaction")}
            </button>
          }
        />
      ) : (
        <>
          <div className="transactions-filters">
            <div className="segmented" role="group" aria-label={t("Show")}>
              {(["all", "buy", "sell"] as const).map((option) => (
                <button
                  type="button"
                  key={option}
                  aria-pressed={filter === option}
                  className={filter === option ? "active" : ""}
                  onClick={() => setFilter(option)}
                >
                  {option === "all" ? t("All") : option === "buy" ? t("Buys") : t("Sells")}
                </button>
              ))}
            </div>
            <label className="transactions-search">
              <Search size={15} aria-hidden="true" />
              <input
                aria-label={t("Filter by symbol")}
                placeholder={t("Filter by symbol")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          <div className="transactions-table" role="table" aria-label={t("Portfolio transaction history")}>
            <div className="transactions-row transactions-header" role="row">
              <span role="columnheader">{t("Date")}</span>
              <span role="columnheader">{t("Type")}</span>
              <span role="columnheader">{t("Symbol")}</span>
              <span role="columnheader">{t("Quantity")}</span>
              <span role="columnheader">{t("Price")}</span>
              <span role="columnheader">{t("Total")}</span>
              <span role="columnheader">
                <span className="sr-only">{t("Actions")}</span>
              </span>
            </div>
            {visible.map((item) => (
              <div className="transactions-row" role="row" key={item.id}>
                <time role="cell" dateTime={item.transacted_at}>
                  {formatDate(item.transacted_at)}
                </time>
                <span role="cell">
                  <span className={`transaction-kind ${item.kind}`}>
                    {item.kind === "buy" ? t("Buy") : t("Sell")}
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
                <span role="cell" className="transactions-row-actions">
                  {onEdit && (
                    <button
                      type="button"
                      aria-label={t("Edit {kind} of {ticker}", { kind: item.kind === "buy" ? t("Buy") : t("Sell"), ticker: item.ticker })}
                      title={t("Edit")}
                      disabled={Boolean(blockedReason)}
                      onClick={() => setEditing(item)}
                    >
                      <Pencil size={14} aria-hidden="true" />
                    </button>
                  )}
                  {onRemove && (
                    <button
                      type="button"
                      aria-label={t("Remove {kind} of {ticker}", { kind: item.kind === "buy" ? t("Buy") : t("Sell"), ticker: item.ticker })}
                      title={t("Remove")}
                      disabled={Boolean(blockedReason)}
                      onClick={() => setRemoving(item)}
                    >
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  )}
                </span>
              </div>
            ))}
            {visible.length === 0 && (
              <p className="muted transactions-none">{t("No transactions match this filter.")}</p>
            )}
          </div>
        </>
      )}

      {editing && onEdit && (
        <RecordDialog
          holdings={holdings}
          currency={currency}
          today={today}
          existing={editing}
          onClose={() => setEditing(null)}
          onSave={async (transaction, adjustHoldings) => {
            await onEdit(editing.id, transaction, adjustHoldings ?? true);
            setEditing(null);
          }}
        />
      )}
      {removing && onRemove && (
        <RemoveDialog
          transaction={removing}
          currency={currency}
          onClose={() => setRemoving(null)}
          onRemove={async (adjustHoldings) => {
            await onRemove(removing.id, adjustHoldings);
            setRemoving(null);
          }}
        />
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

/** Record (or edit) a trade: any holding or a new symbol, buy or sell, with its price and date. */
export function RecordDialog({
  holdings,
  currency,
  today,
  existing = null,
  initialTicker,
  onClose,
  onSave,
}: {
  holdings: Holding[];
  currency: string;
  today: string;
  /** A recorded trade to edit, filled in. */
  existing?: PortfolioTransaction | null;
  /** The holding to start on, e.g. the row whose ⋯ menu opened the form. */
  initialTicker?: string;
  onClose: () => void;
  onSave: (transaction: TransactionInput, adjustHoldings?: boolean) => Promise<void>;
}) {
  const t = useT();
  const [kind, setKind] = useState<"buy" | "sell">(existing?.kind ?? "buy");
  const [ticker, setTicker] = useState(existing?.ticker ?? initialTicker ?? holdings[0]?.ticker ?? "");
  const [quantity, setQuantity] = useState(existing ? String(existing.quantity) : "");
  const held = holdings.find((holding) => holding.ticker.toUpperCase() === ticker.trim().toUpperCase());
  const [price, setPrice] = useState(
    existing
      ? String(Number(existing.price))
      : held?.price != null
        ? String(Math.round(Number(held.price) * 100) / 100)
        : "",
  );
  const [date, setDate] = useState(existing ? existing.transacted_at.slice(0, 10) : today);
  const [historyOnly, setHistoryOnly] = useState(false);
  // Buying a stock that isn't held yet: its symbol is typed in.
  const [typingNew, setTypingNew] = useState(!holdings.length || Boolean(existing && !held));
  // Editing: whether the holdings follow the change (on unless the person turns it off).
  const [adjustHoldings, setAdjustHoldings] = useState(true);
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
    if (!/^[A-Z0-9.-]{1,12}$/.test(symbol)) return setError(t("Enter a valid ticker symbol."));
    if (!(shares > 0) || !Number.isInteger(shares)) return setError(t("Enter a whole number of shares above 0."));
    if (!(each >= 0) || price === "") return setError(t("Enter the price per share."));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today) return setError(t("Pick a date that is not in the future."));
    if (kind === "sell" && !historyOnly && !existing) {
      if (!held) return setError(t("You don't hold {ticker} in this portfolio.", { ticker: symbol }));
      if (shares > Number(held.shares)) {
        return setError(
          t("You hold {shares} {ticker}; you can't sell more than that.", {
            shares: Number(held.shares).toLocaleString("en-US"),
            ticker: symbol,
          }),
        );
      }
    }
    setError(null);
    setSaving(true);
    try {
      await onSave(
        {
          ticker: symbol,
          kind,
          quantity: shares,
          price: each,
          transacted_at: `${date}T12:00:00Z`,
          ...(historyOnly && !existing ? { history_only: true } : {}),
        },
        existing ? adjustHoldings : undefined,
      );
    } catch (cause) {
      setError(cause instanceof Error ? t(cause.message) : t("Could not record the transaction"));
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
          <h2 id="record-title">{existing ? t("Edit transaction") : t("Record transaction")}</h2>
          <button type="button" aria-label={t("Close")} onClick={onClose}>
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
          <div className="segmented record-kind" role="group" aria-label={t("Transaction type")}>
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
                {option === "buy" ? t("Buy") : t("Sell")}
              </button>
            ))}
          </div>
          {kind === "sell" ? (
            <label>
              {t("Holding")}
              <select value={held?.ticker ?? ""} onChange={(event) => chooseTicker(event.target.value)}>
                {holdings.map((holding) => (
                  <option key={holding.ticker} value={holding.ticker}>
                    {t("{ticker} · {shares} shares", {
                      ticker: holding.ticker,
                      shares: Number(holding.shares).toLocaleString("en-US"),
                    })}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              <label>
                {t("Stock")}
                <select
                  value={typingNew ? NEW_SYMBOL : held?.ticker ?? NEW_SYMBOL}
                  onChange={(event) => {
                    if (event.target.value === NEW_SYMBOL) {
                      setTypingNew(true);
                      setTicker("");
                      setPrice("");
                    } else {
                      setTypingNew(false);
                      chooseTicker(event.target.value);
                    }
                  }}
                >
                  {holdings.map((holding) => (
                    <option key={holding.ticker} value={holding.ticker}>
                      {holding.name
                        ? t("{ticker} · {name} · {shares} shares", {
                            ticker: holding.ticker,
                            name: holding.name,
                            shares: Number(holding.shares).toLocaleString("en-US"),
                          })
                        : t("{ticker} · {shares} shares", {
                            ticker: holding.ticker,
                            shares: Number(holding.shares).toLocaleString("en-US"),
                          })}
                    </option>
                  ))}
                  <option value={NEW_SYMBOL}>{t("Another stock…")}</option>
                </select>
              </label>
              {(typingNew || !held) && (
                <label>
                  {t("Symbol")}
                  <input
                    value={ticker}
                    placeholder="AAPL"
                    autoFocus={typingNew}
                    onChange={(event) => chooseTicker(event.target.value.toUpperCase().replace(/\s/g, ""))}
                  />
                </label>
              )}
            </>
          )}
          <div className="fire-dialog-row">
            <label>
              {t("Quantity")}
              <input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </label>
            <label>
              {t("Price per share ({currency})", { currency })}
              <input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} />
            </label>
          </div>
          <label>
            {t("Date")}
            <input type="date" max={today} value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          {existing ? (
            <label className="record-history-only">
              <input type="checkbox" checked={adjustHoldings} onChange={(event) => setAdjustHoldings(event.target.checked)} />
              <span>
                <strong>{t("Update my holdings too")}</strong>
                <small className="muted">
                  {t("The old trade comes out of your holdings and the changed one goes in. Turn off to change only the history.")}
                </small>
              </span>
            </label>
          ) : (
            <label className="record-history-only">
              <input type="checkbox" checked={historyOnly} onChange={(event) => setHistoryOnly(event.target.checked)} />
              <span>
                <strong>{t("Already in my holdings")}</strong>
                <small className="muted">
                  {t("Add this past trade to the history only. Your holdings and average cost stay as they are.")}
                </small>
              </span>
            </label>
          )}
          {Number.isFinite(total) && total > 0 && (
            <p className="notice" role="status">
              {existing
                ? t(kind === "buy" ? "Pays {amount}" : "Receives {amount}", { amount: money(total, currency) })
                : historyOnly
                ? t("History only: {kind} of {amount} on {date}. Holdings won't change.", {
                    amount: money(total, currency),
                    kind: kind === "buy" ? t("Buy") : t("Sell"),
                    date,
                  })
                : held
                ? t(
                    kind === "buy"
                      ? "Pays {amount} · you hold {shares} {ticker} now"
                      : "Receives {amount} · you hold {shares} {ticker} now",
                    {
                      amount: money(total, currency),
                      shares: Number(held.shares).toLocaleString("en-US"),
                      ticker: held.ticker,
                    },
                  )
                : t(kind === "buy" ? "Pays {amount}" : "Receives {amount}", {
                    amount: money(total, currency),
                  })}
            </p>
          )}
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button primary" disabled={saving}>
            {saving
              ? t("Saving…")
              : existing
                ? t("Save changes")
                : historyOnly
                  ? t("Add to history")
                  : kind === "buy"
                    ? t("Record buy")
                    : t("Record sell")}
          </button>
        </form>
      </section>
    </div>
  );
}

/** Asks before removing a trade, and whether the holdings should follow. */
function RemoveDialog({
  transaction,
  currency,
  onClose,
  onRemove,
}: {
  transaction: PortfolioTransaction;
  currency: string;
  onClose: () => void;
  onRemove: (adjustHoldings: boolean) => Promise<void>;
}) {
  const t = useT();
  const [adjustHoldings, setAdjustHoldings] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buy = transaction.kind === "buy";

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
      <section className="add-holding-modal confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="remove-trade-title">
        <h2 id="remove-trade-title">{t("Remove this transaction?")}</h2>
        <p className="muted">
          {t(buy ? "Buy of {quantity} {ticker} at {price} on {date}." : "Sell of {quantity} {ticker} at {price} on {date}.", {
            quantity: Number(transaction.quantity).toLocaleString("en-US"),
            ticker: transaction.ticker,
            price: money(Number(transaction.price), currency),
            date: formatDate(transaction.transacted_at),
          })}
        </p>
        <label className="record-history-only">
          <input type="checkbox" checked={adjustHoldings} onChange={(event) => setAdjustHoldings(event.target.checked)} />
          <span>
            <strong>{buy ? t("Also take these shares out of my holdings") : t("Also put these shares back into my holdings")}</strong>
            <small className="muted">
              {t("Turn off if this trade was a mistake that never changed your holdings.")}
            </small>
          </span>
        </label>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <div className="confirm-actions">
          <button type="button" className="button" onClick={onClose} disabled={busy} autoFocus>
            {t("Cancel")}
          </button>
          <button
            type="button"
            className="button danger"
            disabled={busy}
            aria-busy={busy}
            onClick={async () => {
              setBusy(true);
              setError(null);
              try {
                await onRemove(adjustHoldings);
              } catch (cause) {
                setError(cause instanceof Error ? t(cause.message) : t("Could not change the transaction"));
                setBusy(false);
              }
            }}
          >
            {busy ? t("Removing…") : t("Remove")}
          </button>
        </div>
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
