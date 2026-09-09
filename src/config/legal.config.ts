/**
 * Terms & Conditions and Privacy Policy content.
 *
 * BOTH DOCUMENTS ARE PLACEHOLDERS (brief §30, §31).
 *
 * The client has not supplied final terms, and inventing legal wording and
 * presenting it as binding would be worse than useless — so the structure is
 * real, the content is clearly labelled as draft, and every screen that renders
 * it shows the notice prominently.
 *
 * Replacing them is a content edit here. Nothing else changes.
 */

export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalDocument {
  title: string;
  /** Shown in a warning banner at the top. Do not remove before legal review. */
  placeholderNotice: string;
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
}

export const TERMS_AND_CONDITIONS: LegalDocument = {
  title: 'Terms & Conditions',
  placeholderNotice:
    'This is placeholder content. The final Terms & Conditions will be provided by Zion World Christian Center and must replace this text before the app is used in production.',
  lastUpdated: 'Draft — pending final wording',
  intro:
    'These terms govern applications to the 2026 ZWCC Business Grant and the obligations of anyone awarded a grant under the programme.',
  sections: [
    {
      heading: '1. About the programme',
      body: [
        'The 2026 ZWCC Business Grant is operated by Zion World Christian Center, Lagos, to support the establishment and growth of sustainable businesses.',
        '[Placeholder — final wording to be supplied by ZWCC.]',
      ],
    },
    {
      heading: '2. Eligibility',
      body: [
        'The grant is open to applicants aged 18 and over who operate, or intend to operate, a business. Membership of Zion World Christian Center is not a requirement.',
        'An applicant may hold only one live application at any time. Applicants whose application is not approved may apply again.',
        '[Placeholder — final eligibility criteria to be confirmed by ZWCC.]',
      ],
    },
    {
      heading: '3. Applications',
      body: [
        'Applicants must provide accurate and complete information, together with the supporting documents requested.',
        'Providing information that is knowingly false may result in an application being declined or a grant being withdrawn.',
        '[Placeholder — final wording to be supplied.]',
      ],
    },
    {
      heading: '4. Grant amounts',
      body: [
        'There is no fixed minimum or maximum grant. The amount requested should reflect what the business proposal genuinely requires, and the amount awarded is at the discretion of the Grant Committee.',
        '[Placeholder — final wording to be supplied.]',
      ],
    },
    {
      heading: '5. Assessment and decisions',
      body: [
        'Applications are verified and then assessed by the Grant Committee. Decisions of the Committee are final.',
        '[Placeholder — final wording, including any appeal process, to be supplied.]',
      ],
    },
    {
      heading: '6. Obligations of beneficiaries',
      body: [
        'Successful applicants must sign a grant agreement before funds are authorised, and must submit a business progress report every month for twelve months.',
        '[Placeholder — final wording to be supplied.]',
      ],
    },
    {
      heading: '7. Use of the app',
      body: [
        'You are responsible for keeping your account credentials and your registration code secure.',
        '[Placeholder — final wording to be supplied.]',
      ],
    },
    {
      heading: '8. Changes to these terms',
      body: ['[Placeholder — final wording to be supplied.]'],
    },
    {
      heading: '9. Contact',
      body: [
        'Questions about these terms should be directed to Zion World Christian Center using the contact details in the app.',
      ],
    },
  ],
};

export const PRIVACY_POLICY: LegalDocument = {
  title: 'Privacy Policy',
  placeholderNotice:
    'This is a placeholder privacy policy. It follows the structure expected under Nigeria’s NDPA and the GDPR, but it has NOT been reviewed by a lawyer and must be completed and approved by Zion World Christian Center’s legal advisers before this app is used in production.',
  lastUpdated: 'Draft — pending legal review',
  intro:
    'This policy explains what personal information the 2026 ZWCC Business Grant app collects, why it is collected, how it is stored, and what rights you have over it.',
  sections: [
    {
      heading: '1. Who is responsible for your data',
      body: [
        'Zion World Christian Center, Lagos, is the data controller for information collected through this app.',
        '[Placeholder — full registered details and Data Protection Officer contact to be supplied.]',
      ],
    },
    {
      heading: '2. Information we collect',
      body: [
        'Account information: your name, email address, phone number and password.',
        'Application information: personal details, business details, your grant request and business proposal, and any church or ministry information you choose to give.',
        'Documents: the identification, business and verification documents you upload.',
        'Monitoring information: your monthly business progress reports, including any photographs or videos you attach.',
        'Technical information: records of actions taken in the app, kept for audit and security purposes.',
      ],
    },
    {
      heading: '3. Why we collect it',
      body: [
        'To assess your application for a grant.',
        'To verify your identity and the information you provide.',
        'To communicate with you about your application and, if you receive a grant, your reporting obligations.',
        'To measure the outcomes of the grant programme.',
        'To meet record-keeping and audit obligations.',
      ],
    },
    {
      heading: '4. Legal basis for processing',
      body: [
        'We process your information on the basis of your consent when you submit an application, and on the basis of the agreement between you and Zion World Christian Center if you receive a grant.',
        '[Placeholder — to be confirmed on legal review.]',
      ],
    },
    {
      heading: '5. How your information is stored',
      body: [
        'Information is stored in a managed PostgreSQL database with row-level access controls, so that your records are accessible only to you and to authorised programme staff.',
        'Uploaded documents and media are stored in private storage. They are never publicly accessible and are retrieved only through short-lived, individually authorised links.',
        'Passwords are never stored by the app; authentication is handled by our authentication provider.',
      ],
    },
    {
      heading: '6. Who can see your information',
      body: [
        'You can see all of your own information.',
        'Members of the Grant Committee and administrators can see application information in order to verify and assess it.',
        'Other applicants can never see your information.',
        '[Placeholder — any additional disclosures to be confirmed.]',
      ],
    },
    {
      heading: '7. Third-party services',
      body: [
        'The app uses Supabase for database, authentication and file storage.',
        'Email, SMS and WhatsApp notification providers may be engaged to deliver messages to you. [Placeholder — providers to be named once selected.]',
        '[Placeholder — full list of processors and their locations to be supplied.]',
      ],
    },
    {
      heading: '8. How long we keep it',
      body: [
        'Application records are retained so that the history of the programme is preserved, including applications that were not approved.',
        '[Placeholder — specific retention periods to be set by ZWCC on legal advice.]',
      ],
    },
    {
      heading: '9. Your rights',
      body: [
        'You have the right to ask for a copy of the information we hold about you.',
        'You have the right to ask us to correct information that is inaccurate.',
        'You have the right to ask us to delete your information, subject to our record-keeping obligations.',
        'You have the right to withdraw your consent and to object to certain processing.',
        'You have the right to complain to the Nigeria Data Protection Commission.',
        '[Placeholder — full description of rights and how to exercise them to be supplied.]',
      ],
    },
    {
      heading: '10. Children',
      body: [
        'The grant programme is open only to applicants aged 18 and over, and the app is not intended for use by children.',
      ],
    },
    {
      heading: '11. Changes to this policy',
      body: ['[Placeholder — final wording to be supplied.]'],
    },
    {
      heading: '12. Contact us',
      body: [
        'To exercise any of your rights, or to ask a question about this policy, contact Zion World Christian Center using the details in the app.',
      ],
    },
  ],
};
