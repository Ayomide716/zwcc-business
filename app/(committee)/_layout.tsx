/**
 * Committee and admin share this shell — an administrator has every committee
 * capability plus management, so they get the same review surface with an extra
 * "Admin" tab.
 */
import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { Platform, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProfileUnavailable } from '@/components/app';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAuth } from '@/providers/AuthProvider';
import { isStaff } from '@/config/permissions.config';
import { colors, spacing, typography } from '@/theme';
import { ROLE_HOME_ROUTE } from '@/types/roles';

/** Tab bar height excluding the system inset, which is added at runtime. */
const TAB_BAR_CONTENT_HEIGHT = 60;

export default function CommitteeLayout() {
  const { isAuthenticated, role, loadingProfile, profileError } = useAuth();

  // Asked for here, not at the root: by this point the person is using the app.
  usePushNotifications();
  const insets = useSafeAreaInsets();

  if (!isAuthenticated) return <Redirect href="/(auth)/sign-in" />;
  // A failed profile fetch would otherwise leave this layout rendering nothing
  // forever — a blank screen the user cannot escape.
  if (profileError && !loadingProfile) return <ProfileUnavailable />;
  if (loadingProfile || !role) return null;

  // An applicant who somehow reaches this URL is sent home. RLS would refuse
  // the queries anyway; this keeps the experience coherent.
  if (!isStaff(role)) return <Redirect href={ROLE_HOME_ROUTE[role] as never} />;

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
          title: 'Overview',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="applications"
        options={{
          title: 'Applications',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="documents-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="beneficiaries"
        options={{
          title: 'Beneficiaries',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
  },
});
