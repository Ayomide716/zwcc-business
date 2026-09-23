/**
 * Programme and organisation identity, plus the onboarding and eligibility
 * content. Copy lives here rather than inside screens so it can be reviewed and
 * changed by non-developers with minimal risk.
 */

export const ORGANISATION = {
  name: 'Zion World Christian Center',
  shortName: 'ZWCC',
  location: 'Lagos, Nigeria',
  supportEmail: 'grants@zionworldchristiancenter.com',
  /** ⚠️ STILL A PLACEHOLDER. The church has not supplied a real number. */
  supportPhone: '+234 800 000 0000',
  website: 'https://zionworldchristiancenter.com',
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
/* Applying is free                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Confirmed by the church, and shown where someone applies rather than only in
 * the terms.
 *
 * It is a term of the programme, but burying it in a document nobody opens
 * wastes it. A public grant with money attached and a download link anyone can
 * share is exactly what someone impersonating the church would target, and the
 * person most at risk is the one least able to lose the money. A sentence on
 * the screen where they are actually applying is the cheapest protection the
 * church has, for the applicant and for its own name.
 */
export const FREE_TO_APPLY_NOTICE = {
  title: 'Applying is free',
  message:
    'There is no fee to apply for this grant. Nobody from Zion World '
    + 'Christian Center will ever ask you to pay to apply, or to pay to have '
    + 'your application approved. If anyone asks you for money, please report '
    + 'it to the church.',
} as const;

/* -------------------------------------------------------------------------- */
/* How long each stage takes                                                   */
/* -------------------------------------------------------------------------- */

/**
 * What an applicant is told to expect while they are waiting.
 *
 * "Nothing needed from you" is honest but leaves people refreshing the app for
 * news. A stated timeframe is the single cheapest thing that stops that.
 *
 * ⚠️ PLACEHOLDER TIMINGS. These are reasonable guesses, not the church's
 * commitments. Zion World Christian Center must confirm each one before this
 * app is used for a real grant round. Set a value to `null` to say nothing at
 * all for that stage rather than promise something untrue.
 */
export const STAGE_EXPECTATIONS: Record<string, string | null> = {
  submitted: 'We usually begin checking applications within 5 working days.',
  verification: 'Document checks usually take about a week.',
  committee_review:
    'The committee meets regularly. Most decisions are made within three weeks of review starting.',
  approved: 'Your agreement is usually ready within a few days of approval.',
  agreement_signed: 'Authorisation usually follows within a week of signing.',
  disbursement_authorised:
    'Your grant will be released outside the app. The team will be in touch about timing.',
  monitoring: null,
};

/** True while the timings above are still the placeholder set. */
export const STAGE_EXPECTATIONS_ARE_PROVISIONAL = true;

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
    body: 'A passport photograph and a valid means of identification. Your CAC document, evidence of business activity and church verification forms are all optional. You can upload photos or PDFs straight from your phone.',
    art: 'documents',
  },
  {
    id: 'monitoring',
    title: 'If your application succeeds',
    body: 'You sign a grant agreement first — the funds are only released after it is signed. From then on you report on your business once a month for twelve months: a short update with photos or a video. This is how we measure the impact of the programme.',
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
    // Business documents came off this list when the church made the CAC
    // upload optional. Asking someone to promise a document they are not
    // required to supply, and blocking them when they say no, turned an
    // optional item back into a mandatory one at the gate.
    label: 'I can provide a passport photograph and a valid means of identification.',
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
