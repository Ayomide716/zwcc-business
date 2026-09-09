/**
 * Service layer barrel.
 *
 * Screens and hooks import from here. Services own all Supabase access — no
 * component ever calls `supabase` directly, which keeps queries, error mapping
 * and audit logging in one place.
 */
export { applicationService, buildWorkflowContext } from './application.service';
export type { ApplicationWithContext } from './application.service';
export { documentService } from './document.service';
export type { DocumentSlot } from './document.service';
export { reviewService } from './review.service';
export { agreementService } from './agreement.service';
export { monitoringService } from './monitoring.service';
export type { MonitoringOverview, TimelinePeriod } from './monitoring.service';
export { profileService } from './profile.service';
export { storageService } from './storage.service';
export type { LocalFile, UploadedFile } from './storage.service';
export { auditService } from './audit.service';
export type { AuditAction, AuditEntity } from './audit.service';
export { notifications } from './notifications';
