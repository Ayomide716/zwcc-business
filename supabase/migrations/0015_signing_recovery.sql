-- ---------------------------------------------------------------------------
-- 0015 — Signing recovers instead of refusing
--
-- Before migration 14, signing wrote the signature and then tried, separately,
-- to move the application — and that second write was refused. Anyone who
-- signed in that window is left with a signed agreement attached to an
-- application still marked 'agreement_pending': the home screen asks them to
-- sign, the agreement screen says they already did, and there is no way out of
-- the loop from inside the app.
--
-- Refusing a second attempt with "already signed" is the wrong answer to that.
-- The honest reading of a repeat call is "this person is trying to finish
-- signing", and the finishing is exactly what did not happen. So an agreement
-- that is already signed now reconciles the application and reports success,
-- which repairs those rows the next time anyone opens the screen.
--
-- It also makes the call idempotent, which is worth having on its own: a phone
-- that sends the request, loses the connection before the reply, and retries
-- should not be told it has done something wrong.
-- ---------------------------------------------------------------------------

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

  -- Locked, so two taps on a slow connection cannot both pass the checks below.
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

  /*
    Already signed. Finish the half that did not happen, if it did not happen,
    and report success either way.

    Checked before the signature is validated, because a repeat call is someone
    trying to get unstuck rather than trying to sign again — asking them to
    retype a name they already gave would be asking them to re-sign something
    that is already signed.
  */
  if agreement.status = 'signed' then
    if exists (
      select 1 from public.applicant_transitions
       where from_status = app.status and to_status = 'agreement_signed'
    ) then
      update public.applications
         set status = 'agreement_signed'
       where id = app.id;
    end if;

    return agreement;
  end if;

  if agreement.status <> 'issued' then
    raise exception 'This agreement is no longer valid to sign.'
      using errcode = 'check_violation';
  end if;

  if coalesce(btrim(p_signature), '') = '' then
    raise exception 'A signature is required.' using errcode = 'check_violation';
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

-- ---------------------------------------------------------------------------
-- Repair the rows already stuck
-- ---------------------------------------------------------------------------
-- Anyone who signed before migration 14 is waiting on this. Doing it here means
-- they are unstuck the moment this runs rather than the next time they happen
-- to open the agreement screen.

update public.applications a
   set status = 'agreement_signed'
  from public.agreements g
 where g.application_id = a.id
   and g.status = 'signed'
   and a.deleted_at is null
   and exists (
     select 1 from public.applicant_transitions
      where from_status = a.status and to_status = 'agreement_signed'
   );
