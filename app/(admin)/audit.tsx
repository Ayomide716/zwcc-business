/**
 * Audit log (brief §26).
 *
 * Read-only, and structurally so: `audit_logs` has no UPDATE or DELETE policy
 * for any role, so history cannot be rewritten through the API even by an
 * administrator.
 */
import { Ionicons } from '@expo/vector-icons';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Banner, EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { queryKeys } from '@/providers/QueryProvider';
import { auditService, type AuditEntity } from '@/services/audit.service';
import { toUserError } from '@/lib/errors';
import { colors, radius, spacing } from '@/theme';
import {
  formatTime,
  groupAuditEntries,
  mixedRunLabel,
  type AuditGroup,
} from '@/lib/auditGroups';
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

/** Entries fetched per "Show older". */
const PAGE_SIZE = 100;
/** The feed's own ceiling (migration 0026). */
const MAX_ENTRIES = 500;

export default function AuditScreen() {
  const [filter, setFilter] = useState<AuditEntity | 'all'>('all');
  // Grows by a page at a time when "Show older" is pressed.
  const [limit, setLimit] = useState(PAGE_SIZE);

  const query = useQuery({
    queryKey: [...queryKeys.auditLog({ filter }), limit],
    queryFn: () =>
      auditService.list({
        limit,
        entityType: filter === 'all' ? undefined : filter,
      }),
    // Keep the entries already on screen while the next page loads, so the
    // list does not blank and jump back to the top.
    placeholderData: keepPreviousData,
  });

  const days = useMemo(() => groupAuditEntries(query.data ?? []), [query.data]);
  const mayHaveOlder = (query.data?.length ?? 0) >= limit && limit < MAX_ENTRIES;

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
              onPress={() => {
                setFilter(item.id);
                setLimit(PAGE_SIZE);
              }}
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
          {days.map((day) => (
            <View key={day.key} style={styles.day}>
              <Text variant="overline" color="textSecondary" accessibilityRole="header">
                {day.label}
              </Text>
              {day.groups.map((group) => (
                <AuditGroupCard key={`${group.key}|${group.entries[0]!.id}`} group={group} />
              ))}
            </View>
          ))}

          {mayHaveOlder ? (
            <Button
              label="Show older"
              variant="outline"
              icon="chevron-down"
              onPress={() => setLimit((current) => Math.min(current + PAGE_SIZE, MAX_ENTRIES))}
              loading={query.isFetching}
              fullWidth
            />
          ) : limit >= MAX_ENTRIES ? (
            <Text variant="caption" muted align="center">
              Showing the latest {MAX_ENTRIES} entries.
            </Text>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

/**
 * One card per run of the same thing. A single entry reads exactly as before;
 * a run shows a count and the time span, and opens to list each entry.
 */
function AuditGroupCard({ group }: { group: AuditGroup }) {
  const [open, setOpen] = useState(false);
  const first = group.entries[0]!;
  const count = group.entries.length;
  const single = count === 1;
  const detail = single ? describeAuditDetail(first.action, first.metadata) : null;
  // Newest first, so the last entry is the earliest.
  const span = single
    ? formatTime(first.created_at)
    : `${formatTime(group.entries[count - 1]!.created_at)} – ${formatTime(first.created_at)}`;

  const body = (
    <>
      <View style={styles.icon}>
        <Ionicons
          name={ACTION_ICONS[first.entity_type] ?? 'ellipse-outline'}
          size={16}
          color={colors.brand}
        />
      </View>

      <View style={styles.rowText}>
        <Text variant="bodyMedium">
          {mixedRunLabel(group) ?? describeAuditAction(first.action)}
          {single ? '' : ` ×${count}`}
        </Text>
        <Text variant="callout">
          {first.actor_name ?? 'Unknown'}
          {first.actor_role ? <Text variant="callout" muted>{` (${first.actor_role})`}</Text> : null}
        </Text>
        {first.entity_id ? (
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {single
              ? (first.subject ?? describeMissing(first.entity_type))
              : (group.sharedSubject ?? describeMissing(first.entity_type))}
          </Text>
        ) : null}
        {detail ? (
          <Text variant="caption" color="textSecondary">
            {detail}
          </Text>
        ) : null}
        <Text variant="caption" muted>
          {span}
        </Text>

        {open ? (
          <View style={styles.expanded}>
            {group.entries.map((entry) => {
              const entryDetail = describeAuditDetail(entry.action, entry.metadata);
              return (
                <View key={entry.id} style={styles.expandedRow}>
                  <Text variant="caption" muted style={styles.expandedTime}>
                    {formatTime(entry.created_at)}
                  </Text>
                  <View style={styles.rowText}>
                    <Text variant="caption" color="textSecondary">
                      {mixedRunLabel(group)
                        ? describeAuditAction(entry.action)
                        : (entry.subject ?? describeMissing(entry.entity_type))}
                    </Text>
                    {entryDetail ? (
                      <Text variant="caption" muted>
                        {entryDetail}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </View>

      {single ? null : (
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={colors.textMuted}
        />
      )}
    </>
  );

  if (single) {
    return (
      <Card variant="outlined" style={styles.row}>
        {body}
      </Card>
    );
  }

  return (
    <Pressable
      onPress={() => setOpen((value) => !value)}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityHint={open ? 'Hides the individual entries' : `Shows all ${count} entries`}
    >
      <Card variant="outlined" style={styles.row}>
        {body}
      </Card>
    </Pressable>
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
    gap: spacing.lg,
  },
  day: {
    gap: spacing.sm,
  },
  expanded: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
    gap: spacing.sm,
  },
  expandedRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  expandedTime: {
    width: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
