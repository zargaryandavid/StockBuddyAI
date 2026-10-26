import { Suspense } from "react";
import Link from "next/link";

import { AuthForm } from "@/components/auth-form";
import { HundredBill } from "@/components/hundred-bill";

const CONFIRM_NOTICES: Record<string, string> = {
  done: "Your email is confirmed. Sign in to continue.",
  expired: "That confirmation link has expired or was already used. Sign in, or create the account again to get a new link.",
  "reset-expired": "That password reset link has expired or was already used. Ask for a new one below.",
  "reset-browser": "Open the password reset link in the same browser you asked for it from, or ask for a new one below.",
};

type SearchParams = Promise<{ confirm?: string }>;

/** The form, with a note about the confirmation link the person just opened, if any. */
async function FormWithNotice({ searchParams }: { searchParams: SearchParams }) {
  const { confirm } = await searchParams;
  return <AuthForm notice={confirm ? CONFIRM_NOTICES[confirm] : undefined} />;
}

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="login-shell">
      <section className="login-copy">
        <Link className="brand" href="/">
          STOCKBUDDY
        </Link>
        <p className="eyebrow">Fundamentals, not hype</p>
        <h1>Your AI buddy for portfolio and financial management.</h1>
        <p>
          Reach financial freedom and learn more about your current portfolio. Let your
          money work for you: a simple website for a simple path to wealth.
        </p>
        <div className="principles">
          <span>No personalized information</span>
          <span>User-friendly interface</span>
          <span>Transparent analytics</span>
        </div>
        <div className="login-bills" aria-hidden="true">
          <HundredBill className="login-bill back" />
          <HundredBill className="login-bill front" />
        </div>
      </section>
      <section className="login-panel">
        <div>
          <p className="eyebrow">Private workspace</p>
          <h2>Sign in to your book</h2>
          <p className="muted">Early access. Your data stays private to your account.</p>
        </div>
        <Suspense fallback={<AuthForm />}>
          <FormWithNotice searchParams={searchParams} />
        </Suspense>
        <nav className="login-legal" aria-label="Legal">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy Policy</Link>
        </nav>
        <p className="login-copyright">© 2026 AIAutomationLA.com. All rights reserved.</p>
      </section>
    </main>
  );
}
