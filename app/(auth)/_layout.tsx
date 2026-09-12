/**
 * Auth stack. Redirects away if the user already has a session, so the back
 * gesture cannot land a signed-in user on the sign-in screen.
 *
 * Setting a new password is the exception, and it has to be. A recovery link
 * signs the person in — that session is how Supabase proves they own the
 * mailbox — so the blanket redirect fired the moment the link worked and sent
 * them to their dashboard instead of the screen they came to use. The password
 * was never changed and there was no way to reach the screen that changes it.
 */
import { Redirect, Stack, useSegments } from 'expo-router';

import { useAuth } from '@/providers/AuthProvider';
import { colors } from '@/theme';

/** Reachable with a session, because reaching it requires one. */
const ALLOWED_WHILE_SIGNED_IN = ['reset-password'];

export default function AuthLayout() {
  const { isAuthenticated } = useAuth();
  const segments = useSegments();

  const current = segments[segments.length - 1];
  const allowed = ALLOWED_WHILE_SIGNED_IN.includes(current as string);

  if (isAuthenticated && !allowed) return <Redirect href="/" />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.surface },
      }}
    />
  );
}
