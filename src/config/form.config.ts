/**
 * The application form, declared as data.
 *
 * Screens render whatever this file describes. Adding, removing or re-ordering
 * a question is an edit here — no screen, no validation code and no migration
 * is involved, because answers are stored in a single JSONB column keyed by
 * field id.
 *
 * The client will supply their final field list later; that will be a diff
 * against this array.
 *
 * Rules of the road:
 *   - `id` is a storage key. Never rename one that is already in production;
 *     add a new field and mark the old one `archived` instead.
 *   - Validation is derived from these definitions in
 *     `src/validation/application.ts`. Do not write validation twice.
 */

export type FieldType =
  | 'text'
  | 'textarea'
  | 'email'
  | 'phone'
  | 'number'
  | 'currency'
  | 'date'
  | 'select'
  | 'radio'
  | 'checkbox'
  | 'acknowledgement';

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDefinition {
  id: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  options?: FieldOption[];
  /** Text/textarea length bounds. */
  minLength?: number;
  maxLength?: number;
  /** Numeric bounds. Grant amount deliberately has no maximum (brief §8). */
  min?: number;
  max?: number;
  /** Rows for a textarea. */
  rows?: number;
  /**
   * Show this field only when another field holds one of these values.
   * Hidden fields are never required and are stripped from validation.
   */
  visibleWhen?: { field: string; equals: string[] };
  /**
   * Date bounds, in whole years relative to today. `minAge: 18` means the date
   * must be at least 18 years ago. Kept as config so the client can change the
   * eligibility age without touching validation code.
   */
  minAge?: number;
  maxAge?: number;
  /** Reject dates after today. Defaults to true for `date` fields. */
  allowFuture?: boolean;
  /** Reject dates before today. */
  allowPast?: boolean;
  /** Retired fields stay here so historical answers still render. */
  archived?: boolean;
  autoCapitalize?: 'none' | 'words' | 'sentences';
}

/**
 * Steps come in three kinds. `form` steps render fields from this config;
 * `documents` and `review` are handled by dedicated screens but still appear in
 * the step indicator so the journey is described in exactly one place.
 */
export type StepKind = 'form' | 'documents' | 'review';

export interface StepDefinition {
  id: string;
  kind: StepKind;
  /** Full title shown at the top of the step. */
  title: string;
  /** Two or three words, for the step indicator. */
  shortTitle: string;
  description: string;
  fields: FieldDefinition[];
}

const NIGERIAN_STATES: FieldOption[] = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT - Abuja', 'Gombe',
  'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
  'Taraba', 'Yobe', 'Zamfara',
].map((state) => ({ value: state, label: state }));

export const APPLICATION_STEPS: StepDefinition[] = [
  /* ---------------------------------------------------------------------- */
  {
    id: 'personal',
    kind: 'form',
    title: 'Personal information',
    shortTitle: 'Personal',
    description: 'Tell us who you are. Use the details exactly as they appear on your ID.',
    fields: [
      {
        id: 'full_name',
        label: 'Full name',
        type: 'text',
        placeholder: 'As written on your ID',
        required: true,
        minLength: 3,
        maxLength: 120,
        autoCapitalize: 'words',
      },
      {
        id: 'date_of_birth',
        label: 'Date of birth',
        type: 'date',
        required: true,
        minAge: 18,
        maxAge: 100,
        helpText: 'You must be at least 18 years old to apply.',
      },
      {
        id: 'gender',
        label: 'Gender',
        type: 'radio',
        required: true,
        options: [
          { value: 'female', label: 'Female' },
          { value: 'male', label: 'Male' },
        ],
      },
      {
        id: 'marital_status',
        label: 'Marital status',
        type: 'select',
        required: false,
        options: [
          { value: 'single', label: 'Single' },
          { value: 'married', label: 'Married' },
          { value: 'divorced', label: 'Divorced' },
          { value: 'widowed', label: 'Widowed' },
        ],
      },
      {
        id: 'phone',
        label: 'Phone number',
        type: 'phone',
        placeholder: '080 0000 0000',
        required: true,
        helpText: 'We will use this number for SMS and WhatsApp updates.',
      },
      {
        id: 'email',
        label: 'Email address',
        type: 'email',
        placeholder: 'you@example.com',
        required: true,
      },
      {
        id: 'residential_address',
        label: 'Residential address',
        type: 'textarea',
        rows: 3,
        required: true,
        minLength: 10,
        maxLength: 300,
      },
      {
        id: 'city',
        label: 'City / town',
        type: 'text',
        required: true,
        autoCapitalize: 'words',
      },
      {
        id: 'state',
        label: 'State',
        type: 'select',
        required: true,
        options: NIGERIAN_STATES,
      },
      {
        id: 'highest_education',
        label: 'Highest level of education',
        type: 'select',
        required: false,
        options: [
          { value: 'primary', label: 'Primary' },
          { value: 'secondary', label: 'Secondary' },
          { value: 'ond_nce', label: 'OND / NCE' },
          { value: 'hnd_bsc', label: 'HND / Bachelor’s degree' },
          { value: 'postgraduate', label: 'Postgraduate' },
          { value: 'vocational', label: 'Vocational / trade training' },
          { value: 'none', label: 'None of the above' },
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  {
    id: 'business',
    kind: 'form',
    title: 'Business information',
    shortTitle: 'Business',
    description: 'Tell us about the business the grant would support.',
    fields: [
      {
        id: 'business_name',
        label: 'Business name',
        type: 'text',
        required: true,
        maxLength: 150,
        autoCapitalize: 'words',
      },
      {
        id: 'business_stage',
        label: 'What stage is your business at?',
        type: 'radio',
        required: true,
        options: [
          { value: 'idea', label: 'Idea — not yet trading' },
          { value: 'early', label: 'Early — trading under a year' },
          { value: 'established', label: 'Established — trading over a year' },
        ],
      },
      {
        id: 'business_sector',
        label: 'Sector',
        type: 'select',
        required: true,
        options: [
          { value: 'retail', label: 'Retail & trading' },
          { value: 'food', label: 'Food & agriculture' },
          { value: 'fashion', label: 'Fashion & tailoring' },
          { value: 'beauty', label: 'Beauty & personal care' },
          { value: 'services', label: 'Professional services' },
          { value: 'technology', label: 'Technology' },
          { value: 'transport', label: 'Transport & logistics' },
          { value: 'manufacturing', label: 'Manufacturing & craft' },
          { value: 'education', label: 'Education & training' },
          { value: 'health', label: 'Health & wellbeing' },
          { value: 'other', label: 'Other' },
        ],
      },
      {
        id: 'business_sector_other',
        label: 'Please describe your sector',
        type: 'text',
        required: true,
        maxLength: 100,
        visibleWhen: { field: 'business_sector', equals: ['other'] },
      },
      {
        id: 'business_description',
        label: 'What does your business do?',
        type: 'textarea',
        rows: 4,
        required: true,
        minLength: 30,
        maxLength: 800,
        placeholder: 'Describe your products or services and who buys them.',
      },
      {
        id: 'business_address',
        label: 'Business address',
        type: 'textarea',
        rows: 2,
        required: false,
        maxLength: 300,
        helpText: 'Leave blank if you do not yet trade from a fixed location.',
      },
      {
        id: 'years_in_operation',
        label: 'Years in operation',
        type: 'number',
        required: false,
        min: 0,
        max: 80,
        visibleWhen: { field: 'business_stage', equals: ['early', 'established'] },
      },
      {
        id: 'employees_count',
        label: 'How many people does the business support?',
        type: 'number',
        required: false,
        min: 0,
        max: 1000,
        helpText: 'Include yourself, family members and any staff.',
      },
      {
        id: 'monthly_revenue',
        label: 'Average monthly revenue',
        type: 'currency',
        required: false,
        min: 0,
        helpText: 'An estimate is fine. Enter 0 if you are not yet trading.',
      },
      {
        id: 'is_registered',
        label: 'Is the business registered with the CAC?',
        type: 'radio',
        required: true,
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'Not yet' },
        ],
      },
      {
        id: 'cac_number',
        label: 'CAC registration number',
        type: 'text',
        required: true,
        maxLength: 40,
        autoCapitalize: 'none',
        visibleWhen: { field: 'is_registered', equals: ['yes'] },
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  {
    id: 'grant_request',
    kind: 'form',
    title: 'Grant request',
    shortTitle: 'Request',
    description:
      'There is no fixed minimum or maximum. Ask for what your proposal genuinely needs, and show how it will be used.',
    fields: [
      {
        id: 'requested_amount',
        label: 'Amount requested (₦)',
        type: 'currency',
        required: true,
        min: 1,
        // No maximum: the amount follows the proposal (brief §8).
        helpText: 'Enter the total amount your business plan requires.',
      },
      {
        id: 'fund_usage',
        label: 'How will you use the grant?',
        type: 'textarea',
        rows: 5,
        required: true,
        minLength: 50,
        maxLength: 1200,
        placeholder:
          'Break the amount down — equipment, stock, rent, materials, training and so on.',
      },
      {
        id: 'other_funding',
        label: 'Do you have any other source of funding?',
        type: 'radio',
        required: true,
        options: [
          { value: 'no', label: 'No' },
          { value: 'yes', label: 'Yes' },
        ],
      },
      {
        id: 'other_funding_detail',
        label: 'Tell us about your other funding',
        type: 'textarea',
        rows: 3,
        required: true,
        maxLength: 500,
        visibleWhen: { field: 'other_funding', equals: ['yes'] },
      },
      {
        id: 'previously_received_grant',
        label: 'Have you received a grant from ZWCC before?',
        type: 'radio',
        required: true,
        options: [
          { value: 'no', label: 'No' },
          { value: 'yes', label: 'Yes' },
        ],
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  {
    id: 'proposal',
    kind: 'form',
    title: 'Business proposal',
    shortTitle: 'Proposal',
    description:
      'This is what the committee weighs most heavily. Be specific and realistic.',
    fields: [
      {
        id: 'proposal_summary',
        label: 'Summary of your proposal',
        type: 'textarea',
        rows: 4,
        required: true,
        minLength: 50,
        maxLength: 800,
        placeholder: 'In a few sentences, what do you want to do and why now?',
      },
      {
        id: 'problem_solved',
        label: 'What problem does your business solve?',
        type: 'textarea',
        rows: 3,
        required: true,
        minLength: 30,
        maxLength: 700,
      },
      {
        id: 'target_customers',
        label: 'Who are your customers?',
        type: 'textarea',
        rows: 3,
        required: true,
        minLength: 20,
        maxLength: 600,
      },
      {
        id: 'growth_plan',
        label: 'How will the grant help your business grow?',
        type: 'textarea',
        rows: 4,
        required: true,
        minLength: 50,
        maxLength: 1000,
      },
      {
        id: 'expected_outcome_12_months',
        label: 'Where do you expect the business to be in 12 months?',
        type: 'textarea',
        rows: 4,
        required: true,
        minLength: 40,
        maxLength: 800,
        helpText: 'You will report against this each month during your monitoring year.',
      },
      {
        id: 'main_risks',
        label: 'What are the main risks, and how will you manage them?',
        type: 'textarea',
        rows: 3,
        required: false,
        maxLength: 700,
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  {
    id: 'church',
    kind: 'form',
    title: 'Church & ministry information',
    shortTitle: 'Ministry',
    description:
      'The grant is open to everyone. These questions are optional and do not affect your eligibility.',
    fields: [
      {
        id: 'is_member',
        label: 'Are you a member of Zion World Christian Center?',
        type: 'radio',
        required: true,
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
        helpText: 'Answering “No” does not affect your application in any way.',
      },
      {
        id: 'years_with_ministry',
        label: 'How long have you been with the ministry?',
        type: 'select',
        required: false,
        visibleWhen: { field: 'is_member', equals: ['yes'] },
        options: [
          { value: 'under_1', label: 'Less than a year' },
          { value: '1_3', label: '1 – 3 years' },
          { value: '3_5', label: '3 – 5 years' },
          { value: '5_10', label: '5 – 10 years' },
          { value: 'over_10', label: 'More than 10 years' },
        ],
      },
      {
        id: 'branch',
        label: 'Which branch do you attend?',
        type: 'text',
        required: false,
        maxLength: 120,
        autoCapitalize: 'words',
        visibleWhen: { field: 'is_member', equals: ['yes'] },
      },
      {
        id: 'cell_group',
        label: 'Cell group',
        type: 'text',
        required: false,
        maxLength: 120,
        autoCapitalize: 'words',
        visibleWhen: { field: 'is_member', equals: ['yes'] },
      },
      {
        id: 'cell_leader_name',
        label: 'Cell leader’s name',
        type: 'text',
        required: false,
        maxLength: 120,
        autoCapitalize: 'words',
        visibleWhen: { field: 'is_member', equals: ['yes'] },
      },
      {
        id: 'cell_leader_phone',
        label: 'Cell leader’s phone number',
        type: 'phone',
        required: false,
        visibleWhen: { field: 'is_member', equals: ['yes'] },
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  {
    id: 'documents',
    kind: 'documents',
    title: 'Supporting documents',
    shortTitle: 'Documents',
    description: 'Upload the documents that verify your identity and your business.',
    fields: [],
  },

  /* ---------------------------------------------------------------------- */
  {
    id: 'declaration',
    kind: 'form',
    title: 'Declaration & terms',
    shortTitle: 'Declaration',
    description: 'Please read and confirm each statement before you submit.',
    fields: [
      {
        id: 'declaration_truthful',
        label:
          'I confirm that the information I have provided is true, complete and accurate to the best of my knowledge.',
        type: 'acknowledgement',
        required: true,
      },
      {
        id: 'declaration_monitoring',
        label:
          'I understand that if I receive a grant I must submit a business progress report every month for twelve months.',
        type: 'acknowledgement',
        required: true,
      },
      {
        id: 'declaration_single_application',
        label: 'I confirm that this is my only application to the 2026 ZWCC Business Grant.',
        type: 'acknowledgement',
        required: true,
      },
      {
        id: 'declaration_verification',
        label:
          'I give permission for Zion World Christian Center to verify the information and documents I have provided.',
        type: 'acknowledgement',
        required: true,
      },
      {
        id: 'accept_terms',
        label: 'I have read and accept the Terms & Conditions and the Privacy Policy.',
        type: 'acknowledgement',
        required: true,
      },
    ],
  },

  /* ---------------------------------------------------------------------- */
  {
    id: 'review',
    kind: 'review',
    title: 'Review & submit',
    shortTitle: 'Review',
    description: 'Check everything carefully. You will not be able to edit after submitting.',
    fields: [],
  },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

export type FormValues = Record<string, unknown>;

export function getStep(stepId: string): StepDefinition | undefined {
  return APPLICATION_STEPS.find((step) => step.id === stepId);
}

export function getStepIndex(stepId: string): number {
  return APPLICATION_STEPS.findIndex((step) => step.id === stepId);
}

export const FORM_STEPS = APPLICATION_STEPS.filter((step) => step.kind === 'form');

/** The declaration field ids, used by the `declaration_accepted` workflow guard. */
export const DECLARATION_FIELD_IDS = (getStep('declaration')?.fields ?? [])
  .filter((field) => field.required)
  .map((field) => field.id);

/**
 * A field is only "live" when its `visibleWhen` condition holds. Hidden fields
 * are neither shown nor validated nor required.
 */
export function isFieldVisible(field: FieldDefinition, values: FormValues): boolean {
  if (field.archived) return false;
  if (!field.visibleWhen) return true;
  const actual = values[field.visibleWhen.field];
  return typeof actual === 'string' && field.visibleWhen.equals.includes(actual);
}

export function getVisibleFields(step: StepDefinition, values: FormValues): FieldDefinition[] {
  return step.fields.filter((field) => isFieldVisible(field, values));
}

/** Fields that must be answered, given the current answers. */
export function getRequiredFields(step: StepDefinition, values: FormValues): FieldDefinition[] {
  return getVisibleFields(step, values).filter((field) => field.required);
}

/** Every field across every step, for the review screen and admin tooling. */
export function getAllFields(): FieldDefinition[] {
  return APPLICATION_STEPS.flatMap((step) => step.fields);
}

export function getField(fieldId: string): FieldDefinition | undefined {
  return getAllFields().find((field) => field.id === fieldId);
}

/**
 * Fields promoted onto the `applications` table as real columns because they
 * are searched, sorted or aggregated by the committee. Everything else lives in
 * the JSONB blob. Keep this in step with `applications` in the schema.
 */
export const PROMOTED_FIELDS = {
  applicantName: 'full_name',
  applicantPhone: 'phone',
  businessName: 'business_name',
  businessSector: 'business_sector',
  requestedAmount: 'requested_amount',
} as const;
