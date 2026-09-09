/**
 * Reason catalogues.
 *
 * The client has confirmed exactly one rejection reason today ("incorrect
 * information"), but that is plainly the first of many. Reasons are therefore
 * data, not code: a transition names a catalogue, and the decision screen
 * renders whatever this file contains.
 */
import type { ReasonCatalogId } from '@/config/workflow.config';

export interface ReasonDefinition {
  id: string;
  label: string;
  /** Longer explanation surfaced to the applicant with the decision. */
  applicantExplanation?: string;
  /** Forces the reviewer to type additional detail. */
  requiresDetail?: boolean;
  /** Hidden from pickers but kept so historical records still resolve. */
  archived?: boolean;
}

const APPLICATION_REJECTION_REASONS: ReasonDefinition[] = [
  {
    id: 'incorrect_information',
    label: 'Incorrect information',
    applicantExplanation:
      'Some of the information provided in the application could not be confirmed as accurate.',
  },
  {
    id: 'incomplete_application',
    label: 'Incomplete application',
    applicantExplanation: 'The application was missing information needed to assess it.',
  },
  {
    id: 'unverified_documents',
    label: 'Documents could not be verified',
    applicantExplanation: 'One or more supporting documents could not be verified.',
  },
  {
    id: 'ineligible',
    label: 'Does not meet eligibility criteria',
    applicantExplanation: 'The application did not meet the criteria for this grant programme.',
  },
  {
    id: 'proposal_not_viable',
    label: 'Business proposal not viable',
    applicantExplanation:
      'The committee was not able to establish that the proposal is workable as presented.',
  },
  {
    id: 'duplicate_application',
    label: 'Duplicate application',
    applicantExplanation: 'An application already exists for this applicant.',
  },
  {
    id: 'other',
    label: 'Other',
    requiresDetail: true,
  },
];

const WITHDRAWAL_REASONS: ReasonDefinition[] = [
  { id: 'no_longer_needed', label: 'No longer need the grant' },
  { id: 'applied_in_error', label: 'Applied in error' },
  { id: 'business_changed', label: 'My business plans have changed' },
  { id: 'other', label: 'Other', requiresDetail: true },
];

const DOCUMENT_REJECTION_REASONS: ReasonDefinition[] = [
  { id: 'illegible', label: 'Not clear enough to read' },
  { id: 'incomplete', label: 'Document is incomplete' },
  { id: 'wrong_document', label: 'Wrong document uploaded' },
  { id: 'expired', label: 'Document has expired' },
  { id: 'mismatch', label: 'Details do not match the application' },
  { id: 'other', label: 'Other', requiresDetail: true },
];

export const REASON_CATALOGUES: Record<ReasonCatalogId, ReasonDefinition[]> = {
  application_rejection: APPLICATION_REJECTION_REASONS,
  document_rejection: DOCUMENT_REJECTION_REASONS,
  withdrawal: WITHDRAWAL_REASONS,
};

export function getReasons(catalog: ReasonCatalogId): ReasonDefinition[] {
  return (REASON_CATALOGUES[catalog] ?? []).filter((reason) => !reason.archived);
}

export function getReason(catalog: ReasonCatalogId, id: string): ReasonDefinition | undefined {
  return REASON_CATALOGUES[catalog]?.find((reason) => reason.id === id);
}

/** Resolve a stored reason id to a label, tolerating ids removed from the catalogue. */
export function describeReason(catalog: ReasonCatalogId, id: string | null): string {
  if (!id) return 'No reason recorded';
  return getReason(catalog, id)?.label ?? id.replace(/_/g, ' ');
}
