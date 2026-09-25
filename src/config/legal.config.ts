/**
 * Terms & Conditions and Privacy Policy content.
 *
 * Reviewed and authorised by Zion World Christian Center's lawyer on the
 * wording as it stood in the app, and published without the draft notice from
 * 25 September 2026. At publication the bracketed drafting notes
 * ("[Placeholder — …]") were removed, the two sections that contained nothing
 * else were dropped, and the sections renumbered.
 *
 * Later the same day, at the lawyer's request, the Privacy Policy gained the
 * disclosures it had been missing: the device notification token (section 2),
 * the named providers that handle data and what each receives (section 7), and
 * how account deletion works and what survives it (sections 8 and 9). Every
 * added sentence describes what the app actually does, checked against the
 * code at the time; none of them sets a new obligation. Each is marked below.
 *
 * Changing either document is a content edit here and ships over the air. Any
 * change to what these documents say should go back to the church's lawyer
 * first, and `lastUpdated` must move with it.
 *
 * `placeholderNotice` still exists so a future draft can be published
 * honestly labelled; leave it unset on anything that has been approved.
 */

export interface LegalSection {
  heading: string;
  body: string[];
}

export interface LegalDocument {
  title: string;
  /**
   * Shown in a warning banner at the top while a document is still a draft.
   * Leave unset once the church's lawyer has approved the wording.
   */
  placeholderNotice?: string;
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
}

export const TERMS_AND_CONDITIONS: LegalDocument = {
  title: 'Terms & Conditions',
  lastUpdated: 'Last updated 25 September 2026',
  intro:
    'These terms govern applications to the 2026 ZWCC Business Grant and the obligations of anyone awarded a grant under the programme.',
  sections: [
    {
      heading: '1. About the programme',
      body: [
        'The 2026 ZWCC Business Grant is operated by Zion World Christian Center, Lagos, to support the establishment and growth of sustainable businesses.',
      ],
    },
    {
      heading: '2. Eligibility',
      body: [
        'The grant is open to applicants aged 18 and over who operate, or intend to operate, a business. Membership of Zion World Christian Center is not a requirement.',
        'An applicant may hold only one live application at any time. Applicants whose application is not approved may apply again.',
        // Confirmed by the church.
        'Eligibility for the grant is decided solely by the Grant Committee.',
      ],
    },
    {
      heading: '3. Applications',
      body: [
        // Confirmed by the church. Also shown on the application screen itself,
        // because a term nobody reads protects nobody.
        'Applying for the grant is free. Nobody from Zion World Christian Center will ever ask you to pay to apply, or to pay to have an application approved.',
        'Applicants must provide accurate and complete information, together with the supporting documents requested.',
        'Providing information that is knowingly false may result in an application being declined or a grant being withdrawn.',
      ],
    },
    {
      heading: '4. Grant amounts',
      body: [
        'There is no fixed minimum or maximum grant. The amount requested should reflect what the business proposal genuinely requires, and the amount awarded is at the discretion of the Grant Committee.',
      ],
    },
    {
      heading: '5. Assessment and decisions',
      body: [
        'Applications are verified and then assessed by the Grant Committee. Decisions of the Committee are final.',
      ],
    },
    {
      heading: '6. Obligations of beneficiaries',
      body: [
        'Successful applicants must sign a grant agreement before funds are authorised, and must submit a business progress report every month for twelve months.',
      ],
    },
    {
      heading: '7. Use of the app',
      body: [
        'You are responsible for keeping your account credentials and your registration code secure.',
      ],
    },
    {
      heading: '8. Contact',
      body: [
        'Questions about these terms should be directed to Zion World Christian Center using the contact details in the app.',
      ],
    },
  ],
};

export const PRIVACY_POLICY: LegalDocument = {
  title: 'Privacy Policy',
  lastUpdated: 'Last updated 25 September 2026',
  intro:
    'This policy explains what personal information the 2026 ZWCC Business Grant app collects, why it is collected, how it is stored, and what rights you have over it.',
  sections: [
    {
      heading: '1. Who is responsible for your data',
      body: [
        'Zion World Christian Center, Lagos, is the data controller for information collected through this app.',
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
        // Added at the lawyer's request, 25 September 2026.
        'Device information: a notification token for each phone you sign in on, used only to send you notifications, and switched off when you sign out.',
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
      ],
    },
    {
      heading: '7. Third-party services',
      body: [
        'The app uses Supabase for database, authentication and file storage.',
        // Added at the lawyer's request, 25 September 2026.
        'Emails about your application are sent through Resend. Resend receives your email address, your first name and the text of the message, and nothing else from your application.',
        'Push notifications are delivered through Expo’s push notification service and, on Android phones, Google’s Firebase Cloud Messaging. They receive your device’s notification token, the title and text of each notification, and an internal reference number for it. They do not receive your application, your documents or your contact details.',
        'When the app opens, it checks with Expo for updates to the app. That check sends the app’s version, your phone’s operating system and a random identifier for the installation, which is not linked to your name or your account.',
        'These providers may store or process information outside Nigeria.',
        'Email, SMS and WhatsApp notification providers may be engaged to deliver messages to you.',
      ],
    },
    {
      heading: '8. How long we keep it',
      body: [
        'Application records are retained so that the history of the programme is preserved, including applications that were not approved.',
        // Added at the lawyer's request, 25 September 2026.
        'If you delete your account, your records are removed with it. If you received a grant, the church keeps a record of that grant — its reference code, the amount requested and the dates — without your name, contact details, documents or reports.',
        'A record that an account was deleted is kept for audit purposes. It contains no name or contact details.',
      ],
    },
    {
      heading: '9. Your rights',
      body: [
        'You have the right to ask for a copy of the information we hold about you.',
        'You have the right to ask us to correct information that is inaccurate.',
        'You have the right to ask us to delete your information, subject to our record-keeping obligations.',
        // Added at the lawyer's request, 25 September 2026.
        'You can delete your account yourself from the Profile screen, using Delete account. This removes your profile, your applications, the documents you uploaded and your progress reports. While a grant you have signed for is still running, your account can be deleted once the grant is completed; if you need to leave the programme before then, contact Zion World Christian Center.',
        'You have the right to withdraw your consent and to object to certain processing.',
        'You have the right to complain to the Nigeria Data Protection Commission.',
      ],
    },
    {
      heading: '10. Children',
      body: [
        'The grant programme is open only to applicants aged 18 and over, and the app is not intended for use by children.',
      ],
    },
    {
      heading: '11. Contact us',
      body: [
        'To exercise any of your rights, or to ask a question about this policy, contact Zion World Christian Center using the details in the app.',
      ],
    },
  ],
};
