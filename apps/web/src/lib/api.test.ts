// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, clearApiCache } from "./api";

const session = vi.hoisted(() => ({
  current: { access_token: "token-a", user: { id: "user-a" } } as {
    access_token: string;
    user: { id: string };
  },
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: async () => ({ data: { session: session.current } }) } }),
}));

const fetchMock = vi.fn();

beforeEach(() => {
  clearApiCache();
  session.current = { access_token: "token-a", user: { id: "user-a" } };
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => new Response(JSON.stringify([{ id: 1 }]), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("api answer cache", () => {
  it("shows a page again without asking the server twice", async () => {
    await api("/api/fire/entries");
    await api("/api/fire/entries");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks again after any change", async () => {
    await api("/api/fire/entries");
    await api("/api/fire/entries", { method: "POST", body: "{}" });
    await api("/api/fire/entries");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("never keeps live progress", async () => {
    await api("/api/ai-usage");
    await api("/api/ai-usage");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps each person's answers apart", async () => {
    await api("/api/portfolios");
    session.current = { access_token: "token-b", user: { id: "user-b" } };
    await api("/api/portfolios");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("skips what it remembers when asked to reload, and forgets failures", async () => {
    await api("/api/prices/history?tickers=AAPL");
    await api("/api/prices/history?tickers=AAPL", { cache: "reload" });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockImplementationOnce(async () => new Response("{}", { status: 500 }));
    await expect(api("/api/wishes")).rejects.toThrow();
    await api("/api/wishes");
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
