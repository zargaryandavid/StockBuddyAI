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
});
