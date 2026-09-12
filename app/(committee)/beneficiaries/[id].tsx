/**
 * One beneficiary's monitoring year, for staff.
 *
 * This screen did not exist, and its absence was the reason a grant could never
 * end: `complete_grant` was a configured transition with a service behind it
 * and nowhere to call it from, so every funded application sat in 'monitoring'
 * indefinitely. The twelve reports were reviewable one at a time from a flat
 * list, with no place that showed a beneficiary's year as a whole.
 *
 * Completion is deliberately a decision rather than a date. Closing
 * automatically when the monitoring period elapses would close grants where
 * half the reports were never submitted, and record them as finished.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MonitoringTimeline } from '@/components/app';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Banner, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { ListGroup, ListRow } from '@/components/ui/ListRow';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { ProgressBar } from '@/components/ui/Progress';
import { useBeneficiary, useMonitoringOverview } from '@/hooks/queries';
import { formatCurrency, formatDateShort } from '@/lib/format';
import { monitoringService } from '@/services/monitoring.service';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { rhythm, spacing } from '@/theme';

export default function BeneficiaryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { user, profile } = useAuth();

  const beneficiary = useBeneficiary(id);
  const overview = useMonitoringOverview(id);

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const record = beneficiary.data;
  const application = (record as { application?: Record<string, unknown> } | undefined)?.application;

  if (beneficiary.isLoading || overview.isLoading) {
    return (
      <Screen>
        <ScreenHeader title="Beneficiary" showBack />
        <LoadingState message="Loading the monitoring year…" />
      </Screen>
    );
  }

  if (beneficiary.isError || !record || !overview.data) {
    return (
      <Screen>
        <ScreenHeader title="Beneficiary" showBack />
        <ErrorState
          title="Could not load this beneficiary"
          onRetry={() => void beneficiary.refetch()}
        />
      </Screen>
    );
  }

  const { periods, submittedCount, totalPeriods } = overview.data;
  const reviewedCount = periods.filter((period) => period.report?.status === 'reviewed').length;
  const missing = totalPeriods - submittedCount;
  const finished = record.status === 'completed';

  // The year has run its course. Reports may still be missing — that is the
  // reviewer's judgement to make, and the sheet tells them what they are
  // signing off on.
  const yearElapsed = new Date(record.monitoring_ends_at).getTime() <= Date.now();

  async function handleComplete() {
    if (!user || !profile || !record) return;

    setBusy(true);
    try {
      await monitoringService.complete(record, { id: user.id, role: profile.role });
      await Promise.all([beneficiary.refetch(), overview.refetch()]);
      setConfirming(false);
      toast.success('Grant completed', 'The beneficiary has been thanked and notified.');
    } catch (error) {
      toast.error(error, 'Could not complete the grant');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen
      onRefresh={() => {
        void beneficiary.refetch();
        void overview.refetch();
      }}
      refreshing={beneficiary.isRefetching}
      footer={
        finished || !yearElapsed ? undefined : (
          <Button
            label="Complete this grant"
            onPress={() => setConfirming(true)}
            fullWidth
            size="lg"
            icon="checkmark-done-outline"
          />
        )
      }
    >
      <ScreenHeader
        eyebrow="Beneficiary"
        title={(application?.applicant_name as string) ?? 'Beneficiary'}
        subtitle={(application?.business_name as string) ?? undefined}
        showBack
        right={
          <Badge
            label={finished ? 'Completed' : 'Active'}
            tone={finished ? 'success' : 'info'}
            size="sm"
          />
        }
      />

      <View style={styles.stack}>
        {finished ? (
          <Banner
            tone="success"
            title="Monitoring complete"
            message="This grant has been closed out. The reports below are kept as the record of the year."
          />
        ) : null}

        <Card style={styles.card}>
          <ProgressBar
            value={totalPeriods === 0 ? 0 : submittedCount / totalPeriods}
            label={`${submittedCount} of ${totalPeriods} reports submitted`}
            showPercentage
            tone={submittedCount === totalPeriods ? 'success' : 'brand'}
          />
          <Text variant="callout" muted>
            {reviewedCount === submittedCount
              ? 'Every submitted report has been reviewed.'
              : `${submittedCount - reviewedCount} submitted ${
                  submittedCount - reviewedCount === 1 ? 'report is' : 'reports are'
                } still waiting to be read.`}
          </Text>
        </Card>

        <ListGroup title="Grant">
          <ListRow
            label="Registration code"
            value={(application?.registration_code as string) ?? '—'}
            labelNumberOfLines={1}
          />
          <ListRow
            label="Amount"
            value={formatCurrency((application?.requested_amount as number) ?? null)}
          />
          <ListRow
            label="Monitoring started"
            value={formatDateShort(record.monitoring_started_at)}
          />
          <ListRow label="Monitoring ends" value={formatDateShort(record.monitoring_ends_at)} />
          <ListRow
            label="Application"
            onPress={() => router.push(`/(committee)/applications/${record.application_id}`)}
            accessibilityHint="Opens the full application"
          />
        </ListGroup>

        <View style={styles.timeline}>
          <Text variant="label" muted style={styles.timelineHeading}>
            THE TWELVE MONTHS
          </Text>

          <MonitoringTimeline
            periods={periods}
            onSelectPeriod={(period) =>
              period.report
                ? router.push(`/(committee)/beneficiaries/report/${period.report.id}`)
                : undefined
            }
          />
        </View>
      </View>

      <Sheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="Complete this grant?"
        subtitle="This closes the monitoring year and is not undone from inside the app."
      >
        {missing > 0 ? (
          <Banner
            tone="warning"
            title={`${missing} ${missing === 1 ? 'report was' : 'reports were'} never submitted`}
            message="Completing now records the year as finished with those reports missing."
          />
        ) : null}

        <Text variant="callout" muted>
          The beneficiary is told their monitoring year is complete and thanked. Their reports stay
          on record.
        </Text>

        <Button
          label="Complete grant"
          onPress={() => void handleComplete()}
          loading={busy}
          fullWidth
          size="lg"
        />
        <Button label="Cancel" variant="ghost" onPress={() => setConfirming(false)} fullWidth />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: rhythm.section,
  },
  card: {
    gap: spacing.md,
  },
  timeline: {
    gap: spacing.md,
  },
  timelineHeading: {
    marginBottom: spacing.xs,
  },
});
