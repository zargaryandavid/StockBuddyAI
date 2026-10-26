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

describe("choosing the first language", () => {
  it("prefers the clicked flag, then Armenia, then the browser language, else English", async () => {
    const { chooseLocale } = await import("./server");
    expect(chooseLocale({ cookie: "en", country: "AM", acceptLanguage: "hy" })).toBe("en");
    expect(chooseLocale({ cookie: "hy", country: "US" })).toBe("hy");
    expect(chooseLocale({ country: "AM", acceptLanguage: "en-US,en;q=0.9" })).toBe("hy");
    expect(chooseLocale({ country: "US", acceptLanguage: "hy-AM,hy;q=0.9,en;q=0.8" })).toBe("hy");
    expect(chooseLocale({ country: "US", acceptLanguage: "en-US,hy;q=0.5" })).toBe("en");
    expect(chooseLocale({ cookie: "fr", country: "FR", acceptLanguage: "fr-FR" })).toBe("en");
    expect(chooseLocale({})).toBe("en");
  });
});
