"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Pencil, Plus, Trash2 } from "lucide-react";

import { api, apiUpload } from "@/lib/api";
import { useT } from "@/lib/i18n/client";
import { articleExcerpt, type EducationArticle } from "@/lib/education";

type ArticleDraft = {
  id: string | null;
  title: string;
  body: string;
  image_path: string | null;
  image_url: string | null;
  published: boolean;
  position: string;
};

const PICTURE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_PICTURE_BYTES = 5 * 1024 * 1024;

function emptyDraft(position: number): ArticleDraft {
  return { id: null, title: "", body: "", image_path: null, image_url: null, published: true, position: String(position) };
}

function draftFrom(article: EducationArticle): ArticleDraft {
  return {
    id: article.id,
    title: article.title,
    body: article.body,
    image_path: article.image_path,
    image_url: article.image_url,
    published: article.published,
    position: String(article.position),
  };
}

/** Admin: write the financial articles every user sees on their Education page. */
export function AdminEducation() {
  const t = useT();
  const [articles, setArticles] = useState<EducationArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ArticleDraft | null>(null);

  useEffect(() => {
    let active = true;
    api<EducationArticle[]>("/api/admin/education/articles")
      .then((rows) => {
        if (active) setArticles(Array.isArray(rows) ? rows : []);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load articles");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function sorted(rows: EducationArticle[]) {
    return [...rows].sort(
      (a, b) => a.position - b.position || String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")),
    );
  }

  async function remove(article: EducationArticle) {
    if (!window.confirm(t("Delete \"{title}\" for every user?", { title: article.title }))) return;
    setError(null);
    try {
      await api(`/api/admin/education/articles/${article.id}`, { method: "DELETE" });
      setArticles((current) => current.filter((item) => item.id !== article.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not delete the article"));
    }
  }

  return (
    <section className="simple-page admin-page admin-education" aria-labelledby="admin-education-title">
      <div className="page-heading">
        <div>
          <h1 id="admin-education-title">{t("Education articles")}</h1>
          <p className="page-subtitle">{t("Published articles appear on every user's Education page.")}</p>
        </div>
        <button
          type="button"
          className="button primary admin-education-add"
          onClick={() => setDraft(emptyDraft(articles.length))}
        >
          <Plus size={16} aria-hidden="true" />
          {t("New article")}
        </button>
      </div>
      {error && (
        <div className="alert" role="alert">
          {/* The load error is stored in English (the effect runs once), so it is translated here. */}
          {t(error)}
        </div>
      )}
      {loading ? (
        <p className="muted">{t("Loading articles…")}</p>
      ) : articles.length === 0 ? (
        <p className="muted">{t("No articles yet. Add the first one with New article.")}</p>
      ) : (
        <ul className="admin-article-list">
          {articles.map((article) => (
            <li key={article.id} className="panel admin-article">
              {article.image_url ? (
                // Article pictures come from Supabase Storage at any size, so a plain img is used.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={article.image_url} alt="" />
              ) : (
                <span className="admin-article-noimage" aria-hidden="true">
                  <ImagePlus size={20} />
                </span>
              )}
              <div>
                <strong>{article.title}</strong>
                <span className={`admin-article-status ${article.published ? "published" : "draft"}`}>
                  {article.published ? t("Published") : t("Draft")}
                </span>
                <p>{articleExcerpt(article.body, 120)}</p>
              </div>
              <div className="fire-entry-actions">
                <button type="button" aria-label={t("Edit {title}", { title: article.title })} onClick={() => setDraft(draftFrom(article))}>
                  <Pencil size={15} aria-hidden="true" />
                </button>
                <button type="button" aria-label={t("Delete {title}", { title: article.title })} onClick={() => void remove(article)}>
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {draft && (
        <ArticleDialog
          draft={draft}
          onPatch={(patch) => setDraft((current) => (current ? { ...current, ...patch } : current))}
          onClose={() => setDraft(null)}
          onSaved={(saved) => {
            setArticles((current) =>
              sorted(current.some((item) => item.id === saved.id)
                ? current.map((item) => (item.id === saved.id ? saved : item))
                : [...current, saved]),
            );
            setDraft(null);
          }}
        />
      )}
    </section>
  );
}

function ArticleDialog({
  draft,
  onPatch,
  onClose,
  onSaved,
}: {
  draft: ArticleDraft;
  /** Merges into the latest draft, so text typed during an upload is kept. */
  onPatch: (patch: Partial<ArticleDraft>) => void;
  onClose: () => void;
  onSaved: (article: EducationArticle) => void;
}) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"upload" | "save" | null>(null);
  const set = (patch: Partial<ArticleDraft>) => {
    onPatch(patch);
    setError(null);
  };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function upload(file: File) {
    if (!PICTURE_TYPES.includes(file.type)) {
      setError(t("Use a PNG, JPEG, WebP, or GIF picture."));
      return;
    }
    if (file.size > MAX_PICTURE_BYTES) {
      setError(t("Pictures can be up to 5 MB."));
      return;
    }
    setBusy("upload");
    setError(null);
    try {
      const form = new FormData();
      form.append("image", file);
      const stored = await apiUpload<{ image_path: string; image_url: string }>("/api/admin/education/images", form);
      onPatch(stored);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not upload the picture"));
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!draft.title.trim()) return setError(t("Give the article a title."));
    if (!draft.body.trim()) return setError(t("Write the article text."));
    const position = Number(draft.position);
    if (!Number.isInteger(position) || position < 0) return setError(t("Order must be a whole number, 0 or more."));
    setBusy("save");
    try {
      const saved = await api<EducationArticle>(
        draft.id ? `/api/admin/education/articles/${draft.id}` : "/api/admin/education/articles",
        {
          method: draft.id ? "PUT" : "POST",
          body: JSON.stringify({
            title: draft.title.trim(),
            body: draft.body.trim(),
            image_path: draft.image_path,
            published: draft.published,
            position,
          }),
        },
      );
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not save the article"));
      setBusy(null);
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
      <section className="add-holding-modal article-dialog" role="dialog" aria-modal="true" aria-labelledby="article-dialog-title">
        <div className="modal-heading">
          <h2 id="article-dialog-title">{draft.id ? t("Edit article") : t("New article")}</h2>
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
            {t("Title")}
            <input autoFocus maxLength={160} value={draft.title} onChange={(event) => set({ title: event.target.value })} />
          </label>
          <div className="article-picture">
            <span>{t("Picture (optional)")}</span>
            {draft.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={draft.image_url} alt={t("Article picture preview")} />
            ) : (
              <span className="admin-article-noimage" aria-hidden="true">
                <ImagePlus size={22} />
              </span>
            )}
            <div>
              <label className="button article-picture-pick">
                {busy === "upload" ? t("Uploading…") : draft.image_url ? t("Replace picture") : t("Upload picture")}
                <input
                  type="file"
                  accept={PICTURE_TYPES.join(",")}
                  disabled={busy !== null}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void upload(file);
                  }}
                />
              </label>
              {draft.image_url && (
                <button type="button" className="text-button" onClick={() => set({ image_path: null, image_url: null })}>
                  {t("Remove picture")}
                </button>
              )}
              <small className="muted">{t("PNG, JPEG, WebP, or GIF, up to 5 MB.")}</small>
            </div>
          </div>
          <label>
            {t("Text")}
            <textarea rows={10} maxLength={20000} value={draft.body} onChange={(event) => set({ body: event.target.value })} />
          </label>
          <div className="fire-dialog-row">
            <label>
              {t("Order")}
              <input type="number" min="0" step="1" value={draft.position} onChange={(event) => set({ position: event.target.value })} />
            </label>
            <label className="article-published">
              <input type="checkbox" checked={draft.published} onChange={(event) => set({ published: event.target.checked })} />
              {t("Published (visible to all users)")}
            </label>
          </div>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button primary" disabled={busy !== null}>
            {busy === "save" ? t("Saving…") : draft.id ? t("Save article") : t("Add article")}
          </button>
        </form>
      </section>
    </div>
  );
}
