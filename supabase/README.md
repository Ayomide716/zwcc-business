# Supabase setup

## Two forms of the same setup

| File | Size | Use |
| --- | --- | --- |
| `SETUP.sql` | 68 KB | Fully commented. Read this one. |
| `SETUP.min.sql` | 48 KB | Same SQL, comments stripped. Easier to paste on a phone. |

`SETUP.min.sql` is generated from `SETUP.sql` by removing whole-line comments
**outside** function bodies only — bodies are left byte-identical, since
stripping inside them risks corrupting a string literal.

Both were executed against PostgreSQL 16 on fresh databases and produce an
identical schema: 17 tables, 201 columns, 208 constraints, 50 functions,
50 indexes, 68 policies, 17 triggers, 3 storage buckets. All 80 policy
expressions and 50 function bodies compare byte-identical as stored by Postgres.

## Running the migrations

Open **SQL Editor** in the Supabase dashboard and run these in order. Each is
idempotent, so re-running is safe.

| Order | File | Purpose |
| --- | --- | --- |
| 1 | `migrations/0001_schema.sql` | Tables, indexes, triggers, helper functions |
| 2 | `migrations/0002_policies.sql` | Row Level Security |
| 3 | `migrations/0003_storage.sql` | Private buckets and their policies |
| 4 | `migrations/0004_seed_configuration.sql` | Statuses, document types, programme, settings |
| 5 | `migrations/0005_staff_notifications.sql` | `notify_staff_about_application()` |
| 6 | `migrations/0006_search_indexes.sql` | Trigram indexes behind the committee search box |
| 7 | `migrations/0007_review_scores.sql` | Committee scoring rubric |
| 8 | `migrations/0008_push_tokens.sql` | Device tokens for push notifications |
| 9 | `migrations/0009_push_dispatch.sql` | Trigger that sends a push per notification |
| 10 | `migrations/0010_email_queue.sql` | Retry counter and index behind email delivery |

## Turning email on

The app already queues an email for every notification whose template lists the
email channel. It cannot send one: an API key shipped in a mobile bundle is
readable by anyone who installs the app, and would let a stranger send mail at
the church's expense. The `send-email` function holds the key and drains the
queue.

```bash
supabase functions deploy send-email --no-verify-jwt
supabase secrets set RESEND_API_KEY=re_xxxxxxxx
supabase secrets set MAIL_FROM="ZWCC Business Grant <grants@yourdomain.org>"
```

The sending domain must be verified in Resend first, or mail lands in spam.

Then enable `pg_cron` (Database → Extensions) and schedule the drain, using the
snippet at the bottom of `migrations/0010_email_queue.sql`. It runs every
minute, does nothing when the queue is empty, and stops retrying an address
after three failures so one bad entry cannot block the rest.

To check it is working:

```sql
select status, count(*) from public.notification_deliveries
where channel = 'email' group by status;
```

Rows stay `pending` until the function is deployed and the secrets are set, at
which point the backlog goes out. Nothing is lost in the meantime.

## Turning push notifications on

Migrations 8 and 9 create everything except the sender, which cannot live in
the app: it reads other people's device tokens and therefore needs the service
role key, which must never ship to a phone.

Three steps, all one-off:

```bash
# 1. Deploy the sender.
supabase functions deploy send-push --no-verify-jwt
```

```sql
-- 2. Tell the trigger where it lives, and how to authenticate to it.
alter database postgres set app.push_function_url =
  'https://<your-project-ref>.supabase.co/functions/v1/send-push';
alter database postgres set app.service_role_key = '<service role key>';
```

3. Enable the `pg_net` extension if the dashboard has not already
   (Database → Extensions → `pg_net`).

Until all three are done, notifications still appear inside the app and nothing
errors — the trigger checks for its settings and returns quietly when they are
missing. Verified: with the settings absent, and with them set but `pg_net`
unavailable, the notification insert still succeeds and only logs a warning.

The service role key is a database setting, readable only by a database
superuser. It never reaches the app, `.env`, or `eas.json`.

With the Supabase CLI instead:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

## Re-run migration 4 whenever the workflow changes

`0004` seeds `workflow_statuses` from `src/config/workflow.config.ts`, and the
RLS policies read the editability flags from that table. If the two disagree,
the database will refuse edits the app believes are permitted, or permit ones it
should not.

The same applies to `document_types` and `src/config/documents.config.ts`.

## Creating the first administrator

Roles are never self-assigned — `handle_new_user` always creates a profile as
`applicant`, and `prevent_self_role_change` blocks anyone but an administrator
from changing a role. So the first admin is promoted by hand:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

After that, administrators promote committee members from inside the app.

```sql
-- Committee member
update public.profiles set role = 'committee' where email = 'reviewer@example.com';
```

## Verifying the security model

Worth doing once after setup. Sign in as an applicant in the app, then in the
SQL editor run these **as that user** (SQL Editor → run as `authenticated` with
their JWT, or use two devices):

```sql
-- Should return only their own row
select id, applicant_id from public.applications;

-- Should return zero rows, not an error — RLS filters rather than rejects
select * from public.applications where applicant_id <> auth.uid();

-- Should fail: only staff may verify a document
update public.documents set status = 'verified' where applicant_id = auth.uid();

-- Should fail: roles are not self-assignable
update public.profiles set role = 'admin' where id = auth.uid();
```

The first two demonstrate isolation; the last two should raise
`42501 insufficient privilege`.

## Storage layout

All three buckets are **private**. Objects are readable only through
short-lived signed URLs.

```
application-documents/<applicant>/<application>/<documentType>/<uuid>.<ext>
progress-media/<applicant>/<report>/<uuid>.<ext>
agreements/<applicant>/<agreement>.pdf
```

The **first path segment is always the owning user's id**, because the storage
policies authorise on it. Paths are built in
`src/services/storage.service.ts` and nowhere else — never construct one by
hand.

## Schema notes

- **Application answers live in `applications.form_data` (JSONB)**, keyed by the
  field ids in `src/config/form.config.ts`. Fields the committee searches or
  sorts on are *also* stored as real columns (`applicant_name`,
  `business_name`, `requested_amount`, …) so list queries stay fast without a
  migration per question.
- **`applications.status` is a foreign key to `workflow_statuses`**, so the
  workflow can change without a migration while the database still rejects
  invalid values.
- **Status history is written by a trigger**, not by the app, so it cannot be
  skipped by a caller that forgets.
- **One live application per applicant** is enforced by the
  `enforce_single_active_application` trigger, so two devices submitting at once
  cannot both succeed. A rejected or withdrawn application has
  `occupies_slot = false` and frees the applicant to reapply.
- **Nothing with historical value is hard-deleted.** Applications and documents
  carry `deleted_at`; a reapplication points back at its predecessor via
  `previous_application_id`.
- **`audit_logs` is append-only** — there is no UPDATE or DELETE policy for any
  role.

## Optional: notification delivery worker

Email, SMS and WhatsApp are disabled in `src/config/notifications.config.ts`
until a provider is chosen. The app writes `notification_deliveries` rows with
`status = 'pending'`; a server-side Edge Function should drain them.

The mobile app deliberately holds no provider credentials — anything in the
bundle is readable by anyone who installs the app.

```
supabase/functions/send-notifications/   (not yet written)
```

It needs the service-role key, which lives only in Edge Function secrets:

```bash
supabase secrets set SMS_PROVIDER_KEY=...
```

## Why `notify_staff_about_application` exists

When an applicant submits, the committee needs to know there is new work. But an
applicant cannot write that notification themselves, and should not be able to:

- `profiles` RLS lets them read only their own row, so they cannot discover who
  the reviewers are; and
- `notifications` RLS refuses an INSERT addressed to anyone but themselves.

Both restrictions are correct. So the fan-out runs inside a SECURITY DEFINER
function whose one guard is **ownership**: a caller may raise a staff
notification only about an application that is genuinely theirs. They cannot
enumerate staff, choose recipients, or notify about someone else's application.

Without it the fan-out fails silently — the applicant's own notification is
written and the committee's is quietly dropped, so a new submission never
announces itself.
