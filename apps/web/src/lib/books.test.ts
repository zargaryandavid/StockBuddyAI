import { describe, expect, it } from "vitest";

import { amazonUrl, coverUrl, isbn10, rankBooks, type Book } from "./books";

function book(id: string, extra: Partial<Book> = {}): Book {
  return { id, title: id, author: "A", isbn: null, amazon_url: null, cover_url: null, description: "", topic: "", sort_order: 0, ...extra };
}

const LIST = ["a", "b", "c", "d", "e", "f", "g", "h"].map((id) => book(id));

describe("rankBooks", () => {
  it("keeps the admin's order and gives no badges while nothing is rated", () => {
    const ranked = rankBooks(LIST, {});
    expect(ranked.map((item) => item.book.id)).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(ranked.every((item) => item.rank === null)).toBe(true);
  });

  it("puts rated books first by average, then count, then admin order, and badges the top 5", () => {
    const ranked = rankBooks(LIST, {
      h: { average: 5, count: 1 },
      g: { average: 4.5, count: 9 },
      c: { average: 4.5, count: 2 },
      f: { average: 4, count: 3 },
      b: { average: 4, count: 3 },
      e: { average: 2, count: 1 },
      d: { average: 0, count: 0 },
    });
    expect(ranked.map((item) => item.book.id)).toEqual(["h", "g", "c", "b", "f", "e", "a", "d"]);
    expect(ranked.map((item) => item.rank)).toEqual([1, 2, 3, 4, 5, null, null, null]);
    expect(ranked.find((item) => item.book.id === "d")?.rating).toBeNull();
  });

  it("badges only rated books when fewer than five have ratings", () => {
    const ranked = rankBooks(LIST, { e: { average: 3, count: 1 }, b: { average: 4, count: 1 } });
    expect(ranked.map((item) => item.book.id)).toEqual(["b", "e", "a", "c", "d", "f", "g", "h"]);
    expect(ranked.map((item) => item.rank)).toEqual([1, 2, null, null, null, null, null, null]);
  });
});

describe("Amazon links and covers", () => {
  it("converts 978 ISBN-13s to ISBN-10", () => {
    expect(isbn10("9780857197689")).toBe("0857197681");
    expect(isbn10("978-1-55860-832-9")).toBe("155860832X");
    expect(isbn10("0857197681")).toBe("0857197681");
    expect(isbn10("9790000000001")).toBeNull();
    expect(isbn10(null)).toBeNull();
  });

  it("uses the admin's link (adding the tag), else the ISBN, else no link", () => {
    const own = { isbn: "0857197681", amazon_url: "https://www.amazon.co.uk/dp/0857197681" };
    expect(amazonUrl(own, "stockbuddy-20")).toBe("https://www.amazon.co.uk/dp/0857197681?tag=stockbuddy-20");
    expect(amazonUrl({ ...own, amazon_url: "https://www.amazon.com/dp/X?tag=theirs" }, "stockbuddy-20")).toBe(
      "https://www.amazon.com/dp/X?tag=theirs",
    );
    expect(amazonUrl(own, "")).toBe("https://www.amazon.co.uk/dp/0857197681");
    expect(amazonUrl({ isbn: "9780857197689", amazon_url: null }, "stockbuddy-20")).toBe(
      "https://www.amazon.com/dp/0857197681?tag=stockbuddy-20",
    );
    expect(amazonUrl({ isbn: "0857197681", amazon_url: null }, "bad&tag=x")).toBe("https://www.amazon.com/dp/0857197681");
    expect(amazonUrl({ isbn: null, amazon_url: null }, "stockbuddy-20")).toBeNull();
  });

  it("uses the admin's cover, else the Open Library cover, else none", () => {
    expect(coverUrl({ isbn: "0857197681", cover_url: "https://m.media-amazon.com/x.jpg" })).toBe("https://m.media-amazon.com/x.jpg");
    expect(coverUrl({ isbn: "0857197681", cover_url: null })).toBe(
      "https://covers.openlibrary.org/b/isbn/0857197681-M.jpg?default=false",
    );
    expect(coverUrl({ isbn: null, cover_url: null })).toBeNull();
  });
});
