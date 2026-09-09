/**
 * Committee overview (brief §22).
 *
 * Counts come from `count: 'exact', head: true` queries, so the tiles cost one
 * cheap round trip each and never download rows.
 */
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ApplicationListItem, StatTile } from '@/components/app';
import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, SkeletonList } from '@/components/ui/Feedback';
import { BrandHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { GRANT_PROGRAM } from '@/config/program.config';
import { useCommitteeApplications, useCommitteeStats, useReportsForReview } from '@/hooks/queries';
import { firstName } from '@/lib/format';
import { useAuth } from '@/providers/AuthProvider';
import { spacing } from '@/theme';

export default function CommitteeDashboard() {
  const router = useRouter();
  const { profile, role } = useAuth();

  const stats = useCommitteeStats();
  const reports = useReportsForReview();

  // The five oldest items still waiting on the committee.
  const queue = useCommitteeApplications({
    statuses: ['submitted', 'verification', 'committee_review'],
    sortBy: 'submitted_at',
    ascending: true,
    pageSize: 5,
  });

  const refreshing = stats.isRefetching || queue.isRefetching || reports.isRefetching;

  function handleRefresh() {
    void stats.refetch();
    void queue.refetch();
    void reports.refetch();
  }

  return (
    <Screen
      padded={false}
      onRefresh={handleRefresh}
      refreshing={refreshing}
      edgeToEdgeBottom
    >
      <BrandHeader
        eyebrow="Grant Committee"
        title={firstName(profile?.full_name)}
        subtitle={GRANT_PROGRAM.name}
        right={<Logo size={36} showWordmark={false} scheme="onDark" />}
      />

      <View style={styles.body}>
        <View style={styles.grid}>
          <StatTile
            label="New applications"
            value={stats.data?.newApplications}
            icon="mail-unread-outline"
            tone="info"
            loading={stats.isLoading}
            onPress={() => router.push('/(committee)/applications?status=submitted')}
          />
          <StatTile
            label="Pending verification"
            value={stats.data?.pendingVerification}
            icon="shield-checkmark-outline"
            tone="warning"
            loading={stats.isLoading}
            onPress={() => router.push('/(committee)/applications?status=verification')}
          />
        </View>

        <View style={styles.grid}>
          <StatTile
            label="Under review"
            value={stats.data?.underReview}
            icon="eye-outline"
            tone="progress"
            loading={stats.isLoading}
            onPress={() => router.push('/(committee)/applications?status=committee_review')}
          />
          <StatTile
            label="Approved"
            value={stats.data?.approved}
            icon="checkmark-circle-outline"
            tone="success"
            loading={stats.isLoading}
            onPress={() => router.push('/(committee)/applications?status=approved')}
          />
        </View>

        <View style={styles.grid}>
          <StatTile
            label="Not approved"
            value={stats.data?.rejected}
            icon="close-circle-outline"
            tone="danger"
            loading={stats.isLoading}
            onPress={() => router.push('/(committee)/applications?status=rejected')}
          />
          <StatTile
            label="Active beneficiaries"
            value={stats.data?.activeBeneficiaries}
            icon="people-outline"
            tone="progress"
            loading={stats.isLoading}
            onPress={() => router.push('/(committee)/beneficiaries')}
          />
        </View>

        <View style={styles.grid}>
          <StatTile
            label="Reports awaiting review"
            value={reports.data?.length}
            icon="bar-chart-outline"
            tone="warning"
            loading={reports.isLoading}
            onPress={() => router.push('/(committee)/beneficiaries')}
          />
          <StatTile
            label="Total applications"
            value={stats.data?.total}
            icon="documents-outline"
            tone="neutral"
            loading={stats.isLoading}
            onPress={() => router.push('/(committee)/applications')}
          />
        </View>

        {/* Work queue */}
        <Card style={styles.queue}>
          <View style={styles.queueHeader}>
            <View style={styles.queueTitle}>
              <Text variant="title3">Waiting on you</Text>
              <Text variant="caption" muted>
                Oldest first
              </Text>
            </View>
            <Button
              label="See all"
              variant="ghost"
              size="sm"
              onPress={() => router.push('/(committee)/applications')}
            />
          </View>

          {queue.isLoading ? (
            <SkeletonList count={3} />
          ) : (queue.data?.rows.length ?? 0) === 0 ? (
            <EmptyState
              icon="checkmark-done-outline"
              title="All caught up"
              message="There are no applications waiting for the committee right now."
            />
          ) : (
            <View style={styles.queueList}>
              {queue.data?.rows.map((application) => (
                <ApplicationListItem
                  key={application.id}
                  application={application}
                  onPress={() => router.push(`/(committee)/applications/${application.id}`)}
                />
              ))}
            </View>
          )}
        </Card>

        {role === 'admin' ? (
          <Button
            label="Administration"
            variant="outline"
            icon="settings-outline"
            onPress={() => router.push('/(admin)/dashboard')}
            fullWidth
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: spacing.base,
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  queue: {
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  queueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  queueTitle: {
    gap: 1,
  },
  queueList: {
    gap: spacing.sm,
  },
});
