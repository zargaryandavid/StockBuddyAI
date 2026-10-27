/** Grey placeholder lines that shimmer while something loads; read out as `label`. */
export function ShimmerLines({ label, lines = 3, card = false }: { label: string; lines?: number; card?: boolean }) {
  return (
    <div className={card ? "shimmer-cards" : "shimmer-lines"} role="status" aria-label={label}>
      {Array.from({ length: lines }).map((_, index) => (
        <span key={index} className={card ? "shimmer shimmer-card" : "shimmer shimmer-line"} />
      ))}
    </div>
  );
}
