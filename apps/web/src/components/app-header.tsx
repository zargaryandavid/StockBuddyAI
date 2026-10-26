"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";

export function AppHeader({
  email,
  onSignOut,
  onOpenProfile,
  children,
}: {
  email: string;
  onSignOut: () => void;
  /** When set, the account card opens the profile. */
  onOpenProfile?: () => void;
  children: ReactNode;
}) {
  const nav = useRef<HTMLElement>(null);
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
        STOCKBUDDY
        <span>AI</span>
      </Link>
      {onOpenProfile ? (
        <button
          type="button"
          className="sidebar-account sidebar-account-button"
          aria-label={`Your profile (${email})`}
          title="Your profile"
          onClick={onOpenProfile}
        >
          {account}
        </button>
      ) : (
        <div className="sidebar-account">{account}</div>
      )}
      <nav className="main-tabs" aria-label="Main navigation" ref={nav}>
        {children}
      </nav>
      <div className="sidebar-footer">
        <button type="button" onClick={onSignOut}>
          <LogOut size={16} aria-hidden="true" />
          Sign out
        </button>
      </div>
    </header>
  );
}
