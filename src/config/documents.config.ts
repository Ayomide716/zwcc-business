/**
 * Document requirements.
 *
 * The client has named four documents but has not finalised which are strictly
 * required. The MVP applies a sensible default (personal + business identity
 * required; church-related forms optional) and keeps every knob here so the
 * requirement can be flipped without touching the upload screens.
 *
 * Adding a new document type is a one-object change in `DOCUMENT_TYPES`, plus a
 * row in `document_types` (see the seed migration) so historical records keep
 * referring to a stable id.
 */

export type DocumentRequirement = 'required' | 'optional';

/** Lifecycle of a single uploaded file. */
export const DOCUMENT_STATUSES = [
  'missing',
  'uploaded',
  'under_review',
  'verified',
  'rejected',
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export type DocumentCategory = 'personal' | 'business' | 'church' | 'other';

export interface DocumentTypeDefinition {
  /** Stable key. Never rename — it is stored on every uploaded row. */
  id: string;
  label: string;
  /** Shown under the title on the upload card. */
  description: string;
  category: DocumentCategory;
  requirement: DocumentRequirement;
  /** MIME types accepted by the picker. */
  accepts: string[];
  /** Hard ceiling in megabytes, enforced before upload starts. */
  maxSizeMb: number;
  /** Whether the camera shortcut is offered (photo-style documents). */
  allowCamera: boolean;
  /** Display order within its category. */
  order: number;
  /** Extra guidance shown in the help sheet. */
  hint?: string;
}

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  personal: 'Personal verification',
  business: 'Business verification',
  church: 'Church verification',
  other: 'Other documents',
};

const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
const DOCUMENT_FILE_TYPES = ['application/pdf', ...IMAGE_TYPES];

export const DOCUMENT_TYPES: DocumentTypeDefinition[] = [
  {
    id: 'passport_photograph',
    label: 'Passport photograph',
    description: 'A recent, clear passport photograph of the applicant.',
    category: 'personal',
    requirement: 'required',
    accepts: IMAGE_TYPES,
    maxSizeMb: 5,
    allowCamera: true,
    order: 1,
    hint: 'Use a plain background and make sure your full face is visible and in focus.',
  },
  {
    id: 'means_of_identification',
    label: 'Means of identification',
    description: 'Any government-issued ID — NIN slip, driver’s licence, voter’s card or passport.',
    category: 'personal',
    requirement: 'required',
    accepts: DOCUMENT_FILE_TYPES,
    maxSizeMb: 10,
    allowCamera: true,
    order: 2,
    hint: 'All four corners of the document should be visible and the text readable.',
  },
  {
    id: 'cac_document',
    label: 'CAC registration document',
    description: 'Corporate Affairs Commission certificate or status report for your business.',
    category: 'business',
    requirement: 'required',
    accepts: DOCUMENT_FILE_TYPES,
    maxSizeMb: 10,
    allowCamera: true,
    order: 1,
    hint: 'If your business is not yet registered, upload any evidence of business activity and tell us in your proposal.',
  },
  {
    id: 'business_evidence',
    label: 'Evidence of business activity',
    description: 'Photographs of your shop, stock, workspace, or recent sales records.',
    category: 'business',
    requirement: 'optional',
    accepts: DOCUMENT_FILE_TYPES,
    maxSizeMb: 15,
    allowCamera: true,
    order: 2,
  },
  {
    id: 'cell_leader_verification',
    label: 'Cell leader verification form',
    description: 'The verification form completed and signed by your cell leader.',
    category: 'church',
    requirement: 'optional',
    accepts: DOCUMENT_FILE_TYPES,
    maxSizeMb: 10,
    allowCamera: true,
    order: 1,
    hint: 'This applies if you are connected to a ZWCC cell. The grant is open to non-members too.',
  },
  {
    id: 'believers_form',
    label: 'Believer’s completed form',
    description: 'Your completed believer’s form, if you have one.',
    category: 'other',
    requirement: 'optional',
    accepts: DOCUMENT_FILE_TYPES,
    maxSizeMb: 10,
    allowCamera: true,
    order: 1,
  },
];

/* -------------------------------------------------------------------------- */
/* Media accepted for monthly monitoring reports                               */
/* -------------------------------------------------------------------------- */

export const PROGRESS_MEDIA_CONFIG = {
  image: {
    accepts: IMAGE_TYPES,
    maxSizeMb: 8,
    maxCount: 6,
    /**
     * Photos are re-encoded before upload. Nigeria is a primary market and
     * mobile data is expensive — a 4MB camera photo becomes roughly 200KB with
     * no meaningful loss at phone-screen sizes.
     */
    compression: { maxWidth: 1600, quality: 0.7 },
  },
  video: {
    accepts: ['video/mp4', 'video/quicktime'],
    maxSizeMb: 50,
    maxCount: 2,
    maxDurationSeconds: 60,
  },
} as const;

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

export function getDocumentType(id: string): DocumentTypeDefinition | undefined {
  return DOCUMENT_TYPES.find((type) => type.id === id);
}

export function getRequiredDocumentTypes(): DocumentTypeDefinition[] {
  return DOCUMENT_TYPES.filter((type) => type.requirement === 'required');
}

export function getDocumentTypesByCategory(): {
  category: DocumentCategory;
  label: string;
  types: DocumentTypeDefinition[];
}[] {
  const categories: DocumentCategory[] = ['personal', 'business', 'church', 'other'];
  return categories
    .map((category) => ({
      category,
      label: DOCUMENT_CATEGORY_LABELS[category],
      types: DOCUMENT_TYPES.filter((type) => type.category === category).sort(
        (a, b) => a.order - b.order,
      ),
    }))
    .filter((group) => group.types.length > 0);
}

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  missing: 'Not uploaded',
  uploaded: 'Uploaded',
  under_review: 'Under review',
  verified: 'Verified',
  rejected: 'Rejected',
};

/** Statuses that count as "the applicant has done their part". */
export function isDocumentSatisfied(status: DocumentStatus): boolean {
  return status === 'uploaded' || status === 'under_review' || status === 'verified';
}

// Reasons a reviewer may give when rejecting a document live in
// `rejection-reasons.config.ts` alongside every other reason catalogue.
