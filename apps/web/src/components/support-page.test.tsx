// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { SupportPage } from "./support-page";

describe("SupportPage", () => {
  afterEach(cleanup);

  it("explains why to support and shows the $9 subscription as coming soon", () => {
    render(<SupportPage />);

    expect(screen.getByRole("heading", { name: "Support MyPortfolioBuddy" })).toBeTruthy();
    for (const promise of ["No sponsors", "No ads", "Your data stays yours"]) {
      expect(screen.getByText(promise)).toBeTruthy();
    }
    expect(screen.getByRole("button", { name: "Subscribe · $9/month" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Subscriptions open soon. Thank you for being here early.")).toBeTruthy();
  });
});
