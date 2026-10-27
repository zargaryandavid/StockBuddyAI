// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppHeader } from "./app-header";

describe("AppHeader sign out", () => {
  afterEach(cleanup);

  it("asks before signing out", () => {
    const onSignOut = vi.fn();
    render(
      <AppHeader email="me@example.com" onSignOut={onSignOut}>
        <span />
      </AppHeader>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(screen.getByRole("alertdialog", { name: "Sign out?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stay signed in" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(onSignOut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    const dialogButtons = screen.getAllByRole("button", { name: "Sign out" });
    fireEvent.click(dialogButtons[dialogButtons.length - 1]);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open and busy while signing out", () => {
    // Never settles, like a sign-out waiting for the sign-in page to load.
    const onSignOut = vi.fn(() => new Promise<void>(() => {}));
    render(
      <AppHeader email="me@example.com" onSignOut={onSignOut}>
        <span />
      </AppHeader>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    const dialogButtons = screen.getAllByRole("button", { name: "Sign out" });
    fireEvent.click(dialogButtons[dialogButtons.length - 1]);
    expect(screen.getByRole("alertdialog", { name: "Sign out?" })).toBeTruthy();
    const busy = screen.getByRole("button", { name: "Signing out…" }) as HTMLButtonElement;
    expect(busy.disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Stay signed in" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
