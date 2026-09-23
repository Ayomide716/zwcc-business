-- ---------------------------------------------------------------------------
-- 0023 — The CAC document is optional
--
-- The church's decision. It was required, which contradicted the application
-- form immediately above it: the form asks "Is the business registered with
-- the CAC?" and offers "Not yet", and answering "Not yet" correctly hides the
-- registration number field — and then the upload list still demanded a
-- mandatory "CAC registration document".
--
-- The only way through was a hint advising people to upload evidence of
-- business activity into the box marked CAC certificate. That confused the
-- applicant, who had just said they had none, and it left the committee
-- unable to tell a real certificate from a photograph of a shop without
-- opening every file.
--
-- Migration 0004 seeds this table, so the app config, that seed and this
-- migration all have to agree. All three are changed together.
-- ---------------------------------------------------------------------------

update public.document_types
   set requirement = 'optional',
       description = 'Corporate Affairs Commission certificate or status '
                     || 'report, if your business is registered.'
 where id = 'cac_document';

-- ---------------------------------------------------------------------------
-- One row, one column, so the result can be copied in a single tap.
-- ---------------------------------------------------------------------------

select concat_ws(chr(10),
  'cac_document is now: ' || coalesce((
    select requirement from public.document_types where id = 'cac_document'),
    'MISSING — nothing was changed'),
  'documents still required: ' || (
    select string_agg(label, ', ' order by sort_order)
      from public.document_types
     where requirement = 'required')
) as result;
