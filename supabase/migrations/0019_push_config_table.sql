-- ---------------------------------------------------------------------------
-- 0019 — Push configuration in a table, not a database parameter
--
-- Migration 9 told the dispatch trigger where the sender lives with
-- `alter database postgres set app.push_function_url = ...`. Supabase refuses
-- that now: the `postgres` role on a hosted project is no longer a superuser,
-- and setting a database-wide parameter requires one. The instruction fails
-- with "permission denied to set parameter", which is a wall rather than a
-- workaround — the trigger has no way to learn the URL or the key.
--
-- So the two values live in a table instead. The trigger is SECURITY DEFINER
-- and owns its read, which means the key never has to be reachable by anyone
-- else: row-level security is on with no policies at all, and the API roles
-- have no grant, so the service role key cannot be read through PostgREST by
-- an applicant, a committee member, or an administrator.
--
-- Migration 9's parameters are still honoured if they happen to be set, so a
-- self-hosted project where a superuser did set them keeps working untouched.
-- ---------------------------------------------------------------------------

create table if not exists public.push_config (
  -- One row, enforced. A second set of credentials would be ambiguous rather
  -- than useful, and this makes "update the config" a plain upsert.
  id               boolean primary key default true check (id),
  function_url     text not null,
  service_role_key text not null,
  updated_at       timestamptz not null default now()
);

comment on table public.push_config is
  'Where the push sender lives and how to authenticate to it. Read only by dispatch_push_notification(), which is SECURITY DEFINER. Never expose this table to the API.';

alter table public.push_config enable row level security;

-- Deliberately no policies. With row-level security on and nothing granted,
-- there is no path to these rows through the API for any role.
revoke all on public.push_config from anon, authenticated;

-- ---------------------------------------------------------------------------

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
  -- The table first, then migration 9's database parameters, so a project that
  -- was configured the old way before this migration keeps working.
  select p.function_url, p.service_role_key
    into function_url, service_key
    from public.push_config p
   limit 1;

  if function_url is null or service_key is null then
    -- current_setting(..., true) returns null rather than raising when unset,
    -- which is what makes an unconfigured project degrade quietly.
    function_url := nullif(current_setting('app.push_function_url', true), '');
    service_key  := nullif(current_setting('app.service_role_key', true), '');
  end if;

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

-- ===========================================================================
-- Run this once, with your own service role key, to switch delivery on.
-- ===========================================================================
--   insert into public.push_config (function_url, service_role_key)
--   values (
--     'https://<your-project-ref>.supabase.co/functions/v1/send-push',
--     '<your service role key>'
--   )
--   on conflict (id) do update
--     set function_url     = excluded.function_url,
--         service_role_key = excluded.service_role_key,
--         updated_at       = now();
--
-- Find the key in Dashboard -> Project Settings -> API. It must never appear
-- in the app, in `.env`, or in this repository.
--
-- To check it is set, without printing the key:
--   select function_url, service_role_key is not null as key_set
--     from public.push_config;
--
-- To turn delivery off again:
--   delete from public.push_config;
-- ===========================================================================
