"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ExternalLink, Send, Users } from "lucide-react";

import { useT } from "@/lib/i18n/client";

export const COMMUNITY_URL = "https://t.me/+0PupBvTmIJcwOWEy";

/** Top-right invitation to the Telegram group, with a QR code to scan on a phone. */
export function CommunityLink() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  // Escape or a click outside closes the QR card.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <div className="community-bar" ref={box}>
      <button
        type="button"
        className="community-button"
        aria-expanded={open}
        aria-controls="community-card"
        onClick={() => setOpen((current) => !current)}
      >
        <Users size={15} aria-hidden="true" />
        {t("Join like-minded people")}
      </button>
      {open && (
        <div id="community-card" className="community-card" role="dialog" aria-label={t("Our Telegram group")}>
          <strong>{t("Our Telegram group")}</strong>
          <p className="muted">{t("Share ideas and questions with other investors building their wealth.")}</p>
          <Image
            src="/telegram-group-qr.png"
            alt={t("QR code for the MyPortfolioBuddy Telegram group")}
            width={180}
            height={180}
            // Served as is: Vercel's image resizer isn't reachable on this setup (404), and the
            // file is only 7 KB.
            unoptimized
          />
          <a className="button primary" href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer">
            <Send size={15} aria-hidden="true" />
            {t("Open in Telegram")}
            <ExternalLink size={13} aria-hidden="true" />
          </a>
        </div>
      )}
    </div>
  );
}
