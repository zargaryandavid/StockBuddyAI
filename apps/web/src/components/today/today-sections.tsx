"use client";

import { ArrowDownRight, ArrowRight, ArrowUpRight, CalendarDays, Newspaper, TrendingUp } from "lucide-react";

import { useI18n } from "@/lib/i18n/client";
import { money, signedMoney } from "@/lib/portfolio-metrics";
import { HIDDEN_AMOUNT } from "@/lib/privacy";
import type { CashFlowDay, Mover } from "@/lib/today";
import { ShimmerLines } from "@/components/shimmer";

/** "Wed, Oct 29" (or the Armenian equivalent) for a YYYY-MM-DD day. */
function dayLabel(day: string, locale: string) {
  return new Intl.DateTimeFormat(locale === "hy" ? "hy-AM" : "en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

/** The holdings that moved most today, up and down, with what the move means for you. */
export function TodayMovers({
  hidden = false,
  movers,
  dayChange,
  holdingsValue,
  currency,
  today,
  onOpen,
}: {
  /** Money amounts show as •••••; percentages still show. */
  hidden?: boolean;
  /** Null while prices load. */
  movers: { up: Mover[]; down: Mover[] } | null;
  /** All holdings together: today's change and what they are worth now. */
  dayChange: number;
  holdingsValue: number;
  currency: string;
  today: string;
  onOpen: () => void;
}) {
  const { t, locale } = useI18n();
  const before = holdingsValue - dayChange;
  const dayPct = before > 0 ? (dayChange / before) * 100 : null;
  const pct = (value: number) => `${value > 0 ? "+" : ""}${value.toFixed(2)}%`;
  const m = (value: number) => (hidden ? HIDDEN_AMOUNT : money(value, currency));
  const sm = (value: number) => (hidden ? HIDDEN_AMOUNT : signedMoney(value, currency));
  const priceDate = movers ? [...movers.up, ...movers.down].map((item) => item.priceDate).find(Boolean) : null;
  const groups = movers
    ? [
        { key: "up", title: t("Up the most"), rows: movers.up },
        { key: "down", title: t("Down the most"), rows: movers.down },
      ].filter((group) => group.rows.length)
    : [];

  return (
    <article className="panel today-list today-movers" aria-labelledby="movers-title">
      <h2 id="movers-title">
        <TrendingUp size={17} aria-hidden="true" />
        {t("Stocks today")}
      </h2>
      {priceDate && priceDate !== today && (
        <p className="muted today-note">{t("Price moves of {day}, the latest trading day.", { day: dayLabel(priceDate, locale) })}</p>
      )}
      {movers && holdingsValue > 0 && (
        <p className={`mover-summary ${dayChange >= 0 ? "positive" : "negative"}`}>
          <span>{t("Your portfolio today")}</span>
          <strong>
            {sm(dayChange)}
            {dayPct != null && ` (${pct(dayPct)})`}
          </strong>
          <small className="muted">{t("now worth {amount}", { amount: m(holdingsValue) })}</small>
        </p>
      )}
      {!movers ? (
        <ShimmerLines label={t("Loading prices…")} lines={3} />
      ) : groups.length === 0 ? (
        <p className="muted">{t("No price moves to show yet. Add holdings in Portfolio to see them here.")}</p>
      ) : (
        groups.map((group) => (
          <div key={group.key} className="mover-group">
            <div className="mover-head" aria-hidden="true">
              <h3>{group.title}</h3>
              <span>{t("Stock")}</span>
              <span>{t("Your money")}</span>
            </div>
            <ul>
              {group.rows.map((item) => {
                const up = item.pct > 0;
                const Arrow = up ? ArrowUpRight : ArrowDownRight;
                return (
                  <li key={item.ticker} className={`mover-row ${up ? "positive" : "negative"}`}>
                    <button type="button" className="mover-main" onClick={onOpen}>
                      <Arrow size={16} aria-hidden="true" className="mover-arrow" />
                      <span className="mover-name">
                        <strong>{item.ticker}</strong>
                        {item.name && <small className="muted">{item.name}</small>}
                      </span>
                      <span className="mover-numbers">
                        <strong>
                          {signedMoney(item.change, currency)} ({pct(item.pct)})
                        </strong>
                        {item.price != null && (
                          <small>{t("now {price} a share", { price: money(item.price, currency) })}</small>
                        )}
                      </span>
                      <span className="mover-impact">
                        <strong>{sm(item.impact)}</strong>
                        <small className="muted">
                          {item.value != null
                            ? t("{shares} shares · {value}", {
                                shares: Number(item.shares.toFixed(4)),
                                value: m(item.value),
                              })
                            : t("{shares} shares", { shares: Number(item.shares.toFixed(4)) })}
                        </small>
                      </span>
                    </button>
                    <a
                      className="mover-news"
                      href={`https://finance.yahoo.com/quote/${encodeURIComponent(item.ticker)}/news`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t("News about {ticker}", { ticker: item.ticker })}
                      title={t("What happened? Read the news")}
                    >
                      <Newspaper size={15} aria-hidden="true" />
                      <span>{t("News")}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </article>
  );
}

/** Income and expenses from the FIRE plan that fall today. */
export function TodayCashFlows({
  hidden = false,
  flows,
  currency,
  today,
  onOpen,
}: {
  /** Money amounts show as •••••. */
  hidden?: boolean;
  /** Today's; null while loading. */
  flows: CashFlowDay[] | null;
  currency: string;
  today: string;
  onOpen: () => void;
}) {
  const { t, locale } = useI18n();
  const todays = (flows ?? []).filter((item) => item.date === today);
  const total = (kind: "income" | "expense") =>
    todays.filter((item) => item.kind === kind).reduce((sum, item) => sum + (item.baseAmount ?? 0), 0);
  const income = total("income");
  const spend = total("expense");

  const row = (item: CashFlowDay) => (
    <li key={`${item.date}-${item.kind}-${item.name}`} className={`flow-row ${item.kind}`}>
      <span className="flow-name">{item.name}</span>
      <strong className={item.kind === "income" ? "positive" : "negative"}>
        {`${item.kind === "income" ? "+" : "−"}${hidden ? HIDDEN_AMOUNT : money(item.amount, item.currency)}`}
      </strong>
    </li>
  );

  return (
    <article className="panel today-list today-flows" aria-labelledby="flows-title">
      <h2 id="flows-title">
        <CalendarDays size={17} aria-hidden="true" />
        {t("Income and expenses")}
      </h2>
      {!flows ? (
        <ShimmerLines label={t("Loading your plan…")} lines={3} />
      ) : (
        <>
          <div className="flow-group">
            <h3>{t("Today, {day}", { day: dayLabel(today, locale) })}</h3>
            {todays.length === 0 ? (
              <p className="muted">{t("Nothing due today.")}</p>
            ) : (
              <>
                <ul>{todays.map(row)}</ul>
                <p className="flow-totals">
                  {income > 0 && <span className="positive">{t("In {amount}", { amount: hidden ? HIDDEN_AMOUNT : money(income, currency) })}</span>}
                  {spend > 0 && <span className="negative">{t("Out {amount}", { amount: hidden ? HIDDEN_AMOUNT : money(spend, currency) })}</span>}
                </p>
              </>
            )}
          </div>
        </>
      )}
      <button type="button" className="text-button today-more" onClick={onOpen}>
        {t("See all in FIRE")}
        <ArrowRight size={14} aria-hidden="true" />
      </button>
    </article>
  );
}
