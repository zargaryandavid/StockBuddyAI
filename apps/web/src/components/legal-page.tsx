import Link from "next/link";

/** Where people can reach the team about their data or these terms. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "support@stockbuddy.example";

export const LEGAL_UPDATED = "October 26, 2026";

/** Shared layout for the Privacy Policy and Terms. Readable without signing in. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="legal-page">
      <Link className="brand" href="/">
        STOCKBUDDY
      </Link>
      <article>
        <h1>{title}</h1>
        <p className="muted">Last updated {LEGAL_UPDATED}. StockBuddy is in early access (beta).</p>
        {children}
        <p className="legal-contact">
          Questions? Write to <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
        <nav className="legal-links" aria-label="Legal">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </article>
    </main>
  );
}
