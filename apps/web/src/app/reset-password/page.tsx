import Link from "next/link";

import { LanguageSwitcher } from "@/components/language-switcher";

import { NewPasswordForm } from "@/components/new-password-form";
import { getT } from "@/lib/i18n/server";
import { BrandMark } from "@/components/brand-mark";

export default async function ResetPasswordPage() {
  const t = await getT();
  return (
    <main className="login-shell reset-shell">
      <LanguageSwitcher className="on-light page-language" />
      <section className="login-panel">
        <div>
          <Link className="brand" href="/">
            <BrandMark />
          </Link>
          <h2>{t("Choose a new password")}</h2>
          <p className="muted">{t("Use at least 8 characters. You stay signed in afterwards.")}</p>
        </div>
        <NewPasswordForm />
      </section>
    </main>
  );
}
