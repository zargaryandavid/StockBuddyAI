// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));

import { api } from "@/lib/api";
import { AdminConnections, type ConnectionInfo } from "./admin-connections";

const anthropic: ConnectionInfo = {
  id: "anthropic",
  name: "Claude (Anthropic)",
  purpose: "AI persona review on Run test, and the repeat check in the 300 wishes.",
  configurable: true,
  configured: true,
  fields: [
    { key: "api_key", label: "API key", kind: "secret", placeholder: "sk-ant-…", help: "", source: "env", unreadable: false, hint: "•••• 1234" },
  ],
  last_test: null,
};
const market: ConnectionInfo = {
  id: "market",
  name: "Market data (Yahoo Finance)",
  purpose: "Prices.",
  configurable: false,
  configured: true,
  fields: [],
  last_test: null,
};

describe("AdminConnections", () => {
  afterEach(cleanup);

  it("saves a new key without showing the old one, then tests it", async () => {
    const calls: [string, string | undefined, unknown][] = [];
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      calls.push([path, init?.method, init?.body ? JSON.parse(String(init.body)) : null]);
      if (path === "/api/admin/connections") return [anthropic, market];
      if (path === "/api/admin/connections/anthropic" && init?.method === "PUT") {
        return { ...anthropic, fields: [{ ...anthropic.fields[0], source: "admin", hint: "•••• 9999" }] };
      }
      if (path.endsWith("/anthropic/test")) return { ok: true, message: "Key works. Claude Opus 5.5 is available.", ms: 210, tested_at: "" };
      if (path.endsWith("/market/test")) return { ok: false, message: "Yahoo Finance returned no prices for SPY.", ms: 90, tested_at: "" };
      return undefined;
    });
    render(<AdminConnections />);

    const card = await screen.findByRole("article", { name: "Claude (Anthropic)" });
    const key = within(card).getByLabelText(/API key/) as HTMLInputElement;
    expect(key.type).toBe("password");
    expect(key.value).toBe("");
    expect(key.placeholder).toBe("Saved: •••• 1234 (type to replace)");
    expect(card.textContent).toContain("From server config");
    expect(within(card).getByRole("button", { name: "Save & test" })).toHaveProperty("disabled", true);

    fireEvent.change(key, { target: { value: "sk-ant-new-9999" } });
    fireEvent.click(within(card).getByRole("button", { name: "Save & test" }));

    expect(await within(card).findByText("Key works. Claude Opus 5.5 is available.")).toBeTruthy();
    expect(card.textContent).toContain("Working");
    expect(card.textContent).toContain("Saved in Admin");
    expect(calls).toContainEqual(["/api/admin/connections/anthropic", "PUT", { values: { api_key: "sk-ant-new-9999" } }]);
    expect((within(card).getByLabelText(/API key/) as HTMLInputElement).value).toBe("");

    // Test all runs every check, including the ones without settings.
    fireEvent.click(screen.getByRole("button", { name: "Test all" }));
    const marketCard = screen.getByRole("article", { name: "Market data (Yahoo Finance)" });
    await waitFor(() => expect(marketCard.textContent).toContain("Not working"));
    expect(marketCard.textContent).toContain("Yahoo Finance returned no prices for SPY.");
  });
});
