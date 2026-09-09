/**
 * ===========================================================================
 * THE WORKFLOW CONFIGURATION
 * ===========================================================================
 *
 * This file is the single source of truth for how a grant application moves
 * through the programme. Zion World Christian Center has not finalised its
 * exact process, so the MVP ships a sensible professional workflow that can be
 * re-shaped here *without touching screens, services or the database schema*.
 *
 * What lives here:
 *   - The list of statuses an application can hold
 *   - What each status means to each audience, and what it looks like
 *   - The legal transitions between statuses, who may perform them, and the
 *     preconditions ("guards") that must hold first
 *   - Feature switches for rules the client is still deciding on
 *
 * What does NOT live here:
 *   - Screens. UI reads this config; it never re-states the rules.
 *   - Database triggers. The schema stores a status *string* and validates
 *     transitions against a table seeded from this file, so changing this file
 *     plus re-running the seed keeps both halves in step.
 *
 * HOW TO CHANGE THE WORKFLOW LATER
 *   1. Add / rename / remove entries in `APPLICATION_STATUSES`.
 *   2. Adjust `TRANSITIONS` so the new statuses are reachable.
 *   3. If a new precondition is needed, add a guard to `WORKFLOW_GUARDS`.
 *   4. Re-run `supabase/migrations/0004_seed_configuration.sql` (or the admin
 *      "Sync workflow" action) so the database mirrors the new statuses.
 * No screen changes are required for any of the above.
 */
import type { Role } from '@/types/roles';

/* -------------------------------------------------------------------------- */
/* Status identifiers                                                          */
/* -------------------------------------------------------------------------- */

export const APPLICATION_STATUS_IDS = [
  'draft',
  'submitted',
  'verification',
  'committee_review',
  'changes_requested',
  'approved',
  'rejected',
  'agreement_pending',
  'agreement_signed',
  'disbursement_authorised',
  'monitoring',
  'completed',
  'withdrawn',
] as const;

export type ApplicationStatusId = (typeof APPLICATION_STATUS_IDS)[number];

/** Broad phase, used for grouping, filtering and dashboard statistics. */
export type WorkflowPhase =
  | 'preparation'
  | 'verification'
  | 'decision'
  | 'agreement'
  | 'monitoring'
  | 'closed';

/** Drives colour treatment in `StatusBadge` — never hardcode colours in screens. */
export type StatusTone = 'neutral' | 'info' | 'progress' | 'success' | 'danger' | 'warning';

export interface NextActionHint {
  /** Who is being waited on while the application sits in this status. */
  audience: Role;
  /** Short imperative shown on the dashboard's "what do I do next" card. */
  label: string;
  description: string;
  /** Route to send the user to. Omit when there is nothing to act on. */
  route?: string;
  cta?: string;
}

export interface StatusDefinition {
  id: ApplicationStatusId;
  label: string;
  /** Wording shown to the applicant. Keep it plain and reassuring. */
  applicantDescription: string;
  /** Wording shown to committee/admin. Can be more operational. */
  staffDescription: string;
  phase: WorkflowPhase;
  tone: StatusTone;
  /** Whether the applicant may still edit form answers in this status. */
  applicantEditable: boolean;
  /** Whether documents may still be uploaded or replaced. */
  documentsEditable: boolean;
  /** 0..1 — how far through the journey this status sits, for progress bars. */
  progress: number;
  /** Terminal statuses never transition onward automatically. */
  terminal: boolean;
  /** Application counts as an "active" grant for the single-application rule. */
  occupiesApplicantSlot: boolean;
  nextAction?: NextActionHint;
}

/* -------------------------------------------------------------------------- */
/* Status definitions                                                          */
/* -------------------------------------------------------------------------- */

export const APPLICATION_STATUSES: Record<ApplicationStatusId, StatusDefinition> = {
  draft: {
    id: 'draft',
    label: 'Draft',
    applicantDescription:
      'Your application has been started but not submitted. You can continue where you left off at any time.',
    staffDescription: 'Applicant has started but not yet submitted this application.',
    phase: 'preparation',
    tone: 'neutral',
    applicantEditable: true,
    documentsEditable: true,
    progress: 0.1,
    terminal: false,
    occupiesApplicantSlot: true,
    nextAction: {
      audience: 'applicant',
      label: 'Continue your application',
      description: 'Finish the remaining sections and upload your documents to submit.',
      route: '/(applicant)/application',
      cta: 'Continue',
    },
  },

  submitted: {
    id: 'submitted',
    label: 'Submitted',
    applicantDescription:
      'We have received your application. Keep your registration code safe — you may need it for verification.',
    staffDescription: 'Awaiting pickup for initial verification.',
    phase: 'verification',
    tone: 'info',
    applicantEditable: false,
    documentsEditable: false,
    progress: 0.35,
    terminal: false,
    occupiesApplicantSlot: true,
    nextAction: {
      audience: 'committee',
      label: 'Begin verification',
      description: 'Check the applicant’s details and verify their uploaded documents.',
      route: '/(committee)/applications',
      cta: 'Open',
    },
  },

  verification: {
    id: 'verification',
    label: 'Under verification',
    applicantDescription:
      'Our team is verifying your details and documents. We will let you know as soon as this is complete.',
    staffDescription: 'Documents are being checked. Verify or reject each document, then send to committee.',
    phase: 'verification',
    tone: 'progress',
    applicantEditable: false,
    documentsEditable: false,
    progress: 0.45,
    terminal: false,
    occupiesApplicantSlot: true,
    nextAction: {
      audience: 'committee',
      label: 'Verify documents',
      description: 'Review each uploaded document and mark it verified or rejected.',
      route: '/(committee)/applications',
      cta: 'Verify',
    },
  },

  committee_review: {
    id: 'committee_review',
    label: 'Committee review',
    applicantDescription:
      'Your application is with the Grant Committee for review. A decision will be communicated to you.',
    staffDescription: 'Awaiting a committee decision.',
    phase: 'decision',
    tone: 'progress',
    applicantEditable: false,
    documentsEditable: false,
    progress: 0.6,
    terminal: false,
    occupiesApplicantSlot: true,
    nextAction: {
      audience: 'committee',
      label: 'Record a decision',
      description: 'Review the proposal and approve or decline the application.',
      route: '/(committee)/applications',
      cta: 'Review',
    },
  },

  /**
   * Currently unreachable: the client confirmed applications may NOT be sent
   * back for correction (brief §14). The status and its transitions are fully
   * defined so the behaviour can be switched on with one flag —
   * `WORKFLOW_FEATURES.allowReturnForCorrections` — if that changes.
   */
  changes_requested: {
    id: 'changes_requested',
    label: 'Corrections requested',
    applicantDescription:
      'We need you to correct part of your application. Open it to see what needs your attention.',
    staffDescription: 'Returned to the applicant for correction. Awaiting their re-submission.',
    phase: 'verification',
    tone: 'warning',
    applicantEditable: true,
    documentsEditable: true,
    progress: 0.3,
    terminal: false,
    occupiesApplicantSlot: true,
    nextAction: {
      audience: 'applicant',
      label: 'Make the requested corrections',
      description: 'Update the details we flagged and submit your application again.',
      route: '/(applicant)/application',
      cta: 'Fix',
    },
  },

  approved: {
    id: 'approved',
    label: 'Approved',
    applicantDescription:
      'Congratulations — your application has been approved. The next step is to review and sign your grant agreement.',
    staffDescription: 'Approved by the committee. An agreement must be issued to the applicant.',
    phase: 'decision',
    tone: 'success',
    applicantEditable: false,
    documentsEditable: false,
    progress: 0.7,
    terminal: false,
    occupiesApplicantSlot: true,
    nextAction: {
      audience: 'committee',
      label: 'Issue the grant agreement',
      description: 'Make the agreement available for the applicant to review and sign.',
      route: '/(committee)/applications',
      cta: 'Issue',
    },
  },

  rejected: {
    id: 'rejected',
    label: 'Not approved',
    applicantDescription:
      'Your application was not approved on this occasion. You are welcome to apply again with a new application.',
    staffDescription: 'Declined. The applicant may start a fresh, linked application.',
    phase: 'closed',
    tone: 'danger',
    applicantEditable: false,
    documentsEditable: false,
    progress: 1,
    terminal: true,
    // Frees the slot so a rejected applicant can reapply (brief §15).
    occupiesApplicantSlot: false,
    nextAction: {
      audience: 'applicant',
      label: 'You may apply again',
      description: 'Your previous answers are preserved. A new application will be created.',
      route: '/(applicant)/application',
      cta: 'Reapply',
    },
  },

  agreement_pending: {
    id: 'agreement_pending',
    label: 'Agreement to sign',
    applicantDescription:
      'Your grant agreement is ready. Please read it carefully and sign to proceed.',
    staffDescription: 'Agreement issued. Waiting for the applicant to sign.',
    phase: 'agreement',
    tone: 'warning',
    applicantEditable: false,
    documentsEditable: false,
    progress: 0.78,
    terminal: false,
    occupiesApplicantSlot: true,
    nextAction: {
      audience: 'applicant',
      label: 'Review and sign your agreement',
      description: 'Read the grant agreement and sign it to move to disbursement.',
      route: '/(applicant)/agreement',
      cta: 'Sign',
    },
  },

  agreement_signed: {
    id: 'agreement_signed',
    label: 'Agreement signed',
    applicantDescription:
      'Thank you — your agreement is signed. The committee will authorise your grant for disbursement.',
    staffDescription: 'Signed by the applicant. Awaiting disbursement authorisation.',
    phase: 'agreement',
    tone: 'info',
    applicantEditable: false,
    documentsEditable: false,
    progress: 0.85,
    terminal: false,
    occupiesApplicantSlot: true,
    nextAction: {
      audience: 'committee',
      label: 'Authorise disbursement',
      description: 'Confirm the grant is cleared for disbursement outside the app.',
      route: '/(committee)/applications',
      cta: 'Authorise',
    },
  },

  disbursement_authorised: {
    id: 'disbursement_authorised',
    label: 'Cleared for disbursement',
    applicantDescription:
      'Your grant has been authorised. Monthly business reporting begins once your grant is released.',
    staffDescription:
      'Authorised. The app does not move money — disbursement happens outside the platform. Start monitoring when the grant has been released.',
    phase: 'agreement',
    tone: 'success',
    applicantEditable: false,
    documentsEditable: false,
    progress: 0.9,
    terminal: false,
    occupiesApplicantSlot: true,
    nextAction: {
      audience: 'committee',
      label: 'Start the monitoring year',
      description: 'Begin the 12-month reporting schedule for this beneficiary.',
      route: '/(committee)/applications',
      cta: 'Start',
    },
  },

  monitoring: {
    id: 'monitoring',
    label: 'Active beneficiary',
    applicantDescription:
      'You are an active beneficiary. Submit your business progress report each month for twelve months.',
    staffDescription: 'Beneficiary is in the monitoring year. Review their monthly reports.',
    phase: 'monitoring',
    tone: 'progress',
    applicantEditable: false,
    documentsEditable: false,
    progress: 0.95,
    terminal: false,
    occupiesApplicantSlot: true,
    nextAction: {
      audience: 'applicant',
      label: 'Submit your monthly report',
      description: 'Share your progress, achievements, challenges, photos and videos.',
      route: '/(applicant)/monitoring',
      cta: 'Report',
    },
  },

  completed: {
    id: 'completed',
    label: 'Grant completed',
    applicantDescription:
      'Your monitoring year is complete. Thank you for being part of the ZWCC Business Grant.',
    staffDescription: 'Monitoring concluded. An outcome evaluation can be recorded.',
    phase: 'closed',
    tone: 'success',
    applicantEditable: false,
    documentsEditable: false,
    progress: 1,
    terminal: true,
    occupiesApplicantSlot: false,
  },

  withdrawn: {
    id: 'withdrawn',
    label: 'Withdrawn',
    applicantDescription: 'This application was withdrawn.',
    staffDescription: 'Withdrawn by the applicant or an administrator.',
    phase: 'closed',
    tone: 'neutral',
    applicantEditable: false,
    documentsEditable: false,
    progress: 1,
    terminal: true,
    occupiesApplicantSlot: false,
  },
};

/* -------------------------------------------------------------------------- */
/* Guards                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A guard is a named precondition. Transitions reference guards by id, so the
 * client can bolt a new rule onto an existing transition without any screen
 * knowing about it.
 *
 * `WorkflowContext` is deliberately a flat bag of facts rather than a database
 * row, so guards stay pure and unit-testable.
 */
export interface WorkflowContext {
  /** Every required form section has passed validation. */
  formComplete: boolean;
  /** Every required document is uploaded. */
  requiredDocumentsUploaded: boolean;
  /** Every required document has been verified by staff. */
  requiredDocumentsVerified: boolean;
  /** At least one document was rejected during verification. */
  hasRejectedDocuments: boolean;
  /** Applicant has accepted the declaration and terms. */
  declarationAccepted: boolean;
  /** An agreement record exists for this application. */
  agreementIssued: boolean;
  /** The agreement carries a signature. */
  agreementSigned: boolean;
}

export type GuardId =
  | 'form_complete'
  | 'required_documents_uploaded'
  | 'required_documents_verified'
  | 'no_rejected_documents'
  | 'declaration_accepted'
  | 'agreement_issued'
  | 'agreement_signed';

export interface GuardDefinition {
  id: GuardId;
  /** Message shown when the guard blocks a transition. Written for humans. */
  message: string;
  test: (context: WorkflowContext) => boolean;
}

export const WORKFLOW_GUARDS: Record<GuardId, GuardDefinition> = {
  form_complete: {
    id: 'form_complete',
    message: 'Complete every required section of the application first.',
    test: (c) => c.formComplete,
  },
  required_documents_uploaded: {
    id: 'required_documents_uploaded',
    message: 'Upload all required documents before submitting.',
    test: (c) => c.requiredDocumentsUploaded,
  },
  required_documents_verified: {
    id: 'required_documents_verified',
    message: 'Every required document must be verified before this step.',
    test: (c) => c.requiredDocumentsVerified,
  },
  no_rejected_documents: {
    id: 'no_rejected_documents',
    message: 'Resolve the rejected documents before continuing.',
    test: (c) => !c.hasRejectedDocuments,
  },
  declaration_accepted: {
    id: 'declaration_accepted',
    message: 'The declaration and terms must be accepted before submitting.',
    test: (c) => c.declarationAccepted,
  },
  agreement_issued: {
    id: 'agreement_issued',
    message: 'An agreement must be issued to the applicant first.',
    test: (c) => c.agreementIssued,
  },
  agreement_signed: {
    id: 'agreement_signed',
    message: 'The applicant has not signed the agreement yet.',
    test: (c) => c.agreementSigned,
  },
};

/* -------------------------------------------------------------------------- */
/* Transitions                                                                 */
/* -------------------------------------------------------------------------- */

/** Catalogue a transition draws its mandatory reason from. */
export type ReasonCatalogId = 'application_rejection' | 'document_rejection' | 'withdrawal';

export interface TransitionDefinition {
  id: string;
  from: ApplicationStatusId[];
  to: ApplicationStatusId;
  /** Verb shown on the button that performs this transition. */
  label: string;
  /** Roles permitted to perform it. Checked again by RLS in the database. */
  allowedRoles: Role[];
  guards?: GuardId[];
  /** When true the actor must supply a reason before the transition applies. */
  requiresReason?: boolean;
  reasonCatalog?: ReasonCatalogId;
  /** Notification event emitted after a successful transition. */
  notification?: string;
  /** Short confirmation copy shown before a destructive/irreversible step. */
  confirm?: string;
  /**
   * Gate this transition behind a feature switch. Absent means always enabled.
   */
  featureFlag?: keyof typeof WORKFLOW_FEATURES;
}

export const TRANSITIONS: TransitionDefinition[] = [
  {
    id: 'submit_application',
    from: ['draft', 'changes_requested'],
    to: 'submitted',
    label: 'Submit application',
    allowedRoles: ['applicant'],
    guards: [
      'form_complete',
      'required_documents_uploaded',
      'declaration_accepted',
    ],
    notification: 'application_submitted',
    confirm:
      'Once submitted your application cannot be edited. Please make sure everything is correct.',
  },
  {
    id: 'begin_verification',
    from: ['submitted'],
    to: 'verification',
    label: 'Begin verification',
    allowedRoles: ['committee', 'admin'],
    notification: 'verification_started',
  },
  {
    id: 'send_to_committee',
    from: ['verification'],
    to: 'committee_review',
    label: 'Send to committee',
    allowedRoles: ['committee', 'admin'],
    guards: ['required_documents_verified', 'no_rejected_documents'],
    notification: 'sent_to_committee',
  },
  {
    id: 'request_changes',
    from: ['verification', 'committee_review'],
    to: 'changes_requested',
    label: 'Return for corrections',
    allowedRoles: ['committee', 'admin'],
    requiresReason: true,
    reasonCatalog: 'application_rejection',
    notification: 'changes_requested',
    // Disabled for the MVP per the client's current rule (brief §14).
    featureFlag: 'allowReturnForCorrections',
  },
  {
    id: 'approve_application',
    from: ['committee_review'],
    to: 'approved',
    label: 'Approve application',
    allowedRoles: ['committee', 'admin'],
    notification: 'application_approved',
    confirm: 'Approve this application? The applicant will be asked to sign an agreement.',
  },
  {
    id: 'reject_application',
    from: ['verification', 'committee_review'],
    to: 'rejected',
    label: 'Decline application',
    allowedRoles: ['committee', 'admin'],
    requiresReason: true,
    reasonCatalog: 'application_rejection',
    notification: 'application_rejected',
    confirm: 'Decline this application? The applicant will be notified and may apply again.',
  },
  {
    id: 'issue_agreement',
    from: ['approved'],
    to: 'agreement_pending',
    label: 'Issue agreement',
    allowedRoles: ['committee', 'admin'],
    notification: 'agreement_available',
  },
  {
    id: 'sign_agreement',
    from: ['agreement_pending'],
    to: 'agreement_signed',
    label: 'Sign agreement',
    allowedRoles: ['applicant'],
    guards: ['agreement_issued'],
    notification: 'agreement_signed',
  },
  {
    id: 'authorise_disbursement',
    from: ['agreement_signed'],
    to: 'disbursement_authorised',
    label: 'Authorise disbursement',
    allowedRoles: ['committee', 'admin'],
    guards: ['agreement_signed'],
    notification: 'disbursement_authorised',
    confirm:
      'Authorise this grant for disbursement? Payment is handled outside the app — this only records the authorisation.',
  },
  {
    id: 'start_monitoring',
    from: ['disbursement_authorised'],
    to: 'monitoring',
    label: 'Start monitoring year',
    allowedRoles: ['committee', 'admin'],
    notification: 'monitoring_started',
    confirm: 'Start the 12-month reporting schedule for this beneficiary?',
  },
  {
    id: 'complete_grant',
    from: ['monitoring'],
    to: 'completed',
    label: 'Complete grant',
    allowedRoles: ['committee', 'admin'],
    notification: 'grant_completed',
  },
  {
    id: 'withdraw_application',
    from: ['draft', 'submitted', 'verification', 'committee_review', 'changes_requested'],
    to: 'withdrawn',
    label: 'Withdraw application',
    allowedRoles: ['applicant', 'admin'],
    requiresReason: true,
    reasonCatalog: 'withdrawal',
    confirm: 'Withdraw this application? This cannot be undone, but you may apply again later.',
  },
];

/* -------------------------------------------------------------------------- */
/* Feature switches                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Rules the client is still deciding. Each one is honoured at exactly one place
 * in the codebase, so flipping a boolean here changes the behaviour app-wide.
 */
export const WORKFLOW_FEATURES = {
  /**
   * §14 — "Applications cannot be returned to applicants for corrections."
   * Set to true to expose the `request_changes` transition to reviewers.
   */
  allowReturnForCorrections: false,

  /** §15 — rejected applicants may start a new, linked application. */
  allowReapplyAfterRejection: true,

  /** §8 — an applicant may hold only one live application at a time. */
  enforceSingleActiveApplication: true,

  /** §16 — approval always routes through a signed agreement. */
  requireAgreementBeforeDisbursement: true,

  /**
   * §12 — show the registration code on the confirmation screen and dashboard.
   */
  showRegistrationCode: true,
} as const;

export type WorkflowFeature = keyof typeof WORKFLOW_FEATURES;

/* -------------------------------------------------------------------------- */
/* Derived helpers (cheap, pure)                                               */
/* -------------------------------------------------------------------------- */

/** The order statuses are displayed in on a progress timeline. */
export const WORKFLOW_TIMELINE: ApplicationStatusId[] = [
  'draft',
  'submitted',
  'verification',
  'committee_review',
  'approved',
  'agreement_pending',
  'agreement_signed',
  'disbursement_authorised',
  'monitoring',
  'completed',
];

export const DEFAULT_STATUS: ApplicationStatusId = 'draft';

export function getStatus(id: string): StatusDefinition {
  const found = APPLICATION_STATUSES[id as ApplicationStatusId];
  if (found) return found;
  // Unknown status (e.g. the client added one server-side before the app was
  // updated). Degrade gracefully rather than crashing a dashboard.
  return {
    id: id as ApplicationStatusId,
    label: id.replace(/_/g, ' '),
    applicantDescription: 'Your application is being processed.',
    staffDescription: 'Unrecognised status — check the workflow configuration.',
    phase: 'verification',
    tone: 'neutral',
    applicantEditable: false,
    documentsEditable: false,
    progress: 0.5,
    terminal: false,
    occupiesApplicantSlot: true,
  };
}
