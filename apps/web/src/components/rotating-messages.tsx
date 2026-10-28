"use client";

import { useEffect, useState } from "react";

const TURN_MS = 7000;

/** Short messages that take turns, fading from one to the next; dots pick one directly. */
export function RotatingMessages({ messages, label }: { messages: string[]; label: string }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || messages.length < 2) return;
    const timer = window.setInterval(() => setIndex((value) => (value + 1) % messages.length), TURN_MS);
    return () => window.clearInterval(timer);
  }, [paused, messages.length]);
  return (
    <div
      className="rotating-messages"
      role="region"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <p key={index} className="rotating-message">
        {messages[index]}
      </p>
      {messages.length > 1 && (
        <div className="rotating-dots">
          {messages.map((message, at) => (
            <button
              key={at}
              type="button"
              aria-label={`${at + 1} / ${messages.length}`}
              aria-current={at === index ? "true" : undefined}
              className={at === index ? "active" : ""}
              onClick={() => setIndex(at)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
