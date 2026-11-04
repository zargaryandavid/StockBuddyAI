// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

import { FutureAllocation } from "./future-allocation";

describe("FutureAllocation", () => {
  afterEach(() => {
    cleanup();
    apiMock.mockReset();
  });

  it("works out shares and last year's move for a saved plan, and saves changes", async () => {
    const calls: [string, string | undefined, unknown][] = [];
    apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
      calls.push([path, init?.method, init?.body ? JSON.parse(String(init.body)) : null]);
      if (path === "/api/allocation-plan" && !init) {
        return { budget: 54000000, currency: "AMD", items: [{ label: "International equities", ticker: "VXUS", name: "", mode: "pct", value: 33, expected_return_pct: null }] };
      }
      if (path.startsWith("/api/fx")) return { rate: 1 / 380 };
      if (path === "/api/securities/resolve-batch") {
        return [{ query: "VXUS", data: { ticker: "VXUS", company_name: "Vanguard Total International Stock ETF", price: 70, growth_1y: 18.6, growth_1m: 1.2, growth_6m: 9.4, is_etf_index: true } }];
      }
      if (path === "/api/allocation-plan" && init?.method === "PUT") return JSON.parse(String(init.body));
      return null;
    });
    render(<FutureAllocation />);

    expect(await screen.findByText("Vanguard Total International Stock ETF · Fund", {}, { timeout: 3000 })).toBeTruthy();
    // 33% of 54M AMD = 17.82M AMD ≈ $46,895 ≈ 669.9 shares at $70.
    expect(screen.getAllByText("AMD 17,820,000")).toHaveLength(2); // the row and the total
    expect(screen.getByText("669.92")).toBeTruthy();
    expect(screen.getByTitle("669 whole at $70")).toBeTruthy();
    expect(screen.getAllByText("+18.6%").length).toBeGreaterThan(0);
    expect(screen.getByTitle("1M +1.2% · 6M +9.4%")).toBeTruthy();
    expect(screen.getByText(/AMD 36,180,000 not allocated yet/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add investment" }));
    const names = screen.getAllByRole("textbox", { name: "Name" });
    fireEvent.change(names[names.length - 1], { target: { value: "Armenian bonds" } });
    fireEvent.click(screen.getByRole("button", { name: "Save plan" }));
    await waitFor(() => expect(calls.some(([path, method]) => path === "/api/allocation-plan" && method === "PUT")).toBe(true));
    const body = calls.find(([path, method]) => path === "/api/allocation-plan" && method === "PUT")?.[2] as { items: { name: string }[] };
    expect(body.items.map((item) => item.name)).toEqual(["", "Armenian bonds"]);
    expect(await screen.findByRole("button", { name: "Saved" })).toBeTruthy();
  });
});
