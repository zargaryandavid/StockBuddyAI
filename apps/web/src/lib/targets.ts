import { api } from "@/lib/api";

/** Analysts' 1-year price target; approximate when hand-entered or researched on the web. */
export type Target = { target: number; approximate?: boolean; source?: string; as_of?: string };
export type Targets = Record<string, Target | null>;
export type TargetsState = { targets: Targets; analyzing: Set<string>; note: string | null };

type Answer = { configured: boolean; message?: string; targets: Targets; analyzing?: string[] };

/** Stocks researched per request; the server does at most this many at a time. */
const BATCH = 10;

/**
 * Shows what the shared database already knows at once, then has the server research the
 * rest ("Analyzing…") in small batches, filling each number in as it arrives. A stock one
 * client's research found shows instantly for every other client after that.
 */
export async function loadTargets(
  tickers: string[],
  update: (state: TargetsState) => void,
  active: () => boolean,
): Promise<void> {
  const symbols = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))].sort().slice(0, 40);
  if (!symbols.length) return;
  const answer = await api<Answer>(`/api/securities/targets?tickers=${encodeURIComponent(symbols.join(","))}`);
  if (!active() || !answer) return;
  const targets: Targets = { ...(answer.targets ?? {}) };
  const analyzing = new Set(answer.analyzing ?? []);
  const note = answer.configured ? null : (answer.message ?? null);
  update({ targets: { ...targets }, analyzing: new Set(analyzing), note });

  const queue = [...analyzing];
  while (queue.length && active()) {
    const batch = queue.splice(0, BATCH);
    try {
      const done = await api<{ targets: Targets }>("/api/securities/targets/research", {
        method: "POST",
        body: JSON.stringify({ tickers: batch }),
      });
      // A batch another client is already researching comes back empty; it stays "Analyzing…"
      // until the next visit, when the shared database has it.
      for (const [symbol, value] of Object.entries(done?.targets ?? {})) {
        if (value || !targets[symbol]) targets[symbol] = value;
        analyzing.delete(symbol);
      }
    } catch {
      // Research is unavailable right now: show the last known number or a dash, not a spinner.
      batch.forEach((symbol) => analyzing.delete(symbol));
      queue.forEach((symbol) => analyzing.delete(symbol));
      queue.length = 0;
    }
    if (active()) update({ targets: { ...targets }, analyzing: new Set(analyzing), note });
  }
}
