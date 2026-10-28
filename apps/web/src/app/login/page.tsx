import { Suspense } from "react";
import Link from "next/link";

import { LanguageSwitcher } from "@/components/language-switcher";

import { AuthForm } from "@/components/auth-form";
import { InvestorQuote } from "@/components/investor-quote";
import { RotatingMessages } from "@/components/rotating-messages";
import { getT } from "@/lib/i18n/server";
import Image from "next/image";
import { BrandMark } from "@/components/brand-mark";

const CONFIRM_NOTICES: Record<string, string> = {
  done: "Your email is confirmed. Sign in to continue.",
  deleted: "Your account and all its data were deleted. Thanks for trying MyPortfolioBuddy.",
  "session-ended": "Your session ended, so we signed you out. Please sign in again.",
  expired: "That confirmation link has expired or was already used. Sign in, or create the account again to get a new link.",
  "reset-expired": "That password reset link has expired or was already used. Ask for a new one below.",
  "reset-browser": "Open the password reset link in the same browser you asked for it from, or ask for a new one below.",
};

const BILL = "/login/hundred-dollar-bill.webp";

type SearchParams = Promise<{ confirm?: string; join?: string }>;

/** The form, with a note about the confirmation link the person just opened, if any. */
async function FormWithNotice({ searchParams }: { searchParams: SearchParams }) {
  const { confirm, join } = await searchParams;
  return <AuthForm notice={confirm ? CONFIRM_NOTICES[confirm] : undefined} join={join === "1"} />;
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const t = await getT();
  return (
    <main className="login-shell">
      <LanguageSwitcher className="on-light page-language" />
      <section className="login-copy">
        <Link className="brand" href="/">
          <BrandMark />
        </Link>
        <p className="eyebrow">{t("Fundamentals, not hype")}</p>
        <h1>{t("Your AI buddy for portfolio and financial management.")}</h1>
        <RotatingMessages
          label={t("Why MyPortfolioBuddy")}
          messages={[
            t(
              "Reach financial freedom and learn more about your current portfolio. Let your money work for you: a simple website for a simple path to wealth.",
            ),
            t(
              "Take care of your finances now and build your “F-you money”, so one day you never have to work again. Many of our parents never had the chance to plan for that. You do.",
            ),
            t(
              "The stock market is the most powerful wealth-building tool of all time. Be patient and disciplined.",
            ),
          ]}
        />
        <div className="principles">
          <span>{t("No personalized information")}</span>
          <span>{t("User-friendly interface")}</span>
          <span>{t("Transparent analytics")}</span>
        </div>
        <InvestorQuote
          quote={t("“Rule No. 1: Never lose money. Rule No. 2: Never forget rule No. 1.”")}
          author={t("Warren Buffett")}
          photo="/login/investor.jpg"
        />
        <div className="login-bills" aria-hidden="true">
          {/* A real note, shown front only, small and low-resolution as US rules ask. */}
          <Image className="login-bill back" src={BILL} alt="" width={520} height={226} priority unoptimized />
          <Image className="login-bill front" src={BILL} alt="" width={520} height={226} priority unoptimized />
        </div>
      </section>
      <section className="login-panel">
        <div>
          <p className="eyebrow">{t("Private workspace")}</p>
          <h2>{t("Sign in to your book")}</h2>
          <p className="muted">{t("Early access. Your data stays private to your account.")}</p>
        </div>
        <Suspense fallback={<AuthForm />}>
          <FormWithNotice searchParams={searchParams} />
        </Suspense>
        <nav className="login-legal" aria-label={t("Legal")}>
          <Link href="/terms">{t("Terms")}</Link>
          <Link href="/privacy">{t("Privacy Policy")}</Link>
        </nav>
        <p className="login-copyright">{t("© 2026 AIAutomationLA.com. All rights reserved.")}</p>
      </section>
    </main>
  );
}
