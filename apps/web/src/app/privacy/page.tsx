import type { Metadata } from "next";

import { ContactLink, LegalPage } from "@/components/legal-page";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Privacy Policy") };
}

// Plain-language policy written for what the app actually does. Have it reviewed for the
// countries where your early adopters live before a wider launch.
export default async function PrivacyPage() {
  const t = await getT();
  const [beforeEmail, afterEmail = ""] = t(
    "We keep your data while your account is open. You can edit or delete any entry at any time, and delete your whole account and all its data yourself from your profile (click your email in the menu). To get a copy of your data, email {email} from your account's address and we will send it within 30 days. Backups that contain deleted data expire on their own schedule.",
  ).split("{email}");
  return (
    <LegalPage title="Privacy Policy">
      <h2>{t("What we collect")}</h2>
      <ul>
        <li>
          <strong>{t("Account:")}</strong>{" "}
          {t(
            "your email address, a password (stored only as a secure hash by our authentication provider), the name you choose to show (if any), and when you accepted these terms.",
          )}
        </li>
        <li>
          <strong>{t("What you enter:")}</strong>{" "}
          {t(
            "your date of birth (if you add it), incomes, expenses, savings, bonds, assets and their locations, portfolio holdings, cash and transactions, a daily reading of your net worth for the chart, report reminders, wishlist items, book ratings and comments, and the share links you create.",
          )}
        </li>
        <li>
          <strong>{t("Technical data:")}</strong>{" "}
          {t(
            "basic logs our servers keep to run and secure the service, such as request times and errors, and how many AI features you used this month.",
          )}
        </li>
      </ul>

      <h2>{t("How we use it")}</h2>
      <p>
        {t(
          "Only to run MyPortfolioBuddy for you: show your FIRE plan, portfolio, and analytics, send the reminder emails you ask for, and keep the service secure. We do not sell your data, show ads, or share it for marketing.",
        )}
      </p>

      <h2>{t("Who else processes it")}</h2>
      <ul>
        <li>
          <strong>Supabase</strong> {t("hosts our database, sign-in, and file storage.")}
        </li>
        <li>
          <strong>Vercel</strong> {t("hosts the website and runs our servers.")}
        </li>
        <li>
          <strong>Anthropic</strong>{" "}
          {t("receives the text of your 300-wishes list when we check a new wish for repeats.")}
        </li>
        <li>
          <strong>OpenAI</strong> {t("receives a portfolio screenshot when you choose to import one.")}
        </li>
        <li>
          <strong>{t("The AI provider set for Ask Buddy")}</strong>{" "}
          {t(
            "(currently OpenAI) receives the ticker you ask about and that company's public filings and prices, not your holdings, amounts, or anything about you.",
          )}
        </li>
        <li>
          <strong>{t("Market data sources")}</strong>{" "}
          {t(
            "(the SEC and Yahoo Finance) receive only ticker symbols to look up public prices and company data, never anything about you.",
          )}
        </li>
        <li>
          <strong>{t("Our email provider")}</strong> {t("sends account and reminder emails to your address.")}
        </li>
      </ul>
      <p>{t("These providers act on our instructions and may process data outside your country.")}</p>
      <p>
        {t(
          "Book covers in the Library load from Open Library, and \"Buy on Amazon\" takes you to Amazon, which has its own privacy policy; we earn a small commission on qualifying purchases.",
        )}
      </p>

      <h2>{t("Who can see your data")}</h2>
      <p>
        {t(
          "Your financial entries are private to your account; other users can never see them. Two things are visible only if you choose: a share link shows the portfolio or FIRE plan you picked, with your display name, to anyone who has the link, until you cancel it; and a book comment is shown to other readers without your name or email. Our administrators manage shared content such as Education articles and do not browse individual accounts except to fix a problem you report or when the law requires it.",
        )}
      </p>

      <h2>{t("How long we keep it, and your choices")}</h2>
      <p>
        {beforeEmail}
        <ContactLink />
        {afterEmail}
      </p>

      <h2>{t("Security")}</h2>
      <p>
        {t(
          "Data travels encrypted, every account's records are isolated at the database level, and service keys are stored encrypted. No system is perfectly secure; if we learn of a breach that affects you, we will tell you.",
        )}
      </p>

      <h2>{t("Children")}</h2>
      <p>{t("MyPortfolioBuddy is not meant for anyone under 18.")}</p>

      <h2>{t("Changes")}</h2>
      <p>
        {t(
          "If we change this policy in a meaningful way, we will tell you by email or in the app before the change applies.",
        )}
      </p>
    </LegalPage>
  );
}
