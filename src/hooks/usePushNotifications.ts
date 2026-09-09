/**
 * Registers the device for push, and routes a tapped notification.
 *
 * Mounted once, in the applicant and staff shells rather than at the root, so
 * permission is asked for by an app the person is already using — not by a
 * sign-in screen they have not got past yet. An app that asks on first launch
 * gets a permanent "no" far more often.
 *
 * A tapped notification carries the route the in-app notification list would
 * have used, so both paths land in the same place with no second mapping to
 * keep in step.
 */
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

import { logger } from '@/lib/logger';
import { useAuth } from '@/providers/AuthProvider';
import { pushService } from '@/services/push.service';

export function usePushNotifications() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const registeredFor = useRef<string | null>(null);

  /* Registration, once per signed-in user. */
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (registeredFor.current === user.id) return;

    registeredFor.current = user.id;
    void pushService.register(user.id);
  }, [isAuthenticated, user]);

  /* Tapping a notification opens the thing it is about. */
  useEffect(() => {
    function open(response: Notifications.NotificationResponse) {
      const data = response.notification.request.content.data as { route?: string } | undefined;
      const route = data?.route;
      if (typeof route === 'string' && route.startsWith('/')) {
        router.push(route as never);
      }
    }

    const subscription = Notifications.addNotificationResponseReceivedListener(open);

    // A notification tapped while the app was closed is not delivered to the
    // listener above — it is waiting in the last response instead.
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) open(response);
      })
      .catch((error) => logger.warn('Could not read the launch notification', { error }));

    return () => subscription.remove();
  }, [router]);
}
