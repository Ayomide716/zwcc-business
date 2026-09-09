-- ZWCC setup: part 6 of 7
create policy reports_update_own on public.progress_reports
  for update using (applicant_id = auth.uid() and status = 'submitted')
  with check (applicant_id = auth.uid() and status = 'submitted');

drop policy if exists reports_update_staff on public.progress_reports;

create policy reports_update_staff on public.progress_reports
  for update using (public.is_staff()) with check (public.is_staff());

drop policy if exists media_select_own on public.progress_media;

create policy media_select_own on public.progress_media
  for select using (applicant_id = auth.uid() or public.is_staff());

drop policy if exists media_insert_own on public.progress_media;

create policy media_insert_own on public.progress_media
  for insert with check (
    applicant_id = auth.uid()
    and exists (
      select 1 from public.progress_reports r
       where r.id = report_id and r.applicant_id = auth.uid()
    )
  );

drop policy if exists media_delete_own on public.progress_media;

create policy media_delete_own on public.progress_media
  for delete using (
    applicant_id = auth.uid()
    and exists (
      select 1 from public.progress_reports r
       where r.id = report_id and r.applicant_id = auth.uid() and r.status = 'submitted'
    )
  );

drop policy if exists notifications_select_own on public.notifications;

create policy notifications_select_own on public.notifications
  for select using (user_id = auth.uid());

drop policy if exists notifications_update_own on public.notifications;

create policy notifications_update_own on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists notifications_insert_staff on public.notifications;

create policy notifications_insert_staff on public.notifications
  for insert with check (public.is_staff() or user_id = auth.uid());

drop policy if exists notifications_admin on public.notifications;

create policy notifications_admin on public.notifications
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists deliveries_select_staff on public.notification_deliveries;

create policy deliveries_select_staff on public.notification_deliveries
  for select using (public.is_staff());

drop policy if exists deliveries_insert on public.notification_deliveries;

create policy deliveries_insert on public.notification_deliveries
  for insert with check (
    exists (
      select 1 from public.notifications n
       where n.id = notification_id
         and (n.user_id = auth.uid() or public.is_staff())
    )
  );

drop policy if exists audit_insert on public.audit_logs;

create policy audit_insert on public.audit_logs
  for insert to authenticated with check (actor_id = auth.uid() or actor_id is null);

drop policy if exists audit_select_staff on public.audit_logs;

create policy audit_select_staff on public.audit_logs
  for select using (public.is_staff());

drop policy if exists settings_read on public.app_settings;

create policy settings_read on public.app_settings
  for select to authenticated using (true);

drop policy if exists settings_admin on public.app_settings;

create policy settings_admin on public.app_settings
  for all using (public.is_admin()) with check (public.is_admin());

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

drop policy if exists "agreements owner read" on storage.objects;

create policy "agreements owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'agreements'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "agreements staff all" on storage.objects;
