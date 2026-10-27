"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ScrollText } from "lucide-react";

import { api } from "@/lib/api";
import { bondHoldings, type BondHolding, type FireEntry, type FxRates } from "@/lib/fire";
import { useT } from "@/lib/i18n/client";
import { ShimmerLines } from "@/components/shimmer";
import { money } from "@/lib/portfolio-metrics";

/**
 * The bonds entered in FIRE, valued in `currency`. They are entered once, in FIRE, and
 * shown here so the portfolio's mix is complete without counting them twice.
 */
export function useBondHoldings(currency: string, today: string, enabled = true) {
  const [entries, setEntries] = useState<FireEntry[] | null>(null);
  const [rates, setRates] = useState<FxRates>({});

  // Loaded the first time they are needed (the Bonds section comes into view, or Analytics).
  useEffect(() => {
    if (!enabled || entries != null) return;
    let active = true;
    api<FireEntry[]>("/api/fire/entries")
      .then((rows) => {
        if (active) setEntries(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (active) setEntries([]);
      });
    return () => {
      active = false;
    };
  }, [enabled, entries]);

  const foreign = useMemo(
    () =>
      [...new Set(bondHoldings(entries ?? [], today).map((bond) => bond.currency).filter((code) => code && code !== currency))]
        .sort()
        .join(","),
    [entries, today, currency],
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

  const bonds = useMemo(() => bondHoldings(entries ?? [], today, rates, currency), [entries, today, rates, currency]);
  const total = bonds.reduce((sum, bond) => sum + (bond.faceValue ?? 0), 0);
  return { bonds, total, loading: entries == null };
}

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  semiannual: "Twice a year",
  annual: "Yearly",
  once: "At maturity",
};

/** Read-only list of the bonds from FIRE, under the holdings on the Portfolio page. */
export function BondsSection({
  bonds,
  total,
  loading,
  currency,
  onEdit,
  onVisible,
}: {
  bonds: BondHolding[];
  total: number;
  loading: boolean;
  currency: string;
  onEdit: () => void;
  /** Called once when the section first scrolls into view. */
  onVisible?: () => void;
}) {
  const t = useT();
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = box.current;
    if (!node || !onVisible || typeof IntersectionObserver === "undefined") return;
    const watcher = new IntersectionObserver((seen) => {
      if (seen.some((item) => item.isIntersecting)) {
        onVisible();
        watcher.disconnect();
      }
    });
    watcher.observe(node);
    return () => watcher.disconnect();
  }, [onVisible]);
  const yearly = bonds.reduce((sum, bond) => sum + (bond.yearlyIncome ?? 0), 0);
  return (
    <section ref={box} className="panel bonds-section" aria-labelledby="bonds-title">
      <div className="bonds-heading">
        <div>
          <h2 id="bonds-title">
            <ScrollText size={17} aria-hidden="true" />
            {t("Bonds")}
          </h2>
          <p className="muted">
            {t("Entered in FIRE and shown here so your mix is complete. Valued at face value; not part of the portfolio value above.")}
          </p>
        </div>
        <button type="button" className="button" onClick={onEdit}>
          {bonds.length ? t("Edit in FIRE") : t("Add a bond in FIRE")}
          <ArrowRight size={14} aria-hidden="true" />
        </button>
      </div>
      {loading ? (
        <ShimmerLines label={t("Loading bonds…")} lines={2} />
      ) : bonds.length === 0 ? (
        <p className="muted">{t("No bonds yet. Add one in FIRE as income of the type Bond.")}</p>
      ) : (
        <>
          <div className="bonds-table" role="table" aria-label={t("Bonds")}>
            <div role="row" className="bonds-row bonds-head">
              <span role="columnheader">{t("Bond")}</span>
              <span role="columnheader">{t("Face value")}</span>
              <span role="columnheader">{t("Coupon")}</span>
              <span role="columnheader">{t("Pays")}</span>
              <span role="columnheader">{t("Matures")}</span>
              <span role="columnheader">{t("Income a year")}</span>
            </div>
            {bonds.map((bond) => (
              <div role="row" className="bonds-row" key={bond.id}>
                <span role="cell">
                  <strong>{bond.name}</strong>
                  {bond.quantity != null && bond.unitPrice != null && (
                    <small className="muted">
                      {t("{count} × {price}", { count: bond.quantity, price: money(bond.unitPrice, bond.currency) })}
                    </small>
                  )}
                </span>
                <span role="cell">
                  {bond.faceValue == null ? money(bond.faceValueOwn, bond.currency) : money(bond.faceValue, currency)}
                  {bond.currency !== currency && bond.faceValue != null && (
                    <small className="muted">{money(bond.faceValueOwn, bond.currency)}</small>
                  )}
                </span>
                <span role="cell">{bond.couponPct.toFixed(2)}%</span>
                <span role="cell">{t(FREQUENCY_LABELS[bond.frequency] ?? bond.frequency)}</span>
                <span role="cell">{bond.maturity ?? "—"}</span>
                <span role="cell">{bond.yearlyIncome == null ? "—" : money(bond.yearlyIncome, currency)}</span>
              </div>
            ))}
            <div role="row" className="bonds-row bonds-total">
              <span role="cell">{t("Total")}</span>
              <span role="cell">{money(total, currency)}</span>
              <span role="cell" />
              <span role="cell" />
              <span role="cell" />
              <span role="cell">{money(yearly, currency)}</span>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
