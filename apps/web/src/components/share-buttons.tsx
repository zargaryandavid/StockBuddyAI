"use client";

import type { ReactNode } from "react";
import { Mail, Share2 } from "lucide-react";

import { useT } from "@/lib/i18n/client";

/** One-tap sharing of a link: the phone's share sheet, chat apps, social sites and email. */
export function ShareButtons({
  link,
  message,
  subject,
  email = true,
  children,
}: {
  link: string;
  /** Text sent before the link. */
  message: string;
  /** Email subject. */
  subject: string;
  /** Offer a "send by email" button that opens the person's own mail app. */
  email?: boolean;
  /** More buttons after these. */
  children?: ReactNode;
}) {
  const t = useT();
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const text = encodeURIComponent(`${message} ${link}`);
  const url = encodeURIComponent(link);
  const places = [
    { name: "WhatsApp", href: `https://wa.me/?text=${text}` },
    { name: "Telegram", href: `https://t.me/share/url?url=${url}&text=${encodeURIComponent(message)}` },
    { name: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${url}` },
    { name: "X", href: `https://x.com/intent/post?text=${text}` },
    { name: "LinkedIn", href: `https://www.linkedin.com/sharing/share-offsite/?url=${url}` },
  ];
  return (
    <div className="invite-places">
      {canShare && (
        <button
          type="button"
          className="invite-place"
          onClick={() => void navigator.share({ title: subject, text: message, url: link }).catch(() => undefined)}
        >
          <Share2 size={14} aria-hidden="true" /> {t("Share…")}
        </button>
      )}
      {places.map((place) => (
        <a key={place.name} className="invite-place" href={place.href} target="_blank" rel="noopener noreferrer">
          {place.name}
        </a>
      ))}
      {email && (
        <a className="invite-place" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${text}`}>
          <Mail size={14} aria-hidden="true" /> {t("Email")}
        </a>
      )}
      {children}
    </div>
  );
}
