/**
 * Beneficiary monitoring for staff (brief §18, §19).
 *
 * Two views: the reports waiting to be read, and the active beneficiaries.
 * Reports are the more urgent of the two, so they come first.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { EmptyState, SkeletonList } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useBeneficiaries, useReportsForReview } from '@/hooks/queries';
import { formatCurrency, formatDateShort, formatRelative, initials } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

type TabId = 'reports' | 'beneficiaries';

export default function BeneficiariesScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>('reports');

  const reports = useReportsForReview();
  const beneficiaries = useBeneficiaries('active');

  const loading = tab === 'reports' ? reports.isLoading : beneficiaries.isLoading;
  const refreshing = tab === 'reports' ? reports.isRefetching : beneficiaries.isRefetching;

  function handleRefresh() {
    if (tab === 'reports') void reports.refetch();
    else void beneficiaries.refetch();
  }

  return (
    <Screen onRefresh={handleRefresh} refreshing={refreshing}>
      <ScreenHeader
        title="Beneficiaries"
        subtitle="Monthly business progress across the monitoring year."
      />

      <View style={styles.tabs} accessibilityRole="tablist">
        {(
          [
            { id: 'reports' as const, label: 'Reports to review', count: reports.data?.length },
            { id: 'beneficiaries' as const, label: 'Active', count: beneficiaries.data?.length },
          ]
        ).map((item) => {
          const active = tab === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => setTab(item.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Text variant="label" color={active ? 'onBrand' : 'textSecondary'}>
                {item.label}
                {item.count !== undefined ? ` (${item.count})` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <SkeletonList count={4} />
      ) : tab === 'reports' ? (
        (reports.data?.length ?? 0) === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="No reports waiting"
            message="Every submitted progress report has been reviewed."
          />
        ) : (
          <View style={styles.list}>
            {reports.data?.map((report) => (
              <Card
                key={report.id}
                variant="outlined"
                onPress={() => router.push(`/(committee)/beneficiaries/report/${report.id}`)}
                accessibilityLabel={`Month ${report.period_number} report`}
                style={styles.row}
              >
                <View style={styles.avatar}>
                  <Text variant="label" color="brand">
                    {report.period_number}
                  </Text>
                </View>

                <View style={styles.rowText}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {(report as { applicant?: { full_name?: string | null } }).applicant
                      ?.full_name ?? 'Beneficiary'}
                  </Text>
                  <Text variant="caption" muted>
                    Month {report.period_number} · submitted {formatRelative(report.submitted_at)}
                  </Text>
                </View>

                <Badge
                  label={report.status === 'reviewed' ? 'Reviewed' : 'Awaiting review'}
                  tone={report.status === 'reviewed' ? 'success' : 'warning'}
                  size="sm"
                />
              </Card>
            ))}
          </View>
        )
      ) : (beneficiaries.data?.length ?? 0) === 0 ? (
        <EmptyState
          icon="people-outline"
          title="No active beneficiaries"
          message="Beneficiaries appear here once their grant has been authorised and monitoring has started."
        />
      ) : (
        <View style={styles.list}>
          {beneficiaries.data?.map((beneficiary) => {
            const application = (
              beneficiary as {
                application?: {
                  applicant_name?: string | null;
                  business_name?: string | null;
                  registration_code?: string | null;
                  requested_amount?: number | null;
                };
              }
            ).application;

            return (
              <Card
                key={beneficiary.id}
                variant="outlined"
                onPress={() =>
                  router.push(`/(committee)/applications/${beneficiary.application_id}`)
                }
                accessibilityLabel={application?.applicant_name ?? 'Beneficiary'}
                style={styles.beneficiaryCard}
              >
                <View style={styles.row}>
                  <View style={styles.avatar}>
                    <Text variant="label" color="brand">
                      {initials(application?.applicant_name)}
                    </Text>
                  </View>

                  <View style={styles.rowText}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {application?.applicant_name ?? 'Beneficiary'}
                    </Text>
                    <Text variant="caption" muted numberOfLines={1}>
                      {application?.business_name ?? 'Business'}
                    </Text>
                  </View>

                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                </View>

                <View style={styles.beneficiaryMeta}>
                  <Text variant="caption" muted>
                    Monitoring to {formatDateShort(beneficiary.monitoring_ends_at)}
                  </Text>
                  <Text variant="label" color="brand">
                    {formatCurrency(application?.requested_amount ?? null)}
                  </Text>
                </View>
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.base,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.brand,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.brandSurfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beneficiaryCard: {
    gap: spacing.md,
  },
  beneficiaryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
