/**
 * Live configuration viewer.
 *
 * Read-only by design. The workflow, document requirements and form questions
 * are code-level configuration so that they are versioned, reviewable and
 * type-checked — editing them from a phone would lose all three. What this
 * screen gives an administrator is certainty about what is actually in force,
 * and a precise place to point when asking for a change.
 */
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { StatusBadge } from '@/components/app';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Banner } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  APPLICATION_STEPS,
  DOCUMENT_TYPES,
  ENABLED_CHANNELS,
  MONITORING_SCHEDULE,
  NOTIFICATION_TEMPLATES,
  REGISTRATION_CODE_FORMAT,
  TRANSITIONS,
  WORKFLOW_FEATURES,
  WORKFLOW_TIMELINE,
  getVisibleFields,
} from '@/config';
import { colors, spacing } from '@/theme';

export default function ConfigurationScreen() {
  const notificationCount = Object.keys(NOTIFICATION_TEMPLATES).length;

  return (
    <Screen>
      <ScreenHeader
        title="Workflow & configuration"
        subtitle="What is currently in force across the app."
        showBack
      />

      <Banner
        tone="info"
        title="Read only"
        message="These settings live in the app's configuration files so they stay versioned and reviewable. Ask your developer to change them; every screen follows automatically."
        icon="lock-closed-outline"
      />

      {/* Feature switches */}
      <Card style={styles.card}>
        <Text variant="title3">Rules</Text>

        {Object.entries(WORKFLOW_FEATURES).map(([key, enabled]) => (
          <View key={key} style={styles.ruleRow}>
            <Ionicons
              name={enabled ? 'checkmark-circle' : 'close-circle'}
              size={18}
              color={enabled ? colors.success : colors.textMuted}
            />
            <Text variant="callout" style={styles.ruleText}>
              {describeFeature(key)}
            </Text>
            <Badge
              label={enabled ? 'On' : 'Off'}
              tone={enabled ? 'success' : 'neutral'}
              size="sm"
            />
          </View>
        ))}
      </Card>

      {/* Workflow */}
      <Card style={styles.card}>
        <Text variant="title3">Application workflow</Text>
        <Text variant="caption" muted>
          {WORKFLOW_TIMELINE.length} statuses on the main path · {TRANSITIONS.length} transitions
        </Text>

        <View style={styles.statusList}>
          {WORKFLOW_TIMELINE.map((statusId) => (
            <StatusBadge key={statusId} status={statusId} size="sm" />
          ))}
        </View>
      </Card>

      {/* Documents */}
      <Card style={styles.card}>
        <Text variant="title3">Documents</Text>
        {DOCUMENT_TYPES.map((type) => (
          <View key={type.id} style={styles.itemRow}>
            <View style={styles.itemText}>
              <Text variant="callout">{type.label}</Text>
              <Text variant="caption" muted>
                {type.category} · max {type.maxSizeMb} MB
              </Text>
            </View>
            <Badge
              label={type.requirement === 'required' ? 'Required' : 'Optional'}
              tone={type.requirement === 'required' ? 'warning' : 'neutral'}
              size="sm"
            />
          </View>
        ))}
      </Card>

      {/* Form */}
      <Card style={styles.card}>
        <Text variant="title3">Application form</Text>
        {APPLICATION_STEPS.map((step) => (
          <View key={step.id} style={styles.itemRow}>
            <View style={styles.itemText}>
              <Text variant="callout">{step.title}</Text>
              <Text variant="caption" muted>
                {step.kind === 'form'
                  ? `${getVisibleFields(step, {}).length} questions shown by default`
                  : step.kind === 'documents'
                    ? 'Document upload step'
                    : 'Review step'}
              </Text>
            </View>
          </View>
        ))}
      </Card>

      {/* Monitoring */}
      <Card style={styles.card}>
        <Text variant="title3">Monitoring</Text>
        <Row label="Duration" value={`${MONITORING_SCHEDULE.durationMonths} months`} />
        <Row
          label="Frequency"
          value={
            MONITORING_SCHEDULE.intervalMonths === 1
              ? 'Monthly'
              : `Every ${MONITORING_SCHEDULE.intervalMonths} months`
          }
        />
        <Row label="Grace period" value={`${MONITORING_SCHEDULE.graceDays} days`} />
        <Row
          label="Window opens"
          value={`${MONITORING_SCHEDULE.windowOpensDaysBefore} days before due`}
        />
      </Card>

      {/* Notifications */}
      <Card style={styles.card}>
        <Text variant="title3">Notifications</Text>
        <Text variant="caption" muted>
          {notificationCount} events configured
        </Text>

        {Object.entries(ENABLED_CHANNELS).map(([channel, enabled]) => (
          <View key={channel} style={styles.ruleRow}>
            <Ionicons
              name={enabled ? 'checkmark-circle' : 'time-outline'}
              size={18}
              color={enabled ? colors.success : colors.textMuted}
            />
            <Text variant="callout" style={styles.ruleText}>
              {channel === 'in_app' ? 'In-app' : channel.toUpperCase()}
            </Text>
            <Badge
              label={enabled ? 'Live' : 'Pending provider'}
              tone={enabled ? 'success' : 'neutral'}
              size="sm"
            />
          </View>
        ))}
      </Card>

      {/* Registration code */}
      <Card style={styles.card}>
        <Text variant="title3">Registration code</Text>
        <Row
          label="Format"
          value={`${REGISTRATION_CODE_FORMAT.prefix}${REGISTRATION_CODE_FORMAT.separator}${
            REGISTRATION_CODE_FORMAT.includeYear ? 'YYYY' + REGISTRATION_CODE_FORMAT.separator : ''
          }${'X'.repeat(REGISTRATION_CODE_FORMAT.randomLength)}`}
        />
        <Text variant="caption" muted>
          Generated with a cryptographic random source, using an alphabet that excludes easily
          confused characters so a code can be read aloud reliably.
        </Text>
      </Card>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.itemRow}>
      <Text variant="caption" muted style={styles.rowLabel}>
        {label}
      </Text>
      <Text variant="callout" style={styles.rowValue}>
        {value}
      </Text>
    </View>
  );
}

/** Turns a config key into a sentence an administrator can act on. */
function describeFeature(key: string): string {
  const descriptions: Record<string, string> = {
    allowReturnForCorrections: 'Applications can be returned to applicants for correction',
    allowReapplyAfterRejection: 'Declined applicants may apply again',
    enforceSingleActiveApplication: 'Applicants may hold only one live application',
    requireAgreementBeforeDisbursement: 'An agreement must be signed before disbursement',
    showRegistrationCode: 'Registration codes are shown to applicants',
  };
  return descriptions[key] ?? key;
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    marginBottom: spacing.base,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  ruleText: {
    flex: 1,
  },
  statusList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  itemText: {
    flex: 1,
    gap: 1,
  },
  rowLabel: {
    width: 110,
  },
  rowValue: {
    flex: 1,
  },
});
