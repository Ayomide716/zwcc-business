import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useToast } from '@/providers/ToastProvider';
import { profileService } from '@/services/profile.service';
import { spacing } from '@/theme';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      /*
        Deep link back into the app so the reset completes on the phone.

        `/reset-password`, not `/(auth)/reset-password`: the parentheses are an
        Expo Router grouping that organises files, and they are not part of the
        URL a link has to match. They also have to survive Supabase's redirect
        allow-list, which compares the value literally.
      */
      const redirectTo = Linking.createURL('/reset-password');
      await profileService.requestPasswordReset(email, redirectTo);
      setSent(true);
    } catch (caught) {
      toast.error(caught, 'Could not send the reset link');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen background="surface" contentContainerStyle={styles.content}>
      <ScreenHeader
        title="Reset your password"
        subtitle="We will email you a link to set a new password."
        showBack
      />

      {sent ? (
        <View style={styles.sent}>
          <Banner
            tone="success"
            title="Check your email"
            message={`If an account exists for ${email.trim()}, we have sent a password reset link. It expires in one hour.`}
          />
          <Button label="Back to sign in" onPress={() => router.replace('/(auth)/sign-in')} fullWidth />
        </View>
      ) : (
        <View style={styles.form}>
          <TextField
            label="Email address"
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setError(null);
            }}
            keyboardType="email-address"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            placeholder="you@example.com"
            error={error}
            required
            onSubmitEditing={handleSubmit}
            returnKeyType="send"
          />

          <Button
            label="Send reset link"
            onPress={handleSubmit}
            loading={submitting}
            fullWidth
            size="lg"
          />

          <Text variant="caption" muted>
            For your security we send the same confirmation whether or not an account exists for
            that address.
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
  },
  form: {
    gap: spacing.base,
  },
  sent: {
    gap: spacing.lg,
  },
});
