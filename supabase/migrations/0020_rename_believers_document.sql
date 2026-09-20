-- ---------------------------------------------------------------------------
-- 0020 — The believer's form is the Believers Foundation Class
--
-- A wording change the church asked for on the last item of the document list.
--
-- The id is deliberately untouched. `documents.document_type_id` references it
-- on every file anyone has ever uploaded, so renaming the key would orphan
-- those rows; the id is an internal handle and the label is the only part a
-- person ever sees.
--
-- The seed in migration 4 carries the same wording for a fresh database. This
-- migration is what brings an existing one into line.
-- ---------------------------------------------------------------------------

update public.document_types
   set label       = 'Believers Foundation Class',
       description = 'Evidence that you have completed the Believers Foundation Class, if you have it.'
 where id = 'believers_form';

-- Confirm it landed, without needing a second query:
--   select id, label from public.document_types where id = 'believers_form';
