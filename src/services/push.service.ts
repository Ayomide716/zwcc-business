/**
 * Push notifications.
 *
 * In-app notifications only reach someone who opens the app. A decision on a
 * grant application, a document that needs re-uploading, or a monthly report
 * falling due are all things an applicant needs to know without checking — so
 * this registers the device with Expo's push service and stores the resulting
 * token against the signed-in user.
 *
 * Three things are deliberate here.
 *
 * Permission is requested lazily, not on first launch. Being asked to allow
 * notifications by an app you have not yet used is the fastest way to get a
 * permanent "no"; this is called once the user has an application in progress,
 * when the reason is obvious.
 *
 * Failure is never fatal. Every path returns rather than throws: a phone that
 * refuses permission, an emulator with no push support, or a build without an
 * EAS project id must all still run the app normally. Push is an enhancement
 * on top of the in-app notification list, which remains the source of truth.
 *
 * Tokens are stored one row per device, keyed by the token itself, so
 * re-registering updates rather than accumulating duplicates that would each
 * deliver their own copy of every message.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { logger } from '@/lib/logger';
import { supabase } from '@/lib/supabase';

/**
 * Android notification channels. The push sender addresses these by id, so the
 * names are a contract between this file and `supabase/functions/send-push`.
 */
export const ALERT_CHANNEL = 'alerts';
export const UPDATE_CHANNEL = 'updates';

/** Where a tapped notification should land, mirroring `notifications.config`. */
export interface PushPayload {
  route?: string;
  applicationId?: string;
}

/**
 * How a notification behaves while the app is open.
 *
 * Shown rather than swallowed: the alternative is a banner arriving silently
 * while someone is on the dashboard, and then no sign it ever happened.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

function getProjectId(): string | null {
  // Written into the config by `eas init` at build time. A local run without
  // it is normal, and must not be an error.
  const fromExpo = Constants.expoConfig?.extra?.eas?.projectId;
  const fromEas = (Constants.easConfig as { projectId?: string } | undefined)?.projectId;
  return (typeof fromExpo === 'string' && fromExpo) || (typeof fromEas === 'string' && fromEas)
    ? ((fromExpo as string) ?? fromEas!)
    : null;
}

export const pushService = {
  /**
   * Ask for permission, get a token, store it.
   *
   * Returns the token when everything worked and null in every other case,
   * including permission being declined. Callers should not care which.
   */
  async register(userId: string): Promise<string | null> {
    // A simulator has no push service to register with.
    if (!Device.isDevice) return null;

    const projectId = getProjectId();
    if (!projectId) {
      logger.warn('No EAS project id; skipping push registration');
      return null;
    }

    try {
      // Android needs a channel or notifications arrive silently and without
      // the brand colour.
      //
      // Two of them, because importance is what decides whether a notification
      // interrupts. Only HIGH and above produce the banner that slides over
      // whatever is on screen; DEFAULT puts the notification in the shade with
      // a sound and nothing more, which is easy to miss entirely. A decision on
      // a grant application should interrupt. A routine update should not.
      //
      // The ids are new rather than a raised 'default', because Android ignores
      // an attempt to increase the importance of a channel that already exists
      // — only the person holding the phone may do that. A device that already
      // created the old channel would otherwise keep its quiet behaviour
      // forever.
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(ALERT_CHANNEL, {
          name: 'Decisions and actions needed',
          description: 'Application decisions, documents to re-upload, reports falling due.',
          importance: Notifications.AndroidImportance.HIGH,
          lightColor: '#0B2545',
          vibrationPattern: [0, 250, 250, 250],
        });

        await Notifications.setNotificationChannelAsync(UPDATE_CHANNEL, {
          name: 'Progress updates',
          description: 'Confirmations and progress on an application already under way.',
          importance: Notifications.AndroidImportance.DEFAULT,
          lightColor: '#0B2545',
        });
      }

      const existing = await Notifications.getPermissionsAsync();
      let granted = existing.granted;

      if (!granted && existing.canAskAgain) {
        const requested = await Notifications.requestPermissionsAsync();
        granted = requested.granted;
      }

      if (!granted) return null;

      const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
      if (!token) return null;

      await this.storeToken(userId, token);
      return token;
    } catch (error) {
      // An unreachable push service, a revoked permission, a device without
      // Google Play — none of these should interrupt anyone's application.
      logger.warn('Push registration failed; continuing without push', { error });
      return null;
    }
  },

  /** Upsert this device's token. RLS confines the write to the caller's own row. */
  async storeToken(userId: string, token: string): Promise<void> {
    const { error } = await supabase.from('device_tokens').upsert(
      {
        user_id: userId,
        token,
        platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
        is_active: true,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    );

    if (error) logger.warn('Could not store push token', { error });
  },

  /**
   * Stop delivering to this device.
   *
   * Called on sign-out. Without it, the next person to sign in on a shared
   * phone — which is common — would keep receiving the previous user's
   * notifications.
   */
  async deactivate(token: string): Promise<void> {
    const { error } = await supabase
      .from('device_tokens')
      .update({ is_active: false })
      .eq('token', token);

    if (error) logger.warn('Could not deactivate push token', { error });
  },

  /** The token this device already holds, without prompting for permission. */
  async getExistingToken(): Promise<string | null> {
    if (!Device.isDevice) return null;
    const projectId = getProjectId();
    if (!projectId) return null;

    try {
      const permission = await Notifications.getPermissionsAsync();
      if (!permission.granted) return null;
      const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
      return data ?? null;
    } catch {
      return null;
    }
  },
};
