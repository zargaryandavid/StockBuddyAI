import { Coffee, EyeOff, Heart, Megaphone, ShieldCheck } from "lucide-react";

const PROMISES = [
  { icon: ShieldCheck, title: "No sponsors", text: "Nobody pays us to show you anything." },
  { icon: Megaphone, title: "No ads", text: "Your screen is for your money, not for banners." },
  { icon: EyeOff, title: "Your data stays yours", text: "We never sell or share your data." },
];

/** Support us: why StockBuddy asks for help, and the $9 monthly subscription (not open yet). */
export function SupportPage() {
  return (
    <section className="support-page" aria-labelledby="support-title">
      <div className="support-hero">
        <Heart size={28} aria-hidden="true" className="support-heart" />
        <h1 id="support-title">Support StockBuddy</h1>
        <p>
          We build StockBuddy for you, and only for you. There are no sponsors, no ads, and we
          never sell your data. To keep it that way, we need your help.
        </p>
      </div>

      <ul className="support-promises">
        {PROMISES.map(({ icon: Icon, title, text }) => (
          <li key={title}>
            <Icon size={20} aria-hidden="true" />
            <strong>{title}</strong>
            <span className="muted">{text}</span>
          </li>
        ))}
      </ul>

      <article className="panel support-plan">
        <div className="support-price">
          <Coffee size={26} aria-hidden="true" />
          <p>
            <strong>$9</strong> a month
          </p>
          <span className="muted">About the price of a coffee.</span>
        </div>
        <div className="support-why">
          <p>
            AI reviews and market data cost us money every month. Subscribing keeps Buddy running
            and growing for everyone.
          </p>
          <p>
            If Buddy helps you spot just one thing worth a second look in your portfolio, it has
            paid for itself.
          </p>
          <button type="button" className="button accent" disabled>
            <Heart size={15} aria-hidden="true" />
            Subscribe · $9/month
          </button>
          <p className="muted support-soon">Subscriptions open soon. Thank you for being here early.</p>
        </div>
      </article>
    </section>
  );
}
