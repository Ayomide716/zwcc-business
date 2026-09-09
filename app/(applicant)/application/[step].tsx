/**
 * One step of the application form.
 *
 * This single screen renders every form step, because a step is data:
 * `form.config.ts` says which fields exist, `FormFieldRenderer` draws them, and
 * validation is derived from the same definitions. Adding a section to the
 * config makes it appear here with working validation and no new code.
 */
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { FormFieldRenderer } from '@/components/app';
import { Button } from '@/components/ui/Button';
import { Banner, LoadingState } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { StepIndicator } from '@/components/ui/Progress';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { APPLICATION_STEPS, getStep, getVisibleFields } from '@/config/form.config';
import { useMyApplication } from '@/hooks/queries';
import { useApplicationForm } from '@/hooks/useApplicationForm';
import { colors, spacing } from '@/theme';
import { isFormEditable } from '@/workflow/engine';

export default function ApplicationStepScreen() {
  const router = useRouter();
  const { step: stepId } = useLocalSearchParams<{ step: string }>();

  const { data: application, isLoading } = useMyApplication();

  const serverValues = useMemo(
    () => (application?.form_data as Record<string, unknown>) ?? {},
    [application?.form_data],
  );

  const form = useApplicationForm(application?.id ?? null, serverValues);

  const step = getStep(stepId ?? '');
  const editable = application ? isFormEditable(application.status) : false;

  /** Only the fields whose conditions currently hold. */
  const visibleFields = useMemo(
    () => (step ? getVisibleFields(step, form.values) : []),
    [step, form.values],
  );

  /** Order of the steps that are actually navigable from here. */
  const navigableSteps = useMemo(
    () => APPLICATION_STEPS.filter((candidate) => candidate.kind !== 'review'),
    [],
  );

  const currentIndex = navigableSteps.findIndex((candidate) => candidate.id === stepId);
  const nextStep = navigableSteps[currentIndex + 1];
  const previousStep = navigableSteps[currentIndex - 1];

  if (isLoading || form.hydrating) {
    return (
      <Screen>
        <LoadingState message="Loading your answers…" />
      </Screen>
    );
  }

  if (!step || step.kind !== 'form') {
    return (
      <Screen>
        <ScreenHeader title="Section not found" showBack />
        <Banner
          tone="warning"
          message="That section is no longer part of the application. Go back to see the current sections."
        />
      </Screen>
    );
  }

  async function goNext() {
    if (!step) return;

    if (!form.validate(step.id)) {
      // Errors are now rendered under each field; nothing more to announce.
      return;
    }

    await form.flush(step.id);

    if (!nextStep) {
      router.push('/(applicant)/application/review');
      return;
    }

    if (nextStep.kind === 'documents') {
      router.push('/(applicant)/documents');
      return;
    }

    router.push(`/(applicant)/application/${nextStep.id}`);
  }

  async function goBack() {
    if (step) await form.flush(step.id);
    router.back();
  }

  return (
    <Screen
      footer={
        <View style={styles.footer}>
          {previousStep ? (
            <Button label="Back" variant="outline" onPress={goBack} icon="chevron-back" />
          ) : null}

          <Button
            label={nextStep ? 'Next' : 'Review'}
            onPress={goNext}
            disabled={!editable}
            icon="chevron-forward"
            iconPosition="right"
            style={styles.nextButton}
          />
        </View>
      }
    >
      <StepIndicator
        steps={navigableSteps.map((candidate) => ({
          id: candidate.id,
          shortTitle: candidate.shortTitle,
        }))}
        currentStepId={step.id}
        completedStepIds={form.completedStepIds}
        onStepPress={(targetId) => {
          if (targetId === step.id) return;
          const target = navigableSteps.find((candidate) => candidate.id === targetId);
          if (target?.kind === 'documents') router.push('/(applicant)/documents');
          else router.push(`/(applicant)/application/${targetId}`);
        }}
      />

      <ScreenHeader title={step.title} subtitle={step.description} showBack onBack={goBack} />

      {!editable ? (
        <Banner
          tone="info"
          title="Read only"
          message="Your application has been submitted, so these answers can no longer be changed."
          icon="lock-closed-outline"
        />
      ) : null}

      <View style={styles.fields}>
        {visibleFields.map((field) => (
          <FormFieldRenderer
            key={field.id}
            field={field}
            value={form.values[field.id]}
            error={form.errors[field.id]}
            onChange={(value) => form.setValue(field.id, value)}
            disabled={!editable}
          />
        ))}
      </View>

      <SaveIndicator state={form.saveState} />
    </Screen>
  );
}

function SaveIndicator({ state }: { state: ReturnType<typeof useApplicationForm>['saveState'] }) {
  const copy: Record<typeof state, string | null> = {
    idle: null,
    saving: 'Saving…',
    saved: 'All changes saved',
    error: 'Saved on this device — will sync when you are online',
  };

  const message = copy[state];
  if (!message) return null;

  return (
    <Text
      variant="caption"
      color={state === 'error' ? 'warningStrong' : 'textMuted'}
      align="center"
      style={styles.saveIndicator}
      accessibilityLiveRegion="polite"
    >
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  fields: {
    gap: spacing.lg,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  nextButton: {
    flex: 1,
  },
  saveIndicator: {
    marginTop: spacing.lg,
    color: colors.textMuted,
  },
});
