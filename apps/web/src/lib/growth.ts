/** One year on the growth chart: what the money is worth, and how much of it you put in. */
export type GrowthPoint = { year: number; value: number; contributed: number };

export type GrowthResult = {
  futureValue: number;
  contributed: number;
  growth: number;
  points: GrowthPoint[];
};

/**
 * Compound growth with a monthly contribution: the yearly return is applied monthly
 * (rate ÷ 12) and each month's contribution is added at the end of the month.
 */
export function projectGrowth({
  principal,
  monthly,
  years,
  annualReturnPct,
}: {
  principal: number;
  monthly: number;
  years: number;
  annualReturnPct: number;
}): GrowthResult {
  const rate = annualReturnPct / 100 / 12;
  const months = Math.max(0, Math.round(years * 12));
  let value = Math.max(0, principal);
  let contributed = value;
  const points: GrowthPoint[] = [{ year: 0, value, contributed }];
  for (let month = 1; month <= months; month += 1) {
    value = value * (1 + rate) + monthly;
    contributed += monthly;
    if (month % 12 === 0) points.push({ year: month / 12, value, contributed });
  }
  return { futureValue: value, contributed, growth: value - contributed, points };
}

/** Round chart labels: 0, 400k, 800k… for the y axis. */
export function niceTicks(max: number, count = 4) {
  if (!(max > 0)) return [0];
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * power).find((candidate) => candidate >= rough) ?? rough;
  const ticks: number[] = [];
  for (let value = 0; value <= max + step * 0.001; value += step) ticks.push(value);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}
