// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { GrowthCalculator } from "./growth-calculator";

afterEach(cleanup);

describe("GrowthCalculator", () => {
  it("shows future value, contributions and growth, and follows the sliders", () => {
    render(<GrowthCalculator portfolioValue={0} currency="USD" />);
    fireEvent.change(screen.getByRole("slider", { name: "Starting amount" }), { target: { value: "100000" } });
    fireEvent.change(screen.getByRole("slider", { name: "Monthly contribution" }), { target: { value: "875" } });
    fireEvent.change(screen.getByRole("slider", { name: "Expected yearly return" }), { target: { value: "10.75" } });

    expect(screen.getByText("$1,583,164")).toBeTruthy();
    expect(screen.getByText("$310,000")).toBeTruthy();
    expect(screen.getByText("+$1,273,164")).toBeTruthy();
    expect(screen.getByText("Yr 20")).toBeTruthy();
  });

  it("starts from the portfolio's value when there is one", () => {
    render(<GrowthCalculator portfolioValue={107948.6} currency="USD" />);
    expect((screen.getByRole("textbox", { name: "Starting amount, exact" }) as HTMLInputElement).value).toBe("108,000");
    fireEvent.click(screen.getByRole("button", { name: "Use mine" }));
    expect((screen.getByRole("textbox", { name: "Starting amount, exact" }) as HTMLInputElement).value).toBe("107,949");
  });
});
