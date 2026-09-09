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
