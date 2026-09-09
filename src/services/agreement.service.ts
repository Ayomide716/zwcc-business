/**
 * Grant agreements (brief §16).
 *
 * The signing flow is real; the agreement text is placeholder and labelled as
 * such throughout. Two design decisions matter for when the real terms arrive:
 *
 *   1. Issuing an agreement freezes a snapshot of the clauses onto the row.
 *      Editing the template later can never change what somebody already
 *      signed.
 *   2. The signature is stored as `method` + `data`, so adding drawn-signature
 *      capture or signed-PDF upload later is a new method value, not a schema
 *      change.
 */
import {
  AGREEMENT_CLAUSES,
  AGREEMENT_PLACEHOLDER_NOTICE,
  AGREEMENT_TEMPLATE_VERSION,
  type SignatureMethod,
} from '@/config/agreement.config';
import { AppError, notFoundError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type { AgreementRow, Json } from '@/types/database';
import type { Role } from '@/types/roles';

import { applicationService } from './application.service';
import { auditService } from './audit.service';

export const agreementService = {
  async getByApplication(applicationId: string): Promise<AgreementRow | null> {
    const { data, error } = await supabase
      .from('agreements')
      .select('*')
      .eq('application_id', applicationId)
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  /**
   * Issue the agreement and move the application to `agreement_pending`.
   *
   * The clause text is copied onto the row as `content_snapshot` at this
   * moment — that snapshot, not the current config, is what the applicant is
   * shown and what they sign against.
   */
  async issue(
    applicationId: string,
    applicantId: string,
    issuer: { id: string; role: Role },
  ): Promise<AgreementRow> {
    const existing = await this.getByApplication(applicationId);

    const agreement =
      existing ??
      (await (async () => {
        const { data, error } = await supabase
          .from('agreements')
          .insert({
            application_id: applicationId,
            applicant_id: applicantId,
            template_version: AGREEMENT_TEMPLATE_VERSION,
            content_snapshot: {
              notice: AGREEMENT_PLACEHOLDER_NOTICE,
              clauses: AGREEMENT_CLAUSES,
              issuedAt: new Date().toISOString(),
            } as unknown as Json,
            status: 'issued',
            issued_at: new Date().toISOString(),
            issued_by: issuer.id,
            signed_at: null,
            signature_method: null,
            signature_data: null,
            signer_name: null,
            document_path: null,
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      })());

    await applicationService.applyTransition(applicationId, 'issue_agreement', issuer);

    await auditService.record({
      action: 'agreement.issued',
      entityType: 'agreement',
      entityId: agreement.id,
      actorId: issuer.id,
      actorRole: issuer.role,
      metadata: { applicationId, templateVersion: agreement.template_version },
    });

    return agreement;
  },

  /**
   * Sign the agreement.
   *
   * For the typed-name method the signer must type their name exactly as it
   * appears on the application. That check is here rather than in the screen so
   * it cannot be skipped.
   */
  async sign(
    applicationId: string,
    signer: { id: string; role: Role },
    input: {
      method: SignatureMethod;
      /** Typed name, or signature payload for other methods. */
      signatureData: string;
      /** The name on the application, used to validate a typed signature. */
      expectedName: string;
    },
  ): Promise<AgreementRow> {
    const agreement = await this.getByApplication(applicationId);
    if (!agreement) throw notFoundError('your agreement');

    if (agreement.status === 'signed') {
      throw new AppError(
        'conflict',
        'Already signed',
        'This agreement has already been signed.',
      );
    }

    const typed = input.signatureData.trim();

    if (input.method === 'typed_name') {
      if (!namesMatch(typed, input.expectedName)) {
        throw new AppError(
          'validation',
          'Name does not match',
          'Please type your full name exactly as it appears on your application.',
        );
      }
    } else if (!typed) {
      throw new AppError('validation', 'Signature required', 'Please provide your signature.');
    }

    const { data, error } = await supabase
      .from('agreements')
      .update({
        status: 'signed',
        signed_at: new Date().toISOString(),
        signature_method: input.method,
        signature_data: typed,
        signer_name: typed,
      })
      .eq('id', agreement.id)
      .eq('status', 'issued')
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      throw new AppError(
        'conflict',
        'Could not sign',
        'This agreement could not be signed. Please refresh and try again.',
        true,
      );
    }

    await applicationService.applyTransition(applicationId, 'sign_agreement', signer);

    await auditService.record({
      action: 'agreement.signed',
      entityType: 'agreement',
      entityId: data.id,
      actorId: signer.id,
      actorRole: signer.role,
      metadata: { applicationId, method: input.method },
    });

    return data;
  },

  /**
   * The clauses to display. Reads the frozen snapshot when one exists so a
   * signed agreement always renders the text that was actually agreed.
   */
  getDisplayContent(agreement: AgreementRow | null) {
    const snapshot = agreement?.content_snapshot as
      | { notice?: string; clauses?: typeof AGREEMENT_CLAUSES }
      | null;

    if (snapshot?.clauses?.length) {
      return {
        notice: snapshot.notice ?? AGREEMENT_PLACEHOLDER_NOTICE,
        clauses: snapshot.clauses,
        version: agreement?.template_version ?? AGREEMENT_TEMPLATE_VERSION,
      };
    }

    return {
      notice: AGREEMENT_PLACEHOLDER_NOTICE,
      clauses: AGREEMENT_CLAUSES,
      version: AGREEMENT_TEMPLATE_VERSION,
    };
  },
};

/**
 * Compare a typed signature to the applicant's name, tolerating case,
 * punctuation and extra spaces but not a different name.
 */
function namesMatch(typed: string, expected: string): boolean {
  const normalise = (value: string) =>
    value
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  return normalise(typed) === normalise(expected);
}
