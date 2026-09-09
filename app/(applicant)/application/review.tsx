/**
 * Review and submit.
 *
 * Submission is a workflow transition, so this screen never decides whether the
 * application may be submitted — it asks the engine, and renders whatever
 * blockers come back. Adding a new precondition in `workflow.config.ts` shows up
 * here as a new blocker with no change to this file.
 */
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Banner, LoadingState } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import {
  APPLICATION_STEPS,
  getVisibleFields,
  type FieldDefinition,
} from '@/config/form.config';
import { useApplicationContext, useInvalidateApplication, useMyApplication } from '@/hooks/queries';
import { clearLocalDraft } from '@/hooks/useApplicationForm';
import { formatCurrency, formatDate, formatDateShort } from '@/lib/format';
import { useActor } from '@/providers/AuthProvider';
import { useNetwork } from '@/providers/NetworkProvider';
import { useToast } from '@/providers/ToastProvider';
import { applicationService } from '@/services/application.service';
import { colors, spacing } from '@/theme';
import { getAvailableTransitions, isFormEditable } from '@/workflow/engine';

export default function ReviewScreen() {
  const router = useRouter();
  const toast = useToast();
  const actor = useActor();
  const invalidate = useInvalidateApplication();

  const { data: application, isLoading } = useMyApplication();
  const { data: context } = useApplicationContext(application?.id);

  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { isOnline } = useNetwork();

  const values = useMemo(
    () => (application?.form_data as Record<string, unknown>) ?? {},
    [application?.form_data],
  );

  /** Ask the engine what can happen, rather than deciding here. */
  const submitOption = useMemo(() => {
    if (!application || !context) return null;
    return (
      getAvailableTransitions(application.status, actor.role, context.workflowContext).find(
        (option) => option.transition.id === 'submit_application',
      ) ?? null
    );
  }, [application, context, actor.role]);

  async function handleSubmit() {
    if (!application) return;

    setSubmitting(true);
    try {
      const updated = await applicationService.applyTransition(
        application.id,
        'submit_application',
        actor,
      );

      await clearLocalDraft(application.id);
      invalidate(application.id);
      setConfirming(false);

      router.replace({
        pathname: '/(applicant)/application/submitted',
        params: { code: updated.registration_code ?? '' },
      });
    } catch (error) {
      setConfirming(false);
      toast.error(error, 'Could not submit your application');
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading || !application) {
    return (
      <Screen>
        <LoadingState message="Loading your application…" />
      </Screen>
    );
  }

  const blockers = submitOption?.blockers ?? [];
  const canSubmit = submitOption?.allowed ?? false;

  // The same screen serves two purposes: the last check before submitting, and
  // the record of what was sent. After submission there is nothing to edit and
  // nothing to submit, so every control that implies otherwise comes off.
  const editable = isFormEditable(application.status);

  return (
    <Screen
      footer={
        editable ? (
          <Button
            label={isOnline ? 'Submit application' : 'Waiting for a connection'}
            onPress={() => setConfirming(true)}
            // Submitting is deliberately not queued for later. It issues a
            // registration code the applicant needs to see, and sending a grant
            // application on someone's behalf while they are not watching is
            // not a decision this app should make for them.
            disabled={!canSubmit || !isOnline}
            fullWidth
            size="lg"
            icon={isOnline ? 'paper-plane-outline' : 'cloud-offline-outline'}
            accessibilityHint={
              !isOnline
                ? 'You need an internet connection to submit'
                : canSubmit
                  ? 'Opens a confirmation'
                  : blockers[0] ?? 'Complete every section first'
            }
          />
        ) : undefined
      }
    >
      <ScreenHeader
        title={editable ? 'Review your application' : 'Your answers'}
        subtitle={
          editable
            ? 'Check everything carefully. You will not be able to edit after submitting.'
            : application.submitted_at
              ? `Submitted ${formatDateShort(application.submitted_at)}. These answers cannot be changed.`
              : 'These answers can no longer be changed.'
        }
        showBack
      />

      {editable && !isOnline ? (
        <Banner
          tone="warning"
          title="You are offline"
          message="Your answers are saved on this phone. You can submit as soon as you have a connection."
          icon="cloud-offline-outline"
        />
      ) : null}

      {!editable ? (
        <Banner
          tone="info"
          title="Locked"
          message="Your application is with the review team. Nothing here can be edited."
          icon="lock-closed-outline"
        />
      ) : blockers.length > 0 ? (
        <Card variant="outlined" style={styles.blockers}>
          <View style={styles.blockerHeader}>
            <Ionicons name="alert-circle" size={20} color={colors.warningStrong} />
            <Text variant="title3">Before you can submit</Text>
          </View>

          {blockers.map((blocker) => (
            <View key={blocker} style={styles.blockerRow}>
              <Ionicons name="ellipse" size={6} color={colors.warningStrong} />
              <Text variant="callout" color="warningStrong" style={styles.blockerText}>
                {blocker}
              </Text>
            </View>
          ))}

          <Button
            label="Go to my application"
            variant="outline"
            onPress={() => router.push('/(applicant)/application')}
          />
        </Card>
      ) : (
        <Banner
          tone="success"
          title="Ready to submit"
          message="Everything we need is complete. Review your answers below, then submit."
        />
      )}

      {APPLICATION_STEPS.filter((step) => step.kind === 'form').map((step) => {
        const fields = getVisibleFields(step, values);
        if (fields.length === 0) return null;

        return (
          <Card key={step.id} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="title3">{step.title}</Text>
              {editable ? (
                <Button
                  label="Edit"
                  variant="ghost"
                  size="sm"
                  onPress={() => router.push(`/(applicant)/application/${step.id}`)}
                  accessibilityLabel={`Edit ${step.title}`}
                />
              ) : null}
            </View>

            {fields.map((field) => (
              <ReviewRow key={field.id} field={field} value={values[field.id]} />
            ))}
          </Card>
        );
      })}

      <Sheet
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="Submit your application?"
        subtitle="Once submitted, your application cannot be edited. Please make sure everything is correct."
      >
        <Banner
          tone="info"
          message="You will receive a registration code. Keep it safe — you may need it for verification."
          icon="key-outline"
        />

        <Button
          label="Yes, submit my application"
          onPress={handleSubmit}
          loading={submitting}
          fullWidth
          size="lg"
        />
        <Button
          label="Not yet"
          variant="ghost"
          onPress={() => setConfirming(false)}
          fullWidth
        />
      </Sheet>
    </Screen>
  );
}

/** One answer, formatted according to its field type. */
function ReviewRow({ field, value }: { field: FieldDefinition; value: unknown }) {
  return (
    <View style={styles.row}>
      <Text variant="caption" muted>
        {field.label}
      </Text>
      <Text variant="body" color={value === undefined || value === '' ? 'textMuted' : 'text'}>
        {formatAnswer(field, value)}
      </Text>
    </View>
  );
}

function formatAnswer(field: FieldDefinition, value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Not answered';

  switch (field.type) {
    case 'acknowledgement':
    case 'checkbox':
      return value === true ? 'Confirmed' : 'Not confirmed';
    case 'currency':
      return typeof value === 'number' ? formatCurrency(value) : String(value);
    case 'date':
      return formatDate(String(value));
    case 'select':
    case 'radio':
      return (
        field.options?.find((option) => option.value === value)?.label ?? String(value)
      );
    default:
      return String(value);
  }
}

const styles = StyleSheet.create({
  blockers: {
    gap: spacing.md,
    backgroundColor: colors.warningSurface,
    borderColor: colors.warning,
  },
  blockerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  blockerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  blockerText: {
    flex: 1,
  },
  section: {
    gap: spacing.md,
    marginTop: spacing.base,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  row: {
    gap: 2,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
});
