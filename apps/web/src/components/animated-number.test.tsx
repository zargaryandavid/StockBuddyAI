// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnimatedNumber } from "./animated-number";

const format = (value: number) => `$${Math.round(value)}`;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function motion(reduce: boolean) {
  vi.stubGlobal("matchMedia", () => ({ matches: reduce, addEventListener() {}, removeEventListener() {} }));
}

describe("AnimatedNumber", () => {
  it("rolls up from 0 to the value, then shows it exactly", async () => {
    motion(false);
    let now = 0;
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => frames.push(callback));
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.spyOn(performance, "now").mockImplementation(() => now);

    const { container } = render(<AnimatedNumber value={1000} format={format} />);
    act(() => {
      now = 350;
      frames.shift()?.(now);
    });
    const midway = Number(container.querySelector("[aria-hidden]")?.textContent?.slice(1));
    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(1000);
    expect(container.querySelector(".sr-only")?.textContent).toBe("$1000");

    act(() => {
      now = 800;
      while (frames.length) frames.shift()?.(now);
    });
    expect(container.textContent).toBe("$1000");
  });

  it("shows the value straight away when motion is reduced", () => {
    motion(true);
    const { container } = render(<AnimatedNumber value={42} format={format} />);
    expect(container.textContent).toBe("$42");
  });
});
