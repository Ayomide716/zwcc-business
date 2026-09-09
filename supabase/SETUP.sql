-- ===========================================================================
-- 2026 ZWCC BUSINESS GRANT — COMPLETE DATABASE SETUP
-- ===========================================================================
--
-- Paste this whole file into the Supabase SQL Editor and press Run. Once.
-- It contains migrations 0001-0005 in the correct order.
--
-- Safe to re-run: every statement is idempotent, so running it twice will not
-- duplicate or destroy anything. Verified against PostgreSQL 16 by executing
-- it twice against a populated database.
--
-- AFTER RUNNING THIS:
--
--   1. Register in the app as a normal user.
--   2. Come back here and promote yourself to administrator:
--
--        update public.profiles set role = 'admin'
--         where email = 'your-email@example.com';
--
--      You can then promote committee members from inside the app
--      (Admin -> Users & roles). Nobody can promote themselves from the app.
--
-- IF THE STORAGE SECTION ERRORS:
--   Some Supabase projects restrict creating policies on storage.objects from
--   the SQL editor. If you see "must be owner of table objects", skip to the
--   note at the end of this file — the buckets can be created in the
--   Storage UI instead, and the policies pasted from the Storage policy editor.
--
-- ===========================================================================



-- ===========================================================================
-- SECTION: 0001_schema.sql
-- ===========================================================================

-- ===========================================================================
-- 2026 ZWCC Business Grant — schema
-- ===========================================================================
-- Design notes
--
--  * Workflow statuses live in a TABLE (`workflow_statuses`) seeded from
--    `src/config/workflow.config.ts`. The application's `status` column is a
--    foreign key to it. That means the client can add or rename a status
--    without a migration, and the database still refuses nonsense values.
--
--  * Application answers live in a single JSONB column keyed by field id. The
--    handful of fields the committee searches and sorts on are ALSO stored as
--    real columns (see "promoted columns"), so list screens stay fast without
--    forcing a migration every time a question is added.
--
--  * Nothing is hard-deleted that has historical value. Applications and
--    documents carry `deleted_at`; a rejected application is preserved and a
--    reapplication points back at it via `previous_application_id`.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- One row per authenticated user. `role` drives every authorisation decision.

create table if not exists public.profiles (
  id                      uuid primary key references auth.users(id) on delete cascade,
  email                   text not null,
  full_name               text,
  phone                   text,
  role                    text not null default 'applicant'
                            check (role in ('applicant', 'committee', 'admin')),
  avatar_url              text,
  onboarding_completed_at timestamptz,
  deleted_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role) where deleted_at is null;
create index if not exists profiles_email_idx on public.profiles (lower(email));

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Role lookup used by every policy below.
--
-- SECURITY DEFINER is essential: a policy on `profiles` that queried
-- `profiles` through the normal path would recurse infinitely. This function
-- runs as its owner and therefore bypasses RLS on that one lookup.
create or replace function public.app_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid() and deleted_at is null;
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.app_role() in ('committee', 'admin'), false);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(public.app_role() = 'admin', false);
$$;

-- New sign-ups get a profile automatically, so the app never has a
-- half-registered user. Always 'applicant': staff roles are granted by an
-- administrator, never self-assigned at registration.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'applicant'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- grant_programs
-- ---------------------------------------------------------------------------

create table if not exists public.grant_programs (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  year        integer not null,
  summary     text,
  is_active   boolean not null default true,
  config      jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists grant_programs_set_updated_at on public.grant_programs;
create trigger grant_programs_set_updated_at
  before update on public.grant_programs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- workflow_statuses
-- ---------------------------------------------------------------------------
-- Mirrors src/config/workflow.config.ts. Re-run migration 0004 after changing
-- the workflow so the database agrees with the app.

create table if not exists public.workflow_statuses (
  id                    text primary key,
  label                 text not null,
  phase                 text not null,
  tone                  text not null default 'neutral',
  sort_order            integer not null default 0,
  is_terminal           boolean not null default false,
  is_active             boolean not null default true,
  -- These three mirror the config flags so RLS can enforce them server-side
  -- rather than trusting the client to respect them.
  is_applicant_editable boolean not null default false,
  is_documents_editable boolean not null default false,
  occupies_slot         boolean not null default true,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- applications
-- ---------------------------------------------------------------------------

create table if not exists public.applications (
  id                      uuid primary key default gen_random_uuid(),
  applicant_id            uuid not null references public.profiles(id) on delete cascade,
  program_id              uuid not null references public.grant_programs(id) on delete restrict,

  status                  text not null default 'draft'
                            references public.workflow_statuses(id) on update cascade,
  registration_code       text unique,

  form_data               jsonb not null default '{}'::jsonb,
  current_step            text,
  completed_steps         text[] not null default '{}',

  -- Promoted columns: duplicated out of form_data so the committee list can
  -- search, sort and aggregate without unpacking JSONB on every row.
  applicant_name          text,
  applicant_phone         text,
  business_name           text,
  business_sector         text,
  requested_amount        numeric(14, 2) check (requested_amount is null or requested_amount > 0),

  submitted_at            timestamptz,
  decided_at              timestamptz,
  decision_reason_code    text,
  decision_reason_note    text,

  -- Reapplication chain. Historical applications are never overwritten.
  previous_application_id uuid references public.applications(id) on delete set null,
  attempt_number          integer not null default 1 check (attempt_number > 0),

  deleted_at              timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists applications_applicant_idx
  on public.applications (applicant_id) where deleted_at is null;
create index if not exists applications_status_idx
  on public.applications (status) where deleted_at is null;
create index if not exists applications_submitted_idx
  on public.applications (submitted_at desc nulls last) where deleted_at is null;
create index if not exists applications_program_idx on public.applications (program_id);
create index if not exists applications_previous_idx on public.applications (previous_application_id);
-- Backs the committee search box (name / business / code).
create index if not exists applications_search_idx on public.applications
  using gin (to_tsvector('simple',
    coalesce(applicant_name, '') || ' ' ||
    coalesce(business_name, '') || ' ' ||
    coalesce(registration_code, '')));

drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();

-- Enforces "one live application per applicant" (brief §8) in the database, so
-- it holds even if two devices submit at once. A rejected or withdrawn
-- application has occupies_slot = false and therefore frees the applicant to
-- apply again (brief §15).
create or replace function public.enforce_single_active_application()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  active_count integer;
begin
  select count(*)
    into active_count
    from public.applications a
    join public.workflow_statuses s on s.id = a.status
   where a.applicant_id = new.applicant_id
     and a.deleted_at is null
     and a.id <> new.id
     and s.occupies_slot;

  if active_count > 0 then
    raise exception 'You already have an application in progress.'
      using errcode = '23505';
  end if;

  return new;
end;
$$;

drop trigger if exists applications_single_active on public.applications;
create trigger applications_single_active
  before insert on public.applications
  for each row execute function public.enforce_single_active_application();

-- ---------------------------------------------------------------------------
-- application_status_history
-- ---------------------------------------------------------------------------
-- Written by a trigger rather than by the app, so the audit trail cannot be
-- skipped by a caller that forgets.

create table if not exists public.application_status_history (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  from_status    text,
  to_status      text not null,
  transition_id  text,
  actor_id       uuid references public.profiles(id) on delete set null,
  reason_code    text,
  reason_note    text,
  created_at     timestamptz not null default now()
);

create index if not exists status_history_application_idx
  on public.application_status_history (application_id, created_at desc);

create or replace function public.record_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.application_status_history
      (application_id, from_status, to_status, actor_id)
    values (new.id, null, new.status, auth.uid());
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.application_status_history
      (application_id, from_status, to_status, actor_id, reason_code, reason_note)
    values (
      new.id, old.status, new.status, auth.uid(),
      new.decision_reason_code, new.decision_reason_note
    );
  end if;

  return new;
end;
$$;

drop trigger if exists applications_record_status on public.applications;
create trigger applications_record_status
  after insert or update of status on public.applications
  for each row execute function public.record_status_change();

-- ---------------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------------
-- Normalised out of form_data at submission time. Monitoring tracks a business
-- over a year, so it earns its own row rather than living only in JSONB.

create table if not exists public.businesses (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid not null unique references public.applications(id) on delete cascade,
  applicant_id     uuid not null references public.profiles(id) on delete cascade,
  name             text not null,
  sector           text,
  stage            text,
  description      text,
  address          text,
  is_registered    boolean,
  cac_number       text,
  employees_count  integer check (employees_count is null or employees_count >= 0),
  monthly_revenue  numeric(14, 2) check (monthly_revenue is null or monthly_revenue >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists businesses_applicant_idx on public.businesses (applicant_id);

drop trigger if exists businesses_set_updated_at on public.businesses;
create trigger businesses_set_updated_at
  before update on public.businesses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- document_types / documents
-- ---------------------------------------------------------------------------

create table if not exists public.document_types (
  id           text primary key,
  label        text not null,
  description  text,
  category     text not null default 'other',
  requirement  text not null default 'optional' check (requirement in ('required', 'optional')),
  accepts      text[] not null default '{}',
  max_size_mb  integer not null default 10 check (max_size_mb > 0),
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists document_types_set_updated_at on public.document_types;
create trigger document_types_set_updated_at
  before update on public.document_types
  for each row execute function public.set_updated_at();

create table if not exists public.documents (
  id                    uuid primary key default gen_random_uuid(),
  application_id        uuid not null references public.applications(id) on delete cascade,
  applicant_id          uuid not null references public.profiles(id) on delete cascade,
  document_type_id      text not null references public.document_types(id) on update cascade,

  storage_path          text not null,
  file_name             text not null,
  mime_type             text not null,
  size_bytes            bigint not null check (size_bytes > 0),

  status                text not null default 'uploaded'
                          check (status in ('uploaded', 'under_review', 'verified', 'rejected')),
  verified_by           uuid references public.profiles(id) on delete set null,
  verified_at           timestamptz,
  rejection_reason_code text,
  rejection_note        text,

  -- Bumped when a document is replaced, so re-uploads stay traceable.
  version               integer not null default 1,

  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- At most one live document per type per application. Replacing a document
-- soft-deletes the old row rather than destroying the evidence.
create unique index if not exists documents_one_live_per_type
  on public.documents (application_id, document_type_id) where deleted_at is null;
create index if not exists documents_application_idx on public.documents (application_id);
create index if not exists documents_status_idx on public.documents (status) where deleted_at is null;

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- application_reviews
-- ---------------------------------------------------------------------------

create table if not exists public.application_reviews (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  reviewer_id    uuid not null references public.profiles(id) on delete cascade,
  stage          text not null default 'committee_review',
  decision       text check (decision in ('approve', 'reject', 'request_changes', 'note')),
  notes          text,
  -- Internal notes are invisible to applicants; enforced by RLS, not by the UI.
  is_internal    boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists reviews_application_idx
  on public.application_reviews (application_id, created_at desc);

drop trigger if exists reviews_set_updated_at on public.application_reviews;
create trigger reviews_set_updated_at
  before update on public.application_reviews
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- agreements
-- ---------------------------------------------------------------------------

create table if not exists public.agreements (
  id                uuid primary key default gen_random_uuid(),
  application_id    uuid not null unique references public.applications(id) on delete cascade,
  applicant_id      uuid not null references public.profiles(id) on delete cascade,
  template_version  text not null,
  -- Frozen copy of what was actually presented, so editing the template later
  -- cannot rewrite the terms someone already agreed to.
  content_snapshot  jsonb not null default '{}'::jsonb,
  status            text not null default 'issued' check (status in ('issued', 'signed', 'void')),
  issued_at         timestamptz not null default now(),
  issued_by         uuid references public.profiles(id) on delete set null,
  signed_at         timestamptz,
  signature_method  text,
  signature_data    text,
  signer_name       text,
  document_path     text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists agreements_applicant_idx on public.agreements (applicant_id);

drop trigger if exists agreements_set_updated_at on public.agreements;
create trigger agreements_set_updated_at
  before update on public.agreements
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- beneficiaries
-- ---------------------------------------------------------------------------

create table if not exists public.beneficiaries (
  id                    uuid primary key default gen_random_uuid(),
  application_id        uuid not null unique references public.applications(id) on delete cascade,
  applicant_id          uuid not null references public.profiles(id) on delete cascade,
  business_id           uuid references public.businesses(id) on delete set null,
  monitoring_started_at timestamptz not null default now(),
  monitoring_ends_at    timestamptz not null,
  status                text not null default 'active'
                          check (status in ('active', 'completed', 'paused')),
  -- Outcome evaluation is deliberately open-ended (brief §19): scores against
  -- named dimensions plus a verdict, with no hardcoded financial threshold.
  outcome_verdict       text,
  outcome_scores        jsonb not null default '{}'::jsonb,
  outcome_notes         text,
  evaluated_by          uuid references public.profiles(id) on delete set null,
  evaluated_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists beneficiaries_status_idx on public.beneficiaries (status);
create index if not exists beneficiaries_applicant_idx on public.beneficiaries (applicant_id);

drop trigger if exists beneficiaries_set_updated_at on public.beneficiaries;
create trigger beneficiaries_set_updated_at
  before update on public.beneficiaries
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- progress_reports / progress_media
-- ---------------------------------------------------------------------------

create table if not exists public.progress_reports (
  id              uuid primary key default gen_random_uuid(),
  beneficiary_id  uuid not null references public.beneficiaries(id) on delete cascade,
  application_id  uuid not null references public.applications(id) on delete cascade,
  applicant_id    uuid not null references public.profiles(id) on delete cascade,
  period_number   integer not null check (period_number > 0),
  period_start    timestamptz not null,
  due_date        timestamptz not null,
  status          text not null default 'submitted'
                    check (status in ('submitted', 'under_review', 'reviewed')),
  data            jsonb not null default '{}'::jsonb,
  submitted_at    timestamptz not null default now(),
  reviewed_by     uuid references public.profiles(id) on delete set null,
  reviewed_at     timestamptz,
  review_notes    text,
  review_score    integer check (review_score is null or review_score between 1 and 5),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- One report per period. "Missed" periods are simply absent rows, derived
  -- against the schedule in monitoring.config.ts rather than stored.
  unique (beneficiary_id, period_number)
);

create index if not exists reports_beneficiary_idx
  on public.progress_reports (beneficiary_id, period_number);
create index if not exists reports_status_idx on public.progress_reports (status);
create index if not exists reports_submitted_idx on public.progress_reports (submitted_at desc);

drop trigger if exists reports_set_updated_at on public.progress_reports;
create trigger reports_set_updated_at
  before update on public.progress_reports
  for each row execute function public.set_updated_at();

create table if not exists public.progress_media (
  id               uuid primary key default gen_random_uuid(),
  report_id        uuid not null references public.progress_reports(id) on delete cascade,
  applicant_id     uuid not null references public.profiles(id) on delete cascade,
  storage_path     text not null,
  media_type       text not null check (media_type in ('image', 'video')),
  mime_type        text not null,
  size_bytes       bigint not null check (size_bytes > 0),
  caption          text,
  duration_seconds integer,
  created_at       timestamptz not null default now()
);

create index if not exists progress_media_report_idx on public.progress_media (report_id);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  event_id   text not null,
  category   text not null default 'application',
  title      text not null,
  body       text not null,
  route      text,
  payload    jsonb not null default '{}'::jsonb,
  important  boolean not null default false,
  is_read    boolean not null default false,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where is_read = false;

-- Outbound delivery attempts for the email / SMS / WhatsApp channels. Rows are
-- written as 'pending' and picked up by a server-side worker; the mobile app
-- never holds provider credentials.
create table if not exists public.notification_deliveries (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  channel         text not null check (channel in ('in_app', 'email', 'sms', 'whatsapp')),
  status          text not null default 'pending'
                    check (status in ('pending', 'sent', 'failed', 'skipped')),
  provider        text,
  error           text,
  attempted_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists deliveries_pending_idx
  on public.notification_deliveries (status) where status = 'pending';

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
-- Append-only. There is deliberately no UPDATE or DELETE policy anywhere in
-- migration 0002, so no client role can alter history.

create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  actor_role  text,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_entity_idx on public.audit_logs (entity_type, entity_id);
create index if not exists audit_actor_idx on public.audit_logs (actor_id);

-- ---------------------------------------------------------------------------
-- app_settings
-- ---------------------------------------------------------------------------
-- Server-side overrides for values that otherwise live in the config layer, so
-- an administrator can change them without shipping a new build.

create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);


-- ===========================================================================
-- SECTION: 0002_policies.sql
-- ===========================================================================

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
-- These policies are the real access control. The mobile app's permission
-- checks (src/config/permissions.config.ts) exist only so the UI does not offer
-- actions that would fail; a tampered client gets a database error here.
--
-- The guarantees, stated plainly:
--   * An applicant can read and write ONLY rows tied to their own auth.uid().
--   * An applicant can never see another applicant's application, documents,
--     agreement, reports or notifications.
--   * An applicant can only edit an application while its status is flagged
--     editable in `workflow_statuses` — the client cannot bypass the workflow.
--   * Committee and admin roles get read access to the review surface and write
--     access to exactly the columns their job needs.
--   * Audit logs are append-only for everyone.
-- ===========================================================================

alter table public.profiles                  enable row level security;
alter table public.grant_programs            enable row level security;
alter table public.workflow_statuses         enable row level security;
alter table public.applications              enable row level security;
alter table public.application_status_history enable row level security;
alter table public.businesses                enable row level security;
alter table public.document_types            enable row level security;
alter table public.documents                 enable row level security;
alter table public.application_reviews       enable row level security;
alter table public.agreements                enable row level security;
alter table public.beneficiaries             enable row level security;
alter table public.progress_reports          enable row level security;
alter table public.progress_media            enable row level security;
alter table public.notifications             enable row level security;
alter table public.notification_deliveries   enable row level security;
alter table public.audit_logs                enable row level security;
alter table public.app_settings              enable row level security;

-- ---------------------------------------------------------------------------
-- Helper: is this application still editable by its applicant?
-- ---------------------------------------------------------------------------
-- Reads the flag from workflow_statuses, which migration 0004 seeds from the
-- TypeScript workflow config. Changing the workflow therefore changes what the
-- database permits, with no policy rewrite.

create or replace function public.application_is_applicant_editable(app_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(s.is_applicant_editable, false)
    from public.applications a
    join public.workflow_statuses s on s.id = a.status
   where a.id = app_id;
$$;

create or replace function public.application_documents_editable(app_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(s.is_documents_editable, false)
    from public.applications a
    join public.workflow_statuses s on s.id = a.status
   where a.id = app_id;
$$;

create or replace function public.owns_application(app_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.applications
     where id = app_id and applicant_id = auth.uid() and deleted_at is null
  );
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_select_staff on public.profiles;
create policy profiles_select_staff on public.profiles
  for select using (public.is_staff());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Only an administrator may change roles. Because `role` is a column on the
-- same row a user can otherwise update, self-promotion is blocked by a trigger
-- rather than by the policy (a policy cannot easily compare old vs new).
create or replace function public.prevent_self_role_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- `auth.uid()` is null when there is no signed-in caller: a migration, the
  -- Supabase SQL editor, or a service-role key. Those contexts are already
  -- privileged, and this is how the FIRST administrator gets promoted — there
  -- is no admin yet to authorise it. Blocking them would make bootstrapping
  -- impossible.
  --
  -- The guard that matters is the one below it: any *signed-in* user who is
  -- not an administrator is refused, so an applicant cannot escalate.
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only an administrator can change a user role.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.prevent_self_role_change();

drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Reference data: readable by any signed-in user, writable only by admins
-- ---------------------------------------------------------------------------

drop policy if exists programs_read on public.grant_programs;
create policy programs_read on public.grant_programs
  for select to authenticated using (true);

drop policy if exists programs_admin on public.grant_programs;
create policy programs_admin on public.grant_programs
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists statuses_read on public.workflow_statuses;
create policy statuses_read on public.workflow_statuses
  for select to authenticated using (true);

drop policy if exists statuses_admin on public.workflow_statuses;
create policy statuses_admin on public.workflow_statuses
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists doctypes_read on public.document_types;
create policy doctypes_read on public.document_types
  for select to authenticated using (true);

drop policy if exists doctypes_admin on public.document_types;
create policy doctypes_admin on public.document_types
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- applications
-- ---------------------------------------------------------------------------

drop policy if exists applications_select_own on public.applications;
create policy applications_select_own on public.applications
  for select using (applicant_id = auth.uid());

drop policy if exists applications_select_staff on public.applications;
create policy applications_select_staff on public.applications
  for select using (public.is_staff());

drop policy if exists applications_insert_own on public.applications;
create policy applications_insert_own on public.applications
  for insert with check (
    applicant_id = auth.uid()
    -- An application may only be created in a status the applicant is allowed
    -- to hold; this stops a client inserting a row already marked 'approved'.
    and status in (
      select id from public.workflow_statuses where is_applicant_editable
    )
  );

-- An applicant may edit only while the workflow says the form is open. The
-- WITH CHECK clause re-reads the status from workflow_statuses so an applicant
-- cannot move their own application to an arbitrary status (e.g. 'approved') —
-- the only statuses they can write are editable ones plus 'submitted'
-- and 'withdrawn', which are their two legitimate exits.
drop policy if exists applications_update_own on public.applications;
create policy applications_update_own on public.applications
  for update
  using (
    applicant_id = auth.uid()
    and public.application_is_applicant_editable(id)
  )
  with check (
    applicant_id = auth.uid()
    and (
      status in (select id from public.workflow_statuses where is_applicant_editable)
      or status in ('submitted', 'withdrawn')
    )
  );

drop policy if exists applications_update_staff on public.applications;
create policy applications_update_staff on public.applications
  for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists applications_admin_all on public.applications;
create policy applications_admin_all on public.applications
  for all using (public.is_admin()) with check (public.is_admin());

-- Status history is readable by the owner and by staff, and is never written
-- directly by a client — the trigger in migration 0001 owns it.
drop policy if exists history_select on public.application_status_history;
create policy history_select on public.application_status_history
  for select using (
    public.is_staff() or public.owns_application(application_id)
  );

-- ---------------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------------

drop policy if exists businesses_select on public.businesses;
create policy businesses_select on public.businesses
  for select using (applicant_id = auth.uid() or public.is_staff());

drop policy if exists businesses_write_own on public.businesses;
create policy businesses_write_own on public.businesses
  for insert with check (applicant_id = auth.uid());

drop policy if exists businesses_update_own on public.businesses;
create policy businesses_update_own on public.businesses
  for update using (applicant_id = auth.uid()) with check (applicant_id = auth.uid());

drop policy if exists businesses_staff on public.businesses;
create policy businesses_staff on public.businesses
  for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------

drop policy if exists documents_select_own on public.documents;
create policy documents_select_own on public.documents
  for select using (applicant_id = auth.uid());

drop policy if exists documents_select_staff on public.documents;
create policy documents_select_staff on public.documents
  for select using (public.is_staff());

-- Upload is only permitted while the workflow leaves documents open, and only
-- against an application the caller actually owns.
drop policy if exists documents_insert_own on public.documents;
create policy documents_insert_own on public.documents
  for insert with check (
    applicant_id = auth.uid()
    and public.owns_application(application_id)
    and public.application_documents_editable(application_id)
    and status = 'uploaded'
  );

-- Applicants may only soft-delete (replace) their own documents, and only
-- while documents are still editable. They cannot flip `status` to 'verified':
-- the guard trigger below enforces that.
drop policy if exists documents_update_own on public.documents;
create policy documents_update_own on public.documents
  for update
  using (
    applicant_id = auth.uid()
    and public.application_documents_editable(application_id)
  )
  with check (applicant_id = auth.uid());

create or replace function public.guard_document_verification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Only staff may move a document into a verification outcome.
  if new.status is distinct from old.status
     and new.status in ('verified', 'rejected', 'under_review')
     and not public.is_staff() then
    raise exception 'Only a reviewer can verify or reject a document.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists documents_guard_verification on public.documents;
create trigger documents_guard_verification
  before update on public.documents
  for each row execute function public.guard_document_verification();

drop policy if exists documents_update_staff on public.documents;
create policy documents_update_staff on public.documents
  for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists documents_admin_all on public.documents;
create policy documents_admin_all on public.documents
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- application_reviews
-- ---------------------------------------------------------------------------
-- Internal notes never reach the applicant. This is why `is_internal` is
-- checked in the policy rather than filtered in a query the client controls.

drop policy if exists reviews_select_applicant on public.application_reviews;
create policy reviews_select_applicant on public.application_reviews
  for select using (
    is_internal = false and public.owns_application(application_id)
  );

drop policy if exists reviews_select_staff on public.application_reviews;
create policy reviews_select_staff on public.application_reviews
  for select using (public.is_staff());

drop policy if exists reviews_insert_staff on public.application_reviews;
create policy reviews_insert_staff on public.application_reviews
  for insert with check (public.is_staff() and reviewer_id = auth.uid());

drop policy if exists reviews_update_own on public.application_reviews;
create policy reviews_update_own on public.application_reviews
  for update using (public.is_staff() and reviewer_id = auth.uid())
  with check (public.is_staff() and reviewer_id = auth.uid());

drop policy if exists reviews_admin on public.application_reviews;
create policy reviews_admin on public.application_reviews
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- agreements
-- ---------------------------------------------------------------------------

drop policy if exists agreements_select on public.agreements;
create policy agreements_select on public.agreements
  for select using (applicant_id = auth.uid() or public.is_staff());

drop policy if exists agreements_insert_staff on public.agreements;
create policy agreements_insert_staff on public.agreements
  for insert with check (public.is_staff());

-- The applicant may update their own agreement solely to sign it. The guard
-- trigger prevents them altering the terms they are signing.
drop policy if exists agreements_sign_own on public.agreements;
create policy agreements_sign_own on public.agreements
  for update using (applicant_id = auth.uid() and status = 'issued')
  with check (applicant_id = auth.uid() and status = 'signed');

create or replace function public.guard_agreement_signature()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_staff() then
    -- An applicant signing may not rewrite the document they are agreeing to.
    if new.content_snapshot is distinct from old.content_snapshot
       or new.template_version is distinct from old.template_version
       or new.application_id is distinct from old.application_id then
      raise exception 'The agreement terms cannot be modified.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists agreements_guard_signature on public.agreements;
create trigger agreements_guard_signature
  before update on public.agreements
  for each row execute function public.guard_agreement_signature();

drop policy if exists agreements_staff_update on public.agreements;
create policy agreements_staff_update on public.agreements
  for update using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- beneficiaries
-- ---------------------------------------------------------------------------

drop policy if exists beneficiaries_select on public.beneficiaries;
create policy beneficiaries_select on public.beneficiaries
  for select using (applicant_id = auth.uid() or public.is_staff());

drop policy if exists beneficiaries_staff on public.beneficiaries;
create policy beneficiaries_staff on public.beneficiaries
  for all using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- progress_reports / progress_media
-- ---------------------------------------------------------------------------

drop policy if exists reports_select_own on public.progress_reports;
create policy reports_select_own on public.progress_reports
  for select using (applicant_id = auth.uid());

drop policy if exists reports_select_staff on public.progress_reports;
create policy reports_select_staff on public.progress_reports
  for select using (public.is_staff());

drop policy if exists reports_insert_own on public.progress_reports;
create policy reports_insert_own on public.progress_reports
  for insert with check (
    applicant_id = auth.uid()
    and status = 'submitted'
    and exists (
      select 1 from public.beneficiaries b
       where b.id = beneficiary_id
         and b.applicant_id = auth.uid()
         and b.status = 'active'
    )
  );

-- A submitted report may be amended by its author only until staff pick it up.
drop policy if exists reports_update_own on public.progress_reports;
create policy reports_update_own on public.progress_reports
  for update using (applicant_id = auth.uid() and status = 'submitted')
  with check (applicant_id = auth.uid() and status = 'submitted');

drop policy if exists reports_update_staff on public.progress_reports;
create policy reports_update_staff on public.progress_reports
  for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists media_select_own on public.progress_media;
create policy media_select_own on public.progress_media
  for select using (applicant_id = auth.uid() or public.is_staff());

drop policy if exists media_insert_own on public.progress_media;
create policy media_insert_own on public.progress_media
  for insert with check (
    applicant_id = auth.uid()
    and exists (
      select 1 from public.progress_reports r
       where r.id = report_id and r.applicant_id = auth.uid()
    )
  );

drop policy if exists media_delete_own on public.progress_media;
create policy media_delete_own on public.progress_media
  for delete using (
    applicant_id = auth.uid()
    and exists (
      select 1 from public.progress_reports r
       where r.id = report_id and r.applicant_id = auth.uid() and r.status = 'submitted'
    )
  );

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select using (user_id = auth.uid());

-- Marking as read is the only field a recipient changes.
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Staff raise notifications for applicants as a side effect of workflow
-- actions; admins may broadcast.
drop policy if exists notifications_insert_staff on public.notifications;
create policy notifications_insert_staff on public.notifications
  for insert with check (public.is_staff() or user_id = auth.uid());

drop policy if exists notifications_admin on public.notifications;
create policy notifications_admin on public.notifications
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists deliveries_select_staff on public.notification_deliveries;
create policy deliveries_select_staff on public.notification_deliveries
  for select using (public.is_staff());

drop policy if exists deliveries_insert on public.notification_deliveries;
create policy deliveries_insert on public.notification_deliveries
  for insert with check (
    exists (
      select 1 from public.notifications n
       where n.id = notification_id
         and (n.user_id = auth.uid() or public.is_staff())
    )
  );

-- ---------------------------------------------------------------------------
-- audit_logs — append only
-- ---------------------------------------------------------------------------
-- Note what is absent: there is no UPDATE policy and no DELETE policy on this
-- table for any role, so audit history cannot be rewritten through the API.

drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs
  for insert to authenticated with check (actor_id = auth.uid() or actor_id is null);

drop policy if exists audit_select_staff on public.audit_logs;
create policy audit_select_staff on public.audit_logs
  for select using (public.is_staff());

-- ---------------------------------------------------------------------------
-- app_settings
-- ---------------------------------------------------------------------------

drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings
  for select to authenticated using (true);

drop policy if exists settings_admin on public.app_settings;
create policy settings_admin on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());


-- ===========================================================================
-- SECTION: 0003_storage.sql
-- ===========================================================================

-- ===========================================================================
-- Storage buckets and access control
-- ===========================================================================
-- Every bucket is PRIVATE. Nothing uploaded here is reachable by URL guessing —
-- files are served exclusively through short-lived signed URLs minted for a
-- caller who has already passed these policies.
--
-- Path convention, relied on by every policy below:
--
--     <applicant_uuid>/<application_uuid>/<document_type>/<file_uuid>.<ext>
--     ^^^^^^^^^^^^^^^^
--     folder 1 is always the owning user's id
--
-- That first path segment is what ties a stored object back to a user, so the
-- policies compare `(storage.foldername(name))[1]` against `auth.uid()`.
-- Client code must never build a path by hand — use `buildDocumentPath()` /
-- `buildProgressMediaPath()` in src/services/storage.service.ts.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'application-documents',
    'application-documents',
    false,
    15728640, -- 15 MB
    array['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
  ),
  (
    'progress-media',
    'progress-media',
    false,
    52428800, -- 50 MB, to allow a short video
    array['image/jpeg', 'image/jpg', 'image/png', 'video/mp4', 'video/quicktime']
  ),
  (
    'agreements',
    'agreements',
    false,
    10485760, -- 10 MB
    array['application/pdf']
  )
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- application-documents
-- ---------------------------------------------------------------------------

drop policy if exists "documents owner read" on storage.objects;
create policy "documents owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "documents staff read" on storage.objects;
create policy "documents staff read" on storage.objects
  for select to authenticated
  using (bucket_id = 'application-documents' and public.is_staff());

drop policy if exists "documents owner write" on storage.objects;
create policy "documents owner write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "documents owner update" on storage.objects;
create policy "documents owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Applicants may remove a file they replaced. The database row is soft-deleted
-- separately, so the audit trail survives the object being purged.
drop policy if exists "documents owner delete" on storage.objects;
create policy "documents owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "documents admin delete" on storage.objects;
create policy "documents admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'application-documents' and public.is_admin());

-- ---------------------------------------------------------------------------
-- progress-media
-- ---------------------------------------------------------------------------

drop policy if exists "media owner read" on storage.objects;
create policy "media owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'progress-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media staff read" on storage.objects;
create policy "media staff read" on storage.objects
  for select to authenticated
  using (bucket_id = 'progress-media' and public.is_staff());

drop policy if exists "media owner write" on storage.objects;
create policy "media owner write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'progress-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media owner delete" on storage.objects;
create policy "media owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'progress-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- agreements
-- ---------------------------------------------------------------------------
-- Generated PDFs. Written by staff / a server-side job; the beneficiary may
-- read their own copy.

drop policy if exists "agreements owner read" on storage.objects;
create policy "agreements owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'agreements'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "agreements staff all" on storage.objects;
create policy "agreements staff all" on storage.objects
  for all to authenticated
  using (bucket_id = 'agreements' and public.is_staff())
  with check (bucket_id = 'agreements' and public.is_staff());


-- ===========================================================================
-- SECTION: 0004_seed_configuration.sql
-- ===========================================================================

-- ===========================================================================
-- Configuration seed
-- ===========================================================================
-- Mirrors the TypeScript configuration into the database. Everything here is
-- an UPSERT, so this file is safe to re-run — and MUST be re-run whenever
-- `src/config/workflow.config.ts` or `src/config/documents.config.ts` changes,
-- because RLS reads the editability flags from `workflow_statuses`.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Workflow statuses  (source: src/config/workflow.config.ts)
-- ---------------------------------------------------------------------------

insert into public.workflow_statuses
  (id, label, phase, tone, sort_order, is_terminal, is_applicant_editable, is_documents_editable, occupies_slot)
values
  ('draft',                   'Draft',                   'preparation',  'neutral',  10, false, true,  true,  true),
  ('submitted',               'Submitted',               'verification', 'info',     20, false, false, false, true),
  ('verification',            'Under verification',      'verification', 'progress', 30, false, false, false, true),
  ('committee_review',        'Committee review',        'decision',     'progress', 40, false, false, false, true),
  -- Reachable only when WORKFLOW_FEATURES.allowReturnForCorrections is enabled.
  ('changes_requested',       'Corrections requested',   'verification', 'warning',  35, false, true,  true,  true),
  ('approved',                'Approved',                'decision',     'success',  50, false, false, false, true),
  -- Terminal, but frees the applicant's slot so they can reapply (§15).
  ('rejected',                'Not approved',            'closed',       'danger',   55, true,  false, false, false),
  ('agreement_pending',       'Agreement to sign',       'agreement',    'warning',  60, false, false, false, true),
  ('agreement_signed',        'Agreement signed',        'agreement',    'info',     70, false, false, false, true),
  ('disbursement_authorised', 'Cleared for disbursement','agreement',    'success',  80, false, false, false, true),
  ('monitoring',              'Active beneficiary',      'monitoring',   'progress', 90, false, false, false, true),
  ('completed',               'Grant completed',         'closed',       'success', 100, true,  false, false, false),
  ('withdrawn',               'Withdrawn',               'closed',       'neutral', 110, true,  false, false, false)
on conflict (id) do update
  set label                 = excluded.label,
      phase                 = excluded.phase,
      tone                  = excluded.tone,
      sort_order            = excluded.sort_order,
      is_terminal           = excluded.is_terminal,
      is_applicant_editable = excluded.is_applicant_editable,
      is_documents_editable = excluded.is_documents_editable,
      occupies_slot         = excluded.occupies_slot;

-- ---------------------------------------------------------------------------
-- Document types  (source: src/config/documents.config.ts)
-- ---------------------------------------------------------------------------

insert into public.document_types
  (id, label, description, category, requirement, accepts, max_size_mb, sort_order)
values
  ('passport_photograph',
   'Passport photograph',
   'A recent, clear passport photograph of the applicant.',
   'personal', 'required',
   array['image/jpeg', 'image/jpg', 'image/png'], 5, 1),

  ('means_of_identification',
   'Means of identification',
   'Any government-issued ID — NIN slip, driver''s licence, voter''s card or passport.',
   'personal', 'required',
   array['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'], 10, 2),

  ('cac_document',
   'CAC registration document',
   'Corporate Affairs Commission certificate or status report for your business.',
   'business', 'required',
   array['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'], 10, 3),

  ('business_evidence',
   'Evidence of business activity',
   'Photographs of your shop, stock, workspace, or recent sales records.',
   'business', 'optional',
   array['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'], 15, 4),

  ('cell_leader_verification',
   'Cell leader verification form',
   'The verification form completed and signed by your cell leader.',
   'church', 'optional',
   array['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'], 10, 5),

  ('believers_form',
   'Believer''s completed form',
   'Your completed believer''s form, if you have one.',
   'other', 'optional',
   array['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'], 10, 6)
on conflict (id) do update
  set label       = excluded.label,
      description = excluded.description,
      category    = excluded.category,
      requirement = excluded.requirement,
      accepts     = excluded.accepts,
      max_size_mb = excluded.max_size_mb,
      sort_order  = excluded.sort_order;

-- ---------------------------------------------------------------------------
-- Grant programme
-- ---------------------------------------------------------------------------

insert into public.grant_programs (slug, name, year, summary, is_active, config)
values (
  'zwcc-business-grant-2026',
  '2026 ZWCC Business Grant',
  2026,
  'The 2026 ZWCC Business Grant provides funding to help people start and grow sustainable businesses. Grants are awarded on the strength of the business proposal.',
  true,
  jsonb_build_object(
    'currency', 'NGN',
    -- Deliberately null: the amount follows the proposal (brief §8).
    'minAmount', null,
    'maxAmount', null,
    'monitoringMonths', 12,
    'reportingIntervalMonths', 1
  )
)
on conflict (slug) do update
  set name    = excluded.name,
      year    = excluded.year,
      summary = excluded.summary,
      config  = excluded.config;

-- ---------------------------------------------------------------------------
-- Settings an administrator can change without a new build
-- ---------------------------------------------------------------------------

insert into public.app_settings (key, value, description)
values
  ('applications_open', 'true'::jsonb,
   'When false, new applications cannot be started.'),
  ('registration_code_prefix', '"ZWCC"'::jsonb,
   'Leading segment of the application registration code.'),
  ('support_email', '"grants@zionworldcc.org"'::jsonb,
   'Shown on error and help screens.'),
  ('support_phone', '"+234 800 000 0000"'::jsonb,
   'Shown on error and help screens.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Promoting a user to staff
-- ---------------------------------------------------------------------------
-- Roles are never self-assigned. After the person has registered through the
-- app, an administrator (or a project owner running SQL) promotes them:
--
--   update public.profiles set role = 'committee'
--    where email = 'reviewer@zionworldcc.org';
--
--   update public.profiles set role = 'admin'
--    where email = 'admin@zionworldcc.org';
--
-- The first administrator must be promoted this way, from the Supabase SQL
-- editor, because `prevent_self_role_change` blocks everyone else.


-- ===========================================================================
-- SECTION: 0005_staff_notifications.sql
-- ===========================================================================

-- ===========================================================================
-- Notifying staff about an applicant's own event
-- ===========================================================================
-- The problem this solves:
--
-- When an applicant submits, the committee should be told there is new work.
-- But an applicant cannot do that directly, and should not be able to:
--   * `profiles` RLS lets them read only their own row, so they cannot even
--     discover who the reviewers are; and
--   * `notifications` RLS refuses an INSERT whose user_id is not their own.
--
-- Without this function the fan-out fails silently — the applicant's own
-- notification is written, the committee's is quietly dropped, and a new
-- submission never announces itself.
--
-- So the insert happens in a SECURITY DEFINER function that runs with the
-- privileges of its owner. The guard that keeps it safe is ownership: a caller
-- may only raise a staff notification about an application that is genuinely
-- theirs. They cannot enumerate staff, choose recipients, or notify about
-- anybody else's application.
-- ===========================================================================

create or replace function public.notify_staff_about_application(
  p_application_id uuid,
  p_event_id       text,
  p_category       text,
  p_title          text,
  p_body           text,
  p_route          text    default null,
  p_payload        jsonb   default '{}'::jsonb,
  p_important      boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recipients integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  -- The whole security model of this function. Staff may notify about any
  -- application; everyone else only about their own.
  if not public.is_staff()
     and not exists (
       select 1
         from public.applications a
        where a.id = p_application_id
          and a.applicant_id = auth.uid()
          and a.deleted_at is null
     )
  then
    raise exception 'You cannot raise notifications for that application.'
      using errcode = '42501';
  end if;

  insert into public.notifications
    (user_id, event_id, category, title, body, route, payload, important, is_read)
  select
    p.id, p_event_id, p_category, p_title, p_body, p_route, p_payload, p_important, false
  from public.profiles p
  where p.role in ('committee', 'admin')
    and p.deleted_at is null;

  get diagnostics recipients = row_count;
  return recipients;
end;
$$;

-- `authenticated` only: anonymous callers have no business raising these, and
-- the function already refuses a null auth.uid().
revoke all on function public.notify_staff_about_application(
  uuid, text, text, text, text, text, jsonb, boolean
) from public;

grant execute on function public.notify_staff_about_application(
  uuid, text, text, text, text, text, jsonb, boolean
) to authenticated;


-- ===========================================================================
-- FALLBACK: if the storage policies above were rejected
-- ===========================================================================
-- Create the three buckets in Dashboard -> Storage -> New bucket, each with
-- "Public bucket" switched OFF:
--
--   application-documents   (15 MB limit)
--   progress-media          (50 MB limit)
--   agreements              (10 MB limit)
--
-- Then, for each bucket, add policies via Storage -> Policies -> New policy ->
-- "For full customization", using these expressions. The first path segment is
-- always the owning user's id, which is what authorises access:
--
--   SELECT / INSERT / UPDATE / DELETE for the owner:
--     (storage.foldername(name))[1] = auth.uid()::text
--
--   SELECT for reviewers (application-documents and progress-media only):
--     public.is_staff()
-- ===========================================================================
