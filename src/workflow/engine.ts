/**
 * The workflow engine. Pure functions over the configuration in
 * `src/config/workflow.config.ts`.
 *
 * Every screen that needs to know "can this happen?", "what happens next?" or
 * "what may this user do?" asks the engine. No screen re-implements a rule, so
 * when the client finalises the process only the config file changes.
 */
import {
  APPLICATION_STATUSES,
  TRANSITIONS,
  WORKFLOW_FEATURES,
  WORKFLOW_GUARDS,
  WORKFLOW_TIMELINE,
  getStatus,
  type ApplicationStatusId,
  type GuardId,
  type NextActionHint,
  type StatusDefinition,
  type TransitionDefinition,
  type WorkflowContext,
} from '@/config/workflow.config';
import type { Role } from '@/types/roles';

/** A transition paired with whether it may be performed right now, and why not. */
export interface AvailableTransition {
  transition: TransitionDefinition;
  allowed: boolean;
  /** Human-readable reasons the transition is currently blocked. */
  blockers: string[];
}

/**
 * A permissive default used when the caller only cares about role/status
 * legality and has not loaded document or agreement state yet.
 */
export const EMPTY_WORKFLOW_CONTEXT: WorkflowContext = {
  formComplete: false,
  requiredDocumentsUploaded: false,
  requiredDocumentsVerified: false,
  hasRejectedDocuments: false,
  declarationAccepted: false,
  agreementIssued: false,
  agreementSigned: false,
};

function isTransitionEnabled(transition: TransitionDefinition): boolean {
  if (!transition.featureFlag) return true;
  return WORKFLOW_FEATURES[transition.featureFlag] === true;
}

/** Every transition that is structurally legal from `status` for `role`. */
export function getTransitionsFor(
  status: string,
  role: Role,
): TransitionDefinition[] {
  return TRANSITIONS.filter(
    (t) =>
      isTransitionEnabled(t) &&
      t.from.includes(status as ApplicationStatusId) &&
      t.allowedRoles.includes(role),
  );
}

/** Evaluate each guard on a transition against the supplied context. */
export function evaluateGuards(
  transition: TransitionDefinition,
  context: WorkflowContext,
): string[] {
  const guardIds: GuardId[] = transition.guards ?? [];
  return guardIds
    .map((id) => WORKFLOW_GUARDS[id])
    .filter((guard) => guard && !guard.test(context))
    .map((guard) => guard.message);
}

/**
 * The full picture for an action sheet: which transitions exist, and for each
 * one whether it is currently performable.
 */
export function getAvailableTransitions(
  status: string,
  role: Role,
  context: WorkflowContext = EMPTY_WORKFLOW_CONTEXT,
): AvailableTransition[] {
  return getTransitionsFor(status, role).map((transition) => {
    const blockers = evaluateGuards(transition, context);
    return { transition, allowed: blockers.length === 0, blockers };
  });
}

/** Look up one transition by id and check it is legal from `status`. */
export function findTransition(
  transitionId: string,
  status: string,
): TransitionDefinition | undefined {
  return TRANSITIONS.find(
    (t) =>
      t.id === transitionId &&
      isTransitionEnabled(t) &&
      t.from.includes(status as ApplicationStatusId),
  );
}

export interface TransitionCheck {
  ok: boolean;
  /** Present when `ok` is false. Safe to show to the user. */
  reason?: string;
  transition?: TransitionDefinition;
}

/**
 * The single gate every mutation goes through before it touches the database.
 * Services call this; the database re-checks with RLS so a compromised client
 * cannot bypass it.
 */
export function canTransition(
  transitionId: string,
  status: string,
  role: Role,
  context: WorkflowContext = EMPTY_WORKFLOW_CONTEXT,
): TransitionCheck {
  const transition = TRANSITIONS.find((t) => t.id === transitionId);

  if (!transition) {
    return { ok: false, reason: 'That action is not part of the current workflow.' };
  }
  if (!isTransitionEnabled(transition)) {
    return { ok: false, reason: 'That action is not enabled for this grant programme.' };
  }
  if (!transition.from.includes(status as ApplicationStatusId)) {
    return {
      ok: false,
      reason: `“${transition.label}” is not available while the application is ${getStatus(status).label.toLowerCase()}.`,
      transition,
    };
  }
  if (!transition.allowedRoles.includes(role)) {
    return { ok: false, reason: 'You do not have permission to perform that action.', transition };
  }

  const blockers = evaluateGuards(transition, context);
  if (blockers.length > 0) {
    return { ok: false, reason: blockers[0], transition };
  }

  return { ok: true, transition };
}

/* -------------------------------------------------------------------------- */
/* Presentation helpers                                                        */
/* -------------------------------------------------------------------------- */

export function getStatusDefinition(status: string): StatusDefinition {
  return getStatus(status);
}

/** Description written for the given audience. */
export function describeStatus(status: string, role: Role): string {
  const definition = getStatus(status);
  return role === 'applicant' ? definition.applicantDescription : definition.staffDescription;
}

/**
 * The "what do I need to do next?" hint, but only when this role is the one
 * being waited on. Returns null when the ball is in someone else's court.
 */
export function getNextActionFor(status: string, role: Role): NextActionHint | null {
  const hint = getStatus(status).nextAction;
  if (!hint) return null;
  if (hint.audience !== role) return null;
  return hint;
}

export function getProgress(status: string): number {
  return getStatus(status).progress;
}

export interface TimelineStep {
  status: StatusDefinition;
  state: 'done' | 'current' | 'upcoming';
}

/**
 * The applicant-facing journey timeline. Statuses that were skipped (or that
 * are off the happy path, such as `rejected`) are handled by comparing
 * progress rather than index, so a re-ordered workflow still renders sensibly.
 */
export function buildTimeline(currentStatus: string): TimelineStep[] {
  const current = getStatus(currentStatus);
  const currentIndex = WORKFLOW_TIMELINE.indexOf(current.id);

  return WORKFLOW_TIMELINE.map((id, index) => {
    const status = APPLICATION_STATUSES[id];
    let state: TimelineStep['state'] = 'upcoming';

    if (currentIndex === -1) {
      // Off-timeline status (rejected / withdrawn): use progress to decide.
      state = status.progress < current.progress ? 'done' : 'upcoming';
    } else if (index < currentIndex) {
      state = 'done';
    } else if (index === currentIndex) {
      state = 'current';
    }

    return { status, state };
  });
}

/** Whether the applicant may still edit form answers. */
export function isFormEditable(status: string): boolean {
  return getStatus(status).applicantEditable;
}

/** Whether documents may still be added or replaced. */
export function areDocumentsEditable(status: string): boolean {
  return getStatus(status).documentsEditable;
}

/**
 * §8 — an applicant may hold only one live application. A rejected or withdrawn
 * application releases the slot so they can reapply (§15).
 */
export function occupiesApplicantSlot(status: string): boolean {
  if (!WORKFLOW_FEATURES.enforceSingleActiveApplication) return false;
  return getStatus(status).occupiesApplicantSlot;
}

export function canReapply(status: string): boolean {
  if (!WORKFLOW_FEATURES.allowReapplyAfterRejection) return false;
  return status === 'rejected' || status === 'withdrawn';
}

/** Statuses that should appear in a committee work queue, in priority order. */
export const COMMITTEE_QUEUE_STATUSES: ApplicationStatusId[] = [
  'submitted',
  'verification',
  'committee_review',
  'approved',
  'agreement_signed',
  'disbursement_authorised',
];

/** Statuses counted as "an active beneficiary". */
export const BENEFICIARY_STATUSES: ApplicationStatusId[] = ['monitoring'];
