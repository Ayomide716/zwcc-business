/**
 * Applications — the heart of the system.
 *
 * Every status change in the app funnels through `applyTransition`, which asks
 * the workflow engine for permission before touching the database. Nothing else
 * writes `applications.status`. That is what makes the workflow genuinely
 * configurable: change `workflow.config.ts` and every screen, guard and audit
 * entry follows.
 */
import {
  DECLARATION_FIELD_IDS,
  GRANT_PROGRAM,
  PROMOTED_FIELDS,
  generateRegistrationCode,
  getRequiredDocumentTypes,
  type WorkflowContext,
} from '@/config';
import { AppError, notFoundError, workflowError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { ApplicationRow, DocumentRow, Json } from '@/types/database';
import type { Role } from '@/types/roles';
import { isFormComplete, sanitiseFormValues } from '@/validation/application';
import { canTransition } from '@/workflow/engine';

import { auditService, type AuditAction } from './audit.service';
import { notifications } from './notifications';
import { profileService } from './profile.service';

export type FormValues = Record<string, unknown>;

/** An application plus the related rows a screen almost always needs with it. */
export interface ApplicationWithContext {
  application: ApplicationRow;
  documents: DocumentRow[];
  workflowContext: WorkflowContext;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function asFormValues(value: Json): FormValues {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as FormValues)
    : {};
}

/**
 * Derive the facts the workflow guards test against. Computed in one place so
 * the applicant's "can I submit?" button and the server-side submit path can
 * never disagree.
 */
export function buildWorkflowContext(
  application: ApplicationRow,
  documents: DocumentRow[],
  agreement?: { status: string } | null,
): WorkflowContext {
  const values = asFormValues(application.form_data);
  const live = documents.filter((doc) => !doc.deleted_at);

  const required = getRequiredDocumentTypes();
  const uploadedTypeIds = new Set(live.map((doc) => doc.document_type_id));
  const verifiedTypeIds = new Set(
    live.filter((doc) => doc.status === 'verified').map((doc) => doc.document_type_id),
  );

  return {
    formComplete: isFormComplete(values),
    requiredDocumentsUploaded: required.every((type) => uploadedTypeIds.has(type.id)),
    requiredDocumentsVerified: required.every((type) => verifiedTypeIds.has(type.id)),
    hasRejectedDocuments: live.some((doc) => doc.status === 'rejected'),
    declarationAccepted: DECLARATION_FIELD_IDS.every((id) => values[id] === true),
    agreementIssued: Boolean(agreement),
    agreementSigned: agreement?.status === 'signed',
  };
}

/** Copies searchable answers onto real columns. Keep in step with PROMOTED_FIELDS. */
function promotedColumns(values: FormValues) {
  const amount = values[PROMOTED_FIELDS.requestedAmount];

  return {
    applicant_name: (values[PROMOTED_FIELDS.applicantName] as string) ?? null,
    applicant_phone: (values[PROMOTED_FIELDS.applicantPhone] as string) ?? null,
    business_name: (values[PROMOTED_FIELDS.businessName] as string) ?? null,
    business_sector: (values[PROMOTED_FIELDS.businessSector] as string) ?? null,
    requested_amount: typeof amount === 'number' && amount > 0 ? amount : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Service                                                                     */
/* -------------------------------------------------------------------------- */

export const applicationService = {
  /* ------------------------------- Reading ------------------------------ */

  /** The applicant's current application, or null if they have never applied. */
  async getMyApplication(userId: string): Promise<ApplicationRow | null> {
    const { data, error } = await supabase
      .from('applications')
      .select('*')
      .eq('applicant_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  /** Every application this applicant has ever made, newest first (§15). */
  async getMyApplicationHistory(userId: string): Promise<ApplicationRow[]> {
    const { data, error } = await supabase
      .from('applications')
      .select('*')
      .eq('applicant_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  },

  async getById(applicationId: string): Promise<ApplicationRow> {
    const { data, error } = await supabase
      .from('applications')
      .select('*')
      .eq('id', applicationId)
      .single();

    if (error) throw error;
    if (!data) throw notFoundError('that application');
    return data;
  },

  /** Application + documents + derived guard facts, in two round trips. */
  async getWithContext(applicationId: string): Promise<ApplicationWithContext> {
    const [application, documents, agreement] = await Promise.all([
      this.getById(applicationId),
      this.getDocuments(applicationId),
      supabase
        .from('agreements')
        .select('status')
        .eq('application_id', applicationId)
        .maybeSingle()
        .then(({ data }) => data),
    ]);

    return {
      application,
      documents,
      workflowContext: buildWorkflowContext(application, documents, agreement),
    };
  },

  async getDocuments(applicationId: string): Promise<DocumentRow[]> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('application_id', applicationId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data ?? [];
  },

  async getStatusHistory(applicationId: string) {
    const { data, error } = await supabase
      .from('application_status_history')
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data ?? [];
  },

  /* ------------------------------ Creating ------------------------------ */

  /**
   * Start an application. `previousApplicationId` links a reapplication to the
   * rejected one it follows, so history is preserved rather than overwritten.
   *
   * The "one live application" rule is enforced by a database trigger, not
   * here, so two devices racing cannot both succeed.
   */
  async create(userId: string, previousApplicationId?: string): Promise<ApplicationRow> {
    const { data: program, error: programError } = await supabase
      .from('grant_programs')
      .select('id')
      .eq('slug', GRANT_PROGRAM.slug)
      .eq('is_active', true)
      .maybeSingle();

    if (programError) throw programError;
    if (!program) {
      throw new AppError(
        'not_found',
        'Applications closed',
        'The grant programme is not currently accepting applications.',
      );
    }

    let attemptNumber = 1;
    let carriedValues: FormValues = {};

    if (previousApplicationId) {
      const previous = await this.getById(previousApplicationId);
      attemptNumber = previous.attempt_number + 1;
      // Pre-fill from the previous attempt so a reapplicant does not retype
      // everything. The old record is untouched.
      carriedValues = asFormValues(previous.form_data);
      // Declarations must be given afresh for each application.
      for (const id of DECLARATION_FIELD_IDS) delete carriedValues[id];
    }

    const { data, error } = await supabase
      .from('applications')
      .insert({
        applicant_id: userId,
        program_id: program.id,
        status: 'draft',
        form_data: carriedValues as Json,
        current_step: 'personal',
        completed_steps: [],
        registration_code: null,
        submitted_at: null,
        decided_at: null,
        decision_reason_code: null,
        decision_reason_note: null,
        previous_application_id: previousApplicationId ?? null,
        attempt_number: attemptNumber,
        deleted_at: null,
        ...promotedColumns(carriedValues),
      })
      .select()
      .single();

    if (error) throw error;

    await auditService.record({
      action: previousApplicationId ? 'application.reapplied' : 'application.created',
      entityType: 'application',
      entityId: data.id,
      actorId: userId,
      metadata: { attemptNumber, previousApplicationId: previousApplicationId ?? null },
    });

    await notifications.raise('application_started', userId);

    return data;
  },

  /**
   * Start a fresh application after a rejection, carrying the previous answers
   * forward and linking the two records.
   */
  async reapply(userId: string, previousApplicationId: string): Promise<ApplicationRow> {
    return this.create(userId, previousApplicationId);
  },

  /* ------------------------------- Editing ------------------------------ */

  /**
   * Save answers. Called on step navigation and by the autosave hook, so it is
   * a merge rather than a replace — two steps saved from different screens
   * must not clobber each other.
   */
  async saveProgress(
    applicationId: string,
    values: FormValues,
    options: { currentStep?: string; completedSteps?: string[] } = {},
  ): Promise<ApplicationRow> {
    const existing = await this.getById(applicationId);
    const merged = sanitiseFormValues({ ...asFormValues(existing.form_data), ...values });

    const completedSteps = options.completedSteps
      ? Array.from(new Set([...existing.completed_steps, ...options.completedSteps]))
      : existing.completed_steps;

    const { data, error } = await supabase
      .from('applications')
      .update({
        form_data: merged as Json,
        current_step: options.currentStep ?? existing.current_step,
        completed_steps: completedSteps,
        ...promotedColumns(merged),
      })
      .eq('id', applicationId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /* ----------------------------- Transitions ---------------------------- */

  /**
   * The one and only path to a status change.
   *
   * Asks the engine first (so the UI reason is precise), then writes. The
   * database re-checks via RLS, and a trigger records the status history, so a
   * caller cannot bypass either the rules or the audit trail.
   */
  async applyTransition(
    applicationId: string,
    transitionId: string,
    actor: { id: string; role: Role },
    options: { reasonCode?: string; reasonNote?: string } = {},
  ): Promise<ApplicationRow> {
    const { application, workflowContext } = await this.getWithContext(applicationId);

    const check = canTransition(transitionId, application.status, actor.role, workflowContext);
    if (!check.ok || !check.transition) {
      throw workflowError(check.reason ?? 'That action is not available right now.');
    }

    const transition = check.transition;

    if (transition.requiresReason && !options.reasonCode) {
      throw workflowError('Please choose a reason before continuing.');
    }

    const updates: Partial<ApplicationRow> = { status: transition.to };

    // Submission is the point a registration code is issued (§12).
    if (transition.to === 'submitted') {
      updates.submitted_at = new Date().toISOString();
      if (!application.registration_code) {
        updates.registration_code = await this.generateUniqueCode(application);
      }
    }

    if (transition.to === 'approved' || transition.to === 'rejected') {
      updates.decided_at = new Date().toISOString();
    }

    if (options.reasonCode) {
      updates.decision_reason_code = options.reasonCode;
      updates.decision_reason_note = options.reasonNote ?? null;
    }

    const { data, error } = await supabase
      .from('applications')
      .update(updates)
      .eq('id', applicationId)
      // Optimistic concurrency: if someone else moved the application while
      // this screen was open, update zero rows rather than overwrite them.
      .eq('status', application.status)
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      throw new AppError(
        'conflict',
        'Already updated',
        'This application was changed by someone else. Pull to refresh and try again.',
        true,
      );
    }

    // Everything below is a side effect: it must not fail the transition.
    void this.afterTransition(data, transition.id, transition.to, actor, options);

    return data;
  },

  /** Post-transition side effects: business snapshot, audit, notifications. */
  async afterTransition(
    application: ApplicationRow,
    transitionId: string,
    toStatus: string,
    actor: { id: string; role: Role },
    options: { reasonCode?: string; reasonNote?: string } = {},
  ): Promise<void> {
    try {
      if (toStatus === 'submitted') {
        await this.snapshotBusiness(application);
      }

      const auditAction = (
        {
          submit_application: 'application.submitted',
          approve_application: 'application.approved',
          reject_application: 'application.rejected',
          withdraw_application: 'application.withdrawn',
        } as Record<string, AuditAction>
      )[transitionId];

      await auditService.record({
        action: auditAction ?? 'application.status_changed',
        entityType: 'application',
        entityId: application.id,
        actorId: actor.id,
        actorRole: actor.role,
        metadata: {
          transitionId,
          toStatus,
          reasonCode: options.reasonCode ?? null,
          registrationCode: application.registration_code,
        },
      });

      await this.notifyTransition(application, transitionId, toStatus, options);
    } catch (error) {
      logger.error('Post-transition side effects failed', error, {
        applicationId: application.id,
        transitionId,
      });
    }
  },

  async notifyTransition(
    application: ApplicationRow,
    transitionId: string,
    toStatus: string,
    options: { reasonCode?: string; reasonNote?: string } = {},
  ): Promise<void> {
    const eventByTransition: Record<string, string> = {
      submit_application: 'application_submitted',
      begin_verification: 'verification_started',
      send_to_committee: 'sent_to_committee',
      request_changes: 'changes_requested',
      approve_application: 'application_approved',
      reject_application: 'application_rejected',
      issue_agreement: 'agreement_available',
      sign_agreement: 'agreement_signed',
      authorise_disbursement: 'disbursement_authorised',
      start_monitoring: 'monitoring_started',
      complete_grant: 'grant_completed',
    };

    const eventId = eventByTransition[transitionId];
    if (eventId) {
      await notifications.raise(eventId, application.applicant_id, {
        registrationCode: application.registration_code,
        reason: options.reasonNote ?? options.reasonCode ?? null,
      });
    }

    // A new submission is work for the committee — tell them too.
    if (toStatus === 'submitted') {
      const staffIds = await profileService.getStaffIds();
      await notifications.raiseMany('verification_started', staffIds, {
        registrationCode: application.registration_code,
      });
    }
  },

  /* ------------------------- Registration codes ------------------------- */

  /**
   * Generate a code, retrying on the vanishingly unlikely collision that the
   * UNIQUE constraint would otherwise reject.
   */
  async generateUniqueCode(application: ApplicationRow): Promise<string> {
    const values = asFormValues(application.form_data);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = generateRegistrationCode({
        programYear: GRANT_PROGRAM.year,
        membershipTenure: (values.years_with_ministry as string) ?? null,
        isMember: values.is_member === 'yes',
      });

      const { data, error } = await supabase
        .from('applications')
        .select('id')
        .eq('registration_code', code)
        .maybeSingle();

      if (error) throw error;
      if (!data) return code;
    }

    throw new AppError(
      'server',
      'Could not complete submission',
      'We could not generate your registration code. Please try again.',
      true,
    );
  },

  /* ------------------------------ Business ------------------------------ */

  /**
   * Normalise business answers into their own row at submission time, so
   * monitoring has something stable to hang a year of reports off.
   */
  async snapshotBusiness(application: ApplicationRow): Promise<void> {
    const values = asFormValues(application.form_data);
    const name = values.business_name as string | undefined;
    if (!name) return;

    const payload = {
      application_id: application.id,
      applicant_id: application.applicant_id,
      name,
      sector: (values.business_sector as string) ?? null,
      stage: (values.business_stage as string) ?? null,
      description: (values.business_description as string) ?? null,
      address: (values.business_address as string) ?? null,
      is_registered: values.is_registered === 'yes',
      cac_number: (values.cac_number as string) ?? null,
      employees_count:
        typeof values.employees_count === 'number' ? values.employees_count : null,
      monthly_revenue:
        typeof values.monthly_revenue === 'number' ? values.monthly_revenue : null,
    };

    const { error } = await supabase
      .from('businesses')
      .upsert(payload, { onConflict: 'application_id' });

    if (error) logger.error('Failed to snapshot business', error);
  },

  /* ----------------------------- Committee ------------------------------ */

  /**
   * The committee queue. Server-side filtering, sorting and range pagination —
   * the client never downloads the whole table.
   */
  async listForCommittee(options: {
    statuses?: string[];
    search?: string;
    sector?: string;
    sortBy?: 'submitted_at' | 'requested_amount' | 'created_at';
    ascending?: boolean;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ rows: ApplicationRow[]; total: number; hasMore: boolean }> {
    const {
      statuses,
      search,
      sector,
      sortBy = 'submitted_at',
      ascending = false,
      page = 0,
      pageSize = 20,
    } = options;

    let query = supabase
      .from('applications')
      .select('*', { count: 'exact' })
      .is('deleted_at', null)
      // A draft belongs to the applicant, not the review queue.
      .neq('status', 'draft');

    if (statuses?.length) query = query.in('status', statuses);
    if (sector) query = query.eq('business_sector', sector);

    if (search?.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(
        `applicant_name.ilike.${term},business_name.ilike.${term},registration_code.ilike.${term}`,
      );
    }

    const from = page * pageSize;
    const { data, error, count } = await query
      .order(sortBy, { ascending, nullsFirst: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const total = count ?? 0;
    return {
      rows: data ?? [],
      total,
      hasMore: from + (data?.length ?? 0) < total,
    };
  },

  /**
   * Count applications in the given statuses. `head: true` means Postgres
   * returns the count only — no rows cross the network.
   */
  async countByStatus(statuses: string[]): Promise<number> {
    const { count, error } = await supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .is('deleted_at', null)
      .in('status', statuses);

    if (error) throw error;
    return count ?? 0;
  },

  /** Tiles for the committee dashboard. */
  async getStatistics(): Promise<{
    total: number;
    newApplications: number;
    pendingVerification: number;
    underReview: number;
    approved: number;
    rejected: number;
    activeBeneficiaries: number;
  }> {
    const [
      submitted,
      verification,
      underReview,
      approved,
      rejected,
      activeBeneficiaries,
      completed,
    ] = await Promise.all([
      this.countByStatus(['submitted']),
      this.countByStatus(['verification']),
      this.countByStatus(['committee_review']),
      this.countByStatus([
        'approved',
        'agreement_pending',
        'agreement_signed',
        'disbursement_authorised',
      ]),
      this.countByStatus(['rejected']),
      this.countByStatus(['monitoring']),
      this.countByStatus(['completed', 'withdrawn']),
    ]);

    return {
      total:
        submitted +
        verification +
        underReview +
        approved +
        rejected +
        activeBeneficiaries +
        completed,
      newApplications: submitted,
      pendingVerification: verification,
      underReview,
      approved,
      rejected,
      activeBeneficiaries,
    };
  },
};
