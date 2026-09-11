/**
 * Notification transports.
 *
 * The brief asks for email, SMS, WhatsApp and in-app, with in-app first and no
 * provider hardcoded. So each transport implements one interface, and the
 * dispatcher picks transports from configuration.
 *
 * Only the in-app channel actually delivers today. The other three are real
 * classes with the correct contract that enqueue a `notification_deliveries`
 * row for a server-side worker to pick up.
 *
 * WHY THE APP DOES NOT CALL PROVIDERS DIRECTLY
 * Sending email/SMS/WhatsApp requires a provider API key. Any key shipped in a
 * mobile bundle is readable by anyone who installs the app, and would let an
 * attacker send messages at the church's expense. The queue row is therefore
 * the app's whole job; a Supabase Edge Function holding the secret does the
 * sending. Implementing a provider means writing that function and flipping the
 * channel on in `notifications.config.ts` — no app change.
 */
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';
import type { NotificationChannel } from '@/config/notifications.config';

export interface NotificationMessage {
  notificationId: string;
  userId: string;
  title: string;
  body: string;
  /** Recipient contact details, resolved by the dispatcher. */
  email?: string | null;
  phone?: string | null;
  payload?: Record<string, unknown>;
}

export interface DeliveryResult {
  channel: NotificationChannel;
  status: 'sent' | 'queued' | 'failed' | 'skipped';
  provider?: string;
  error?: string;
}

export interface NotificationTransport {
  readonly channel: NotificationChannel;
  /** Name of the configured provider, for the delivery record. */
  readonly provider: string;
  /** False when the channel cannot run (no provider configured, no address). */
  isAvailable(message: NotificationMessage): boolean;
  send(message: NotificationMessage): Promise<DeliveryResult>;
}

/* -------------------------------------------------------------------------- */
/* Queue helper                                                                */
/* -------------------------------------------------------------------------- */

async function enqueue(
  channel: NotificationChannel,
  provider: string,
  message: NotificationMessage,
): Promise<DeliveryResult> {
  try {
    const { error } = await supabase.from('notification_deliveries').insert({
      notification_id: message.notificationId,
      channel,
      status: 'pending',
      provider,
    });
    if (error) throw error;
    return { channel, status: 'queued', provider };
  } catch (error) {
    logger.error(`Failed to queue ${channel} notification`, error);
    return {
      channel,
      status: 'failed',
      provider,
      error: error instanceof Error ? error.message : 'queue failed',
    };
  }
}

/* -------------------------------------------------------------------------- */
/* In-app — the only channel live in the MVP                                   */
/* -------------------------------------------------------------------------- */

/**
 * In-app delivery is a no-op at send time: the `notifications` row created by
 * the service *is* the delivery. It still records a delivery row so every
 * channel reports through the same path.
 */
export class InAppNotificationService implements NotificationTransport {
  readonly channel = 'in_app' as const;
  readonly provider = 'supabase';

  isAvailable(): boolean {
    return true;
  }

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    try {
      const { error } = await supabase.from('notification_deliveries').insert({
        notification_id: message.notificationId,
        channel: this.channel,
        status: 'sent',
        provider: this.provider,
        attempted_at: new Date().toISOString(),
      });
      if (error) throw error;
      return { channel: this.channel, status: 'sent', provider: this.provider };
    } catch (error) {
      // The user still has their notification; only the receipt failed.
      logger.warn('In-app delivery receipt failed', { error });
      return { channel: this.channel, status: 'sent', provider: this.provider };
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Email                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Queues an email. To go live: implement a `send-email` Edge Function that
 * drains `notification_deliveries` where channel = 'email', and set
 * `ENABLED_CHANNELS.email = true`.
 */
export class EmailNotificationService implements NotificationTransport {
  readonly channel = 'email' as const;
  /*
    Named for the record, not used to reach anything from here. The key lives
    in the `send-email` Edge Function; swapping providers is a change there and
    to this string, never to the app's sending path.
  */
  readonly provider = 'resend';

  isAvailable(message: NotificationMessage): boolean {
    return Boolean(message.email);
  }

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    if (!this.isAvailable(message)) {
      return { channel: this.channel, status: 'skipped', error: 'No email address on file' };
    }
    return enqueue(this.channel, this.provider, message);
  }
}

/* -------------------------------------------------------------------------- */
/* SMS                                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Queues an SMS. Nigerian delivery is usually via Termii, Africa's Talking or
 * Twilio; the choice belongs in the Edge Function, not here.
 */
export class SMSNotificationService implements NotificationTransport {
  readonly channel = 'sms' as const;
  readonly provider = 'pending-configuration';

  isAvailable(message: NotificationMessage): boolean {
    return Boolean(message.phone);
  }

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    if (!this.isAvailable(message)) {
      return { channel: this.channel, status: 'skipped', error: 'No phone number on file' };
    }
    return enqueue(this.channel, this.provider, message);
  }
}

/* -------------------------------------------------------------------------- */
/* WhatsApp                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Queues a WhatsApp message. Note for whoever implements the worker: the
 * WhatsApp Business API only allows free-form text within 24 hours of a user's
 * last message, so most of these notifications will need pre-approved message
 * templates. The template name belongs alongside the provider config.
 */
export class WhatsAppNotificationService implements NotificationTransport {
  readonly channel = 'whatsapp' as const;
  readonly provider = 'pending-configuration';

  isAvailable(message: NotificationMessage): boolean {
    return Boolean(message.phone);
  }

  async send(message: NotificationMessage): Promise<DeliveryResult> {
    if (!this.isAvailable(message)) {
      return { channel: this.channel, status: 'skipped', error: 'No phone number on file' };
    }
    return enqueue(this.channel, this.provider, message);
  }
}

/** The transport registry the dispatcher reads. */
export const TRANSPORTS: Record<NotificationChannel, NotificationTransport> = {
  in_app: new InAppNotificationService(),
  email: new EmailNotificationService(),
  sms: new SMSNotificationService(),
  whatsapp: new WhatsAppNotificationService(),
};
