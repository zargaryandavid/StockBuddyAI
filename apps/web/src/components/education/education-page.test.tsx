// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));

import { api } from "@/lib/api";
import { LESSONS } from "@/lib/education";
import { EducationPage } from "./education-page";

describe("EducationPage", () => {
  beforeEach(() => {
    vi.mocked(api).mockReset();
    vi.mocked(api).mockImplementation(async (path: string) => {
      if (path === "/api/education/articles") {
        return [
          {
            id: "a1", title: "Why index funds win", body: "Low costs add up.\n\nOver decades, fees matter a lot.",
            image_path: "articles/a1.png", image_url: "https://storage.test/education/articles/a1.png",
            published: true, position: 0,
          },
          {
            id: "a2", title: "Saving 50%", body: "A high savings rate shortens the road.", image_path: null,
            image_url: null, published: true, position: 1,
          },
        ];
      }
      return {};
    });
  });
  afterEach(cleanup);

  it("shows admin articles first, then lessons, as picture tiles that open to read, then the Library", async () => {
    render(<EducationPage />);

    expect(screen.queryByRole("region", { name: "Tips for you" })).toBeNull();
    const grid = screen.getByRole("region", { name: "Articles" });
    expect(await within(grid).findByRole("button", { name: "Why index funds win" })).toBeTruthy();
    const titles = within(grid).getAllByRole("button").map((tile) => tile.textContent);
    expect(titles.slice(0, 3)).toEqual(["Why index funds win", "Saving 50%", "What FIRE is"]);
    expect(titles).toHaveLength(2 + LESSONS.length);
    expect(screen.getByRole("region", { name: "Library" })).toBeTruthy();
    expect(within(grid).getByRole("button", { name: "Why index funds win" }).querySelector("img")?.getAttribute("src")).toBe(
      "https://storage.test/education/articles/a1.png",
    );

    fireEvent.click(within(grid).getByRole("button", { name: "Why index funds win" }));
    const reader = screen.getByRole("dialog", { name: "Why index funds win" });
    expect(within(reader).getByText("Over decades, fees matter a lot.")).toBeTruthy();
    fireEvent.click(within(reader).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a lesson with its points and reading links in a new tab", async () => {
    render(<EducationPage />);
    const grid = screen.getByRole("region", { name: "Articles" });
    fireEvent.click(within(grid).getByRole("button", { name: "Diversification and concentration" }));
    const lesson = screen.getByRole("dialog", { name: "Diversification and concentration" });
    expect(lesson.textContent).toContain("5–10% at most in one stock");
    const link = within(lesson).getByRole("link", { name: /Investor.gov: Diversify your investments/ });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    for (const item of LESSONS) expect(item.links.length).toBeGreaterThan(0);
  });
});
