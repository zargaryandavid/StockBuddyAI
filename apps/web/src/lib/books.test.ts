import { describe, expect, it } from "vitest";

import { BOOK_CATALOG, amazonUrl, coverUrl, topBooks } from "./books";

const ids = (result: ReturnType<typeof topBooks>) => result.books.map((item) => item.book.id);

describe("book catalog", () => {
  it("has unique slug ids and 10-character ISBNs", () => {
    const seen = new Set(BOOK_CATALOG.map((book) => book.id));
    expect(seen.size).toBe(BOOK_CATALOG.length);
    for (const book of BOOK_CATALOG) {
      expect(book.id).toMatch(/^[a-z0-9-]{1,60}$/);
      expect(book.isbn10).toMatch(/^\d{9}[\dX]$/);
      expect(book.description.length).toBeGreaterThan(20);
    }
  });

  it("links to Amazon with the tag only when one is set and valid", () => {
    const book = { isbn10: "0857197681" };
    expect(amazonUrl(book, "stockbuddy-20")).toBe("https://www.amazon.com/dp/0857197681?tag=stockbuddy-20");
    expect(amazonUrl(book, "")).toBe("https://www.amazon.com/dp/0857197681");
    expect(amazonUrl(book)).toBe("https://www.amazon.com/dp/0857197681");
    expect(amazonUrl(book, "bad&tag=x")).toBe("https://www.amazon.com/dp/0857197681");
    expect(coverUrl(book)).toBe("https://covers.openlibrary.org/b/isbn/0857197681-M.jpg?default=false");
  });
});

describe("topBooks", () => {
  it("uses the curated order as 'Our picks' while nothing is rated", () => {
    const result = topBooks({});
    expect(result.byReaders).toBe(false);
    expect(ids(result)).toEqual(BOOK_CATALOG.slice(0, 5).map((book) => book.id));
    expect(result.books.every((item) => item.pick && item.rating === null)).toBe(true);
  });

  it("orders by average, then by number of ratings, then curated order", () => {
    const result = topBooks({
      "die-with-zero": { average: 4.5, count: 2 },
      "security-analysis": { average: 4.5, count: 9 },
      "rich-dad-poor-dad": { average: 3, count: 40 },
      "one-up-on-wall-street": { average: 5, count: 1 },
      "millionaire-next-door": { average: 4, count: 3 },
      "intelligent-investor": { average: 4, count: 3 },
      "psychology-of-money": { average: 2, count: 1 },
    });
    expect(result.byReaders).toBe(true);
    expect(ids(result)).toEqual([
      "one-up-on-wall-street",
      "security-analysis",
      "die-with-zero",
      // equal average and count: curated order decides
      "intelligent-investor",
      "millionaire-next-door",
    ]);
    expect(result.books.some((item) => item.pick)).toBe(false);
  });

  it("fills up with curated picks when fewer than five books are rated, skipping zero counts", () => {
    const result = topBooks({
      "richest-man-in-babylon": { average: 3.5, count: 2 },
      "simple-path-to-wealth": { average: 4, count: 1 },
      "die-with-zero": { average: 0, count: 0 },
    });
    expect(ids(result)).toEqual([
      "simple-path-to-wealth",
      "richest-man-in-babylon",
      "psychology-of-money",
      "little-book-common-sense-investing",
      "intelligent-investor",
    ]);
    expect(result.books.map((item) => item.pick)).toEqual([false, false, true, true, true]);
  });
});
