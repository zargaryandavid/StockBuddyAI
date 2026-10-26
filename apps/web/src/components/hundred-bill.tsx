/**
 * A drawn $100 bill for the sign-in page. It is a StockBuddy play bill, not a copy of real
 * currency: its own wording and emblem, no portrait, no seals.
 */
export function HundredBill({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 520 224" role="img" aria-label="A one hundred dollar bill">
      <defs>
        <linearGradient id="bill-paper" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e4efd9" />
          <stop offset="0.55" stopColor="#cfe2c2" />
          <stop offset="1" stopColor="#b9d3ab" />
        </linearGradient>
        <pattern id="bill-lines" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="8" stroke="#2f5d43" strokeOpacity="0.07" strokeWidth="2" />
        </pattern>
        <radialGradient id="bill-emblem" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#f4f8ef" />
          <stop offset="1" stopColor="#b6cfa6" />
        </radialGradient>
      </defs>

      <rect x="2" y="2" width="516" height="220" rx="10" fill="url(#bill-paper)" stroke="#3d6b4f" strokeWidth="3" />
      <rect x="2" y="2" width="516" height="220" rx="10" fill="url(#bill-lines)" />
      <rect x="16" y="16" width="488" height="192" rx="6" fill="none" stroke="#3d6b4f" strokeWidth="1.5" />
      <rect x="22" y="22" width="476" height="180" rx="4" fill="none" stroke="#3d6b4f" strokeOpacity="0.45" strokeDasharray="2 3" />

      <g fill="#2f5d43" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700">
        <text x="34" y="58" fontSize="30">100</text>
        <text x="486" y="58" fontSize="30" textAnchor="end">100</text>
        <text x="34" y="190" fontSize="30">100</text>
        <text x="486" y="190" fontSize="30" textAnchor="end">100</text>
        <text x="260" y="50" fontSize="15" letterSpacing="4" textAnchor="middle">STOCKBUDDY RESERVE</text>
        <text x="260" y="194" fontSize="14" letterSpacing="5" textAnchor="middle">ONE HUNDRED</text>
      </g>

      <ellipse cx="260" cy="118" rx="74" ry="58" fill="url(#bill-emblem)" stroke="#3d6b4f" strokeWidth="2" />
      <ellipse cx="260" cy="118" rx="64" ry="48" fill="none" stroke="#3d6b4f" strokeOpacity="0.5" strokeDasharray="1 3" />
      {/* Emblem: a rising chart line */}
      <polyline
        points="216,140 238,124 254,132 278,102 302,92"
        fill="none"
        stroke="#2f5d43"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <polygon points="302,84 312,94 298,100" fill="#2f5d43" />

      <g fill="#2f5d43" fontFamily="Georgia, 'Times New Roman', serif">
        <text x="112" y="126" fontSize="62" fontWeight="700" textAnchor="middle" fillOpacity="0.85">$</text>
        <text x="408" y="136" fontSize="64" fontWeight="700" textAnchor="middle" fillOpacity="0.85">100</text>
        <text x="112" y="158" fontSize="10" letterSpacing="2" textAnchor="middle">FINANCIAL</text>
        <text x="112" y="171" fontSize="10" letterSpacing="2" textAnchor="middle">FREEDOM</text>
      </g>
    </svg>
  );
}
