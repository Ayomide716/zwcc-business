/**
 * Self-declared eligibility gate (brief §8).
 *
 * These are confirmations, not an assessment — the committee decides. The gate
 * exists so someone does not spend an hour on a form they cannot submit.
 * Criteria come from configuration, so the client can change them freely.
 */
import { Link, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Choice';
import { Banner } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { ELIGIBILITY_CRITERIA, ELIGIBILITY_NOTES, ORGANISATION } from '@/config/program.config';
import { useToast } from '@/providers/ToastProvider';
import { useAuth } from '@/providers/AuthProvider';
import { applicationService } from '@/services/application.service';
import { useInvalidateApplication, useMyApplication } from '@/hooks/queries';
import { colors, spacing } from '@/theme';

export default function EligibilityScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const invalidate = useInvalidateApplication();
  const { data: existingApplication } = useMyApplication();

  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);

  const blockingCriteria = useMemo(
    () => ELIGIBILITY_CRITERIA.filter((criterion) => criterion.blocking),
    [],
  );

  const allConfirmed = blockingCriteria.every((criterion) => confirmed[criterion.id]);

  async function handleStart() {
    if (!user) return;

    // If an application already exists, continue it rather than creating a
    // second one — the database would reject that anyway (§8).
    if (existingApplication) {
      router.replace('/(applicant)/application');
      return;
    }

    setCreating(true);
    try {
      await applicationService.create(user.id);
      invalidate();
      router.replace('/(applicant)/application');
    } catch (error) {
      toast.error(error, 'Could not start your application');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Screen
      background="surface"
      contentContainerStyle={styles.content}
      footer={
        <View style={styles.footer}>
          <Button
            label={existingApplication ? 'Continue my application' : 'Start my application'}
            onPress={handleStart}
            disabled={!allConfirmed}
            loading={creating}
            fullWidth
            size="lg"
            accessibilityHint={
              allConfirmed
                ? undefined
                : 'Confirm every statement above before you can start.'
            }
          />
          <Button
            label="Not now"
            variant="ghost"
            onPress={() => router.replace('/(applicant)/dashboard')}
            fullWidth
          />
        </View>
      }
    >
      <ScreenHeader
        title="Before you begin"
        subtitle="Please confirm each statement so we know the grant is right for you."
      />

      <Banner
        tone="info"
        title="Open to everyone"
        message={`You do not need to be a member of ${ORGANISATION.shortName} to apply.`}
        icon="people-outline"
      />

      <View style={styles.criteria}>
        {ELIGIBILITY_CRITERIA.map((criterion) => (
          <View key={criterion.id}>
            <Checkbox
              label={criterion.label}
              checked={confirmed[criterion.id] ?? false}
              onChange={(checked) =>
                setConfirmed((current) => ({ ...current, [criterion.id]: checked }))
              }
            />
            {criterion.detail ? (
              <Text variant="caption" muted style={styles.criterionDetail}>
                {criterion.detail}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      <Card variant="flat" style={styles.notes}>
        <Text variant="label">Good to know</Text>
        {ELIGIBILITY_NOTES.map((note) => (
          <Text key={note} variant="callout" muted>
            {'•  '}
            {note}
          </Text>
        ))}
      </Card>

      <Text variant="caption" muted>
        Read the full{' '}
        <Link href="/legal/terms" asChild>
          <Text variant="caption" color="brand" accessibilityRole="link">
            Terms &amp; Conditions
          </Text>
        </Link>
        .
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  criteria: {
    gap: spacing.md,
  },
  criterionDetail: {
    marginTop: spacing.xs,
    marginLeft: spacing.xxl,
  },
  notes: {
    gap: spacing.sm,
    backgroundColor: colors.brandSurface,
  },
  footer: {
    gap: spacing.sm,
  },
});
