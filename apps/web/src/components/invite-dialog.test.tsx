// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock }));

import { InviteDialog } from "./invite-dialog";

describe("InviteDialog", () => {
  afterEach(() => {
    cleanup();
    apiMock.mockReset();
  });

  it("emails an invitation with the friend's name", async () => {
    apiMock.mockResolvedValue({ sent: true });
    render(<InviteDialog onClose={() => {}} />);

    fireEvent.change(screen.getByLabelText("Their name"), { target: { value: " Ben " } });
    fireEvent.change(screen.getByLabelText("Their email"), { target: { value: "ben@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));

    await screen.findByText(/Invitation sent to ben@example.com/);
    expect(apiMock).toHaveBeenCalledWith("/api/invites", {
      method: "POST",
      body: JSON.stringify({ name: "Ben", email: "ben@example.com" }),
    });
  });

  it("checks the address before sending", () => {
    render(<InviteDialog onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText("Their email"), { target: { value: "ben" } });
    fireEvent.click(screen.getByRole("button", { name: "Send invitation" }));
    expect(screen.getByRole("alert").textContent).toBe("Enter a valid email address");
    expect(apiMock).not.toHaveBeenCalled();
  });

  it("sends Email through our designed invitation, not a mail-app draft", () => {
    render(<InviteDialog onClose={() => {}} />);
    expect(document.querySelector("a[href^='mailto:']")).toBeNull();
    (screen.getByLabelText("Invitation link") as HTMLInputElement).focus();
    fireEvent.click(screen.getByRole("button", { name: "Email" }));
    expect(document.activeElement).toBe(screen.getByLabelText("Their email"));
  });

  it("copies the sign-up link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<InviteDialog onClose={() => {}} />);

    const link = (screen.getByLabelText("Invitation link") as HTMLInputElement).value;
    expect(link).toBe(`${window.location.origin}/login?join=1`);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith(link);
  });
});
