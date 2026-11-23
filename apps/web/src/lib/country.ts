/**
 * Where the person lives decides which money steps and account types make sense: a Roth IRA
 * and 529 plan exist only in the United States, while Armenia has deposits and pension
 * savings instead. "ZZ" means another country, with only the universal steps.
 */
export type Country = "US" | "AM" | "ZZ";

export const COUNTRIES: { code: Country; label: string }[] = [
  { code: "US", label: "United States" },
  { code: "AM", label: "Armenia" },
  { code: "ZZ", label: "Another country" },
];

/** US-only account types, hidden elsewhere unless the person already has one. */
export const US_ONLY_CATEGORIES = new Set(["roth_ira", "roth_contribution", "college_529"]);

/**
 * The country from the profile, or a guess until it is set: Armenian language or cash and
 * entries in drams point to Armenia; otherwise the United States, as before.
 */
export function effectiveCountry(
  saved: string | null | undefined,
  hints: { locale?: string; currency?: string } = {},
): Country {
  if (saved === "US" || saved === "AM") return saved;
  if (saved) return "ZZ";
  if (hints.locale === "hy" || hints.currency === "AMD") return "AM";
  return "US";
}
