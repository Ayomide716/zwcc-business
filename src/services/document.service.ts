/**
 * Document upload, replacement and verification.
 *
 * Replacing a document soft-deletes the previous row rather than overwriting
 * it, so a reviewer can always see that a document was changed and when.
 */
import {
  DOCUMENT_TYPES,
  getDocumentType,
  type DocumentStatus,
  type DocumentTypeDefinition,
} from '@/config/documents.config';
import { describeReason } from '@/config/rejection-reasons.config';
import { AppError, notFoundError } from '@/lib/errors';
import { BUCKETS, supabase } from '@/lib/supabase';
import type { DocumentRow } from '@/types/database';
import type { Role } from '@/types/roles';

import { auditService } from './audit.service';
import { notifications } from './notifications';
import {
  storageService,
  type LocalFile,
  type UploadProgressHandler,
} from './storage.service';

/** A document type paired with whatever has been uploaded against it. */
export interface DocumentSlot {
  typeId: string;
  label: string;
  description: string;
  category: string;
  requirement: 'required' | 'optional';
  status: DocumentStatus;
  document: DocumentRow | null;
  rejectionReason: string | null;
}

const CATEGORY_ORDER = ['personal', 'business', 'church', 'other'];

/** Configured document types in the order the upload screen should show them. */
function getActiveTypes(): DocumentTypeDefinition[] {
  return [...DOCUMENT_TYPES].sort((a, b) => {
    const byCategory =
      CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
    return byCategory !== 0 ? byCategory : a.order - b.order;
  });
}

export const documentService = {
  /**
   * The upload screen's data model: every configured document type, with its
   * current upload state. Types with no upload show as `missing`, so the screen
   * renders from configuration rather than from whatever happens to exist.
   */
  buildSlots(documents: DocumentRow[], types = getActiveTypes()): DocumentSlot[] {
    const live = documents.filter((doc) => !doc.deleted_at);

    return types.map((type) => {
      const document = live.find((doc) => doc.document_type_id === type.id) ?? null;

      return {
        typeId: type.id,
        label: type.label,
        description: type.description,
        category: type.category,
        requirement: type.requirement,
        status: (document?.status ?? 'missing') as DocumentStatus,
        document,
        rejectionReason: document?.rejection_reason_code
          ? describeReason('document_rejection', document.rejection_reason_code)
          : null,
      };
    });
  },

  /**
   * Upload a document, replacing any existing one for the same type.
   *
   * Order matters: the file is uploaded first, then the old row is soft-deleted
   * and the new row inserted. If the upload fails the applicant keeps whatever
   * they had before, which is the safer failure.
   */
  async upload(
    applicationId: string,
    applicantId: string,
    documentTypeId: string,
    file: LocalFile,
    onProgress?: UploadProgressHandler,
  ): Promise<DocumentRow> {
    const type = getDocumentType(documentTypeId);
    if (!type) throw notFoundError('that document type');

    const uploaded = await storageService.uploadDocument(
      applicantId,
      applicationId,
      documentTypeId,
      file,
      onProgress,
    );

    const existing = await this.getLiveDocument(applicationId, documentTypeId);

    if (existing) {
      const { error } = await supabase
        .from('documents')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', existing.id);

      if (error) {
        // Roll back the orphaned object so storage does not fill with files no
        // row points at.
        await storageService.remove(BUCKETS.documents, uploaded.storagePath);
        throw error;
      }
    }

    const { data, error } = await supabase
      .from('documents')
      .insert({
        application_id: applicationId,
        applicant_id: applicantId,
        document_type_id: documentTypeId,
        storage_path: uploaded.storagePath,
        file_name: uploaded.fileName,
        mime_type: uploaded.mimeType,
        size_bytes: uploaded.sizeBytes,
        status: 'uploaded',
        verified_by: null,
        verified_at: null,
        rejection_reason_code: null,
        rejection_note: null,
        version: (existing?.version ?? 0) + 1,
        deleted_at: null,
      })
      .select()
      .single();

    if (error) {
      await storageService.remove(BUCKETS.documents, uploaded.storagePath);
      throw error;
    }

    await auditService.record({
      action: existing ? 'document.replaced' : 'document.uploaded',
      entityType: 'document',
      entityId: data.id,
      actorId: applicantId,
      metadata: {
        applicationId,
        documentTypeId,
        fileName: uploaded.fileName,
        sizeBytes: uploaded.sizeBytes,
        version: data.version,
      },
    });

    return data;
  },

  async getLiveDocument(
    applicationId: string,
    documentTypeId: string,
  ): Promise<DocumentRow | null> {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('application_id', applicationId)
      .eq('document_type_id', documentTypeId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  /**
   * Applicant removes a document they uploaded. Soft delete only — the storage
   * object is removed too, but the row survives as evidence of what happened.
   */
  async remove(documentId: string, actorId: string): Promise<void> {
    const { data: document, error: readError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (readError) throw readError;
    if (!document) throw notFoundError('that document');

    if (document.status === 'verified') {
      throw new AppError(
        'permission',
        'Already verified',
        'This document has been verified and can no longer be removed.',
      );
    }

    const { error } = await supabase
      .from('documents')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', documentId);

    if (error) throw error;

    await storageService.remove(BUCKETS.documents, document.storage_path);

    await auditService.record({
      action: 'document.deleted',
      entityType: 'document',
      entityId: documentId,
      actorId,
      metadata: { applicationId: document.application_id, typeId: document.document_type_id },
    });
  },

  /** Signed URL for previewing a document. Buckets are private. */
  async getPreviewUrl(document: DocumentRow): Promise<string> {
    return storageService.getDocumentUrl(document.storage_path);
  },

  /* ---------------------------- Verification ---------------------------- */

  async verify(
    documentId: string,
    reviewer: { id: string; role: Role },
  ): Promise<DocumentRow> {
    const { data, error } = await supabase
      .from('documents')
      .update({
        status: 'verified',
        verified_by: reviewer.id,
        verified_at: new Date().toISOString(),
        rejection_reason_code: null,
        rejection_note: null,
      })
      .eq('id', documentId)
      .select()
      .single();

    if (error) throw error;

    await auditService.record({
      action: 'document.verified',
      entityType: 'document',
      entityId: documentId,
      actorId: reviewer.id,
      actorRole: reviewer.role,
      metadata: { applicationId: data.application_id, typeId: data.document_type_id },
    });

    await notifications.raise('document_verified', data.applicant_id, {
      documentLabel: getDocumentType(data.document_type_id)?.label ?? 'document',
    });

    return data;
  },

  async reject(
    documentId: string,
    reviewer: { id: string; role: Role },
    reasonCode: string,
    note?: string,
  ): Promise<DocumentRow> {
    const { data, error } = await supabase
      .from('documents')
      .update({
        status: 'rejected',
        verified_by: reviewer.id,
        verified_at: new Date().toISOString(),
        rejection_reason_code: reasonCode,
        rejection_note: note ?? null,
      })
      .eq('id', documentId)
      .select()
      .single();

    if (error) throw error;

    await auditService.record({
      action: 'document.rejected',
      entityType: 'document',
      entityId: documentId,
      actorId: reviewer.id,
      actorRole: reviewer.role,
      metadata: {
        applicationId: data.application_id,
        typeId: data.document_type_id,
        reasonCode,
      },
    });

    await notifications.raise('document_rejected', data.applicant_id, {
      documentLabel: getDocumentType(data.document_type_id)?.label ?? 'document',
      reason: note ?? describeReason('document_rejection', reasonCode),
    });

    return data;
  },

  /** Mark everything uploaded on an application as being looked at. */
  async markUnderReview(applicationId: string): Promise<void> {
    const { error } = await supabase
      .from('documents')
      .update({ status: 'under_review' })
      .eq('application_id', applicationId)
      .eq('status', 'uploaded')
      .is('deleted_at', null);

    if (error) throw error;
  },
};
