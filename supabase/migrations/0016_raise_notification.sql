-- ---------------------------------------------------------------------------
-- 0016 — Staff-raised notifications actually reach the applicant
--
-- An applicant saw "Application started" and "Application submitted" and then
-- nothing — no "we are checking your details", no "approved", no "your
-- agreement is ready" — while their application moved all the way to active
-- beneficiary.
--
-- The two that arrived are the two an applicant raises for themselves. Every
-- other one is raised by a committee member on the applicant's behalf, and the
-- app inserts with RETURNING so it can hand the new row to the delivery step.
-- PostgreSQL applies the SELECT policy to what RETURNING gives back, and the
-- select policy on notifications is `user_id = auth.uid()` — correct, since one
-- person must never read another's notifications. So the insert was refused for
-- the returned row and rolled back entirely: nothing written, and the error
-- swallowed by the logging in `notifications.raise()`.
--
-- Reproduced on PostgreSQL 16: the identical insert succeeds without RETURNING
-- and is refused with it.
--
-- Widening the select policy would be the wrong fix — it would let staff read
-- applicants' notifications to buy a RETURNING clause. Instead the insert moves
-- into a SECURITY DEFINER function that checks the caller first, the same
-- pattern migration 0005 already uses for notifying staff.
-- ---------------------------------------------------------------------------

create or replace function public.raise_notification(
  p_user_id   uuid,
  p_event_id  text,
  p_category  text,
  p_title     text,
  p_body      text,
  p_route     text,
  p_payload   jsonb,
  p_important boolean
)
returns public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  row_out public.notifications;
begin
  if caller is null then
    raise exception 'You must be signed in.' using errcode = 'insufficient_privilege';
  end if;

  -- The same rule the policy states, restated here because SECURITY DEFINER
  -- runs past the policy: you may notify yourself, and staff may notify anyone.
  if p_user_id <> caller and not public.is_staff() then
    raise exception 'You cannot send a notification to another person.'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.notifications
    (user_id, event_id, category, title, body, route, payload, important, is_read)
  values
    (p_user_id, p_event_id, p_category, p_title, p_body, p_route,
     coalesce(p_payload, '{}'::jsonb), coalesce(p_important, false), false)
  returning * into row_out;

  return row_out;
end;
$$;

revoke all on function public.raise_notification(uuid, text, text, text, text, text, jsonb, boolean) from public;
grant execute on function public.raise_notification(uuid, text, text, text, text, text, jsonb, boolean) to authenticated;
