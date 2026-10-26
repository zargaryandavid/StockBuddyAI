// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));

import { api } from "@/lib/api";
import { AssetsPage } from "./assets-page";

const rentIncome = {
  id: "rent-1", kind: "income", category: "rent_income", name: "Condo rent", amount: 1800, currency: "USD",
  frequency: "monthly", starts_on: "2026-01-05", ends_on: null, principal: null, yield_pct: null, note: null,
  asset_id: "asset-1",
};

describe("AssetsPage", () => {
  afterEach(cleanup);

  it("lists assets with the rent they earn, and adds, edits, and removes them", async () => {
    const calls: [string, string | undefined, unknown][] = [];
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/fire/assets" && !init) {
        return [{ id: "asset-1", asset_type: "residential", name: "Condo", market_value: 350000, currency: "USD", note: null }];
      }
      if (path === "/api/fire/entries") return [rentIncome];
      if (path.startsWith("/api/fire/assets")) {
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        calls.push([path, init?.method, body]);
        return body ? { id: "asset-2", note: null, ...body } : null;
      }
      return {};
    });
    render(<AssetsPage today="2026-10-24" />);

    expect(screen.getByRole("heading", { level: 1, name: "Assets" })).toBeTruthy();
    const section = screen.getByRole("region", { name: "Your assets" });
    expect(await within(section).findByText("Condo")).toBeTruthy();
    expect(section.textContent).toContain("earns $1,800.00/mo from Condo rent");

    fireEvent.click(within(section).getByRole("button", { name: "Add asset" }));
    let dialog = screen.getByRole("dialog", { name: "Add asset" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add asset" }));
    expect(within(dialog).getByRole("alert").textContent).toContain("Give the asset a name");
    fireEvent.change(within(dialog).getByLabelText("Rental type"), { target: { value: "equipment" } });
    fireEvent.change(within(dialog).getByLabelText("Name"), { target: { value: "Excavator" } });
    fireEvent.change(within(dialog).getByLabelText("Market value (USD, optional)"), { target: { value: "60000" } });
    fireEvent.change(within(dialog).getByLabelText("Location (optional)"), { target: { value: " Yerevan, Armenia " } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add asset" }));

    expect(await within(section).findByText("Excavator")).toBeTruthy();
    expect(calls[0]).toEqual([
      "/api/fire/assets",
      "POST",
      {
        asset_type: "equipment",
        name: "Excavator",
        market_value: 60000,
        currency: "USD",
        location: "Yerevan, Armenia",
        note: null,
      },
    ]);
    const map = within(section).getByRole("link", { name: "Yerevan, Armenia" });
    expect(map.getAttribute("href")).toBe("https://www.google.com/maps/search/?api=1&query=Yerevan%2C%20Armenia");
    expect(map.getAttribute("target")).toBe("_blank");
    expect(section.textContent).toContain("$410,000.00");
    expect(section.textContent).toContain("not linked to an income yet");

    fireEvent.click(within(section).getByRole("button", { name: "Edit asset Excavator" }));
    dialog = screen.getByRole("dialog", { name: "Edit asset" });
    fireEvent.change(within(dialog).getByLabelText("Market value (USD, optional)"), { target: { value: "55000" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save asset" }));
    await waitFor(() => expect(calls[1]?.[1]).toBe("PUT"));
    expect(calls[1]?.[0]).toBe("/api/fire/assets/asset-2");

    fireEvent.click(within(section).getByRole("button", { name: "Remove asset Excavator" }));
    await waitFor(() => expect(within(section).queryByText("Excavator")).toBeNull());
    expect(calls[2]).toEqual(["/api/fire/assets/asset-2", "DELETE", null]);
  });
});
