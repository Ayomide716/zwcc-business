-- ---------------------------------------------------------------------------
-- 0014 — Which status changes an applicant may make
--
-- Signing a grant agreement did not work. The applicant's own update policy
-- allowed them to write only an editable status plus 'submitted' and
-- 'withdrawn', and migration 0012's separation-of-duties trigger repeated that
-- same list. Neither knew that signing an agreement moves an application from
-- 'agreement_pending' to 'agreement_signed', which is an applicant's own act.
-- So the agreement row was marked signed and the application stayed behind it,
-- leaving a signed agreement attached to an unsigned application.
--
-- The list was hardcoded in two places, which is why it could be wrong in both.
-- It now comes from configuration, like every other workflow rule here: the
-- transitions an applicant may perform are seeded from
-- `src/config/workflow.config.ts` into a table the policy and the trigger both
-- read. Adding an applicant step to the workflow is then a re-seed rather than
-- a hunt for every place that hardcoded the old set.
-- ---------------------------------------------------------------------------

create table if not exists public.applicant_transitions (
  from_status text not null references public.workflow_statuses(id) on update cascade,
  to_status   text not null references public.workflow_statuses(id) on update cascade,
  primary key (from_status, to_status)
);

comment on table public.applicant_transitions is
  'Status changes an applicant may make on their own application. Seeded from TRANSITIONS in src/config/workflow.config.ts — every transition whose allowedRoles include ''applicant'', expanded to one row per from/to pair.';

alter table public.applicant_transitions enable row level security;

-- Granted explicitly rather than relying on the project's default privileges.
-- The update policy below reads this table in a subquery, as the signed-in
-- user, so a missing SELECT here would silently make signing fail again —
-- which is the exact bug this migration exists to fix.
grant select on public.applicant_transitions to anon, authenticated;
grant all    on public.applicant_transitions to service_role;

-- Readable by everyone signed in: it is workflow configuration, not data about
-- a person. Only an administrator may change it.
drop policy if exists applicant_transitions_read on public.applicant_transitions;
create policy applicant_transitions_read on public.applicant_transitions
  for select to authenticated using (true);

drop policy if exists applicant_transitions_admin on public.applicant_transitions;
create policy applicant_transitions_admin on public.applicant_transitions
  for all using (public.is_admin()) with check (public.is_admin());

-- Replaced wholesale on every seed, so removing a transition from the config
-- removes the permission rather than leaving it behind.
delete from public.applicant_transitions;

insert into public.applicant_transitions (from_status, to_status) values
  -- submit_application
  ('draft',             'submitted'),
  ('changes_requested', 'submitted'),
  -- sign_agreement
  ('agreement_pending', 'agreement_signed'),
  -- withdraw_application
  ('draft',             'withdrawn'),
  ('submitted',         'withdrawn'),
  ('verification',      'withdrawn'),
  ('committee_review',  'withdrawn'),
  ('changes_requested', 'withdrawn')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- The applicant's own update policy
-- ---------------------------------------------------------------------------
-- Two jobs, and they need different tests. Editing the form is allowed while
-- the status says the form is open. Performing a step is allowed when the
-- workflow says an applicant may take that step from where the application
-- currently sits — which is not the same thing, because an agreement waiting
-- for a signature is emphatically not an editable form.
--
-- WITH CHECK cannot see the old row, so it can only ask "is this a status an
-- applicant is ever allowed to write?". The exact from/to pairing is checked by
-- the trigger below, which can see both.

drop policy if exists applications_update_own on public.applications;
create policy applications_update_own on public.applications
  for update
  using (
    applicant_id = auth.uid()
    and (
      public.application_is_applicant_editable(id)
      or status in (select from_status from public.applicant_transitions)
    )
  )
  with check (
    applicant_id = auth.uid()
    and (
      status in (select id from public.workflow_statuses where is_applicant_editable)
      or status in (select to_status from public.applicant_transitions)
    )
  );

-- ---------------------------------------------------------------------------
-- Separation of duties, now reading the same table
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

  if new.status is not distinct from old.status then
    return new;
  end if;

  if not exists (
    select 1 from public.applicant_transitions
     where from_status = old.status and to_status = new.status
  ) then
    raise exception
      'You cannot move your own application from % to %. Another committee member must handle it.',
      old.status, new.status
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Superseded by the table above. Left dropped rather than lying around as a
-- second answer to the same question.
drop function if exists public.status_is_applicant_settable(text);

-- ---------------------------------------------------------------------------
-- Signing, as one transaction
-- ---------------------------------------------------------------------------
-- Signing is two writes: the signature onto the agreement, and the application
-- moving to 'agreement_signed'. Done as two round trips from the phone, a
-- dropped connection between them leaves a signature on record for a step the
-- system does not believe happened — and the applicant cannot undo it, because
-- their policy allows 'issued' to 'signed' and never the reverse.
--
-- One function, one transaction. Both writes land or neither does.
--
-- SECURITY DEFINER, so ownership is checked here rather than left to the
-- policies this deliberately runs past.

create or replace function public.sign_grant_agreement(
  p_application_id uuid,
  p_method         text,
  p_signature      text,
  p_signer_name    text
)
returns public.agreements
language plpgsql
security definer
set search_path = public
as $$
declare
  caller    uuid := auth.uid();
  app       public.applications;
  agreement public.agreements;
begin
  if caller is null then
    raise exception 'You must be signed in to sign an agreement.'
      using errcode = 'insufficient_privilege';
  end if;

  if coalesce(btrim(p_signature), '') = '' then
    raise exception 'A signature is required.' using errcode = 'check_violation';
  end if;

  -- Locked, so two taps on a slow connection cannot both pass the status check.
  select * into app from public.applications
   where id = p_application_id and deleted_at is null
   for update;

  if app.id is null then
    raise exception 'That application could not be found.' using errcode = 'no_data_found';
  end if;

  if app.applicant_id <> caller then
    raise exception 'You can only sign your own agreement.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into agreement from public.agreements
   where application_id = p_application_id
   for update;

  if agreement.id is null then
    raise exception 'No agreement has been issued for this application yet.'
      using errcode = 'no_data_found';
  end if;

  if agreement.status <> 'issued' then
    raise exception 'This agreement has already been signed.'
      using errcode = 'unique_violation';
  end if;

  -- The same table the policy and the trigger read, so signing cannot become
  -- legal here while remaining illegal there.
  if not exists (
    select 1 from public.applicant_transitions
     where from_status = app.status and to_status = 'agreement_signed'
  ) then
    raise exception 'This application is not waiting for a signature.'
      using errcode = 'check_violation';
  end if;

  update public.agreements
     set status           = 'signed',
         signed_at        = now(),
         signature_method = p_method,
         signature_data   = btrim(p_signature),
         signer_name      = btrim(p_signer_name)
   where id = agreement.id
   returning * into agreement;

  update public.applications
     set status = 'agreement_signed'
   where id = app.id;

  return agreement;
end;
$$;

revoke all on function public.sign_grant_agreement(uuid, text, text, text) from public;
grant execute on function public.sign_grant_agreement(uuid, text, text, text) to authenticated;
