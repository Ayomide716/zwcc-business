/**
 * Drains queued email notifications and sends them through Resend.
 *
 * The app never calls a provider directly. An API key shipped in a mobile
 * bundle is readable by anyone who installs the app, and would let a stranger
 * send mail at the church's expense — so the app's whole job is to write a
 * `notification_deliveries` row, and this function, holding the secret, does
 * the sending.
 *
 * Runs on a schedule rather than per-row. Email is not urgent to the minute,
 * batching is far cheaper, and a queue that is drained on a timer survives the
 * provider being briefly unreachable, which a fire-and-forget trigger does not.
 *
 * Deploy:
 *   supabase functions deploy send-email --no-verify-jwt
 *   supabase secrets set RESEND_API_KEY=re_...
 *   supabase secrets set MAIL_FROM="ZWCC Business Grant <grants@yourdomain.org>"
 *
 * Then schedule it — see supabase/README.md.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/** Kept small so one slow provider response cannot time the function out. */
const BATCH_SIZE = 25;

/** Give up after this many tries so one bad address cannot block the queue. */
const MAX_ATTEMPTS = 3;

interface DeliveryRow {
  id: string;
  notification_id: string;
  attempts: number | null;
  notifications: {
    title: string;
    body: string;
    route: string | null;
    profiles: { email: string | null; full_name: string | null } | null;
  } | null;
}

/**
 * A plain, readable message. Deliberately not a marketing template: this is
 * correspondence about someone's grant application, and it should look like a
 * letter from the church rather than a newsletter.
 */
function renderEmail(params: {
  name: string | null;
  title: string;
  body: string;
  organisation: string;
}): { html: string; text: string } {
  const greeting = params.name ? `Dear ${escapeHtml(params.name.split(' ')[0])},` : 'Hello,';

  const text = [
    params.name ? `Dear ${params.name.split(' ')[0]},` : 'Hello,',
    '',
    params.body,
    '',
    'You can see the full details in the app.',
    '',
    params.organisation,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#F5F6F8;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1A1D21;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background:#FFFFFF;border-radius:14px;overflow:hidden;">
      <tr>
        <td style="background:#0B2545;padding:20px 24px;">
          <div style="color:#FFFFFF;font-size:16px;font-weight:700;">${escapeHtml(params.organisation)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;">
          <p style="margin:0 0 16px;font-size:15px;line-height:22px;">${greeting}</p>
          <h1 style="margin:0 0 12px;font-size:19px;line-height:26px;font-weight:700;">${escapeHtml(params.title)}</h1>
          <p style="margin:0 0 20px;font-size:15px;line-height:23px;">${escapeHtml(params.body)}</p>
          <p style="margin:0;font-size:13px;line-height:20px;color:#6B7280;">
            You can see the full details in the app.
          </p>
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px;border-top:1px solid #E5E7EB;font-size:12px;line-height:18px;color:#6B7280;">
          You are receiving this because you have an application with
          ${escapeHtml(params.organisation)}.
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const mailFrom = Deno.env.get('MAIL_FROM');

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response('Not configured', { status: 500 });
  }
  if (!resendKey || !mailFrom) {
    // Leave the rows queued rather than marking them failed: the moment the
    // secrets are set, the backlog goes out.
    return new Response(
      JSON.stringify({ sent: 0, reason: 'RESEND_API_KEY or MAIL_FROM not set' }),
      { headers: { 'content-type': 'application/json' } },
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const organisation = Deno.env.get('ORGANISATION_NAME') ?? 'Zion World Christian Center';

  const { data, error } = await supabase
    .from('notification_deliveries')
    .select(
      'id, notification_id, attempts, notifications(title, body, route, profiles(email, full_name))',
    )
    .eq('channel', 'email')
    .eq('status', 'pending')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error('Could not read the email queue', error);
    return new Response('Queue read failed', { status: 500 });
  }

  const rows = (data ?? []) as unknown as DeliveryRow[];
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of rows) {
    const notification = row.notifications;
    const address = notification?.profiles?.email;

    if (!notification || !address) {
      await supabase
        .from('notification_deliveries')
        .update({
          status: 'skipped',
          error: 'No email address on file',
          attempted_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      skipped += 1;
      continue;
    }

    const { html, text } = renderEmail({
      name: notification.profiles?.full_name ?? null,
      title: notification.title,
      body: notification.body,
      organisation,
    });

    try {
      const response = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${resendKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: mailFrom,
          to: [address],
          subject: notification.title,
          html,
          text,
        }),
      });

      if (response.ok) {
        await supabase
          .from('notification_deliveries')
          .update({
            status: 'sent',
            provider: 'resend',
            attempted_at: new Date().toISOString(),
            attempts: (row.attempts ?? 0) + 1,
          })
          .eq('id', row.id);
        sent += 1;
        continue;
      }

      const detail = await response.text();
      const attempts = (row.attempts ?? 0) + 1;

      await supabase
        .from('notification_deliveries')
        .update({
          // Stay pending until the attempt ceiling, so a provider hiccup is
          // retried on the next run rather than losing the message.
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          provider: 'resend',
          error: detail.slice(0, 500),
          attempted_at: new Date().toISOString(),
          attempts,
        })
        .eq('id', row.id);

      console.error('Resend rejected a message', response.status, detail);
      failed += 1;
    } catch (sendError) {
      const attempts = (row.attempts ?? 0) + 1;
      await supabase
        .from('notification_deliveries')
        .update({
          status: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending',
          provider: 'resend',
          error: String(sendError).slice(0, 500),
          attempted_at: new Date().toISOString(),
          attempts,
        })
        .eq('id', row.id);
      console.error('Email request failed', sendError);
      failed += 1;
    }
  }

  return new Response(JSON.stringify({ considered: rows.length, sent, failed, skipped }), {
    headers: { 'content-type': 'application/json' },
  });
});
