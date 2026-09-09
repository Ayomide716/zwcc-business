/**
 * The committee's application queue (brief §22).
 *
 * Search, filtering, sorting and pagination all run server-side — the client
 * never downloads the whole table, which matters both for privacy and for
 * anyone reviewing on mobile data.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ApplicationListItem } from '@/components/app';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, SkeletonList } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useCommitteeApplications } from '@/hooks/queries';
import { useDebounce } from '@/hooks/useDebounce';
import { toUserError } from '@/lib/errors';
import { MIN_TOUCH_TARGET, colors, radius, spacing } from '@/theme';
import { COMMITTEE_QUEUE_STATUSES } from '@/workflow/engine';

type SortOption = 'submitted_at' | 'requested_amount' | 'created_at';

const SORT_LABELS: Record<SortOption, string> = {
  submitted_at: 'Date submitted',
  requested_amount: 'Amount requested',
  created_at: 'Date started',
};

/** Quick filters across the top. `null` means "everything in the queue". */
const QUICK_FILTERS: { id: string; label: string; statuses: string[] | null }[] = [
  { id: 'queue', label: 'Needs action', statuses: [...COMMITTEE_QUEUE_STATUSES] },
  { id: 'submitted', label: 'New', statuses: ['submitted'] },
  { id: 'verification', label: 'Verifying', statuses: ['verification'] },
  { id: 'committee_review', label: 'Reviewing', statuses: ['committee_review'] },
  { id: 'approved', label: 'Approved', statuses: ['approved', 'agreement_pending', 'agreement_signed'] },
  { id: 'rejected', label: 'Declined', statuses: ['rejected'] },
  { id: 'monitoring', label: 'Beneficiaries', statuses: ['monitoring'] },
  { id: 'all', label: 'All', statuses: null },
];

export default function ApplicationsListScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ status?: string }>();

  const [activeFilter, setActiveFilter] = useState('queue');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('submitted_at');
  const [ascending, setAscending] = useState(false);
  const [page, setPage] = useState(0);
  const [sortSheet, setSortSheet] = useState(false);

  // Deep-linked from the dashboard tiles.
  useEffect(() => {
    if (!params.status) return;
    const match = QUICK_FILTERS.find((filter) => filter.id === params.status);
    setActiveFilter(match ? match.id : 'all');
  }, [params.status]);

  // Searching on every keystroke would fire a query per character on a slow
  // connection; wait until typing settles.
  const debouncedSearch = useDebounce(search, 350);

  // Reset to the first page whenever the query changes.
  useEffect(() => {
    setPage(0);
  }, [activeFilter, debouncedSearch, sortBy, ascending]);

  const statuses = useMemo(
    () => QUICK_FILTERS.find((filter) => filter.id === activeFilter)?.statuses ?? undefined,
    [activeFilter],
  );

  const query = useCommitteeApplications({
    statuses: statuses ?? undefined,
    search: debouncedSearch,
    sortBy,
    ascending,
    page,
    pageSize: 20,
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;

  return (
    <Screen scrollable={false} padded={false}>
      <View style={styles.header}>
        <ScreenHeader
          title="Applications"
          subtitle={query.isLoading ? undefined : `${total} application${total === 1 ? '' : 's'}`}
          right={
            <Pressable
              onPress={() => setSortSheet(true)}
              accessibilityRole="button"
              accessibilityLabel="Sort and order"
              style={styles.sortButton}
            >
              <Ionicons name="swap-vertical" size={18} color={colors.brand} />
            </Pressable>
          }
        />

        <TextField
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, business or code"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search applications"
          containerStyle={styles.search}
        />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filters}
        >
          {QUICK_FILTERS.map((filter) => {
            const active = filter.id === activeFilter;
            return (
              <Pressable
                key={filter.id}
                onPress={() => setActiveFilter(filter.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text variant="label" color={active ? 'onBrand' : 'textSecondary'}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {query.isError ? (
        <ErrorState
          message={toUserError(query.error).message}
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading ? (
        <View style={styles.listPadding}>
          <SkeletonList count={5} />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onRefresh={() => void query.refetch()}
          refreshing={query.isRefetching}
          renderItem={({ item }) => (
            <ApplicationListItem
              application={item}
              onPress={() => router.push(`/(committee)/applications/${item.id}`)}
            />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title="No applications found"
              message={
                debouncedSearch
                  ? `Nothing matches “${debouncedSearch}”. Try a different search.`
                  : 'There is nothing in this view right now.'
              }
            />
          }
          ListFooterComponent={
            rows.length > 0 ? (
              <View style={styles.pager}>
                <Button
                  label="Previous"
                  variant="outline"
                  size="sm"
                  icon="chevron-back"
                  disabled={page === 0}
                  onPress={() => setPage((current) => Math.max(0, current - 1))}
                />
                <Text variant="caption" muted>
                  Page {page + 1} of {Math.max(1, Math.ceil(total / 20))}
                </Text>
                <Button
                  label="Next"
                  variant="outline"
                  size="sm"
                  icon="chevron-forward"
                  iconPosition="right"
                  disabled={!query.data?.hasMore}
                  onPress={() => setPage((current) => current + 1)}
                />
              </View>
            ) : null
          }
        />
      )}

      <Sheet visible={sortSheet} onClose={() => setSortSheet(false)} title="Sort applications">
        {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
          <Pressable
            key={option}
            onPress={() => {
              setSortBy(option);
              setSortSheet(false);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: sortBy === option }}
            style={styles.sortRow}
          >
            <Text variant="body" color={sortBy === option ? 'brand' : 'text'}>
              {SORT_LABELS[option]}
            </Text>
            {sortBy === option ? (
              <Ionicons name="checkmark" size={20} color={colors.brand} />
            ) : null}
          </Pressable>
        ))}

        <Button
          label={ascending ? 'Oldest / smallest first' : 'Newest / largest first'}
          variant="outline"
          icon={ascending ? 'arrow-up' : 'arrow-down'}
          onPress={() => setAscending((current) => !current)}
          fullWidth
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.base,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  search: {
    marginBottom: spacing.xs,
  },
  sortButton: {
    width: MIN_TOUCH_TARGET - 12,
    height: MIN_TOUCH_TARGET - 12,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSurfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filters: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.base,
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
    padding: spacing.base,
    gap: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  listPadding: {
    padding: spacing.base,
  },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.lg,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH_TARGET,
  },
});
