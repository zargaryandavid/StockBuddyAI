"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";

import { useT } from "@/lib/i18n/client";

/**
 * An (i) button that opens a short explanation beside it. Escape, Close, or a click
 * anywhere else shuts it.
 */
export function InfoPopover({
  label,
  children,
  align = "right",
}: {
  /** Read out for the button and the pop-up, e.g. "About the cash target". */
  label: string;
  children: ReactNode;
  /** Which edge of the button the pop-up lines up with. */
  align?: "left" | "right";
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <span className="info-popover" ref={box}>
      <button
        type="button"
        className="today-info-button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={(event) => {
          event.preventDefault();
          setOpen((value) => !value);
        }}
      >
        <Info size={15} aria-hidden="true" />
      </button>
      {open && (
        <span id={id} role="dialog" aria-label={label} className={`today-info-popup info-popup-${align}`}>
          {children}
          <button type="button" className="text-button" onClick={() => setOpen(false)}>
            {t("Close")}
          </button>
        </span>
      )}
    </span>
  );
}
