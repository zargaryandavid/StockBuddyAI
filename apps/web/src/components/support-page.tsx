"use client";

import { Fragment } from "react";
import { Coffee, EyeOff, Heart, Megaphone, ShieldCheck } from "lucide-react";

import { useT } from "@/lib/i18n/client";

const PROMISES = [
  { icon: ShieldCheck, title: "No sponsors", text: "Nobody pays us to show you anything." },
  { icon: Megaphone, title: "No ads", text: "Your screen is for your money, not for banners." },
  { icon: EyeOff, title: "Your data stays yours", text: "We never sell or share your data." },
];

/** Support us: why MyPortfolioBuddy asks for help, and the $9 monthly subscription (not open yet). */
export function SupportPage() {
  const t = useT();
  return (
    <section className="support-page" aria-labelledby="support-title">
      <div className="support-hero">
        <Heart size={28} aria-hidden="true" className="support-heart" />
        <h1 id="support-title">{t("Support MyPortfolioBuddy")}</h1>
        <p>
          {t(
            "We build MyPortfolioBuddy for you, and only for you. There are no sponsors, no ads, and we never sell your data. To keep it that way, we need your help.",
          )}
        </p>
      </div>

      <ul className="support-promises">
        {PROMISES.map(({ icon: Icon, title, text }) => (
          <li key={title}>
            <Icon size={20} aria-hidden="true" />
            <strong>{t(title)}</strong>
            <span className="muted">{t(text)}</span>
          </li>
        ))}
      </ul>

      <article className="panel support-plan">
        <div className="support-price">
          <Coffee size={26} aria-hidden="true" />
          <p>
            {/* The price stays in bold wherever the language puts it. */}
            {t("{price} a month", { price: "\u0000" })
              .split("\u0000")
              .map((part, at) => (
                <Fragment key={at}>
                  {at > 0 && <strong>$9</strong>}
                  {part}
                </Fragment>
              ))}
          </p>
          <span className="muted">{t("About the price of a coffee.")}</span>
        </div>
        <div className="support-why">
          <p>
            {t(
              "AI reviews and market data cost us money every month. Subscribing keeps Buddy running and growing for everyone.",
            )}
          </p>
          <p>
            {t(
              "If Buddy helps you spot just one thing worth a second look in your portfolio, it has paid for itself.",
            )}
          </p>
          <button type="button" className="button accent" disabled>
            <Heart size={15} aria-hidden="true" />
            {t("Subscribe · $9/month")}
          </button>
          <p className="muted support-soon">{t("Subscriptions open soon. Thank you for being here early.")}</p>
        </div>
      </article>
    </section>
  );
}
