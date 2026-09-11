/**
 * Rasterises a PDF document into page images so the app can show it inline.
 *
 * React Native has no PDF renderer. The alternatives were a native PDF engine
 * or a WebView carrying a JavaScript one; both add weight to an APK that is
 * downloaded over Nigerian mobile data and both are slow on the low-end Android
 * phones this app is actually used on. Rendering once on the server and serving
 * ordinary images means the phone does nothing but decode a JPEG, the pages are
 * cached on disk after the first view, and the viewer is the same one used for
 * photographs.
 *
 * Authorisation is delegated rather than reimplemented. The function reads the
 * document row using the CALLER'S token, so row-level security decides whether
 * this person may see it — an applicant sees only their own, staff see all, and
 * a stranger sees nothing. Only once that read succeeds does the service role
 * come out, and only to fetch the original and write the renders. Getting this
 * backwards would turn the function into a way to read any applicant's identity
 * documents by guessing an id.
 *
 * Deploy:
 *   supabase functions deploy render-document
 *
 * No secrets to set: SUPABASE_URL, SUPABASE_ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import * as mupdf from 'npm:mupdf@1.28.1';

const DOCUMENTS_BUCKET = 'application-documents';
const PAGES_BUCKET = 'document-pages';

/**
 * 2x a 72dpi PDF point grid is ~144dpi: sharp enough to read a registration
 * number when zoomed, and small enough that a page stays well under 100KB.
 */
const RENDER_SCALE = 2;

/**
 * A guard against a hostile or broken upload turning one request into a
 * hundred-megabyte render. Nothing legitimate here runs long.
 */
const MAX_PAGES = 30;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

interface DocumentRow {
  id: string;
  applicant_id: string;
  storage_path: string;
  mime_type: string;
  page_count: number | null;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Not signed in.' }, 401);

  let documentId: string;
  try {
    ({ documentId } = await request.json());
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }
  if (!documentId) return json({ error: 'documentId is required.' }, 400);

  const url = Deno.env.get('SUPABASE_URL')!;

  // The caller's own client. Every read below is subject to the same policies
  // the app is subject to — this is what stops one applicant rendering another
  // applicant's documents.
  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
  });

  const { data: document, error: readError } = await asCaller
    .from('documents')
    .select('id, applicant_id, storage_path, mime_type, page_count')
    .eq('id', documentId)
    .is('deleted_at', null)
    .maybeSingle<DocumentRow>();

  if (readError) return json({ error: readError.message }, 400);
  // Indistinguishable from "you may not see this", deliberately: a different
  // message here would let someone probe which document ids exist.
  if (!document) return json({ error: 'That document is not available.' }, 404);

  if (document.mime_type !== 'application/pdf') {
    return json({ pageCount: 1, alreadyRendered: true });
  }
  if (document.page_count && document.page_count > 0) {
    return json({ pageCount: document.page_count, alreadyRendered: true });
  }

  // Past this line the caller has proven they may read this document, so the
  // service role is safe to use for the parts RLS cannot express.
  const asService = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  try {
    const { data: original, error: downloadError } = await asService.storage
      .from(DOCUMENTS_BUCKET)
      .download(document.storage_path);

    if (downloadError || !original) {
      throw new Error(downloadError?.message ?? 'The original file could not be read.');
    }

    const bytes = new Uint8Array(await original.arrayBuffer());
    const pdf = mupdf.Document.openDocument(bytes, 'application/pdf');
    const total = pdf.countPages();

    if (total < 1) throw new Error('That PDF has no pages.');
    const pageCount = Math.min(total, MAX_PAGES);

    for (let index = 0; index < pageCount; index++) {
      const page = pdf.loadPage(index);
      const pixmap = page.toPixmap(
        mupdf.Matrix.scale(RENDER_SCALE, RENDER_SCALE),
        mupdf.ColorSpace.DeviceRGB,
        false,
        true,
      );

      // Neither encoder wins outright. A page of text compresses far better as
      // PNG, and without JPEG's ringing around the letters; a photographed
      // document compresses far better as JPEG. Encoding both costs one extra
      // pass over a bitmap that is already in memory, so just keep the smaller.
      const jpeg = pixmap.asJPEG(80);
      const png = pixmap.asPNG();
      const useJpeg = jpeg.length <= png.length;
      const body = useJpeg ? jpeg : png;

      const path = pagePath(document, index + 1, useJpeg ? 'jpg' : 'png');
      const { error: uploadError } = await asService.storage
        .from(PAGES_BUCKET)
        .upload(path, body, {
          contentType: useJpeg ? 'image/jpeg' : 'image/png',
          upsert: true,
        });

      if (uploadError) throw new Error(uploadError.message);
    }

    await asService
      .from('documents')
      .update({
        page_count: pageCount,
        pages_rendered_at: new Date().toISOString(),
        pages_error: null,
      })
      .eq('id', document.id);

    return json({ pageCount, truncated: total > pageCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Rendering failed.';

    // Recorded rather than swallowed, so the app can stop retrying a file that
    // will never render and offer the download fallback instead.
    await asService
      .from('documents')
      .update({ pages_error: message.slice(0, 500) })
      .eq('id', document.id);

    return json({ error: 'That PDF could not be prepared for viewing.' }, 422);
  }
});

/**
 * Folder 1 is the owning applicant's id, because every storage policy in this
 * project authorises on that segment. Changing this shape silently removes the
 * access control, so it is derived from the row rather than passed in.
 */
function pagePath(document: DocumentRow, page: number, extension: string): string {
  return `${document.applicant_id}/${document.id}/${String(page).padStart(3, '0')}.${extension}`;
}
