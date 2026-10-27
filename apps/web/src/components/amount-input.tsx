"use client";

import { useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number;
  onChange: (value: number) => void;
};

/** Digits and one decimal point, with no leading zeros. */
export function cleanAmount(raw: string) {
  let text = raw.replace(/[^\d.]/g, "");
  const dot = text.indexOf(".");
  if (dot !== -1) text = text.slice(0, dot + 1) + text.slice(dot + 1).replace(/\./g, "").slice(0, 2);
  text = text.replace(/^0+(?=\d)/, "");
  return text.startsWith(".") ? `0${text}` : text;
}

/**
 * A money amount: shows 30,000 while you read it and the plain number while you type,
 * never "030000".
 */
export function AmountInput({ value, onChange, onFocus, onBlur, ...rest }: Props) {
  // What is being typed; null when the field is not being edited.
  const [draft, setDraft] = useState<string | null>(null);
  const shown =
    draft ??
    (Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "0");
  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={shown}
      onFocus={(event) => {
        setDraft(value ? String(value) : "");
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setDraft(null);
        onBlur?.(event);
      }}
      onChange={(event) => {
        const text = cleanAmount(event.target.value);
        setDraft(text);
        onChange(text === "" || text === "." ? 0 : Number(text));
      }}
    />
  );
}
