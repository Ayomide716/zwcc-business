/**
 * Applicant tab navigation.
 *
 * The tab set is deliberately small — dashboard, application, monitoring,
 * notifications, profile — because the applicant's mental model is "where is my
 * application up to, and what do I do next?".
 */
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandIcon } from '@/components/brand/Icon';
import { Text } from '@/components/ui/Text';
import { useUnreadCount } from '@/hooks/queries';
import { ProfileUnavailable } from '@/components/app';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radius, spacing, typography } from '@/theme';
import { ROLE_HOME_ROUTE } from '@/types/roles';

function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;

  return (
    <View style={styles.badge} accessibilityLabel={`${count} unread notifications`}>
      <Text variant="caption" color="textInverse" style={styles.badgeText}>
        {count > 9 ? '9+' : count}
      </Text>
    </View>
  );
}

/** Tab bar height excluding the system inset, which is added at runtime. */
const TAB_BAR_CONTENT_HEIGHT = 60;

export default function ApplicantLayout() {
  const { isAuthenticated, role, loadingProfile, profileError } = useAuth();

  // Asked for here, not at the root: by this point the person is using the app.
  usePushNotifications();
  const insets = useSafeAreaInsets();
  const { data: unreadCount = 0 } = useUnreadCount();

  if (!isAuthenticated) return <Redirect href="/(auth)/sign-in" />;

  // Wait for the role rather than guessing; a staff member should never briefly
  // see the applicant shell.
  // A failed profile fetch would otherwise leave this layout rendering nothing
  // forever — a blank screen the user cannot escape.
  if (profileError && !loadingProfile) return <ProfileUnavailable />;
  if (loadingProfile || !role) return null;

  if (role !== 'applicant') return <Redirect href={ROLE_HOME_ROUTE[role] as never} />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: [
          styles.tabBar,
          {
            height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
            paddingBottom: insets.bottom + spacing.xs,
          },
        ],
        tabBarLabelStyle: typography.caption,
        tabBarHideOnKeyboard: Platform.OS === 'android',
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <BrandIcon name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="application"
        options={{
          title: 'Application',
          tabBarIcon: ({ color, size }) => (
            <BrandIcon name="application" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="monitoring"
        options={{
          title: 'Reports',
          tabBarIcon: ({ color, size }) => (
            <BrandIcon name="reports" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Updates',
          tabBarIcon: ({ color, size }) => (
            <View>
              <BrandIcon name="updates" size={size} color={color} />
              <UnreadBadge count={unreadCount} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <BrandIcon name="person" size={size} color={color} />
          ),
        }}
      />
      {/* Reached from the dashboard, not the tab bar. */}
      <Tabs.Screen name="documents" options={{ href: null }} />
      <Tabs.Screen name="agreement" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
});
