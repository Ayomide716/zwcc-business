import * as Linking from 'expo-linking';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { Banner } from '@/components/ui/Feedback';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useToast } from '@/providers/ToastProvider';
import { profileService } from '@/services/profile.service';
import { colors, spacing } from '@/theme';

/** Minimum that is defensible without being hostile to type on a phone. */
const MIN_PASSWORD_LENGTH = 8;

export default function SignUpScreen() {
  const router = useRouter();
  const toast = useToast();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const next: Record<string, string> = {};

    if (fullName.trim().length < 3) {
      next.fullName = 'Enter your full name as it appears on your ID.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    if (!/^(\+?234|0)[789]\d{9}$/.test(phone.replace(/[\s()-]/g, ''))) {
      next.phone = 'Enter a valid Nigerian phone number, e.g. 08031234567.';
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
    }
    if (password !== confirmPassword) {
      next.confirmPassword = 'Both passwords must match.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSignUp() {
    if (!validate()) return;

    setSubmitting(true);
    try {
      const result = await profileService.signUp({
        email,
        password,
        fullName,
        phone,
        // Sends a confirmation email back into the app rather than to whatever
        // the project's Site URL happens to be.
        redirectTo: Linking.createURL('/sign-in'),
      });

      // Supabase returns a user without a session when email confirmation is on.
      if (result.session) {
        router.replace('/');
      } else {
        setNeedsConfirmation(true);
      }
    } catch (error) {
      toast.error(error, 'Could not create your account');
    } finally {
      setSubmitting(false);
    }
  }

  if (needsConfirmation) {
    return (
      <Screen background="surface" contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Logo size={64} layout="vertical" />
        </View>

        <Banner
          tone="success"
          title="Check your email"
          message={`We have sent a confirmation link to ${email.trim()}. Open it to activate your account, then sign in.`}
        />

        <Button label="Go to sign in" onPress={() => router.replace('/(auth)/sign-in')} fullWidth />
      </Screen>
    );
  }

  return (
    <Screen background="surface" contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Logo size={56} layout="vertical" showProgramme />
      </View>

      <View style={styles.intro}>
        <Text variant="display">Create your account</Text>
        <Text variant="body" muted>
          You only need an account to apply. Membership of the church is not required.
        </Text>
      </View>

      <View style={styles.form}>
        <TextField
          label="Full name"
          value={fullName}
          onChangeText={setFullName}
          placeholder="As written on your ID"
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          error={errors.fullName}
          required
        />

        <TextField
          label="Email address"
          value={email}
          onChangeText={setEmail}
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
          label="Phone number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          inputMode="tel"
          autoComplete="tel"
          placeholder="080 0000 0000"
          helpText="We use this for SMS and WhatsApp updates about your application."
          error={errors.phone}
          required
        />

        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          helpText={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          error={errors.password}
          required
        />

        <TextField
          label="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoComplete="new-password"
          error={errors.confirmPassword}
          required
        />

        <Button
          label={showPassword ? 'Hide passwords' : 'Show passwords'}
          variant="ghost"
          size="sm"
          onPress={() => setShowPassword((current) => !current)}
          icon={showPassword ? 'eye-off-outline' : 'eye-outline'}
          style={styles.ghostButton}
        />

        <Text variant="caption" muted>
          By creating an account you agree to our{' '}
          <Link href="/legal/terms" asChild>
            <Text variant="caption" color="brand" accessibilityRole="link">
              Terms &amp; Conditions
            </Text>
          </Link>{' '}
          and{' '}
          <Link href="/legal/privacy" asChild>
            <Text variant="caption" color="brand" accessibilityRole="link">
              Privacy Policy
            </Text>
          </Link>
          .
        </Text>

        <Button
          label="Create account"
          onPress={handleSignUp}
          loading={submitting}
          fullWidth
          size="lg"
        />
      </View>

      <View style={styles.footer}>
        <Text variant="callout" muted>
          Already have an account?
        </Text>
        <Link href="/(auth)/sign-in" asChild>
          <Text variant="bodyMedium" color="brand" accessibilityRole="link">
            Sign in
          </Text>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xl,
  },
  header: {
    alignItems: 'center',
  },
  intro: {
    gap: spacing.xs,
  },
  form: {
    gap: spacing.base,
  },
  ghostButton: {
    alignSelf: 'flex-start',
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
