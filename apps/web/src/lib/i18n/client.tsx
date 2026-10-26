"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { DEFAULT_LOCALE, LOCALE_COOKIE, translator, type Locale, type Translate } from "./core";

type I18n = { locale: Locale; t: Translate; setLocale: (locale: Locale) => void };

const I18nContext = createContext<I18n>({
  locale: DEFAULT_LOCALE,
  t: translator(DEFAULT_LOCALE),
  setLocale: () => undefined,
});

/** Holds the chosen language; the server reads the same cookie to render the first page. */
export function I18nProvider({ locale: initial, children }: { locale: Locale; children: ReactNode }) {
  const router = useRouter();
  const [locale, setLocaleState] = useState<Locale>(initial);
  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
      setLocaleState(next);
      router.refresh(); // server-rendered text (sign-in page, legal pages) follows along
    },
    [router],
  );
  // The server may pick Armenian without a cookie (country or browser language).
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo(() => ({ locale, t: translator(locale), setLocale }), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** The current language, its translator, and a way to change it. Defaults to English. */
export function useI18n(): I18n {
  return useContext(I18nContext);
}

/** Shorthand for the translator: `const t = useT(); t("Sign in")`. */
export function useT(): Translate {
  return useContext(I18nContext).t;
}
