"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChartLine,
  ExternalLink,
  Flame,
  Landmark,
  Layers,
  PiggyBank,
  PlayCircle,
  Shield,
  TrendingUp,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import { api } from "@/lib/api";
import { useT } from "@/lib/i18n/client";
import type { Translate } from "@/lib/i18n/core";
import { LESSONS, type EducationArticle, type Lesson } from "@/lib/education";

import { Library } from "./library";

const LINK_ICONS = { article: BookOpen, video: PlayCircle, tool: Wrench };

/** Picture-less tiles get an icon and a color of their own. */
const LESSON_LOOKS: Record<string, { icon: LucideIcon; color: string }> = {
  "fire-basics": { icon: Flame, color: "#1e2a44" },
  "withdrawal-rate": { icon: PiggyBank, color: "#2f5d50" },
  compounding: { icon: TrendingUp, color: "#3b4f7a" },
  inflation: { icon: ChartLine, color: "#7a4b2a" },
  "index-funds": { icon: Layers, color: "#24536b" },
  diversification: { icon: Shield, color: "#4b3f72" },
  "emergency-fund": { icon: PiggyBank, color: "#6b2f3a" },
  "bonds-savings": { icon: Landmark, color: "#5a5a2a" },
};

/** One tile of the article grid: an admin article or a built-in lesson. */
type Tile =
  | { key: string; kind: "article"; title: string; image: string | null; article: EducationArticle }
  | { key: string; kind: "lesson"; title: string; image: null; lesson: Lesson };

/** Financial articles from Admin and the built-in lessons as a grid of tiles, then the Library. */
export function EducationPage() {
  const t = useT();
  const [articles, setArticles] = useState<EducationArticle[] | null>(null);
  const [reading, setReading] = useState<Tile | null>(null);

  useEffect(() => {
    let active = true;
    api<EducationArticle[]>("/api/education/articles")
      .then((rows) => {
        if (active) setArticles(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (active) setArticles([]);
      });
    return () => {
      active = false;
    };
  }, []);

  const tiles = useMemo<Tile[]>(
    () => [
      ...(articles ?? []).map((article) => ({
        key: `article-${article.id}`,
        kind: "article" as const,
        title: article.title,
        image: article.image_url,
        article,
      })),
      ...LESSONS.map((lesson) => ({
        key: `lesson-${lesson.id}`,
        kind: "lesson" as const,
        title: lesson.title,
        image: null,
        lesson,
      })),
    ],
    [articles],
  );

  return (
    <section className="education-page" aria-labelledby="education-title">
      <header className="education-head">
        <h1 id="education-title">{t("Education")}</h1>
      </header>

      <section className="education-articles" aria-label={t("Articles")}>
        <ul className="education-article-grid">
          {tiles.map((tile) => {
            const look = tile.kind === "lesson" ? LESSON_LOOKS[tile.lesson.id] : null;
            const Icon = look?.icon ?? BookOpen;
            return (
              <li key={tile.key}>
                <button
                  type="button"
                  className="education-tile"
                  style={tile.image ? undefined : { background: look?.color ?? "#1e2a44" }}
                  onClick={() => setReading(tile)}
                >
                  {tile.image ? (
                    // Article pictures come from Supabase Storage at any size.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={tile.image} alt="" loading="lazy" />
                  ) : (
                    <Icon className="education-tile-icon" size={56} aria-hidden="true" />
                  )}
                  <strong>{tileTitle(tile, t)}</strong>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <Library />

      {reading && <Reader tile={reading} onClose={() => setReading(null)} />}
    </section>
  );
}

/** Admin articles keep the admin's own words; built-in lessons are translated. */
function tileTitle(tile: Tile, t: Translate) {
  return tile.kind === "article" ? tile.title : t(tile.title);
}

function Reader({ tile, onClose }: { tile: Tile; onClose: () => void }) {
  const t = useT();
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop breakdown-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <article className="add-holding-modal article-reader" role="dialog" aria-modal="true" aria-labelledby="article-reader-title">
        <div className="modal-heading">
          <h2 id="article-reader-title">{tileTitle(tile, t)}</h2>
          <button type="button" aria-label={t("Close")} onClick={onClose}>
            ×
          </button>
        </div>
        {tile.kind === "article" && (
          <>
            {tile.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tile.image} alt="" className="article-reader-image" />
            )}
            <div className="article-reader-body">
              {tile.article.body.split(/\n{2,}/).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </>
        )}
        {tile.kind === "lesson" && (
          <div className="article-reader-body">
            <p className="article-reader-lead">{t(tile.lesson.summary)}</p>
            <ul className="education-points">
              {tile.lesson.points.map((point) => (
                <li key={point}>{t(point)}</li>
              ))}
            </ul>
            <div className="education-links">
              <span>{t("Read and watch")}</span>
              {tile.lesson.links.map((link) => {
                const LinkIcon = LINK_ICONS[link.kind];
                return (
                  <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">
                    <LinkIcon size={15} aria-hidden="true" />
                    {t(link.label)}
                    <ExternalLink size={12} aria-hidden="true" />
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </article>
    </div>
  );
}
