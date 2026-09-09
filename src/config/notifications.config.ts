/**
 * Notification catalogue.
 *
 * Every notification the system can raise is declared here with its copy and
 * the channels it should go out on. Services raise an *event id*; they never
 * compose a message or pick a channel. That keeps wording reviewable in one
 * place and makes enabling SMS/WhatsApp later a config change.
 */

export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'sms', 'whatsapp'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * Only in-app is live for the MVP (brief §20). The other transports have real
 * service classes with a documented contract, disabled here until the client
 * chooses providers.
 */
export const ENABLED_CHANNELS: Record<NotificationChannel, boolean> = {
  in_app: true,
  email: false,
  sms: false,
  whatsapp: false,
};

export type NotificationCategory = 'application' | 'document' | 'agreement' | 'monitoring' | 'account';

export interface NotificationTemplate {
  id: string;
  category: NotificationCategory;
  title: string;
  /**
   * Body may reference `{{placeholders}}` filled from the payload passed to
   * `notifications.raise()`. Unknown placeholders are stripped, never shown raw.
   */
  body: string;
  channels: NotificationChannel[];
  /** Route opened when the notification is tapped. */
  route?: string;
  /** Surfaces the notification more prominently in the list. */
  important?: boolean;
}

export const NOTIFICATION_TEMPLATES: Record<string, NotificationTemplate> = {
  account_registered: {
    id: 'account_registered',
    category: 'account',
    title: 'Welcome to the 2026 ZWCC Business Grant',
    body: 'Your account is ready. Complete your application to be considered for a grant.',
    channels: ['in_app', 'email'],
    route: '/(applicant)/dashboard',
  },
  application_started: {
    id: 'application_started',
    category: 'application',
    title: 'Application started',
    body: 'Your application has been created. You can save your progress and continue at any time.',
    channels: ['in_app'],
    route: '/(applicant)/application',
  },
  application_submitted: {
    id: 'application_submitted',
    category: 'application',
    title: 'Application submitted',
    body: 'We have received your application. Your registration code is {{registrationCode}} — please keep it safe.',
    channels: ['in_app', 'email', 'sms'],
    route: '/(applicant)/dashboard',
    important: true,
  },
  verification_started: {
    id: 'verification_started',
    category: 'application',
    title: 'Verification has started',
    body: 'Our team has begun verifying your details and documents.',
    channels: ['in_app'],
    route: '/(applicant)/dashboard',
  },
  document_verified: {
    id: 'document_verified',
    category: 'document',
    title: 'Document verified',
    body: 'Your {{documentLabel}} has been verified.',
    channels: ['in_app'],
    route: '/(applicant)/documents',
  },
  document_rejected: {
    id: 'document_rejected',
    category: 'document',
    title: 'A document needs attention',
    body: 'Your {{documentLabel}} could not be verified: {{reason}}',
    channels: ['in_app', 'email', 'sms'],
    route: '/(applicant)/documents',
    important: true,
  },
  sent_to_committee: {
    id: 'sent_to_committee',
    category: 'application',
    title: 'Sent to the Grant Committee',
    body: 'Your application has passed verification and is now with the Grant Committee.',
    channels: ['in_app'],
    route: '/(applicant)/dashboard',
  },
  changes_requested: {
    id: 'changes_requested',
    category: 'application',
    title: 'Corrections needed',
    body: 'Please review and correct your application: {{reason}}',
    channels: ['in_app', 'email', 'sms'],
    route: '/(applicant)/application',
    important: true,
  },
  application_approved: {
    id: 'application_approved',
    category: 'application',
    title: 'Your application has been approved',
    body: 'Congratulations. Your grant agreement will be issued shortly.',
    channels: ['in_app', 'email', 'sms', 'whatsapp'],
    route: '/(applicant)/dashboard',
    important: true,
  },
  application_rejected: {
    id: 'application_rejected',
    category: 'application',
    title: 'Application decision',
    body: 'Your application was not approved on this occasion. You are welcome to apply again.',
    channels: ['in_app', 'email'],
    route: '/(applicant)/dashboard',
    important: true,
  },
  agreement_available: {
    id: 'agreement_available',
    category: 'agreement',
    title: 'Your grant agreement is ready',
    body: 'Please read and sign your grant agreement to continue.',
    channels: ['in_app', 'email', 'sms'],
    route: '/(applicant)/agreement',
    important: true,
  },
  agreement_signed: {
    id: 'agreement_signed',
    category: 'agreement',
    title: 'Agreement signed',
    body: 'Thank you. Your signed agreement has been recorded.',
    channels: ['in_app', 'email'],
    route: '/(applicant)/agreement',
  },
  disbursement_authorised: {
    id: 'disbursement_authorised',
    category: 'agreement',
    title: 'Grant authorised',
    body: 'Your grant has been authorised for disbursement.',
    channels: ['in_app', 'email', 'sms'],
    route: '/(applicant)/dashboard',
    important: true,
  },
  monitoring_started: {
    id: 'monitoring_started',
    category: 'monitoring',
    title: 'Monthly reporting has begun',
    body: 'Your twelve-month reporting period has started. Your first report is due soon.',
    channels: ['in_app', 'email'],
    route: '/(applicant)/monitoring',
  },
  report_due: {
    id: 'report_due',
    category: 'monitoring',
    title: 'Your monthly report is due',
    body: 'Your {{periodLabel}} business progress report is due on {{dueDate}}.',
    channels: ['in_app', 'sms', 'whatsapp'],
    route: '/(applicant)/monitoring',
  },
  report_overdue: {
    id: 'report_overdue',
    category: 'monitoring',
    title: 'Your monthly report is overdue',
    body: 'We have not yet received your {{periodLabel}} report. Please submit it as soon as you can.',
    channels: ['in_app', 'sms', 'whatsapp'],
    route: '/(applicant)/monitoring',
    important: true,
  },
  report_reviewed: {
    id: 'report_reviewed',
    category: 'monitoring',
    title: 'Your report has been reviewed',
    body: 'Thank you for your {{periodLabel}} report. It has been reviewed by our team.',
    channels: ['in_app'],
    route: '/(applicant)/monitoring',
  },
  grant_completed: {
    id: 'grant_completed',
    category: 'monitoring',
    title: 'Your grant is complete',
    body: 'Your twelve-month monitoring period is complete. Thank you for being part of the programme.',
    channels: ['in_app', 'email'],
    route: '/(applicant)/dashboard',
    important: true,
  },
};

export type NotificationEventId = keyof typeof NOTIFICATION_TEMPLATES;

export function getTemplate(eventId: string): NotificationTemplate | undefined {
  return NOTIFICATION_TEMPLATES[eventId];
}

/**
 * Fill `{{placeholders}}`. Unknown keys are removed rather than left in the
 * message — a user should never see raw template syntax.
 */
export function renderTemplate(
  template: string,
  payload: Record<string, string | number | null | undefined> = {},
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = payload[key];
    return value === null || value === undefined ? '' : String(value);
  }).replace(/\s{2,}/g, ' ').trim();
}

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  application: 'Application',
  document: 'Documents',
  agreement: 'Agreement',
  monitoring: 'Monitoring',
  account: 'Account',
};
