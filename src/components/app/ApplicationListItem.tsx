/**
 * A row in the committee's application queue.
 *
 * Shows what a reviewer triages on: who, what business, how much, what state,
 * and how long it has been waiting.
 */
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { formatCurrency, formatRelative, initials } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import type { ApplicationRow } from '@/types/database';

import { StatusBadge } from './StatusBadge';

export interface ApplicationListItemProps {
  application: ApplicationRow;
  onPress: () => void;
}

export function ApplicationListItem({ application, onPress }: ApplicationListItemProps) {
  const name = application.applicant_name ?? 'Unnamed applicant';
  const submitted = application.submitted_at ?? application.created_at;

  return (
    <Card
      variant="outlined"
      onPress={onPress}
      accessibilityLabel={`${name}, ${application.business_name ?? 'no business name'}, ${formatCurrency(application.requested_amount)} requested`}
      accessibilityHint="Opens the application"
      style={styles.card}
    >
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text variant="label" color="brand">
            {initials(application.applicant_name)}
          </Text>
        </View>

        <View style={styles.headerText}>
          <Text variant="bodyMedium" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="caption" muted numberOfLines={1}>
            {application.business_name ?? 'Business name not provided'}
          </Text>
        </View>

        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </View>

      <View style={styles.meta}>
        <StatusBadge status={application.status} size="sm" />

        <View style={styles.metaRight}>
          <Text variant="label" color="brand">
            {formatCurrency(application.requested_amount)}
          </Text>
          <Text variant="caption" muted>
            {formatRelative(submitted)}
          </Text>
        </View>
      </View>

      {application.registration_code ? (
        <Text variant="caption" muted style={styles.code}>
          {application.registration_code}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSurfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: 1,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  metaRight: {
    alignItems: 'flex-end',
  },
  code: {
    letterSpacing: 0.6,
  },
});
