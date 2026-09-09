/**
 * Typed shape of the Supabase schema.
 *
 * Hand-maintained to match `supabase/migrations/*.sql`. When the schema
 * changes, either regenerate with
 *   `supabase gen types typescript --project-id <ref> > src/types/database.ts`
 * or edit both in the same commit — the two are checked against each other by
 * `npm run typecheck` only insofar as the app uses them, so keep them honest.
 */
import type { Role } from './roles';

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

/** Convenience: every table carries these. */
interface Timestamps {
  created_at: string;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Row types                                                                   */
/* -------------------------------------------------------------------------- */

export interface ProfileRow extends Timestamps {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: Role;
  avatar_url: string | null;
  onboarding_completed_at: string | null;
  deleted_at: string | null;
}

export interface GrantProgramRow extends Timestamps {
  id: string;
  slug: string;
  name: string;
  year: number;
  summary: string | null;
  is_active: boolean;
  /** Snapshot of programme-level configuration, editable by admins. */
  config: Json;
}

export interface WorkflowStatusRow {
  id: string;
  label: string;
  phase: string;
  tone: string;
  sort_order: number;
  is_terminal: boolean;
  is_active: boolean;
  metadata: Json;
  created_at: string;
}

export interface ApplicationRow extends Timestamps {
  id: string;
  applicant_id: string;
  program_id: string;
  status: string;
  registration_code: string | null;
  /** All form answers, keyed by field id from `form.config.ts`. */
  form_data: Json;
  /** Last step the applicant had open, so "continue later" resumes in place. */
  current_step: string | null;
  /** Steps the applicant has completed and validated. */
  completed_steps: string[];

  /* Promoted for search / sort / aggregation — see PROMOTED_FIELDS. */
  applicant_name: string | null;
  applicant_phone: string | null;
  business_name: string | null;
  business_sector: string | null;
  requested_amount: number | null;

  submitted_at: string | null;
  decided_at: string | null;
  decision_reason_code: string | null;
  decision_reason_note: string | null;

  /** Reapplication chain — never overwrite a historical application (§15). */
  previous_application_id: string | null;
  attempt_number: number;

  deleted_at: string | null;
}

export interface BusinessRow extends Timestamps {
  id: string;
  application_id: string;
  applicant_id: string;
  name: string;
  sector: string | null;
  stage: string | null;
  description: string | null;
  address: string | null;
  is_registered: boolean | null;
  cac_number: string | null;
  employees_count: number | null;
  monthly_revenue: number | null;
}

export interface DocumentTypeRow {
  id: string;
  label: string;
  description: string | null;
  category: string;
  requirement: 'required' | 'optional';
  accepts: string[];
  max_size_mb: number;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DocumentRow extends Timestamps {
  id: string;
  application_id: string;
  applicant_id: string;
  document_type_id: string;
  /** Path inside the private `application-documents` bucket. */
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  status: 'uploaded' | 'under_review' | 'verified' | 'rejected';
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason_code: string | null;
  rejection_note: string | null;
  /** Incremented when a document is replaced, so re-uploads are traceable. */
  version: number;
  deleted_at: string | null;
}

export interface DeviceTokenRow extends Timestamps {
  id: string;
  user_id: string;
  /** The Expo push token, e.g. ExponentPushToken[xxxxxxxx]. */
  token: string;
  platform: 'ios' | 'android' | 'web';
  is_active: boolean;
  last_seen_at: string;
}

export interface ApplicationReviewRow extends Timestamps {
  id: string;
  application_id: string;
  reviewer_id: string;
  stage: string;
  decision: 'approve' | 'reject' | 'request_changes' | 'note' | 'score' | null;
  notes: string | null;
  /** Internal notes are never visible to the applicant (enforced by RLS). */
  is_internal: boolean;
  /** Criterion id to a 1-5 value. Keys come from `scoring.config.ts`. */
  scores: Record<string, number>;
  /** `RUBRIC_VERSION` when scored. Scores across versions are not comparable. */
  rubric_version: number | null;
}

export interface StatusHistoryRow {
  id: string;
  application_id: string;
  from_status: string | null;
  to_status: string;
  transition_id: string | null;
  actor_id: string | null;
  reason_code: string | null;
  reason_note: string | null;
  created_at: string;
}

export interface AgreementRow extends Timestamps {
  id: string;
  application_id: string;
  applicant_id: string;
  template_version: string;
  /** Frozen copy of the clauses as presented, so a later edit cannot rewrite
   *  what somebody actually signed. */
  content_snapshot: Json;
  status: 'issued' | 'signed' | 'void';
  issued_at: string;
  issued_by: string | null;
  signed_at: string | null;
  signature_method: string | null;
  /** Typed name today; base64 stroke data or a storage path later. */
  signature_data: string | null;
  signer_name: string | null;
  /** Path in the private `agreements` bucket, once PDF generation is added. */
  document_path: string | null;
}

export interface BeneficiaryRow extends Timestamps {
  id: string;
  application_id: string;
  applicant_id: string;
  business_id: string | null;
  monitoring_started_at: string;
  monitoring_ends_at: string;
  status: 'active' | 'completed' | 'paused';
  outcome_verdict: string | null;
  outcome_scores: Json;
  outcome_notes: string | null;
  evaluated_by: string | null;
  evaluated_at: string | null;
}

export interface ProgressReportRow extends Timestamps {
  id: string;
  beneficiary_id: string;
  application_id: string;
  applicant_id: string;
  period_number: number;
  period_start: string;
  due_date: string;
  status: 'submitted' | 'under_review' | 'reviewed';
  /** Answers keyed by field id from `monitoring.config.ts`. */
  data: Json;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  review_score: number | null;
}

export interface ProgressMediaRow {
  id: string;
  report_id: string;
  applicant_id: string;
  storage_path: string;
  media_type: 'image' | 'video';
  mime_type: string;
  size_bytes: number;
  caption: string | null;
  duration_seconds: number | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  event_id: string;
  category: string;
  title: string;
  body: string;
  route: string | null;
  payload: Json;
  important: boolean;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationDeliveryRow {
  id: string;
  notification_id: string;
  channel: string;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  provider: string | null;
  error: string | null;
  attempted_at: string | null;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: Json;
  created_at: string;
}

export interface AppSettingRow {
  key: string;
  value: Json;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
}

/* -------------------------------------------------------------------------- */
/* Supabase Database generic                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Insert/Update shapes. Columns with database defaults (ids, timestamps) are
 * optional on insert; everything is optional on update.
 */
/** Keys whose column accepts NULL, and which Postgres therefore defaults. */
type NullableKeys<T> = {
  [K in keyof T]-?: null extends T[K] ? K : never;
}[keyof T];

/**
 * Insert shape: columns with a database default (ids, timestamps) and every
 * nullable column are optional, matching what Postgres actually requires.
 */
type Insertable<T, DefaultedKeys extends keyof T = never> = Omit<
  T,
  DefaultedKeys | NullableKeys<T>
> &
  Partial<Pick<T, DefaultedKeys | NullableKeys<T>>>;

type DefaultCols = 'id' | 'created_at' | 'updated_at';

/**
 * Collapses an interface (or an intersection) into a plain object type.
 *
 * postgrest-js constrains Row/Insert/Update to `Record<string, unknown>`, and
 * TypeScript only grants an *implicit index signature* to anonymous object
 * types — never to an `interface`. Without this, every table silently fails the
 * `GenericSchema` constraint and every query result degrades to `never`.
 */
type Flatten<T> = { [K in keyof T]: T[K] };

interface TableDef<Row, Insert, Update> {
  Row: Flatten<Row>;
  Insert: Flatten<Insert>;
  Update: Flatten<Update>;
  Relationships: [];
}

export interface Database {
  public: {
    Tables: {
      profiles: TableDef<
        ProfileRow,
        Insertable<ProfileRow, 'created_at' | 'updated_at'>,
        Partial<ProfileRow>
      >;
      grant_programs: TableDef<
        GrantProgramRow,
        Insertable<GrantProgramRow, DefaultCols>,
        Partial<GrantProgramRow>
      >;
      workflow_statuses: TableDef<
        WorkflowStatusRow,
        Insertable<WorkflowStatusRow, 'created_at'>,
        Partial<WorkflowStatusRow>
      >;
      applications: TableDef<
        ApplicationRow,
        Insertable<ApplicationRow, DefaultCols>,
        Partial<ApplicationRow>
      >;
      businesses: TableDef<
        BusinessRow,
        Insertable<BusinessRow, DefaultCols>,
        Partial<BusinessRow>
      >;
      document_types: TableDef<
        DocumentTypeRow,
        Insertable<DocumentTypeRow, 'created_at' | 'updated_at'>,
        Partial<DocumentTypeRow>
      >;
      documents: TableDef<
        DocumentRow,
        Insertable<DocumentRow, DefaultCols>,
        Partial<DocumentRow>
      >;
      device_tokens: TableDef<
        DeviceTokenRow,
        Insertable<DeviceTokenRow, DefaultCols | 'is_active' | 'last_seen_at'>,
        Partial<DeviceTokenRow>
      >;
      application_reviews: TableDef<
        ApplicationReviewRow,
        // `scores` defaults to '{}' in the database, so a note or a decision
        // need not send one.
        Insertable<ApplicationReviewRow, DefaultCols | 'scores'>,
        Partial<ApplicationReviewRow>
      >;
      application_status_history: TableDef<
        StatusHistoryRow,
        Insertable<StatusHistoryRow, 'id' | 'created_at'>,
        Partial<StatusHistoryRow>
      >;
      agreements: TableDef<
        AgreementRow,
        Insertable<AgreementRow, DefaultCols>,
        Partial<AgreementRow>
      >;
      beneficiaries: TableDef<
        BeneficiaryRow,
        Insertable<BeneficiaryRow, DefaultCols>,
        Partial<BeneficiaryRow>
      >;
      progress_reports: TableDef<
        ProgressReportRow,
        Insertable<ProgressReportRow, DefaultCols>,
        Partial<ProgressReportRow>
      >;
      progress_media: TableDef<
        ProgressMediaRow,
        Insertable<ProgressMediaRow, 'id' | 'created_at'>,
        Partial<ProgressMediaRow>
      >;
      notifications: TableDef<
        NotificationRow,
        Insertable<NotificationRow, 'id' | 'created_at'>,
        Partial<NotificationRow>
      >;
      notification_deliveries: TableDef<
        NotificationDeliveryRow,
        Insertable<NotificationDeliveryRow, 'id' | 'created_at'>,
        Partial<NotificationDeliveryRow>
      >;
      audit_logs: TableDef<
        AuditLogRow,
        Insertable<AuditLogRow, 'id' | 'created_at'>,
        Partial<AuditLogRow>
      >;
      app_settings: TableDef<
        AppSettingRow,
        Insertable<AppSettingRow, 'updated_at'>,
        Partial<AppSettingRow>
      >;
    };
    // `{ [_ in never]: never }` is the idiom `supabase gen types` emits for an
    // empty group. `Record<string, never>` looks equivalent but fails
    // postgrest-js's GenericSchema constraint, which silently degrades every
    // query result to `never`.
    Views: { [_ in never]: never };
    Functions: {
      /**
       * Inserts a notification for every committee member and administrator.
       * SECURITY DEFINER, guarded by application ownership — see migration
       * 0005. Called through `notifications.notifyStaff()`, never directly.
       */
      notify_staff_about_application: {
        Args: {
          p_application_id: string;
          p_event_id: string;
          p_category: string;
          p_title: string;
          p_body: string;
          p_route: string | null;
          p_payload: Json;
          p_important: boolean;
        };
        /** Number of staff notified. */
        Returns: number;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
