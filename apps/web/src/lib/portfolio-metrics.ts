import type { Position } from "@/lib/portfolio";

export type PositionMetric = {
  marketValue: number | null;
  costBasis: number | null;
  unrealizedAmount: number | null;
  unrealizedPercent: number | null;
  dayAmount: number | null;
  dayPercent: number | null;
  weight: number | null;
};

export type PortfolioMetrics = {
  holdingsValue: number;
  totalValue: number;
  totalCostBasis: number;
  unrealizedAmount: number;
  unrealizedPercent: number | null;
  dayAmount: number;
  dayPercent: number | null;
  cashPercentage: number | null;
  largestPosition: Position | null;
  byTicker: Map<string, PositionMetric>;
  hasPartialPrices: boolean;
  hasPartialCostBasis: boolean;
};

export function calculatePortfolioMetrics(
  positions: Position[],
  cash: number,
): PortfolioMetrics {
  const knownValues = positions.map((position) => positionMarketValue(position));
  const holdingsValue = knownValues.reduce<number>(
    (total, value) => total + (value ?? 0),
    0,
  );
  const totalValue = holdingsValue + finiteOrZero(cash);
  const byTicker = new Map<string, PositionMetric>();
  let totalCostBasis = 0;
  let unrealizedAmount = 0;
  let dayAmount = 0;
  let hasPartialCostBasis = false;
  let largestPosition: Position | null = null;
  let largestValue = -1;

  positions.forEach((position, index) => {
    const marketValue = knownValues[index];
    const costBasis = positionCostBasis(position);
    const unrealized =
      marketValue == null || costBasis == null ? null : marketValue - costBasis;
    const day =
      position.day_change == null
        ? null
        : Number(position.day_change) * Number(position.shares);
    if (costBasis == null) hasPartialCostBasis = true;
    else totalCostBasis += costBasis;
    if (unrealized != null) unrealizedAmount += unrealized;
    if (day != null) dayAmount += day;
    if (marketValue != null && marketValue > largestValue) {
      largestValue = marketValue;
      largestPosition = position;
    }
    byTicker.set(position.ticker, {
      marketValue,
      costBasis,
      unrealizedAmount: unrealized,
      unrealizedPercent:
        unrealized == null || !costBasis ? null : (unrealized / costBasis) * 100,
      dayAmount: day,
      dayPercent:
        position.day_change_percent == null
          ? null
          : Number(position.day_change_percent),
      weight: marketValue == null || !totalValue ? null : marketValue / totalValue,
    });
  });

  const previousTotal = totalValue - dayAmount;
  return {
    holdingsValue,
    totalValue,
    totalCostBasis,
    unrealizedAmount,
    unrealizedPercent: totalCostBasis
      ? (unrealizedAmount / totalCostBasis) * 100
      : null,
    dayAmount,
    dayPercent: previousTotal ? (dayAmount / previousTotal) * 100 : null,
    cashPercentage: totalValue ? finiteOrZero(cash) / totalValue : null,
    largestPosition,
    byTicker,
    hasPartialPrices: knownValues.some((value) => value == null),
    hasPartialCostBasis,
  };
}

export function positionMarketValue(position: Position) {
  const quantity = Number(position.shares);
  const price = position.price == null ? null : Number(position.price);
  return price == null || !Number.isFinite(price) || !Number.isFinite(quantity)
    ? null
    : quantity * price;
}

export function positionCostBasis(position: Position) {
  const quantity = Number(position.shares);
  const averageCost =
    position.purchase_price == null ? null : Number(position.purchase_price);
  return averageCost == null ||
    !Number.isFinite(averageCost) ||
    !Number.isFinite(quantity)
    ? null
    : quantity * averageCost;
}

export function money(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function signedMoney(value: number, currency = "USD") {
  return `${value >= 0 ? "+" : ""}${money(value, currency)}`;
}

export function signedPercent(value: number | null) {
  return value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export type MyPortfolioBuddyStatus =
  | "Healthy"
  | "Review"
  | "High Risk"
  | "Insufficient Data"
  | "Not Analyzed";

export function positionStatus(
  position: Position,
  metric: PositionMetric,
  options: {
    positionLimit: number;
    sectorWarning?: string;
    today: string;
  },
): { status: MyPortfolioBuddyStatus; warnings: string[] } {
  const warnings: string[] = [];
  if (!Number.isInteger(Number(position.shares)) || Number(position.shares) < 0) {
    warnings.push("Invalid quantity: enter a non-negative whole number.");
  }
  if (
    position.purchase_price != null &&
    (!Number.isFinite(Number(position.purchase_price)) ||
      Number(position.purchase_price) < 0)
  ) {
    warnings.push("Invalid cost basis: average cost cannot be negative.");
  }
  if (position.price == null) {
    warnings.push(`Missing current price for ${position.ticker}.`);
  }
  if (isStale(position.price_date, options.today)) {
    warnings.push(
      `Stale market data: ${position.ticker}'s latest price is from ${position.price_date}.`,
    );
  }
  if (metric.weight != null && metric.weight > options.positionLimit) {
    warnings.push(
      `Position limit exceeded: ${position.ticker} represents ${(metric.weight * 100).toFixed(1)}% of the portfolio. Your configured limit is ${(options.positionLimit * 100).toFixed(1)}%.`,
    );
  }
  if (options.sectorWarning) warnings.push(options.sectorWarning);
  if (position.lifecycle_phase === "Decline") {
    warnings.push("Fundamentals deteriorating: lifecycle evidence indicates Decline.");
  }
  if (position.resolve_error) warnings.push(position.resolve_error);

  if (position.lifecycle_phase === "Decline") return { status: "High Risk", warnings };
  if (
    position.price == null ||
    position.resolve_error ||
    !Number.isInteger(Number(position.shares))
  ) {
    return { status: "Insufficient Data", warnings };
  }
  if (warnings.length) return { status: "Review", warnings };
  if (
    !position.lifecycle_phase ||
    position.lifecycle_phase === "Not Analyzed"
  ) {
    return { status: "Not Analyzed", warnings: ["Lifecycle analysis has not completed."] };
  }
  return { status: "Healthy", warnings };
}

function isStale(priceDate: string | null | undefined, today: string) {
  if (!priceDate) return false;
  const age =
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${priceDate.slice(0, 10)}T00:00:00Z`)) /
    86_400_000;
  return age > 4;
}

function finiteOrZero(value: number) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}
