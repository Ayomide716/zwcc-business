-- ---------------------------------------------------------------------------
-- 0025 — Deleting an account after a grant keeps an anonymous record of it
--
-- The church's decision (option B). Replaces the rule from 0024 that refused
-- deletion to anyone who had ever signed a grant agreement.
--
--   before an agreement is signed   delete freely, everything goes
--   while a grant is running        refused — the agreement is live and the
--                                   monthly reports are still owed, so one tap
--                                   must not erase one side of it
--   after the grant is completed    delete freely; the person's identity,
--                                   documents and reports go, and an anonymous
--                                   record of the grant stays
--
-- So the person gets their erasure, the church keeps a record for every grant
-- it made, and nobody has to process an email to get there.
--
-- ⚠️ Anonymising is permanent. If the church's lawyer later says names must be
-- kept for a number of years, that can be added for future deletions, but a
-- record already anonymised cannot get its name back.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. The anonymous record
-- ===========================================================================
--
-- What is kept is what the church needs to account for a grant, and nothing
-- that says who received it: no name, phone, email, business name, address,
-- documents, report contents or free-text notes (a reviewer's note is exactly
-- where a name would appear).
--
-- The registration code IS kept. It is a random reference that means nothing
-- on its own, and it is how the church matches this record to its own bank
-- transfer, which lives outside the app.
--
-- The amount is the amount REQUESTED. The app has never recorded an awarded or
-- disbursed amount, because payment happens outside it.

create table if not exists public.grant_records (
  id                          uuid primary key default gen_random_uuid(),
  -- The deleted application's id. Identifies nobody once the row is gone, and
  -- makes archiving safe to repeat.
  source_application_id       uuid not null unique,
  registration_code           text,
  program_id                  uuid references public.grant_programs(id) on delete set null,
  business_sector             text,
  requested_amount            numeric(14, 2),
  submitted_at                timestamptz,
  approved_at                 timestamptz,
  agreement_signed_at         timestamptz,
  disbursement_authorised_at  timestamptz,
  monitoring_started_at       timestamptz,
  monitoring_ends_at          timestamptz,
  completed_at                timestamptz,
  reports_submitted           integer not null default 0,
  outcome_verdict             text,
  outcome_scores              jsonb not null default '{}'::jsonb,
  archived_at                 timestamptz not null default now()
);

comment on table public.grant_records is
  'Anonymous record of a completed grant whose recipient deleted their account. '
  'Contains nothing that identifies the person. See migration 0025.';

alter table public.grant_records enable row level security;

-- Staff can read them. Nobody writes to them through the API: rows only arrive
-- through archive_completed_grants() below, run by the delete-account function.
drop policy if exists grant_records_staff_read on public.grant_records;
create policy grant_records_staff_read on public.grant_records
  for select to authenticated using (public.is_staff());


-- ===========================================================================
-- 2. Archiving, before the account goes
-- ===========================================================================
--
-- Called by the delete-account function with the service role, before it
-- removes anything. If this fails, nothing is deleted.
--
-- Deliberately not a trigger on applications. When an account is deleted,
-- Postgres removes its applications, beneficiaries and reports in no
-- guaranteed order, so a trigger could find the reports already gone and
-- record zero. Reading everything first, while it all still exists, is the
-- only way to get the numbers right.

create or replace function public.archive_completed_grants(p_user uuid)
returns integer
language sql
security definer
set search_path = public, pg_temp
as $$
  with archived as (
    insert into public.grant_records (
      source_application_id, registration_code, program_id, business_sector,
      requested_amount, submitted_at, approved_at, agreement_signed_at,
      disbursement_authorised_at, monitoring_started_at, monitoring_ends_at,
      completed_at, reports_submitted, outcome_verdict, outcome_scores
    )
    select
      a.id,
      a.registration_code,
      a.program_id,
      a.business_sector,
      a.requested_amount,
      a.submitted_at,
      (select min(h.created_at) from public.application_status_history h
        where h.application_id = a.id and h.to_status = 'approved'),
      (select ag.signed_at from public.agreements ag where ag.application_id = a.id),
      (select min(h.created_at) from public.application_status_history h
        where h.application_id = a.id and h.to_status = 'disbursement_authorised'),
      b.monitoring_started_at,
      b.monitoring_ends_at,
      (select min(h.created_at) from public.application_status_history h
        where h.application_id = a.id and h.to_status = 'completed'),
      (select count(*) from public.progress_reports r where r.application_id = a.id),
      b.outcome_verdict,
      coalesce(b.outcome_scores, '{}'::jsonb)
    from public.applications a
    left join public.beneficiaries b on b.application_id = a.id
    where a.applicant_id = p_user
      and a.status = 'completed'
    on conflict (source_application_id) do nothing
    returning 1
  )
  select count(*)::integer from archived;
$$;

comment on function public.archive_completed_grants is
  'Copies the anonymous facts of a person''s completed grants into '
  'grant_records. Service role only; run before their account is deleted.';

revoke all on function public.archive_completed_grants(uuid) from public;
revoke all on function public.archive_completed_grants(uuid) from anon, authenticated;
grant execute on function public.archive_completed_grants(uuid) to service_role;


-- ===========================================================================
-- 3. The rule: only a grant still running blocks deletion
-- ===========================================================================

create or replace function public.account_deletion_blocker()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when auth.uid() is null then 'not_signed_in'
    when public.app_role() in ('committee', 'admin') then 'staff'
    when exists (
      select 1 from public.applications a
       where a.applicant_id = auth.uid()
         and a.deleted_at is null
         and a.status in ('agreement_signed', 'disbursement_authorised', 'monitoring')
    ) then 'grant_in_progress'
    else null
  end;
$$;


-- ---------------------------------------------------------------------------
-- One row, one column, so the result can be copied in a single tap.
-- ---------------------------------------------------------------------------

select concat_ws(chr(10),
  'grant records table: ' || (
    select count(*)::text from pg_tables where tablename = 'grant_records'),
  'archive function: ' || (
    select count(*)::text from pg_proc where proname = 'archive_completed_grants'),
  'deletion rule updated: ' || (
    select case when prosrc like '%grant_in_progress%' then '1' else '0' end
      from pg_proc where proname = 'account_deletion_blocker')
) as result;
