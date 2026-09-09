import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { GRANT_PROGRAM } from '@/config/program.config';
import { useToast } from '@/providers/ToastProvider';
import { profileService } from '@/services/profile.service';
import { colors, spacing } from '@/theme';

export default function SignInScreen() {
  const router = useRouter();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  function validate(): boolean {
    const next: typeof errors = {};
    if (!email.trim()) next.email = 'Enter your email address.';
    if (!password) next.password = 'Enter your password.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSignIn() {
    if (!validate()) return;

    setSubmitting(true);
    try {
      await profileService.signIn({ email, password });
      // The auth listener updates state; `/` then routes by role.
      router.replace('/');
    } catch (error) {
      toast.error(error, 'Could not sign in');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen background="surface" contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Logo size={64} layout="vertical" showProgramme />
      </View>

      <View style={styles.intro}>
        <Text variant="display" align="center">
          Welcome back
        </Text>
        <Text variant="body" muted align="center">
          Sign in to continue your {GRANT_PROGRAM.name} application.
        </Text>
      </View>

      <View style={styles.form}>
        <TextField
          label="Email address"
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            setErrors((current) => ({ ...current, email: undefined }));
          }}
          keyboardType="email-address"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          placeholder="you@example.com"
          error={errors.email}
          required
        />

        <TextField
          label="Password"
          value={password}
          onChangeText={(text) => {
            setPassword(text);
            setErrors((current) => ({ ...current, password: undefined }));
          }}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoComplete="current-password"
          textContentType="password"
          placeholder="Your password"
          error={errors.password}
          required
          onSubmitEditing={handleSignIn}
          returnKeyType="go"
        />

        <View style={styles.row}>
          <Button
            label={showPassword ? 'Hide password' : 'Show password'}
            variant="ghost"
            size="sm"
            onPress={() => setShowPassword((current) => !current)}
            icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
            style={styles.ghostButton}
          />

          <Link href="/(auth)/forgot-password" asChild>
            <Text variant="label" color="brand" accessibilityRole="link">
              Forgot password?
            </Text>
          </Link>
        </View>

        <Button
          label="Sign in"
          onPress={handleSignIn}
          loading={submitting}
          fullWidth
          size="lg"
        />
      </View>

      <View style={styles.footer}>
        <Text variant="callout" muted>
          New to the grant programme?
        </Text>
        <Link href="/(auth)/sign-up" asChild>
          <Text variant="bodyMedium" color="brand" accessibilityRole="link">
            Create an account
          </Text>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    gap: spacing.xl,
  },
  header: {
    alignItems: 'center',
    paddingTop: spacing.lg,
  },
  intro: {
    gap: spacing.xs,
  },
  form: {
    gap: spacing.base,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  ghostButton: {
    paddingHorizontal: 0,
  },
  footer: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
});
