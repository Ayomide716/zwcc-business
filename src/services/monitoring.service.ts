/**
 * Beneficiary monitoring — the twelve months after a grant is released.
 *
 * The reporting calendar is *derived*, never stored. `buildReportingSchedule`
 * turns a start date into twelve periods, and a period's state comes from
 * comparing today against that schedule plus whether a report row exists. That
 * means changing the cadence in `monitoring.config.ts` immediately re-shapes
 * every existing beneficiary's timeline, with no backfill.
 */
import {
  MONITORING_SCHEDULE,
  TOTAL_REPORTING_PERIODS,
  buildReportingSchedule,
  isPeriodSubmittable,
  resolveReportStatus,
  type ReportStatus,
  type ReportingPeriod,
} from '@/config/monitoring.config';
import { AppError, notFoundError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { BUCKETS, supabase } from '@/lib/supabase';
import type {
  BeneficiaryRow,
  Json,
  ProgressMediaRow,
  ProgressReportRow,
} from '@/types/database';
import type { Role } from '@/types/roles';

import { applicationService } from './application.service';
import { auditService } from './audit.service';
import { notifications } from './notifications';
import { storageService, type LocalFile } from './storage.service';

/** One month on the beneficiary's timeline. */
export interface TimelinePeriod extends ReportingPeriod {
  status: ReportStatus;
  report: ProgressReportRow | null;
  submittable: boolean;
}

export interface MonitoringOverview {
  beneficiary: BeneficiaryRow;
  periods: TimelinePeriod[];
  submittedCount: number;
  totalPeriods: number;
  /** The period the beneficiary should act on now, if any. */
  actionablePeriod: TimelinePeriod | null;
}

export const monitoringService = {
  async getByApplication(applicationId: string): Promise<BeneficiaryRow | null> {
    const { data, error } = await supabase
      .from('beneficiaries')
      .select('*')
      .eq('application_id', applicationId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  async getMyBeneficiary(userId: string): Promise<BeneficiaryRow | null> {
    const { data, error } = await supabase
      .from('beneficiaries')
      .select('*')
      .eq('applicant_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  /**
   * Begin the monitoring year. Called when the committee confirms the grant has
   * actually reached the beneficiary.
   */
  async startMonitoring(
    applicationId: string,
    applicantId: string,
    actor: { id: string; role: Role },
  ): Promise<BeneficiaryRow> {
    const existing = await this.getByApplication(applicationId);
    if (existing) return existing;

    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime());
    endsAt.setMonth(endsAt.getMonth() + MONITORING_SCHEDULE.durationMonths);

    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('application_id', applicationId)
      .maybeSingle();

    const { data, error } = await supabase
      .from('beneficiaries')
      .insert({
        application_id: applicationId,
        applicant_id: applicantId,
        business_id: business?.id ?? null,
        monitoring_started_at: startedAt.toISOString(),
        monitoring_ends_at: endsAt.toISOString(),
        status: 'active',
        outcome_verdict: null,
        outcome_scores: {} as Json,
        outcome_notes: null,
        evaluated_by: null,
        evaluated_at: null,
      })
      .select()
      .single();

    if (error) throw error;

    await applicationService.applyTransition(applicationId, 'start_monitoring', actor);

    await auditService.record({
      action: 'monitoring.started',
      entityType: 'beneficiary',
      entityId: data.id,
      actorId: actor.id,
      actorRole: actor.role,
      metadata: { applicationId },
    });

    return data;
  },

  /* ------------------------------ Timeline ------------------------------ */

  async getReports(beneficiaryId: string): Promise<ProgressReportRow[]> {
    const { data, error } = await supabase
      .from('progress_reports')
      .select('*')
      .eq('beneficiary_id', beneficiaryId)
      .order('period_number', { ascending: true });

    if (error) throw error;
    return data ?? [];
  },

  /**
   * The twelve-month timeline with each period's live state.
   *
   * `now` is a parameter so this is deterministic and testable rather than
   * quietly depending on the clock.
   */
  async getOverview(beneficiaryId: string, now = new Date()): Promise<MonitoringOverview> {
    const { data: beneficiary, error } = await supabase
      .from('beneficiaries')
      .select('*')
      .eq('id', beneficiaryId)
      .single();

    if (error) throw error;
    if (!beneficiary) throw notFoundError('that beneficiary record');

    const reports = await this.getReports(beneficiaryId);
    const byPeriod = new Map(reports.map((report) => [report.period_number, report]));

    const periods: TimelinePeriod[] = buildReportingSchedule(
      new Date(beneficiary.monitoring_started_at),
    ).map((period) => {
      const report = byPeriod.get(period.periodNumber) ?? null;
      return {
        ...period,
        report,
        status: resolveReportStatus(period, now, report?.status),
        submittable: !report && isPeriodSubmittable(period, now),
      };
    });

    // The earliest period the beneficiary can actually act on.
    const actionablePeriod =
      periods.find((period) => period.submittable && period.status !== 'upcoming') ?? null;

    return {
      beneficiary,
      periods,
      submittedCount: reports.length,
      totalPeriods: TOTAL_REPORTING_PERIODS,
      actionablePeriod,
    };
  },

  /* ------------------------------ Reporting ----------------------------- */

  /**
   * Submit a monthly report, then upload its media.
   *
   * The report row is created first so the media has something to attach to,
   * and so a failed photo upload does not lose the written report — the
   * beneficiary can retry the attachment against a report that already exists.
   */
  async submitReport(
    beneficiary: BeneficiaryRow,
    period: ReportingPeriod,
    values: Record<string, unknown>,
    media: { file: LocalFile; type: 'image' | 'video'; caption?: string }[] = [],
  ): Promise<{ report: ProgressReportRow; mediaErrors: string[] }> {
    const existing = await supabase
      .from('progress_reports')
      .select('id')
      .eq('beneficiary_id', beneficiary.id)
      .eq('period_number', period.periodNumber)
      .maybeSingle();

    if (existing.data) {
      throw new AppError(
        'conflict',
        'Already submitted',
        `You have already submitted your ${period.label.toLowerCase()} report.`,
      );
    }

    const { data: report, error } = await supabase
      .from('progress_reports')
      .insert({
        beneficiary_id: beneficiary.id,
        application_id: beneficiary.application_id,
        applicant_id: beneficiary.applicant_id,
        period_number: period.periodNumber,
        period_start: period.periodStart.toISOString(),
        due_date: period.dueDate.toISOString(),
        status: 'submitted',
        data: values as Json,
        submitted_at: new Date().toISOString(),
        reviewed_by: null,
        reviewed_at: null,
        review_notes: null,
        review_score: null,
      })
      .select()
      .single();

    if (error) throw error;

    const mediaErrors = await this.attachMedia(report, beneficiary.applicant_id, media);

    await auditService.record({
      action: 'report.submitted',
      entityType: 'progress_report',
      entityId: report.id,
      actorId: beneficiary.applicant_id,
      metadata: {
        beneficiaryId: beneficiary.id,
        periodNumber: period.periodNumber,
        mediaCount: media.length - mediaErrors.length,
      },
    });

    return { report, mediaErrors };
  },

  /**
   * Upload media one at a time and collect failures rather than aborting.
   * Losing one photo should not discard the other five on a flaky connection.
   */
  async attachMedia(
    report: ProgressReportRow,
    applicantId: string,
    media: { file: LocalFile; type: 'image' | 'video'; caption?: string }[],
  ): Promise<string[]> {
    const errors: string[] = [];

    for (const item of media) {
      try {
        const uploaded = await storageService.uploadProgressMedia(
          applicantId,
          report.id,
          item.file,
          item.type,
        );

        const { error } = await supabase.from('progress_media').insert({
          report_id: report.id,
          applicant_id: applicantId,
          storage_path: uploaded.storagePath,
          media_type: item.type,
          mime_type: uploaded.mimeType,
          size_bytes: uploaded.sizeBytes,
          caption: item.caption ?? null,
          duration_seconds: null,
        });

        if (error) throw error;
      } catch (error) {
        logger.error('Progress media upload failed', error, { reportId: report.id });
        errors.push(item.file.name);
      }
    }

    return errors;
  },

  async getReportMedia(reportId: string): Promise<ProgressMediaRow[]> {
    const { data, error } = await supabase
      .from('progress_media')
      .select('*')
      .eq('report_id', reportId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data ?? [];
  },

  /** Signed URLs for a report's media, in one round trip. */
  async getMediaUrls(media: ProgressMediaRow[]): Promise<Record<string, string>> {
    return storageService.getSignedUrls(
      BUCKETS.progressMedia,
      media.map((item) => item.storage_path),
    );
  },

  /* ------------------------------ Review -------------------------------- */

  async reviewReport(
    reportId: string,
    reviewer: { id: string; role: Role },
    input: { notes?: string; score?: number },
  ): Promise<ProgressReportRow> {
    const { data, error } = await supabase
      .from('progress_reports')
      .update({
        status: 'reviewed',
        reviewed_by: reviewer.id,
        reviewed_at: new Date().toISOString(),
        review_notes: input.notes ?? null,
        review_score: input.score ?? null,
      })
      .eq('id', reportId)
      .select()
      .single();

    if (error) throw error;

    await auditService.record({
      action: 'report.reviewed',
      entityType: 'progress_report',
      entityId: reportId,
      actorId: reviewer.id,
      actorRole: reviewer.role,
      metadata: { score: input.score ?? null },
    });

    await notifications.raise('report_reviewed', data.applicant_id, {
      periodLabel: `Month ${data.period_number}`,
    });

    return data;
  },

  /* ---------------------------- Outcome (§19) --------------------------- */

  /**
   * Record an outcome evaluation. Scores are stored as a map of
   * dimension id -> 1..5 so dimensions can be added or renamed in configuration
   * without a migration, and no financial threshold is baked in anywhere.
   */
  async recordOutcome(
    beneficiaryId: string,
    evaluator: { id: string; role: Role },
    input: { verdict: string; scores: Record<string, number>; notes?: string },
  ): Promise<BeneficiaryRow> {
    const { data, error } = await supabase
      .from('beneficiaries')
      .update({
        outcome_verdict: input.verdict,
        outcome_scores: input.scores as Json,
        outcome_notes: input.notes ?? null,
        evaluated_by: evaluator.id,
        evaluated_at: new Date().toISOString(),
      })
      .eq('id', beneficiaryId)
      .select()
      .single();

    if (error) throw error;

    await auditService.record({
      action: 'outcome.evaluated',
      entityType: 'beneficiary',
      entityId: beneficiaryId,
      actorId: evaluator.id,
      actorRole: evaluator.role,
      metadata: { verdict: input.verdict, scores: input.scores },
    });

    return data;
  },

  /** Close out a completed monitoring year. */
  async complete(
    beneficiary: BeneficiaryRow,
    actor: { id: string; role: Role },
  ): Promise<void> {
    const { error } = await supabase
      .from('beneficiaries')
      .update({ status: 'completed' })
      .eq('id', beneficiary.id);

    if (error) throw error;

    await applicationService.applyTransition(
      beneficiary.application_id,
      'complete_grant',
      actor,
    );

    await auditService.record({
      action: 'monitoring.completed',
      entityType: 'beneficiary',
      entityId: beneficiary.id,
      actorId: actor.id,
      actorRole: actor.role,
    });
  },

  /* ---------------------------- Staff queries --------------------------- */

  async listBeneficiaries(
    options: { status?: BeneficiaryRow['status']; limit?: number } = {},
  ) {
    const { status = 'active', limit = 50 } = options;

    const { data, error } = await supabase
      .from('beneficiaries')
      .select('*, application:applications(applicant_name, business_name, registration_code, requested_amount)')
      .eq('status', status)
      .order('monitoring_started_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  },

  /** Reports awaiting a reviewer, newest first. */
  async listReportsForReview(limit = 50) {
    const { data, error } = await supabase
      .from('progress_reports')
      .select('*, applicant:profiles!progress_reports_applicant_id_fkey(full_name)')
      .in('status', ['submitted', 'under_review'])
      .order('submitted_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  },

  async countReportsAwaitingReview(): Promise<number> {
    const { count, error } = await supabase
      .from('progress_reports')
      .select('id', { count: 'exact', head: true })
      .in('status', ['submitted', 'under_review']);

    if (error) throw error;
    return count ?? 0;
  },
};
