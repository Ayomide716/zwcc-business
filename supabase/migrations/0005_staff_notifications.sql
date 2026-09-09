-- ===========================================================================
-- Notifying staff about an applicant's own event
-- ===========================================================================
-- The problem this solves:
--
-- When an applicant submits, the committee should be told there is new work.
-- But an applicant cannot do that directly, and should not be able to:
--   * `profiles` RLS lets them read only their own row, so they cannot even
--     discover who the reviewers are; and
--   * `notifications` RLS refuses an INSERT whose user_id is not their own.
--
-- Without this function the fan-out fails silently — the applicant's own
-- notification is written, the committee's is quietly dropped, and a new
-- submission never announces itself.
--
-- So the insert happens in a SECURITY DEFINER function that runs with the
-- privileges of its owner. The guard that keeps it safe is ownership: a caller
-- may only raise a staff notification about an application that is genuinely
-- theirs. They cannot enumerate staff, choose recipients, or notify about
-- anybody else's application.
-- ===========================================================================

create or replace function public.notify_staff_about_application(
  p_application_id uuid,
  p_event_id       text,
  p_category       text,
  p_title          text,
  p_body           text,
  p_route          text    default null,
  p_payload        jsonb   default '{}'::jsonb,
  p_important      boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recipients integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  -- The whole security model of this function. Staff may notify about any
  -- application; everyone else only about their own.
  if not public.is_staff()
     and not exists (
       select 1
         from public.applications a
        where a.id = p_application_id
          and a.applicant_id = auth.uid()
          and a.deleted_at is null
     )
  then
    raise exception 'You cannot raise notifications for that application.'
      using errcode = '42501';
  end if;

  insert into public.notifications
    (user_id, event_id, category, title, body, route, payload, important, is_read)
  select
    p.id, p_event_id, p_category, p_title, p_body, p_route, p_payload, p_important, false
  from public.profiles p
  where p.role in ('committee', 'admin')
    and p.deleted_at is null;

  get diagnostics recipients = row_count;
  return recipients;
end;
$$;

-- `authenticated` only: anonymous callers have no business raising these, and
-- the function already refuses a null auth.uid().
revoke all on function public.notify_staff_about_application(
  uuid, text, text, text, text, text, jsonb, boolean
) from public;

grant execute on function public.notify_staff_about_application(
  uuid, text, text, text, text, text, jsonb, boolean
) to authenticated;
