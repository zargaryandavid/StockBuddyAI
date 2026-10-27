/**
 * The Education Library: recommended personal-finance and investing books.
 *
 * Ids are stable (ratings are stored against them) and mirrored in the API's
 * stockbuddy/books.py BOOK_IDS. ISBN-10s are print editions, checked against Open Library,
 * and double as the Amazon ASIN for the "Buy on Amazon" link.
 */

export type BookTopic = "index-investing" | "value-investing" | "stock-picking" | "mindset" | "financial-independence" | "money-basics";

export type Book = {
  id: string;
  title: string;
  author: string;
  isbn10: string;
  /** One sentence in our own words, translated in the UI. */
  description: string;
  topic: BookTopic;
};

/** English topic labels; shown through t(). */
export const TOPIC_LABELS: Record<BookTopic, string> = {
  "index-investing": "Index investing",
  "value-investing": "Value investing",
  "stock-picking": "Stock picking",
  mindset: "Money mindset",
  "financial-independence": "Financial independence",
  "money-basics": "Money basics",
};

/** In curated order: this is also the "Our picks" order until readers rate books. */
export const BOOK_CATALOG: Book[] = [
  {
    id: "simple-path-to-wealth",
    title: "The Simple Path to Wealth",
    author: "JL Collins",
    isbn10: "1533667926",
    description: "A plain-spoken case for spending less than you earn, avoiding debt, and putting the rest in a broad stock index fund.",
    topic: "financial-independence",
  },
  {
    id: "psychology-of-money",
    title: "The Psychology of Money",
    author: "Morgan Housel",
    isbn10: "0857197681",
    description: "Short stories showing that how we behave with money matters more than how much finance we know.",
    topic: "mindset",
  },
  {
    id: "little-book-common-sense-investing",
    title: "The Little Book of Common Sense Investing",
    author: "John C. Bogle",
    isbn10: "1119404509",
    description: "The founder of Vanguard explains why owning the whole market at low cost beats trying to outguess it.",
    topic: "index-investing",
  },
  {
    id: "intelligent-investor",
    title: "The Intelligent Investor",
    author: "Benjamin Graham",
    isbn10: "0060555661",
    description: "The classic guide to treating stocks as parts of real businesses and always keeping a margin of safety.",
    topic: "value-investing",
  },
  {
    id: "random-walk-down-wall-street",
    title: "A Random Walk Down Wall Street",
    author: "Burton G. Malkiel",
    isbn10: "0393358380",
    description: "A tour of market history and theory that ends with a practical, low-cost plan for ordinary investors.",
    topic: "index-investing",
  },
  {
    id: "bogleheads-guide-to-investing",
    title: "The Bogleheads' Guide to Investing",
    author: "Taylor Larimore, Mel Lindauer and Michael LeBoeuf",
    isbn10: "1118921283",
    description: "A step-by-step handbook for building a simple, diversified portfolio and leaving it alone.",
    topic: "index-investing",
  },
  {
    id: "your-money-or-your-life",
    title: "Your Money or Your Life",
    author: "Vicki Robin and Joe Dominguez",
    isbn10: "0143115766",
    description: "A nine-step program for measuring what your spending really costs in hours of your life.",
    topic: "financial-independence",
  },
  {
    id: "millionaire-next-door",
    title: "The Millionaire Next Door",
    author: "Thomas J. Stanley and William D. Danko",
    isbn10: "1589795474",
    description: "Research on real American millionaires, who mostly live modestly and build wealth quietly over decades.",
    topic: "money-basics",
  },
  {
    id: "i-will-teach-you-to-be-rich",
    title: "I Will Teach You to Be Rich",
    author: "Ramit Sethi",
    isbn10: "1523505745",
    description: "A six-week plan to automate your saving and investing so you can spend guilt-free on what you love.",
    topic: "money-basics",
  },
  {
    id: "die-with-zero",
    title: "Die With Zero",
    author: "Bill Perkins",
    isbn10: "0358099765",
    description: "An argument for spending your money on experiences while you can enjoy them, not hoarding it forever.",
    topic: "mindset",
  },
  {
    id: "one-up-on-wall-street",
    title: "One Up On Wall Street",
    author: "Peter Lynch",
    isbn10: "0743200403",
    description: "A legendary fund manager shows how everyday observations can lead you to promising companies.",
    topic: "stock-picking",
  },
  {
    id: "common-stocks-uncommon-profits",
    title: "Common Stocks and Uncommon Profits",
    author: "Philip A. Fisher",
    isbn10: "0471445509",
    description: "Fifteen questions for finding outstanding growth companies worth holding for many years.",
    topic: "stock-picking",
  },
  {
    id: "security-analysis",
    title: "Security Analysis",
    author: "Benjamin Graham and David Dodd",
    isbn10: "0071592539",
    description: "The deep, technical textbook on valuing stocks and bonds from their financial statements.",
    topic: "value-investing",
  },
  {
    id: "rich-dad-poor-dad",
    title: "Rich Dad Poor Dad",
    author: "Robert T. Kiyosaki",
    isbn10: "1612680194",
    description: "A story-driven push to think about assets that earn income rather than a paycheck alone.",
    topic: "mindset",
  },
  {
    id: "richest-man-in-babylon",
    title: "The Richest Man in Babylon",
    author: "George S. Clason",
    isbn10: "0451205367",
    description: "Old-fashioned parables about paying yourself first and letting savings work for you.",
    topic: "money-basics",
  },
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

/** The book's Amazon page, with the admin's Associates tag when one is set. */
export function amazonUrl(book: Pick<Book, "isbn10">, tag?: string | null) {
  const base = `https://www.amazon.com/dp/${book.isbn10}`;
  const clean = (tag ?? "").trim();
  return AFFILIATE_TAG.test(clean) ? `${base}?tag=${encodeURIComponent(clean)}` : base;
}

/** Open Library's cover for the edition. */
export function coverUrl(book: Pick<Book, "isbn10">, size: "S" | "M" | "L" = "M") {
  return `https://covers.openlibrary.org/b/isbn/${book.isbn10}-${size}.jpg?default=false`;
}

export type TopBook = { book: Book; rating: BookRating | null; pick: boolean };

/**
 * The library's Top 5: rated books by average (ties by number of ratings, then the curated
 * order), topped up from the curated order when fewer than `size` books have ratings.
 * `byReaders` is false until anyone has rated a book, so the list can be called "Our picks".
 */
export function topBooks(
  ratings: Record<string, BookRating>,
  catalog: Book[] = BOOK_CATALOG,
  size = 5,
): { books: TopBook[]; byReaders: boolean } {
  const rated = catalog
    .map((book, order) => ({ book, order, rating: ratings[book.id] }))
    .filter((item): item is { book: Book; order: number; rating: BookRating } => Boolean(item.rating && item.rating.count > 0))
    .sort((a, b) => b.rating.average - a.rating.average || b.rating.count - a.rating.count || a.order - b.order)
    .slice(0, size)
    .map(({ book, rating }) => ({ book, rating, pick: false }));
  const chosen = new Set(rated.map((item) => item.book.id));
  const picks = catalog
    .filter((book) => !chosen.has(book.id))
    .slice(0, Math.max(0, size - rated.length))
    .map((book) => ({ book, rating: null, pick: true }));
  return { books: [...rated, ...picks], byReaders: rated.length > 0 };
}
