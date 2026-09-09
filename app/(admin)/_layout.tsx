/**
 * Administration is a stack pushed on top of the staff shell rather than
 * another tab bar — administrators spend most of their time in the review
 * surface and dip into management occasionally.
 */
import { Redirect, Stack } from 'expo-router';

import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';
import { ROLE_HOME_ROUTE } from '@/types/roles';

export default function AdminLayout() {
  const { isAuthenticated, role, loadingProfile } = useAuth();

  if (!isAuthenticated) return <Redirect href="/(auth)/sign-in" />;
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
