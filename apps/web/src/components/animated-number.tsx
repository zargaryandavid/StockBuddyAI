"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const DURATION_MS = 700;

/** Whether the browser can and may animate: off for reduced motion and outside browsers. */
function canAnimate() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    typeof window.requestAnimationFrame === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function subscribeMotion(onChange: () => void) {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  query.addEventListener?.("change", onChange);
  return () => query.removeEventListener?.("change", onChange);
}

/**
 * A number that rolls to its value: from 0 the first time it shows, then from the old
 * value to the new one whenever it changes. Screen readers get the final value only.
 */
export function AnimatedNumber({ value, format }: { value: number; format: (value: number) => string }) {
  // false while the server renders and during hydration, so both render the same text.
  const animate = useSyncExternalStore(subscribeMotion, canAnimate, () => false);
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    if (!animate || !Number.isFinite(value)) return;
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS);
      // Ease out: quick at first, settling gently on the value.
      const next = origin + (value - origin) * (1 - Math.pow(1 - progress, 3));
      from.current = next;
      setShown(progress < 1 ? next : value);
      if (progress < 1) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [animate, value]);

  if (!animate || !Number.isFinite(value) || shown === value) return <>{format(value)}</>;
  return (
    <>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}
