/**
 * Application overview — the hub the applicant returns to.
 *
 * Lists every step with its completion state, so "what is left to do?" is
 * answerable at a glance rather than by paging through the form.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { StatusBadge } from '@/components/app';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Banner, EmptyState, LoadingState } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { ProgressBar } from '@/components/ui/Progress';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { APPLICATION_STEPS, getRequiredDocumentTypes } from '@/config';
import { useDocuments, useInvalidateApplication, useMyApplication } from '@/hooks/queries';
import { useApplicationForm } from '@/hooks/useApplicationForm';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { applicationService } from '@/services/application.service';
import { colors, radius, spacing } from '@/theme';
import { areDocumentsEditable, canReapply, isFormEditable } from '@/workflow/engine';

export default function ApplicationOverview() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const invalidate = useInvalidateApplication();

  const { data: application, isLoading, refetch, isRefetching } = useMyApplication();
  const { data: documents = [] } = useDocuments(application?.id);

  const serverValues = useMemo(
    () => (application?.form_data as Record<string, unknown>) ?? {},
    [application?.form_data],
  );

  const form = useApplicationForm(application?.id ?? null, serverValues);

  const editable = application ? isFormEditable(application.status) : false;
  const documentsOpen = application ? areDocumentsEditable(application.status) : false;

  const documentsComplete = useMemo(() => {
    const required = getRequiredDocumentTypes();
    const live = documents.filter((doc) => !doc.deleted_at);
    return required.every((type) => live.some((doc) => doc.document_type_id === type.id));
  }, [documents]);

  /** Steps + their completion, from configuration. */
  const steps = useMemo(
    () =>
      APPLICATION_STEPS.map((step) => {
        const complete =
          step.kind === 'documents'
            ? documentsComplete
            : step.kind === 'review'
              ? false
              : form.isStepComplete(step.id);

        return { ...step, complete };
      }),
    [documentsComplete, form],
  );

  const completedCount = steps.filter(
    (step) => step.kind !== 'review' && step.complete,
  ).length;
  const totalCount = steps.filter((step) => step.kind !== 'review').length;
  const readyToReview = completedCount === totalCount;

  async function handleReapply() {
    if (!user || !application) return;
    try {
      const next = await applicationService.reapply(user.id, application.id);
      invalidate();
      router.push(`/(applicant)/application/${next.current_step ?? 'personal'}`);
      toast.success('New application started', 'Your previous answers have been carried over.');
    } catch (error) {
      toast.error(error, 'Could not start a new application');
    }
  }

  if (isLoading || form.hydrating) {
    return (
      <Screen>
        <LoadingState message="Loading your application…" />
      </Screen>
    );
  }

  if (!application) {
    return (
      <Screen>
        <ScreenHeader title="Your application" />
        <EmptyState
          icon="rocket-outline"
          title="No application yet"
          message="Confirm your eligibility to get started. You can save your progress and finish later."
          actionLabel="Get started"
          onAction={() => router.push('/(onboarding)/eligibility')}
        />
      </Screen>
    );
  }

  return (
    <Screen
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
      footer={
        editable ? (
          <Button
            label={readyToReview ? 'Review and submit' : 'Continue where I left off'}
            onPress={() =>
              readyToReview
                ? router.push('/(applicant)/application/review')
                : router.push(
                    `/(applicant)/application/${
                      steps.find((step) => step.kind !== 'review' && !step.complete)?.id ??
                      'personal'
                    }`,
                  )
            }
            fullWidth
            size="lg"
            icon="arrow-forward"
            iconPosition="right"
          />
        ) : canReapply(application.status) ? (
          <Button label="Start a new application" onPress={handleReapply} fullWidth size="lg" />
        ) : undefined
      }
    >
      <ScreenHeader
        title="Your application"
        subtitle={
          editable
            ? 'Complete each section. Your answers save automatically.'
            : 'Your application has been submitted and can no longer be edited.'
        }
        right={<StatusBadge status={application.status} size="sm" />}
      />

      {!editable ? (
        <Banner
          tone="info"
          title="Submitted"
          message="You can still view your answers below, but they cannot be changed."
          icon="lock-closed-outline"
        />
      ) : null}

      {form.saveState === 'error' ? (
        <Banner
          tone="warning"
          title="Saved on this device"
          message="We could not reach our servers, so your work is stored on your phone and will sync when you are back online."
          icon="cloud-offline-outline"
        />
      ) : null}

      <Card style={styles.progressCard}>
        <ProgressBar
          value={totalCount === 0 ? 0 : completedCount / totalCount}
          label={`${completedCount} of ${totalCount} sections complete`}
          showPercentage
          tone={readyToReview ? 'success' : 'brand'}
        />
      </Card>

      <View style={styles.steps}>
        {steps.map((step, index) => {
          const isReview = step.kind === 'review';
          const locked = isReview && !readyToReview;

          return (
            <Card
              key={step.id}
              variant="outlined"
              onPress={
                locked
                  ? undefined
                  : () => {
                      if (step.kind === 'documents') router.push('/(applicant)/documents');
                      else if (isReview) router.push('/(applicant)/application/review');
                      else router.push(`/(applicant)/application/${step.id}`);
                    }
              }
              accessibilityLabel={`${step.title}, ${step.complete ? 'complete' : 'incomplete'}${
                editable ? '' : ', view only'
              }`}
              accessibilityHint={locked ? 'Complete every section first' : undefined}
              style={[styles.stepCard, locked && styles.stepCardLocked]}
            >
              <View
                style={[
                  styles.stepNumber,
                  step.complete && styles.stepNumberComplete,
                ]}
              >
                {step.complete ? (
                  <Ionicons name="checkmark" size={16} color={colors.onBrand} />
                ) : (
                  <Text variant="label" muted>
                    {index + 1}
                  </Text>
                )}
              </View>

              <View style={styles.stepText}>
                <Text variant="bodyMedium">{step.title}</Text>
                <Text variant="caption" muted numberOfLines={2}>
                  {step.description}
                </Text>
              </View>

              {/*
                Once submitted the sections are still worth opening, but a
                chevron promises editing. An eye says "look", which is what it
                actually does now.
              */}
              <Ionicons
                name={
                  locked ? 'lock-closed-outline' : editable ? 'chevron-forward' : 'eye-outline'
                }
                size={18}
                color={colors.textMuted}
              />
            </Card>
          );
        })}
      </View>

      {documentsOpen && !documentsComplete ? (
        <Banner
          tone="warning"
          title="Documents still needed"
          message="You cannot submit until every required document has been uploaded."
          action={{ label: 'Upload now', onPress: () => router.push('/(applicant)/documents') }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressCard: {
    marginBottom: spacing.base,
  },
  steps: {
    gap: spacing.sm,
  },
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  stepCardLocked: {
    opacity: 0.55,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberComplete: {
    backgroundColor: colors.success,
  },
  stepText: {
    flex: 1,
    gap: 1,
  },
});
