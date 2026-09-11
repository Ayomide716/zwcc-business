-- ---------------------------------------------------------------------------
-- 0012 — Separation of duties
--
-- Staff privileges were granted by role alone, so a committee member or admin
-- who is also an applicant could act on their own application: begin its
-- verification, verify its documents, score it, approve it, issue its
-- agreement and sign off its monitoring reports. Role-based RLS cannot fix
-- this on its own, because policies are permissive and OR together — the
-- staff policy simply grants what the applicant policy does not.
--
-- The rule enforced here is one sentence: on your own record you have only the
-- powers of an applicant, whatever your role. It is applied by triggers, which
-- can see both the old and the new row and so can tell an applicant's own edit
-- apart from a staff action on the same row.
--
-- This is deliberately not configurable. Every other rule in this system is
-- meant to be changed by the client without a rebuild; this one is the
-- integrity floor under a process that decides who receives money, and a
-- switch to turn it off would be a liability rather than a feature.
-- ---------------------------------------------------------------------------

-- Statuses an applicant is allowed to put their own application into. Anything
-- else is a staff action, and a staff action on your own file is forbidden.
create or replace function public.status_is_applicant_settable(status_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_applicant_editable from public.workflow_statuses where id = status_id),
    false
  ) or status_id in ('submitted', 'withdrawn');
$$;

-- ---------------------------------------------------------------------------
-- applications
-- ---------------------------------------------------------------------------

create or replace function public.forbid_self_application_action()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for the service role and for SQL run in the dashboard,
  -- where a human is already trusted and no session user exists to compare.
  if auth.uid() is null or new.applicant_id <> auth.uid() then
    return new;
  end if;

  if new.status is distinct from old.status
     and not public.status_is_applicant_settable(new.status) then
    raise exception
      'You cannot move your own application to %. Another committee member must handle it.',
      new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists applications_forbid_self_action on public.applications;
create trigger applications_forbid_self_action
  before update on public.applications
  for each row execute function public.forbid_self_application_action();

-- ---------------------------------------------------------------------------
-- documents — verification of your own evidence
-- ---------------------------------------------------------------------------

create or replace function public.forbid_self_document_verification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or new.applicant_id <> auth.uid() then
    return new;
  end if;

  if new.status is distinct from old.status and new.status <> 'uploaded' then
    raise exception
      'You cannot verify or reject your own documents.'
      using errcode = 'check_violation';
  end if;

  if new.verified_by is not null and new.verified_by = auth.uid() then
    raise exception
      'You cannot record yourself as the verifier of your own document.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists documents_forbid_self_verification on public.documents;
create trigger documents_forbid_self_verification
  before update on public.documents
  for each row execute function public.forbid_self_document_verification();

-- ---------------------------------------------------------------------------
-- application_reviews — scoring and recommending on your own application
-- ---------------------------------------------------------------------------

create or replace function public.forbid_self_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  if auth.uid() is null then
    return new;
  end if;

  select applicant_id into owner
    from public.applications where id = new.application_id;

  if owner = auth.uid() or new.reviewer_id = owner then
    raise exception
      'A review cannot be recorded by the applicant on their own application.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists reviews_forbid_self on public.application_reviews;
create trigger reviews_forbid_self
  before insert or update on public.application_reviews
  for each row execute function public.forbid_self_review();

-- ---------------------------------------------------------------------------
-- agreements — issuing your own grant agreement
-- ---------------------------------------------------------------------------

create or replace function public.forbid_self_agreement_issue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  -- Signing your own agreement is the point of it; issuing it to yourself is
  -- not. Only the issuing side is blocked.
  if new.applicant_id = auth.uid()
     and (tg_op = 'INSERT' or new.issued_by is distinct from old.issued_by) then
    raise exception
      'You cannot issue your own grant agreement.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists agreements_forbid_self_issue on public.agreements;
create trigger agreements_forbid_self_issue
  before insert or update on public.agreements
  for each row execute function public.forbid_self_agreement_issue();

-- ---------------------------------------------------------------------------
-- progress_reports — reviewing your own monitoring reports
-- ---------------------------------------------------------------------------

create or replace function public.forbid_self_report_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or new.applicant_id <> auth.uid() then
    return new;
  end if;

  if new.status is distinct from old.status and new.status <> 'submitted' then
    raise exception
      'You cannot review your own progress report.'
      using errcode = 'check_violation';
  end if;

  if new.reviewed_by is not null and new.reviewed_by = auth.uid() then
    raise exception
      'You cannot record yourself as the reviewer of your own report.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists reports_forbid_self_review on public.progress_reports;
create trigger reports_forbid_self_review
  before update on public.progress_reports
  for each row execute function public.forbid_self_report_review();
