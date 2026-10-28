"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ArrowRight, ScrollText } from "lucide-react";

import { api } from "@/lib/api";
import { bondHoldings, type BondHolding, type FireEntry, type FxRates } from "@/lib/fire";
import { useT } from "@/lib/i18n/client";
import { InfoPopover } from "@/components/info-popover";
import { EmptyState } from "@/components/empty-state";
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

/** Calls `onVisible` once, the first time the element scrolls into view. */
export function useOnVisible(box: RefObject<HTMLElement | null>, onVisible?: () => void) {
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
  }, [box, onVisible]);
}

/** Your age in bonds, the rest in stocks: the rule of thumb, with your own numbers. */
function AgeInBondsInfo({ bondShare }: { bondShare: number | null }) {
  const t = useT();
  const [age, setAge] = useState<number | null | undefined>(undefined);
  return (
    <span
      onClickCapture={() => {
        if (age !== undefined) return;
        api<{ date_of_birth?: string | null }>("/api/profile")
          .then((profile) => setAge(ageFrom(profile?.date_of_birth ?? null)))
          .catch(() => setAge(null));
      }}
    >
      <InfoPopover label={t("About bonds and your age")} align="left">
        <strong>{t("Rule of thumb: your age in bonds")}</strong>
        <span>
          {t(
            "Keep roughly your age as a percentage in bonds and the rest in stocks (the \"100 minus your age\" rule). Bonds swing less, so the share grows as you get closer to needing the money.",
          )}
        </span>
        {age === undefined ? null : age == null ? (
          <span className="muted">{t("Add your date of birth in your profile to see your own numbers.")}</span>
        ) : (
          <span>
            {t("At {age}: about {bonds}% bonds and {stocks}% stocks.", {
              age,
              bonds: Math.min(100, age),
              stocks: Math.max(0, 100 - age),
            })}
            {bondShare != null && ` ${t("You have {share}% in bonds now.", { share: (bondShare * 100).toFixed(0) })}`}
          </span>
        )}
        <span className="muted">{t("A rule of thumb, not advice; your own plan may differ.")}</span>
      </InfoPopover>
    </span>
  );
}

function ageFrom(dateOfBirth: string | null) {
  if (!dateOfBirth) return null;
  const born = new Date(`${dateOfBirth.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  if (now.getUTCMonth() < born.getUTCMonth() || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate())) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** Read-only list of the bonds from FIRE, under the holdings on the Portfolio page. */
export function BondsSection({
  bonds,
  total,
  loading,
  currency,
  stocksValue = null,
  onEdit,
  onVisible,
}: {
  bonds: BondHolding[];
  total: number;
  loading: boolean;
  currency: string;
  /** Holdings value, for "you have X% in bonds now". */
  stocksValue?: number | null;
  onEdit: () => void;
  /** Called once when the section first scrolls into view. */
  onVisible?: () => void;
}) {
  const t = useT();
  const box = useRef<HTMLElement>(null);
  useOnVisible(box, onVisible);
  const yearly = bonds.reduce((sum, bond) => sum + (bond.yearlyIncome ?? 0), 0);
  return (
    <section ref={box} className="panel bonds-section" aria-labelledby="bonds-title">
      <div className="bonds-heading">
        <div>
          <h2 id="bonds-title">
            <ScrollText size={17} aria-hidden="true" />
            {t("Bonds")}
            <AgeInBondsInfo
              bondShare={!loading && stocksValue != null && total + stocksValue > 0 ? total / (total + stocksValue) : null}
            />
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
        <EmptyState art="bond" compact title={t("No bonds yet")} text={t("No bonds yet. Add one in FIRE as income of the type Bond.")} />
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
