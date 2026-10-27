import type { ReactNode } from "react";
import { BookOpen, Briefcase, Home, ReceiptText, ScrollText, Sparkles, type LucideIcon } from "lucide-react";

const ART: Record<string, { icon: LucideIcon; tone: string }> = {
  portfolio: { icon: Briefcase, tone: "green" },
  transactions: { icon: ReceiptText, tone: "navy" },
  wish: { icon: Sparkles, tone: "gold" },
  asset: { icon: Home, tone: "green" },
  bond: { icon: ScrollText, tone: "gold" },
  books: { icon: BookOpen, tone: "navy" },
};

/** A friendly empty page: a small drawing, one line about what goes here, and what to do. */
export function EmptyState({
  art,
  title,
  text,
  action,
  compact = false,
}: {
  art: keyof typeof ART;
  title: string;
  text?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  const { icon: Icon, tone } = ART[art];
  return (
    <div className={`empty-state tone-${tone}${compact ? " compact" : ""}`}>
      <svg className="empty-state-art" viewBox="0 0 120 96" aria-hidden="true">
        <ellipse cx="60" cy="86" rx="38" ry="5" className="empty-shadow" />
        <circle cx="60" cy="44" r="34" className="empty-disc" />
        <circle cx="22" cy="20" r="4" className="empty-dot" />
        <circle cx="101" cy="30" r="3" className="empty-dot" />
        <circle cx="96" cy="72" r="2.5" className="empty-dot" />
        <path d="M17 62 l3 -6 l3 6 l-3 6 z" className="empty-spark" />
        <path d="M98 10 l2.5 -5 l2.5 5 l-2.5 5 z" className="empty-spark" />
      </svg>
      <Icon className="empty-state-icon" size={compact ? 26 : 32} aria-hidden="true" />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
