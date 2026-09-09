/**
 * Completes a password reset.
 *
 * Reached from the emailed deep link. Supabase's PKCE flow puts a `code` in the
 * link which must be exchanged for a session before the password can be
 * changed — that exchange is what proves the user owns the mailbox.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Banner, LoadingState } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { logger } from '@/lib/logger';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/providers/ToastProvider';
import { profileService } from '@/services/profile.service';
import { spacing } from '@/theme';

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordScreen() {
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ code?: string }>();

  const [exchanging, setExchanging] = useState(true);
  const [linkValid, setLinkValid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;

    async function exchange() {
      // No code means the screen was opened directly rather than from the email.
      if (!params.code) {
        // A session may already exist if the link was handled by the auth
        // listener before this screen mounted.
        const { data } = await supabase.auth.getSession();
        if (!cancelled) {
          setLinkValid(Boolean(data.session));
          setExchanging(false);
        }
        return;
      }

      try {
        const { error } = await supabase.auth.exchangeCodeForSession(params.code);
        if (error) throw error;
        if (!cancelled) setLinkValid(true);
      } catch (error) {
        logger.error('Password reset code exchange failed', error);
        if (!cancelled) setLinkValid(false);
      } finally {
        if (!cancelled) setExchanging(false);
      }
    }

    void exchange();
    return () => {
      cancelled = true;
    };
  }, [params.code]);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (password !== confirmPassword) {
      next.confirmPassword = 'Both passwords must match.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;

    setSubmitting(true);
    try {
      await profileService.updatePassword(password);
      toast.success('Password updated', 'You can now use your new password.');
      router.replace('/');
    } catch (error) {
      toast.error(error, 'Could not update your password');
    } finally {
      setSubmitting(false);
    }
  }

  if (exchanging) {
    return (
      <Screen background="surface">
        <LoadingState message="Checking your reset link…" />
      </Screen>
    );
  }

  return (
    <Screen background="surface" contentContainerStyle={styles.content}>
      <ScreenHeader title="Set a new password" showBack />

      {!linkValid ? (
        <View style={styles.form}>
          <Banner
            tone="danger"
            title="This link is no longer valid"
            message="Password reset links expire after one hour and can only be used once. Please request a new one."
          />
          <Button
            label="Request a new link"
            onPress={() => router.replace('/(auth)/forgot-password')}
            fullWidth
          />
        </View>
      ) : (
        <View style={styles.form}>
          <TextField
            label="New password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            textContentType="newPassword"
            helpText={`At least ${MIN_PASSWORD_LENGTH} characters.`}
            error={errors.password}
            required
          />

          <TextField
            label="Confirm new password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
            error={errors.confirmPassword}
            required
          />

          <Button
            label="Update password"
            onPress={handleSubmit}
            loading={submitting}
            fullWidth
            size="lg"
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
  },
  form: {
    gap: spacing.base,
  },
});
