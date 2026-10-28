// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const updateUser = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth: { updateUser } }) }));

import { NewPasswordForm } from "./new-password-form";

describe("NewPasswordForm", () => {
  afterEach(cleanup);

  it("checks the two passwords, saves the new one, and opens the app", async () => {
    updateUser.mockResolvedValue({ error: null });
    render(<NewPasswordForm />);
    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: "new-password-1" } });
    fireEvent.change(screen.getByLabelText("Repeat new password"), { target: { value: "different" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
    expect(screen.getByRole("alert").textContent).toBe("The two passwords don't match.");
    expect(updateUser).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Repeat new password"), { target: { value: "new-password-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    expect(updateUser).toHaveBeenCalledWith({ password: "new-password-1" });
  });

  it("shows both passwords on request and shows Supabase's refusal in red", async () => {
    updateUser.mockResolvedValue({ error: { message: "New password should be different from the old password." } });
    render(<NewPasswordForm />);
    const first = screen.getByLabelText(/^New password/) as HTMLInputElement;
    const second = screen.getByLabelText("Repeat new password") as HTMLInputElement;
    fireEvent.click(screen.getByRole("button", { name: "Show passwords" }));
    expect([first.type, second.type]).toEqual(["text", "text"]);

    fireEvent.change(first, { target: { value: "same-as-before-1" } });
    fireEvent.change(second, { target: { value: "same-as-before-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("New password should be different from the old password.");
    expect(alert.className).toContain("error");
  });
});
