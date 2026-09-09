/**
 * In-app notifications (brief §20).
 *
 * In-app is the live channel for the MVP; email, SMS and WhatsApp transports
 * queue deliveries server-side. Everything here reads from the same
 * `notifications` table those transports fan out from.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, SkeletonList } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { NOTIFICATION_CATEGORY_LABELS } from '@/config/notifications.config';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from '@/hooks/queries';
import { formatRelative } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import type { NotificationRow } from '@/types/database';

const CATEGORY_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  application: 'document-text-outline',
  document: 'folder-open-outline',
  agreement: 'document-lock-outline',
  monitoring: 'bar-chart-outline',
  account: 'person-circle-outline',
};

export default function NotificationsScreen() {
  const router = useRouter();

  const { data: items = [], isLoading, refetch, isRefetching } = useNotifications();
  const { data: unreadCount = 0 } = useUnreadCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  function handlePress(item: NotificationRow) {
    if (!item.is_read) markRead.mutate(item.id);
    if (item.route) router.push(item.route as never);
  }

  return (
    <Screen onRefresh={() => void refetch()} refreshing={isRefetching}>
      <ScreenHeader
        title="Updates"
        subtitle={
          unreadCount > 0
            ? `${unreadCount} unread`
            : 'Notifications about your application appear here.'
        }
        right={
          unreadCount > 0 ? (
            <Button
              label="Mark all read"
              variant="ghost"
              size="sm"
              onPress={() => markAllRead.mutate()}
              loading={markAllRead.isPending}
            />
          ) : undefined
        }
      />

      {isLoading ? (
        <SkeletonList count={4} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="Nothing yet"
          message="We will let you know as soon as there is news about your application."
        />
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <Card
              key={item.id}
              variant="outlined"
              onPress={() => handlePress(item)}
              accessibilityLabel={`${item.is_read ? '' : 'Unread. '}${item.title}. ${item.body}`}
              style={[styles.item, !item.is_read && styles.itemUnread]}
            >
              <View
                style={[
                  styles.icon,
                  item.important && !item.is_read && styles.iconImportant,
                ]}
              >
                <Ionicons
                  name={CATEGORY_ICONS[item.category] ?? 'notifications-outline'}
                  size={18}
                  color={item.important && !item.is_read ? colors.dangerStrong : colors.brand}
                />
              </View>

              <View style={styles.body}>
                <View style={styles.titleRow}>
                  <Text
                    variant={item.is_read ? 'body' : 'bodyMedium'}
                    numberOfLines={2}
                    style={styles.title}
                  >
                    {item.title}
                  </Text>
                  {!item.is_read ? <View style={styles.unreadDot} /> : null}
                </View>

                <Text variant="callout" muted>
                  {item.body}
                </Text>

                <Text variant="caption" muted>
                  {NOTIFICATION_CATEGORY_LABELS[
                    item.category as keyof typeof NOTIFICATION_CATEGORY_LABELS
                  ] ?? item.category}{' '}
                  · {formatRelative(item.created_at)}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  itemUnread: {
    backgroundColor: colors.brandSurface,
    borderColor: colors.brandBorder,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSurfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconImportant: {
    backgroundColor: colors.dangerSurface,
  },
  body: {
    flex: 1,
    gap: spacing.xxs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
  },
});
