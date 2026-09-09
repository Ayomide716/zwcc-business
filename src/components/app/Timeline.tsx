/**
 * Journey timelines.
 *
 * `ApplicationTimeline` renders the workflow's happy path with the current
 * position marked. `MonitoringTimeline` renders the twelve reporting months.
 * Both read from configuration, so a re-shaped workflow or a different
 * reporting cadence renders correctly without touching this file.
 */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Text } from '@/components/ui/Text';
import { REPORT_STATUS_LABELS, type ReportStatus } from '@/config/monitoring.config';
import { formatDateShort } from '@/lib/format';
import type { TimelinePeriod } from '@/services/monitoring.service';
import { colors, radius, spacing, type Tone } from '@/theme';
import { buildTimeline } from '@/workflow/engine';

/* -------------------------------------------------------------------------- */
/* Application timeline                                                        */
/* -------------------------------------------------------------------------- */

export function ApplicationTimeline({ status }: { status: string }) {
  const steps = buildTimeline(status);

  return (
    <View accessibilityLabel="Application progress">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;

        return (
          <View key={step.status.id} style={styles.row}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.node,
                  step.state === 'done' && styles.nodeDone,
                  step.state === 'current' && styles.nodeCurrent,
                ]}
              >
                {step.state === 'done' ? (
                  <Ionicons name="checkmark" size={12} color={colors.onBrand} />
                ) : step.state === 'current' ? (
                  <View style={styles.nodePulse} />
                ) : null}
              </View>

              {!isLast ? (
                <View style={[styles.connector, step.state === 'done' && styles.connectorDone]} />
              ) : null}
            </View>

            <View style={[styles.content, isLast && styles.contentLast]}>
              <Text
                variant={step.state === 'current' ? 'bodyMedium' : 'body'}
                color={
                  step.state === 'current'
                    ? 'brand'
                    : step.state === 'done'
                      ? 'text'
                      : 'textMuted'
                }
              >
                {step.status.label}
              </Text>

              {step.state === 'current' ? (
                <Text variant="caption" muted>
                  {step.status.applicantDescription}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* -------------------------------------------------------------------------- */
/* Monitoring timeline                                                         */
/* -------------------------------------------------------------------------- */

const REPORT_TONES: Record<ReportStatus, Tone> = {
  upcoming: 'neutral',
  due: 'warning',
  overdue: 'danger',
  submitted: 'info',
  under_review: 'progress',
  reviewed: 'success',
  missed: 'danger',
};

export interface MonitoringTimelineProps {
  periods: TimelinePeriod[];
  onSelectPeriod?: (period: TimelinePeriod) => void;
}

export function MonitoringTimeline({ periods, onSelectPeriod }: MonitoringTimelineProps) {
  return (
    <View accessibilityLabel="Monthly reporting timeline">
      {periods.map((period, index) => {
        const isLast = index === periods.length - 1;
        const done = Boolean(period.report);
        const actionable = period.submittable || period.status === 'overdue';

        return (
          <Pressable
            key={period.periodNumber}
            onPress={onSelectPeriod ? () => onSelectPeriod(period) : undefined}
            disabled={!onSelectPeriod || (!done && !actionable)}
            accessibilityRole={onSelectPeriod ? 'button' : undefined}
            accessibilityLabel={`${period.label}, ${REPORT_STATUS_LABELS[period.status]}, due ${formatDateShort(period.dueDate)}`}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
          >
            <View style={styles.rail}>
              <View
                style={[
                  styles.node,
                  done && styles.nodeDone,
                  actionable && !done && styles.nodeCurrent,
                ]}
              >
                {done ? (
                  <Ionicons name="checkmark" size={12} color={colors.onBrand} />
                ) : (
                  <Text
                    variant="caption"
                    color={actionable ? colors.onBrand : colors.textMuted}
                    weight="700"
                  >
                    {period.periodNumber}
                  </Text>
                )}
              </View>

              {!isLast ? (
                <View style={[styles.connector, done && styles.connectorDone]} />
              ) : null}
            </View>

            <View style={[styles.content, isLast && styles.contentLast, styles.monitoringContent]}>
              <View style={styles.monitoringHeader}>
                <Text variant="bodyMedium">{period.label}</Text>
                <Badge
                  label={REPORT_STATUS_LABELS[period.status]}
                  tone={REPORT_TONES[period.status]}
                  size="sm"
                />
              </View>

              <Text variant="caption" muted>
                {period.report
                  ? `Submitted ${formatDateShort(period.report.submitted_at)}`
                  : `Due ${formatDateShort(period.dueDate)}`}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.7,
  },
  rail: {
    alignItems: 'center',
    width: 24,
  },
  node: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeDone: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  nodeCurrent: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  nodePulse: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.onBrand,
  },
  connector: {
    flex: 1,
    width: 2,
    minHeight: 18,
    backgroundColor: colors.border,
  },
  connectorDone: {
    backgroundColor: colors.success,
  },
  content: {
    flex: 1,
    paddingBottom: spacing.lg,
    gap: spacing.xxs,
  },
  contentLast: {
    paddingBottom: 0,
  },
  monitoringContent: {
    paddingTop: 1,
  },
  monitoringHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});
