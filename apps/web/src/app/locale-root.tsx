import type { ReactNode } from "react";

import { I18nProvider } from "@/lib/i18n/client";
import { getLocale } from "@/lib/i18n/server";

/** Reads the language cookie once per request and hands it to every client component. */
export async function LocaleRoot({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <I18nProvider key={locale} locale={locale}>
      {children}
    </I18nProvider>
  );
}
