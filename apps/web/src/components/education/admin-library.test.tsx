// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));

import { api } from "@/lib/api";
import type { AdminBook } from "@/lib/books";
import { AdminLibrary } from "./admin-library";

function book(id: string, title: string, extra: Partial<AdminBook> = {}): AdminBook {
  return {
    id,
    title,
    author: "Someone",
    isbn: null,
    amazon_url: null,
    cover_url: null,
    description: "",
    topic: "",
    sort_order: 0,
    average: null,
    count: 0,
    ...extra,
  };
}

let rows: AdminBook[];

describe("AdminLibrary", () => {
  beforeEach(() => {
    rows = [
      book("psychology", "The Psychology of Money", { isbn: "0857197681", average: 4.5, count: 2 }),
      book("die-with-zero", "Die With Zero", { amazon_url: "https://www.amazon.com/dp/0358099765" }),
    ];
    vi.mocked(api).mockReset();
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      if (path === "/api/admin/books" && !init) return rows;
      if (path === "/api/admin/books" && init?.method === "POST") {
        if (body.isbn === "123") throw new Error("ISBN must be 10 or 13 digits (the last of 10 may be X)");
        return book("new-book", body.title, { ...body, sort_order: 2 });
      }
      if (path === "/api/admin/books/order") {
        rows = body.ids.map((id: string) => rows.find((row) => row.id === id)!);
        return rows;
      }
      if (path.startsWith("/api/admin/books/") && init?.method === "PUT") {
        return { ...rows.find((row) => path.endsWith(row.id))!, ...body };
      }
      if (path.startsWith("/api/admin/books/") && init?.method === "DELETE") return undefined;
      if (path === "/api/admin/library") return { amazon_affiliate_tag: body.amazon_affiliate_tag };
      throw new Error(`unexpected ${path}`);
    });
  });
  afterEach(cleanup);

  it("lists the books with their links and ratings", async () => {
    render(<AdminLibrary initialTag="" onTagSaved={vi.fn()} />);
    const table = await screen.findByRole("table");
    const [, first, second] = within(table).getAllByRole("row");
    expect(within(first).getByRole("rowheader").textContent).toBe("The Psychology of Money");
    expect(first.textContent).toContain("ISBN 0857197681");
    expect(first.textContent).toContain("4.5 from 2");
    expect(within(second).getByRole("link", { name: /Amazon link/ }).getAttribute("href")).toBe(
      "https://www.amazon.com/dp/0358099765",
    );
    expect(second.textContent).toContain("Not rated yet");
    expect(within(first).getByRole("button", { name: "Move The Psychology of Money up" })).toHaveProperty("disabled", true);
  });

  it("adds a book, showing the server's error in red first", async () => {
    render(<AdminLibrary initialTag="" onTagSaved={vi.fn()} />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Add book" }));
    const dialog = screen.getByRole("dialog", { name: "Add book" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add book" }));
    expect(within(dialog).getByRole("alert").textContent).toBe("Give the book a title.");

    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "One Up On Wall Street" } });
    fireEvent.change(within(dialog).getByLabelText("Author"), { target: { value: "Peter Lynch" } });
    fireEvent.change(within(dialog).getByLabelText("ISBN"), { target: { value: "123" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add book" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("ISBN must be 10 or 13 digits");
    expect(alert.className).toContain("alert");

    fireEvent.change(within(dialog).getByLabelText("ISBN"), { target: { value: "0743200403" } });
    fireEvent.change(within(dialog).getByLabelText(/Topic/), { target: { value: "Stock picking" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add book" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const post = vi.mocked(api).mock.calls.filter(([, init]) => init?.method === "POST").at(-1)!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({
      title: "One Up On Wall Street",
      author: "Peter Lynch",
      isbn: "0743200403",
      amazon_url: null,
      cover_url: null,
      topic: "Stock picking",
      description: "",
    });
    expect(screen.getByRole("rowheader", { name: "One Up On Wall Street" })).toBeTruthy();
  });

  it("edits, reorders, and removes a book after confirming", async () => {
    render(<AdminLibrary initialTag="" onTagSaved={vi.fn()} />);
    await screen.findByRole("table");

    fireEvent.click(screen.getByRole("button", { name: "Edit Die With Zero" }));
    const dialog = screen.getByRole("dialog", { name: "Edit book" });
    expect(within(dialog).getByLabelText(/Amazon link/)).toHaveProperty("value", "https://www.amazon.com/dp/0358099765");
    fireEvent.change(within(dialog).getByLabelText("Author"), { target: { value: "Bill Perkins" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save book" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(vi.mocked(api)).toHaveBeenCalledWith("/api/admin/books/die-with-zero", expect.objectContaining({ method: "PUT" }));
    expect(screen.getByText("Bill Perkins")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Move Die With Zero up" }));
    await waitFor(() => expect(screen.getAllByRole("rowheader")[0].textContent).toBe("Die With Zero"));
    expect(vi.mocked(api)).toHaveBeenCalledWith("/api/admin/books/order", {
      method: "PUT",
      body: JSON.stringify({ ids: ["die-with-zero", "psychology"] }),
    });

    fireEvent.click(screen.getByRole("button", { name: "Remove The Psychology of Money" }));
    const confirm = screen.getByRole("alertdialog", { name: "Remove The Psychology of Money?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Keep book" }));
    expect(screen.getByRole("rowheader", { name: "The Psychology of Money" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove The Psychology of Money" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Remove book" }));
    await waitFor(() => expect(screen.queryByRole("rowheader", { name: "The Psychology of Money" })).toBeNull());
    expect(vi.mocked(api)).toHaveBeenCalledWith("/api/admin/books/psychology", { method: "DELETE" });
  });

  it("saves the affiliate tag in the Library section", async () => {
    const onTagSaved = vi.fn();
    render(<AdminLibrary initialTag="old-20" onTagSaved={onTagSaved} />);
    const field = screen.getByLabelText(/Amazon affiliate tag/);
    expect(field).toHaveProperty("value", "old-20");
    fireEvent.change(field, { target: { value: "bad tag!" } });
    fireEvent.click(screen.getByRole("button", { name: "Save tag" }));
    expect(screen.getByRole("alert").textContent).toContain("at most 64 letters, digits, or hyphens");
    fireEvent.change(field, { target: { value: "stockbuddy-20" } });
    fireEvent.click(screen.getByRole("button", { name: "Save tag" }));
    expect(await screen.findByText("Affiliate tag saved.")).toBeTruthy();
    expect(onTagSaved).toHaveBeenCalledWith("stockbuddy-20");
  });
});
