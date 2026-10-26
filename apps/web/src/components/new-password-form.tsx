"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { EyeIcon, EyeOffIcon } from "@/components/auth-form";
import { useT } from "@/lib/i18n/client";
import { createClient } from "@/lib/supabase/client";

/** Sets a new password for the person signed in through a reset link. */
export function NewPasswordForm() {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [show, setShow] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const repeat = String(data.get("repeat") ?? "");
    if (password.length < 8) return setMessage("Use at least 8 characters.");
    if (password !== repeat) return setMessage("The two passwords don't match.");
    setBusy(true);
    setMessage("");
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) return setMessage(error.message);
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="auth-form" noValidate>
      <label>
        {t("New password")}
        <span className="password-field">
          <input name="password" type={show ? "text" : "password"} minLength={8} autoComplete="new-password" required />
          <button
            className="password-toggle"
            type="button"
            aria-label={show ? t("Hide passwords") : t("Show passwords")}
            aria-pressed={show}
            title={show ? t("Hide passwords") : t("Show passwords")}
            onClick={() => setShow((visible) => !visible)}
          >
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </span>
      </label>
      <label>
        {t("Repeat new password")}
        <input name="repeat" type={show ? "text" : "password"} minLength={8} autoComplete="new-password" required />
      </label>
      {message && (
        <p className="form-message error" role="alert">
          {t(message)}
        </p>
      )}
      <button className="button primary" disabled={busy} type="submit">
        {busy ? t("Saving…") : t("Save new password")}
      </button>
    </form>
  );
}
