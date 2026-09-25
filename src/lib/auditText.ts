/**
 * The audit log in words.
 *
 * Every action the app records is listed here with how a person would say it,
 * and each entry's stored details are turned into one line of plain language
 * using the same status names and reasons the rest of the app shows. So a
 * status the church renames in config reads correctly here too, with no
 * change to the database.
 *
 * An action missing from the list still reads sensibly: it falls back to a
 * tidied version of its name rather than showing "auth.signed_in".
 */
import { describeReason } from '@/config/rejection-reasons.config';
import { getStatus } from '@/config/workflow.config';
import type { Json } from '@/types/database';

const ACTION_LABELS: Record<string, string> = {
  'auth.registered': 'Created an account',
  'auth.signed_in': 'Signed in',
  'auth.signed_out': 'Signed out',
  'account.deleted': 'Deleted their account',

  'application.created': 'Started an application',
  'application.reapplied': 'Applied again',
  'application.updated': 'Updated an application',
  'application.submitted': 'Submitted an application',
  'application.status_changed': 'Moved an application',
  'application.withdrawn': 'Withdrew an application',
  'application.approved': 'Approved an application',
  'application.rejected': 'Declined an application',

  'document.uploaded': 'Uploaded a document',
  'document.replaced': 'Replaced a document',
  'document.deleted': 'Removed a document',
  'document.viewed': 'Opened a document',
  'document.capture_attempted': 'Tried to screenshot a document',
  'document.verified': 'Verified a document',
  'document.rejected': 'Rejected a document',

  'review.created': 'Recorded a review decision',
  'review.note_added': 'Added a review note',
  'review.scored': 'Scored an application',

  'agreement.issued': 'Issued an agreement',
  'agreement.signed': 'Signed an agreement',
  'disbursement.authorised': 'Cleared a grant for disbursement',

  'monitoring.started': 'Started monthly monitoring',
  'monitoring.completed': 'Completed a grant',
  'report.submitted': 'Submitted a progress report',
  'report.reviewed': 'Reviewed a progress report',
  'outcome.evaluated': 'Evaluated a grant outcome',

  'user.role_changed': 'Changed a role',
  'user.profile_updated': 'Updated a profile',
  'admin.setting_changed': 'Changed a setting',
  'admin.document_type_changed': 'Changed a document type',
};

const ROLE_WORDS: Record<string, string> = {
  applicant: 'Applicant',
  committee: 'Grant Committee',
  admin: 'Administrator',
};

const FIELD_WORDS: Record<string, string> = {
  full_name: 'name',
  phone: 'phone number',
  email: 'email',
  avatar_url: 'photo',
};

export function describeAuditAction(action: string): string {
  const known = ACTION_LABELS[action];
  if (known) return known;
  const words = action.replace(/[._]/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function asRecord(metadata: Json): Record<string, Json> {
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? (metadata as Record<string, Json>)
    : {};
}

function text(value: Json | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * One line saying what the entry recorded, or null when there is nothing a
 * person would want to read (an id, an internal flag).
 */
export function describeAuditDetail(action: string, metadata: Json): string | null {
  const m = asRecord(metadata);
  const parts: string[] = [];

  const toStatus = text(m.toStatus);
  if (toStatus) parts.push(`Moved to ${getStatus(toStatus).label}`);

  switch (action) {
    case 'application.rejected':
    case 'application.status_changed':
    case 'application.approved':
      if (text(m.reasonCode)) {
        parts.push(`Reason: ${describeReason('application_rejection', text(m.reasonCode))}`);
      }
      break;
    case 'application.withdrawn':
      if (text(m.reasonCode)) parts.push(`Reason: ${describeReason('withdrawal', text(m.reasonCode))}`);
      break;
    case 'document.rejected':
      if (text(m.reasonCode)) {
        parts.push(`Reason: ${describeReason('document_rejection', text(m.reasonCode))}`);
      }
      break;
    case 'review.created':
      if (text(m.decision)) parts.push(`Decision: ${text(m.decision)!.replace(/_/g, ' ')}`);
      if (text(m.reasonCode)) {
        parts.push(`Reason: ${describeReason('application_rejection', text(m.reasonCode))}`);
      }
      break;
    case 'report.submitted':
      if (typeof m.periodNumber === 'number') parts.push(`Month ${m.periodNumber}`);
      if (typeof m.mediaCount === 'number') {
        parts.push(`${m.mediaCount} photo${m.mediaCount === 1 ? '' : 's'} or video${m.mediaCount === 1 ? '' : 's'} attached`);
      }
      break;
    case 'report.reviewed':
      if (typeof m.score === 'number') parts.push(`Score ${m.score}/5`);
      break;
    case 'outcome.evaluated':
      if (text(m.verdict)) parts.push(`Verdict: ${text(m.verdict)!.replace(/_/g, ' ')}`);
      break;
    case 'agreement.signed':
      if (text(m.method) === 'typed_name') parts.push('Signed by typing their full name');
      break;
    case 'agreement.issued':
      if (text(m.templateVersion)) parts.push(`Agreement version ${text(m.templateVersion)}`);
      break;
    case 'application.reapplied':
      if (typeof m.attemptNumber === 'number') parts.push(`Attempt ${m.attemptNumber}`);
      break;
    case 'user.role_changed': {
      const role = text(m.role) ?? text(m.to);
      if (role) parts.push(`Now ${ROLE_WORDS[role] ?? role}`);
      break;
    }
    case 'user.profile_updated': {
      if (text(m.from) && text(m.to)) {
        parts.push(`${text(m.field) ?? 'Changed'}: ${text(m.from)} → ${text(m.to)}`);
      } else if (Array.isArray(m.fields) && m.fields.length > 0) {
        const fields = m.fields.filter((f): f is string => typeof f === 'string');
        parts.push(`Changed ${fields.map((f) => FIELD_WORDS[f] ?? f.replace(/_/g, ' ')).join(', ')}`);
      }
      break;
    }
    case 'account.deleted': {
      const archived = typeof m.grants_archived === 'number' ? m.grants_archived : 0;
      parts.push(
        archived > 0
          ? `Everything removed; ${archived} completed grant kept without their name`
          : 'Everything removed',
      );
      break;
    }
  }

  const note = text(m.note);
  if (note && !/sql editor/i.test(note)) parts.push(note.charAt(0).toUpperCase() + note.slice(1));

  return parts.length > 0 ? parts.join(' · ') : null;
}
