// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn(), apiUpload: vi.fn() }));

import { api, apiUpload } from "@/lib/api";
import { AdminEducation } from "./admin-education";

describe("AdminEducation", () => {
  afterEach(cleanup);

  it("writes an article with a picture, lists drafts, and deletes after confirming", async () => {
    const calls: [string, string | undefined, unknown][] = [];
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/admin/education/articles" && !init) {
        return [
          { id: "d1", title: "Draft note", body: "Not ready.", image_path: null, image_url: null, published: false, position: 5 },
        ];
      }
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push([path, init?.method, body]);
      return body
        ? { id: "a1", image_url: body.image_path ? `https://storage.test/education/${body.image_path}` : null, ...body }
        : undefined;
    });
    vi.mocked(apiUpload).mockResolvedValue({
      image_path: "articles/p1.png",
      image_url: "https://storage.test/education/articles/p1.png",
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminEducation />);

    expect(await screen.findByText("Draft note")).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "New article" }));
    const dialog = screen.getByRole("dialog", { name: "New article" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add article" }));
    expect(within(dialog).getByRole("alert").textContent).toContain("Give the article a title");

    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Compounding" } });
    fireEvent.change(within(dialog).getByLabelText("Text"), { target: { value: "Returns earn returns." } });
    const file = new File(["png"], "chart.png", { type: "image/png" });
    fireEvent.change(within(dialog).getByLabelText("Upload picture"), { target: { files: [file] } });
    expect(await within(dialog).findByAltText("Article picture preview")).toBeTruthy();
    expect(vi.mocked(apiUpload).mock.calls[0][0]).toBe("/api/admin/education/images");

    fireEvent.click(within(dialog).getByRole("button", { name: "Add article" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(calls[0]).toEqual([
      "/api/admin/education/articles",
      "POST",
      { title: "Compounding", body: "Returns earn returns.", image_path: "articles/p1.png", published: true, position: 1 },
    ]);
    // Ordered by position: the new article (1) comes before the draft (5).
    const titles = screen.getAllByRole("listitem").map((item) => item.querySelector("strong")?.textContent);
    expect(titles).toEqual(["Compounding", "Draft note"]);

    fireEvent.click(screen.getByRole("button", { name: "Delete Draft note" }));
    await waitFor(() => expect(screen.queryByText("Draft note")).toBeNull());
    expect(calls[1]).toEqual(["/api/admin/education/articles/d1", "DELETE", null]);
  });

  it("rejects pictures that are not images before uploading", async () => {
    vi.mocked(api).mockResolvedValue([]);
    vi.mocked(apiUpload).mockReset();
    render(<AdminEducation />);
    await screen.findByText(/No articles yet/);
    fireEvent.click(screen.getByRole("button", { name: "New article" }));
    const dialog = screen.getByRole("dialog", { name: "New article" });
    const pdf = new File(["%PDF"], "doc.pdf", { type: "application/pdf" });
    fireEvent.change(within(dialog).getByLabelText("Upload picture"), { target: { files: [pdf] } });
    expect(within(dialog).getByRole("alert").textContent).toContain("PNG, JPEG, WebP, or GIF");
    expect(apiUpload).not.toHaveBeenCalled();
  });

  it("keeps text typed while a picture is still uploading", async () => {
    vi.mocked(api).mockResolvedValue([]);
    let finish: (value: { image_path: string; image_url: string }) => void = () => undefined;
    vi.mocked(apiUpload).mockReset();
    vi.mocked(apiUpload).mockImplementation(() => new Promise((resolve) => { finish = resolve as typeof finish; }));
    render(<AdminEducation />);
    await screen.findByText(/No articles yet/);
    fireEvent.click(screen.getByRole("button", { name: "New article" }));
    const dialog = screen.getByRole("dialog", { name: "New article" });
    fireEvent.change(within(dialog).getByLabelText("Upload picture"), {
      target: { files: [new File(["png"], "a.png", { type: "image/png" })] },
    });
    fireEvent.change(within(dialog).getByLabelText("Text"), { target: { value: "Typed during upload" } });
    finish({ image_path: "articles/a.png", image_url: "https://storage.test/education/articles/a.png" });
    expect(await within(dialog).findByAltText("Article picture preview")).toBeTruthy();
    expect((within(dialog).getByLabelText("Text") as HTMLTextAreaElement).value).toBe("Typed during upload");
  });
});
