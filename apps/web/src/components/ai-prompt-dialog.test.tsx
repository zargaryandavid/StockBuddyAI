// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

import type { Portfolio } from "@/lib/api";
import { defaultBook } from "@/lib/workspace";

import { AiPromptDialog } from "./ai-prompt-dialog";

const book = { ...defaultBook, max_position_pct: 0.25 };
const portfolio = {
  id: "p1",
  name: "MyAmeria Portfolio",
  cash: 8342,
  base_currency: "USD",
  portfolio_positions: [{ ticker: "VOO", shares: 10 }],
} as unknown as Portfolio;

describe("AiPromptDialog", () => {
  afterEach(() => {
    cleanup();
    apiMock.mockReset();
  });

  it("waits for the portfolios, so the prompt never leaves them out", async () => {
    apiMock.mockImplementation(async (path: string) => {
      if (path === "/api/securities/resolve-batch") return [{ query: "VOO", data: { ticker: "VOO", price: 500, is_etf_index: true } }];
      if (path === "/api/fire/settings" || path === "/api/profile") return null;
      return [];
    });
    const { rerender } = render(<AiPromptDialog portfolios={[]} loadingPortfolios book={book} today="2026-11-04" onClose={() => {}} />);
    expect(screen.queryByLabelText("The prompt")).toBeNull();

    rerender(<AiPromptDialog portfolios={[portfolio]} book={book} today="2026-11-04" onClose={() => {}} />);
    const text = (await screen.findByLabelText("The prompt")) as HTMLTextAreaElement;
    await waitFor(() => expect(text.value).toContain("## 💼 Portfolios and holdings"));
    expect(text.value).toContain("MyAmeria Portfolio");
    // Holdings 10 × $500 + cash $8,342 = $13,342 of net worth.
    expect(text.value).toContain("**$13,342.00**");
  });
});
