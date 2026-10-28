"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2, LogOut, UserPlus } from "lucide-react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { useT } from "@/lib/i18n/client";
import { BrandMark } from "@/components/brand-mark";
import { InviteDialog } from "@/components/invite-dialog";

export function AppHeader({
  email,
  onSignOut,
  onOpenProfile,
  children,
}: {
  email: string;
  onSignOut: () => void | Promise<void>;
  /** When set, the account card opens the profile. */
  onOpenProfile?: () => void;
  children: ReactNode;
}) {
  const t = useT();
  const nav = useRef<HTMLElement>(null);
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  // Signing out: the dialog stays, busy, until the sign-in page replaces this one.
  const [signingOut, setSigningOut] = useState(false);
  const [inviting, setInviting] = useState(false);
  const shown = useRef<HTMLElement | null>(null);
  // On phones the menu is a sideways-scrolling row: bring the current page into view when
  // it changes, without fighting someone who is scrolling the row themselves.
  useEffect(() => {
    const current = nav.current?.querySelector<HTMLElement>("[aria-current='page']") ?? null;
    if (!current || current === shown.current) return;
    shown.current = current;
    if (nav.current && nav.current.scrollWidth > nav.current.clientWidth) {
      current.scrollIntoView?.({ block: "nearest", inline: "center" });
    }
  });

  const account = (
    <>
      <span className="sidebar-avatar" aria-hidden="true">
        {email.trim()[0]?.toUpperCase() ?? "?"}
      </span>
      <span className="sidebar-email">{email}</span>
    </>
  );
  return (
    <header className="app-header">
      <Link className="brand" href="/">
        <BrandMark />
      </Link>
      <div className="sidebar-language">
        <LanguageSwitcher />
      </div>
      {onOpenProfile ? (
        <button
          type="button"
          className="sidebar-account sidebar-account-button"
          aria-label={`${t("Your profile")} (${email})`}
          title={t("Your profile")}
          onClick={onOpenProfile}
        >
          {account}
        </button>
      ) : (
        <div className="sidebar-account">{account}</div>
      )}
      <nav className="main-tabs" aria-label={t("Main navigation")} ref={nav}>
        {children}
      </nav>
      <div className="sidebar-footer">
        <button type="button" className="sidebar-invite" onClick={() => setInviting(true)}>
          <UserPlus size={16} aria-hidden="true" />
          {t("Invite a friend")}
        </button>
        <button type="button" onClick={() => setConfirmingSignOut(true)}>
          <LogOut size={16} aria-hidden="true" />
          {t("Sign out")}
        </button>
      </div>
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
      {confirmingSignOut && (
        <SignOutDialog
          busy={signingOut}
          onConfirm={async () => {
            setSigningOut(true);
            try {
              await onSignOut();
            } catch {
              setSigningOut(false);
            }
          }}
          onCancel={() => {
            if (!signingOut) setConfirmingSignOut(false);
          }}
        />
      )}
    </header>
  );
}

/** "Are you sure?" before signing out, so a stray click doesn't end the session. */
function SignOutDialog({
  busy,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <section className="add-holding-modal confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="sign-out-title" aria-describedby="sign-out-text">
        <h2 id="sign-out-title">{t("Sign out?")}</h2>
        <p id="sign-out-text" className="muted">
          {t("You'll need your email and password to sign back in. Your data stays saved.")}
        </p>
        <div className="confirm-actions">
          <button type="button" className="button" onClick={onCancel} disabled={busy} autoFocus>
            {t("Stay signed in")}
          </button>
          <button type="button" className="button primary" onClick={onConfirm} disabled={busy} aria-busy={busy}>
            {busy && <Loader2 size={15} className="spinning" aria-hidden="true" />}
            {busy ? t("Signing out…") : t("Sign out")}
          </button>
        </div>
      </section>
    </div>
  );
}
