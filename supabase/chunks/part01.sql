-- ZWCC setup: part 1 of 7
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
