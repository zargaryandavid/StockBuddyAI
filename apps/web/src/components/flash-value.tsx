"use client";

import { useState, type ReactNode } from "react";

/**
 * Shows `children`, flashing green when `value` goes up and red when it goes down (for
 * example after prices refresh). The first value never flashes.
 */
export function FlashValue({ value, children }: { value: number | null | undefined; children: ReactNode }) {
  const [previous, setPrevious] = useState(value);
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  // Comparing with the last render's value is React's "adjust state while rendering" pattern.
  if (value !== previous) {
    setPrevious(value);
    if (value != null && previous != null && Number.isFinite(value) && Number.isFinite(previous)) {
      setDirection(value > previous ? "up" : "down");
    }
  }
  return (
    // A new key restarts the flash each time the value changes.
    <span key={String(value)} className={direction ? `flash-${direction}` : undefined}>
      {children}
    </span>
  );
}
