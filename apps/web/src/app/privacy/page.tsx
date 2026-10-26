import type { Metadata } from "next";

import { CONTACT_EMAIL, LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy Policy · StockBuddy" };

// Plain-language policy written for what the app actually does. Have it reviewed for the
// countries where your early adopters live before a wider launch.
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account:</strong> your email address and a password (stored only as a secure
          hash by our authentication provider), and when you accepted these terms.
        </li>
        <li>
          <strong>What you enter:</strong> your date of birth (if you add it), incomes,
          expenses, savings, bonds, assets and their locations, portfolio holdings and
          transactions, report reminders, and wishlist items.
        </li>
        <li>
          <strong>Technical data:</strong> basic logs our servers keep to run and secure the
          service, such as request times and errors.
        </li>
      </ul>

      <h2>How we use it</h2>
      <p>
        Only to run StockBuddy for you: show your FIRE plan, portfolio, and analytics, send the
        reminder emails you ask for, and keep the service secure. We do not sell your data,
        show ads, or share it for marketing.
      </p>

      <h2>Who else processes it</h2>
      <ul>
        <li>
          <strong>Supabase</strong> hosts our database, sign-in, and file storage.
        </li>
        <li>
          <strong>Anthropic</strong> receives the text of your 300-wishes list when we check a
          new wish for repeats.
        </li>
        <li>
          <strong>OpenAI</strong> receives a portfolio screenshot when you choose to import one.
        </li>
        <li>
          <strong>Market data sources</strong> (the SEC and Yahoo Finance) receive only ticker
          symbols to look up public prices and company data, never anything about you.
        </li>
        <li>
          <strong>Our email provider</strong> sends account and reminder emails to your address.
        </li>
      </ul>
      <p>
        These providers act on our instructions and may process data outside your country.
      </p>

      <h2>Who can see your data</h2>
      <p>
        Your financial entries are private to your account; other users can never see them.
        Our administrators manage shared content such as Education articles and do not browse
        individual accounts except to fix a problem you report or when the law requires it.
      </p>

      <h2>How long we keep it, and your choices</h2>
      <p>
        We keep your data while your account is open. You can edit or delete any entry at any
        time. To delete your whole account, or to get a copy of your data, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from your account&apos;s address and
        we will do it within 30 days. Backups that contain deleted data expire on their own
        schedule.
      </p>

      <h2>Security</h2>
      <p>
        Data travels encrypted, every account&apos;s records are isolated at the database level,
        and service keys are stored encrypted. No system is perfectly secure; if we learn of a
        breach that affects you, we will tell you.
      </p>

      <h2>Children</h2>
      <p>StockBuddy is not meant for anyone under 18.</p>

      <h2>Changes</h2>
      <p>
        If we change this policy in a meaningful way, we will tell you by email or in the app
        before the change applies.
      </p>
    </LegalPage>
  );
}
