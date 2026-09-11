/**
 * Submission confirmation (brief §12).
 *
 * The registration code is the point of this screen, so it is given the most
 * visual weight after the confirmation itself.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

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

  // Submitting is the emotional peak of the whole app — months of a business
  // idea turned into a request for help. It deserves more than a navigation.
  const pop = useRef(new Animated.Value(0)).current;
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.sequence([
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }),
      Animated.timing(rise, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [pop, rise]);

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
        <Animated.View
          style={[
            styles.successRing,
            {
              opacity: pop,
              transform: [
                { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
              ],
            },
          ]}
        >
          <LogoMark size={56} />
        </Animated.View>

        <Animated.View
          style={{
            opacity: rise,
            transform: [
              { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
            ],
          }}
        >
          <Text variant="display" align="center" accessibilityRole="header">
            Application submitted
          </Text>
          <Text variant="body" muted align="center" style={styles.heroBody}>
            Thank you. We have received your application and our team will begin verifying your
            details and documents.
          </Text>
        </Animated.View>
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
  heroBody: {
    marginTop: spacing.sm,
  },
  content: {
    paddingHorizontal: spacing.lg,
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
