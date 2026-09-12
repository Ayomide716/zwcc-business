-- ===========================================================================
-- Configuration seed
-- ===========================================================================
-- Mirrors the TypeScript configuration into the database. Everything here is
-- an UPSERT, so this file is safe to re-run — and MUST be re-run whenever
-- `src/config/workflow.config.ts` or `src/config/documents.config.ts` changes,
-- because RLS reads the editability flags from `workflow_statuses`.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Workflow statuses  (source: src/config/workflow.config.ts)
-- ---------------------------------------------------------------------------

insert into public.workflow_statuses
  (id, label, phase, tone, sort_order, is_terminal, is_applicant_editable, is_documents_editable, occupies_slot)
  -- is_documents_reviewable is set after this insert, so that re-running this
  -- migration on a database that has not reached 17 yet still works.
values
  ('draft',                   'Draft',                   'preparation',  'neutral',  10, false, true,  true,  true),
  ('submitted',               'Submitted',               'verification', 'info',     20, false, false, false, true),
  ('verification',            'Under verification',      'verification', 'progress', 30, false, false, false, true),
  ('committee_review',        'Committee review',        'decision',     'progress', 40, false, false, false, true),
  -- Reachable only when WORKFLOW_FEATURES.allowReturnForCorrections is enabled.
  ('changes_requested',       'Corrections requested',   'verification', 'warning',  35, false, true,  true,  true),
  ('approved',                'Approved',                'decision',     'success',  50, false, false, false, true),
  -- Terminal, but frees the applicant's slot so they can reapply (§15).
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

-- Which statuses allow staff to verify or reject documents. Separate from the
-- insert above so this migration still runs on a database that has not reached
-- migration 17 yet. Source: documentsReviewable in workflow.config.ts.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'workflow_statuses'
       and column_name = 'is_documents_reviewable'
  ) then
    update public.workflow_statuses
       set is_documents_reviewable = (id in ('submitted', 'verification', 'changes_requested'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Document types  (source: src/config/documents.config.ts)
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Grant programme
-- ---------------------------------------------------------------------------

insert into public.grant_programs (slug, name, year, summary, is_active, config)
values (
  'zwcc-business-grant-2026',
  '2026 ZWCC Business Grant',
  2026,
  'The 2026 ZWCC Business Grant provides funding to help people start and grow sustainable businesses. Grants are awarded on the strength of the business proposal.',
  true,
  jsonb_build_object(
    'currency', 'NGN',
    -- Deliberately null: the amount follows the proposal (brief §8).
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

-- ---------------------------------------------------------------------------
-- Settings an administrator can change without a new build
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- Transitions an applicant may perform  (source: src/config/workflow.config.ts)
-- ---------------------------------------------------------------------------
-- Every transition whose `allowedRoles` include 'applicant', expanded to one
-- row per from/to pair. The applicant's update policy and the separation-of-
-- duties trigger both read this, so an applicant step added to the workflow
-- takes effect by re-running this migration rather than by editing policies.
--
-- Skipped when the table is absent so this migration still runs on a database
-- that has not reached migration 14 yet.

do $$
begin
  if to_regclass('public.applicant_transitions') is null then
    return;
  end if;

  delete from public.applicant_transitions;

  insert into public.applicant_transitions (from_status, to_status) values
    -- submit_application
    ('draft',             'submitted'),
    ('changes_requested', 'submitted'),
    -- sign_agreement
    ('agreement_pending', 'agreement_signed'),
    -- withdraw_application
    ('draft',             'withdrawn'),
    ('submitted',         'withdrawn'),
    ('verification',      'withdrawn'),
    ('committee_review',  'withdrawn'),
    ('changes_requested', 'withdrawn')
  on conflict do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- Promoting a user to staff
-- ---------------------------------------------------------------------------
-- Roles are never self-assigned. After the person has registered through the
-- app, an administrator (or a project owner running SQL) promotes them:
--
--   update public.profiles set role = 'committee'
--    where email = 'reviewer@zionworldcc.org';
--
--   update public.profiles set role = 'admin'
--    where email = 'admin@zionworldcc.org';
--
-- The first administrator must be promoted this way, from the Supabase SQL
-- editor, because `prevent_self_role_change` blocks everyone else.
