// @vitest-environment jsdom


import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CommunityLink } from "@/components/community-link";

describe("CommunityLink", () => {
  afterEach(cleanup);

  it("opens a card with the QR code and the Telegram link, and closes on Escape", () => {
    render(<CommunityLink />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Join like-minded people" }));

    const card = screen.getByRole("dialog", { name: "Our Telegram group" });
    expect(card).toBeTruthy();
    expect(screen.getByAltText("QR code for the MyPortfolioBuddy Telegram group")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Open in Telegram/ });
    expect(link.getAttribute("href")).toBe("https://t.me/+0PupBvTmIJcwOWEy");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
