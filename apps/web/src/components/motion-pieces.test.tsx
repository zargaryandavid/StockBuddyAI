// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FlashValue } from "./flash-value";
import { ReviewerCrew } from "./reviewer-crew";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("FlashValue", () => {
  it("does not flash at first, then flashes green up and red down", () => {
    const { container, rerender } = render(<FlashValue value={100}>$100</FlashValue>);
    expect(container.querySelector(".flash-up, .flash-down")).toBeNull();
    rerender(<FlashValue value={110}>$110</FlashValue>);
    expect(container.querySelector(".flash-up")?.textContent).toBe("$110");
    rerender(<FlashValue value={90}>$90</FlashValue>);
    expect(container.querySelector(".flash-down")?.textContent).toBe("$90");
  });
});

describe("ReviewerCrew", () => {
  it("lets each reviewer take a turn", () => {
    vi.useFakeTimers();
    render(<ReviewerCrew ticker="NVDA" />);
    expect(screen.getByText("Benjamin Graham is reading NVDA's filings…")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(2200);
    });
    expect(screen.getByText("Warren Buffett is checking the balance sheet…")).toBeTruthy();
  });
});
