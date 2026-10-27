import type { Position } from "@/lib/portfolio";
import type { PortfolioTransaction } from "@/lib/api";

export type ExposureView = "direct" | "look-through" | "exclude-funds";
export type AnalyticsStatus = "ready" | "unavailable" | "error";
export type AnalyticsModule<T> = {
  status: AnalyticsStatus;
  data: T | null;
  message: string | null;
  updatedAt: string | null;
};
export type RiskSeverity = "critical" | "review" | "informational";

export type AnalyticsLimits = {
  maxPositionPct: number;
  maxSectorPct: number;
  maxAssetTypePct: number;
  minCashPct: number;
  maxSpeculativePct: number;
  maxTopThreePct: number;
  maxTopFivePct: number;
  rebalancingThresholdPct: number;
};

export type EnrichedPosition = Position & {
  marketValue: number | null;
  costBasis: number | null;
  gainLoss: number | null;
  gainLossPct: number | null;
  weight: number | null;
  todayGainLoss: number | null;
};

export type RiskWarning = {
  id: string;
  severity: RiskSeverity;
  title: string;
  currentValue: number;
  configuredLimit: number;
  affectedHoldings: string[];
  explanation: string;
};

export type AllocationRow = {
  key: string;
  label: string;
  value: number;
  percentage: number;
  limit: number | null;
  warning: boolean;
  holdings: string[];
};

export type PortfolioAnalytics = {
  positions: EnrichedPosition[];
  portfolioValue: number;
  holdingsValue: number;
  totalCostBasis: number;
  costBasisCoverage: number;
  unrealizedGainLoss: number;
  unrealizedGainLossPct: number | null;
  cashPercentage: number;
  todayGainLoss: number | null;
  realizedGainLoss: number | null;
  transactionReturnPct: number | null;
  transactionHistoryApplied: boolean;
  transactionHistoryComplete: boolean;
  topThreeConcentration: number;
  topFiveConcentration: number;
  warnings: RiskWarning[];
  missingPrices: string[];
  missingCostBasis: string[];
};

const FUND_TYPES = new Set(["ETF", "Mutual Fund", "Closed-End Fund", "Index"]);
export const FUND_GROUP_LABEL = "ETF/Index";
const SPECULATIVE_CATEGORIES = new Set(["Digital Asset", "Thematic"]);

export function isFund(position: Position) {
  return Boolean(
    position.is_etf_index ||
      (position.asset_type && FUND_TYPES.has(position.asset_type)),
  );
}

export function calculatePortfolioAnalytics(
  positions: Position[],
  cash: number,
  limits: AnalyticsLimits,
  transactions: PortfolioTransaction[] = [],
  useTransactionHistory = false,
): PortfolioAnalytics {
  const ledger = calculateTransactionLedger(positions, transactions);
  const useLedger =
    useTransactionHistory && transactions.length > 0 && ledger.complete;
  const holdingsValue = positions.reduce(
    (total, position) =>
      total +
      (position.price == null
        ? 0
        : Number(position.price) * Number(position.shares)),
    0,
  );
  const portfolioValue = holdingsValue + Number(cash || 0);
  const enriched = positions.map<EnrichedPosition>((position) => {
    const marketValue =
      position.price == null
        ? null
        : Number(position.price) * Number(position.shares);
    const transactionCostBasis = ledger.costBasisByTicker.get(position.ticker);
    const costBasis = useLedger
      ? transactionCostBasis ?? null
      : position.purchase_price == null
        ? null
        : Number(position.purchase_price) * Number(position.shares);
    const gainLoss =
      marketValue == null || costBasis == null ? null : marketValue - costBasis;
    const gainLossPct =
      gainLoss == null || !costBasis ? null : (gainLoss / costBasis) * 100;
    const previousClose = position.previous_close;
    const todayGainLoss =
      position.price == null || previousClose == null
        ? null
        : (Number(position.price) - Number(previousClose)) *
          Number(position.shares);
    return {
      ...position,
      marketValue,
      costBasis,
      gainLoss,
      gainLossPct,
      weight:
        marketValue == null || !portfolioValue
          ? null
          : marketValue / portfolioValue,
      todayGainLoss,
    };
  });
  const knownCostPositions = enriched.filter(
    (position) => position.costBasis != null,
  );
  const totalCostBasis = knownCostPositions.reduce(
    (total, position) => total + Number(position.costBasis),
    0,
  );
  const unrealizedGainLoss = knownCostPositions.reduce(
    (total, position) => total + Number(position.gainLoss),
    0,
  );
  const riskPositions = enriched.filter((position) => !isFund(position));
  const sortedWeights = riskPositions
    .map((position) => position.weight ?? 0)
    .sort((left, right) => right - left);
  const topThreeConcentration = sortedWeights
    .slice(0, 3)
    .reduce((total, value) => total + value, 0);
  const topFiveConcentration = sortedWeights
    .slice(0, 5)
    .reduce((total, value) => total + value, 0);
  const cashPercentage = portfolioValue ? Number(cash || 0) / portfolioValue : 0;
  const warnings = buildRiskWarnings(
    riskPositions,
    portfolioValue,
    cashPercentage,
    topThreeConcentration,
    topFiveConcentration,
    limits,
  );
  const daily = enriched.map((position) => position.todayGainLoss);
  return {
    positions: enriched,
    portfolioValue,
    holdingsValue,
    totalCostBasis,
    costBasisCoverage: holdingsValue
      ? knownCostPositions.reduce(
          (total, position) => total + Number(position.marketValue),
          0,
        ) / holdingsValue
      : 0,
    unrealizedGainLoss,
    unrealizedGainLossPct: totalCostBasis
      ? (unrealizedGainLoss / totalCostBasis) * 100
      : null,
    cashPercentage,
    todayGainLoss: daily.some((value) => value != null)
      ? daily.reduce<number>(
          (total, value) => total + Number(value ?? 0),
          0,
        )
      : null,
    realizedGainLoss: useLedger ? ledger.realizedGainLoss : null,
    transactionReturnPct:
      useLedger && ledger.grossBuyCost
        ? ((unrealizedGainLoss + ledger.realizedGainLoss) /
            ledger.grossBuyCost) *
          100
        : null,
    transactionHistoryApplied: useLedger,
    transactionHistoryComplete: ledger.complete,
    topThreeConcentration,
    topFiveConcentration,
    warnings,
    missingPrices: enriched
      .filter((position) => position.price == null)
      .map((position) => position.ticker),
    missingCostBasis: enriched
      .filter((position) => position.costBasis == null)
      .map((position) => position.ticker),
  };
}

function calculateTransactionLedger(
  positions: Position[],
  transactions: PortfolioTransaction[],
) {
  const ledger = new Map<string, { quantity: number; cost: number }>();
  let realizedGainLoss = 0;
  let grossBuyCost = 0;
  let valid = true;
  const ordered = [...transactions].sort(
    (left, right) =>
      new Date(left.transacted_at).getTime() -
      new Date(right.transacted_at).getTime(),
  );

  for (const transaction of ordered) {
    const ticker = transaction.ticker.toUpperCase();
    const current = ledger.get(ticker) ?? { quantity: 0, cost: 0 };
    const quantity = Number(transaction.quantity);
    const price = Number(transaction.price);
    if (transaction.kind === "buy") {
      current.quantity += quantity;
      current.cost += quantity * price;
      grossBuyCost += quantity * price;
    } else if (quantity > current.quantity) {
      valid = false;
    } else {
      const averageCost = current.quantity ? current.cost / current.quantity : 0;
      realizedGainLoss += quantity * (price - averageCost);
      current.quantity -= quantity;
      current.cost -= quantity * averageCost;
    }
    ledger.set(ticker, current);
  }

  const currentShares = new Map(
    positions.map((position) => [
      position.ticker.toUpperCase(),
      Number(position.shares),
    ]),
  );
  const complete =
    valid &&
    positions.every(
      (position) =>
        ledger.get(position.ticker.toUpperCase())?.quantity ===
        Number(position.shares),
    ) &&
    [...ledger.entries()].every(
      ([ticker, state]) => state.quantity === (currentShares.get(ticker) ?? 0),
    );

  return {
    complete,
    realizedGainLoss,
    grossBuyCost,
    costBasisByTicker: new Map(
      [...ledger.entries()].map(([ticker, state]) => [ticker, state.cost]),
    ),
  };
}

function buildRiskWarnings(
  positions: EnrichedPosition[],
  portfolioValue: number,
  cashPercentage: number,
  topThree: number,
  topFive: number,
  limits: AnalyticsLimits,
) {
  const warnings: RiskWarning[] = [];
  for (const position of positions) {
    if ((position.weight ?? 0) > limits.maxPositionPct) {
      warnings.push({
        id: `position-${position.ticker}`,
        severity: "critical",
        title: `${position.ticker} exceeds the position limit`,
        currentValue: position.weight ?? 0,
        configuredLimit: limits.maxPositionPct,
        affectedHoldings: [position.ticker],
        explanation: `${position.ticker} represents ${formatPercent(position.weight ?? 0)} of portfolio value; the configured maximum is ${formatPercent(limits.maxPositionPct)}.`,
      });
    }
  }
  if (cashPercentage < limits.minCashPct) {
    warnings.push({
      id: "cash-minimum",
      severity: "review",
      title: "Cash is below the configured minimum",
      currentValue: cashPercentage,
      configuredLimit: limits.minCashPct,
      affectedHoldings: [],
      explanation: `Cash represents ${formatPercent(cashPercentage)} of portfolio value; the configured minimum is ${formatPercent(limits.minCashPct)}.`,
    });
  }
  if (topThree > limits.maxTopThreePct) {
    warnings.push({
      id: "top-three",
      severity: "review",
      title: "Top-three concentration is high",
      currentValue: topThree,
      configuredLimit: limits.maxTopThreePct,
      affectedHoldings: positions
        .slice()
        .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
        .slice(0, 3)
        .map((position) => position.ticker),
      explanation: `The three largest non-fund positions represent ${formatPercent(topThree)} of portfolio value; the configured maximum is ${formatPercent(limits.maxTopThreePct)}.`,
    });
  }
  if (topFive > limits.maxTopFivePct) {
    warnings.push({
      id: "top-five",
      severity: "informational",
      title: "Top-five concentration is high",
      currentValue: topFive,
      configuredLimit: limits.maxTopFivePct,
      affectedHoldings: positions
        .slice()
        .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
        .slice(0, 5)
        .map((position) => position.ticker),
      explanation: `The five largest non-fund positions represent ${formatPercent(topFive)} of portfolio value; the configured maximum is ${formatPercent(limits.maxTopFivePct)}.`,
    });
  }
  addGroupedWarnings(
    warnings,
    positions,
    (position) =>
      isFund(position) ? "Not Applicable" : position.sector || "Unclassified",
    "sector",
    limits.maxSectorPct,
  );
  addGroupedWarnings(
    warnings,
    positions,
    (position) => position.asset_type || "Other",
    "asset type",
    limits.maxAssetTypePct,
  );
  const speculative = positions.filter((position) =>
    SPECULATIVE_CATEGORIES.has(position.investment_category ?? ""),
  );
  const speculativeWeight = speculative.reduce(
    (total, position) => total + (position.weight ?? 0),
    0,
  );
  if (speculativeWeight > limits.maxSpeculativePct) {
    warnings.push({
      id: "speculative",
      severity: "review",
      title: "Speculative exposure exceeds its limit",
      currentValue: speculativeWeight,
      configuredLimit: limits.maxSpeculativePct,
      affectedHoldings: speculative.map((position) => position.ticker),
      explanation: `Speculative categories represent ${formatPercent(speculativeWeight)} of portfolio value; the configured maximum is ${formatPercent(limits.maxSpeculativePct)}.`,
    });
  }
  void portfolioValue;
  return warnings;
}

function addGroupedWarnings(
  warnings: RiskWarning[],
  positions: EnrichedPosition[],
  keyFor: (position: EnrichedPosition) => string,
  kind: "sector" | "asset type",
  limit: number,
) {
  const groups = new Map<string, EnrichedPosition[]>();
  for (const position of positions) {
    const key = keyFor(position);
    if (key === "Not Applicable" || key === "Unclassified") continue;
    groups.set(key, [...(groups.get(key) ?? []), position]);
  }
  for (const [label, holdings] of groups) {
    const current = holdings.reduce(
      (total, position) => total + (position.weight ?? 0),
      0,
    );
    if (current <= limit) continue;
    warnings.push({
      id: `${kind.replace(" ", "-")}-${label}`,
      severity: "review",
      title: `${label} exceeds the ${kind} limit`,
      currentValue: current,
      configuredLimit: limit,
      affectedHoldings: holdings.map((position) => position.ticker),
      explanation: `${label} ${kind} exposure represents ${formatPercent(current)} of portfolio value; the configured maximum is ${formatPercent(limit)}.`,
    });
  }
}

export function buildAllocations(
  positions: EnrichedPosition[],
  portfolioValue: number,
  dimension:
    | "position"
    | "asset_type"
    | "sector"
    | "industry"
    | "lifecycle_phase"
    | "market_cap_category"
    | "geography"
    | "currency",
  exposure: ExposureView,
  limit: number | null,
): AllocationRow[] {
  const included =
    exposure === "exclude-funds"
      ? positions.filter((position) => !isFund(position))
      : positions;
  const values = new Map<string, { value: number; holdings: string[] }>();
  for (const position of included) {
    if (position.marketValue == null) continue;
    const label =
      dimension === "position"
        ? position.ticker
        : allocationLabel(position, dimension);
    const row = values.get(label) ?? { value: 0, holdings: [] };
    row.value += position.marketValue;
    row.holdings.push(position.ticker);
    values.set(label, row);
  }
  return [...values.entries()]
    .map(([key, row]) => {
      const percentage = portfolioValue ? row.value / portfolioValue : 0;
      return {
        key,
        label: key,
        value: row.value,
        percentage,
        limit,
        warning: limit != null && percentage > limit,
        holdings: row.holdings,
      };
    })
    .sort((left, right) => right.value - left.value);
}

function allocationLabel(
  position: EnrichedPosition,
  dimension: Exclude<
    Parameters<typeof buildAllocations>[2],
    "position"
  >,
) {
  if (dimension === "asset_type") {
    return position.asset_type || (position.is_etf_index ? "ETF / Index" : "Other");
  }
  if (dimension === "sector" || dimension === "industry") {
    const value = dimension === "sector" ? position.sector : position.industry;
    // Funds have no single sector or industry; name the group for what it holds.
    return isFund(position) || value === "Not Applicable"
      ? FUND_GROUP_LABEL
      : value || "Unclassified";
  }
  if (dimension === "lifecycle_phase") {
    return isFund(position)
      ? "Not Applicable"
      : position.lifecycle_phase || "Not Analyzed";
  }
  if (dimension === "market_cap_category") {
    return position.market_cap_category || "Unavailable";
  }
  if (dimension === "geography") return position.geography || "Unavailable";
  return position.quote_currency || position.currency || "Unavailable";
}

export function formatAllocationPercentage(value: number) {
  if (value > 0 && value < 0.001) return "<0.1%";
  return formatPercent(value);
}

export function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

/** Cash StockBuddy suggests keeping when a portfolio has no minimum of its own. */
export const DEFAULT_CASH_TARGET = 0.05;

/** The portfolio's own minimum cash share, or the 5% default when it has none. */
export function cashTarget(minCashPct?: number | null) {
  return minCashPct && minCashPct > 0 ? minCashPct : DEFAULT_CASH_TARGET;
}

/** Cash still needed for `target` of today's total value; 0 once it is met. */
export function cashShortfall(cash: number, totalValue: number, target: number) {
  return Math.max(0, target * totalValue - (Number(cash) || 0));
}
