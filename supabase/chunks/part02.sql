-- ZWCC setup: part 2 of 7
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
