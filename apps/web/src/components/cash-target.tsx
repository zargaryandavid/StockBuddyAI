"use client";

import { Info } from "lucide-react";

import { cashShortfall } from "@/lib/analytics";
import type { Translate } from "@/lib/i18n/core";

/** "Cash balance" with an (i) that explains the cash target. */
export function CashLabel({ target, t }: { target: number; t: Translate }) {
  const help = t(
    "We suggest keeping at least {target}% of your portfolio in cash for emergencies and buying chances. Change it in Portfolio settings under Min cash (%).",
    { target: percent(target) },
  );
  return (
    <span className="cash-label">
      {t("Cash balance")}
      <span className="cash-info" role="img" tabIndex={0} title={help} aria-label={help}>
        <Info size={13} aria-hidden="true" />
      </span>
    </span>
  );
}

/** Next to the Cash field: "$0.00 / 0.0% · Target 5%: $4,980.17 (i)". */
export function CashSummary({
  cash,
  share,
  totalValue,
  target,
  formatMoney,
  t,
}: {
  cash: number;
  share: number;
  totalValue: number;
  target: number;
  formatMoney: (value: number) => string;
  t: Translate;
}) {
  const short = cashShortfall(cash, totalValue, target) > 0.005;
  const help = t(
    "We suggest keeping at least {target}% of your portfolio in cash for emergencies and buying chances. Change it in Portfolio settings under Min cash (%).",
    { target: percent(target) },
  );
  return (
    <span className={`cash-summary${short ? " short" : ""}`}>
      {formatMoney(cash)} / {(share * 100).toFixed(1)}% ·{" "}
      {t("Target {target}%: {amount}", {
        target: percent(target),
        amount: formatMoney(target * totalValue),
      })}
      <span className="cash-info" role="img" tabIndex={0} title={help} aria-label={help}>
        <Info size={13} aria-hidden="true" />
      </span>
    </span>
  );
}

/** "Target 5% · $4,980 to add", or a note that the target is met. */
export function cashTargetNote(
  cash: number,
  totalValue: number,
  target: number,
  formatMoney: (value: number) => string,
  t: Translate,
) {
  const missing = cashShortfall(cash, totalValue, target);
  return missing > 0.005
    ? t("Target {target}% · {amount} to add", { target: percent(target), amount: formatMoney(missing) })
    : t("Target {target}% · met", { target: percent(target) });
}

function percent(value: number) {
  return String(Number((value * 100).toFixed(1)));
}
