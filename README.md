# 2026 ZWCC Business Grant

A mobile application for **Zion World Christian Center, Lagos** — grant
applications, document verification, committee review, agreements and a year of
beneficiary monitoring.

Built with Expo SDK 57, React Native 0.86, TypeScript and Supabase. Targets
**Android and iOS**. It is a native mobile app, not a web app.

---

## The single most important thing to know

**The client's exact workflow is not final, so the workflow is data, not code.**

Statuses, transitions, approval stages, document requirements, form questions,
rejection reasons, monitoring cadence, notification copy and the registration
code format all live in `src/config/`. Screens read that configuration; they
never restate a rule. Changing the process is an edit to one file, not a
rewrite.

The centre of it is [`src/config/workflow.config.ts`](src/config/workflow.config.ts),
with the rules evaluated in [`src/workflow/engine.ts`](src/workflow/engine.ts).

See **[docs/CHANGING-THE-WORKFLOW.md](docs/CHANGING-THE-WORKFLOW.md)** for how to
make specific changes when the client's requirements arrive.

---

## Getting started

### 1. Install

```bash
npm install
```

### 2. Create the Supabase project

In the [Supabase dashboard](https://supabase.com/dashboard), create a project,
then open the **SQL Editor** and paste in **[`supabase/SETUP.sql`](supabase/SETUP.sql)**.
That one file contains every migration in the right order, and is safe to
re-run. It has been verified by executing it against PostgreSQL 16.

If you would rather apply them one at a time, the individual migrations are:

| Order | File | What it does |
| --- | --- | --- |
| 1 | `supabase/migrations/0001_schema.sql` | Tables, indexes, triggers |
| 2 | `supabase/migrations/0002_policies.sql` | Row Level Security — the real access control |
| 3 | `supabase/migrations/0003_storage.sql` | Private buckets and their policies |
| 4 | `supabase/migrations/0004_seed_configuration.sql` | Seeds statuses, document types, the programme |
| 5 | `supabase/migrations/0005_staff_notifications.sql` | Lets an applicant's submission alert the committee, safely |

Migration 4 must be **re-run** whenever the workflow configuration changes, because
RLS reads editability flags from the `workflow_statuses` table.

### 3. Configure the app

```bash
cp .env.example .env
```

Fill in `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` from
**Project Settings → API**.

> The anon key is safe to ship: Row Level Security is what protects the data.
> **Never** put the service-role key in this app — anything in a mobile bundle
> is readable by anyone who installs it.

### 4. Create the first administrator

Roles are never self-assigned. Register through the app as a normal user, then
in the Supabase SQL editor:

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

That administrator can then promote committee members from inside the app
(Admin → Users & roles).

### 5. Run

```bash
npm start           # then press a for Android, i for iOS
npm run android
npm run ios
```

### Building an installable APK

```bash
npm install -g eas-cli && eas login && eas init
npm run build:apk
```

See **[docs/BUILDING-THE-APK.md](docs/BUILDING-THE-APK.md)** — note that your
Supabase keys must go in `eas.json` as well as `.env`, because `.env` is
gitignored and never reaches the EAS build.

### Checks

```bash
npm run typecheck   # tsc --noEmit
npm run doctor      # npx expo-doctor
npx expo export --platform android   # verifies the whole app bundles
```

---

## Architecture

```
app/                          Expo Router routes (file-based navigation)
  (auth)/                     sign in, sign up, password reset
  (onboarding)/               carousel + eligibility gate
  (applicant)/                tabs: dashboard, application, reports, updates, profile
    application/[step].tsx    ONE screen that renders every form step
  (committee)/                tabs: overview, applications, beneficiaries, account
  (admin)/                    users, configuration viewer, audit log
  legal/                      terms, privacy

src/
  config/       ← business rules live here. Start reading here.
  workflow/     the engine that evaluates the workflow configuration
  services/     all Supabase access; nothing else touches the database
  hooks/        data fetching (React Query) and form state
  providers/    auth, query client, toasts
  components/
    ui/         primitives: Button, Card, TextField, Sheet, …
    app/        domain components: StatusBadge, DocumentSlotCard, timelines
    brand/      the ZWCC mark and onboarding illustrations
  theme/        design tokens — no component contains a raw colour
  validation/   Zod schemas derived from the form configuration
  lib/          Supabase client, error mapping, formatting
  types/        database and role types

supabase/migrations/   the schema, RLS, storage and seed
scripts/               brand asset generation
```

### Rules of the codebase

1. **Screens do not contain business rules.** They ask
   `src/workflow/engine.ts` or read `src/config/`.
2. **Only services touch Supabase.** Components and hooks call services.
3. **Every status change goes through `applicationService.applyTransition`.**
   Nothing else writes `applications.status`.
4. **Every user-facing error goes through `toUserError`.** Raw technical errors
   are never rendered.
5. **Components use theme tokens.** No hex values, no magic numbers.

---

## Security

Access control is enforced **in the database**, not in the app. The app's
permission checks exist so the UI does not offer actions that would fail; a
modified client gets a database error.

- **Row Level Security on every table.** An applicant can read and write only
  rows tied to their own `auth.uid()`. They can never see another applicant's
  application, documents, agreement, reports or notifications.
- **Applicants cannot edit outside the workflow.** The update policy checks
  the `is_applicant_editable` flag on the current status, read from
  `workflow_statuses` — so the workflow configuration is enforced server-side.
- **Applicants cannot verify their own documents.** A trigger rejects any
  non-staff attempt to set a document to `verified`, `rejected` or
  `under_review`.
- **Applicants cannot alter agreement terms.** A trigger blocks changes to the
  frozen clause snapshot; they may only sign.
- **Roles cannot be self-assigned.** A trigger rejects a role change from
  anyone who is not an administrator.
- **All storage buckets are private.** Files are readable only through
  short-lived signed URLs, and storage policies authorise on the owning user id
  in the object path.
- **The audit log is append-only.** There is no UPDATE or DELETE policy on
  `audit_logs` for any role, including administrators.
- **Sessions are stored in SecureStore** (Keychain / Keystore), chunked because
  a Supabase session can exceed the 2048-byte per-item limit.

---

## Performance on mobile networks

Nigeria is a primary market, so the app assumes slow, metered, intermittent
connections:

- **Images are compressed before upload.** A 4 MB camera photo becomes roughly
  200 KB at 1600px / quality 0.7, which looks identical on a phone.
- **Form drafts save to the device on every keystroke** and sync to the server
  on a debounce. A dropped connection never loses a half-written proposal; the
  UI says "Saved on this device" rather than interrupting the user.
- **Nothing is downloaded eagerly.** Documents and media open through signed
  URLs only when the user asks for them, and media URLs are fetched in one
  batched request rather than one per file.
- **Committee lists page server-side**; the client never downloads the table.
- **Dashboard counts use `head: true`** queries, which return a count with no
  rows.
- **Refetch-on-focus is off.** Screens offer pull-to-refresh instead of
  silently spending data every time the user switches apps.

---

## What is deliberately not built

These are the brief's explicit instructions, not omissions:

| Not built | Why |
| --- | --- |
| Payment integration (Paystack, Flutterwave, bank APIs) | The app does not move money. Disbursement is authorised in the app and paid outside it. The data model supports adding financial tracking later. |
| Email / SMS / WhatsApp sending | In-app notifications are live. The other three transports are implemented against a real interface and queue `notification_deliveries` rows for a server-side worker — because a provider API key in a mobile bundle is readable by anyone. |
| Final Terms & Conditions and Privacy Policy | Placeholder content, clearly marked, pending ZWCC's legal review. |
| Real agreement wording | Placeholder clauses, clearly marked. The signing flow is fully working. |
| Returning applications for correction | The client's current rule is that this is not allowed. The status, transition and screens exist behind one feature flag (`allowReturnForCorrections`). |
| Drawn signature capture / PDF generation | Typed-name signing works today. The data model stores `signature_method` + `signature_data`, so adding either is a new method value, not a schema change. |

---

## Branding

Navy (`#0B2545`) and white, with gold used sparingly for emphasis. The mark is
an arch — stewardship — containing an ascending chevron — enterprise and
growth — with a gold stem implying a cross. Faith-adjacent rather than overtly
religious, as the brief asked.

**The official ZWCC artwork was not available when this was built.** The mark is
drawn as vector geometry in
[`src/components/brand/Logo.tsx`](src/components/brand/Logo.tsx), which loads
the official artwork from `assets/brand/zwcc-logo.png`. Every screen imports
that component rather than a file path, so replacing the artwork is a one-file
change.

The launcher icon, adaptive-icon layers and splash mark in `assets/` are all
derived from the same file. The logo is drawn for a light ground — its sphere is
nearly the brand navy and its flame carries a pale glow — so the adaptive icon
sits on white and the splash mark sits on a white plate, rather than being
recoloured to suit a dark background.

---

## Notes for whoever picks this up next

- `npx expo-doctor` reports two failures in a sandboxed environment
  (`exp.host` and `reactnative.directory` are unreachable). Both are network
  checks. All 19 checks that do not require network access pass, including
  every dependency-version check.
- A **custom `babel.config.js` requires `babel-preset-expo` as a direct
  devDependency**, even though Expo depends on it internally. Removing it
  breaks bundling with a confusing `MODULE_NOT_FOUND`.
- Styling uses a token-based design system rather than NativeWind. NativeWind
  4.2.6 predates SDK 57 and its native styling layer carries build risk that
  could not be validated without a device. Swapping to it later is isolated to
  `src/theme/` and the component primitives.
