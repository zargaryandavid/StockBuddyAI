/** Must match the sign-in provider's rules (Supabase: at least 10 characters, letters and digits). */
export const MIN_PASSWORD_LENGTH = 10;

/** What is wrong with a new password, in English (translated where shown), or null if fine. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return "Use at least 10 characters.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use both letters and numbers.";
  return null;
}
