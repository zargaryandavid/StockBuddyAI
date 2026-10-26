// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: vi.fn() }));

import { api } from "@/lib/api";
import { ProfileDialog } from "./profile-dialog";

const PORTFOLIO = { id: "p1", name: "Long term" };

describe("ProfileDialog", () => {
  const calls: [string, string | undefined, unknown][] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.mocked(api).mockImplementation(async (path: string, init?: RequestInit) => {
      calls.push([path, init?.method, init?.body ? JSON.parse(String(init.body)) : null]);
      if (path === "/api/share-links" && !init) return [];
      if (path === "/api/share-links" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return { token: `token-for-${body.kind}-xxxxxxxxxxxxxxxxxxxxxxxxxx`, kind: body.kind, portfolio_id: body.portfolio_id };
      }
      return undefined;
    });
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });
  afterEach(cleanup);

  it("saves a name and date of birth and shows the calculated age", async () => {
    const onSave = vi.fn(async () => undefined);
    const onClose = vi.fn();
    render(<ProfileDialog dateOfBirth={null} today="2026-10-24" onSave={onSave} onClose={onClose} />);

    expect(screen.getByRole("dialog", { name: "Your profile" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "  Davit  " } });
    fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "1987-05-10" } });
    expect(screen.getByText(/You are 39\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ date_of_birth: "1987-05-10", display_name: "Davit" }));
    expect(onClose).toHaveBeenCalled();
  });

  it("rejects a future date without saving", () => {
    const onSave = vi.fn(async () => undefined);
    render(<ProfileDialog dateOfBirth="1987-05-10" today="2026-10-24" onSave={onSave} onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Date of birth"), { target: { value: "2027-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(screen.getByRole("alert").textContent).toContain("between 1900 and today");
    expect(onSave).not.toHaveBeenCalled();
  });

  it("turns on share links for FIRE and a portfolio, copies them, and turns them off", async () => {
    render(
      <ProfileDialog
        dateOfBirth={null}
        today="2026-10-24"
        portfolios={[PORTFOLIO]}
        currentPortfolioId="p1"
        onSave={vi.fn(async () => undefined)}
        onClose={vi.fn()}
      />,
    );
    const links = screen.getByRole("region", { name: "Shareable links" });
    const fire = await within(links).findByRole("checkbox", { name: "FIRE plan" });
    expect(within(links).getByRole("checkbox", { name: "Portfolio: Long term" })).toBeTruthy();

    fireEvent.click(fire);
    const url = await within(links).findByLabelText("FIRE plan link");
    expect((url as HTMLInputElement).value).toBe(`${window.location.origin}/share/token-for-fire-xxxxxxxxxxxxxxxxxxxxxxxxxx`);
    expect(calls).toContainEqual(["/api/share-links", "POST", { kind: "fire", portfolio_id: "p1" }]);
    // Turning a link on copies it right away; the copy icon copies it again.
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith((url as HTMLInputElement).value);
    fireEvent.click(within(links).getByRole("button", { name: "Copied" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2));

    fireEvent.click(within(links).getByRole("checkbox", { name: "FIRE plan" }));
    await waitFor(() => expect(within(links).queryByLabelText("FIRE plan link")).toBeNull());
    expect(calls.at(-1)).toEqual(["/api/share-links/token-for-fire-xxxxxxxxxxxxxxxxxxxxxxxxxx", "DELETE", null]);
  });

  it("deletes the account only after typing delete", async () => {
    const onAccountDeleted = vi.fn();
    render(
      <ProfileDialog
        dateOfBirth={null}
        today="2026-10-24"
        onSave={vi.fn(async () => undefined)}
        onClose={vi.fn()}
        onAccountDeleted={onAccountDeleted}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete my account…" }));
    const confirm = screen.getByRole("button", { name: "Delete my account" });
    expect(confirm).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText(/Type delete to confirm/), { target: { value: "dele" } });
    expect(confirm).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByLabelText(/Type delete to confirm/), { target: { value: "Delete" } });
    fireEvent.click(confirm);

    await waitFor(() => expect(onAccountDeleted).toHaveBeenCalled());
    expect(calls).toContainEqual(["/api/account", "DELETE", { confirm: "Delete" }]);
  });

  it("explains that the admin account can't be deleted here", () => {
    render(
      <ProfileDialog
        dateOfBirth={null}
        today="2026-10-24"
        onSave={vi.fn(async () => undefined)}
        onClose={vi.fn()}
        canDeleteAccount={false}
        onAccountDeleted={vi.fn()}
      />,
    );
    expect(screen.getByText("The admin account can't be deleted here.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete my account…" })).toBeNull();
  });
});
