# Changing the workflow

The client has said their exact process is still being finalised. This document
is the answer to "the requirements just changed — what do I edit?"

The short version: **almost everything is in `src/config/`, and no screen needs
to change.**

---

## Quick reference

| The client wants to… | Edit | Also do |
| --- | --- | --- |
| Add / rename / remove an application status | `src/config/workflow.config.ts` → `APPLICATION_STATUSES` | Re-run migration `0004` |
| Change who can approve, or add an approval stage | `src/config/workflow.config.ts` → `TRANSITIONS` | — |
| Add a precondition before a step | `src/config/workflow.config.ts` → `WORKFLOW_GUARDS` | — |
| Allow applications to be returned for correction | `src/config/workflow.config.ts` → `WORKFLOW_FEATURES.allowReturnForCorrections = true` | — |
| Add / remove / reword an application question | `src/config/form.config.ts` | — |
| Make a document required or optional | `src/config/documents.config.ts` | Re-run migration `0004` |
| Add a new document type | `src/config/documents.config.ts` | Add a row in migration `0004` |
| Add a rejection reason | `src/config/rejection-reasons.config.ts` | — |
| Change the monitoring period or reporting frequency | `src/config/monitoring.config.ts` → `MONITORING_SCHEDULE` | — |
| Change what a monthly report asks | `src/config/monitoring.config.ts` → `REPORT_FIELDS` | — |
| Change how success is judged | `src/config/monitoring.config.ts` → `EVALUATION_DIMENSIONS` | — |
| Change the registration code format | `src/config/registration-code.config.ts` | — |
| Reword a notification | `src/config/notifications.config.ts` | — |
| Turn on email / SMS / WhatsApp | `src/config/notifications.config.ts` → `ENABLED_CHANNELS` | Write the Edge Function (see below) |
| Add a role | `src/types/roles.ts`, then `src/config/permissions.config.ts` | Add matching RLS policies |
| Replace the agreement text | `src/config/agreement.config.ts` | Bump `AGREEMENT_TEMPLATE_VERSION` |
| Replace the Terms or Privacy Policy | `src/config/legal.config.ts` | — |

> **Why re-run migration `0004`?** Row Level Security reads the
> `is_applicant_editable`, `is_documents_editable` and `occupies_slot` flags
> from the `workflow_statuses` table. The TypeScript config and that table must
> agree, or the database will refuse edits the app thinks are allowed.

---

## Worked examples

### Adding an approval stage

Say the client decides applications need a **pastoral review** between
verification and the committee.

**1. Add the status** in `APPLICATION_STATUSES`:

```ts
pastoral_review: {
  id: 'pastoral_review',
  label: 'Pastoral review',
  applicantDescription: 'Your application is being reviewed by the pastoral team.',
  staffDescription: 'Awaiting pastoral sign-off before the committee sees it.',
  phase: 'verification',
  tone: 'progress',
  applicantEditable: false,
  documentsEditable: false,
  progress: 0.5,
  terminal: false,
  occupiesApplicantSlot: true,
  nextAction: {
    audience: 'committee',
    label: 'Complete pastoral review',
    description: 'Confirm the applicant is known to the ministry.',
    route: '/(committee)/applications',
    cta: 'Review',
  },
},
```

**2. Rewire the transitions.** Point `send_to_committee` at the new status, and
add one out of it:

```ts
{ id: 'send_to_pastoral', from: ['verification'], to: 'pastoral_review', … },
{ id: 'send_to_committee', from: ['pastoral_review'], to: 'committee_review', … },
```

**3. Add it to the timeline** in `WORKFLOW_TIMELINE`, in the right position.

**4. Add a row** to migration `0004` and re-run it.

That is the whole change. The applicant dashboard shows the new stage and its
"next step" copy, the committee detail screen grows a *Send to pastoral review*
button, the timeline renders it, and the audit log records it — none of which
required touching a screen.

### Adding a required document

In `src/config/documents.config.ts`:

```ts
{
  id: 'bank_statement',
  label: 'Six-month bank statement',
  description: 'A statement covering the last six months of trading.',
  category: 'business',
  requirement: 'required',
  accepts: ['application/pdf'],
  maxSizeMb: 10,
  allowCamera: false,
  order: 3,
},
```

Add the matching row to migration `0004` and re-run it. The upload screen shows
the new card, the submit guard now blocks until it is uploaded, and the
committee sees it in the verification list.

> Never rename an existing `id`. It is stored on every uploaded row. Add a new
> type and stop using the old one instead.

### Adding a form question

In `src/config/form.config.ts`, add to the relevant step's `fields`:

```ts
{
  id: 'number_of_dependants',
  label: 'How many people depend on your income?',
  type: 'number',
  required: false,
  min: 0,
  max: 50,
},
```

It renders, validates, saves, appears on the review screen and appears to the
committee — all automatically, because answers are stored in a JSONB column
keyed by field id.

To make a question conditional:

```ts
visibleWhen: { field: 'is_registered', equals: ['yes'] },
```

Hidden fields are never shown, never required and never validated.

> If a new question needs to be **searchable or sortable** by the committee, it
> also needs promoting to a real column: add it to `PROMOTED_FIELDS`, to
> `promotedColumns()` in `application.service.ts`, and as a column plus index in
> the schema.

### Changing the monitoring period

To move to eighteen months of quarterly reports:

```ts
export const MONITORING_SCHEDULE: MonitoringSchedule = {
  durationMonths: 18,
  intervalMonths: 3,
  graceDays: 14,
  windowOpensDaysBefore: 14,
};
```

Existing beneficiaries pick this up immediately, because the reporting calendar
is **derived** from the start date rather than stored. No backfill.

### Defining the registration code rule

The client hinted the code may relate to how long an applicant has been with the
ministry, but has not defined it. When they do, the change is confined to
`generateRegistrationCode()` in
`src/config/registration-code.config.ts`. The tenure and membership are already
threaded into the context object it receives:

```ts
export function generateRegistrationCode(context: RegistrationCodeContext): string {
  const tenureSegment = TENURE_CODES[context.membershipTenure ?? 'unknown'] ?? 'X';
  return ['ZWCC', context.programYear, tenureSegment, randomSegment(5)].join('-');
}
```

Codes already issued are stored on the application row and are never
regenerated, so history stays intact.

---

## Turning on email, SMS or WhatsApp

The transports exist and are wired up; what is missing is a provider, which is
deliberate. **A provider API key placed in this app would be readable by anyone
who installs it**, and could be used to send messages at the church's expense.

So the flow is:

1. The app writes a `notification_deliveries` row with `status = 'pending'`.
2. A Supabase Edge Function — holding the secret server-side — drains that
   table and calls the provider.
3. It writes back `sent` or `failed`.

To go live on SMS, for example:

1. Choose a provider (Termii, Africa's Talking and Twilio all deliver well in
   Nigeria).
2. Write an Edge Function that selects `where channel = 'sms' and status =
   'pending'`, sends, and updates the row.
3. Set `ENABLED_CHANNELS.sms = true` in `src/config/notifications.config.ts`.

No app change beyond that one boolean. WhatsApp additionally needs pre-approved
message templates, since its Business API only allows free-form text within 24
hours of a user's last message.

---

## Enabling corrections

The client currently says applications cannot be returned to applicants. If that
changes:

```ts
// src/config/workflow.config.ts
export const WORKFLOW_FEATURES = {
  allowReturnForCorrections: true,
  …
};
```

That is the entire change. The `changes_requested` status, its transitions, its
applicant-facing copy, its editability rules and its notification are already
defined and tested against the same code paths as every other status. The
committee detail screen grows a *Return for corrections* button, and the
applicant's form unlocks.

---

## What is not configuration

These need real code changes, and are called out so nobody hunts for a config
flag that does not exist:

- **New field *types*** (a file-upload question inside the form, a map picker,
  a signature pad). The type must be added to `FieldType`, rendered in
  `FormFieldRenderer`, and validated in `src/validation/application.ts`.
- **New notification *channels*** (push, Telegram). Add a transport class
  implementing `NotificationTransport` in `src/services/notifications/channels.ts`.
- **Structural schema changes** — anything that needs a new table or a new
  promoted column.
- **New roles** need matching RLS policies; the capability list alone controls
  the UI, not the data.
