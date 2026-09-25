/**
 * Audit log (brief §26).
 *
 * Read-only, and structurally so: `audit_logs` has no UPDATE or DELETE policy
 * for any role, so history cannot be rewritten through the API even by an
 * administrator.
 */
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Banner, EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { queryKeys } from '@/providers/QueryProvider';
import { auditService, type AuditEntity } from '@/services/audit.service';
import { toUserError } from '@/lib/errors';
import { formatDateTime } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import { describeAuditAction, describeAuditDetail } from '@/lib/auditText';

const ENTITY_FILTERS: { id: AuditEntity | 'all'; label: string }[] = [
  { id: 'all', label: 'Everything' },
  { id: 'application', label: 'Applications' },
  { id: 'document', label: 'Documents' },
  { id: 'agreement', label: 'Agreements' },
  { id: 'progress_report', label: 'Reports' },
  { id: 'profile', label: 'Users' },
];

const ACTION_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  application: 'document-text-outline',
  document: 'folder-open-outline',
  agreement: 'document-lock-outline',
  beneficiary: 'people-outline',
  progress_report: 'bar-chart-outline',
  profile: 'person-outline',
  setting: 'settings-outline',
  session: 'log-in-outline',
};

export default function AuditScreen() {
  const [filter, setFilter] = useState<AuditEntity | 'all'>('all');

  const query = useQuery({
    queryKey: queryKeys.auditLog({ filter }),
    queryFn: () =>
      auditService.list({
        limit: 100,
        entityType: filter === 'all' ? undefined : filter,
      }),
  });

  return (
    <Screen onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <ScreenHeader
        title="Audit log"
        subtitle="Every significant action, in order."
        showBack
      />

      <Banner
        tone="info"
        message="Audit entries cannot be edited or deleted by anyone, including administrators."
        icon="shield-checkmark-outline"
      />

      <View style={styles.filters}>
        {ENTITY_FILTERS.map((item) => {
          const active = filter === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => setFilter(item.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text variant="label" color={active ? 'onBrand' : 'textSecondary'}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {query.isError ? (
        <ErrorState
          message={toUserError(query.error).message}
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading ? (
        <SkeletonList count={6} />
      ) : (query.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon="receipt-outline"
          title="Nothing recorded yet"
          message="Actions appear here as people use the app."
        />
      ) : (
        <View style={styles.list}>
          {query.data?.map((entry) => (
            <Card key={entry.id} variant="outlined" style={styles.row}>
              <View style={styles.icon}>
                <Ionicons
                  name={ACTION_ICONS[entry.entity_type] ?? 'ellipse-outline'}
                  size={16}
                  color={colors.brand}
                />
              </View>

              <View style={styles.rowText}>
                <Text variant="bodyMedium">{describeAuditAction(entry.action)}</Text>
                {/* Who, then what. The whole point of the log is to answer
                    "who opened whose document", so both are names. */}
                <Text variant="callout">
                  {entry.actor_name ?? 'Unknown'}
                  {entry.actor_role ? (
                    <Text variant="callout" muted>{` (${entry.actor_role})`}</Text>
                  ) : null}
                </Text>
                {entry.entity_id ? (
                  <Text variant="caption" color="textSecondary" numberOfLines={2}>
                    {entry.subject ?? describeMissing(entry.entity_type)}
                  </Text>
                ) : null}
                {describeAuditDetail(entry.action, entry.metadata) ? (
                  <Text variant="caption" color="textSecondary">
                    {describeAuditDetail(entry.action, entry.metadata)}
                  </Text>
                ) : null}
                <Text variant="caption" muted>
                  {formatDateTime(entry.created_at)}
                </Text>
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

/**
 * The record an entry points at has since been removed — an account deleted,
 * a test application cleared. Say so, rather than show an id nobody can use.
 */
function describeMissing(entityType: string): string {
  switch (entityType) {
    case 'profile':
    case 'session':
      return 'An account that has since been deleted';
    case 'application':
      return 'An application that has since been removed';
    case 'document':
      return 'A document that has since been removed';
    default:
      return 'A record that has since been removed';
  }
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginVertical: spacing.base,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.brandSurfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
});
