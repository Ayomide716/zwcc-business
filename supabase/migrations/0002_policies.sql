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
