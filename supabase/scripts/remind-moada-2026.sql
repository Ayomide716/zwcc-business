-- ===========================================================================
-- MOADA 2026 — final reminder
-- ===========================================================================
-- >>> RUN THIS ON 22 OR 23 NOVEMBER 2026. NOT BEFORE. <<<
--
-- Nothing runs this for you. There is no scheduler behind it: someone has to
-- open the Supabase SQL editor and paste it in. Four days out is the aim —
-- close enough to act on, far enough to move something around.
--
-- Deliberately NOT a migration. Migrations run against every fresh database,
-- and a database built in March should not announce a conference that
-- happened in November.
--
-- Marked important, unlike the September invitation. A reminder four days out
-- is time-sensitive in a way an invitation two months ahead is not, and one
-- that arrives quietly in the shade and gets buried has done nothing at all.
-- This is the last thing we send about the event, so it earns the interrupt.
--
-- Safe to run twice. The guard skips anyone who already has it, so a second
-- run reaches only people who signed up in between.
--
-- Reaches everyone registered at the time it runs, not just the 26 who were
-- there in September.
-- ===========================================================================

with recipients as (
  select p.id
    from public.profiles p
   where p.deleted_at is null
     and not exists (
       select 1 from public.notifications n
        where n.user_id  = p.id
          and n.event_id = 'announcement_moada_2026_reminder'
     )
),
created as (
  insert into public.notifications
    (user_id, event_id, category, title, body, route, payload, important, is_read)
  select
    r.id,
    'announcement_moada_2026_reminder',
    -- 'account' is one of the categories the notifications screen has an icon
    -- for. An unknown category renders without one.
    'account',
    'Signs and Wonders starts Thursday',
    $msg$MOADA 2026: Signs and Wonders begins this Thursday.

Thursday 26 Nov, 5:00 PM — Miracle Night
Friday 27 Nov, 5:00 PM — Wonder Night
Saturday 28 Nov, 12:00 noon — Fire Conference
Sunday 29 Nov, 8:00 AM — Anointing & the Miraculous

Zion World Christian Centre, Waterparks
31/37 Toyin Street, Ikeja, Lagos

We look forward to welcoming you.

For enquiries:
0701 276 5732 | 0701 215 1603 | 0907 862 9004

With love,
Zion World Christian Centre$msg$,
    -- No route. Every value here has to match a screen that exists, and a tap
    -- that goes nowhere is worse than a tap that does nothing.
    null,
    '{}'::jsonb,
    -- Routes the push to the high-importance channel, so it arrives as a
    -- banner over whatever is on screen. Set to false for a quiet delivery.
    true,
    false
  from recipients r
  returning id
),
queued as (
  insert into public.notification_deliveries (notification_id, channel, status, provider)
  select c.id, 'email', 'pending', 'resend' from created c
  returning id
)
-- The counts below add the CTE results to the pre-run totals on purpose. A
-- data-modifying CTE is invisible to the rest of the same statement, so
-- reading the tables directly here would report the state BEFORE the insert
-- and show zero reached immediately after reaching everyone.
select concat_ws(chr(10),
  'people reminded this run: ' || (select count(*)::text from created),
  'emails queued this run: '   || (select count(*)::text from queued),
  'still not reached: ' || (
     (select count(*) from public.profiles p
       where p.deleted_at is null
         and not exists (
           select 1 from public.notifications n
            where n.user_id = p.id
              and n.event_id = 'announcement_moada_2026_reminder'))
     - (select count(*) from created))::text
) as result;
