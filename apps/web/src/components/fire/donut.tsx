// Shared SVG donut used by "What you own today" and the income/expense breakdowns.

export type DonutSlice = { key: string; label: string; share: number; color: string };

const PALETTE = ["var(--navy)", "var(--gold-dark)", "#2f8a5b", "#8fa3bf", "#a0522d", "#6d5bd0", "#c0567a", "#3b8ea5"];

/** A stable color per position, cycling through the palette. */
export function sliceColor(index: number) {
  return PALETTE[index % PALETTE.length];
}

export function DonutRing({
  slices,
  label,
  total,
  caption = "total",
}: {
  slices: DonutSlice[];
  /** Accessible description of the chart. */
  label: string;
  total: string;
  caption?: string;
}) {
  const radius = 15.915; // circumference ≈ 100, so dash lengths read as percentages
  // Each slice starts where the previous ones end, beginning at 12 o'clock.
  const segments = slices.map((slice, index) => ({
    ...slice,
    length: slice.share * 100,
    offset: 25 - slices.slice(0, index).reduce((sum, item) => sum + item.share * 100, 0),
  }));
  return (
    <svg viewBox="0 0 42 42" role="img" aria-label={label} className="donut-ring">
      <circle cx="21" cy="21" r={radius} className="fire-donut-track" />
      {segments.map((segment) => (
        <circle
          key={segment.key}
          cx="21"
          cy="21"
          r={radius}
          fill="none"
          stroke={segment.color}
          strokeWidth="6"
          strokeDasharray={`${segment.length} ${100 - segment.length}`}
          strokeDashoffset={segment.offset}
        />
      ))}
      <text x="21" y="20" textAnchor="middle" className="fire-donut-total">
        {total}
      </text>
      <text x="21" y="25" textAnchor="middle" className="fire-donut-caption">
        {caption}
      </text>
    </svg>
  );
}
