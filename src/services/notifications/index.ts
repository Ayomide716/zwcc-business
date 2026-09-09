/**
 * Notification dispatcher.
 *
 * Callers raise an *event*, never a message:
 *
 *     await notifications.raise('application_submitted', userId, {
 *       registrationCode: 'ZWCC-2026-A7K3QD',
 *     });
 *
 * The dispatcher looks the event up in `notifications.config.ts`, renders the
 * copy, writes the in-app row, and fans out to whichever transports that event
 * declares and configuration has enabled.
 */
import {
  ENABLED_CHANNELS,
  getTemplate,
  renderTemplate,
  type NotificationChannel,
} from '@/config/notifications.config';
import { logger } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import type { Json, NotificationRow } from '@/types/database';

import { TRANSPORTS, type DeliveryResult, type NotificationMessage } from './channels';

export type NotificationPayload = Record<string, string | number | null | undefined>;

export const notifications = {
  /**
   * Raise a notification for one user.
   *
   * Never throws: a notification failing must not roll back the workflow action
   * that triggered it. Failures are logged.
   */
  async raise(
    eventId: string,
    userId: string,
    payload: NotificationPayload = {},
  ): Promise<void> {
    const template = getTemplate(eventId);
    if (!template) {
      logger.warn('Unknown notification event', { eventId });
      return;
    }

    try {
      const title = renderTemplate(template.title, payload);
      const body = renderTemplate(template.body, payload);

      const { data: notification, error } = await supabase
        .from('notifications')
        .insert({
          user_id: userId,
          event_id: template.id,
          category: template.category,
          title,
          body,
          route: template.route ?? null,
          payload: payload as Json,
          important: template.important ?? false,
          is_read: false,
        })
        .select()
        .single();

      if (error) throw error;
      if (!notification) return;

      await this.fanOut(template.channels, notification, payload);
    } catch (error) {
      logger.error('Failed to raise notification', error, { eventId, userId });
    }
  },

  /** Raise the same event for several users (committee alerts, broadcasts). */
  async raiseMany(
    eventId: string,
    userIds: string[],
    payload: NotificationPayload = {},
  ): Promise<void> {
    await Promise.all(userIds.map((userId) => this.raise(eventId, userId, payload)));
  },

  /**
   * Deliver on every channel the template asks for that is also switched on.
   * A disabled channel is skipped silently — that is the intended MVP state for
   * email, SMS and WhatsApp.
   */
  async fanOut(
    channels: NotificationChannel[],
    notification: NotificationRow,
    payload: NotificationPayload,
  ): Promise<DeliveryResult[]> {
    const active = channels.filter((channel) => ENABLED_CHANNELS[channel]);
    if (active.length === 0) return [];

    // Contact details for the non-in-app transports.
    let email: string | null = null;
    let phone: string | null = null;
    if (active.some((channel) => channel !== 'in_app')) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, phone')
        .eq('id', notification.user_id)
        .maybeSingle();
      email = profile?.email ?? null;
      phone = profile?.phone ?? null;
    }

    const message: NotificationMessage = {
      notificationId: notification.id,
      userId: notification.user_id,
      title: notification.title,
      body: notification.body,
      email,
      phone,
      payload,
    };

    return Promise.all(
      active.map(async (channel) => {
        const transport = TRANSPORTS[channel];
        try {
          return await transport.send(message);
        } catch (error) {
          logger.error(`Transport ${channel} threw`, error);
          return {
            channel,
            status: 'failed' as const,
            error: error instanceof Error ? error.message : 'unknown',
          };
        }
      }),
    );
  },

  /* ---------------------------------------------------------------------- */
  /* Reading                                                                 */
  /* ---------------------------------------------------------------------- */

  async list(userId: string, limit = 50): Promise<NotificationRow[]> {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data ?? [];
  },

  async unreadCount(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);

    if (error) throw error;
    return count ?? 0;
  },

  async markRead(notificationId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId);
    if (error) throw error;
  },

  async markAllRead(userId: string): Promise<void> {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('is_read', false);
    if (error) throw error;
  },
};

export * from './channels';
