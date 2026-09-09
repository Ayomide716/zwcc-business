/**
 * Administration is a stack pushed on top of the staff shell rather than
 * another tab bar — administrators spend most of their time in the review
 * surface and dip into management occasionally.
 */
import { Redirect, Stack } from 'expo-router';

import { ProfileUnavailable } from '@/components/app';
import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';
import { ROLE_HOME_ROUTE } from '@/types/roles';

export default function AdminLayout() {
  const { isAuthenticated, role, loadingProfile, profileError } = useAuth();

  if (!isAuthenticated) return <Redirect href="/(auth)/sign-in" />;
  // A failed profile fetch would otherwise leave this layout rendering nothing
  // forever — a blank screen the user cannot escape.
  if (profileError && !loadingProfile) return <ProfileUnavailable />;
  if (loadingProfile || !role) return null;
  if (role !== 'admin') return <Redirect href={ROLE_HOME_ROUTE[role] as never} />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
