/**
 * Folds the audit log into something a person can read.
 *
 * A raw log is mostly repetition: someone signs in and out, a reviewer opens
 * the same applicant's four documents one after another. Shown one card per
 * entry, the one line that matters is buried under dozens that do not.
 *
 * So entries are grouped by day, and within a day a run of the same person
 * doing the same thing to the same applicant becomes one card with a count.
 * Only consecutive entries fold: if something else happened in between, the
 * log keeps that order, because the order is part of the record.
 */
import type { Database } from '@/types/database';

export type AuditEntry = Database['public']['Functions']['audit_log_feed']['Returns'][number];

export interface AuditGroup {
  key: string;
  entries: AuditEntry[];
  /** The part of the subject every entry shares, e.g. the applicant. */
  sharedSubject: string | null;
}

export interface AuditDay {
  key: string;
  label: string;
  groups: AuditGroup[];
}

/**
 * What a run is "about". For a document that is the applicant, so opening an
 * applicant's ID and then their CAC certificate count as one run; the document
 * types stay visible when the card is opened.
 */
function subjectBucket(entry: AuditEntry): string {
  const subject = entry.subject ?? '';
  if (entry.entity_type === 'document') {
    const split = subject.indexOf(' · ');
    return split >= 0 ? subject.slice(split + 3) : subject;
  }
  return subject;
}

/**
 * Signing in and signing out alternate, so they would never form a run of the
 * same action — yet together they are most of the noise in any log. They fold
 * as one "session" run.
 */
function runAction(action: string): string {
  return action === 'auth.signed_in' || action === 'auth.signed_out' ? 'auth.session' : action;
}

/** "Signed in and out" when a run mixes the two; otherwise null. */
export function mixedRunLabel(group: AuditGroup): string | null {
  const actions = new Set(group.entries.map((entry) => entry.action));
  return actions.size > 1 ? 'Signed in and out' : null;
}

function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function dayLabel(date: Date, now: Date): string {
  const today = localDayKey(now);
  const yesterday = localDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const key = localDayKey(date);
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
  }).format(date);
}

/** Entries must arrive newest first, as the feed returns them. */
export function groupAuditEntries(entries: AuditEntry[], now = new Date()): AuditDay[] {
  const days: AuditDay[] = [];

  for (const entry of entries) {
    const at = new Date(entry.created_at);
    const key = localDayKey(at);

    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      day = { key, label: dayLabel(at, now), groups: [] };
      days.push(day);
    }

    const groupKey = [entry.actor_name, entry.actor_role, runAction(entry.action), subjectBucket(entry)].join('|');
    const last = day.groups[day.groups.length - 1];

    if (last && last.key === groupKey) {
      last.entries.push(entry);
    } else {
      day.groups.push({ key: groupKey, entries: [entry], sharedSubject: subjectBucket(entry) || null });
    }
  }

  return days;
}

/** 09:30 */
export function formatTime(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
}
