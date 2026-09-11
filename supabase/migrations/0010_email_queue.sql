-- ===========================================================================
-- 0010 — Email delivery queue
-- ===========================================================================
-- `notification_deliveries` already recorded that an email was wanted, but had
-- nowhere to record how many times sending had been tried. Without that, a
-- single undeliverable address is retried forever and sits at the head of the
-- queue delaying everything behind it.
--
-- Adds the counter, and an index for the one query the sender runs.
--
-- Idempotent, like every migration in this folder.
-- ===========================================================================

alter table public.notification_deliveries
  add column if not exists attempts integer not null default 0;

-- The sender reads exactly this shape: oldest pending rows on one channel that
-- have not exhausted their attempts.
create index if not exists notification_deliveries_queue_idx
  on public.notification_deliveries (channel, status, created_at)
  where status = 'pending';

comment on column public.notification_deliveries.attempts is
  'Send attempts so far. The sender stops at 3 and marks the row failed.';

-- The index this replaces. It indexed `status` under a predicate that already
-- pins `status` to 'pending', so every entry held the same value and it could
-- not narrow anything — write cost with no read benefit. Confirmed against
-- PostgreSQL 16 that the planner picks the new one for the sender's query.
drop index if exists public.deliveries_pending_idx;

-- ---------------------------------------------------------------------------
-- Scheduling
-- ---------------------------------------------------------------------------
-- Email is not urgent to the minute, and batching is far cheaper than one
-- request per notification. A queue drained on a timer also survives the
-- provider being briefly unreachable, which a fire-and-forget trigger does not.
--
-- Requires pg_cron (Database -> Extensions) and the same two settings that
-- migration 0009 uses for push.

create extension if not exists pg_cron;

-- ===========================================================================
-- Run this once, after deploying the function, to start draining the queue.
-- ===========================================================================
-- It reads app.service_role_key, set in migration 0009. Replace the project
-- ref if you have not already set app.push_function_url.
--
--   select cron.schedule(
--     'drain-email-queue',
--     '* * * * *',
--     $$
--       select net.http_post(
--         url     := 'https://<your-project-ref>.supabase.co/functions/v1/send-email',
--         headers := jsonb_build_object(
--           'Content-Type', 'application/json',
--           'Authorization', 'Bearer ' || current_setting('app.service_role_key', true)
--         ),
--         body    := '{}'::jsonb
--       );
--     $$
--   );
--
-- To see it: select * from cron.job;
-- To stop it: select cron.unschedule('drain-email-queue');
--
-- Every minute is deliberate. The function does nothing when the queue is
-- empty, which is almost always, and a minute is short enough that a decision
-- email feels immediate.
-- ===========================================================================
