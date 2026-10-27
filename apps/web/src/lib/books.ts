/**
 * The Education Library: types and helpers for the admin-managed book list (public.books,
 * served by GET /api/books) and readers' ratings.
 */

export type Book = {
  id: string;
  title: string;
  author: string;
  /** ISBN-10 or ISBN-13, digits only (an ISBN-10 may end in X). */
  isbn: string | null;
  /** The admin's own Amazon link; otherwise one is built from the ISBN. */
  amazon_url: string | null;
  cover_url: string | null;
  /** English text, shown through t() so the starting books read in Armenian too. */
  description: string;
  /** English topic label, shown through t(). */
  topic: string;
  sort_order: number;
};

/** A book in Admin, with its readers' average. */
export type AdminBook = Book & { average: number | null; count: number };

/** Topic suggestions for Admin; they have Armenian translations. Any other text is allowed. */
export const BOOK_TOPICS = [
  "Index investing",
  "Value investing",
  "Stock picking",
  "Money mindset",
  "Financial independence",
  "Money basics",
];

export type BookRating = { average: number; count: number };
export type MyReview = { stars: number; comment: string | null };
export type ReaderComment = { stars: number; comment: string; date: string };
export type BookRatings = {
  ratings: Record<string, BookRating>;
  mine: Record<string, MyReview>;
  comments: Record<string, ReaderComment[]>;
};

/** An Amazon Associates tag: letters, digits, and hyphens only. */
const AFFILIATE_TAG = /^[A-Za-z0-9-]{1,64}$/;

/** The ISBN-10 for an ISBN-10, or for an ISBN-13 that starts with 978; otherwise null. */
export function isbn10(isbn: string | null | undefined): string | null {
  const value = (isbn ?? "").replace(/[\s-]/g, "").toUpperCase();
  if (/^\d{9}[\dX]$/.test(value)) return value;
  if (!/^978\d{10}$/.test(value)) return null;
  const core = value.slice(3, 12);
  const sum = [...core].reduce((total, digit, index) => total + (10 - index) * Number(digit), 0);
  const check = (11 - (sum % 11)) % 11;
  return `${core}${check === 10 ? "X" : check}`;
}

/**
 * Where "Buy on Amazon" goes: the admin's Amazon link (with the Associates tag added when it
 * has none), else the Amazon page for the ISBN-10, else null (no button).
 */
export function amazonUrl(book: Pick<Book, "isbn" | "amazon_url">, tag?: string | null): string | null {
  const clean = (tag ?? "").trim();
  const useTag = AFFILIATE_TAG.test(clean);
  if (book.amazon_url) {
    try {
      const url = new URL(book.amazon_url);
      if (url.protocol !== "https:") return null;
      if (useTag && !url.searchParams.has("tag")) url.searchParams.set("tag", clean);
      return url.toString();
    } catch {
      return null;
    }
  }
  const asin = isbn10(book.isbn);
  if (!asin) return null;
  const base = `https://www.amazon.com/dp/${asin}`;
  return useTag ? `${base}?tag=${encodeURIComponent(clean)}` : base;
}

/** The admin's cover link, else Open Library's cover for the ISBN, else null (title tile). */
export function coverUrl(book: Pick<Book, "isbn" | "cover_url">, size: "S" | "M" | "L" = "M"): string | null {
  if (book.cover_url) return book.cover_url;
  const isbn = (book.isbn ?? "").replace(/[\s-]/g, "");
  return isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-${size}.jpg?default=false` : null;
}

export type RankedBook = { book: Book; rating: BookRating | null; rank: number | null };

/**
 * One list for the Library: rated books first by average (ties by number of ratings, then
 * the admin's order), then unrated books in the admin's order. The first five rated books
 * get a rank (1–5) for their badge.
 */
export function rankBooks(books: Book[], ratings: Record<string, BookRating>, badges = 5): RankedBook[] {
  const items = books.map((book, order) => {
    const rating = ratings[book.id];
    return { book, order, rating: rating && rating.count > 0 ? rating : null };
  });
  const rated = items
    .filter((item) => item.rating)
    .sort(
      (a, b) =>
        b.rating!.average - a.rating!.average || b.rating!.count - a.rating!.count || a.order - b.order,
    );
  const unrated = items.filter((item) => !item.rating);
  return [
    ...rated.map(({ book, rating }, index) => ({ book, rating, rank: index < badges ? index + 1 : null })),
    ...unrated.map(({ book }) => ({ book, rating: null, rank: null })),
  ];
}
