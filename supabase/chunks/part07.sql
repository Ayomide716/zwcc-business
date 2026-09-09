-- ZWCC setup: part 7 of 7
create policy "agreements staff all" on storage.objects
  for all to authenticated
  using (bucket_id = 'agreements' and public.is_staff())
  with check (bucket_id = 'agreements' and public.is_staff());

insert into public.workflow_statuses
  (id, label, phase, tone, sort_order, is_terminal, is_applicant_editable, is_documents_editable, occupies_slot)
values
  ('draft',                   'Draft',                   'preparation',  'neutral',  10, false, true,  true,  true),
  ('submitted',               'Submitted',               'verification', 'info',     20, false, false, false, true),
  ('verification',            'Under verification',      'verification', 'progress', 30, false, false, false, true),
  ('committee_review',        'Committee review',        'decision',     'progress', 40, false, false, false, true),
  ('changes_requested',       'Corrections requested',   'verification', 'warning',  35, false, true,  true,  true),
  ('approved',                'Approved',                'decision',     'success',  50, false, false, false, true),
  ('rejected',                'Not approved',            'closed',       'danger',   55, true,  false, false, false),
  ('agreement_pending',       'Agreement to sign',       'agreement',    'warning',  60, false, false, false, true),
  ('agreement_signed',        'Agreement signed',        'agreement',    'info',     70, false, false, false, true),
  ('disbursement_authorised', 'Cleared for disbursement','agreement',    'success',  80, false, false, false, true),
  ('monitoring',              'Active beneficiary',      'monitoring',   'progress', 90, false, false, false, true),
  ('completed',               'Grant completed',         'closed',       'success', 100, true,  false, false, false),
  ('withdrawn',               'Withdrawn',               'closed',       'neutral', 110, true,  false, false, false)
on conflict (id) do update
  set label                 = excluded.label,
      phase                 = excluded.phase,
      tone                  = excluded.tone,
      sort_order            = excluded.sort_order,
      is_terminal           = excluded.is_terminal,
      is_applicant_editable = excluded.is_applicant_editable,
      is_documents_editable = excluded.is_documents_editable,
      occupies_slot         = excluded.occupies_slot;

insert into public.document_types
  (id, label, description, category, requirement, accepts, max_size_mb, sort_order)
values
  ('passport_photograph',
   'Passport photograph',
   'A recent, clear passport photograph of the applicant.',
   'personal', 'required',
   array['image/jpeg', 'image/jpg', 'image/png'], 5, 1),
  ('means_of_identification',
   'Means of identification',
   'Any government-issued ID — NIN slip, driver''s licence, voter''s card or passport.',
   'personal', 'required',
   array['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'], 10, 2),
  ('cac_document',
   'CAC registration document',
   'Corporate Affairs Commission certificate or status report for your business.',
   'business', 'required',
   array['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'], 10, 3),
  ('business_evidence',
   'Evidence of business activity',
   'Photographs of your shop, stock, workspace, or recent sales records.',
   'business', 'optional',
   array['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'], 15, 4),
  ('cell_leader_verification',
   'Cell leader verification form',
   'The verification form completed and signed by your cell leader.',
   'church', 'optional',
   array['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'], 10, 5),
  ('believers_form',
   'Believer''s completed form',
   'Your completed believer''s form, if you have one.',
   'other', 'optional',
   array['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'], 10, 6)
on conflict (id) do update
  set label       = excluded.label,
      description = excluded.description,
      category    = excluded.category,
      requirement = excluded.requirement,
      accepts     = excluded.accepts,
      max_size_mb = excluded.max_size_mb,
      sort_order  = excluded.sort_order;

insert into public.grant_programs (slug, name, year, summary, is_active, config)
values (
  'zwcc-business-grant-2026',
  '2026 ZWCC Business Grant',
  2026,
  'The 2026 ZWCC Business Grant provides funding to help people start and grow sustainable businesses. Grants are awarded on the strength of the business proposal.',
  true,
  jsonb_build_object(
    'currency', 'NGN',
    'minAmount', null,
    'maxAmount', null,
    'monitoringMonths', 12,
    'reportingIntervalMonths', 1
  )
)
on conflict (slug) do update
  set name    = excluded.name,
      year    = excluded.year,
      summary = excluded.summary,
      config  = excluded.config;

insert into public.app_settings (key, value, description)
values
  ('applications_open', 'true'::jsonb,
   'When false, new applications cannot be started.'),
  ('registration_code_prefix', '"ZWCC"'::jsonb,
   'Leading segment of the application registration code.'),
  ('support_email', '"grants@zionworldcc.org"'::jsonb,
   'Shown on error and help screens.'),
  ('support_phone', '"+234 800 000 0000"'::jsonb,
   'Shown on error and help screens.')
on conflict (key) do nothing;

create or replace function public.notify_staff_about_application(
  p_application_id uuid,
  p_event_id       text,
  p_category       text,
  p_title          text,
  p_body           text,
  p_route          text    default null,
  p_payload        jsonb   default '{}'::jsonb,
  p_important      boolean default false
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recipients integer;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated.' using errcode = '42501';
  end if;

  -- The whole security model of this function. Staff may notify about any
  -- application; everyone else only about their own.
  if not public.is_staff()
     and not exists (
       select 1
         from public.applications a
        where a.id = p_application_id
          and a.applicant_id = auth.uid()
          and a.deleted_at is null
     )
  then
    raise exception 'You cannot raise notifications for that application.'
      using errcode = '42501';
  end if;

  insert into public.notifications
    (user_id, event_id, category, title, body, route, payload, important, is_read)
  select
    p.id, p_event_id, p_category, p_title, p_body, p_route, p_payload, p_important, false
  from public.profiles p
  where p.role in ('committee', 'admin')
    and p.deleted_at is null;

  get diagnostics recipients = row_count;
  return recipients;
end;
$$;

revoke all on function public.notify_staff_about_application(
  uuid, text, text, text, text, text, jsonb, boolean
) from public;

grant execute on function public.notify_staff_about_application(
  uuid, text, text, text, text, text, jsonb, boolean
) to authenticated;
