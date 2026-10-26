"use client";

import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  GraduationCap,
  RefreshCw,
  ShieldAlert,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";

import {
  buildAllocations,
  calculatePortfolioAnalytics,
  formatAllocationPercentage,
  formatPercent,
  isFund,
  type AnalyticsLimits,
} from "@/lib/analytics";
import { api, type Portfolio, type PortfolioTransaction } from "@/lib/api";
import {
  holdingsPerformance,
  rangeStart,
  type CloseHistory,
  type DateRange,
  type HoldingsPerformance,
} from "@/lib/performance";
import type { Position } from "@/lib/portfolio";

type AllocationDimension =
  | "position"
  | "asset_type"
  | "sector"
  | "industry";
type ContributorCount = 5 | 10 | "all";

const RANGE_OPTIONS: DateRange[] = ["1M", "3M", "6M", "YTD", "1Y", "3Y", "All"];
const BENCHMARKS = [
  ["S&P 500", "SPY"],
  ["Nasdaq-100", "QQQ"],
  ["Russell 2000", "IWM"],
  ["Total US Market", "VTI"],
] as const;
const ALLOCATION_BOXES: [AllocationDimension, string][] = [
  ["position", "Positions"],
  ["industry", "Industries"],
  ["sector", "Sectors"],
  ["asset_type", "Asset types"],
];

const ANALYTICS_SECTIONS: [string, string][] = [
  ["analytics-allocation", "Allocation"],
  ["analytics-gains-losses", "Gains / Losses"],
  ["analytics-risk", "Risk analysis"],
];

export function PortfolioAnalyticsDashboard({
  portfolios,
  selectedId,
  positions,
  cash,
  transactions = [],
  useTransactionHistory = false,
  limits: suppliedLimits,
  loading = false,
  asOfDate = new Date().toISOString().slice(0, 10),
  onSelectPortfolio,
  onRefresh,
}: {
  portfolios: Portfolio[];
  selectedId: string;
  positions: Position[];
  cash: number;
  transactions?: PortfolioTransaction[];
  useTransactionHistory?: boolean;
  limits: Partial<AnalyticsLimits>;
  loading?: boolean;
  asOfDate?: string;
  onSelectPortfolio: (id: string) => void;
  onRefresh: () => Promise<void>;
}) {
  const selectedPortfolio = portfolios.find((item) => item.id === selectedId);
  const [benchmark, setBenchmark] = useState(selectedPortfolio?.benchmark ?? "SPY");
  const [customBenchmark, setCustomBenchmark] = useState("");
  const [range, setRange] = useState<DateRange>("1Y");
  const [contributorCount, setContributorCount] =
    useState<ContributorCount>(5);
  const [refreshing, setRefreshing] = useState(false);
  const [moduleError, setModuleError] = useState("");
  const [history, setHistory] = useState<{
    key: string;
    closes: CloseHistory | null;
    error: string | null;
  } | null>(null);
  const [chartMode, setChartMode] = useState<ChartMode>("Percentage return");

  const historyTickers = useMemo(
    () =>
      [...new Set([benchmark, ...positions.filter((p) => Number(p.shares) > 0).map((p) => p.ticker.toUpperCase())])]
        .filter(Boolean)
        .sort()
        .join(","),
    [benchmark, positions],
  );
  const historyFrom = rangeStart(range, asOfDate);
  const historyKey = `${historyTickers}|${historyFrom}`;
  useEffect(() => {
    if (!historyTickers) return;
    let active = true;
    api<CloseHistory>(
      `/api/prices/history?tickers=${encodeURIComponent(historyTickers)}&from=${historyFrom}`,
    )
      .then((closes) => {
        if (active) setHistory({ key: historyKey, closes, error: null });
      })
      .catch((cause: unknown) => {
        if (active) {
          setHistory({
            key: historyKey,
            closes: null,
            error: cause instanceof Error ? cause.message : "Price history is unavailable",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [historyKey, historyTickers, historyFrom]);
  const historyReady = history?.key === historyKey;
  const performance: HoldingsPerformance | null = useMemo(
    () =>
      historyReady && history?.closes
        ? holdingsPerformance({ holdings: positions, closes: history.closes, benchmark })
        : null,
    [historyReady, history, positions, benchmark],
  );

  const limits: AnalyticsLimits = {
    maxPositionPct: suppliedLimits.maxPositionPct ?? 0.25,
    maxSectorPct: suppliedLimits.maxSectorPct ?? 0.25,
    maxAssetTypePct: suppliedLimits.maxAssetTypePct ?? 0.8,
    minCashPct: suppliedLimits.minCashPct ?? 0.05,
    maxSpeculativePct: suppliedLimits.maxSpeculativePct ?? 0.2,
    maxTopThreePct: suppliedLimits.maxTopThreePct ?? 0.7,
    maxTopFivePct: suppliedLimits.maxTopFivePct ?? 0.85,
    rebalancingThresholdPct:
      suppliedLimits.rebalancingThresholdPct ?? 0.05,
  };
  const analytics = useMemo(
    () =>
      calculatePortfolioAnalytics(
        positions,
        cash,
        limits,
        transactions,
        useTransactionHistory,
      ),
    // Individual values make changes to configured limits recompute the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      positions,
      cash,
      transactions,
      useTransactionHistory,
      limits.maxPositionPct,
      limits.maxSectorPct,
      limits.maxAssetTypePct,
      limits.minCashPct,
      limits.maxSpeculativePct,
      limits.maxTopThreePct,
      limits.maxTopFivePct,
      limits.rebalancingThresholdPct,
    ],
  );
  const allocationGroups = useMemo(
    () =>
      ALLOCATION_BOXES.map(([dimension, label]) => {
        const limit =
          dimension === "position"
            ? limits.maxPositionPct
            : dimension === "sector"
              ? limits.maxSectorPct
              : dimension === "asset_type"
                ? limits.maxAssetTypePct
                : null;
        const rows = buildAllocations(
          analytics.positions,
          analytics.portfolioValue,
          dimension,
          "direct",
          limit,
        ).map((row) => {
          const excludedFromRiskLimits = row.holdings.every((ticker) => {
            const position = analytics.positions.find(
              (candidate) => candidate.ticker === ticker,
            );
            return position ? isFund(position) : false;
          });
          return {
            ...row,
            excludedFromRiskLimits,
            limit: excludedFromRiskLimits ? null : row.limit,
            warning: excludedFromRiskLimits ? false : row.warning,
          };
        });
        return {
          dimension,
          label,
          rows,
        };
      }),
    [
      analytics.portfolioValue,
      analytics.positions,
      limits.maxAssetTypePct,
      limits.maxPositionPct,
      limits.maxSectorPct,
    ],
  );
  const timestamp = positions
    .map((position) => position.price_date)
    .filter(Boolean)
    .sort()
    .at(-1);
  const stalePrices = positions
    .filter(
      (position) =>
        position.price_date &&
        Date.parse(`${asOfDate}T00:00:00Z`) -
          Date.parse(`${position.price_date.slice(0, 10)}T00:00:00Z`) >
          4 * 86_400_000,
    )
    .map((position) => position.ticker);
  const contributors = analytics.positions
    .filter((position) => position.gainLoss != null)
    .sort((left, right) => Number(right.gainLoss) - Number(left.gainLoss));
  const count =
    contributorCount === "all" ? contributors.length : contributorCount;
  const topContributors = contributors.filter(
    (position) => Number(position.gainLoss) > 0,
  ).slice(0, count);
  const bottomContributors = contributors
    .filter((position) => Number(position.gainLoss) < 0)
    .slice()
    .reverse()
    .slice(0, count);

  async function refresh() {
    setRefreshing(true);
    setModuleError("");
    try {
      await onRefresh();
    } catch (error) {
      setModuleError(
        error instanceof Error ? error.message : "Could not refresh analytics.",
      );
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <section className="analytics-metrics" aria-label="Loading analytics">
        {Array.from({ length: 8 }).map((_, index) => (
          <div className="analytics-metric skeleton" key={index} />
        ))}
      </section>
    );
  }

  if (!positions.length) {
    return (
      <section className="analytics-empty panel">
        <BarChart3 aria-hidden="true" />
        <h2>Add holdings to see portfolio analytics</h2>
        <p>
          Analytics will use your saved quantities, cost basis, cash, and current
          market prices.
        </p>
      </section>
    );
  }

  return (
    <section className="analytics-dashboard" aria-label="Portfolio analytics">
      <header className="analytics-page-head">
        <h1>Analytics</h1>
        <nav aria-label="Jump to section">
          {ANALYTICS_SECTIONS.map(([id, label]) => (
            <a key={id} href={`#${id}`}>
              {label}
            </a>
          ))}
        </nav>
      </header>
      <section className="panel analytics-module performance-module">
        <ModuleHeading
          eyebrow="Performance"
          title={`Portfolio vs. ${benchmark}`}
          icon={<BarChart3 size={18} />}
        />
        <div className="analytics-controls" role="group" aria-label="Analytics controls">
          <label>
            <span>Portfolio</span>
            <select
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
          <label>
            <span>Benchmark</span>
            <select
              value={
                BENCHMARKS.some((option) => option[1] === benchmark)
                  ? benchmark
                  : "custom"
              }
              onChange={(event) => {
                setBenchmark(event.target.value);
              }}
            >
              {BENCHMARKS.map(([label, ticker]) => (
                <option key={ticker} value={ticker}>
                  {label}
                </option>
              ))}
              <option value="custom">Custom benchmark</option>
            </select>
          </label>
          {!BENCHMARKS.some((option) => option[1] === benchmark) && (
            <label>
              <span>Custom ticker</span>
              <input
                value={customBenchmark}
                maxLength={12}
                placeholder="e.g. VT"
                onChange={(event) => {
                  const value = event.target.value.toUpperCase();
                  setCustomBenchmark(value);
                  if (/^[A-Z0-9.-]{1,12}$/.test(value)) setBenchmark(value);
                }}
              />
            </label>
          )}
          <div className="analytics-refresh">
            <span>
              Prices as of{" "}
              {timestamp
                ? new Date(timestamp).toLocaleString()
                : "unavailable"}
            </span>
            <button type="button" onClick={refresh} disabled={refreshing}>
              <RefreshCw
                size={16}
                aria-hidden="true"
                className={refreshing ? "spinning" : ""}
              />
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
          </div>
        </div>
        <div className="performance-toolbar">
        <div className="chart-mode" role="group" aria-label="Performance chart mode">
          {CHART_MODES.map((option) => (
            <button
              type="button"
              key={option}
              className={chartMode === option ? "active" : ""}
              aria-pressed={chartMode === option}
              disabled={!performance?.points.length}
              onClick={() => setChartMode(option)}
            >
              {option}
            </button>
          ))}
        </div>
          <div className="date-range-control" role="group" aria-label="Date range">
            {RANGE_OPTIONS.map((option) => (
              <button
                type="button"
                key={option}
                className={range === option ? "active" : ""}
                aria-pressed={range === option}
                onClick={() => setRange(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        {!historyReady ? (
          <p className="muted">Loading price history…</p>
        ) : history?.error || !performance?.points.length ? (
          <Unavailable
            title="Price history unavailable"
            text={
              history?.error ??
              `No ${range} price history was found for ${benchmark} and your holdings.`
            }
          />
        ) : (
          <PerformanceChart performance={performance} mode={chartMode} benchmark={benchmark} />
        )}
      </section>

      <RiskLimits warnings={analytics.warnings} />

      {moduleError && (
        <div className="module-error" role="alert">
          <AlertTriangle size={17} aria-hidden="true" />
          Prices could not refresh. Existing analytics remain available. {moduleError}
        </div>
      )}
      {(analytics.missingPrices.length > 0 || stalePrices.length > 0) && (
        <div className="module-error" role="status">
          <AlertTriangle size={17} aria-hidden="true" />
          <span>
            {analytics.missingPrices.length > 0 &&
              `Missing market price: ${analytics.missingPrices.join(", ")}. `}
            {stalePrices.length > 0 &&
              `Stale market price: ${stalePrices.join(", ")}.`}
            {" "}Affected values are excluded or marked unavailable.
          </span>
        </div>
      )}

      <section className="analytics-metrics" aria-label="Portfolio summary">
        <SummaryMetric label="Portfolio value" value={money(analytics.portfolioValue)} />
        <SummaryMetric
          label="Total cost basis"
          value={money(analytics.totalCostBasis)}
          note={
            analytics.missingCostBasis.length
              ? `Missing: ${analytics.missingCostBasis.join(", ")}`
              : undefined
          }
        />
        <SummaryMetric
          label="Cash balance"
          value={`${money(cash)} / ${formatPercent(analytics.cashPercentage)}`}
        />
        <SummaryMetric
          label="Unrealized gain/loss"
          value={
            analytics.unrealizedGainLossPct == null
              ? signedMoney(analytics.unrealizedGainLoss)
              : `${signedMoney(analytics.unrealizedGainLoss)} / ${signedPercent(analytics.unrealizedGainLossPct)}`
          }
          tone={analytics.unrealizedGainLoss >= 0 ? "positive" : "negative"}
        />
        <SummaryMetric
          label="Today’s gain/loss"
          value={
            analytics.todayGainLoss == null
              ? "Unavailable"
              : signedMoney(analytics.todayGainLoss)
          }
        />
        <SummaryMetric
          label="Transaction return"
          value={
            analytics.transactionReturnPct == null
              ? "Unavailable"
              : signedPercent(analytics.transactionReturnPct)
          }
          tone={
            analytics.transactionReturnPct == null
              ? undefined
              : analytics.transactionReturnPct >= 0
                ? "positive"
                : "negative"
          }
          note={
            !useTransactionHistory
              ? "Disabled in Admin settings"
              : analytics.transactionHistoryApplied
                ? `Recorded buys and sells only · realized ${signedMoney(analytics.realizedGainLoss ?? 0)} · excludes dividends, fees, and external cash flows`
                : transactions.length === 0
                  ? "Record your buys and sells on the Transactions page to calculate this"
                  : "Your recorded buys and sells don't add up to your current shares yet; record the missing ones on the Transactions page"
          }
        />
        <SummaryMetricPair
          items={[
            {
              label: "Benchmark return",
              value: !historyReady
                ? "Loading…"
                : performance?.benchmarkReturn != null
                  ? signedPercent(performance.benchmarkReturn)
                  : "Unavailable",
              note: `${benchmark} · ${range}`,
              tone:
                performance?.benchmarkReturn == null
                  ? undefined
                  : performance.benchmarkReturn >= 0
                    ? "positive"
                    : "negative",
            },
            {
              label: "Portfolio vs. benchmark",
              value:
                performance?.portfolioReturn != null && performance.benchmarkReturn != null
                  ? `${performance.portfolioReturn - performance.benchmarkReturn >= 0 ? "+" : ""}${(performance.portfolioReturn - performance.benchmarkReturn).toFixed(1)} pts`
                  : historyReady
                    ? "Unavailable"
                    : "Loading…",
              note:
                performance?.portfolioReturn != null
                  ? `Current holdings ${signedPercent(performance.portfolioReturn)}, as if held`
                  : undefined,
              tone:
                performance?.portfolioReturn == null || performance.benchmarkReturn == null
                  ? undefined
                  : performance.portfolioReturn >= performance.benchmarkReturn
                    ? "positive"
                    : "negative",
            },
          ]}
        />
        <SummaryMetric
          label="Holdings / risk warnings"
          value={`${positions.length} / ${analytics.warnings.length}`}
          tone={analytics.warnings.length ? "negative" : "positive"}
        />
      </section>

      <section className="panel analytics-module analytics-anchor" id="analytics-allocation">
        <ModuleHeading
          eyebrow="Allocation"
          title="Portfolio allocation"
          icon={<BarChart3 size={18} />}
        />
<AllocationGuide limits={limits} />
        <p className="module-note">
          ETF and index values are shown for visibility but excluded from allocation
          limits and concentration warnings.
        </p>
        <div className="allocation-box-grid">
          {allocationGroups.map(({ dimension, label, rows }) => (
            <section className="allocation-box" key={dimension}>
              <h3>{label}</h3>
              <div className="allocation-table">
                {rows.map((row) => (
                  <article className={row.warning ? "warning" : ""} key={row.key}>
                    <div>
                      <strong>{row.label}</strong>
                      {!(
                        row.holdings.length === 1 &&
                        row.holdings[0].toUpperCase() === row.label.toUpperCase()
                      ) && <span>{row.holdings.join(", ")}</span>}
                    </div>
                    <div>
                      <strong>{formatAllocationPercentage(row.percentage)}</strong>
                      <span>/ {money(row.value)}</span>
                    </div>
                    <div className="allocation-track" aria-hidden="true">
                      <span style={{ width: `${Math.min(row.percentage * 100, 100)}%` }} />
                    </div>
                    {row.excludedFromRiskLimits ? (
                      <small>Excluded from risk limits</small>
                    ) : row.warning && row.limit != null ? (
                      <small>Over {formatPercent(row.limit)} limit</small>
                    ) : null}
                  </article>
                ))}
                {!rows.length && (
                  <Unavailable
                    title="Allocation unavailable"
                    text="Current prices or classification data are missing."
                  />
                )}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="contributors-grid analytics-anchor" id="analytics-gains-losses">
        <ContributorPanel
          title="Gains"
          rows={topContributors}
          totalGainLoss={analytics.unrealizedGainLoss}
        />
        <ContributorPanel
          title="Losses"
          rows={bottomContributors}
          totalGainLoss={analytics.unrealizedGainLoss}
        />
        <div className="contributor-controls">
          <span>Show</span>
          {[5, 10, "all"].map((option) => (
            <button
              type="button"
              key={option}
              className={contributorCount === option ? "active" : ""}
              onClick={() => setContributorCount(option as ContributorCount)}
            >
              {option === "all" ? "All" : `Top ${option}`}
            </button>
          ))}
        </div>
      </section>

      <AdvancedRisk analytics={analytics} />
    </section>
  );
}

function SummaryMetric({
  label,
  value,
  note,
  tone,
  tooltip,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "positive" | "negative";
  tooltip?: string;
}) {
  return (
    <article
      className={`analytics-metric ${tone ?? ""}`}
      title={tooltip}
      aria-label={tooltip ? `${label}. ${tooltip}` : undefined}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </article>
  );
}

const CHART_MODES = ["Portfolio value", "Percentage return", "Portfolio vs. benchmark"] as const;
type ChartMode = (typeof CHART_MODES)[number];

function PerformanceChart({
  performance,
  mode,
  benchmark,
}: {
  performance: HoldingsPerformance;
  mode: ChartMode;
  benchmark: string;
}) {
  const width = 720;
  const height = 240;
  const pad = { left: 64, right: 16, top: 14, bottom: 30 };
  const points = performance.points;
  const series: { key: string; label: string; values: (number | null)[] }[] =
    mode === "Portfolio value"
      ? [{ key: "portfolio", label: "Current holdings", values: points.map((p) => p.value) }]
      : mode === "Percentage return"
        ? [
            { key: "portfolio", label: "Current holdings", values: points.map((p) => p.portfolioPct) },
            { key: "benchmark", label: benchmark, values: points.map((p) => p.benchmarkPct) },
          ]
        : [
            {
              key: "portfolio",
              label: `Holdings minus ${benchmark}`,
              values: points.map((p) =>
                p.benchmarkPct == null ? null : p.portfolioPct - p.benchmarkPct,
              ),
            },
          ];
  const all = series.flatMap((item) => item.values).filter((v): v is number => v != null);
  const low = Math.min(...all, mode === "Portfolio value" ? Infinity : 0);
  const high = Math.max(...all, mode === "Portfolio value" ? -Infinity : 0);
  const span = high - low || 1;
  const x = (index: number) =>
    pad.left + (index / Math.max(1, points.length - 1)) * (width - pad.left - pad.right);
  const y = (value: number) =>
    pad.top + (1 - (value - low) / span) * (height - pad.top - pad.bottom);
  const format = (value: number) =>
    mode === "Portfolio value"
      ? value >= 1e6
        ? `$${(value / 1e6).toFixed(2)}M`
        : `$${Math.round(value / 1000)}k`
      : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
  const ticks = [low, low + span / 2, high];
  const last = points.length - 1;
  return (
    <figure className="performance-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${mode} from ${performance.startDate} to ${performance.endDate}`}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="performance-grid" />
            <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" className="performance-label">
              {format(tick)}
            </text>
          </g>
        ))}
        {mode !== "Portfolio value" && low < 0 && high > 0 && (
          <line x1={pad.left} x2={width - pad.right} y1={y(0)} y2={y(0)} className="performance-zero" />
        )}
        {series.map((item) => (
          <polyline
            key={item.key}
            className={`performance-line ${item.key}`}
            points={item.values
              .map((value, index) => (value == null ? null : `${x(index)},${y(value)}`))
              .filter(Boolean)
              .join(" ")}
          />
        ))}
        <text x={pad.left} y={height - 8} className="performance-label">
          {performance.startDate}
        </text>
        <text x={x(last)} y={height - 8} textAnchor="end" className="performance-label">
          {performance.endDate}
        </text>
      </svg>
      <figcaption className="performance-legend">
        {series.map((item) => {
          const end = item.values[last];
          return (
            <span key={item.key} className={item.key}>
              {item.label}
              {end != null && <strong> {format(end)}</strong>}
            </span>
          );
        })}
      </figcaption>
    </figure>
  );
}

function SummaryMetricPair({
  items,
}: {
  items: {
    label: string;
    value: string;
    note?: string;
    tone?: "positive" | "negative";
  }[];
}) {
  return (
    <article className="analytics-metric analytics-metric-pair">
      {items.map((item) => (
        <div className={item.tone ?? ""} key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.note && <small>{item.note}</small>}
        </div>
      ))}
    </article>
  );
}

function ModuleHeading({
  eyebrow,
  title,
  icon,
}: {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="analytics-module-heading">
      <div className="module-icon">{icon}</div>
      <div>
        <p className="step">{eyebrow}</p>
        <h2>{title}</h2>
      </div>
    </div>
  );
}

function RiskLimits({
  warnings,
}: {
  warnings: ReturnType<typeof calculatePortfolioAnalytics>["warnings"];
}) {
  return (
    <section className="panel analytics-module">
      <ModuleHeading
        eyebrow="Configured thresholds"
        title="Risk limits"
        icon={<ShieldAlert size={18} />}
      />
      {warnings.length ? (
        <div className="risk-warning-list">
          {warnings.map((warning) => (
            <article key={warning.id} className={`risk-warning ${warning.severity}`}>
              <span className="status-label">{capitalize(warning.severity)}</span>
              <div>
                <strong>{warning.title}</strong>
                <p>{warning.explanation}</p>
                <small>
                  Current {formatPercent(warning.currentValue)} · Limit{" "}
                  {formatPercent(warning.configuredLimit)}
                  {warning.affectedHoldings.length
                    ? ` · Holdings: ${warning.affectedHoldings.join(", ")}`
                    : ""}
                </small>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="success-state">
          <CheckCircle2 size={18} />
          <span>No current-allocation limits are breached.</span>
        </div>
      )}
    </section>
  );
}

function ContributorPanel({
  title,
  rows,
  totalGainLoss,
}: {
  title: string;
  rows: ReturnType<typeof calculatePortfolioAnalytics>["positions"];
  totalGainLoss: number;
}) {
  return (
    <section className="panel analytics-module contributor-panel">
      <ModuleHeading eyebrow="Gains and losses" title={title} icon={<BarChart3 size={18} />} />
      <div className="contributor-list">
        {rows.map((position) => (
          <article key={position.ticker}>
            <div>
              <strong>{position.ticker}</strong>
              <span>{position.company_name || position.name || "Company unavailable"}</span>
            </div>
            <div>
              <strong>{signedMoney(position.gainLoss ?? 0)}</strong>
              <span>
                {position.gainLossPct == null
                  ? "Cost basis unavailable"
                  : signedPercent(position.gainLossPct)}
              </span>
            </div>
            <small>Weight {formatAllocationPercentage(position.weight ?? 0)}</small>
            <small>
              Share of unrealized gain/loss{" "}
              {totalGainLoss
                ? `${Math.abs(((position.gainLoss ?? 0) / totalGainLoss) * 100).toFixed(1)}%`
                : "Unavailable"}
            </small>
          </article>
        ))}
        {!rows.length && <p className="muted">No matching contributors.</p>}
      </div>
    </section>
  );
}

function AdvancedRisk({
  analytics,
}: {
  analytics: ReturnType<typeof calculatePortfolioAnalytics>;
}) {
  const unavailable = [
    ["Portfolio volatility", "Daily portfolio history"],
    ["Maximum drawdown", "Historical portfolio values"],
    ["Beta versus benchmark", "Aligned portfolio and benchmark returns"],
    ["Sharpe ratio", "Portfolio returns and risk-free rates"],
    ["Downside deviation", "Historical portfolio returns"],
    ["Highly correlated holdings", "Aligned holding return history"],
  ];
  return (
    <section className="panel analytics-module analytics-anchor" id="analytics-risk">
      <ModuleHeading eyebrow="Risk" title="Risk analytics" icon={<ShieldAlert size={18} />} />
      <div className="risk-metric-grid">
        <SummaryMetric label="Top-three concentration" value={formatPercent(analytics.topThreeConcentration)} note="Excludes funds and indexes" tooltip="Sum of the three largest non-fund position weights. Uses the latest available prices and is not a historical risk measure." />
        <SummaryMetric label="Top-five concentration" value={formatPercent(analytics.topFiveConcentration)} note="Excludes funds and indexes" tooltip="Sum of the five largest non-fund position weights. Uses the latest available prices and is not a historical risk measure." />
        {unavailable.map(([label, requirement]) => (
          <SummaryMetric
            key={label}
            label={label}
            value="Not enough history"
            note={`Requires ${requirement.toLowerCase()}.`}
            tooltip={`${label} is calculated over the selected period. ${requirement} are required; results can be sensitive to the selected period and data quality.`}
          />
        ))}
      </div>
    </section>
  );
}

function Unavailable({ title, text }: { title: string; text: string }) {
  return (
    <div className="unavailable-state">
      <CircleHelp size={22} aria-hidden="true" />
      <div><strong>{title}</strong><p>{text}</p></div>
    </div>
  );
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function signedMoney(value: number) {
  return `${value >= 0 ? "+" : ""}${money(value)}`;
}

function signedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** Common rules of thumb for diversification, next to the limits configured in Admin. */
const GUIDE_OPEN_KEY = "stockbuddy.allocationGuideOpen";

function AllocationGuide({ limits }: { limits: AnalyticsLimits }) {
  // Open by default; the browser remembers if the person closes it.
  const [open, setOpen] = useState(() => {
    try {
      return typeof window === "undefined" || window.localStorage.getItem(GUIDE_OPEN_KEY) !== "false";
    } catch {
      return true;
    }
  });
  function toggle() {
    setOpen((current) => {
      try {
        window.localStorage.setItem(GUIDE_OPEN_KEY, String(!current));
      } catch {
        // Not remembered when storage is unavailable; it still toggles.
      }
      return !current;
    });
  }
  return (
    <aside className={`allocation-guide${open ? "" : " closed"}`} aria-label="What is a normal allocation">
      <button type="button" className="allocation-guide-toggle" aria-expanded={open} aria-controls="allocation-guide-body" onClick={toggle}>
        <GraduationCap size={18} aria-hidden="true" />
        <span className="allocation-guide-title">
          <span className="allocation-guide-tag">Learn</span>
          What&apos;s considered normal?
        </span>
        <span className="allocation-guide-action">{open ? "Hide" : "Show"}</span>
        <ChevronDown size={16} aria-hidden="true" className="allocation-guide-chevron" />
      </button>
      {open && (
      <div id="allocation-guide-body">
      <p>
        There is no single rule, but these are widely used rules of thumb for a diversified
        portfolio. They are general education, not advice for your situation.
      </p>
      <ul>
        <li>
          <strong>One position:</strong> usually 5–10% at most. Above about 20%, one
          company&apos;s bad news can hurt the whole portfolio. Your limit:{" "}
          {formatPercent(limits.maxPositionPct)}.
        </li>
        <li>
          <strong>One sector or industry:</strong> about 20–25% at most; the S&amp;P 500&apos;s
          largest sector (technology) is roughly 30%. Your limit:{" "}
          {formatPercent(limits.maxSectorPct)}.
        </li>
        <li>
          <strong>Asset types:</strong> a mix of stocks, bonds, and cash that fits your time
          horizon; the classic balanced mix is 60% stocks / 40% bonds, and longer horizons
          usually hold more stocks. Your limit per type: {formatPercent(limits.maxAssetTypePct)}.
        </li>
        <li>
          <strong>Cash:</strong> 2–5% in the portfolio for opportunities, with 3–6 months of
          expenses kept separately as an emergency fund. Your minimum:{" "}
          {formatPercent(limits.minCashPct)}.
        </li>
        <li>
          <strong>Speculative holdings:</strong> 5–10% at most, money you could afford to
          lose. Your limit: {formatPercent(limits.maxSpeculativePct)}.
        </li>
      </ul>
      <small>ETFs and index funds are already diversified, so they don&apos;t count toward these limits.</small>
      </div>
      )}
    </aside>
  );
}
