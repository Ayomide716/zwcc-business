-- ===========================================================================
-- Storage buckets and access control
-- ===========================================================================
-- Every bucket is PRIVATE. Nothing uploaded here is reachable by URL guessing —
-- files are served exclusively through short-lived signed URLs minted for a
-- caller who has already passed these policies.
--
-- Path convention, relied on by every policy below:
--
--     <applicant_uuid>/<application_uuid>/<document_type>/<file_uuid>.<ext>
--     ^^^^^^^^^^^^^^^^
--     folder 1 is always the owning user's id
--
-- That first path segment is what ties a stored object back to a user, so the
-- policies compare `(storage.foldername(name))[1]` against `auth.uid()`.
-- Client code must never build a path by hand — use `buildDocumentPath()` /
-- `buildProgressMediaPath()` in src/services/storage.service.ts.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'application-documents',
    'application-documents',
    false,
    15728640, -- 15 MB
    array['image/jpeg', 'image/jpg', 'image/png', 'application/pdf']
  ),
  (
    'progress-media',
    'progress-media',
    false,
    52428800, -- 50 MB, to allow a short video
    array['image/jpeg', 'image/jpg', 'image/png', 'video/mp4', 'video/quicktime']
  ),
  (
    'agreements',
    'agreements',
    false,
    10485760, -- 10 MB
    array['application/pdf']
  )
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- application-documents
-- ---------------------------------------------------------------------------

drop policy if exists "documents owner read" on storage.objects;
create policy "documents owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "documents staff read" on storage.objects;
create policy "documents staff read" on storage.objects
  for select to authenticated
  using (bucket_id = 'application-documents' and public.is_staff());

drop policy if exists "documents owner write" on storage.objects;
create policy "documents owner write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "documents owner update" on storage.objects;
create policy "documents owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Applicants may remove a file they replaced. The database row is soft-deleted
-- separately, so the audit trail survives the object being purged.
drop policy if exists "documents owner delete" on storage.objects;
create policy "documents owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "documents admin delete" on storage.objects;
create policy "documents admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'application-documents' and public.is_admin());

-- ---------------------------------------------------------------------------
-- progress-media
-- ---------------------------------------------------------------------------

drop policy if exists "media owner read" on storage.objects;
create policy "media owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'progress-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media staff read" on storage.objects;
create policy "media staff read" on storage.objects
  for select to authenticated
  using (bucket_id = 'progress-media' and public.is_staff());

drop policy if exists "media owner write" on storage.objects;
create policy "media owner write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'progress-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media owner delete" on storage.objects;
create policy "media owner delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'progress-media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ---------------------------------------------------------------------------
-- agreements
-- ---------------------------------------------------------------------------
-- Generated PDFs. Written by staff / a server-side job; the beneficiary may
-- read their own copy.

drop policy if exists "agreements owner read" on storage.objects;
create policy "agreements owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'agreements'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "agreements staff all" on storage.objects;
create policy "agreements staff all" on storage.objects
  for all to authenticated
  using (bucket_id = 'agreements' and public.is_staff())
  with check (bucket_id = 'agreements' and public.is_staff());
