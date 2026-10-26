import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { SharedFireView } from "@/components/share/shared-fire";
import { SharedPortfolioView } from "@/components/share/shared-portfolio";
import type { SharedPage } from "@/components/share/types";

// Shared pages are private to whoever has the link: keep them out of search engines.
export const metadata: Metadata = {
  title: "Shared from StockBuddy",
  robots: { index: false, follow: false },
};

type Params = Promise<{ token: string }>;

async function loadShare(token: string): Promise<SharedPage | null> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";
  try {
    const response = await fetch(`${base}/api/share/${encodeURIComponent(token)}`, { cache: "no-store" });
    return response.ok ? ((await response.json()) as SharedPage) : null;
  } catch {
    return null;
  }
}

async function SharedContent({ params }: { params: Params }) {
  await connection();
  const { token } = await params;
  const page = await loadShare(token);
  if (!page) {
    return (
      <section className="share-panel share-missing">
        <h1>This link isn&apos;t active</h1>
        <p className="muted">The owner may have turned it off. Ask them for a new link.</p>
      </section>
    );
  }
  const owner = page.owner_name?.trim();
  const title =
    page.kind === "fire"
      ? `${owner ? `${owner}'s` : "A"} FIRE plan`
      : `${owner ? `${owner}'s` : "A"} portfolio${page.portfolio?.name ? `: ${page.portfolio.name}` : ""}`;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <header className="share-head">
        <h1>{title}</h1>
        <p className="muted">
          Read-only view shared from StockBuddy · prices as of{" "}
          {new Date(page.generated_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC.
          Estimates, not advice.
        </p>
      </header>
      {page.kind === "fire" ? (
        <SharedFireView page={page} today={today} />
      ) : page.portfolio ? (
        <SharedPortfolioView portfolio={page.portfolio} />
      ) : (
        <p className="muted">This portfolio is no longer available.</p>
      )}
    </>
  );
}

export default function SharePage({ params }: { params: Params }) {
  return (
    <main className="share-page">
      <Link className="brand" href="/">
        STOCKBUDDY <span>AI</span>
      </Link>
      <Suspense fallback={<p className="muted">Loading…</p>}>
        <SharedContent params={params} />
      </Suspense>
    </main>
  );
}
