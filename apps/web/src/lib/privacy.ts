"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Remembers on this device whether money amounts are shown; hidden until the person opts in. */
const KEY = "mpb.showAmounts";
/** What a hidden amount looks like. */
export const HIDDEN_AMOUNT = "•••••";

const listeners = new Set<() => void>();
// Used when the browser refuses storage (some private windows): lasts until reload.
let fallback = false;

function read() {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return fallback;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Whether amounts are hidden, and a way to switch. The server always renders them hidden. */
export function useHiddenAmounts(): [boolean, () => void] {
  const shown = useSyncExternalStore(subscribe, read, () => false);
  const toggle = useCallback(() => {
    const next = !read();
    try {
      window.localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      fallback = next;
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [!shown, toggle];
}
