import Link from "next/link";

import { NewPasswordForm } from "@/components/new-password-form";

export default function ResetPasswordPage() {
  return (
    <main className="login-shell reset-shell">
      <section className="login-panel">
        <div>
          <Link className="brand" href="/">
            STOCKBUDDY
          </Link>
          <h2>Choose a new password</h2>
          <p className="muted">Use at least 8 characters. You stay signed in afterwards.</p>
        </div>
        <NewPasswordForm />
      </section>
    </main>
  );
}
