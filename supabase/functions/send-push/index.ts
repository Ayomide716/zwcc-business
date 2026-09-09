/**
 * Delivers an in-app notification to the recipient's phones.
 *
 * Invoked by a database trigger whenever a row is inserted into
 * `public.notifications` (see `supabase/migrations/0009_push_dispatch.sql`), so
 * every place the app already creates a notification gains push delivery
 * without a single change to the app.
 *
 * Runs under the service role, outside RLS, because it must read device tokens
 * belonging to the recipient rather than to the caller. That is the only reason
 * it exists as an Edge Function rather than living in the app: the service-role
 * key must never be shipped to a phone.
 *
 * Deploy with:
 *   supabase functions deploy send-push --no-verify-jwt
 *
 * It needs no secrets of its own — SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 * are injected by the platform.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

/** Expo accepts at most 100 messages per request. */
const BATCH_SIZE = 100;

interface NotificationRow {
  id: string;
  user_id: string;
  title: string;
  body: string;
  route: string | null;
  important: boolean;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return new Response('Not configured', { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  let record: NotificationRow;
  try {
    const payload = await request.json();
    // The database webhook wraps the row; a manual call may send it bare.
    record = payload.record ?? payload;
  } catch {
    return new Response('Bad request', { status: 400 });
  }

  if (!record?.user_id || !record?.title) {
    return new Response('Nothing to send', { status: 200 });
  }

  const { data: tokens, error } = await supabase
    .from('device_tokens')
    .select('token')
    .eq('user_id', record.user_id)
    .eq('is_active', true);

  if (error) {
    console.error('Could not read device tokens', error);
    return new Response('Token lookup failed', { status: 500 });
  }

  if (!tokens || tokens.length === 0) {
    // Not an error: plenty of users never grant permission, and the in-app
    // notification list has the message either way.
    return new Response(JSON.stringify({ sent: 0, reason: 'no active devices' }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  const messages = tokens.map((row: { token: string }) => ({
    to: row.token,
    title: record.title,
    body: record.body,
    sound: record.important ? 'default' : null,
    priority: record.important ? 'high' : 'normal',
    channelId: 'default',
    // Read by `usePushNotifications` so a tap lands where the in-app list
    // would have gone.
    data: { route: record.route ?? undefined, notificationId: record.id },
  }));

  let sent = 0;
  const dead: string[] = [];

  for (let index = 0; index < messages.length; index += BATCH_SIZE) {
    const batch = messages.slice(index, index + BATCH_SIZE);

    try {
      const response = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'accept-encoding': 'gzip, deflate',
        },
        body: JSON.stringify(batch),
      });

      const result = await response.json();
      const tickets: ExpoTicket[] = result?.data ?? [];

      tickets.forEach((ticket, ticketIndex) => {
        if (ticket.status === 'ok') {
          sent += 1;
          return;
        }
        // A device that has been wiped or had the app removed reports this
        // once and will never accept another message. Retrying it forever
        // wastes a request on every future notification.
        if (ticket.details?.error === 'DeviceNotRegistered') {
          const token = batch[ticketIndex]?.to;
          if (token) dead.push(token);
        } else {
          console.error('Push rejected', ticket.message, ticket.details);
        }
      });
    } catch (sendError) {
      console.error('Push request failed', sendError);
    }
  }

  if (dead.length > 0) {
    await supabase.from('device_tokens').update({ is_active: false }).in('token', dead);
  }

  return new Response(JSON.stringify({ sent, deactivated: dead.length }), {
    headers: { 'content-type': 'application/json' },
  });
});
