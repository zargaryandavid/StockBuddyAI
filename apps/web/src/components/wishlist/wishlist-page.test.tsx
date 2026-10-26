// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));

import { api } from "@/lib/api";
import { WishlistPage } from "./wishlist-page";

type Call = [string, string | undefined, unknown];

function mockApi(initial: Record<string, unknown>[], check?: (text: string) => unknown) {
  const calls: Call[] = [];
  let next = 1;
  vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push([path, init?.method, body]);
    if (path === "/api/wishes" && !init) return initial;
    if (path === "/api/wishes/check") return check ? check(body.text) : { source: "ai", matches: [] };
    if (path === "/api/wishes" && init?.method === "POST") return { id: `new-${next++}`, done: false, ...body };
    if (init?.method === "PATCH") return { ...body };
    return undefined;
  });
  return calls;
}

describe("WishlistPage", () => {
  afterEach(cleanup);

  it("keeps short-term, long-term, and want wishes in their own lists, tickable and editable", async () => {
    const calls = mockApi([
      { id: "s1", list: "short", text: "Week at the sea", done: false },
      { id: "l1", list: "long", text: "Buy an apartment", done: false },
    ]);
    render(<WishlistPage />);

    const short = await screen.findByRole("region", { name: "Short term" });
    const long = screen.getByRole("region", { name: "Long term" });
    expect(short.textContent).toContain("Within 1 year");
    expect(long.textContent).toContain("1–5 years");
    expect(within(short).getByText("Week at the sea")).toBeTruthy();
    expect(within(long).getByText("Buy an apartment")).toBeTruthy();

    fireEvent.change(within(long).getByLabelText("New long term wish"), { target: { value: "  Start a business " } });
    fireEvent.click(within(long).getByRole("button", { name: "Add" }));
    expect(await within(long).findByText("Start a business")).toBeTruthy();
    expect(calls.find(([path, method]) => path === "/api/wishes" && method === "POST")?.[2]).toEqual({
      list: "long",
      text: "Start a business",
    });

    // Ticking shows at once and saves; ticking again un-ticks.
    fireEvent.click(within(short).getByRole("checkbox", { name: 'Mark "Week at the sea" done' }));
    expect(within(short).getByText("1 of 1 done")).toBeTruthy();
    await waitFor(() =>
      expect(calls.some(([path, method, body]) => path === "/api/wishes/s1" && method === "PATCH" && (body as { done: boolean }).done)).toBe(true),
    );
    fireEvent.click(within(short).getByRole("checkbox", { name: 'Mark "Week at the sea" not done' }));
    await waitFor(() => expect(within(short).getByText("0 of 1 done")).toBeTruthy());

    // Editing the text of a wish.
    fireEvent.click(within(short).getByRole("button", { name: "Edit Week at the sea" }));
    const edit = within(short).getByLabelText("Edit Week at the sea");
    fireEvent.change(edit, { target: { value: "Two weeks at the sea" } });
    fireEvent.click(within(short).getByRole("button", { name: "Save wish" }));
    expect(await within(short).findByText("Two weeks at the sea")).toBeTruthy();
    expect(calls.at(-1)).toEqual(["/api/wishes/s1", "PATCH", { text: "Two weeks at the sea" }]);

    // The Want list sits beside them.
    const want = screen.getByRole("region", { name: "Want" });
    expect(want.textContent).toContain("Anytime");
    fireEvent.change(within(want).getByLabelText("New want wish"), { target: { value: "A good camera" } });
    fireEvent.click(within(want).getByRole("button", { name: "Add" }));
    expect(await within(want).findByText("A good camera")).toBeTruthy();
    expect(calls.at(-1)?.[2]).toEqual({ list: "want", text: "A good camera" });
  });

  it("checks each exercise wish for repeats and lets the user decide", async () => {
    const calls = mockApi(
      [
        { id: "e1", list: "exercise", text: "Visit Japan", done: false },
        { id: "e2", list: "exercise", text: "Learn the guitar", done: false },
      ],
      (text) =>
        text === "Become a guitar player"
          ? { source: "ai", matches: [{ id: "e2", text: "Learn the guitar", reason: "Both are about playing guitar" }] }
          : text === "visit japan"
            ? { source: "exact", matches: [{ id: "e1", text: "Visit Japan", reason: "Already on your list" }] }
            : { source: "ai", matches: [] },
    );
    render(<WishlistPage />);
    await screen.findByRole("region", { name: "Short term" });
    fireEvent.click(screen.getByRole("button", { name: "300 wishes" }));

    const exercise = screen.getByRole("region", { name: "300 wishes" });
    expect(exercise.textContent).toContain("2 / 300");
    expect(within(exercise).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("2");
    const input = within(exercise).getByLabelText("New wish");
    expect(input.getAttribute("placeholder")).toBe("Wish #3");

    // A repeat the AI finds: shown with its number and reason; the user may add it anyway.
    fireEvent.change(input, { target: { value: "Become a guitar player" } });
    fireEvent.click(within(exercise).getByRole("button", { name: "Add" }));
    const warning = await within(exercise).findByRole("status");
    expect(warning.textContent).toContain("This looks like a wish you already have");
    expect(warning.textContent).toContain("#2 Learn the guitar");
    expect(warning.textContent).toContain("Both are about playing guitar");
    expect(warning.textContent).toContain("Checked by AI.");
    expect(calls.some(([path, method]) => path === "/api/wishes" && method === "POST")).toBe(false);
    fireEvent.click(within(warning).getByRole("button", { name: "It's different, add anyway" }));
    expect(await within(exercise).findByText("Become a guitar player")).toBeTruthy();
    expect(exercise.textContent).toContain("3 / 300");

    // An exact repeat cannot be added.
    fireEvent.change(input, { target: { value: "visit japan" } });
    fireEvent.click(within(exercise).getByRole("button", { name: "Add" }));
    const exact = await within(exercise).findByRole("status");
    expect(exact.textContent).toContain("This wish is already on your list");
    expect(within(exact).queryByRole("button", { name: "It's different, add anyway" })).toBeNull();

    // A new wish goes straight in.
    fireEvent.change(input, { target: { value: "Swim with dolphins" } });
    fireEvent.click(within(exercise).getByRole("button", { name: "Add" }));
    expect(await within(exercise).findByText("Swim with dolphins")).toBeTruthy();
    expect(within(exercise).queryByRole("status")).toBeNull();
    expect(input).toHaveProperty("value", "");
    expect(exercise.textContent).not.toContain("AI repeat check isn't available");
  });

  it("says when the AI check could not run", async () => {
    mockApi([], () => ({ source: "basic", matches: [] }));
    render(<WishlistPage />);
    await screen.findByRole("region", { name: "Short term" });
    fireEvent.click(screen.getByRole("button", { name: "300 wishes" }));
    const exercise = screen.getByRole("region", { name: "300 wishes" });
    fireEvent.change(within(exercise).getByLabelText("New wish"), { target: { value: "Fly a plane" } });
    fireEvent.click(within(exercise).getByRole("button", { name: "Add" }));
    expect(await within(exercise).findByText("Fly a plane")).toBeTruthy();
    expect(exercise.textContent).toContain("The AI repeat check isn't available right now");
  });

  it("reorders a list by dragging or with the arrow keys and saves the order", async () => {
    const calls = mockApi([
      { id: "a", list: "short", text: "Alpha", done: false },
      { id: "b", list: "short", text: "Bravo", done: false },
      { id: "c", list: "short", text: "Charlie", done: false },
    ]);
    render(<WishlistPage />);
    const short = await screen.findByRole("region", { name: "Short term" });
    const order = () => within(short).getAllByRole("listitem").map((item) => item.textContent);
    expect(order()).toEqual(["Alpha", "Bravo", "Charlie"]);

    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: "", dropEffect: "" };
    const rows = within(short).getAllByRole("listitem");
    fireEvent.dragStart(within(short).getByRole("button", { name: /^Move Charlie/ }), { dataTransfer });
    fireEvent.dragOver(rows[0], { dataTransfer });
    expect(rows[0].className).toContain("drop-target");
    fireEvent.drop(rows[0], { dataTransfer });

    expect(order()).toEqual(["Charlie", "Alpha", "Bravo"]);
    await waitFor(() =>
      expect(calls.at(-1)).toEqual(["/api/wishes/order", "PUT", { list: "short", ids: ["c", "a", "b"] }]),
    );

    // Keyboard: arrow down on Alpha's grip moves it below Bravo.
    fireEvent.keyDown(within(short).getByRole("button", { name: /^Move Alpha/ }), { key: "ArrowDown" });
    expect(order()).toEqual(["Charlie", "Bravo", "Alpha"]);
    await waitFor(() =>
      expect(calls.at(-1)).toEqual(["/api/wishes/order", "PUT", { list: "short", ids: ["c", "b", "a"] }]),
    );
  });
});
