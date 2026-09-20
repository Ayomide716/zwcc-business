-- ---------------------------------------------------------------------------
-- 0021 — Drain the email queue without a superuser setting
--
-- Migration 10 left a cron snippet that authenticates with
--   current_setting('app.service_role_key')
-- which cannot work on a hosted project: setting a database-wide parameter
-- needs superuser, the `postgres` role no longer has it, and the attempt fails
-- with "permission denied to set parameter". That is the same wall migration 19
-- hit for push, and the fix is the same — read the credentials from a table.
--
-- So the queue has been filling up with pending rows and nothing has been
-- draining them. Every application decision that should have gone out by email
-- is still sitting there, which is recoverable: once this is scheduled the
-- backlog sends on the next tick.
--
-- Auth email (password reset, signup confirmation) is a completely separate
-- path handled by Supabase's own SMTP settings and is unaffected by any of it.
-- ---------------------------------------------------------------------------

-- Where send-email lives. Nullable: when it is not set the URL is derived from
-- the push one, so a project that has configured push needs no second row.
alter table public.push_config
  add column if not exists email_function_url text;

comment on column public.push_config.email_function_url is
  'Where the send-email function lives. Null derives it from function_url.';

-- ---------------------------------------------------------------------------

create or replace function public.drain_email_queue()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  target_url  text;
  service_key text;
  queued      integer;
begin
  select coalesce(
           p.email_function_url,
           regexp_replace(p.function_url, '/send-push/?$', '/send-email')
         ),
         p.service_role_key
    into target_url, service_key
    from public.push_config p
   limit 1;

  if target_url is null or service_key is null then
    -- Unconfigured projects stay quiet rather than erroring once a minute.
    return;
  end if;

  -- Nothing to do is the normal case. Skipping the request then keeps this
  -- from writing a row to net._http_response every single minute, which would
  -- bury anything worth reading.
  select count(*) into queued
    from public.notification_deliveries
   where channel = 'email'
     and status  = 'pending'
     and attempts < 3;

  if queued = 0 then
    return;
  end if;

  perform net.http_post(
    url     := target_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body    := '{}'::jsonb
  );
exception
  when others then
    -- A failed drain must never take down whatever else runs on this schedule.
    raise warning 'Email queue drain failed: %', sqlerrm;
end;
$$;

comment on function public.drain_email_queue is
  'Asks the send-email function to drain the queue. Scheduled by pg_cron.';

revoke all on function public.drain_email_queue() from anon, authenticated;

-- ===========================================================================
-- Run this once, AFTER deploying the send-email function, to start delivery.
-- ===========================================================================
--   select cron.schedule('drain-email-queue', '* * * * *',
--                        $$ select public.drain_email_queue(); $$);
--
-- To see it:     select jobname, schedule, active from cron.job;
-- To run it now: select public.drain_email_queue();
-- To stop it:    select cron.unschedule('drain-email-queue');
--
-- How many are waiting:
--   select status, count(*) from public.notification_deliveries
--    where channel = 'email' group by status;
-- ===========================================================================
