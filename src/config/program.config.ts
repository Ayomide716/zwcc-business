/**
 * Programme and organisation identity, plus the onboarding and eligibility
 * content. Copy lives here rather than inside screens so it can be reviewed and
 * changed by non-developers with minimal risk.
 */

export const ORGANISATION = {
  name: 'Zion World Christian Center',
  shortName: 'ZWCC',
  location: 'Lagos, Nigeria',
  supportEmail: 'grants@zionworldcc.org',
  supportPhone: '+234 800 000 0000',
  website: 'https://zionworldcc.org',
} as const;

export const GRANT_PROGRAM = {
  /** Stable slug; matches the seeded row in `grant_programs`. */
  slug: 'zwcc-business-grant-2026',
  name: '2026 ZWCC Business Grant',
  year: 2026,
  tagline: 'Funding enterprise. Building futures.',
  summary:
    'The 2026 ZWCC Business Grant provides funding to help people start and grow sustainable businesses. Grants are awarded on the strength of your business proposal.',
  /**
   * There is deliberately no minimum or maximum (brief §8) — the requested
   * amount follows the proposal. These are display hints only.
   */
  currency: 'NGN',
  currencySymbol: '₦',
  monitoringMonths: 12,
} as const;

/* -------------------------------------------------------------------------- */
/* Onboarding                                                                  */
/* -------------------------------------------------------------------------- */

export interface OnboardingSlide {
  id: string;
  title: string;
  body: string;
  /** Named illustration rendered by `components/brand/OnboardingArt`. */
  art: 'welcome' | 'eligibility' | 'process' | 'documents' | 'monitoring';
}

export const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    id: 'welcome',
    title: 'Welcome to the 2026 ZWCC Business Grant',
    body: 'Zion World Christian Center provides grants to help people build businesses that last. This app is where you apply, track your application, and report on your progress.',
    art: 'welcome',
  },
  {
    id: 'eligibility',
    title: 'Who can apply',
    body: 'The grant is open to everyone — you do not have to be a member of the church. You must be 18 or older, have a business or a clear business idea, and accept the programme terms. You may hold only one application at a time.',
    art: 'eligibility',
  },
  {
    id: 'process',
    title: 'How it works',
    body: 'Complete the application in steps, saving as you go. We verify your details and documents, the Grant Committee reviews your proposal, and you are notified of the decision.',
    art: 'process',
  },
  {
    id: 'documents',
    title: 'What you will need',
    body: 'A passport photograph, a valid means of identification, and your CAC business document. Church verification forms are optional. You can upload photos or PDFs straight from your phone.',
    art: 'documents',
  },
  {
    id: 'monitoring',
    title: 'After you receive a grant',
    body: 'You sign a grant agreement, then report on your business once a month for twelve months — a short update with photos or a video. This is how we measure the impact of the programme.',
    art: 'monitoring',
  },
];

/* -------------------------------------------------------------------------- */
/* Eligibility                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Self-declared eligibility gate shown before an application is created. These
 * are confirmations, not a scoring model — the committee makes the real
 * decision. Add or remove criteria freely.
 */
export interface EligibilityCriterion {
  id: string;
  label: string;
  detail?: string;
  /** Answering "no" stops the applicant from continuing. */
  blocking: boolean;
}

export const ELIGIBILITY_CRITERIA: EligibilityCriterion[] = [
  {
    id: 'age',
    label: 'I am 18 years of age or older.',
    blocking: true,
  },
  {
    id: 'business',
    label: 'I run a business, or I have a clear business idea I want to start.',
    blocking: true,
  },
  {
    id: 'single_application',
    label: 'I do not have another live application to this grant.',
    detail: 'Applicants may hold only one application at a time.',
    blocking: true,
  },
  {
    id: 'documents',
    label: 'I can provide a passport photograph, valid ID, and my business documents.',
    blocking: true,
  },
  {
    id: 'monitoring',
    label:
      'If awarded, I agree to submit a business progress report every month for twelve months.',
    blocking: true,
  },
  {
    id: 'terms',
    label: 'I accept the programme Terms & Conditions.',
    blocking: true,
  },
];

/** Membership is explicitly NOT a criterion (brief §8). Stated for clarity. */
export const ELIGIBILITY_NOTES = [
  'You do not need to be a member of Zion World Christian Center to apply.',
  'There is no fixed minimum or maximum grant amount — you request what your proposal needs.',
  'If your application is not approved, you are welcome to apply again.',
];
