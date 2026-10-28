// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/api", () => ({ api: vi.fn() }));
vi.mock("@/components/admin-panel", () => ({
  AdminPanel: ({ email }: { email: string }) => <p>Studio for {email}</p>,
}));

import { api } from "@/lib/api";
import { AdminLoader } from "./admin-loader";

afterEach(() => {
  cleanup();
  replace.mockClear();
});

describe("AdminLoader", () => {
  it("shows the page at once, then the studio when it arrives", async () => {
    vi.mocked(api).mockResolvedValue({ personas: [], industries: [] });
    render(<AdminLoader email="admin@example.com" />);
    expect(screen.getByRole("status", { name: "Loading the studio…" })).toBeTruthy();
    expect(await screen.findByText("Studio for admin@example.com")).toBeTruthy();
  });

  it("sends anyone who is not the admin back home", async () => {
    vi.mocked(api).mockRejectedValue(new Error("Admin access required"));
    render(<AdminLoader email="someone@example.com" />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });
});
