"use client";

import { useI18n } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/core";

const LANGUAGES: { locale: Locale; code: string; name: string; Flag: () => React.JSX.Element }[] = [
  { locale: "en", code: "US", name: "English", Flag: UsFlag },
  { locale: "hy", code: "ARM", name: "Հայերեն", Flag: ArmeniaFlag },
];

/** US / ARM flag buttons that switch the whole app between English and Armenian. */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useI18n();
  return (
    <div className={`language-switcher ${className}`} role="group" aria-label="Language / Լեզու">
      {LANGUAGES.map(({ locale: option, code, name, Flag }) => (
        <button
          key={option}
          type="button"
          lang={option}
          aria-pressed={locale === option}
          aria-label={name}
          title={name}
          onClick={() => locale !== option && setLocale(option)}
        >
          <Flag />
          <span>{code}</span>
        </button>
      ))}
    </div>
  );
}

function UsFlag() {
  return (
    <svg viewBox="0 0 19 10" aria-hidden="true">
      <rect width="19" height="10" fill="#b22234" />
      {[1, 3, 5, 7, 9].map((row) => (
        <rect key={row} y={(row * 10) / 13} width="19" height={10 / 13} fill="#fff" />
      ))}
      <rect y={(11 * 10) / 13} width="19" height={10 / 13} fill="#fff" />
      <rect width="7.6" height={(7 * 10) / 13} fill="#3c3b6e" />
      {[0.9, 2.4, 3.9].map((cy) =>
        [1, 2.6, 4.2, 5.8, 7].map((cx) => <circle key={`${cx}-${cy}`} cx={cx * 0.98} cy={cy} r="0.35" fill="#fff" />),
      )}
    </svg>
  );
}

function ArmeniaFlag() {
  return (
    <svg viewBox="0 0 18 9" aria-hidden="true">
      <rect width="18" height="3" fill="#d90012" />
      <rect y="3" width="18" height="3" fill="#0033a0" />
      <rect y="6" width="18" height="3" fill="#f2a800" />
    </svg>
  );
}
