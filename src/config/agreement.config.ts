/**
 * Grant agreement (brief §16).
 *
 * Reviewed and approved by Zion World Christian Center's lawyer on the wording
 * as it stood in the app, and published as version 1 on 25 September 2026.
 * The only changes at publication were removing the bracketed drafting notes,
 * dropping the final clause (which held nothing but a placeholder), removing
 * the "this is a draft" acknowledgement, and retiring the draft notice. No
 * wording was added.
 *
 * Every issued agreement stores a frozen copy of its clauses and the version it
 * was issued under. Changing this file never rewrites an agreement someone has
 * already received or signed: those keep the text, and the draft notice, they
 * actually agreed to. Any future change here should go back to the church's
 * lawyer and must bump AGREEMENT_TEMPLATE_VERSION.
 */

export type SignatureMethod = 'typed_name' | 'drawn_signature' | 'uploaded_document';

/**
 * Only typed-name signing is implemented for the MVP. The other two methods are
 * declared, and the data model stores `method` + `signature_data`, so adding
 * signature capture or a signed-PDF upload later needs no schema change.
 */
export const SIGNATURE_METHODS: Record<
  SignatureMethod,
  { label: string; enabled: boolean; description: string }
> = {
  typed_name: {
    label: 'Type your full name',
    enabled: true,
    description: 'Type your full legal name exactly as it appears on your application.',
  },
  drawn_signature: {
    label: 'Draw your signature',
    enabled: false,
    description: 'Sign with your finger on the screen.',
  },
  uploaded_document: {
    label: 'Upload a signed copy',
    enabled: false,
    description: 'Print, sign and upload a scan of the agreement.',
  },
};

export function getEnabledSignatureMethods(): SignatureMethod[] {
  return (Object.keys(SIGNATURE_METHODS) as SignatureMethod[]).filter(
    (method) => SIGNATURE_METHODS[method].enabled,
  );
}

export interface AgreementClause {
  id: string;
  heading: string;
  body: string;
}

/**
 * The notice every draft-1 agreement was issued with. No longer attached to new
 * agreements; kept so that agreements issued under the draft, whose frozen copy
 * predates notices being stored, still show honestly that they were drafts.
 */
export const DRAFT_AGREEMENT_NOTICE =
  'This is placeholder agreement text for demonstration only. The final grant agreement will be provided by Zion World Christian Center and must be reviewed by their legal advisers before this app is used in production.';

/** Template versions issued before the lawyer approved the text. */
export const DRAFT_TEMPLATE_VERSIONS = ['draft-1'];

/**
 * Current template. Versioned: a signed agreement stores the version it was
 * signed against, so replacing this content never rewrites history.
 */
export const AGREEMENT_TEMPLATE_VERSION = '1';

export const AGREEMENT_CLAUSES: AgreementClause[] = [
  {
    id: 'parties',
    heading: '1. Parties',
    body: 'This agreement is between Zion World Christian Center ("the Grantor") and the named beneficiary ("the Beneficiary") in respect of a grant awarded under the 2026 ZWCC Business Grant programme.',
  },
  {
    id: 'purpose',
    heading: '2. Purpose of the grant',
    body: 'The grant is awarded solely for the business purposes described in the Beneficiary’s approved application and proposal.',
  },
  {
    id: 'use_of_funds',
    heading: '3. Use of funds',
    body: 'The Beneficiary agrees to apply the grant to the business activities set out in their proposal, and to keep reasonable records of how the funds were used.',
  },
  {
    id: 'reporting',
    heading: '4. Monthly reporting',
    body: 'The Beneficiary agrees to submit a business progress report each month for twelve months from the start of the monitoring period, including supporting photographs or video where requested.',
  },
  {
    id: 'monitoring',
    heading: '5. Monitoring and review',
    body: 'The Grantor may review the Beneficiary’s reports and request reasonable further information in order to assess the outcome of the grant.',
  },
  {
    id: 'accuracy',
    heading: '6. Accuracy of information',
    body: 'The Beneficiary confirms that all information and documents provided in support of the application are true and accurate.',
  },
  {
    id: 'data',
    heading: '7. Data protection',
    body: 'Personal data is handled in line with the programme Privacy Policy.',
  },
];

/** Confirmations the applicant ticks before the signature field unlocks. */
export const AGREEMENT_ACKNOWLEDGEMENTS = [
  { id: 'read', label: 'I have read the grant agreement in full.' },
  { id: 'understood', label: 'I understand my reporting obligations for the next twelve months.' },
];
