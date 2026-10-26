"use client";

import { useT } from "@/lib/i18n/client";
import { money } from "@/lib/portfolio-metrics";

import { portfolioTotals, type SharedPortfolio } from "./types";

const percent = (value: number) => `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;

/** Read-only portfolio: totals and every holding with its value, weight, and gain. */
export function SharedPortfolioView({ portfolio }: { portfolio: SharedPortfolio }) {
  const t = useT();
  const currency = portfolio.base_currency || "USD";
  const totals = portfolioTotals(portfolio);
  const gain = totals.cost > 0 ? totals.holdings - totals.cost : null;
  const rows = portfolio.positions
    .map((position) => {
      const value = position.price == null ? null : position.price * Number(position.shares);
      const cost = position.purchase_price == null ? null : position.purchase_price * Number(position.shares);
      return { ...position, value, gain: value != null && cost ? (value - cost) / cost : null };
    })
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return (
    <>
      <section className="share-tiles" aria-label={t("Portfolio summary")}>
        <Tile label={t("Total value")} value={money(totals.total, currency)} />
        <Tile label={t("Holdings")} value={money(totals.holdings, currency)} />
        <Tile label={t("Cash")} value={money(totals.cash, currency)} />
        {gain != null && (
          <Tile
            label={t("Unrealized gain")}
            value={`${money(gain, currency)} (${percent(gain / totals.cost)})`}
            tone={gain >= 0 ? "up" : "down"}
          />
        )}
      </section>
      <section className="share-panel" aria-labelledby="share-holdings-title">
        <h2 id="share-holdings-title">{t("Holdings · {count}", { count: rows.length })}</h2>
        <div className="share-table-wrap">
          <table className="share-table">
            <thead>
              <tr>
                <th scope="col">{t("Holding")}</th>
                <th scope="col">{t("Shares")}</th>
                <th scope="col">{t("Price")}</th>
                <th scope="col">{t("Value")}</th>
                <th scope="col">{t("Weight")}</th>
                <th scope="col">{t("Gain")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.ticker}>
                  <th scope="row">
                    <strong>{row.ticker}</strong>
                    <span>{row.name ?? row.sector ?? ""}</span>
                  </th>
                  <td>{Number(row.shares).toLocaleString("en-US")}</td>
                  <td>{row.price == null ? "—" : money(row.price, currency)}</td>
                  <td>{row.value == null ? "—" : money(row.value, currency)}</td>
                  <td>{row.value == null || !totals.total ? "—" : `${((row.value / totals.total) * 100).toFixed(1)}%`}</td>
                  <td className={row.gain == null ? "" : row.gain >= 0 ? "up" : "down"}>{row.gain == null ? "—" : percent(row.gain)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

export function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "up" | "down" }) {
  return (
    <article className="share-tile">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
      {note && <small>{note}</small>}
    </article>
  );
}
