-- ===========================================================================
-- Announcement: Signs and Wonders, MOADA '26
-- ===========================================================================
-- A one-off broadcast, deliberately NOT a migration. Migrations run on every
-- fresh database, and a fresh database in March should not send an invitation
-- to a conference that happened in November.
--
-- One insert reaches three channels, because they all hang off the same row:
--
--   in-app   the notifications screen reads title, body and category straight
--            from this table, so nothing in the app needs to change
--   push     a trigger on insert calls the send-push function
--   email    the delivery row below is picked up by the queue drain within
--            a minute
--
-- Safe to run twice. The guard skips anyone who already has this event, so a
-- second run reaches only people who signed up in between — which is how you
-- catch late joiners: just run it again.
--
-- Deliberately silent about the ₦25M on the flyer. The church has not
-- confirmed whether that is the 2026 grant fund, and the app has never
-- published an amount. Do not add one here without asking.
-- ===========================================================================

with recipients as (
  select p.id
    from public.profiles p
   where p.deleted_at is null
     and not exists (
       select 1 from public.notifications n
        where n.user_id  = p.id
          and n.event_id = 'announcement_signs_and_wonders_2026'
     )
),
created as (
  insert into public.notifications
    (user_id, event_id, category, title, body, route, payload, important, is_read)
  select
    r.id,
    'announcement_signs_and_wonders_2026',
    -- 'account' is one of the categories the notifications screen has an icon
    -- for. An unknown category renders without one.
    'account',
    'Signs and Wonders 2026',
    'A must attend. Thursday 26 to Sunday 29 November at Zion World Christian '
      || 'Center, Waterparks, 31/37 Toyin Street, Ikeja, Lagos.' || chr(10) || chr(10)
      || 'Thu 26 Nov, 5pm — Miracle Night' || chr(10)
      || 'Fri 27 Nov, 5pm — Wonder Night' || chr(10)
      || 'Sat 28 Nov, 12 noon — Fire Conference' || chr(10)
      || 'Sun 29 Nov, 8am — Anointing & the Miraculous' || chr(10) || chr(10)
      || 'Enquiries: 0701 276 5732, 0701 215 1603, 0907 862 9004.',
    -- No route. Every value here would have to match a screen that exists, and
    -- a tap that goes nowhere is worse than a tap that does nothing.
    null,
    '{}'::jsonb,
    -- Routes the push to the high-importance channel, so it arrives as a
    -- banner over whatever is on screen rather than silently in the shade.
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
-- The counts below add the CTE results to the pre-run totals on purpose.
-- A data-modifying CTE is invisible to the rest of the same statement, so
-- reading the tables directly here would report the state BEFORE the insert
-- and show zero reached immediately after reaching everyone.
select concat_ws(chr(10),
  'people notified this run: ' || (select count(*)::text from created),
  'emails queued this run: '   || (select count(*)::text from queued),
  'total reached, including this run: ' || (
     (select count(*) from public.notifications
       where event_id = 'announcement_signs_and_wonders_2026')
     + (select count(*) from created))::text,
  'still not reached: ' || (
     (select count(*) from public.profiles p
       where p.deleted_at is null
         and not exists (
           select 1 from public.notifications n
            where n.user_id = p.id
              and n.event_id = 'announcement_signs_and_wonders_2026'))
     - (select count(*) from created))::text
) as result;
