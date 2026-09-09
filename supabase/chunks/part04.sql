-- ZWCC setup: part 4 of 7
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
