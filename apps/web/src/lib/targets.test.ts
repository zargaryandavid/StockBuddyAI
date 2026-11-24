import { describe, expect, it, vi } from "vitest";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

import { loadTargets, type TargetsState } from "./targets";

describe("loadTargets", () => {
  it("shows known targets at once, marks new stocks Analyzing, then fills them in", async () => {
    apiMock.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path.startsWith("/api/securities/targets?")) {
        return { configured: true, targets: { AAPL: { target: 250 }, NEW: null, VOO: null }, analyzing: ["NEW", "VOO"] };
      }
      if (path === "/api/securities/targets/research") {
        expect(JSON.parse(String(init?.body))).toEqual({ tickers: ["NEW", "VOO"] });
        return { targets: { NEW: { target: 12, approximate: true }, VOO: null } };
      }
      return null;
    });
    const states: TargetsState[] = [];
    await loadTargets(["aapl", "NEW", "VOO"], (state) => states.push(state), () => true);

    expect(states[0].targets.AAPL?.target).toBe(250);
    expect([...states[0].analyzing]).toEqual(["NEW", "VOO"]);
    const last = states.at(-1)!;
    expect(last.targets.NEW?.target).toBe(12);
    expect(last.targets.VOO).toBeNull();
    expect(last.analyzing.size).toBe(0);
  });

  it("stops showing Analyzing when research is unavailable", async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/securities/targets?")) return { configured: true, targets: { NEW: null }, analyzing: ["NEW"] };
      throw new Error("Forecast research is unavailable right now");
    });
    const states: TargetsState[] = [];
    await loadTargets(["NEW"], (state) => states.push(state), () => true);
    expect(states.at(-1)!.analyzing.size).toBe(0);
    expect(states.at(-1)!.targets.NEW).toBeNull();
  });
});
