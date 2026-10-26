import { cookies, headers } from "next/headers";

import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, translator, type Locale, type Translate } from "./core";

/**
 * Picks the language for a page. A flag the person clicked (saved in a cookie) always
 * wins. Without one, visitors located in Armenia (Vercel's country header) or whose
 * browser prefers Armenian start in Armenian; everyone else starts in English.
 */
export function chooseLocale({
  cookie,
  country,
  acceptLanguage,
}: {
  cookie?: string | null;
  country?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(cookie)) return cookie;
  if (country?.toUpperCase() === "AM") return "hy";
  const preferred = acceptLanguage?.split(",")[0]?.trim().toLowerCase() ?? "";
  if (preferred === "hy" || preferred.startsWith("hy-")) return "hy";
  return DEFAULT_LOCALE;
}

/** The language for server-rendered pages. */
export async function getLocale(): Promise<Locale> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return chooseLocale({
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    country: headerList.get("x-vercel-ip-country"),
    acceptLanguage: headerList.get("accept-language"),
  });
}

export async function getT(): Promise<Translate> {
  return translator(await getLocale());
}
