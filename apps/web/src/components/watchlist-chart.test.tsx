// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

import { percentSeries, WatchlistChart } from "./watchlist-chart";

const closes = {
  AAPL: [
    { date: "2025-11-24", close: 100 },
    { date: "2026-05-24", close: 110 },
    { date: "2026-11-24", close: 120 },
  ],
  MSFT: [
    { date: "2025-11-24", close: 400 },
    { date: "2026-05-24", close: 380 },
    { date: "2026-11-24", close: 360 },
  ],
};

describe("WatchlistChart", () => {
  afterEach(() => {
    cleanup();
    apiMock.mockReset();
  });

  it("turns closes into % change from the first day, so different prices compare", () => {
    const [aapl, msft] = percentSeries(closes, ["AAPL", "MSFT"]);
    expect(aapl.points.map((point) => Math.round(point.pct))).toEqual([0, 10, 20]);
    expect(msft.points.map((point) => Math.round(point.pct))).toEqual([0, -5, -10]);
    expect(percentSeries({}, ["NONE"])[0].points).toEqual([]);
  });

  it("shows every symbol with a checkbox, lets one be compared or hidden, and changes range", async () => {
    apiMock.mockResolvedValue(closes);
    render(<WatchlistChart tickers={["aapl", "MSFT", "AAPL", ""]} today="2026-11-24" />);

    expect(apiMock).toHaveBeenCalledWith("/api/prices/history?tickers=AAPL%2CMSFT&from=2025-11-23");
    const chart = await screen.findByRole("img", { name: /Price moves for AAPL \+20\.0%, MSFT −10\.0%/ });
    expect(chart.querySelectorAll("polyline")).toHaveLength(2);

    fireEvent.click(screen.getByRole("checkbox", { name: /MSFT/ }));
    expect(screen.getByRole("img").querySelectorAll("polyline")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText("Tick a symbol to see its price moves.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(screen.getByRole("img").querySelectorAll("polyline")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "6M" }));
    expect(apiMock).toHaveBeenLastCalledWith("/api/prices/history?tickers=AAPL%2CMSFT&from=2026-05-25");
  });
});
