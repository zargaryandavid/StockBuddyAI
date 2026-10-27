// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));

import { api } from "@/lib/api";
import { BOOK_CATALOG, type BookRatings } from "@/lib/books";
import { Library } from "./library";

let ratings: BookRatings;

describe("Library", () => {
  beforeEach(() => {
    ratings = {
      ratings: {
        "die-with-zero": { average: 4.5, count: 2 },
        "psychology-of-money": { average: 5, count: 3 },
      },
      mine: {},
      comments: {
        "psychology-of-money": [{ stars: 5, comment: "Changed how I save.", date: "2026-10-26" }],
      },
    };
    vi.mocked(api).mockReset();
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/settings") return { amazon_affiliate_tag: "stockbuddy-20" };
      if (path === "/api/books/ratings") return ratings;
      if (path === "/api/books/psychology-of-money/review" && init?.method === "PUT") {
        const body = JSON.parse(String(init.body));
        ratings = { ...ratings, mine: { "psychology-of-money": body } };
        return { book_id: "psychology-of-money", ...body };
      }
      if (path === "/api/books/psychology-of-money/review" && init?.method === "DELETE") {
        ratings = { ...ratings, mine: {} };
        return undefined;
      }
      throw new Error(`unexpected ${path}`);
    });
  });
  afterEach(cleanup);

  it("shows the readers' Top 5 topped up with picks, every book, and the Amazon disclosure", async () => {
    render(<Library />);

    const top = screen.getByRole("region", { name: /Our picks|Top 5 by readers/ });
    await within(top).findByRole("heading", { name: "Top 5 by readers" });
    const items = within(top).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0].textContent).toContain("The Psychology of Money");
    expect(items[1].textContent).toContain("Die With Zero");
    // Unrated books fill the rest in curated order and are marked as picks.
    expect(items[2].textContent).toContain("The Simple Path to Wealth");
    expect(items[2].textContent).toContain("Our pick");
    expect(within(items[0]).getByRole("img", { name: "Rated 5.0 out of 5 by 3 readers" })).toBeTruthy();

    const all = screen.getByRole("region", { name: "All books" });
    expect(within(all).getAllByRole("listitem")).toHaveLength(BOOK_CATALOG.length);
    const buy = within(all).getByRole("link", { name: "Buy The Psychology of Money on Amazon (opens in a new tab)" });
    await waitFor(() => expect(buy.getAttribute("href")).toBe("https://www.amazon.com/dp/0857197681?tag=stockbuddy-20"));
    expect(buy.getAttribute("target")).toBe("_blank");
    expect(buy.getAttribute("rel")).toBe("sponsored noopener noreferrer");
    expect(screen.getByText("As an Amazon Associate, StockBuddy earns from qualifying purchases.")).toBeTruthy();

    const cover = within(all).getByRole("img", { name: "Cover of The Psychology of Money" });
    expect(cover.getAttribute("loading")).toBe("lazy");
    fireEvent.error(cover);
    // A missing cover becomes a plain tile with the title.
    const fallback = within(all).getByRole("img", { name: "Cover of The Psychology of Money" });
    expect(fallback.tagName).toBe("SPAN");
    expect(fallback.textContent).toBe("The Psychology of Money");
  });

  it("calls the list 'Our picks' until anyone has rated a book", async () => {
    ratings = { ratings: {}, mine: {}, comments: {} };
    render(<Library />);
    const top = screen.getByRole("region", { name: "Our picks" });
    expect(await within(top).findByText("No ratings yet. Read one of these and be the first to rate it.")).toBeTruthy();
    expect(within(top).queryByText("Our pick")).toBeNull();
  });

  it("opens a book, rates it with the keyboard-accessible stars, and removes the rating", async () => {
    render(<Library />);
    const all = screen.getByRole("region", { name: "All books" });
    await screen.findByRole("heading", { name: "Top 5 by readers" });
    fireEvent.click(within(all).getByRole("button", { name: "The Psychology of Money by Morgan Housel" }));

    const dialog = screen.getByRole("dialog", { name: "The Psychology of Money" });
    expect(within(dialog).getByText("Changed how I save.")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: /Buy The Psychology of Money on Amazon/ })).toBeTruthy();

    fireEvent.click(within(dialog).getByRole("button", { name: "I've read it — rate it" }));
    const save = within(dialog).getByRole("button", { name: "Save rating" });
    expect(save).toHaveProperty("disabled", true);
    const four = within(dialog).getByRole("radio", { name: "Rate 4 out of 5" });
    fireEvent.click(four);
    expect(four).toHaveProperty("checked", true);
    fireEvent.change(within(dialog).getByLabelText(/Comment/), { target: { value: "  Short and wise.  " } });
    fireEvent.click(save);

    expect(await within(dialog).findByText("Your rating is saved.")).toBeTruthy();
    expect(api).toHaveBeenCalledWith("/api/books/psychology-of-money/review", {
      method: "PUT",
      body: JSON.stringify({ stars: 4, comment: "Short and wise." }),
    });

    fireEvent.click(await within(dialog).findByRole("button", { name: "Remove my rating" }));
    expect(await within(dialog).findByText("Your rating was removed.")).toBeTruthy();
    expect(api).toHaveBeenCalledWith("/api/books/psychology-of-money/review", { method: "DELETE" });
    expect(within(dialog).getByRole("button", { name: "I've read it — rate it" })).toBeTruthy();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("still lists the books with plain links when ratings and settings fail", async () => {
    vi.mocked(api).mockRejectedValue(new Error("offline"));
    render(<Library />);
    expect(await screen.findByText("Ratings are unavailable right now.")).toBeTruthy();
    const all = screen.getByRole("region", { name: "All books" });
    expect(within(all).getByRole("link", { name: /Buy The Intelligent Investor/ }).getAttribute("href")).toBe(
      "https://www.amazon.com/dp/0060555661",
    );
  });
});
