"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2, Star } from "lucide-react";

import { api } from "@/lib/api";
import {
  BOOK_CATALOG,
  TOPIC_LABELS,
  amazonUrl,
  coverUrl,
  topBooks,
  type Book,
  type BookRating,
  type BookRatings,
  type MyReview,
} from "@/lib/books";
import { useT } from "@/lib/i18n/client";

import "./library.css";

const EMPTY: BookRatings = { ratings: {}, mine: {}, comments: {} };
const COMMENT_MAX = 500;

/** Recommended books with readers' ratings, a Top 5, and Amazon links. */
export function Library() {
  const t = useT();
  const [data, setData] = useState<BookRatings | null>(null);
  const [failed, setFailed] = useState(false);
  const [tag, setTag] = useState("");
  const [open, setOpen] = useState<Book | null>(null);
  const opener = useRef<HTMLElement | null>(null);

  const applyRatings = useCallback((body: BookRatings | null) => {
    if (body) {
      setData({ ...EMPTY, ...body });
      setFailed(false);
    } else {
      setData((current) => current ?? EMPTY);
      setFailed(true);
    }
  }, []);

  /** Fresh averages and "mine" after the person saves or removes a rating. */
  const reloadRatings = useCallback(async () => {
    applyRatings(await api<BookRatings>("/api/books/ratings").catch(() => null));
  }, [applyRatings]);

  useEffect(() => {
    let active = true;
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
    };
  }, [applyRatings]);

  const ratings = data?.ratings ?? EMPTY.ratings;
  const top = useMemo(() => topBooks(ratings), [ratings]);

  function show(book: Book) {
    opener.current = document.activeElement as HTMLElement | null;
    setOpen(book);
  }

  const close = useCallback(() => {
    setOpen(null);
    opener.current?.focus?.();
  }, []);

  return (
    <section className="library" aria-labelledby="library-title">
      <header className="library-head">
        <h2 id="library-title">{t("Library")}</h2>
        <p className="muted">{t("Finance books worth your time. Rate the ones you've read.")}</p>
      </header>

      {failed && <p className="alert library-alert">{t("Ratings are unavailable right now.")}</p>}

      <section className="library-top" aria-labelledby="library-top-title">
        <h3 id="library-top-title">{top.byReaders ? t("Top 5 by readers") : t("Our picks")}</h3>
        {!top.byReaders && data && (
          <p className="muted">{t("No ratings yet. Read one of these and be the first to rate it.")}</p>
        )}
        <ol className="library-top-list">
          {top.books.map(({ book, rating, pick }, index) => (
            <li key={book.id}>
              <button type="button" className="library-top-item" onClick={() => show(book)}>
                <span className="library-rank" aria-hidden="true">
                  {index + 1}
                </span>
                <BookCover book={book} size="S" />
                <span className="library-top-text">
                  <strong>{book.title}</strong>
                  <span className="muted">{book.author}</span>
                  {rating ? (
                    <Stars rating={rating} />
                  ) : (
                    top.byReaders && pick && <span className="library-pick">{t("Our pick")}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      <section className="library-all" aria-labelledby="library-all-title">
        <h3 id="library-all-title">{t("All books")}</h3>
        <ul className="library-grid">
          {BOOK_CATALOG.map((book) => {
            const rating = ratings[book.id];
            return (
              <li key={book.id} className="library-card">
                <button type="button" className="library-card-open" onClick={() => show(book)} aria-label={t("{title} by {author}", { title: book.title, author: book.author })}>
                  <BookCover book={book} />
                  <span className="library-card-text">
                    <span className="library-topic">{t(TOPIC_LABELS[book.topic])}</span>
                    <strong>{book.title}</strong>
                    <span className="muted">{book.author}</span>
                    <span className="library-description">{t(book.description)}</span>
                    {rating ? <Stars rating={rating} /> : <span className="muted library-unrated">{t("Not rated yet")}</span>}
                  </span>
                </button>
                <BuyLink book={book} tag={tag} />
              </li>
            );
          })}
        </ul>
      </section>

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

function BuyLink({ book, tag, primary = false }: { book: Book; tag: string; primary?: boolean }) {
  const t = useT();
  return (
    <a
      className={`button library-buy${primary ? " primary" : ""}`}
      href={amazonUrl(book, tag)}
      target="_blank"
      rel="sponsored noopener noreferrer"
      aria-label={t("Buy {title} on Amazon (opens in a new tab)", { title: book.title })}
    >
      {t("Buy on Amazon")}
      <ExternalLink size={13} aria-hidden="true" />
    </a>
  );
}

/** The Open Library cover, or the title on a plain tile when there is no picture. */
function BookCover({ book, size = "M" }: { book: Book; size?: "S" | "M" | "L" }) {
  const t = useT();
  const [failed, setFailed] = useState(false);
  const label = t("Cover of {title}", { title: book.title });
  if (failed) {
    return (
      <span className={`library-cover library-cover-${size} library-cover-fallback`} role="img" aria-label={label}>
        <span>{book.title}</span>
      </span>
    );
  }
  return (
    // Covers come from Open Library at their own sizes.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={`library-cover library-cover-${size}`}
      src={coverUrl(book, size === "S" ? "M" : size)}
      alt={label}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

/** An average rating as five stars plus the number, e.g. "4.3 (12)". */
function Stars({ rating }: { rating: BookRating }) {
  const t = useT();
  const average = rating.average.toFixed(1);
  return (
    <StarRow
      value={rating.average}
      label={
        rating.count === 1
          ? t("Rated {average} out of 5 by 1 reader", { average })
          : t("Rated {average} out of 5 by {count} readers", { average, count: rating.count })
      }
      text={`${average} (${rating.count})`}
    />
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
  comments: { stars: number; comment: string; date: string }[];
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
            <span className="library-topic">{t(TOPIC_LABELS[book.topic])}</span>
            <p>{t(book.description)}</p>
            {rating ? <Stars rating={rating} /> : <p className="muted">{t("Not rated yet")}</p>}
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
              <fieldset className="library-star-input">
                <legend className="sr-only">{t("Your rating")}</legend>
                {[1, 2, 3, 4, 5].map((value) => (
                  <label key={value} className={value <= stars ? "on" : ""}>
                    <input
                      type="radio"
                      name={`stars-${book.id}`}
                      value={value}
                      checked={stars === value}
                      onChange={() => setStars(value)}
                      aria-label={t("Rate {stars} out of 5", { stars: value })}
                    />
                    <Star size={26} aria-hidden="true" />
                  </label>
                ))}
              </fieldset>
              <label className="library-comment">
                {t("Comment (optional)")}
                <textarea
                  value={comment}
                  maxLength={COMMENT_MAX}
                  rows={3}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder={t("What did you take away from it?")}
                />
                <small className="muted">
                  {t("{used} of {max} characters", { used: comment.length, max: COMMENT_MAX })}
                </small>
              </label>
              {error && <p className="alert" role="alert">{error}</p>}
              {notice && <p className="notice" role="status">{notice}</p>}
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
          {!ratingOpen && notice && <p className="notice" role="status">{notice}</p>}
        </section>

        <section className="library-comments" aria-labelledby="library-comments-title">
          <h3 id="library-comments-title">{t("What readers say")}</h3>
          {comments.length ? (
            <ul>
              {comments.map((item, index) => (
                <li key={`${item.date}-${index}`}>
                  <StarRow value={item.stars} label={t("Rated {stars} out of 5", { stars: item.stars })} />
                  <p>{item.comment}</p>
                  {item.date && <time dateTime={item.date} className="muted">{item.date}</time>}
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
