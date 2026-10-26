import { hy } from "./hy";

/** The languages StockBuddy speaks. English is the source; text not yet translated falls back to it. */
export const LOCALES = ["en", "hy"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";
/** Cookie that remembers the chosen language for a year. */
export const LOCALE_COOKIE = "lang";

export type Vars = Record<string, string | number>;
export type Translate = (text: string, vars?: Vars) => string;

const DICTIONARIES: Record<Locale, Record<string, string>> = { en: {}, hy };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * Translates English text. The English sentence itself is the key, so untranslated text
 * still reads correctly. `{name}` placeholders are filled from `vars` in either language.
 */
export function translate(locale: Locale, text: string, vars?: Vars): string {
  const template = DICTIONARIES[locale][text] ?? text;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

export function translator(locale: Locale): Translate {
  return (text, vars) => translate(locale, text, vars);
}
