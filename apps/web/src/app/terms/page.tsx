import type { Metadata } from "next";
import Link from "next/link";

import { CONTACT_EMAIL, LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms · StockBuddy" };

// Plain-language terms for the early-access period. Have them reviewed before a wider
// launch, and fill in the governing law once the operating company is set up.
export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use">
      <h2>Early access</h2>
      <p>
        StockBuddy is in early access. Features may change, break, or be removed, and the
        service may be unavailable at times. Your feedback helps us fix that.
      </p>

      <h2>Not financial advice</h2>
      <p>
        StockBuddy gives estimates, education, and organizing tools. It is not a financial,
        investment, tax, or legal adviser, and nothing in it is a recommendation to buy,
        sell, or hold anything. Projections, FIRE dates, AI reviews, and market data can be
        wrong or out of date. Make your own decisions, and talk to a licensed professional
        before acting on anything important.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be at least 18 and give a real email address you control.</li>
        <li>Keep your password private; you are responsible for activity in your account.</li>
        <li>You own the data you enter. You let us store and process it only to run the service.</li>
      </ul>

      <h2>Fair use</h2>
      <ul>
        <li>Don&apos;t try to access other people&apos;s data, break or overload the service, or scrape it.</li>
        <li>
          AI features have daily limits per account so the service stays available and
          affordable for everyone.
        </li>
        <li>We may suspend accounts that break these terms or put other users at risk.</li>
      </ul>

      <h2>Third-party data</h2>
      <p>
        Prices and company data come from public sources such as the SEC and Yahoo Finance and
        are provided as they are, without guarantee of accuracy or timeliness.
      </p>

      <h2>Liability</h2>
      <p>
        The service is provided &ldquo;as is&rdquo; during early access. To the extent the law
        allows, we are not liable for investment losses or for indirect damages from using it.
      </p>

      <h2>Ending your use</h2>
      <p>
        You can stop using StockBuddy at any time and ask us to delete your account (see the{" "}
        <Link href="/privacy">Privacy Policy</Link>). We may end the early-access program, and we
        will give you notice and a chance to get a copy of your data first.
      </p>

      <h2>Changes</h2>
      <p>
        We will tell you about meaningful changes to these terms before they apply. Questions:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    </LegalPage>
  );
}
