import type { Metadata } from "next";

import { ContactLink, LegalPage } from "@/components/legal-page";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Privacy Policy · StockBuddy") };
}

// Plain-language policy written for what the app actually does. Have it reviewed for the
// countries where your early adopters live before a wider launch.
export default async function PrivacyPage() {
  const t = await getT();
  const [beforeEmail, afterEmail = ""] = t(
    "We keep your data while your account is open. You can edit or delete any entry at any time. To delete your whole account, or to get a copy of your data, email {email} from your account's address and we will do it within 30 days. Backups that contain deleted data expire on their own schedule.",
  ).split("{email}");
  return (
    <LegalPage title="Privacy Policy">
      <h2>{t("What we collect")}</h2>
      <ul>
        <li>
          <strong>{t("Account:")}</strong>{" "}
          {t(
            "your email address and a password (stored only as a secure hash by our authentication provider), and when you accepted these terms.",
          )}
        </li>
        <li>
          <strong>{t("What you enter:")}</strong>{" "}
          {t(
            "your date of birth (if you add it), incomes, expenses, savings, bonds, assets and their locations, portfolio holdings and transactions, report reminders, and wishlist items.",
          )}
        </li>
        <li>
          <strong>{t("Technical data:")}</strong>{" "}
          {t("basic logs our servers keep to run and secure the service, such as request times and errors.")}
        </li>
      </ul>

      <h2>{t("How we use it")}</h2>
      <p>
        {t(
          "Only to run StockBuddy for you: show your FIRE plan, portfolio, and analytics, send the reminder emails you ask for, and keep the service secure. We do not sell your data, show ads, or share it for marketing.",
        )}
      </p>

      <h2>{t("Who else processes it")}</h2>
      <ul>
        <li>
          <strong>Supabase</strong> {t("hosts our database, sign-in, and file storage.")}
        </li>
        <li>
          <strong>Anthropic</strong>{" "}
          {t("receives the text of your 300-wishes list when we check a new wish for repeats.")}
        </li>
        <li>
          <strong>OpenAI</strong> {t("receives a portfolio screenshot when you choose to import one.")}
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

      <h2>{t("Who can see your data")}</h2>
      <p>
        {t(
          "Your financial entries are private to your account; other users can never see them. Our administrators manage shared content such as Education articles and do not browse individual accounts except to fix a problem you report or when the law requires it.",
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
      <p>{t("StockBuddy is not meant for anyone under 18.")}</p>

      <h2>{t("Changes")}</h2>
      <p>
        {t(
          "If we change this policy in a meaningful way, we will tell you by email or in the app before the change applies.",
        )}
      </p>
    </LegalPage>
  );
}
