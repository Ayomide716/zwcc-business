/**
 * Display formatting. Naira, dates and file sizes appear in many screens; each
 * is formatted in exactly one place so they cannot drift.
 */
import { GRANT_PROGRAM } from '@/config/program.config';
import { parseISODate } from '@/lib/date';

/** ₦1,250,000 — no decimals, since grant amounts are always whole naira. */
export function formatCurrency(
  amount: number | null | undefined,
  options: { withSymbol?: boolean } = {},
): string {
  const { withSymbol = true } = options;
  if (amount === null || amount === undefined || Number.isNaN(amount)) return '—';

  const formatted = new Intl.NumberFormat('en-NG', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(amount);

  return withSymbol ? `${GRANT_PROGRAM.currencySymbol}${formatted}` : formatted;
}

/** Strips everything but digits, for storing a typed currency amount. */
export function parseCurrencyInput(input: string): number | null {
  const digits = input.replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number.parseInt(digits, 10);
  return Number.isFinite(value) ? value : null;
}

/** Adds thousands separators as the user types. */
export function formatCurrencyInput(input: string): string {
  const value = parseCurrencyInput(input);
  return value === null ? '' : new Intl.NumberFormat('en-NG').format(value);
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  // A bare `YYYY-MM-DD` is a calendar day, not an instant. `new Date()` reads
  // it as UTC midnight, which renders as the previous day in any time zone west
  // of Greenwich, so it is parsed as a local day instead.
  const calendarDay = parseISODate(value);
  if (calendarDay) return calendarDay;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 14 March 2026 */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

/** 14 Mar 2026 */
export function formatDateShort(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** 14 Mar 2026, 09:30 */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

/**
 * "3 days ago", "in 2 weeks". Used on dashboards and notification lists.
 *
 * Written by hand rather than with `Intl.RelativeTimeFormat`, which **Hermes on
 * Android does not implement**. Constructing it throws, and because this runs
 * inside a list row it took the whole app down when the Updates tab opened.
 * Hermes does support Intl.DateTimeFormat and Intl.NumberFormat, which the rest
 * of this file uses; RelativeTimeFormat is the specific gap.
 */
export function formatRelative(value: string | Date | null | undefined, now = new Date()): string {
  const date = toDate(value);
  if (!date) return '—';

  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const past = diffSeconds < 0;
  const seconds = Math.abs(diffSeconds);

  const say = (count: number, unit: string) => {
    const plural = count === 1 ? unit : `${unit}s`;
    return past ? `${count} ${plural} ago` : `in ${count} ${plural}`;
  };

  if (seconds < 45) return past ? 'just now' : 'in a moment';
  if (seconds < 5400) {
    const minutes = Math.round(seconds / 60);
    return minutes < 60 ? say(minutes, 'minute') : say(1, 'hour');
  }
  if (seconds < 86_400) return say(Math.round(seconds / 3600), 'hour');
  if (seconds < 172_800) return past ? 'yesterday' : 'tomorrow';
  if (seconds < 604_800) return say(Math.round(seconds / 86_400), 'day');
  if (seconds < 2_592_000) return say(Math.round(seconds / 604_800), 'week');
  if (seconds < 31_536_000) return say(Math.round(seconds / 2_592_000), 'month');
  return say(Math.round(seconds / 31_536_000), 'year');
}

/** Whole days between two dates, positive when `date` is in the future. */
export function daysUntil(value: string | Date | null | undefined, now = new Date()): number | null {
  const date = toDate(value);
  if (!date) return null;
  const msPerDay = 86_400_000;
  return Math.ceil((date.getTime() - now.getTime()) / msPerDay);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "Adebayo Okonkwo" -> "AO". Falls back to a single letter or a dash. */
export function initials(name: string | null | undefined): string {
  if (!name) return '—';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? '' : '';
  return (first + last).toUpperCase();
}

/** "Adebayo Okonkwo" -> "Adebayo". Used for greetings. */
export function firstName(name: string | null | undefined): string {
  if (!name) return 'there';
  return name.trim().split(/\s+/)[0] ?? 'there';
}

/** Normalises a Nigerian mobile number to +234 form where recognisable. */
export function normalisePhone(input: string): string {
  const trimmed = input.replace(/[\s()-]/g, '');
  if (trimmed.startsWith('+')) return trimmed;
  if (trimmed.startsWith('234')) return `+${trimmed}`;
  if (trimmed.startsWith('0') && trimmed.length === 11) return `+234${trimmed.slice(1)}`;
  return trimmed;
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : plural ?? `${singular}s`;
}

/** Truncate for list rows, breaking on a word boundary where possible. */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const clipped = text.slice(0, maxLength);
  const lastSpace = clipped.lastIndexOf(' ');
  return `${lastSpace > maxLength * 0.6 ? clipped.slice(0, lastSpace) : clipped}…`;
}
