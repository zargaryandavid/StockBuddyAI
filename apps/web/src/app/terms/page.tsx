import type { Metadata } from "next";
import Link from "next/link";

import { ContactLink, LegalPage } from "@/components/legal-page";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Terms · MyPortfolioBuddy") };
}

// Plain-language terms for the early-access period. Have them reviewed before a wider
// launch, and fill in the governing law once the operating company is set up.
export default async function TermsPage() {
  const t = await getT();
  const [beforePrivacy, afterPrivacy = ""] = t(
    "You can stop using MyPortfolioBuddy at any time and ask us to delete your account (see the {privacy}). We may end the early-access program, and we will give you notice and a chance to get a copy of your data first.",
  ).split("{privacy}");
  const [beforeEmail, afterEmail = ""] = t(
    "We will tell you about meaningful changes to these terms before they apply. Questions: {email}.",
  ).split("{email}");
  return (
    <LegalPage title="Terms of Use">
      <h2>{t("Early access")}</h2>
      <p>
        {t(
          "MyPortfolioBuddy is in early access. Features may change, break, or be removed, and the service may be unavailable at times. Your feedback helps us fix that.",
        )}
      </p>

      <h2>{t("Not financial advice")}</h2>
      <p>
        {t(
          "MyPortfolioBuddy gives estimates, education, and organizing tools. It is not a financial, investment, tax, or legal adviser, and nothing in it is a recommendation to buy, sell, or hold anything. Projections, FIRE dates, AI reviews, and market data can be wrong or out of date. Make your own decisions, and talk to a licensed professional before acting on anything important.",
        )}
      </p>

      <h2>{t("Your account")}</h2>
      <ul>
        <li>{t("You must be at least 18 and give a real email address you control.")}</li>
        <li>{t("Keep your password private; you are responsible for activity in your account.")}</li>
        <li>{t("You own the data you enter. You let us store and process it only to run the service.")}</li>
      </ul>

      <h2>{t("Fair use")}</h2>
      <ul>
        <li>{t("Don't try to access other people's data, break or overload the service, or scrape it.")}</li>
        <li>
          {t(
            "AI features have daily limits per account so the service stays available and affordable for everyone.",
          )}
        </li>
        <li>{t("We may suspend accounts that break these terms or put other users at risk.")}</li>
      </ul>

      <h2>{t("Third-party data")}</h2>
      <p>
        {t(
          "Prices and company data come from public sources such as the SEC and Yahoo Finance and are provided as they are, without guarantee of accuracy or timeliness.",
        )}
      </p>

      <h2>{t("Liability")}</h2>
      <p>
        {t(
          "The service is provided “as is” during early access. To the extent the law allows, we are not liable for investment losses or for indirect damages from using it.",
        )}
      </p>

      <h2>{t("Ending your use")}</h2>
      <p>
        {beforePrivacy}
        <Link href="/privacy">{t("Privacy Policy")}</Link>
        {afterPrivacy}
      </p>

      <h2>{t("Changes")}</h2>
      <p>
        {beforeEmail}
        <ContactLink />
        {afterEmail}
      </p>
    </LegalPage>
  );
}
