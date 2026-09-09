/**
 * Entry route. Decides where the user belongs and redirects.
 *
 * All role-based routing happens here rather than being scattered through
 * layouts, so there is one place to read to understand who lands where.
 */
import { Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ProfileUnavailable } from '@/components/app';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { LoadingState } from '@/components/ui/Feedback';
import { Text } from '@/components/ui/Text';
import { ORGANISATION } from '@/config/program.config';
import { useAuth } from '@/providers/AuthProvider';
import { colors, spacing } from '@/theme';
import { ROLE_HOME_ROUTE } from '@/types/roles';

export default function Index() {
  const { isAuthenticated, role, loadingProfile, profile, profileError, isSupabaseConfigured } =
    useAuth();
  const insets = useSafeAreaInsets();

  /* Misconfigured build: say so clearly instead of failing with a network error. */
  if (!isSupabaseConfigured) {
    return <SetupRequired />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  // Signed in, but the profile could not be fetched. Offer a way out rather
  // than spinning forever.
  if (profileError && !loadingProfile) {
    return <ProfileUnavailable />;
  }

  // Signed in, but the profile (and therefore the role) is still loading.
  if (loadingProfile || !role) {
    return (
      <View style={styles.page}>
        <StatusBarBand height={insets.top} />
        <View style={styles.container}>
          <LoadingState message="Preparing your account…" />
        </View>
      </View>
    );
  }

  // First-time applicants see onboarding before the dashboard.
  if (role === 'applicant' && !profile?.onboarding_completed_at) {
    return <Redirect href="/(onboarding)" />;
  }

  return <Redirect href={ROLE_HOME_ROUTE[role] as never} />;
}

/**
 * Shown when `.env` has not been filled in. This is a developer-facing state,
 * but it is written for whoever is holding the phone.
 */
/** The navy band every other screen carries, so light status icons stay legible. */
function StatusBarBand({ height }: { height: number }) {
  return <View style={[styles.statusBarBand, { height }]} />;
}

function SetupRequired() {
  return (
    <View style={styles.setup}>
      <Logo size={64} layout="vertical" showProgramme />

      <View style={styles.setupBody}>
        <Text variant="title2" align="center">
          Setup required
        </Text>
        <Text variant="body" muted align="center">
          This build has not been connected to a Supabase project yet. Copy{' '}
          <Text variant="bodyMedium">.env.example</Text> to{' '}
          <Text variant="bodyMedium">.env</Text>, add your project URL and anon key, then
          restart the app.
        </Text>
        <Text variant="caption" muted align="center">
          Need help? Contact {ORGANISATION.supportEmail}
        </Text>
      </View>

      <Button
        label="Read the setup guide"
        variant="outline"
        onPress={() => {}}
        accessibilityHint="See supabase/README.md in the project repository"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
  },
  statusBarBand: {
    backgroundColor: colors.brand,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
  setup: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.xl,
  },
  setupBody: {
    gap: spacing.md,
    maxWidth: 340,
  },
});
