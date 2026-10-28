import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { SharedFireView } from "@/components/share/shared-fire";
import { SharedPortfolioView } from "@/components/share/shared-portfolio";
import type { SharedPage } from "@/components/share/types";
import { getT } from "@/lib/i18n/server";
import { BrandMark } from "@/components/brand-mark";

// Shared pages are private to whoever has the link: keep them out of search engines.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("Shared from MyPortfolioBuddy"),
    robots: { index: false, follow: false },
  };
}

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
  const t = await getT();
  const { token } = await params;
  const page = await loadShare(token);
  if (!page) {
    return (
      <section className="share-panel share-missing">
        <h1>{t("This link isn't active")}</h1>
        <p className="muted">{t("The owner may have turned it off. Ask them for a new link.")}</p>
      </section>
    );
  }
  const owner = page.owner_name?.trim();
  const portfolioName = page.portfolio?.name;
  const title =
    page.kind === "fire"
      ? owner
        ? t("{owner}'s FIRE plan", { owner })
        : t("A FIRE plan")
      : owner
        ? portfolioName
          ? t("{owner}'s portfolio: {name}", { owner, name: portfolioName })
          : t("{owner}'s portfolio", { owner })
        : portfolioName
          ? t("A portfolio: {name}", { name: portfolioName })
          : t("A portfolio");
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <header className="share-head">
        <h1>{title}</h1>
        <p className="muted">
          {t("Read-only view shared from MyPortfolioBuddy · prices as of {date} UTC. Estimates, not advice.", {
            date: new Date(page.generated_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }),
          })}
        </p>
      </header>
      {page.kind === "fire" ? (
        <SharedFireView page={page} today={today} />
      ) : page.portfolio ? (
        <SharedPortfolioView portfolio={page.portfolio} />
      ) : (
        <p className="muted">{t("This portfolio is no longer available.")}</p>
      )}
    </>
  );
}

export default async function SharePage({ params }: { params: Params }) {
  const t = await getT();
  return (
    <main className="share-page">
      <LanguageSwitcher className="on-light page-language" />
      <Link className="brand" href="/">
        <BrandMark />
      </Link>
      <Suspense fallback={<p className="muted">{t("Loading…")}</p>}>
        <SharedContent params={params} />
      </Suspense>
    </main>
  );
}
