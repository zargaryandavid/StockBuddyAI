"use client";

import { Info } from "lucide-react";

import { InfoPopover } from "@/components/info-popover";
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

/** The cash numbers behind the (i) beside the Cash field: amount, share and target. */
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
  const missing = cashShortfall(cash, totalValue, target);
  return (
    <InfoPopover label={t("About the cash target")} align="right">
      <span className={`cash-summary${missing > 0.005 ? " short" : ""}`}>
        <strong>
          {formatMoney(cash)} / {(share * 100).toFixed(1)}%
        </strong>
        <span>
          {t("Target {target}%: {amount}", { target: percent(target), amount: formatMoney(target * totalValue) })}
        </span>
        <span>
          {missing > 0.005
            ? t("{amount} to add to reach the target", { amount: formatMoney(missing) })
            : t("Target met · {amount} above it", { amount: formatMoney(Math.max(0, cash - target * totalValue)) })}
        </span>
      </span>
      <span>
        {t(
          "We suggest keeping at least {target}% of your portfolio in cash for emergencies and buying chances. Change it in Portfolio settings under Min cash (%).",
          { target: percent(target) },
        )}
      </span>
    </InfoPopover>
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
