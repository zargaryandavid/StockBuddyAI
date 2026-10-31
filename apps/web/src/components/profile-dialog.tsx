"use client";

import { useEffect, useState } from "react";
import { Briefcase, Check, Copy, ExternalLink, Flame, Link2, Sun, Trash2 } from "lucide-react";

import { ShareButtons } from "@/components/share-buttons";
import { api } from "@/lib/api";
import { ageOn } from "@/lib/age";
import { copyText } from "@/lib/copy";
import { useT } from "@/lib/i18n/client";

export type ProfileValues = { date_of_birth: string | null; display_name: string | null };

type ShareLink = { token: string; kind: "today" | "fire" | "portfolio"; portfolio_id: string | null };

export function shareUrl(token: string) {
  return `${window.location.origin}/share/${token}`;
}

/** Name, date of birth (age is always calculated), and read-only share links. */
export function ProfileDialog({
  dateOfBirth,
  displayName = null,
  today,
  portfolios = [],
  currentPortfolioId = null,
  canDeleteAccount = true,
  onAccountDeleted,
  onSave,
  onClose,
}: {
  dateOfBirth: string | null;
  displayName?: string | null;
  today: string;
  portfolios?: { id: string; name: string }[];
  /** The portfolio whose value a FIRE link counts as current assets. */
  currentPortfolioId?: string | null;
  /** The admin account can't delete itself here. */
  canDeleteAccount?: boolean;
  /** Called after the account is gone; the caller signs out. */
  onAccountDeleted?: () => void;
  onSave: (values: ProfileValues) => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(displayName ?? "");
  const [value, setValue] = useState(dateOfBirth ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const age = ageOn(value || null, today);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save() {
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value > today || value < "1900-01-01")) {
      setError("Enter a date of birth between 1900 and today.");
      return;
    }
    if (name.trim().length > 80) {
      setError("Use a name of 80 characters or fewer.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({ date_of_birth: value || null, display_name: name.trim() || null });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your profile");
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="add-holding-modal profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <div className="modal-heading">
          <h2 id="profile-title">{t("Your profile")}</h2>
          <button type="button" aria-label={t("Close")} onClick={onClose}>
            ×
          </button>
        </div>
        <form
          className="modal-fields"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label>
            {t("Name")}
            <input
              value={name}
              maxLength={80}
              autoComplete="name"
              placeholder={t("Shown on pages you share")}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            {t("Date of birth")}
            <input
              type="date"
              max={today}
              min="1900-01-01"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          <p className="muted">
            {age != null
              ? t("You are {age}. Your age is calculated from this date and updates on its own.", { age })
              : t("Used to show your current age and the age you reach FIRE. Leave it blank to hide ages.")}
          </p>
          {error && (
            <p className="alert" role="alert">
              {t(error)}
            </p>
          )}
          <button type="submit" className="button primary" disabled={saving}>
            {saving ? t("Saving…") : t("Save profile")}
          </button>
        </form>
        <ShareLinks portfolios={portfolios} currentPortfolioId={currentPortfolioId} />
        {onAccountDeleted && <DeleteAccount allowed={canDeleteAccount} onDeleted={onAccountDeleted} />}
      </section>
    </div>
  );
}

/** Turn read-only links on or off, copy them and send them on. Anyone with a link can view the page. */
function ShareLinks({
  portfolios,
  currentPortfolioId,
}: {
  portfolios: { id: string; name: string }[];
  currentPortfolioId: string | null;
}) {
  const t = useT();
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<ShareLink[]>("/api/share-links")
      .then((rows) => {
        if (active) setLinks(Array.isArray(rows) ? rows : []);
      })
      .catch((cause: unknown) => {
        if (active) {
          setLinks([]);
          setError(cause instanceof Error ? cause.message : "Could not load your links");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const rows = [
    {
      key: "today",
      label: t("Today"),
      what: t("Your net worth, FIRE progress, cash, the heat map of your holdings and today's stock moves."),
      icon: Sun,
      kind: "today" as const,
      portfolioId: null,
    },
    {
      key: "fire",
      label: t("FIRE plan"),
      what: t("Your income, expenses, savings and when you could reach financial freedom."),
      icon: Flame,
      kind: "fire" as const,
      portfolioId: currentPortfolioId,
    },
    ...portfolios.map((portfolio) => ({
      key: `portfolio-${portfolio.id}`,
      label: t("Portfolio: {name}", { name: portfolio.name }),
      what: t("The holdings of this portfolio, their value and performance."),
      icon: Briefcase,
      kind: "portfolio" as const,
      portfolioId: portfolio.id,
    })),
  ];

  function linkFor(row: (typeof rows)[number]) {
    return links?.find((link) => link.kind === row.kind && (row.kind !== "portfolio" || link.portfolio_id === row.portfolioId));
  }

  async function turnOn(row: (typeof rows)[number]) {
    setBusy(row.key);
    setError(null);
    try {
      const created = await api<ShareLink>("/api/share-links", {
        method: "POST",
        body: JSON.stringify({ kind: row.kind, portfolio_id: row.portfolioId }),
      });
      setLinks((current) => [...(current ?? []).filter((link) => link.token !== created.token), created]);
      await copy(row.key, created.token);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the link");
    } finally {
      setBusy(null);
    }
  }

  async function turnOff(row: (typeof rows)[number], link: ShareLink) {
    setBusy(row.key);
    setError(null);
    try {
      await api(`/api/share-links/${link.token}`, { method: "DELETE" });
      setLinks((current) => (current ?? []).filter((item) => item.token !== link.token));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not turn the link off");
    } finally {
      setBusy(null);
    }
  }

  async function copy(key: string, token: string) {
    if (!(await copyText(shareUrl(token)))) {
      setError("Copy didn't work here. Select the link and copy it by hand.");
      return;
    }
    setCopied(key);
    window.setTimeout(() => setCopied((current) => (current === key ? null : current)), 2500);
  }

  return (
    <section className="share-links" aria-labelledby="share-links-title">
      <h3 id="share-links-title">
        <Link2 size={16} aria-hidden="true" /> {t("Share with family or your advisor")}
      </h3>
      <p className="muted">
        {t(
          "Turn a link on and send it to anyone you trust. They see a read-only page without signing in; your email and date of birth are never shown. Turn it off any time and the link stops working.",
        )}
      </p>
      {links === null ? (
        <p className="muted">{t("Loading links…")}</p>
      ) : (
        <ul>
          {rows.map((row) => {
            const link = linkFor(row);
            const Icon = row.icon;
            const disabled = busy === row.key || (row.kind === "portfolio" && !row.portfolioId);
            return (
              <li key={row.key} className={link ? "on" : ""}>
                <div className="share-card-head">
                  <span className="share-card-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <div className="share-card-text">
                    <strong>{row.label}</strong>
                    <small className="muted">{row.what}</small>
                  </div>
                  <label className="share-switch">
                    <input
                      type="checkbox"
                      role="switch"
                      checked={Boolean(link)}
                      disabled={disabled}
                      aria-label={t("Share {label}", { label: row.label })}
                      onChange={() => void (link ? turnOff(row, link) : turnOn(row))}
                    />
                    <span aria-hidden="true" />
                    <em>{busy === row.key ? "…" : link ? t("On") : t("Off")}</em>
                  </label>
                </div>
                {link && (
                  <div className="share-card-body">
                    <p className="share-live">
                      <span className="share-dot" aria-hidden="true" />
                      {copied === row.key
                        ? t("Link copied. Paste it in a message, or use a button below.")
                        : t("Live: anyone with this link can view it.")}
                    </p>
                    <div className="share-url">
                      <input readOnly value={shareUrl(link.token)} aria-label={t("{label} link", { label: row.label })} onFocus={(event) => event.currentTarget.select()} />
                      <button type="button" className="share-copy invite-copy" onClick={() => void copy(row.key, link.token)}>
                        {copied === row.key ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                        {copied === row.key ? t("Copied") : t("Copy")}
                      </button>
                    </div>
                    <ShareButtons
                      link={shareUrl(link.token)}
                      message={t("Here's my {label} on MyPortfolioBuddy:", { label: row.label })}
                      subject={t("My {label} on MyPortfolioBuddy", { label: row.label })}
                    >
                      <a className="invite-place" href={shareUrl(link.token)} target="_blank" rel="noopener noreferrer">
                        <ExternalLink size={14} aria-hidden="true" /> {t("Open")}
                      </a>
                    </ShareButtons>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && (
        <p className="alert" role="alert">
          {t(error)}
        </p>
      )}
    </section>
  );
}

/** Deletes the account and all its data, after the person types "delete" to confirm. */
function DeleteAccount({ allowed, onDeleted }: { allowed: boolean; onDeleted: () => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = typed.trim().toLowerCase() === "delete";

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/account", { method: "DELETE", body: JSON.stringify({ confirm: typed }) });
      onDeleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not delete the account");
      setBusy(false);
    }
  }

  return (
    <section className="delete-account" aria-labelledby="delete-account-title">
      <h3 id="delete-account-title">
        <Trash2 size={16} aria-hidden="true" /> {t("Delete my account and data")}
      </h3>
      {!allowed ? (
        <p className="muted">{t("The admin account can't be deleted here.")}</p>
      ) : !open ? (
        <>
          <p className="muted">
            {t(
              "Permanently removes your account and everything in it: portfolios, FIRE plan, assets, wishlist, reviews, and share links.",
            )}
          </p>
          <button type="button" className="button danger-outline" onClick={() => setOpen(true)}>
            {t("Delete my account…")}
          </button>
        </>
      ) : (
        <div className="delete-account-confirm">
          <p>
            <strong>{t("This can't be undone.")}</strong>{" "}
            {t("All your data is deleted right away and shared links stop working.")}
          </p>
          <label>
            <span>
              {/* The word to type stays "delete" in every language; only the sentence around it changes. */}
              {t("Type {word} to confirm")
                .split(/(\{word\})/)
                .map((part, index) => (part === "{word}" ? <strong key={index}>delete</strong> : part))}
            </span>
            <input
              value={typed}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              onChange={(event) => setTyped(event.target.value)}
              aria-describedby="delete-account-title"
            />
          </label>
          {error && (
            <p className="form-message error" role="alert">
              {t(error)}
            </p>
          )}
          <div className="confirm-actions">
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setTyped("");
                setError(null);
              }}
            >
              {t("Keep my account")}
            </button>
            <button type="button" className="button danger" disabled={!confirmed || busy} onClick={() => void remove()}>
              {busy ? t("Deleting…") : t("Delete my account")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
