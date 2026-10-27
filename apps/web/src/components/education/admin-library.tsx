"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Loader2, Pencil, Plus, Star, Trash2 } from "lucide-react";

import { api } from "@/lib/api";
import { BOOK_TOPICS, coverUrl, type AdminBook } from "@/lib/books";
import { useT } from "@/lib/i18n/client";

import "./library.css";

type BookDraft = {
  id: string | null;
  title: string;
  author: string;
  isbn: string;
  amazon_url: string;
  cover_url: string;
  topic: string;
  description: string;
};

const EMPTY_DRAFT: BookDraft = { id: null, title: "", author: "", isbn: "", amazon_url: "", cover_url: "", topic: "", description: "" };

function draftFrom(book: AdminBook): BookDraft {
  return {
    id: book.id,
    title: book.title,
    author: book.author,
    isbn: book.isbn ?? "",
    amazon_url: book.amazon_url ?? "",
    cover_url: book.cover_url ?? "",
    topic: book.topic,
    description: book.description,
  };
}

/** Admin: the Library's books (add, edit, remove, order) and the Amazon affiliate tag. */
export function AdminLibrary({ initialTag, onTagSaved }: { initialTag: string; onTagSaved: (tag: string) => void }) {
  const t = useT();
  const [books, setBooks] = useState<AdminBook[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<BookDraft | null>(null);
  const [removing, setRemoving] = useState<AdminBook | null>(null);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    let active = true;
    api<AdminBook[]>("/api/admin/books")
      .then((rows) => {
        if (active) setBooks(Array.isArray(rows) ? rows : []);
      })
      .catch((cause: unknown) => {
        if (active) {
          setBooks([]);
          setError(cause instanceof Error ? cause.message : "Could not load the books");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function move(index: number, step: -1 | 1) {
    if (!books) return;
    const target = index + step;
    if (target < 0 || target >= books.length) return;
    const ids = books.map((book) => book.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setMoving(true);
    setError(null);
    try {
      const rows = await api<AdminBook[]>("/api/admin/books/order", { method: "PUT", body: JSON.stringify({ ids }) });
      setBooks(rows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not change the order"));
    } finally {
      setMoving(false);
    }
  }

  return (
    <section className="simple-page admin-page admin-library" aria-labelledby="admin-library-title">
      <div className="page-heading">
        <div>
          <h1 id="admin-library-title">{t("Library")}</h1>
          <p className="page-subtitle">{t("The books every user sees in Education, in this order until readers rate them.")}</p>
        </div>
        <button type="button" className="button primary admin-education-add" onClick={() => setDraft(EMPTY_DRAFT)}>
          <Plus size={16} aria-hidden="true" />
          {t("Add book")}
        </button>
      </div>

      <AffiliateTag initialTag={initialTag} onSaved={onTagSaved} />

      {error && (
        <div className="alert" role="alert">
          {/* The load error is stored in English (the effect runs once), so it is translated here. */}
          {t(error)}
        </div>
      )}

      {books === null ? (
        <p className="muted">{t("Loading books…")}</p>
      ) : books.length === 0 ? (
        <p className="muted">{t("No books yet. Add the first one with Add book.")}</p>
      ) : (
        <div className="panel admin-library-table-wrap">
          <table className="admin-library-table">
            <thead>
              <tr>
                <th scope="col">{t("Cover")}</th>
                <th scope="col">{t("Title")}</th>
                <th scope="col">{t("Author")}</th>
                <th scope="col">{t("Amazon")}</th>
                <th scope="col">{t("Rating")}</th>
                <th scope="col">
                  <span className="sr-only">{t("Actions")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {books.map((book, index) => {
                const cover = coverUrl(book, "M");
                return (
                  <tr key={book.id}>
                    <td>
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="admin-library-thumb" src={cover} alt="" loading="lazy" />
                      ) : (
                        <span className="admin-library-thumb library-cover-fallback" aria-hidden="true" />
                      )}
                    </td>
                    <th scope="row">{book.title}</th>
                    <td>{book.author}</td>
                    <td>
                      {book.amazon_url ? (
                        <a href={book.amazon_url} target="_blank" rel="noopener noreferrer">
                          {t("Amazon link")}
                          <ExternalLink size={12} aria-hidden="true" />
                        </a>
                      ) : book.isbn ? (
                        <span>{t("ISBN {isbn}", { isbn: book.isbn })}</span>
                      ) : (
                        <span className="muted">{t("No link")}</span>
                      )}
                    </td>
                    <td>
                      {book.count > 0 && book.average !== null ? (
                        <span className="admin-library-rating">
                          <Star size={13} aria-hidden="true" />
                          {t("{average} from {count}", { average: book.average.toFixed(1), count: book.count })}
                        </span>
                      ) : (
                        <span className="muted">{t("Not rated yet")}</span>
                      )}
                    </td>
                    <td>
                      <div className="fire-entry-actions">
                        <button type="button" aria-label={t("Move {title} up", { title: book.title })} disabled={moving || index === 0} onClick={() => void move(index, -1)}>
                          <ArrowUp size={15} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          aria-label={t("Move {title} down", { title: book.title })}
                          disabled={moving || index === books.length - 1}
                          onClick={() => void move(index, 1)}
                        >
                          <ArrowDown size={15} aria-hidden="true" />
                        </button>
                        <button type="button" aria-label={t("Edit {title}", { title: book.title })} onClick={() => setDraft(draftFrom(book))}>
                          <Pencil size={15} aria-hidden="true" />
                        </button>
                        <button type="button" aria-label={t("Remove {title}", { title: book.title })} onClick={() => setRemoving(book)}>
                          <Trash2 size={15} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {draft && (
        <BookDialog
          draft={draft}
          onClose={() => setDraft(null)}
          onSaved={(saved) => {
            setBooks((current) => {
              const rows = current ?? [];
              return rows.some((book) => book.id === saved.id)
                ? rows.map((book) => (book.id === saved.id ? saved : book))
                : [...rows, saved];
            });
            setDraft(null);
          }}
        />
      )}

      {removing && (
        <RemoveDialog
          book={removing}
          onCancel={() => setRemoving(null)}
          onRemoved={() => {
            setBooks((current) => (current ?? []).filter((book) => book.id !== removing.id));
            setRemoving(null);
          }}
        />
      )}
    </section>
  );
}

function AffiliateTag({ initialTag, onSaved }: { initialTag: string; onSaved: (tag: string) => void }) {
  const t = useT();
  const [tag, setTag] = useState(initialTag);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function save(event: FormEvent) {
    event.preventDefault();
    const value = tag.trim();
    if (!/^[A-Za-z0-9-]{0,64}$/.test(value)) {
      setError(t("Amazon affiliate tag must be at most 64 letters, digits, or hyphens"));
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await api<{ amazon_affiliate_tag: string }>("/api/admin/library", {
        method: "PUT",
        body: JSON.stringify({ amazon_affiliate_tag: value }),
      });
      setTag(saved.amazon_affiliate_tag);
      onSaved(saved.amazon_affiliate_tag);
      setNotice(t("Affiliate tag saved."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not save the affiliate tag"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel settings-panel admin-library-tag" onSubmit={save} noValidate>
      <label>
        {t("Amazon affiliate tag")}
        <input
          value={tag}
          onChange={(event) => {
            setTag(event.target.value);
            setError("");
            setNotice("");
          }}
          maxLength={64}
          placeholder="stockbuddy-20"
          autoComplete="off"
          spellCheck={false}
        />
        <small className="muted">{t("Added to the Library's Buy on Amazon links. Leave empty for plain links.")}</small>
      </label>
      <button type="submit" className="button primary" disabled={busy}>
        {busy ? t("Saving…") : t("Save tag")}
      </button>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </form>
  );
}

function BookDialog({ draft: initial, onClose, onSaved }: { draft: BookDraft; onClose: () => void; onSaved: (book: AdminBook) => void }) {
  const t = useT();
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<BookDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) return setError(t("Give the book a title."));
    if (!draft.author.trim()) return setError(t("Add the author."));
    setBusy(true);
    try {
      const saved = await api<AdminBook>(draft.id ? `/api/admin/books/${draft.id}` : "/api/admin/books", {
        method: draft.id ? "PUT" : "POST",
        body: JSON.stringify({
          title: draft.title.trim(),
          author: draft.author.trim(),
          isbn: draft.isbn.trim() || null,
          amazon_url: draft.amazon_url.trim() || null,
          cover_url: draft.cover_url.trim() || null,
          topic: draft.topic.trim(),
          description: draft.description.trim(),
        }),
      });
      onSaved(saved);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not save the book"));
      setBusy(false);
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
      <section className="add-holding-modal article-dialog" role="dialog" aria-modal="true" aria-labelledby="book-dialog-title">
        <div className="modal-heading">
          <h2 id="book-dialog-title">{draft.id ? t("Edit book") : t("Add book")}</h2>
          <button type="button" aria-label={t("Close")} onClick={onClose}>
            ×
          </button>
        </div>
        <form className="modal-fields admin-library-form" noValidate onSubmit={save}>
          <label>
            {t("Title")}
            <input autoFocus maxLength={200} value={draft.title} onChange={(event) => set({ title: event.target.value })} />
          </label>
          <label>
            {t("Author")}
            <input maxLength={200} value={draft.author} onChange={(event) => set({ author: event.target.value })} />
          </label>
          <div className="fire-dialog-row">
            <label>
              {t("ISBN")}
              <input maxLength={20} inputMode="numeric" value={draft.isbn} onChange={(event) => set({ isbn: event.target.value })} />
            </label>
            <label>
              {t("Topic")}
              <input maxLength={60} list="book-topics" value={draft.topic} onChange={(event) => set({ topic: event.target.value })} />
              <datalist id="book-topics">
                {BOOK_TOPICS.map((topic) => (
                  <option key={topic} value={topic} />
                ))}
              </datalist>
            </label>
          </div>
          <label>
            {t("Amazon link (optional)")}
            <input type="url" maxLength={500} placeholder="https://www.amazon.com/dp/…" value={draft.amazon_url} onChange={(event) => set({ amazon_url: event.target.value })} />
            <small className="muted">{t("Without a link, one is made from the ISBN. The affiliate tag is added either way.")}</small>
          </label>
          <label>
            {t("Cover link (optional)")}
            <input type="url" maxLength={500} placeholder="https://covers.openlibrary.org/…" value={draft.cover_url} onChange={(event) => set({ cover_url: event.target.value })} />
            <small className="muted">{t("From Open Library, Amazon, or Google Books. Without one, the ISBN's Open Library cover is used.")}</small>
          </label>
          <label>
            {t("Description")}
            <textarea rows={4} maxLength={600} value={draft.description} onChange={(event) => set({ description: event.target.value })} />
          </label>
          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? t("Saving…") : draft.id ? t("Save book") : t("Add book")}
          </button>
        </form>
      </section>
    </div>
  );
}

function RemoveDialog({ book, onCancel, onRemoved }: { book: AdminBook; onCancel: () => void; onRemoved: () => void }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  async function remove() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/admin/books/${book.id}`, { method: "DELETE" });
      onRemoved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not remove the book"));
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <section className="add-holding-modal confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="remove-book-title" aria-describedby="remove-book-text">
        <h2 id="remove-book-title">{t("Remove {title}?", { title: book.title })}</h2>
        <p id="remove-book-text" className="muted">
          {t("It disappears from every user's Library, and its ratings and comments are deleted.")}
        </p>
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        <div className="confirm-actions">
          <button type="button" className="button" onClick={onCancel} disabled={busy} autoFocus>
            {t("Keep book")}
          </button>
          <button type="button" className="button danger" onClick={() => void remove()} disabled={busy} aria-busy={busy}>
            {busy && <Loader2 size={15} className="spinning" aria-hidden="true" />}
            {t("Remove book")}
          </button>
        </div>
      </section>
    </div>
  );
}
