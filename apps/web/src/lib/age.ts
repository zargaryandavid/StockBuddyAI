// Ages come from the date of birth; an age is never stored.

/** Whole years between a "YYYY-MM-DD" birth date and another date; null when unknown. */
export function ageOn(dateOfBirth: string | null | undefined, on: string): number | null {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}/.test(dateOfBirth) || !/^\d{4}-\d{2}-\d{2}/.test(on)) {
    return null;
  }
  const [by, bm, bd] = dateOfBirth.slice(0, 10).split("-").map(Number);
  const [y, m, d] = on.slice(0, 10).split("-").map(Number);
  if (dateOfBirth.slice(0, 10) > on.slice(0, 10)) return null;
  const birthdayPassed = m > bm || (m === bm && d >= bd);
  return y - by - (birthdayPassed ? 0 : 1);
}

/** The first day of the month `months` after `today`, as "YYYY-MM-DD". */
export function monthsAfter(today: string, months: number) {
  const [y, m] = today.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + months, 1)).toISOString().slice(0, 10);
}

/** "November 2039" */
export function monthYearLabel(date: string) {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export type FireTiming = {
  fireDate: string | null;
  currentAge: number | null;
  fireAge: number | null;
};

/** Current age, FIRE age, and FIRE month; ages are null without a date of birth. */
export function fireTiming(
  dateOfBirth: string | null | undefined,
  today: string,
  hitMonth: number | null,
): FireTiming {
  const fireDate = hitMonth == null ? null : hitMonth === 0 ? today : monthsAfter(today, hitMonth);
  return {
    fireDate,
    currentAge: ageOn(dateOfBirth, today),
    fireAge: fireDate ? ageOn(dateOfBirth, fireDate) : null,
  };
}
