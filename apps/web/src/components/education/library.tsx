"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2, Star } from "lucide-react";

import { api } from "@/lib/api";
import {
  amazonUrl,
  coverUrl,
  rankBooks,
  type Book,
  type BookRating,
  type BookRatings,
  type MyReview,
  type ReaderComment,
} from "@/lib/books";
import { useT } from "@/lib/i18n/client";
import { EmptyState } from "@/components/empty-state";
import { ShimmerLines } from "@/components/shimmer";

import "./library.css";

const EMPTY: BookRatings = { ratings: {}, mine: {}, comments: {} };
const COMMENT_MAX = 500;
/** Arrow keys move through the stars one by one; only the star someone settles on is saved. */
const SAVE_DELAY_MS = 350;

type CardStatus = { kind: "saving" | "saved" | "error"; text: string };

/** The admin's books with readers' ratings, sorted by rating, rated right on the cards. */
export function Library() {
  const t = useT();
  const [books, setBooks] = useState<Book[] | null>(null);
  const [booksFailed, setBooksFailed] = useState(false);
  const [data, setData] = useState<BookRatings | null>(null);
  const [ratingsFailed, setRatingsFailed] = useState(false);
  const [tag, setTag] = useState("");
  const [open, setOpen] = useState<Book | null>(null);
  // Stars picked on a card that are still being saved, so the card shows them at once.
  const [drafts, setDrafts] = useState<Record<string, number>>({});
  const [status, setStatus] = useState<Record<string, CardStatus>>({});
  const opener = useRef<HTMLElement | null>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const latest = useRef<BookRatings>(EMPTY);

  const applyRatings = useCallback((body: BookRatings | null) => {
    if (body) {
      const next = { ...EMPTY, ...body };
      latest.current = next;
      setData(next);
      setRatingsFailed(false);
    } else {
      setData((current) => current ?? EMPTY);
      setRatingsFailed(true);
    }
  }, []);

  /** Fresh averages and "mine" after the person saves or removes a rating. */
  const reloadRatings = useCallback(async () => {
    applyRatings(await api<BookRatings>("/api/books/ratings").catch(() => null));
  }, [applyRatings]);

  useEffect(() => {
    let active = true;
    const pending = timers.current;
    api<Book[]>("/api/books")
      .then((rows) => {
        if (active) setBooks(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (active) {
          setBooks([]);
          setBooksFailed(true);
        }
      });
    // The admin's Amazon Associates tag; links stay plain if settings can't be read.
    api<{ amazon_affiliate_tag?: string }>("/api/settings")
      .then((settings) => {
        if (active) setTag(settings?.amazon_affiliate_tag ?? "");
      })
      .catch(() => {});
    api<BookRatings>("/api/books/ratings")
      .catch(() => null)
      .then((body) => {
        if (active) applyRatings(body);
      });
    return () => {
      active = false;
      for (const timer of Object.values(pending)) clearTimeout(timer);
    };
  }, [applyRatings]);

  const ratings = data?.ratings ?? EMPTY.ratings;
  const ranked = useMemo(() => rankBooks(books ?? [], ratings), [books, ratings]);

  function show(book: Book) {
    opener.current = document.activeElement as HTMLElement | null;
    setOpen(book);
  }

  const close = useCallback(() => {
    setOpen(null);
    opener.current?.focus?.();
  }, []);

  function forgetDraft(bookId: string) {
    setDrafts((current) => {
      const next = { ...current };
      delete next[bookId];
      return next;
    });
  }

  async function saveFromCard(book: Book, stars: number) {
    setStatus((current) => ({ ...current, [book.id]: { kind: "saving", text: t("Saving…") } }));
    try {
      await api(`/api/books/${book.id}/review`, {
        method: "PUT",
        // A comment written in the book's dialog is kept.
        body: JSON.stringify({ stars, comment: latest.current.mine[book.id]?.comment ?? null }),
      });
      await reloadRatings();
      setStatus((current) => ({ ...current, [book.id]: { kind: "saved", text: t("Rating saved") } }));
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : t("Could not save your rating.");
      setStatus((current) => ({ ...current, [book.id]: { kind: "error", text } }));
    } finally {
      forgetDraft(book.id);
    }
  }

  function rateFromCard(book: Book, stars: number) {
    setDrafts((current) => ({ ...current, [book.id]: stars }));
    clearTimeout(timers.current[book.id]);
    timers.current[book.id] = setTimeout(() => void saveFromCard(book, stars), SAVE_DELAY_MS);
  }

  async function removeFromCard(book: Book) {
    clearTimeout(timers.current[book.id]);
    forgetDraft(book.id);
    try {
      await api(`/api/books/${book.id}/review`, { method: "DELETE" });
      await reloadRatings();
      setStatus((current) => ({ ...current, [book.id]: { kind: "saved", text: t("Rating removed") } }));
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : t("Could not remove your rating.");
      setStatus((current) => ({ ...current, [book.id]: { kind: "error", text } }));
    }
  }

  return (
    <section className="library" aria-labelledby="library-title">
      <header className="library-head">
        <h2 id="library-title">{t("Library")}</h2>
        <p className="muted">{t("Finance books worth your time. Rate the ones you've read.")}</p>
      </header>

      {booksFailed && <p className="alert library-alert">{t("Books are unavailable right now.")}</p>}
      {!booksFailed && ratingsFailed && <p className="alert library-alert">{t("Ratings are unavailable right now.")}</p>}

      {books === null ? (
        <ShimmerLines label={t("Loading books…")} lines={4} card />
      ) : books.length === 0 ? (
        !booksFailed && <EmptyState art="books" title={t("No books yet.")} text={t("The admin adds books to the Library in Admin.")} />
      ) : (
        <ul className="library-grid" aria-label={t("Books")}>
          {ranked.map(({ book, rating, rank }) => (
            <BookCard
              key={book.id}
              book={book}
              rating={rating}
              rank={rank}
              tag={tag}
              mine={drafts[book.id] ?? data?.mine[book.id]?.stars ?? null}
              hasReview={Boolean(data?.mine[book.id])}
              status={status[book.id]}
              onOpen={() => show(book)}
              onRate={(stars) => rateFromCard(book, stars)}
              onRemove={() => void removeFromCard(book)}
            />
          ))}
        </ul>
      )}

      <p className="library-disclosure muted">{t("As an Amazon Associate, StockBuddy earns from qualifying purchases.")}</p>

      {open && (
        <BookDialog
          book={open}
          tag={tag}
          rating={ratings[open.id]}
          mine={data?.mine[open.id]}
          comments={data?.comments[open.id] ?? []}
          onSaved={reloadRatings}
          onClose={close}
        />
      )}
    </section>
  );
}

function BookCard({
  book,
  rating,
  rank,
  tag,
  mine,
  hasReview,
  status,
  onOpen,
  onRate,
  onRemove,
}: {
  book: Book;
  rating: BookRating | null;
  rank: number | null;
  tag: string;
  mine: number | null;
  hasReview: boolean;
  status: CardStatus | undefined;
  onOpen: () => void;
  onRate: (stars: number) => void;
  onRemove: () => void;
}) {
  const t = useT();
  return (
    <li className="library-card" aria-label={book.title}>
      {rank !== null && (
        <span className="library-rank">
          <span aria-hidden="true">#{rank}</span>
          <span className="sr-only">{t("Number {rank} by readers' rating", { rank })}</span>
        </span>
      )}
      <div className="library-card-main">
        <button type="button" className="library-card-cover" onClick={onOpen} aria-label={t("Details for {title}", { title: book.title })}>
          <BookCover book={book} />
        </button>
        <div className="library-card-text">
          {book.topic && <span className="library-topic">{t(book.topic)}</span>}
          <button type="button" className="library-card-title" onClick={onOpen}>
            {book.title}
          </button>
          <span className="muted">{book.author}</span>
          {book.description && <span className="library-description">{t(book.description)}</span>}
        </div>
      </div>
      <div className="library-card-rating">
        <StarInput
          name={`card-stars-${book.id}`}
          legend={t("Rate {title}", { title: book.title })}
          value={mine}
          display={rating?.average ?? 0}
          size={20}
          onChange={onRate}
        />
        <span className="library-rating-text">
          {rating ? (
            <span
              aria-label={
                rating.count === 1
                  ? t("Rated {average} out of 5 by 1 reader", { average: rating.average.toFixed(1) })
                  : t("Rated {average} out of 5 by {count} readers", { average: rating.average.toFixed(1), count: rating.count })
              }
            >
              {rating.average.toFixed(1)} ({rating.count})
            </span>
          ) : (
            <span className="muted">{t("Not rated yet")}</span>
          )}
          {hasReview && (
            <button type="button" className="text-button library-remove" onClick={onRemove}>
              {t("Remove")}
            </button>
          )}
        </span>
        <span className={`library-card-status ${status?.kind ?? ""}`} role="status">
          {status?.text ?? ""}
        </span>
      </div>
      <BuyLink book={book} tag={tag} />
    </li>
  );
}

/**
 * Five stars as radio buttons ("Rate N out of 5"), so arrow keys and screen readers work.
 * `value` is the person's own rating; without one, `display` (the average) is shown greyed.
 */
function StarInput({
  name,
  legend,
  value,
  display,
  size,
  onChange,
}: {
  name: string;
  legend: string;
  value: number | null;
  display: number;
  size: number;
  onChange: (stars: number) => void;
}) {
  const t = useT();
  const filled = value ?? Math.round(display);
  return (
    <fieldset className={`library-star-input${value ? " mine" : " average"}`}>
      <legend className="sr-only">{legend}</legend>
      {[1, 2, 3, 4, 5].map((stars) => (
        <label key={stars} className={stars <= filled ? "on" : ""}>
          <input
            type="radio"
            name={name}
            value={stars}
            checked={value === stars}
            onChange={() => onChange(stars)}
            aria-label={t("Rate {stars} out of 5", { stars })}
          />
          <Star size={size} aria-hidden="true" />
        </label>
      ))}
    </fieldset>
  );
}

function BuyLink({ book, tag, primary = false }: { book: Book; tag: string; primary?: boolean }) {
  const t = useT();
  const href = amazonUrl(book, tag);
  if (!href) return null;
  return (
    <a
      className={`button library-buy${primary ? " primary" : ""}`}
      href={href}
      target="_blank"
      rel="sponsored noopener noreferrer"
      aria-label={t("Buy {title} on Amazon (opens in a new tab)", { title: book.title })}
    >
      {t("Buy on Amazon")}
      <ExternalLink size={13} aria-hidden="true" />
    </a>
  );
}

/** The book's cover, or the title on a plain tile when there is no picture. */
function BookCover({ book, size = "M" }: { book: Book; size?: "M" | "L" }) {
  const t = useT();
  const src = coverUrl(book, size);
  const [failed, setFailed] = useState<string | null>(null);
  const label = t("Cover of {title}", { title: book.title });
  if (!src || failed === src) {
    return (
      <span className={`library-cover library-cover-${size} library-cover-fallback`} role="img" aria-label={label}>
        <span>{book.title}</span>
      </span>
    );
  }
  return (
    // Covers come from Open Library or the admin's link, at their own sizes.
    // eslint-disable-next-line @next/next/no-img-element
    <img className={`library-cover library-cover-${size}`} src={src} alt={label} loading="lazy" onError={() => setFailed(src)} />
  );
}

function StarRow({ value, label, text }: { value: number; label: string; text?: string }) {
  const filled = Math.round(value);
  return (
    <span className="library-stars" role="img" aria-label={label}>
      {[1, 2, 3, 4, 5].map((step) => (
        <Star key={step} size={14} aria-hidden="true" className={step <= filled ? "on" : ""} />
      ))}
      {text && <span aria-hidden="true">{text}</span>}
    </span>
  );
}

function BookDialog({
  book,
  tag,
  rating,
  mine,
  comments,
  onSaved,
  onClose,
}: {
  book: Book;
  tag: string;
  rating: BookRating | undefined;
  mine: MyReview | undefined;
  comments: ReaderComment[];
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const t = useT();
  const [ratingOpen, setRatingOpen] = useState(Boolean(mine));
  const [stars, setStars] = useState(mine?.stars ?? 0);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [busy, setBusy] = useState<"save" | "remove" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!stars) {
      setError(t("Choose 1 to 5 stars."));
      return;
    }
    setBusy("save");
    setError("");
    setNotice("");
    try {
      await api(`/api/books/${book.id}/review`, {
        method: "PUT",
        body: JSON.stringify({ stars, comment: comment.trim() || null }),
      });
      await onSaved();
      setNotice(t("Your rating is saved."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not save your rating."));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy("remove");
    setError("");
    setNotice("");
    try {
      await api(`/api/books/${book.id}/review`, { method: "DELETE" });
      await onSaved();
      setStars(0);
      setComment("");
      setRatingOpen(false);
      setNotice(t("Your rating was removed."));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("Could not remove your rating."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="modal-backdrop breakdown-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <article className="add-holding-modal article-reader library-dialog" role="dialog" aria-modal="true" aria-labelledby="library-dialog-title">
        <div className="modal-heading">
          <h2 id="library-dialog-title">{book.title}</h2>
          <button type="button" aria-label={t("Close")} onClick={onClose} autoFocus>
            ×
          </button>
        </div>

        <div className="library-dialog-book">
          <BookCover book={book} size="L" />
          <div className="library-dialog-info">
            <p className="muted">{t("by {author}", { author: book.author })}</p>
            {book.topic && <span className="library-topic">{t(book.topic)}</span>}
            {book.description && <p>{t(book.description)}</p>}
            {rating ? (
              <StarRow
                value={rating.average}
                label={
                  rating.count === 1
                    ? t("Rated {average} out of 5 by 1 reader", { average: rating.average.toFixed(1) })
                    : t("Rated {average} out of 5 by {count} readers", { average: rating.average.toFixed(1), count: rating.count })
                }
                text={`${rating.average.toFixed(1)} (${rating.count})`}
              />
            ) : (
              <p className="muted">{t("Not rated yet")}</p>
            )}
            <div>
              <BuyLink book={book} tag={tag} primary />
            </div>
          </div>
        </div>

        <section className="library-rate" aria-labelledby="library-rate-title">
          <h3 id="library-rate-title">{mine ? t("Your rating") : t("Read it?")}</h3>
          {!ratingOpen ? (
            <button type="button" className="button" onClick={() => setRatingOpen(true)}>
              <Star size={14} aria-hidden="true" />
              {t("I've read it — rate it")}
            </button>
          ) : (
            <form onSubmit={save} className="library-rate-form">
              <StarInput
                name={`dialog-stars-${book.id}`}
                legend={t("Your rating")}
                value={stars || null}
                display={0}
                size={26}
                onChange={setStars}
              />
              <label className="library-comment">
                {t("Comment (optional)")}
                <textarea
                  value={comment}
                  maxLength={COMMENT_MAX}
                  rows={3}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={t("What did you take away from it?")}
                />
                <small className="muted">{t("{used} of {max} characters", { used: comment.length, max: COMMENT_MAX })}</small>
              </label>
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
              <div className="confirm-actions">
                {mine && (
                  <button type="button" className="button" onClick={remove} disabled={busy !== null} aria-busy={busy === "remove"}>
                    {busy === "remove" && <Loader2 size={15} className="spinning" aria-hidden="true" />}
                    {t("Remove my rating")}
                  </button>
                )}
                <button type="submit" className="button primary" disabled={busy !== null || !stars} aria-busy={busy === "save"}>
                  {busy === "save" && <Loader2 size={15} className="spinning" aria-hidden="true" />}
                  {busy === "save" ? t("Saving…") : t("Save rating")}
                </button>
              </div>
            </form>
          )}
          {!ratingOpen && notice && (
            <p className="notice" role="status">
              {notice}
            </p>
          )}
        </section>

        <section className="library-comments" aria-labelledby="library-comments-title">
          <h3 id="library-comments-title">{t("What readers say")}</h3>
          {comments.length ? (
            <ul>
              {comments.map((item, index) => (
                <li key={`${item.date}-${index}`}>
                  <StarRow value={item.stars} label={t("Rated {stars} out of 5", { stars: item.stars })} />
                  <p>{item.comment}</p>
                  {item.date && (
                    <time dateTime={item.date} className="muted">
                      {item.date}
                    </time>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">{t("No comments yet.")}</p>
          )}
        </section>
      </article>
    </div>
  );
}
