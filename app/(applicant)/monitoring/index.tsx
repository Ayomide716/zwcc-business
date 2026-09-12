/**
 * Beneficiary monitoring timeline (brief §18).
 *
 * Twelve months, each showing whether the report is upcoming, due, overdue,
 * submitted or reviewed. The schedule is derived from configuration, so
 * changing the cadence re-shapes this screen for everyone with no backfill.
 */
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { FirstRunHint, MonitoringTimeline } from '@/components/app';
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
import { rhythm, spacing } from '@/theme';

export default function MonitoringScreen() {
  const router = useRouter();

  const { data: myBeneficiary, isLoading, refetch: refetchBeneficiary } = useMyBeneficiary();
  const {
    data: overview,
    isLoading: loadingOverview,
    refetch,
    isRefetching,
  } = useMonitoringOverview(myBeneficiary?.id);

  /*
    The overview's own copy, not the one used to find it.

    `useMyBeneficiary` runs once to get an id and is not refetched when this
    screen is pulled down, so anything read from it — the status in particular —
    stays as it was when the screen first loaded. A grant completed by the
    committee would never show as complete here, however many times someone
    refreshed. The overview refetches, so read the record from there.
  */
  const beneficiary = overview?.beneficiary ?? myBeneficiary;

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

  /* The earliest period still waiting for its window to open. */
  const nextToOpen = periods.find((period) => !period.report && period.status === 'upcoming');

  /*
    The year is over.

    Reaching the end of twelve months of reporting is the last thing this app
    asks of someone, and it used to pass without comment: a green bar at 100%
    and the same "each report takes a few minutes" copy underneath. Saying so,
    and thanking them, costs nothing and is the difference between finishing
    and simply running out of rows.
  */
  const finished = beneficiary.status === 'completed';
  const allSubmitted = submittedCount >= totalPeriods;

  return (
    <Screen
      onRefresh={() => {
        void refetchBeneficiary();
        void refetch();
      }}
      refreshing={isRefetching}
      footer={
        actionablePeriod && !finished ? (
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

      {/* One gap for the page rather than a margin on one card and none on the rest. */}
      <View style={styles.stack}>
        {finished ? (
          <Banner
            tone="success"
            title="Your monitoring year is complete"
            message="Thank you for reporting on your business through the year. Your reports stay here as the record of it."
          />
        ) : allSubmitted ? (
          <Banner
            tone="success"
            title="All twelve reports submitted"
            message="Nothing more is needed from you. The committee will close out your grant."
          />
        ) : null}

        <FirstRunHint
          id="monitoring.v1"
          title="A short update, once a month"
          body="A few sentences on how the business is going, with a photo or a short video. It does not need to be polished — this is how the church sees the grant working."
          icon="chatbubble-ellipses-outline"
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
            label={
              finished
                ? `${submittedCount} of ${totalPeriods} reports submitted over the year`
                : `${submittedCount} of ${totalPeriods} reports submitted`
            }
            showPercentage
            tone={submittedCount === totalPeriods ? 'success' : 'brand'}
          />

          {finished && submittedCount === 0 ? (
            <Text variant="callout" muted>
              This grant was closed without any reports being submitted.
            </Text>
          ) : null}

          {/*
            Instructions, and only while they are instructions. On a year that
            has been closed out this card was still explaining how to write a
            report and promising the first one would open next month, directly
            under a banner saying the year was over.
          */}
          {!finished && !allSubmitted ? (
            <Text variant="callout" muted>
              Each report takes a few minutes. Tell us how the business is going, what went well,
              what was difficult, and attach a few photos or a short video.
            </Text>
          ) : null}

          {/*
            Nothing to submit yet is the normal state for a new beneficiary, and
            without this the screen is twelve rows marked "Upcoming" and no
            button, which reads as broken rather than as early.
          */}
          {!finished && !actionablePeriod && !allSubmitted && nextToOpen ? (
            <Text variant="callout" color="brand">
              {`Your first report opens on ${formatDateShort(nextToOpen.opensAt)}. There is nothing to do until then.`}
            </Text>
          ) : null}
        </Card>

        <View style={styles.timeline}>
          <Text variant="label" muted style={styles.timelineHeading}>
            YOUR TWELVE MONTHS
          </Text>

          <MonitoringTimeline
            periods={periods}
            onSelectPeriod={(period) => {
              // Once the year is closed out, a month with no report has nothing
              // to open: the database refuses new reports on a completed grant,
              // so offering the form would only produce an error.
              if (finished && !period.report) return;
              router.push(`/(applicant)/monitoring/${period.periodNumber}`);
            }}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: rhythm.section,
  },
  summary: {
    gap: spacing.md,
  },
  timeline: {
    gap: spacing.md,
  },
  timelineHeading: {
    marginBottom: spacing.xs,
  },
});
