-- ===========================================================================
-- 0009 — Send a push whenever a notification is created
-- ===========================================================================
-- Every place the app already creates an in-app notification gains push
-- delivery from this one trigger, rather than each caller remembering to send
-- one. The app itself is unchanged.
--
-- Requires the `send-push` Edge Function to be deployed:
--   supabase functions deploy send-push --no-verify-jwt
--
-- ⚠️ Two settings must be provided before pushes will send. Run the statements
-- at the bottom of this file with your own project's values. They are stored as
-- database settings rather than written into this migration so that no key is
-- ever committed to the repository.
--
-- If the settings are absent the trigger does nothing at all: notifications
-- still appear in the app, and nothing errors. Delivery is an enhancement, and
-- a missing key must never stop an applicant submitting.
--
-- Idempotent, like every migration in this folder.
-- ===========================================================================

create extension if not exists pg_net;

create or replace function public.dispatch_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  function_url text;
  service_key  text;
begin
  -- current_setting(..., true) returns null rather than raising when unset,
  -- which is what makes an unconfigured project degrade quietly.
  function_url := nullif(current_setting('app.push_function_url', true), '');
  service_key  := nullif(current_setting('app.service_role_key', true), '');

  if function_url is null or service_key is null then
    return new;
  end if;

  -- Fired and forgotten. The insert that triggered this must not wait on an
  -- HTTP round trip to Expo, and must not fail if that round trip does.
  perform net.http_post(
    url     := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_key
    ),
    body    := jsonb_build_object('record', to_jsonb(new))
  );

  return new;
exception
  when others then
    -- A notification that reached the app but not the phone is a far better
    -- outcome than a failed transition.
    raise warning 'Push dispatch failed: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists notifications_dispatch_push on public.notifications;
create trigger notifications_dispatch_push
  after insert on public.notifications
  for each row execute function public.dispatch_push_notification();

-- ===========================================================================
-- Run these two once, with your own values, to switch delivery on.
-- ===========================================================================
-- Both are read at trigger time, so no redeploy is needed after setting them.
--
--   alter database postgres set app.push_function_url =
--     'https://<your-project-ref>.supabase.co/functions/v1/send-push';
--
--   alter database postgres set app.service_role_key =
--     '<your service role key>';
--
-- Find the service role key in Dashboard -> Project Settings -> API. It is a
-- database setting, visible only to database superusers; it is never sent to
-- the app, and must never be put in `.env` or in `eas.json`.
--
-- To check they are set:
--   select current_setting('app.push_function_url', true);
--
-- To turn delivery off again:
--   alter database postgres reset app.push_function_url;
-- ===========================================================================
