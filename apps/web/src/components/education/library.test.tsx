// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));

import { api } from "@/lib/api";
import type { Book, BookRatings } from "@/lib/books";
import { Library } from "./library";

function book(id: string, title: string, extra: Partial<Book> = {}): Book {
  return {
    id,
    title,
    author: `Author of ${title}`,
    isbn: null,
    amazon_url: null,
    cover_url: null,
    description: `About ${title}.`,
    topic: "Money basics",
    sort_order: 0,
    ...extra,
  };
}

const BOOKS: Book[] = [
  book("simple-path", "The Simple Path to Wealth", { isbn: "1533667926" }),
  book("psychology", "The Psychology of Money", { isbn: "0857197681" }),
  book("die-with-zero", "Die With Zero", { amazon_url: "https://www.amazon.de/dp/0358099765" }),
  book("no-link", "A Book Without Links"),
  ...["b5", "b6", "b7"].map((id) => book(id, `Book ${id}`)),
];

let ratings: BookRatings;
let failSave = false;

function cards() {
  return within(screen.getByRole("list", { name: "Books" })).getAllByRole("listitem");
}

describe("Library", () => {
  beforeEach(() => {
    failSave = false;
    ratings = {
      ratings: {
        "die-with-zero": { average: 4.5, count: 2 },
        psychology: { average: 5, count: 3 },
      },
      mine: {},
      comments: { psychology: [{ stars: 5, comment: "Changed how I save.", date: "2026-10-26" }] },
    };
    vi.mocked(api).mockReset();
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/books") return BOOKS;
      if (path === "/api/settings") return { amazon_affiliate_tag: "stockbuddy-20" };
      if (path === "/api/books/ratings") return ratings;
      const match = path.match(/^\/api\/books\/([a-z0-9-]+)\/review$/);
      if (match && init?.method === "PUT") {
        if (failSave) throw new Error("Book not found");
        const body = JSON.parse(String(init.body));
        // The server's view after the save: a new average that moves the book up.
        ratings = {
          ...ratings,
          ratings: { ...ratings.ratings, [match[1]]: { average: body.stars, count: 1 } },
          mine: { ...ratings.mine, [match[1]]: body },
        };
        return { book_id: match[1], ...body };
      }
      if (match && init?.method === "DELETE") {
        const rest = { ...ratings.ratings };
        delete rest[match[1]];
        const mine = { ...ratings.mine };
        delete mine[match[1]];
        ratings = { ...ratings, ratings: rest, mine };
        return undefined;
      }
      throw new Error(`unexpected ${path}`);
    });
  });
  afterEach(cleanup);

  it("shows one list sorted by rating with #1–#5 badges only on rated books", async () => {
    render(<Library />);
    await waitFor(() => expect(cards()[0].getAttribute("aria-label")).toBe("The Psychology of Money"));
    const order = cards().map((card) => card.getAttribute("aria-label"));
    expect(order).toEqual([
      "The Psychology of Money",
      "Die With Zero",
      "The Simple Path to Wealth",
      "A Book Without Links",
      "Book b5",
      "Book b6",
      "Book b7",
    ]);
    expect(cards()[0].textContent).toContain("#1");
    expect(within(cards()[0]).getByText("Number 1 by readers' rating")).toBeTruthy();
    expect(cards()[1].textContent).toContain("#2");
    expect(cards()[2].textContent).not.toMatch(/#\d/);
    expect(screen.queryByText("Our picks")).toBeNull();
    expect(within(cards()[0]).getByLabelText("Rated 5.0 out of 5 by 3 readers")).toBeTruthy();
  });

  it("builds Amazon links from the admin's link or the ISBN, and hides Buy without either", async () => {
    render(<Library />);
    await screen.findByText("#1");
    const card = (title: string) => cards().find((item) => item.getAttribute("aria-label") === title)!;
    const buy = (title: string) => within(card(title)).queryByRole("link", { name: /Buy .* on Amazon/ });
    await waitFor(() => expect(buy("The Simple Path to Wealth")?.getAttribute("href")).toBe("https://www.amazon.com/dp/1533667926?tag=stockbuddy-20"));
    expect(buy("Die With Zero")?.getAttribute("href")).toBe("https://www.amazon.de/dp/0358099765?tag=stockbuddy-20");
    expect(buy("Die With Zero")?.getAttribute("rel")).toBe("sponsored noopener noreferrer");
    expect(buy("Die With Zero")?.getAttribute("target")).toBe("_blank");
    expect(buy("A Book Without Links")).toBeNull();
    // No ISBN and no cover link: the title tile stands in for the cover.
    expect(within(card("A Book Without Links")).getByRole("img", { name: "Cover of A Book Without Links" }).tagName).toBe("SPAN");
    const cover = within(card("The Simple Path to Wealth")).getByRole("img", { name: "Cover of The Simple Path to Wealth" });
    expect(cover.getAttribute("loading")).toBe("lazy");
    expect(screen.getByText("As an Amazon Associate, MyPortfolioBuddy earns from qualifying purchases.")).toBeTruthy();
  });

  it("rates a book straight from its card, re-sorts it, and removes the rating", async () => {
    render(<Library />);
    await screen.findByText("#1");
    const simple = () => cards().find((item) => item.getAttribute("aria-label") === "The Simple Path to Wealth")!;
    const five = within(simple()).getByRole("radio", { name: "Rate 5 out of 5" });
    expect(within(simple()).getByRole("group", { name: "Rate The Simple Path to Wealth" })).toBeTruthy();
    fireEvent.click(five);
    expect(five).toHaveProperty("checked", true); // shown at once, saved a moment later

    await waitFor(() =>
      expect(api).toHaveBeenCalledWith("/api/books/simple-path/review", {
        method: "PUT",
        body: JSON.stringify({ stars: 5, comment: null }),
      }),
    );
    // 5.0 from one reader ties Psychology of Money on average, so it ranks after (fewer ratings).
    await waitFor(() => expect(simple().textContent).toContain("#2"));
    expect(within(simple()).getByText("Rating saved")).toBeTruthy();

    fireEvent.click(within(simple()).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(api).toHaveBeenCalledWith("/api/books/simple-path/review", { method: "DELETE" }));
    await waitFor(() => expect(simple().textContent).not.toContain("#2"));
    expect(within(simple()).getByRole("radio", { name: "Rate 5 out of 5" })).toHaveProperty("checked", false);
  });

  it("shows a card error when saving fails", async () => {
    failSave = true;
    render(<Library />);
    await screen.findByText("#1");
    const card = cards().find((item) => item.getAttribute("aria-label") === "Book b7")!;
    fireEvent.click(within(card).getByRole("radio", { name: "Rate 3 out of 5" }));
    expect(await within(card).findByText("Book not found")).toBeTruthy();
  });

  it("opens the dialog from the title for comments and a rating with a comment", async () => {
    render(<Library />);
    await screen.findByText("#1");
    fireEvent.click(screen.getByRole("button", { name: "The Psychology of Money" }));
    const dialog = screen.getByRole("dialog", { name: "The Psychology of Money" });
    expect(within(dialog).getByText("Changed how I save.")).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "I've read it — rate it" }));
    fireEvent.click(within(dialog).getByRole("radio", { name: "Rate 4 out of 5" }));
    fireEvent.change(within(dialog).getByLabelText(/Comment/), { target: { value: "  Short and wise.  " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save rating" }));
    expect(await within(dialog).findByText("Your rating is saved.")).toBeTruthy();
    expect(api).toHaveBeenCalledWith("/api/books/psychology/review", {
      method: "PUT",
      body: JSON.stringify({ stars: 4, comment: "Short and wise." }),
    });

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says so when the books can't be loaded", async () => {
    vi.mocked(api).mockRejectedValue(new Error("offline"));
    render(<Library />);
    expect(await screen.findByText("Books are unavailable right now.")).toBeTruthy();
  });
});
