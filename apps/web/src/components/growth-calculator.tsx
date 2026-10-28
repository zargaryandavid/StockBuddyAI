"use client";

import { useMemo, useState } from "react";

import { AmountInput } from "@/components/amount-input";
import { AnimatedNumber } from "@/components/animated-number";
import { InfoPopover } from "@/components/info-popover";
import { niceTicks, projectGrowth } from "@/lib/growth";
import { useT } from "@/lib/i18n/client";

const WIDTH = 720;
const HEIGHT = 280;

function whole(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
}

function short(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: value >= 1e6 ? 2 : 0,
  }).format(value);
}

/** Values to open the calculator with, e.g. from the FIRE plan. */
export type GrowthStart = { principal: number; monthly: number; rate: number };

/** How money grows with a starting amount, a monthly contribution and a yearly return. */
export function GrowthCalculator({
  portfolioValue,
  currency,
  start = null,
}: {
  portfolioValue: number;
  currency: string;
  start?: GrowthStart | null;
}) {
  const t = useT();
  const startingGuess = portfolioValue > 0 ? Math.round(portfolioValue / 1000) * 1000 : 10000;
  const [principal, setPrincipal] = useState(() => (start ? Math.round(start.principal) : startingGuess));
  const [monthly, setMonthly] = useState(() => (start ? Math.round(start.monthly) : 500));
  const [years, setYears] = useState(20);
  const [rate, setRate] = useState(() => (start ? Math.min(20, Math.max(0, start.rate)) : 7));
  const [hover, setHover] = useState<number | null>(null);

  const result = useMemo(
    () => projectGrowth({ principal, monthly, years, annualReturnPct: rate }),
    [principal, monthly, years, rate],
  );
  const ticks = niceTicks(Math.max(result.futureValue, result.contributed));
  const top = ticks[ticks.length - 1] || 1;
  const x = (year: number) => (years ? (year / years) * WIDTH : 0);
  const y = (value: number) => HEIGHT - (value / top) * HEIGHT;
  const valueLine = result.points.map((point, index) => `${index ? "L" : "M"}${x(point.year).toFixed(1)},${y(point.value).toFixed(1)}`).join(" ");
  const area = `${valueLine} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;
  const contributedLine = result.points
    .map((point, index) => `${index ? "L" : "M"}${x(point.year).toFixed(1)},${y(point.contributed).toFixed(1)}`)
    .join(" ");
  const yearStep = Math.max(1, Math.ceil(years / 5));
  const yearLabels = result.points.filter((point) => point.year % yearStep === 0 || point.year === years);
  const shown = hover == null ? null : result.points[hover];
  const money = (value: number) => whole(value, currency);

  return (
    <section className="growth-page" aria-labelledby="growth-title">
      <header className="growth-heading">
        <h1 id="growth-title">
          {t("Growth calculator")}
          <InfoPopover label={t("About the growth calculator")} align="left">
            <span>
              {t(
                "Shows how a starting amount and a monthly contribution could grow at a steady yearly return, compounded monthly. Real markets go up and down, so treat it as a picture of the long run, not a promise.",
              )}
            </span>
          </InfoPopover>
        </h1>
        <p className="muted">{t("See what patience and regular investing can do.")}</p>
      </header>

      <article className="panel growth-card">
        <div className="growth-summary">
          <span className="growth-label">{t("Future value")}</span>
          <strong className="growth-future">
            <AnimatedNumber value={result.futureValue} format={money} />
          </strong>
          <div className="growth-split">
            <div>
              <span className="growth-label">{t("Total contributions")}</span>
              <strong>{money(result.contributed)}</strong>
            </div>
            <div>
              <span className="growth-label">{t("Total growth")}</span>
              <strong className="positive">+{money(result.growth)}</strong>
            </div>
          </div>
        </div>

        <div className="growth-legend" aria-hidden="true">
          <span>
            <i className="growth-dot value" />
            {t("Future value")}
          </span>
          <span>
            <i className="growth-dot contributed" />
            {t("Total contributions")}
          </span>
        </div>

        <div className="growth-chart">
          <div className="growth-y-axis" aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick} style={{ top: `${(y(tick) / HEIGHT) * 100}%` }}>
                {short(tick, currency)}
              </span>
            ))}
          </div>
          <div className="growth-plot">
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              preserveAspectRatio="none"
              role="img"
              aria-label={t("{value} after {years} years, of which {contributed} you put in.", {
                value: money(result.futureValue),
                years,
                contributed: money(result.contributed),
              })}
              onMouseLeave={() => setHover(null)}
              onMouseMove={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                const year = Math.round(((event.clientX - box.left) / box.width) * years);
                setHover(Math.max(0, Math.min(years, year)));
              }}
            >
              <defs>
                <linearGradient id="growth-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b6fe0" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#3b6fe0" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {ticks.map((tick) => (
                <line key={tick} x1={0} x2={WIDTH} y1={y(tick)} y2={y(tick)} className="growth-grid" />
              ))}
              <path d={area} fill="url(#growth-fill)" />
              <path d={contributedLine} className="growth-contributed" />
              <path d={valueLine} className="growth-line" />
              {shown && <line x1={x(shown.year)} x2={x(shown.year)} y1={0} y2={HEIGHT} className="growth-cursor" />}
            </svg>
            {shown && (
              <>
                <span
                  className="growth-point"
                  style={{ left: `${(x(shown.year) / WIDTH) * 100}%`, top: `${(y(shown.value) / HEIGHT) * 100}%` }}
                  aria-hidden="true"
                />
                <div
                  className={`growth-tip${shown.year > years / 2 ? " left" : ""}`}
                  style={{ left: `${(x(shown.year) / WIDTH) * 100}%` }}
                  role="status"
                >
                  <strong>{t("Year {year}", { year: shown.year })}</strong>
                  <span>
                    {t("Value")}: {money(shown.value)}
                  </span>
                  <span className="muted">
                    {t("Put in")}: {money(shown.contributed)}
                  </span>
                </div>
              </>
            )}
            <div className="growth-x-axis" aria-hidden="true">
              {yearLabels.map((point) => (
                <span key={point.year} style={{ left: `${(x(point.year) / WIDTH) * 100}%` }}>
                  {t("Yr {year}", { year: point.year })}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="growth-controls">
          <Control
            label={t("Starting amount")}
            extra={
              portfolioValue > 0 && Math.round(portfolioValue) !== principal ? (
                <button
                  type="button"
                  className="text-button growth-use"
                  title={t("Use my portfolio ({amount})", { amount: money(portfolioValue) })}
                  onClick={() => setPrincipal(Math.round(portfolioValue))}
                >
                  {t("Use mine")}
                </button>
              ) : null
            }
          >
            <input
              type="range"
              min={0}
              max={Math.max(1000000, principal)}
              step={1000}
              value={principal}
              aria-label={t("Starting amount")}
              onChange={(event) => setPrincipal(Number(event.target.value))}
            />
            <AmountInput aria-label={t("Starting amount, exact")} value={principal} onChange={setPrincipal} />
          </Control>
          <Control label={t("Monthly contribution")}>
            <input
              type="range"
              min={0}
              max={Math.max(10000, monthly)}
              step={25}
              value={monthly}
              aria-label={t("Monthly contribution")}
              onChange={(event) => setMonthly(Number(event.target.value))}
            />
            <AmountInput aria-label={t("Monthly contribution, exact")} value={monthly} onChange={setMonthly} />
          </Control>
          <Control label={t("Years")}>
            <input
              type="range"
              min={1}
              max={50}
              step={1}
              value={years}
              aria-label={t("Years")}
              onChange={(event) => setYears(Number(event.target.value))}
            />
            <span className="growth-value">{t("{count} years", { count: years })}</span>
          </Control>
          <Control label={t("Expected yearly return")}>
            <input
              type="range"
              min={0}
              max={20}
              step={0.25}
              value={rate}
              aria-label={t("Expected yearly return")}
              onChange={(event) => setRate(Number(event.target.value))}
            />
            <span className="growth-value">{rate.toFixed(2)}%</span>
          </Control>
        </div>
        <p className="muted growth-note">
          {t("The US stock market has returned about 10% a year over the long run before inflation, about 7% after. Past returns don't promise future ones.")}
        </p>
      </article>
    </section>
  );
}

/** One setting: its label (and an optional link) on top, then the value, then the slider. */
function Control({ label, extra, children }: { label: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="growth-control">
      <span className="growth-control-label">
        {label}
        {extra}
      </span>
      <div className="growth-control-row">{children}</div>
    </div>
  );
}
