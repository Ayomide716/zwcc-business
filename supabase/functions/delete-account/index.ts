/**
 * Deletes the caller's own account: their files first, then everything else.
 *
 * Why this is a function and not something the app does itself. Removing a
 * sign-in account needs the service role key, and that key must never be in
 * the app. So the app asks, and this decides.
 *
 * Who is being deleted comes from the caller's token, checked against the auth
 * server, never from the request body. There is no parameter that names a
 * user, so there is no way to ask this to delete somebody else.
 *
 * Whether they may is decided by `account_deletion_blocker()` in the database,
 * read with the caller's own token. That is the same rule the app shows before
 * anyone presses the button, so the screen and the enforcement cannot drift
 * apart.
 *
 * Order matters:
 *
 *   1. Files, in every bucket, under the person's own folder. Storage is not
 *      linked to the database by foreign keys, so deleting the account alone
 *      would leave their NIN slip, photographs and videos behind with nothing
 *      pointing at them — exactly the data the deletion was meant to remove.
 *
 *   2. The sign-in account. Every table cascades from it, so this removes the
 *      profile, applications, documents, reports, notifications and device
 *      tokens in one step.
 *
 * If the files step fails, the account is left untouched and the person can
 * try again. If the account step fails after the files are gone, trying again
 * is still safe: the listing simply finds nothing left to remove.
 *
 * Deploy:
 *   supabase functions deploy delete-account
 *
 * Deploy WITH JWT verification (the default). The caller is a signed-in person,
 * and there is no reason to accept anyone else. The function also verifies the
 * token itself, so it stays safe if that setting is ever changed.
 *
 * No secrets to set: SUPABASE_URL, SUPABASE_ANON_KEY and
 * SUPABASE_SERVICE_ROLE_KEY are injected by the platform.
 */
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

/**
 * Every bucket the app writes to. Each one keeps a person's files under a
 * top-level folder named after their user id, which is also what the storage
 * policies check, so the folder is a reliable boundary.
 */
const BUCKETS = [
  'application-documents',
  'document-pages',
  'progress-media',
  'agreements',
  'avatars',
] as const;

/** Storage lists at most this many entries per call. */
const PAGE_SIZE = 1000;

/** Removal is batched so one request never carries an unbounded list. */
const REMOVE_BATCH = 100;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/**
 * Every file path under `prefix`, however deeply nested.
 *
 * Storage has no recursive listing: a folder comes back as an entry with no id,
 * and has to be opened in turn. Document uploads sit three folders deep
 * (user / application / document type), so a flat listing would miss them all.
 */
async function listFiles(
  storage: SupabaseClient['storage'],
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const files: string[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await storage
      .from(bucket)
      .list(prefix, { limit: PAGE_SIZE, offset });

    if (error) throw new Error(`${bucket}: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id === null) {
        files.push(...(await listFiles(storage, bucket, path)));
      } else {
        files.push(path);
      }
    }

    if (data.length < PAGE_SIZE) break;
  }

  return files;
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization) return json({ error: 'Not signed in.', code: 'not_signed_in' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;

  const asCaller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });

  // Ask the auth server who this is. Decoding the token locally would accept a
  // token for an account that has already been deleted or banned.
  const {
    data: { user },
    error: userError,
  } = await asCaller.auth.getUser();

  if (userError || !user) {
    return json({ error: 'Your session has expired. Please sign in again.', code: 'not_signed_in' }, 401);
  }

  // The same rule the app showed before the button was pressed.
  const { data: blocker, error: blockerError } = await asCaller.rpc('account_deletion_blocker');
  if (blockerError) {
    return json({ error: 'Could not check your account. Please try again.', code: 'check_failed' }, 500);
  }
  if (blocker) {
    return json({ error: 'This account cannot be deleted from the app.', code: blocker }, 409);
  }

  // The caller has proven who they are and that they may do this. Only now
  // does the service role come out, and only for the caller's own data.
  const asService = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const removed: Record<string, number> = {};

  try {
    for (const bucket of BUCKETS) {
      const paths = await listFiles(asService.storage, bucket, user.id);
      for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
        const { error } = await asService.storage
          .from(bucket)
          .remove(paths.slice(i, i + REMOVE_BATCH));
        if (error) throw new Error(`${bucket}: ${error.message}`);
      }
      removed[bucket] = paths.length;
    }
  } catch (error) {
    console.error('delete-account: file removal failed', user.id, error);
    return json(
      { error: 'Your files could not all be removed, so nothing has been deleted yet. Please try again.', code: 'files_failed' },
      500,
    );
  }

  const { error: deleteError } = await asService.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('delete-account: account removal failed', user.id, deleteError);
    return json(
      { error: 'Your account could not be deleted. Please try again.', code: 'delete_failed' },
      500,
    );
  }

  // A record that a deletion happened, with nothing personal in it: no name,
  // no email. The id is kept only so the entry can be matched to earlier ones;
  // it identifies nobody once the account is gone.
  await asService.from('audit_logs').insert({
    actor_id: null,
    actor_role: 'applicant',
    action: 'account.deleted',
    entity_type: 'profile',
    entity_id: user.id,
    metadata: { files_removed: removed, requested_by: 'account holder' },
  });

  return json({ deleted: true });
});
