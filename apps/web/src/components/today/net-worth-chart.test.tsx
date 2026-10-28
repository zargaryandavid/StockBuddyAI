// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NetWorthChart } from "./net-worth-chart";

afterEach(cleanup);

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
});
