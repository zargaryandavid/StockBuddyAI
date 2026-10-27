"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import type { Vars } from "@/lib/i18n/core";
import { useT } from "@/lib/i18n/client";
import { createClient } from "@/lib/supabase/client";

/** Bumped when the Terms or Privacy Policy change, and saved with each sign-up. */
export const TERMS_VERSION = "2026-10-26";

/** A message kept in English with its values, so it follows the chosen language. */
type Message = { text: string; vars?: Vars };

export function AuthForm({ notice }: { notice?: string } = {}) {
  const t = useT();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [busy, setBusy] = useState(false);
  // Signed in and loading the next page: the button stays busy until that page shows.
  const [opening, setOpening] = useState(false);
  const [message, setMessageState] = useState<Message>({ text: notice ?? "" });
  const setMessage = (text: string, vars?: Vars) => setMessageState({ text, vars });
  // Problems (wrong password, missing consent…) show in red; confirmations stay grey.
  const [isError, setIsError] = useState(false);
  const fail = (text: string, vars?: Vars) => {
    setIsError(true);
    setMessage(text, vars);
  };
  const inform = (text: string, vars?: Vars) => {
    setIsError(false);
    setMessage(text, vars);
  };
  // Set when the account still needs its email confirmed, so a new link can be sent.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function resend() {
    if (!pendingEmail) return;
    setBusy(true);
    const { error } = await createClient().auth.resend({
      type: "signup",
      email: pendingEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    setBusy(false);
    setResent(!error);
    if (error) fail(error.message);
    else inform("A new confirmation link was sent to {email}.", { email: pendingEmail });
  }
  const [showPassword, setShowPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    inform("");
    setPendingEmail(null);
    setResent(false);
    const data = new FormData(event.currentTarget);
    const credentials = {
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
    };
    if (mode === "signup" && !data.get("consent")) {
      setBusy(false);
      fail("Please agree to the Terms and Privacy Policy to create an account.");
      return;
    }
    const supabase = createClient();
    if (mode === "reset") {
      const { error } = await supabase.auth.resetPasswordForEmail(credentials.email, {
        redirectTo: `${window.location.origin}/auth/reset`,
      });
      setBusy(false);
      // The same answer whether or not the account exists, so emails can't be probed.
      if (error) fail(error.status !== 429 ? error.message : "Too many requests. Wait a minute and try again.");
      else inform("If an account exists for {email}, we sent a link to reset the password.", { email: credentials.email });
      return;
    }
    const result =
      mode === "signin"
        ? await supabase.auth.signInWithPassword(credentials)
        : await supabase.auth.signUp({
            ...credentials,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/confirm`,
              data: { terms_version: TERMS_VERSION, terms_accepted_at: new Date().toISOString() },
            },
          });
    if (result.error || (mode === "signup" && !result.data.session)) setBusy(false);
    if (result.error) {
      if (result.error.code === "email_not_confirmed") {
        setPendingEmail(credentials.email);
        inform("Confirm your email first: open the link we sent to {email}.", { email: credentials.email });
        return;
      }
      fail(result.error.message);
      return;
    }
    if (mode === "signup" && !result.data.session) {
      setPendingEmail(credentials.email);
      inform("Almost done. We sent a confirmation link to {email}; open it to finish creating your account.", {
        email: credentials.email,
      });
      return;
    }
    setOpening(true);
    const me = await api<{ role: "admin" | "user" }>("/api/me").catch(() => null);
    router.push(me?.role === "admin" ? "/admin" : "/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="auth-form">
      <label>
        {t("Email")}
        <input name="email" type="email" autoComplete="email" required />
      </label>
      {mode !== "reset" && (
      <label>
        {t("Password")}
        <span className="password-field">
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            minLength={8}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            required
          />
          <button
            className="password-toggle"
            type="button"
            aria-label={showPassword ? t("Hide password") : t("Show password")}
            aria-pressed={showPassword}
            title={showPassword ? t("Hide password") : t("Show password")}
            onClick={() => setShowPassword((visible) => !visible)}
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </span>
      </label>
      )}
      {mode === "signin" && (
        <button
          className="text-button auth-forgot"
          type="button"
          onClick={() => {
            setMode("reset");
            setMessage("");
            setPendingEmail(null);
          }}
        >
          {t("Forgot password?")}
        </button>
      )}
      {mode === "signup" && (
        <label className="auth-consent">
          <input name="consent" type="checkbox" required />
          <span>
            {/* One sentence with the two links placed where each language puts them. */}
            {t(
              "I agree to the {terms} and {privacy}, and I understand StockBuddy gives estimates and education, not financial advice.",
            )
              .split(/(\{terms\}|\{privacy\})/)
              .map((part, index) =>
                part === "{terms}" ? (
                  <Link key={index} href="/terms" target="_blank">
                    {t("Terms")}
                  </Link>
                ) : part === "{privacy}" ? (
                  <Link key={index} href="/privacy" target="_blank">
                    {t("Privacy Policy")}
                  </Link>
                ) : (
                  part
                ),
              )}
          </span>
        </label>
      )}
      {message.text && (
        <p className={`form-message${isError ? " error" : ""}`} role={isError ? "alert" : "status"}>
          {t(message.text, message.vars)}
        </p>
      )}
      {pendingEmail && !resent && (
        <button className="text-button" type="button" disabled={busy} onClick={() => void resend()}>
          {t("Didn't get it? Resend the confirmation email")}
        </button>
      )}
      <button className="button primary" disabled={busy} type="submit">
        {opening ? t("Opening your book…") : busy ? (mode === "signin" ? t("Signing in…") : t("Working…")) : mode === "signin" ? t("Sign in") : mode === "signup" ? t("Create account") : t("Send reset link")}
      </button>
      <button
        className="text-button"
        type="button"
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setMessage("");
          setPendingEmail(null);
        }}
      >
        {mode === "signin"
          ? t("Need an account? Sign up")
          : mode === "signup"
            ? t("Already registered? Sign in")
            : t("Back to sign in")}
      </button>
    </form>
  );
}

export function EyeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.75" />
    </svg>
  );
}

export function EyeOffIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      <path d="m3 3 18 18M10.7 6.1A10.8 10.8 0 0 1 12 6c6 0 9.5 6 9.5 6a16.7 16.7 0 0 1-2.1 2.8M6.3 6.3C3.9 8 2.5 12 2.5 12s3.5 6 9.5 6c1.6 0 3-.4 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
