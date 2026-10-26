// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LanguageSwitcher } from "@/components/language-switcher";
import { I18nProvider, useT } from "./client";
import { translate } from "./core";

function Greeting() {
  const t = useT();
  return <p>{t("Sign out")}</p>;
}

describe("i18n", () => {
  afterEach(cleanup);

  it("translates, fills placeholders, and falls back to English", () => {
    expect(translate("hy", "Sign out")).toBe("Դուրս գալ");
    expect(translate("en", "Sign out")).toBe("Sign out");
    expect(translate("hy", "Not translated yet {n}", { n: 3 })).toBe("Not translated yet 3");
  });

  it("switches the app between English and Armenian with the flags", () => {
    render(
      <I18nProvider locale="en">
        <LanguageSwitcher />
        <Greeting />
      </I18nProvider>,
    );
    expect(screen.getByText("Sign out")).toBeTruthy();
    expect(screen.getByRole("button", { name: "English" }).getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "Հայերեն" }));
    expect(screen.getByText("Դուրս գալ")).toBeTruthy();
    expect(document.cookie).toContain("lang=hy");
    expect(document.documentElement.lang).toBe("hy");
  });
});
