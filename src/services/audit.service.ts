/**
 * Audit trail (brief §26).
 *
 * Every action that matters is recorded here. Writes are best-effort by design:
 * failing to log must never fail the user's action, but the failure is logged
 * locally so it is visible in crash reporting.
 *
 * `audit_logs` has no UPDATE or DELETE policy for any role, so entries cannot
 * be edited or removed through the API once written.
 */
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { Json } from '@/types/database';
import type { Role } from '@/types/roles';

/** Canonical action names. Keeping them in one union stops near-duplicates. */
export type AuditAction =
  | 'application.created'
  | 'application.updated'
  | 'application.submitted'
  | 'application.status_changed'
  | 'application.withdrawn'
  | 'application.reapplied'
  | 'document.uploaded'
  | 'document.replaced'
  | 'document.deleted'
  | 'document.verified'
  | 'document.rejected'
  | 'review.created'
  | 'review.note_added'
  | 'review.scored'
  | 'application.approved'
  | 'application.rejected'
  | 'agreement.issued'
  | 'agreement.signed'
  | 'disbursement.authorised'
  | 'monitoring.started'
  | 'monitoring.completed'
  | 'report.submitted'
  | 'report.reviewed'
  | 'outcome.evaluated'
  | 'user.role_changed'
  | 'user.profile_updated'
  | 'admin.setting_changed'
  | 'admin.document_type_changed'
  | 'auth.signed_in'
  | 'auth.signed_out'
  | 'auth.registered';

export type AuditEntity =
  | 'application'
  | 'document'
  | 'agreement'
  | 'beneficiary'
  | 'progress_report'
  | 'profile'
  | 'setting'
  | 'document_type'
  | 'session';

interface AuditInput {
  action: AuditAction;
  entityType: AuditEntity;
  entityId?: string | null;
  actorId?: string | null;
  actorRole?: Role | null;
  metadata?: Record<string, unknown>;
}

export const auditService = {
  /**
   * Record an action. Never throws — a logging failure must not roll back the
   * user's work.
   */
  async record(input: AuditInput): Promise<void> {
    try {
      const actorId = input.actorId ?? (await supabase.auth.getUser()).data.user?.id ?? null;

      const { error } = await supabase.from('audit_logs').insert({
        actor_id: actorId,
        actor_role: input.actorRole ?? null,
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId ?? null,
        metadata: (input.metadata ?? {}) as Json,
      });

      if (error) throw error;
    } catch (error) {
      logger.error('Audit write failed', error, { action: input.action });
    }
  },

  /** Recent entries, for the admin audit screen. */
  async list(options: { limit?: number; entityType?: AuditEntity; entityId?: string } = {}) {
    const { limit = 50, entityType, entityId } = options;

    let query = supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (entityType) query = query.eq('entity_type', entityType);
    if (entityId) query = query.eq('entity_id', entityId);

    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },
};
