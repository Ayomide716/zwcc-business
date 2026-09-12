-- ---------------------------------------------------------------------------
-- 0017 — Documents can only be verified while verification is the work
--
-- A committee member could reject a document on an application that had already
-- been approved, signed for and paid out. The guard on document verification
-- checked who was acting and never where the application had got to, so the
-- verify and reject buttons kept working for the life of the record — leaving a
-- funded grant with a rejected identity document attached to it and no
-- explanation of how that happened.
--
-- Checking evidence belongs to the verification stage. A reviewer who finds a
-- problem after that should return the application for corrections or decline
-- it, which are decisions with a reason and an audit trail, rather than quietly
-- changing a verdict on a file the decision was already made against.
--
-- Which statuses count is configuration, not a rule buried in a trigger: it is
-- seeded from `documentsReviewable` in src/config/workflow.config.ts alongside
-- the flags that were already mirrored here.
-- ---------------------------------------------------------------------------

alter table public.workflow_statuses
  add column if not exists is_documents_reviewable boolean not null default false;

comment on column public.workflow_statuses.is_documents_reviewable is
  'Whether staff may verify or reject documents while an application is in this status. Mirrors documentsReviewable in src/config/workflow.config.ts.';

update public.workflow_statuses
   set is_documents_reviewable = (id in ('submitted', 'verification', 'changes_requested'));

-- ---------------------------------------------------------------------------

create or replace function public.guard_document_verification()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  app_status text;
begin
  if new.status is not distinct from old.status
     or new.status not in ('verified', 'rejected', 'under_review') then
    return new;
  end if;

  if not public.is_staff() then
    raise exception 'Only a reviewer can verify or reject a document.'
      using errcode = '42501';
  end if;

  select a.status into app_status
    from public.applications a
   where a.id = new.application_id;

  if not coalesce(
    (select is_documents_reviewable from public.workflow_statuses where id = app_status),
    false
  ) then
    raise exception
      'Documents can no longer be verified on this application — it is %.', app_status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists documents_guard_verification on public.documents;
create trigger documents_guard_verification
  before update on public.documents
  for each row execute function public.guard_document_verification();
