/**
 * Shown when a user is signed in but their profile could not be loaded.
 *
 * Without this the app has a session but no role, and every role-gated layout
 * renders nothing — a blank screen with no explanation and no way out. On an
 * intermittent connection that is a realistic first-launch experience, so it
 * gets a real recovery path rather than a silent dead end.
 */
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/Feedback';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/providers/AuthProvider';
import { spacing } from '@/theme';

export function ProfileUnavailable() {
  const { profileError, refreshProfile, signOut, loadingProfile } = useAuth();

  return (
    <Screen background="surface">
      <ErrorState
        title="We could not load your account"
        message={
          profileError?.message ??
          'Check your internet connection and try again. Your work is safe.'
        }
        onRetry={() => void refreshProfile()}
        retryable={!loadingProfile}
      />
      <View style={styles.actions}>
        <Button
          label="Sign out and start again"
          variant="ghost"
          onPress={() => void signOut()}
          fullWidth
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: {
    marginTop: spacing.lg,
  },
});
