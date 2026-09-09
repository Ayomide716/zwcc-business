/**
 * Calendar-date helpers for `YYYY-MM-DD` values.
 *
 * Date-only answers (date of birth, business start date) are stored as plain
 * `YYYY-MM-DD` strings, never as timestamps, so they mean the same day
 * regardless of the phone's time zone.
 *
 * `new Date(string)` is deliberately not used for parsing. It accepts things
 * that are not dates at all ("1990" parses, "1990-02-31" rolls over into
 * March), and it treats a date-only string as UTC midnight — which renders as
 * the previous day west of Greenwich. Everything here is explicit instead.
 */

/** Matches the shape only. `parseISODate` still checks the calendar. */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses `YYYY-MM-DD` into a local-midnight Date, or null if the string is not
 * a real day. Rejects roll-over values such as 2026-02-30 and 2026-13-01.
 */
export function parseISODate(value: string | null | undefined): Date | null {
  if (!value || !ISO_DATE_PATTERN.test(value)) return null;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));

  const date = new Date(year, month - 1, day);
  // A rolled-over date no longer matches its own parts, which is how an
  // impossible day is caught without a table of month lengths.
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/** Formats a Date as `YYYY-MM-DD` using its local parts. */
export function toISODate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today as `YYYY-MM-DD`. */
export function todayISO(now = new Date()): string {
  return toISODate(now);
}

/** Whole years completed between two dates. Returns 0 for a future birth date. */
export function ageInYears(birth: Date, on = new Date()): number {
  let age = on.getFullYear() - birth.getFullYear();
  const hadBirthday =
    on.getMonth() > birth.getMonth() ||
    (on.getMonth() === birth.getMonth() && on.getDate() >= birth.getDate());
  if (!hadBirthday) age -= 1;
  return Math.max(age, 0);
}

/** The same calendar day, `years` earlier. Used to bound a date picker. */
export function shiftYears(date: Date, years: number): Date {
  const shifted = new Date(date.getTime());
  shifted.setFullYear(shifted.getFullYear() + years);
  return shifted;
}
