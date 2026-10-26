import Link from "next/link";

import { LanguageSwitcher } from "@/components/language-switcher";
import { getT } from "@/lib/i18n/server";

/** Where people can reach the team about their data or these terms. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "support@stockbuddy.example";

export const LEGAL_UPDATED = "October 26, 2026";

/** A link to write to the team, for use inside legal text. */
export function ContactLink() {
  return <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
}

/** Shared layout for the Privacy Policy and Terms. Readable without signing in. */
export async function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  const t = await getT();
  const [beforeEmail, afterEmail = ""] = t("Questions? Write to {email}.").split("{email}");
  return (
    <main className="legal-page">
      <LanguageSwitcher className="on-light page-language" />
      <Link className="brand" href="/">
        STOCKBUDDY
      </Link>
      <article>
        <h1>{t(title)}</h1>
        <p className="muted">
          {t("Last updated {date}. StockBuddy is in early access (beta).", { date: t(LEGAL_UPDATED) })}
        </p>
        {children}
        <p className="legal-contact">
          {beforeEmail}
          <ContactLink />
          {afterEmail}
        </p>
        <nav className="legal-links" aria-label={t("Legal")}>
          <Link href="/terms">{t("Terms")}</Link>
          <Link href="/privacy">{t("Privacy Policy")}</Link>
          <Link href="/login">{t("Sign in")}</Link>
        </nav>
      </article>
    </main>
  );
}
