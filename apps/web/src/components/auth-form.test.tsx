// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthForm } from "./auth-form";

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth }) }));
vi.mock("@/lib/api", () => ({ api: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(cleanup);

describe("AuthForm password visibility", () => {
  it("shows and hides the password without changing its value", () => {
    render(<AuthForm />);
    const password = screen.getByLabelText("Password") as HTMLInputElement;
    const toggle = screen.getByRole("button", { name: "Show password" });

    fireEvent.change(password, { target: { value: "secret-value" } });
    fireEvent.click(toggle);

    expect(password.type).toBe("text");
    expect(password.value).toBe("secret-value");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(password.type).toBe("password");
    expect(password.value).toBe("secret-value");
  });
});

describe("AuthForm email confirmation", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function fillIn(email: string) {
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-password" } });
  }

  it("asks a new account to confirm its email, with a link back to the app, and can resend it", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: { id: "u1" } }, error: null });
    auth.resend.mockResolvedValue({ error: null });
    render(<AuthForm />);
    fireEvent.click(screen.getByRole("button", { name: "Need an account? Sign up" }));
    fillIn("new@example.com");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(/We sent a confirmation link to new@example.com/)).toBeTruthy();
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "long-password",
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
        data: { terms_version: "2026-10-26", terms_accepted_at: expect.any(String) },
      },
    });

    fireEvent.click(screen.getByRole("button", { name: "Didn't get it? Resend the confirmation email" }));
    expect(await screen.findByText("A new confirmation link was sent to new@example.com.")).toBeTruthy();
    expect(auth.resend).toHaveBeenCalledWith({
      type: "signup",
      email: "new@example.com",
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
  });

  it("explains an unconfirmed sign-in instead of showing the raw error", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { code: "email_not_confirmed", message: "Email not confirmed" },
    });
    render(<AuthForm />);
    fillIn("waiting@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(/Confirm your email first/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Didn't get it? Resend the confirmation email" })).toBeTruthy();
  });

  it("shows the result of opening the confirmation link", () => {
    render(<AuthForm notice="Your email is confirmed. Sign in to continue." />);
    expect(screen.getByRole("status").textContent).toBe("Your email is confirmed. Sign in to continue.");
  });
});

describe("AuthForm terms and password reset", () => {
  afterEach(() => vi.clearAllMocks());

  it("requires agreeing to the Terms and Privacy Policy to sign up", async () => {
    render(<AuthForm />);
    fireEvent.click(screen.getByRole("button", { name: "Need an account? Sign up" }));
    expect(screen.getByRole("link", { name: "Terms" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByRole("link", { name: "Privacy Policy" }).getAttribute("href")).toBe("/privacy");
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "long-password" } });
    fireEvent.submit(screen.getByRole("button", { name: "Create account" }).closest("form") as HTMLFormElement);
    expect(await screen.findByText(/Please agree to the Terms and Privacy Policy/)).toBeTruthy();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("sends a reset link without revealing whether the account exists", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    render(<AuthForm />);
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.queryByLabelText("Password")).toBeNull();
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "who@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText("If an account exists for who@example.com, we sent a link to reset the password.")).toBeTruthy();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith("who@example.com", {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    fireEvent.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });
});

describe("AuthForm message colours", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows a wrong password as a red alert and a sent link in grey", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid login credentials", code: "invalid_credentials" },
    });
    render(<AuthForm />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "me@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Invalid login credentials");
    expect(alert.className).toContain("error");

    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "me@example.com" } });
    fireEvent.submit(screen.getByLabelText("Email").closest("form")!);

    const status = await screen.findByText(/we sent a link to reset the password/);
    expect(status.className).not.toContain("error");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
