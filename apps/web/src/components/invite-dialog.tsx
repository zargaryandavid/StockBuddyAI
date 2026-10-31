"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Loader2, Mail, Send } from "lucide-react";

import { ShareButtons } from "@/components/share-buttons";
import { api } from "@/lib/api";
import { copyText } from "@/lib/copy";
import { useT } from "@/lib/i18n/client";

/** The sign-up page, opened on "Create account". */
export function inviteUrl() {
  return `${window.location.origin}/login?join=1`;
}

/** Invite a friend: send them an email, or copy and share the sign-up link. */
export function InviteDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [link] = useState(inviteUrl);
  const emailField = useRef<HTMLInputElement>(null);
  const message = t("I use MyPortfolioBuddy to see my portfolio and my path to financial freedom. It's free. Join me:");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function send() {
    const address = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) {
      setError("Enter a valid email address");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api("/api/invites", { method: "POST", body: JSON.stringify({ name: name.trim(), email: address }) });
      setSentTo(address);
      setName("");
      setEmail("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The invitation couldn't be sent. Try again later.");
    } finally {
      setSending(false);
    }
  }

  async function copy() {
    if (!(await copyText(link))) {
      setError("Copy didn't work here. Select the link and copy it by hand.");
      return;
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="add-holding-modal invite-dialog" role="dialog" aria-modal="true" aria-labelledby="invite-title">
        <div className="modal-heading">
          <h2 id="invite-title">{t("Invite a friend")}</h2>
          <button type="button" aria-label={t("Close")} onClick={onClose}>
            ×
          </button>
        </div>
        <p className="muted">
          {t("Know someone who'd like to see their whole financial picture? Invite them. It's free, and they never see your data.")}
        </p>
        <form
          className="modal-fields"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label>
            {t("Their name")}
            <input value={name} maxLength={60} autoComplete="off" placeholder={t("Optional")} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            {t("Their email")}
            <input
              type="email"
              value={email}
              maxLength={254}
              autoComplete="off"
              placeholder="friend@example.com"
              ref={emailField}
              onChange={(event) => {
                setEmail(event.target.value);
                setSentTo(null);
              }}
              autoFocus
            />
          </label>
          {sentTo && (
            <p className="invite-sent" role="status">
              <Check size={16} aria-hidden="true" /> {t("Invitation sent to {email}. Invite someone else?", { email: sentTo })}
            </p>
          )}
          <button type="submit" className="button primary" disabled={sending} aria-busy={sending}>
            {sending ? <Loader2 size={15} className="spinning" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
            {sending ? t("Sending…") : t("Send invitation")}
          </button>
        </form>

        <div className="invite-or">
          <span>{t("or share the link")}</span>
        </div>
        <div className="share-url">
          <input readOnly value={link} aria-label={t("Invitation link")} onFocus={(event) => event.currentTarget.select()} />
          <button type="button" className="share-copy invite-copy" onClick={() => void copy()}>
            {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
            {copied ? t("Copied") : t("Copy")}
          </button>
        </div>
        <ShareButtons link={link} message={message} subject="MyPortfolioBuddy" email={false}>
          {/* A mail-app draft can only be plain text, so Email sends our designed invitation. */}
          <button
            type="button"
            className="invite-place"
            onClick={() => {
              emailField.current?.scrollIntoView?.({ block: "center" });
              emailField.current?.focus();
            }}
          >
            <Mail size={14} aria-hidden="true" /> {t("Email")}
          </button>
        </ShareButtons>
        {error && (
          <p className="alert" role="alert">
            {t(error)}
          </p>
        )}
      </section>
    </div>
  );
}
