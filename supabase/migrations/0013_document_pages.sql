-- ---------------------------------------------------------------------------
-- 0013 — Rendered document pages
--
-- PDFs cannot be shown inside the app without either a native PDF engine or a
-- WebView carrying a JavaScript one. Both cost APK size and both are slow on
-- the cheap Android phones this app is actually used on. So the rendering
-- happens once on the server instead: an Edge Function rasterises each page to
-- an image, and the app displays those with the same viewer it uses for
-- photographs.
--
-- The rendered pages are a derivative of someone's identity documents, so this
-- bucket is exactly as private as the original and follows the same path
-- convention — folder 1 is the owning applicant's id, and the policies compare
-- it against auth.uid().
-- ---------------------------------------------------------------------------

alter table public.documents
  add column if not exists page_count integer
    check (page_count is null or page_count > 0),
  add column if not exists pages_rendered_at timestamptz,
  -- Set when rendering failed, so the app can offer the download fallback
  -- instead of retrying forever on a corrupt file.
  add column if not exists pages_error text;

comment on column public.documents.page_count is
  'Number of rendered page images. 1 for an image upload; null until a PDF has been rendered.';

-- An image is its own single page and never needs the renderer. Backfilling
-- means the app can trust page_count instead of re-deriving it from mime type.
update public.documents
   set page_count = 1,
       pages_rendered_at = coalesce(pages_rendered_at, created_at)
 where page_count is null
   and mime_type <> 'application/pdf'
   and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'document-pages',
  'document-pages',
  false,
  5242880, -- 5 MB. A rasterised page that exceeds this was rendered wrong.
  -- Both, because neither wins outright: PNG compresses a page of text far
  -- better than JPEG and without ringing around the letters, while JPEG wins
  -- on a photographed document. The renderer encodes each page both ways and
  -- keeps whichever came out smaller.
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Read only. Nothing writes here except the Edge Function, which holds the
-- service role and bypasses these policies — so there is deliberately no
-- insert, update or delete policy for an ordinary session.

drop policy if exists "pages owner read" on storage.objects;
create policy "pages owner read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'document-pages'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "pages staff read" on storage.objects;
create policy "pages staff read" on storage.objects
  for select to authenticated
  using (bucket_id = 'document-pages' and public.is_staff());

drop policy if exists "pages admin delete" on storage.objects;
create policy "pages admin delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'document-pages' and public.is_admin());

-- ---------------------------------------------------------------------------
-- Replacing a document must invalidate its rendered pages
-- ---------------------------------------------------------------------------

create or replace function public.reset_document_pages()
returns trigger
language plpgsql
as $$
begin
  -- A new file behind the same row means the old renders describe a document
  -- that no longer exists. Clearing these makes the app re-render on next view.
  if new.storage_path is distinct from old.storage_path then
    new.page_count := case when new.mime_type <> 'application/pdf' then 1 end;
    new.pages_rendered_at := case when new.mime_type <> 'application/pdf' then now() end;
    new.pages_error := null;
  end if;
  return new;
end;
$$;

drop trigger if exists documents_reset_pages on public.documents;
create trigger documents_reset_pages
  before update on public.documents
  for each row execute function public.reset_document_pages();
