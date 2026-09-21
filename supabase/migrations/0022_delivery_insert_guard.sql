-- ---------------------------------------------------------------------------
-- 0022 — Let staff queue the emails they cause
--
-- The insert policy on notification_deliveries checks the notification exists
-- and belongs to the caller or to staff:
--
--   exists (select 1 from public.notifications n
--            where n.id = notification_id
--              and (n.user_id = auth.uid() or public.is_staff()))
--
-- That subquery runs under the caller's own row-level security, and there is
-- no staff SELECT policy on notifications — only own, plus admin via FOR ALL.
-- So a committee member can raise a notification for an applicant and then
-- cannot read it back, the EXISTS finds nothing, and the delivery row is
-- refused. No email is queued, and the app logs a warning and carries on.
--
-- Same family as migration 16, where the staff notification itself failed on
-- its RETURNING clause. That fixed the notification; this fixes the delivery
-- row behind it.
--
-- The fix is a SECURITY DEFINER predicate rather than a new staff SELECT
-- policy on notifications. A read policy would hand every committee member
-- every applicant's full notification history to browse, which is more access
-- than the problem needs. This answers one yes/no question about one row.
-- ---------------------------------------------------------------------------

create or replace function public.can_deliver_notification(p_notification_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.notifications n
     where n.id = p_notification_id
       and (n.user_id = auth.uid() or public.is_staff())
  );
$$;

comment on function public.can_deliver_notification is
  'May the caller queue a delivery for this notification? Runs past RLS so a '
  'staff member can queue for an applicant without being able to read their '
  'notifications.';

revoke all on function public.can_deliver_notification(uuid) from public;
grant execute on function public.can_deliver_notification(uuid) to authenticated;

drop policy if exists deliveries_insert on public.notification_deliveries;
create policy deliveries_insert on public.notification_deliveries
  for insert to authenticated
  with check (public.can_deliver_notification(notification_id));

-- ---------------------------------------------------------------------------
-- Backfill
-- ---------------------------------------------------------------------------
-- Every notification that should have queued an email and never did. These
-- send on the next drain, so expect a small burst of late messages.

insert into public.notification_deliveries (notification_id, channel, status, provider)
select n.id, 'email', 'pending', 'resend'
  from public.notifications n
  left join public.notification_deliveries d
    on d.notification_id = n.id and d.channel = 'email'
 where d.id is null
   and n.event_id in (
     'account_registered','application_submitted','document_rejected',
     'changes_requested','application_approved','application_rejected',
     'agreement_available','agreement_signed','disbursement_authorised',
     'monitoring_started','grant_completed');

-- ---------------------------------------------------------------------------
-- One row, one column, so the result can be copied in a single tap.
-- ---------------------------------------------------------------------------

select concat_ws(e'\n',
  'policy rewritten: ' || (
    select count(*)::text from pg_policies
     where tablename = 'notification_deliveries' and policyname = 'deliveries_insert'),
  'guard function: ' || (
    select count(*)::text from pg_proc where proname = 'can_deliver_notification'),
  'email rows now queued: ' || (
    select count(*)::text from public.notification_deliveries
     where channel = 'email' and status = 'pending'),
  'email rows already sent: ' || (
    select count(*)::text from public.notification_deliveries
     where channel = 'email' and status = 'sent'),
  'email rows failed: ' || (
    select count(*)::text from public.notification_deliveries
     where channel = 'email' and status = 'failed'),
  'still missing a delivery row: ' || (
    select count(*)::text
      from public.notifications n
      left join public.notification_deliveries d
        on d.notification_id = n.id and d.channel = 'email'
     where d.id is null
       and n.event_id in (
         'account_registered','application_submitted','document_rejected',
         'changes_requested','application_approved','application_rejected',
         'agreement_available','agreement_signed','disbursement_authorised',
         'monitoring_started','grant_completed')),
  'drain job active: ' || coalesce((
    select active::text from cron.job where jobname = 'drain-email-queue'), 'NOT SCHEDULED')
) as result;
