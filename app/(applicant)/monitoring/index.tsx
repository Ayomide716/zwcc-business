/**
 * Beneficiary monitoring timeline (brief §18).
 *
 * Twelve months, each showing whether the report is upcoming, due, overdue,
 * submitted or reviewed. The schedule is derived from configuration, so
 * changing the cadence re-shapes this screen for everyone with no backfill.
 */
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { MonitoringTimeline } from '@/components/app';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { OnboardingArt } from '@/components/brand/OnboardingArt';
import { Banner, EmptyState, LoadingState } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { ProgressBar } from '@/components/ui/Progress';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useMonitoringOverview, useMyBeneficiary } from '@/hooks/queries';
import { formatDateShort } from '@/lib/format';
import { spacing } from '@/theme';

export default function MonitoringScreen() {
  const router = useRouter();

  const { data: beneficiary, isLoading } = useMyBeneficiary();
  const {
    data: overview,
    isLoading: loadingOverview,
    refetch,
    isRefetching,
  } = useMonitoringOverview(beneficiary?.id);

  if (isLoading || loadingOverview) {
    return (
      <Screen>
        <LoadingState message="Loading your reports…" />
      </Screen>
    );
  }

  if (!beneficiary || !overview) {
    return (
      <Screen>
        <ScreenHeader eyebrow="Beneficiary" title="Monthly reports" />
        <EmptyState
          illustration={<OnboardingArt name="reports" size={168} />}
          title="Reporting has not started"
          message="Once your grant has been approved, signed for and released, you will submit a short business progress report here each month for twelve months."
        />
      </Screen>
    );
  }

  const { periods, submittedCount, totalPeriods, actionablePeriod } = overview;
  const overdue = periods.filter((period) => period.status === 'overdue');

  return (
    <Screen
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
      footer={
        actionablePeriod ? (
          <Button
            label={`Submit ${actionablePeriod.label.toLowerCase()} report`}
            onPress={() =>
              router.push(`/(applicant)/monitoring/${actionablePeriod.periodNumber}`)
            }
            fullWidth
            size="lg"
            icon="create-outline"
          />
        ) : undefined
      }
    >
      <ScreenHeader
        title="Monthly reports"
        subtitle={`Your monitoring year runs to ${formatDateShort(beneficiary.monitoring_ends_at)}.`}
      />

      {overdue.length > 0 ? (
        <Banner
          tone="danger"
          title={overdue.length === 1 ? 'A report is overdue' : `${overdue.length} reports are overdue`}
          message="Please submit as soon as you can. Missing reports affect the assessment of your grant."
        />
      ) : null}

      <Card style={styles.summary}>
        <ProgressBar
          value={totalPeriods === 0 ? 0 : submittedCount / totalPeriods}
          label={`${submittedCount} of ${totalPeriods} reports submitted`}
          showPercentage
          tone={submittedCount === totalPeriods ? 'success' : 'brand'}
        />

        <Text variant="callout" muted>
          Each report takes a few minutes. Tell us how the business is going, what went well, what
          was difficult, and attach a few photos or a short video.
        </Text>
      </Card>

      <View style={styles.timeline}>
        <Text variant="label" muted style={styles.timelineHeading}>
          YOUR TWELVE MONTHS
        </Text>

        <MonitoringTimeline
          periods={periods}
          onSelectPeriod={(period) =>
            router.push(`/(applicant)/monitoring/${period.periodNumber}`)
          }
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  timeline: {
    gap: spacing.md,
  },
  timelineHeading: {
    marginBottom: spacing.xs,
  },
});
