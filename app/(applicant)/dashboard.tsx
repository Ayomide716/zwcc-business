/**
 * Applicant dashboard.
 *
 * The brief is explicit that this screen must answer "what do I need to do
 * next?" — so the next-action card sits directly under the greeting, above
 * status, progress and everything else.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ApplicationTimeline,
  Avatar,
  NextActionCard,
  RegistrationCodeCard,
  StatusBadge,
  StatusHero,
} from '@/components/app';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Banner, EmptyState, SkeletonList } from '@/components/ui/Feedback';
import { BrandHeader } from '@/components/ui/Header';
import { ProgressBar } from '@/components/ui/Progress';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { GRANT_PROGRAM, WORKFLOW_FEATURES, getRequiredDocumentTypes } from '@/config';
import {
  useApplicationContext,
  useDocuments,
  useMyApplication,
  useMyBeneficiary,
} from '@/hooks/queries';
import { firstName, formatCurrency, formatDateShort } from '@/lib/format';
import { useAuth } from '@/providers/AuthProvider';
import { colors, radius, spacing } from '@/theme';
import { canReapply, getStatusDefinition } from '@/workflow/engine';

function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function ApplicantDashboard() {
  const router = useRouter();
  const { profile } = useAuth();

  const application = useMyApplication();
  const documents = useDocuments(application.data?.id);
  const context = useApplicationContext(application.data?.id);
  const beneficiary = useMyBeneficiary();

  const refreshing =
    application.isRefetching || documents.isRefetching || beneficiary.isRefetching;

  const documentProgress = useMemo(() => {
    const required = getRequiredDocumentTypes();
    if (required.length === 0) return 1;

    const live = (documents.data ?? []).filter((doc) => !doc.deleted_at);
    const satisfied = required.filter((type) =>
      live.some((doc) => doc.document_type_id === type.id),
    );
    return satisfied.length / required.length;
  }, [documents.data]);

  function handleRefresh() {
    void application.refetch();
    void documents.refetch();
    void context.refetch();
    void beneficiary.refetch();
  }

  const app = application.data;
  const status = app?.status;
  const statusDefinition = status ? getStatusDefinition(status) : null;

  return (
    <Screen
      scrollable
      padded={false}
      onRefresh={handleRefresh}
      refreshing={refreshing}
      edgeToEdgeBottom
      // Pinned rather than scrolling, so the greeting stays put and the page
      // slides underneath it instead of running into the status bar.
      stickyHeader={
        <BrandHeader
          pinned
          eyebrow={greeting()}
          title={firstName(profile?.full_name)}
          subtitle={GRANT_PROGRAM.name}
          right={<Avatar path={profile?.avatar_url} name={profile?.full_name} size={40} />}
        />
      }
    >
      <View style={styles.body}>
        {application.isLoading ? (
          <SkeletonList count={3} />
        ) : !app ? (
          <NoApplicationYet onStart={() => router.push('/(onboarding)/eligibility')} />
        ) : (
          <>
            {/* The question this screen exists to answer. */}
            <NextActionCard
              status={app.status}
              role="applicant"
              actionLabel={canReapply(app.status) ? 'Start a new application' : undefined}
              onAction={
                canReapply(app.status)
                  ? () => router.push('/(applicant)/application')
                  : undefined
              }
            />

            {/* Registration code, once issued. */}
            {app.registration_code && WORKFLOW_FEATURES.showRegistrationCode ? (
              <RegistrationCodeCard code={app.registration_code} />
            ) : null}

            {/*
              Status leads. It is the one thing someone opens this app to find
              out, and it used to be a small pill beside a heading.
            */}
            <StatusHero
              status={app.status}
              meta={[
                { label: 'Requested', value: formatCurrency(app.requested_amount) },
                app.submitted_at
                  ? { label: 'Submitted', value: formatDateShort(app.submitted_at) }
                  : { label: 'Business', value: app.business_name ?? 'Not yet set' },
              ]}
            />

            {/* Documents, while they still matter. */}
            {statusDefinition?.documentsEditable || documentProgress < 1 ? (
              <Card style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text variant="title3">Documents</Text>
                  <Text variant="label" color={documentProgress === 1 ? 'success' : 'warningStrong'}>
                    {Math.round(documentProgress * 100)}% complete
                  </Text>
                </View>

                <ProgressBar
                  value={documentProgress}
                  tone={documentProgress === 1 ? 'success' : 'warning'}
                />

                <Button
                  label={documentProgress === 1 ? 'Review documents' : 'Upload documents'}
                  variant="outline"
                  onPress={() => router.push('/(applicant)/documents')}
                  icon="cloud-upload-outline"
                />
              </Card>
            ) : null}

            {/* Agreement, once it exists. */}
            {['agreement_pending', 'agreement_signed', 'disbursement_authorised'].includes(
              app.status,
            ) ? (
              <Card style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text variant="title3">Grant agreement</Text>
                  <StatusBadge status={app.status} size="sm" />
                </View>
                <Button
                  label={app.status === 'agreement_pending' ? 'Review and sign' : 'View agreement'}
                  variant={app.status === 'agreement_pending' ? 'primary' : 'outline'}
                  onPress={() => router.push('/(applicant)/agreement')}
                  icon="document-lock-outline"
                />
              </Card>
            ) : null}

            {/* Monitoring, once active. */}
            {beneficiary.data ? (
              <Card style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text variant="title3">Monthly reporting</Text>
                </View>
                <Text variant="callout" muted>
                  Your monitoring year runs to{' '}
                  {formatDateShort(beneficiary.data.monitoring_ends_at)}.
                </Text>
                <Button
                  label="Open my reports"
                  variant="outline"
                  onPress={() => router.push('/(applicant)/monitoring')}
                  icon="bar-chart-outline"
                />
              </Card>
            ) : null}

            {/* Decision reason, when declined. */}
            {app.status === 'rejected' ? (
              <Banner
                tone="warning"
                title="You can apply again"
                message="Your previous answers will be carried over so you do not have to start from scratch."
              />
            ) : null}

            {/* Journey. */}
            <Card style={styles.card}>
              <Text variant="title3">Your journey</Text>
              <ApplicationTimeline status={app.status} />
            </Card>
          </>
        )}
      </View>
    </Screen>
  );
}

function MetaItem({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metaItem}>
      <View style={styles.metaIcon}>
        <Ionicons name={icon} size={14} color={colors.brand} />
      </View>
      <View style={styles.metaText}>
        <Text variant="caption" muted>
          {label}
        </Text>
        <Text variant="callout" numberOfLines={1} numeric>
          {value}
        </Text>
      </View>
    </View>
  );
}

function NoApplicationYet({ onStart }: { onStart: () => void }) {
  return (
    <Card style={styles.card}>
      <EmptyState
        icon="rocket-outline"
        title="You have not applied yet"
        message={`Applications for the ${GRANT_PROGRAM.name} are open. It takes about 20 minutes, and you can save and come back at any time.`}
        actionLabel="Start my application"
        onAction={onStart}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  body: {
    padding: spacing.base,
    gap: spacing.base,
  },
  card: {
    gap: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  metaGrid: {
    gap: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  metaIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.brandSurfaceStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaText: {
    flex: 1,
  },
});
