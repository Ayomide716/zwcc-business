/**
 * Committee review notes and decisions.
 *
 * Decisions themselves are workflow transitions and go through
 * `applicationService.applyTransition`. This service owns the review record
 * that accompanies them — the notes, the reasoning, the trail of who looked at
 * what.
 */
import { supabase } from '@/lib/supabase';
import type { ApplicationReviewRow } from '@/types/database';
import type { Role } from '@/types/roles';

import { applicationService } from './application.service';
import { auditService } from './audit.service';

export interface ReviewWithReviewer extends ApplicationReviewRow {
  reviewer?: { full_name: string | null; email: string } | null;
}

export const reviewService = {
  /**
   * Reviews for an application.
   *
   * RLS decides what comes back: staff see everything, an applicant sees only
   * rows with `is_internal = false`. The filter is not applied here on purpose
   * — a client-side filter would be a suggestion, not a guarantee.
   */
  async list(applicationId: string): Promise<ReviewWithReviewer[]> {
    const { data, error } = await supabase
      .from('application_reviews')
      .select('*, reviewer:profiles!application_reviews_reviewer_id_fkey(full_name, email)')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as unknown as ReviewWithReviewer[];
  },

  /** Add an internal note. Never visible to the applicant. */
  async addNote(
    applicationId: string,
    reviewer: { id: string; role: Role },
    notes: string,
    stage = 'committee_review',
  ): Promise<ApplicationReviewRow> {
    const { data, error } = await supabase
      .from('application_reviews')
      .insert({
        application_id: applicationId,
        reviewer_id: reviewer.id,
        stage,
        decision: 'note',
        notes: notes.trim(),
        is_internal: true,
      })
      .select()
      .single();

    if (error) throw error;

    await auditService.record({
      action: 'review.note_added',
      entityType: 'application',
      entityId: applicationId,
      actorId: reviewer.id,
      actorRole: reviewer.role,
    });

    return data;
  },

  /**
   * Record a decision and move the application in one operation.
   *
   * The review row is written first so that if the transition is refused (a
   * guard failed, someone else got there first) no decision is recorded — the
   * throw propagates before the status changes.
   */
  async recordDecision(
    applicationId: string,
    reviewer: { id: string; role: Role },
    input: {
      transitionId: string;
      decision: 'approve' | 'reject' | 'request_changes';
      reasonCode?: string;
      reasonNote?: string;
      /** Notes the applicant will see alongside the outcome. */
      applicantVisibleNote?: string;
      /** Internal reasoning, staff only. */
      internalNote?: string;
    },
  ) {
    const application = await applicationService.applyTransition(
      applicationId,
      input.transitionId,
      reviewer,
      { reasonCode: input.reasonCode, reasonNote: input.reasonNote },
    );

    const rows = [];
    if (input.internalNote?.trim()) {
      rows.push({
        application_id: applicationId,
        reviewer_id: reviewer.id,
        stage: 'committee_review',
        decision: input.decision,
        notes: input.internalNote.trim(),
        is_internal: true,
      });
    }
    if (input.applicantVisibleNote?.trim()) {
      rows.push({
        application_id: applicationId,
        reviewer_id: reviewer.id,
        stage: 'committee_review',
        decision: input.decision,
        notes: input.applicantVisibleNote.trim(),
        is_internal: false,
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase.from('application_reviews').insert(rows);
      if (error) throw error;
    }

    await auditService.record({
      action: 'review.created',
      entityType: 'application',
      entityId: applicationId,
      actorId: reviewer.id,
      actorRole: reviewer.role,
      metadata: { decision: input.decision, reasonCode: input.reasonCode ?? null },
    });

    return application;
  },
};
