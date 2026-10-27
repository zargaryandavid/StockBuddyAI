// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultBook } from "@/lib/workspace";
import { AdminPanel, type StudioConfig } from "./admin-panel";

const apiMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({ api: apiMock }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut: vi.fn() } }),
}));

const initial: StudioConfig = {
  ...defaultBook,
  llm_model: "claude-opus-5-5",
  personas: ["graham", "buffett", "munger", "lynch", "druckenmiller"].map(
    (persona) => ({
      persona,
      display_name: persona,
      strategy: "strategy",
      prompt: "Return bullish, bearish, neutral, and reasoning for this company.",
      default_prompt:
        "Return bullish, bearish, neutral, and reasoning for this company.",
    }),
  ),
};

describe("AdminPanel industry catalog", () => {
  afterEach(() => {
    cleanup();
    apiMock.mockReset();
  });

  it("adds and removes named industries without quantity inputs", () => {
    render(<AdminPanel email="admin@example.com" initial={initial} />);

    expect(screen.getAllByLabelText(/Industry name \d+/)).toHaveLength(12);
    expect(screen.queryByLabelText(/position percent/i)).toBeNull();
    expect(screen.queryByLabelText(/Icon for industry/i)).toBeNull();
    const personaIcons = Array.from(
      document.querySelectorAll(".persona-icon svg"),
    ).map((icon) => icon.getAttribute("class"));
    expect(personaIcons).toHaveLength(5);
    expect(new Set(personaIcons).size).toBe(5);

    fireEvent.click(screen.getByRole("button", { name: "+ Add industry" }));
    expect(screen.getAllByLabelText(/Industry name \d+/)).toHaveLength(13);

    const added = screen.getByLabelText("Industry name 13");
    added.focus();
    fireEvent.change(added, {
      target: { value: "Index/ETF" },
    });
    expect(document.activeElement).toBe(added);
    expect(added).toHaveProperty("value", "Index/ETF");
    expect(
      added.closest(".industry-card")?.querySelector(".lucide-chart-line"),
    ).not.toBeNull();
    const icons = Array.from(document.querySelectorAll(".industry-card svg")).map((icon) =>
      icon.getAttribute("class"),
    );
    expect(new Set(icons).size).toBe(13);

    fireEvent.click(screen.getByRole("button", { name: "Remove Index/ETF" }));
    expect(screen.getAllByLabelText(/Industry name \d+/)).toHaveLength(12);
  });

  it("includes edited persona prompts when saving the studio", async () => {
    apiMock.mockResolvedValue(initial);
    render(<AdminPanel email="admin@example.com" initial={initial} />);
    const updatedPrompt = `${initial.personas[0].prompt} Keep this edit.`;

    fireEvent.change(screen.getAllByLabelText("System prompt")[0], {
      target: { value: updatedPrompt },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save studio" }));

    await waitFor(() => expect(apiMock).toHaveBeenCalledOnce());
    const request = apiMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.prompts[0]).toEqual({
      persona: "graham",
      prompt: updatedPrompt,
    });
  });

  it("saves the transaction-history analytics toggle", async () => {
    apiMock.mockResolvedValue({
      ...initial,
      use_transaction_history_analytics: false,
    });
    render(<AdminPanel email="admin@example.com" initial={initial} />);
    const toggle = screen.getByLabelText("Use transaction history in Analytics");
    expect(toggle).toHaveProperty("checked", true);

    fireEvent.click(toggle);
    expect(toggle).toHaveProperty("checked", false);
    fireEvent.click(screen.getByRole("button", { name: "Save studio" }));

    await waitFor(() => expect(apiMock).toHaveBeenCalledOnce());
    const request = apiMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body));
    expect(body.use_transaction_history_analytics).toBe(false);
    // The daily AI limits are sent with the studio, as numbers.
    expect(body.daily_wish_checks).toBe(100);
    expect(body.daily_screenshot_imports).toBe(20);
    expect(body.daily_ai_reviews).toBe(10);
    await waitFor(() => expect(toggle).toHaveProperty("checked", false));
  });

  it("keeps the affiliate tag in the Library section, out of the studio save", async () => {
    apiMock.mockResolvedValue({ ...initial });
    render(<AdminPanel email="admin@example.com" initial={{ ...initial, amazon_affiliate_tag: "kept-20" }} />);
    expect(screen.queryByLabelText(/Amazon affiliate tag/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save studio" }));
    await waitFor(() => expect(apiMock).toHaveBeenCalledOnce());
    const body = JSON.parse(String((apiMock.mock.calls[0][1] as RequestInit).body));
    expect(body).not.toHaveProperty("amazon_affiliate_tag");

    apiMock.mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "Library" }));
    expect(screen.getByLabelText(/Amazon affiliate tag/)).toHaveProperty("value", "kept-20");
    await waitFor(() => expect(apiMock).toHaveBeenCalledWith("/api/admin/books"));
  });

  it("resets the admin's own AI tokens for today without saving the studio", async () => {
    apiMock.mockResolvedValue({ reset: 1 });
    render(<AdminPanel email="admin@example.com" initial={initial} />);

    fireEvent.click(screen.getByRole("button", { name: "Reset my tokens" }));

    expect((await screen.findByRole("status")).textContent).toBe(
      "Done. Your AI tokens are full again.",
    );
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock).toHaveBeenCalledWith("/api/admin/ai-usage/reset", { method: "POST" });
  });

  it("picks the review model from a list that names the key it needs", async () => {
    const withModels = {
      ...initial,
      models: [
        { id: "claude-opus-5-5", name: "Opus 5.5", provider: "Anthropic" },
        { id: "gpt-6-sol", name: "GPT-6 Sol", provider: "OpenAI" },
      ],
    };
    apiMock.mockResolvedValue({ ...withModels, llm_model: "gpt-6-sol" });
    render(<AdminPanel email="admin@example.com" initial={withModels} />);

    expect(screen.getByText("Uses the Anthropic key from Connections. Save to apply.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Review model/), { target: { value: "gpt-6-sol" } });
    expect(screen.getByText("Uses the OpenAI key from Connections. Save to apply.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save studio" }));

    await waitFor(() => expect(apiMock).toHaveBeenCalledOnce());
    const body = JSON.parse(String((apiMock.mock.calls[0][1] as RequestInit).body));
    expect(body.llm_model).toBe("gpt-6-sol");
  });
});
