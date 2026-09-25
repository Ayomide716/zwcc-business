-- ---------------------------------------------------------------------------
-- 0024 — Account deletion rule, and an audit log that cannot be forged
--
-- Two unrelated fixes that ship together because both are one SQL paste.
-- ---------------------------------------------------------------------------


-- ===========================================================================
-- 1. Who may delete their own account
-- ===========================================================================
--
-- Deleting an account removes everything attached to it: every foreign key
-- from the person's rows cascades from auth.users through profiles. That is
-- what the right to erasure asks for, and what Apple requires of any app that
-- lets people create an account.
--
-- Two cases are refused, and both are about what would be destroyed:
--
--   staff       A committee member's reviews and scores cascade with their
--               account, which would silently remove the committee's record of
--               how applicants were judged. An administrator changes the role
--               back to applicant first; the deletion then proceeds normally.
--               It also stops the last administrator deleting themselves and
--               locking the church out of its own app.
--
--   grants      Once an agreement is signed, the application is the record of
--               church money committed and paid out. That record cannot vanish
--               because the recipient pressed a button. The person is told to
--               contact the church, which can decide on legal advice what must
--               be kept and for how long.
--
-- The rule lives in the database, not the app, so the delete function enforces
-- exactly what the app displays, and changing it is this one function — no
-- new APK, no update. The statuses are named here rather than derived: the
-- line between "an application" and "a grant" is a policy decision, and it
-- should be read in one place.
--
-- Takes no argument on purpose. It answers only for the person asking, so it
-- cannot be used to learn where someone else's application stands.

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
         and a.status in (
           'agreement_signed',
           'disbursement_authorised',
           'monitoring',
           'completed'
         )
    ) then 'grant_on_record'
    else null
  end;
$$;

comment on function public.account_deletion_blocker is
  'Why the caller may not delete their own account, or null if they may. '
  'Checked by the delete-account function and shown by the app.';

revoke all on function public.account_deletion_blocker() from public;
grant execute on function public.account_deletion_blocker() to authenticated;


-- ===========================================================================
-- 2. The audit log records who actually acted
-- ===========================================================================
--
-- The insert policy allowed actor_id to be null, and took actor_role and
-- created_at from whatever the client sent. So any signed-in person could
-- write an entry with no name on it, claim to be an administrator, or date it
-- last month. An audit log anyone can write fiction into is worse than none,
-- because people trust it.
--
-- The fix is not to refuse rows that look wrong — the app would then quietly
-- lose genuine entries whenever its cached role was stale. Instead the
-- database overwrites the three facts it can know better than the client:
-- who you are, what your role is right now, and what time it is. What
-- happened (action, entity, metadata) still comes from the app, which is the
-- only thing that knows.
--
-- Server-side writers — SECURITY DEFINER functions, the service role, the SQL
-- editor — have no session user, so they are left alone. They are already
-- trusted, and some of them legitimately record actions with no person behind
-- them.

create or replace function public.stamp_audit_actor()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null then
    new.actor_id   := auth.uid();
    new.actor_role := public.app_role();
    new.created_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists audit_logs_stamp_actor on public.audit_logs;
create trigger audit_logs_stamp_actor
  before insert on public.audit_logs
  for each row execute function public.stamp_audit_actor();

-- Belt and braces: the policy now demands a named actor as well. The trigger
-- runs first and sets it, so a normal insert passes; this only matters if the
-- trigger is ever dropped.
drop policy if exists audit_insert on public.audit_logs;
create policy audit_insert on public.audit_logs
  for insert to authenticated
  with check (actor_id = auth.uid());


-- ---------------------------------------------------------------------------
-- One row, one column, so the result can be copied in a single tap.
-- ---------------------------------------------------------------------------

select concat_ws(chr(10),
  'deletion rule installed: ' || (
    select count(*)::text from pg_proc where proname = 'account_deletion_blocker'),
  'audit stamp trigger: ' || (
    select count(*)::text from pg_trigger where tgname = 'audit_logs_stamp_actor'),
  'audit insert policy: ' || coalesce((
    select with_check from pg_policies
     where tablename = 'audit_logs' and policyname = 'audit_insert'), 'MISSING')
) as result;
