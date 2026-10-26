// Hypothetical "current holdings" performance: today's share counts valued at past
// completed closes. It answers "how have the things I own now done?", not "how has my
// account done?" (that needs dated buys, sells, and cash flows), and is labeled as such.

export type DateRange = "1M" | "3M" | "6M" | "YTD" | "1Y" | "3Y" | "All";
export type CloseHistory = Record<string, { date: string; close: number }[]>;

export type PerformancePoint = {
  date: string;
  value: number;
  portfolioPct: number;
  benchmarkPct: number | null;
};

export type HoldingsPerformance = {
  points: PerformancePoint[];
  portfolioReturn: number | null;
  benchmarkReturn: number | null;
  /** Holdings left out: no close at the start of the range, or another currency. */
  excluded: string[];
  startDate: string | null;
  endDate: string | null;
};

/** "All" reaches back five years. */
export function rangeStart(range: DateRange, today: string) {
  const [year, month, day] = today.split("-").map(Number);
  const back = (years: number, months: number) =>
    new Date(Date.UTC(year - years, month - 1 - months, day)).toISOString().slice(0, 10);
  switch (range) {
    case "1M":
      return back(0, 1);
    case "3M":
      return back(0, 3);
    case "6M":
      return back(0, 6);
    case "YTD":
      return `${year}-01-01`;
    case "1Y":
      return back(1, 0);
    case "3Y":
      return back(3, 0);
    default:
      return back(5, 0);
  }
}

export function holdingsPerformance({
  holdings,
  closes,
  benchmark,
  baseCurrency = "USD",
}: {
  holdings: { ticker: string; shares: number; quote_currency?: string | null }[];
  closes: CloseHistory;
  benchmark: string;
  baseCurrency?: string;
}): HoldingsPerformance {
  const empty: HoldingsPerformance = {
    points: [],
    portfolioReturn: null,
    benchmarkReturn: null,
    excluded: [],
    startDate: null,
    endDate: null,
  };
  const timeline = (closes[benchmark] ?? []).map((bar) => bar.date);
  const included: { ticker: string; shares: number; byDate: Map<string, number> }[] = [];
  const excluded: string[] = [];
  for (const holding of holdings) {
    const series = closes[holding.ticker] ?? [];
    const foreign = holding.quote_currency && holding.quote_currency !== baseCurrency;
    const startsLate = !series.length || (timeline[0] && series[0].date > timeline[0]);
    if (Number(holding.shares) <= 0) continue;
    if (foreign || startsLate) {
      excluded.push(holding.ticker);
      continue;
    }
    included.push({
      ticker: holding.ticker,
      shares: Number(holding.shares),
      byDate: new Map(series.map((bar) => [bar.date, bar.close])),
    });
  }
  if (!timeline.length || !included.length) return { ...empty, excluded };

  const lastClose = new Map<string, number>();
  const benchmarkByDate = new Map((closes[benchmark] ?? []).map((bar) => [bar.date, bar.close]));
  const benchmarkStart = benchmarkByDate.get(timeline[0]) ?? null;
  const points: PerformancePoint[] = [];
  for (const date of timeline) {
    let value = 0;
    for (const holding of included) {
      const close = holding.byDate.get(date) ?? lastClose.get(holding.ticker);
      if (close == null) continue;
      lastClose.set(holding.ticker, close);
      value += close * holding.shares;
    }
    const bench = benchmarkByDate.get(date);
    points.push({
      date,
      value,
      portfolioPct: 0,
      benchmarkPct: bench != null && benchmarkStart ? (bench / benchmarkStart - 1) * 100 : null,
    });
  }
  const startValue = points[0].value;
  for (const point of points) {
    point.portfolioPct = startValue ? (point.value / startValue - 1) * 100 : 0;
  }
  const last = points[points.length - 1];
  return {
    points,
    portfolioReturn: startValue ? last.portfolioPct : null,
    benchmarkReturn: last.benchmarkPct,
    excluded,
    startDate: points[0].date,
    endDate: last.date,
  };
}
