"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

/** Bumped when the Terms or Privacy Policy change, and saved with each sign-up. */
export const TERMS_VERSION = "2026-10-26";

export function AuthForm({ notice }: { notice?: string } = {}) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(notice ?? "");
  // Problems (wrong password, missing consent…) show in red; confirmations stay grey.
  const [isError, setIsError] = useState(false);
  const fail = (text: string) => {
    setIsError(true);
    setMessage(text);
  };
  const inform = (text: string) => {
    setIsError(false);
    setMessage(text);
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
    else inform(`A new confirmation link was sent to ${pendingEmail}.`);
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
      else inform(`If an account exists for ${credentials.email}, we sent a link to reset the password.`);
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
    setBusy(false);
    if (result.error) {
      if (result.error.code === "email_not_confirmed") {
        setPendingEmail(credentials.email);
        inform(`Confirm your email first: open the link we sent to ${credentials.email}.`);
        return;
      }
      fail(result.error.message);
      return;
    }
    if (mode === "signup" && !result.data.session) {
      setPendingEmail(credentials.email);
      inform(`Almost done. We sent a confirmation link to ${credentials.email}; open it to finish creating your account.`);
      return;
    }
    const me = await api<{ role: "admin" | "user" }>("/api/me").catch(() => null);
    router.push(me?.role === "admin" ? "/admin" : "/");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="auth-form">
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      {mode !== "reset" && (
      <label>
        Password
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
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            title={showPassword ? "Hide password" : "Show password"}
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
          Forgot password?
        </button>
      )}
      {mode === "signup" && (
        <label className="auth-consent">
          <input name="consent" type="checkbox" required />
          <span>
            I agree to the <Link href="/terms" target="_blank">Terms</Link> and{" "}
            <Link href="/privacy" target="_blank">Privacy Policy</Link>, and I understand StockBuddy
            gives estimates and education, not financial advice.
          </span>
        </label>
      )}
      {message && (
        <p className={`form-message${isError ? " error" : ""}`} role={isError ? "alert" : "status"}>
          {message}
        </p>
      )}
      {pendingEmail && !resent && (
        <button className="text-button" type="button" disabled={busy} onClick={() => void resend()}>
          Didn&apos;t get it? Resend the confirmation email
        </button>
      )}
      <button className="button primary" disabled={busy} type="submit">
        {busy ? "Working…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
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
        {mode === "signin" ? "Need an account? Sign up" : mode === "signup" ? "Already registered? Sign in" : "Back to sign in"}
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
