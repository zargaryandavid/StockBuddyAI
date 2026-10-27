"use client";

import { useEffect, useState } from "react";

import { useT } from "@/lib/i18n/client";

const REVIEWERS = [
  { id: "graham", name: "Benjamin Graham", initials: "BG" },
  { id: "buffett", name: "Warren Buffett", initials: "WB" },
  { id: "munger", name: "Charlie Munger", initials: "CM" },
  { id: "lynch", name: "Peter Lynch", initials: "PL" },
  { id: "druckenmiller", name: "Stanley Druckenmiller", initials: "SD" },
];

const STEPS = [
  "{name} is reading {ticker}'s filings…",
  "{name} is checking the balance sheet…",
  "{name} is weighing the price against the business…",
  "{name} is writing a verdict…",
];

const TURN_MS = 2200;

/** The five reviewers taking turns while a holding is being reviewed. */
export function ReviewerCrew({ ticker }: { ticker: string }) {
  const t = useT();
  const [turn, setTurn] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setTurn((value) => value + 1), TURN_MS);
    return () => window.clearInterval(timer);
  }, []);
  const active = turn % REVIEWERS.length;
  const reviewer = REVIEWERS[active];
  return (
    <div className="reviewer-crew">
      <ul className="reviewer-avatars" aria-hidden="true">
        {REVIEWERS.map((item, index) => (
          <li key={item.id} className={`reviewer-avatar reviewer-${item.id}${index === active ? " active" : ""}`}>
            {item.initials}
          </li>
        ))}
      </ul>
      <p className="reviewer-line" key={turn} aria-live="polite">
        {t(STEPS[turn % STEPS.length], { name: reviewer.name, ticker })}
      </p>
    </div>
  );
}
