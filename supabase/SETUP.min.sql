-- 2026 ZWCC Business Grant - complete database setup (compact).
-- Paste into the Supabase SQL Editor and Run. Safe to re-run.
-- After running, register in the app then promote yourself:
--   update public.profiles set role = 'admin' where email = 'you@example.com';
-- The fully commented version is supabase/SETUP.sql in the repo.
create extension if not exists "pgcrypto";
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
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
create table if not exists public.workflow_statuses (
  id                    text primary key,
  label                 text not null,
  phase                 text not null,
  tone                  text not null default 'neutral',
  sort_order            integer not null default 0,
  is_terminal           boolean not null default false,
  is_active             boolean not null default true,
  is_applicant_editable boolean not null default false,
  is_documents_editable boolean not null default false,
  occupies_slot         boolean not null default true,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now()
);
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
  applicant_name          text,
  applicant_phone         text,
  business_name           text,
  business_sector         text,
  requested_amount        numeric(14, 2) check (requested_amount is null or requested_amount > 0),
  submitted_at            timestamptz,
  decided_at              timestamptz,
  decision_reason_code    text,
  decision_reason_note    text,
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
create index if not exists applications_search_idx on public.applications
  using gin (to_tsvector('simple',
    coalesce(applicant_name, '') || ' ' ||
    coalesce(business_name, '') || ' ' ||
    coalesce(registration_code, '')));
drop trigger if exists applications_set_updated_at on public.applications;
create trigger applications_set_updated_at
  before update on public.applications
  for each row execute function public.set_updated_at();
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
  version               integer not null default 1,
  deleted_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index if not exists documents_one_live_per_type
  on public.documents (application_id, document_type_id) where deleted_at is null;
create index if not exists documents_application_idx on public.documents (application_id);
create index if not exists documents_status_idx on public.documents (status) where deleted_at is null;
drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();
create table if not exists public.application_reviews (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  reviewer_id    uuid not null references public.profiles(id) on delete cascade,
  stage          text not null default 'committee_review',
  decision       text check (decision in ('approve', 'reject', 'request_changes', 'note')),
  notes          text,
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
create table if not exists public.agreements (
  id                uuid primary key default gen_random_uuid(),
  application_id    uuid not null unique references public.applications(id) on delete cascade,
  applicant_id      uuid not null references public.profiles(id) on delete cascade,
  template_version  text not null,
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
create table if not exists public.beneficiaries (
  id                    uuid primary key default gen_random_uuid(),
  application_id        uuid not null unique references public.applications(id) on delete cascade,
  applicant_id          uuid not null references public.profiles(id) on delete cascade,
  business_id           uuid references public.businesses(id) on delete set null,
  monitoring_started_at timestamptz not null default now(),
  monitoring_ends_at    timestamptz not null,
  status                text not null default 'active'
                          check (status in ('active', 'completed', 'paused')),
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
create table if not exists public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);
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
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid());
drop policy if exists profiles_select_staff on public.profiles;
create policy profiles_select_staff on public.profiles
  for select using (public.is_staff());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
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
    and status in (
      select id from public.workflow_statuses where is_applicant_editable
    )
  );
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
drop policy if exists history_select on public.application_status_history;
create policy history_select on public.application_status_history
  for select using (
    public.is_staff() or public.owns_application(application_id)
  );
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
drop policy if exists documents_select_own on public.documents;
create policy documents_select_own on public.documents
  for select using (applicant_id = auth.uid());
drop policy if exists documents_select_staff on public.documents;
create policy documents_select_staff on public.documents
  for select using (public.is_staff());
drop policy if exists documents_insert_own on public.documents;
create policy documents_insert_own on public.documents
  for insert with check (
    applicant_id = auth.uid()
    and public.owns_application(application_id)
    and public.application_documents_editable(application_id)
    and status = 'uploaded'
  );
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
drop policy if exists agreements_select on public.agreements;
create policy agreements_select on public.agreements
  for select using (applicant_id = auth.uid() or public.is_staff());
drop policy if exists agreements_insert_staff on public.agreements;
create policy agreements_insert_staff on public.agreements
  for insert with check (public.is_staff());
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
drop policy if exists beneficiaries_select on public.beneficiaries;
create policy beneficiaries_select on public.beneficiaries
  for select using (applicant_id = auth.uid() or public.is_staff());
drop policy if exists beneficiaries_staff on public.beneficiaries;
create policy beneficiaries_staff on public.beneficiaries
  for all using (public.is_staff()) with check (public.is_staff());
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
drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select using (user_id = auth.uid());
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
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
drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs
  for insert to authenticated with check (actor_id = auth.uid() or actor_id is null);
drop policy if exists audit_select_staff on public.audit_logs;
create policy audit_select_staff on public.audit_logs
  for select using (public.is_staff());
drop policy if exists settings_read on public.app_settings;
create policy settings_read on public.app_settings
  for select to authenticated using (true);
drop policy if exists settings_admin on public.app_settings;
create policy settings_admin on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());
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
insert into public.workflow_statuses
  (id, label, phase, tone, sort_order, is_terminal, is_applicant_editable, is_documents_editable, occupies_slot)
values
  ('draft',                   'Draft',                   'preparation',  'neutral',  10, false, true,  true,  true),
  ('submitted',               'Submitted',               'verification', 'info',     20, false, false, false, true),
  ('verification',            'Under verification',      'verification', 'progress', 30, false, false, false, true),
  ('committee_review',        'Committee review',        'decision',     'progress', 40, false, false, false, true),
  ('changes_requested',       'Corrections requested',   'verification', 'warning',  35, false, true,  true,  true),
  ('approved',                'Approved',                'decision',     'success',  50, false, false, false, true),
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
insert into public.grant_programs (slug, name, year, summary, is_active, config)
values (
  'zwcc-business-grant-2026',
  '2026 ZWCC Business Grant',
  2026,
  'The 2026 ZWCC Business Grant provides funding to help people start and grow sustainable businesses. Grants are awarded on the strength of the business proposal.',
  true,
  jsonb_build_object(
    'currency', 'NGN',
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
revoke all on function public.notify_staff_about_application(
  uuid, text, text, text, text, text, jsonb, boolean
) from public;
grant execute on function public.notify_staff_about_application(
  uuid, text, text, text, text, text, jsonb, boolean
) to authenticated;
