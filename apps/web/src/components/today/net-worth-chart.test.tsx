// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NetWorthChart } from "./net-worth-chart";

afterEach(cleanup);

// jsdom has no PointerEvent; a MouseEvent carries the same position.
if (typeof window.PointerEvent === "undefined") {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
}

const point = (day: string, total: number) => ({ day, investments: 0, savings: 0, other_assets: 0, total });

function lineHeights(container: HTMLElement) {
  const d = container.querySelector(".net-worth-line")?.getAttribute("d") ?? "";
  return [...d.matchAll(/[ML][\d.]+,([\d.]+)/g)].map((match) => Number(match[1]));
}

describe("NetWorthChart", () => {
  it("draws a change of a few cents as a flat line, not a cliff", () => {
    const { container } = render(
      <NetWorthChart points={[point("2026-10-27", 356254.71), point("2026-10-28", 356254.7)]} currency="USD" today="2026-10-28" />,
    );
    const [first, last] = lineHeights(container);
    expect(Math.abs(first - last)).toBeLessThan(1);
  });

  it("still shows a real move clearly", () => {
    const { container } = render(
      <NetWorthChart points={[point("2026-10-01", 300000), point("2026-10-28", 330000)]} currency="USD" today="2026-10-28" />,
    );
    const [first, last] = lineHeights(container);
    expect(first - last).toBeGreaterThan(100);
  });

  it("shows the value, date and change of the point under the mouse or finger", () => {
    const { container } = render(
      <NetWorthChart
        points={[point("2026-10-26", 350000), point("2026-10-27", 352500.5), point("2026-10-28", 351000)]}
        currency="USD"
        today="2026-10-28"
      />,
    );
    // Each reading has its own dot.
    expect(container.querySelectorAll(".net-worth-point")).toHaveLength(3);
    const svg = container.querySelector("svg") as SVGSVGElement;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 720, height: 200, right: 720, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerMove(svg, { clientX: 360, clientY: 50 });
    const tip = screen.getByRole("status");
    expect(tip.textContent).toContain("$352,500.50");
    expect(tip.textContent).toContain("Tue, Oct 27, 2026");
    expect(tip.textContent).toContain("+$2,500.50 from the day before");
    fireEvent.pointerLeave(svg);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("keeps the value hidden in the label when amounts are hidden", () => {
    const { container } = render(
      <NetWorthChart points={[point("2026-10-27", 1000), point("2026-10-28", 1200)]} currency="USD" today="2026-10-28" hidden />,
    );
    const svg = container.querySelector("svg") as SVGSVGElement;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 720, height: 200, right: 720, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(svg, { clientX: 700, clientY: 50 });
    const tip = screen.getByRole("status").textContent ?? "";
    expect(tip).toContain("•••••");
    expect(tip).not.toContain("1,200");
  });
});
