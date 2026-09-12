/**
 * Grant agreement — review and sign (brief §16).
 *
 * The clause text shown is the frozen snapshot stored when the agreement was
 * issued, not the current template, so editing the template can never change
 * what somebody already agreed to.
 *
 * The content is placeholder and says so, prominently and repeatedly.
 */
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { StatusBadge } from '@/components/app';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Checkbox } from '@/components/ui/Choice';
import { Banner, EmptyState, LoadingState } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { AGREEMENT_ACKNOWLEDGEMENTS, SIGNATURE_METHODS } from '@/config/agreement.config';
import { useAgreement, useInvalidateApplication, useMyApplication } from '@/hooks/queries';
import { formatDateTime } from '@/lib/format';
import { useActor, useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { agreementService } from '@/services/agreement.service';
import { colors, rhythm, spacing } from '@/theme';

export default function AgreementScreen() {
  const router = useRouter();
  const toast = useToast();
  const actor = useActor();
  const { profile } = useAuth();
  const invalidate = useInvalidateApplication();

  const { data: application, isLoading } = useMyApplication();
  const { data: agreement, isLoading: loadingAgreement } = useAgreement(application?.id);

  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [signing, setSigning] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const content = useMemo(
    () => agreementService.getDisplayContent(agreement ?? null),
    [agreement],
  );

  /** The name on the application is what a typed signature must match. */
  const expectedName = useMemo(() => {
    const formValues = (application?.form_data as Record<string, unknown>) ?? {};
    return (formValues.full_name as string) ?? profile?.full_name ?? '';
  }, [application?.form_data, profile?.full_name]);

  const allAcknowledged = AGREEMENT_ACKNOWLEDGEMENTS.every((item) => acknowledged[item.id]);
  const isSigned = agreement?.status === 'signed';

  /*
    Signed, but the application never moved.

    Before the workflow was fixed, signing wrote the signature and then failed
    to advance the application, which left people in a loop: the home screen
    asks them to sign, this screen says they already have. Repairing it takes
    one call, so this does it rather than showing them the contradiction and
    leaving them to find a way out.
  */
  const stranded = isSigned && application?.status === 'agreement_pending';
  const repairing = useRef(false);

  useEffect(() => {
    if (!stranded || !application || repairing.current) return;
    repairing.current = true;

    void agreementService
      .sign(application.id, actor, { method: 'typed_name', signatureData: '', expectedName })
      .then(() => invalidate(application.id))
      .catch(() => {
        // Nothing to tell the applicant: they signed, and the record of that is
        // safe. The next open tries again.
        repairing.current = false;
      });
  }, [stranded, application, actor, expectedName, invalidate]);

  async function handleSign() {
    if (!application) return;

    setSubmitting(true);
    setNameError(null);
    try {
      await agreementService.sign(application.id, actor, {
        method: 'typed_name',
        signatureData: typedName,
        expectedName,
      });

      invalidate(application.id);
      setSigning(false);
      toast.success('Agreement signed', 'Thank you. The committee will authorise your grant.');
      router.replace('/(applicant)/dashboard');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sign the agreement.';
      // A name mismatch belongs on the field, not in a toast that disappears.
      if (message.toLowerCase().includes('name')) setNameError(message);
      else toast.error(error, 'Could not sign the agreement');
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading || loadingAgreement) {
    return (
      <Screen>
        <LoadingState message="Loading your agreement…" />
      </Screen>
    );
  }

  if (!application) {
    return (
      <Screen>
        <ScreenHeader title="Agreement" showBack />
        <EmptyState title="No application" message="You do not have an application yet." />
      </Screen>
    );
  }

  if (!agreement) {
    return (
      <Screen>
        <ScreenHeader title="Grant agreement" showBack />
        <EmptyState
          icon="document-lock-outline"
          title="No agreement yet"
          message="Your grant agreement will appear here once your application has been approved and the committee has issued it."
        />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        isSigned ? (
          <Button
            label="Back to dashboard"
            variant="outline"
            onPress={() => router.replace('/(applicant)/dashboard')}
            fullWidth
          />
        ) : (
          <Button
            label="Sign agreement"
            onPress={() => setSigning(true)}
            disabled={!allAcknowledged}
            fullWidth
            size="lg"
            icon="create-outline"
            accessibilityHint={
              allAcknowledged ? undefined : 'Confirm each statement above before signing.'
            }
          />
        )
      }
    >
      <ScreenHeader
        title="Grant agreement"
        subtitle={`Version ${content.version}`}
        showBack
        right={<StatusBadge status={application.status} size="sm" />}
      />

      {/*
        One gap for the page rather than a margin here and there. The draft
        warning and the signed confirmation are adjacent banners and sat flush
        against each other, which read as one block with two headings.
      */}
      <View style={styles.stack}>
        {/* The placeholder warning is not dismissible and is shown first. */}
        <Banner
          tone="warning"
          title="Draft agreement"
          message={content.notice}
          icon="construct-outline"
        />

        {isSigned ? (
          <Banner
            tone="success"
            title="Signed"
            message={`You signed this agreement on ${formatDateTime(agreement.signed_at)}${
              agreement.signer_name ? ` as ${agreement.signer_name}` : ''
            }.`}
          />
        ) : null}

        <Card style={styles.document}>
          {content.clauses.map((clause) => (
            <View key={clause.id} style={styles.clause}>
              <Text variant="title3" accessibilityRole="header">
                {clause.heading}
              </Text>
              <Text variant="body" color="textSecondary">
                {clause.body}
              </Text>
            </View>
          ))}
        </Card>

        {!isSigned ? (
          <View style={styles.acknowledgements}>
            <Text variant="label">Before you sign</Text>

            {AGREEMENT_ACKNOWLEDGEMENTS.map((item) => (
              <Checkbox
                key={item.id}
                label={item.label}
                checked={acknowledged[item.id] ?? false}
                onChange={(checked) =>
                  setAcknowledged((current) => ({ ...current, [item.id]: checked }))
                }
              />
            ))}
          </View>
        ) : null}
      </View>

      <Sheet
        visible={signing}
        onClose={() => setSigning(false)}
        title="Sign your agreement"
        subtitle={SIGNATURE_METHODS.typed_name.description}
      >
        <TextField
          label="Your full name"
          value={typedName}
          onChangeText={(text) => {
            setTypedName(text);
            setNameError(null);
          }}
          placeholder={expectedName || 'Your full legal name'}
          autoCapitalize="words"
          autoCorrect={false}
          error={nameError}
          helpText="This must match the name on your application."
          required
        />

        <Text variant="caption" muted>
          By typing your name and confirming, you are signing this agreement electronically. A
          record of your signature, the date and the agreement version is stored.
        </Text>

        <Button
          label="Confirm and sign"
          onPress={handleSign}
          loading={submitting}
          disabled={typedName.trim().length < 3}
          fullWidth
          size="lg"
        />
        <Button label="Cancel" variant="ghost" onPress={() => setSigning(false)} fullWidth />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: rhythm.section,
  },
  document: {
    gap: spacing.lg,
  },
  clause: {
    gap: spacing.xs,
  },
  acknowledgements: {
    gap: spacing.sm,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
});
