-- ===========================================================================
-- 0011 — Profile pictures
-- ===========================================================================
-- A private bucket, like every other, plus one column holding the path.
--
-- ⚠️ A DELIBERATE LIMIT ON WHO SEES THESE
--
-- An applicant may set a picture and see their own. Staff may NOT read the
-- avatars bucket, and the review screens do not show one.
--
-- That is a fairness decision, not an oversight. This app decides who receives
-- money. A reviewer who can see an applicant's face can be influenced — by
-- ethnicity, age, gender, disability, or how well-off someone looks — in ways
-- no rubric catches and no audit log records. The scoring rubric in migration
-- 0007 exists to make decisions defensible; putting a photograph next to it
-- would quietly undo that.
--
-- So the picture is for the applicant's own sense of the app being theirs, and
-- it stops there. If the church later decides reviewers should see photographs,
-- that is their call to make explicitly: add a staff select policy here and a
-- line to the review screen. It should never happen by accident.
--
-- Idempotent, like every migration in this folder.
-- ===========================================================================

-- `profiles.avatar_url` already exists from migration 0001 and nothing writes
-- it, so no new column is needed. It holds the storage PATH, not a URL: the
-- bucket is private, so a URL would be a signed one that expires within the
-- hour and is useless the moment it is stored. The name is kept because
-- renaming a live column buys nothing.
comment on column public.profiles.avatar_url is
  'Path within the avatars bucket, not a URL — the bucket is private. Shown to the owner only, never on review screens; see migration 0011.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2097152, -- 2 MB. Compressed client-side well below this.
  array['image/jpeg', 'image/jpg', 'image/png']
)
on conflict (id) do update
  set public          = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Policies. Same convention as every other bucket: the first path segment is
-- the owning user's id, and that is what authorises access.
--
--     <user_uuid>/<file_uuid>.jpg
-- ---------------------------------------------------------------------------

drop policy if exists avatars_select_own on storage.objects;
create policy avatars_select_own on storage.objects
  for select using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Deliberately no `is_staff()` select policy. See the note at the top.
