/**
 * Submission confirmation (brief §12).
 *
 * The registration code is the point of this screen, so it is given the most
 * visual weight after the confirmation itself.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { RegistrationCodeCard } from '@/components/app';
import { LogoMark } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { ORGANISATION } from '@/config/program.config';
import { useToast } from '@/providers/ToastProvider';
import { colors, radius, spacing } from '@/theme';
import * as Haptics from 'expo-haptics';

export default function SubmittedScreen() {
  const router = useRouter();
  const toast = useToast();
  const { code } = useLocalSearchParams<{ code?: string }>();

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  return (
    <Screen
      background="surface"
      contentContainerStyle={styles.content}
      footer={
        <Button
          label="Go to my dashboard"
          onPress={() => router.replace('/(applicant)/dashboard')}
          fullWidth
          size="lg"
        />
      }
    >
      <View style={styles.hero}>
        <View style={styles.successRing}>
          <LogoMark size={56} />
        </View>

        <Text variant="display" align="center" accessibilityRole="header">
          Application submitted
        </Text>
        <Text variant="body" muted align="center">
          Thank you. We have received your application and our team will begin verifying your
          details and documents.
        </Text>
      </View>

      {code ? <RegistrationCodeCard code={code} onCopied={() => toast.success('Code copied')} /> : null}

      <Card variant="flat" style={styles.next}>
        <Text variant="label">What happens next</Text>

        {[
          'We verify your details and the documents you uploaded.',
          'The Grant Committee reviews your business proposal.',
          'We notify you of the decision in the app, by email and by SMS.',
          'If approved, you review and sign your grant agreement.',
        ].map((line, index) => (
          <View key={line} style={styles.nextRow}>
            <View style={styles.nextNumber}>
              <Text variant="caption" color="brand" weight="700">
                {index + 1}
              </Text>
            </View>
            <Text variant="callout" muted style={styles.nextText}>
              {line}
            </Text>
          </View>
        ))}
      </Card>

      <Text variant="caption" muted align="center">
        Questions? Contact {ORGANISATION.supportEmail}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    gap: spacing.xl,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.md,
  },
  successRing: {
    width: 104,
    height: 104,
    borderRadius: radius.pill,
    backgroundColor: colors.successSurface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  next: {
    gap: spacing.md,
    backgroundColor: colors.brandSurface,
  },
  nextRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  nextNumber: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextText: {
    flex: 1,
  },
});
