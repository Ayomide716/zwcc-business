-- ===========================================================================
-- 0008 — Push notification device tokens
-- ===========================================================================
-- In-app notifications only reach someone who opens the app. An approval, a
-- request for a document, or a monthly report falling due are all things the
-- applicant needs to know without checking. This table holds the Expo push
-- tokens to deliver them to.
--
-- A token is a routing address, not a secret, but it does identify a person's
-- device — so a user may only ever see and write their own rows, and nothing
-- in the app can enumerate anyone else's. The sender runs with the service
-- role, outside these policies.
--
-- Idempotent, like every migration in this folder.
-- ===========================================================================

create table if not exists public.device_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  -- The Expo push token, e.g. ExponentPushToken[xxxxxxxx].
  token       text not null,
  platform    text not null check (platform in ('ios', 'android', 'web')),
  -- Cleared when Expo reports the token as dead, so the sender can skip it
  -- rather than retrying a device that has been wiped or had the app removed.
  is_active   boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per physical device. Re-registering the same token updates the
-- existing row instead of accumulating duplicates that each get a copy of
-- every notification.
create unique index if not exists device_tokens_token_key
  on public.device_tokens (token);

create index if not exists device_tokens_user_idx
  on public.device_tokens (user_id) where is_active;

drop trigger if exists device_tokens_set_updated_at on public.device_tokens;
create trigger device_tokens_set_updated_at
  before update on public.device_tokens
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — a device token belongs to exactly one person
-- ---------------------------------------------------------------------------

alter table public.device_tokens enable row level security;

drop policy if exists device_tokens_select_own on public.device_tokens;
create policy device_tokens_select_own on public.device_tokens
  for select using (user_id = auth.uid());

drop policy if exists device_tokens_insert_own on public.device_tokens;
create policy device_tokens_insert_own on public.device_tokens
  for insert with check (user_id = auth.uid());

drop policy if exists device_tokens_update_own on public.device_tokens;
create policy device_tokens_update_own on public.device_tokens
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists device_tokens_delete_own on public.device_tokens;
create policy device_tokens_delete_own on public.device_tokens
  for delete using (user_id = auth.uid());

-- Deliberately no policy granting staff or administrators read access.
-- Nobody needs to browse other people's device tokens from inside the app, and
-- the sender does not go through RLS.

comment on table public.device_tokens is
  'Expo push tokens. Written by the app for the signed-in user only; read by the push sender under the service role.';
