/** The MyPortfolioBuddy logo: a green coin with a gold $ and the name, "Buddy" in gold. */
export function BrandMark({ showName = true }: { showName?: boolean }) {
  return (
    <>
      <svg className="brand-coin" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="15" fill="#1f4d32" stroke="#e8c97a" strokeWidth="2" />
        <text
          x="16"
          y="22.5"
          textAnchor="middle"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontSize="19"
          fontWeight="700"
          fill="#e8c97a"
        >
          $
        </text>
      </svg>
      {showName && (
        <span className="brand-name">
          MyPortfolio<span className="brand-accent">Buddy</span>
        </span>
      )}
    </>
  );
}
