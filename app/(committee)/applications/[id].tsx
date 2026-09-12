/**
 * Application detail — the reviewer's working surface.
 *
 * The action bar is generated from the workflow engine: whatever transitions
 * are legal from this status for this role appear as buttons, with blocked ones
 * disabled and explaining why. Adding a stage to `workflow.config.ts` therefore
 * adds a button here with no change to this screen.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  ApplicationTimeline,
  CommitteeScoreSummary,
  DocumentViewer,
  ScoreSheetCard,
  StatusBadge,
} from '@/components/app';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Banner, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import {
  APPLICATION_STEPS,
  DOCUMENT_STATUS_LABELS,
  getReasons,
  getVisibleFields,
  type FieldDefinition,
} from '@/config';
import {
  useApplicationContext,
  useDocuments,
  useInvalidateApplication,
  useReviews,
  useStatusHistory,
} from '@/hooks/queries';
import { toUserError } from '@/lib/errors';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { useActor } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { agreementService } from '@/services/agreement.service';
import { documentService } from '@/services/document.service';
import { monitoringService } from '@/services/monitoring.service';
import { reviewService } from '@/services/review.service';
import { applicationService } from '@/services/application.service';
import { colors, rhythm, spacing, type Tone } from '@/theme';
import type { DocumentRow } from '@/types/database';
import { getAvailableTransitions, getStatusDefinition } from '@/workflow/engine';

const DOC_TONES: Record<string, Tone> = {
  uploaded: 'info',
  under_review: 'progress',
  verified: 'success',
  rejected: 'danger',
};

/**
 * Scoring is open while the decision still is. Once an application is approved
 * or declined the sheet locks: scores are a record of the judgement made at the
 * time, not something to be revised afterwards.
 */
const SCOREABLE_STATUSES = ['submitted', 'verification', 'committee_review'];

export default function ApplicationDetailScreen() {
  const router = useRouter();
  const toast = useToast();
  const actor = useActor();
  const invalidate = useInvalidateApplication();
  const { id } = useLocalSearchParams<{ id: string }>();

  const context = useApplicationContext(id);
  const { data: documents = [] } = useDocuments(id);
  const { data: reviews = [] } = useReviews(id);
  const { data: history = [] } = useStatusHistory(id);

  const [noteSheet, setNoteSheet] = useState(false);
  const [note, setNote] = useState('');
  const [decisionSheet, setDecisionSheet] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [reasonNote, setReasonNote] = useState('');
  const [rejectingDocument, setRejectingDocument] = useState<DocumentRow | null>(null);
  const [docReasonCode, setDocReasonCode] = useState<string | null>(null);
  const [docReasonNote, setDocReasonNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingScores, setSavingScores] = useState(false);

  // Score rows are separated from note rows: the sheet edits this reviewer's
  // own row, the summary averages everybody's.
  const scoreRows = useMemo(
    () => reviews.filter((review) => review.decision === 'score'),
    [reviews],
  );
  const myScores = useMemo(
    () => scoreRows.find((review) => review.reviewer_id === actor.id)?.scores ?? {},
    [scoreRows, actor.id],
  );
  const noteRows = useMemo(
    () => reviews.filter((review) => review.decision !== 'score'),
    [reviews],
  );

  async function handleSaveScores(scores: Record<string, number>) {
    if (!application) return;
    setSavingScores(true);
    try {
      await reviewService.saveScores(application.id, actor, scores);
      invalidate(application.id);
      toast.success('Scores saved', 'Only the committee can see your assessment.');
    } catch (error) {
      toast.error(error, 'Could not save your scores');
    } finally {
      setSavingScores(false);
    }
  }

  const application = context.data?.application;
  const values = useMemo(
    () => (application?.form_data as Record<string, unknown>) ?? {},
    [application?.form_data],
  );

  /** Every transition legal from here, with its blockers. */
  const transitions = useMemo(() => {
    if (!application || !context.data) return [];
    return getAvailableTransitions(
      application.status,
      actor.role,
      context.data.workflowContext,
      { isOwnApplication: application.applicant_id === actor.id },
    );
  }, [application, context.data, actor.role, actor.id]);

  /** True when a staff member is looking at their own application. */
  const isOwnApplication = application?.applicant_id === actor.id;

  /*
    Verifying evidence belongs to the verification stage.

    These buttons used to stay live for the life of the record, so a document
    could be rejected on an application that had already been approved, signed
    for and paid out. After a decision has been made, a reviewer who finds a
    problem should return or decline the application — those carry a reason and
    an audit trail; changing a verdict underneath a decision does not.
  */
  const documentsReviewable = Boolean(
    application && getStatusDefinition(application.status).documentsReviewable,
  );

  const runTransition = useCallback(
    async (transitionId: string, options: { reasonCode?: string; reasonNote?: string } = {}) => {
      if (!application) return;

      setBusy(true);
      try {
        // Some transitions have a side effect beyond the status change, so they
        // route through the service that owns that side effect.
        if (transitionId === 'issue_agreement') {
          await agreementService.issue(application.id, application.applicant_id, actor);
        } else if (transitionId === 'start_monitoring') {
          await monitoringService.startMonitoring(
            application.id,
            application.applicant_id,
            actor,
          );
        } else if (transitionId === 'begin_verification') {
          await applicationService.applyTransition(application.id, transitionId, actor);
          // Uploaded documents become "under review" so the applicant can see
          // that someone is actually looking at them.
          await documentService.markUnderReview(application.id);
        } else if (
          transitionId === 'approve_application' ||
          transitionId === 'reject_application' ||
          transitionId === 'request_changes'
        ) {
          await reviewService.recordDecision(application.id, actor, {
            transitionId,
            decision:
              transitionId === 'approve_application'
                ? 'approve'
                : transitionId === 'reject_application'
                  ? 'reject'
                  : 'request_changes',
            reasonCode: options.reasonCode,
            reasonNote: options.reasonNote,
            internalNote: options.reasonNote,
          });
        } else {
          await applicationService.applyTransition(application.id, transitionId, actor, options);
        }

        invalidate(application.id);
        setDecisionSheet(null);
        setReasonCode(null);
        setReasonNote('');
        toast.success('Updated', 'The applicant has been notified.');
      } catch (error) {
        toast.error(error, 'Could not complete that action');
      } finally {
        setBusy(false);
      }
    },
    [application, actor, invalidate, toast],
  );

  async function handleVerifyDocument(document: DocumentRow) {
    setBusy(true);
    try {
      await documentService.verify(document.id, actor);
      invalidate(id);
      toast.success('Document verified');
    } catch (error) {
      toast.error(error, 'Could not verify the document');
    } finally {
      setBusy(false);
    }
  }

  async function handleRejectDocument() {
    if (!rejectingDocument || !docReasonCode) return;

    setBusy(true);
    try {
      await documentService.reject(rejectingDocument.id, actor, docReasonCode, docReasonNote);
      invalidate(id);
      setRejectingDocument(null);
      setDocReasonCode(null);
      setDocReasonNote('');
      toast.success('Document rejected', 'The applicant has been notified.');
    } catch (error) {
      toast.error(error, 'Could not reject the document');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddNote() {
    if (!application || !note.trim()) return;

    setBusy(true);
    try {
      await reviewService.addNote(application.id, actor, note);
      invalidate(application.id);
      setNote('');
      setNoteSheet(false);
      toast.success('Note added', 'Internal notes are never shown to the applicant.');
    } catch (error) {
      toast.error(error, 'Could not add your note');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Opened in the app's own viewer, which blocks screenshots and screen
   * recording. Staff read these documents to verify an applicant, not to keep
   * a copy of their ID in a personal camera roll.
   */
  const [previewing, setPreviewing] = useState<DocumentRow | null>(null);

  if (context.isLoading) {
    return (
      <Screen>
        <LoadingState message="Loading application…" />
      </Screen>
    );
  }

  if (context.isError || !application) {
    return (
      <Screen>
        <ScreenHeader title="Application" showBack />
        <ErrorState
          message={toUserError(context.error).message}
          onRetry={() => void context.refetch()}
        />
      </Screen>
    );
  }

  const activeTransition = decisionSheet
    ? transitions.find((option) => option.transition.id === decisionSheet)?.transition
    : null;
  const reasons = activeTransition?.reasonCatalog ? getReasons(activeTransition.reasonCatalog) : [];

  return (
    <Screen onRefresh={() => void context.refetch()} refreshing={context.isRefetching}>
      <ScreenHeader
        title={application.applicant_name ?? 'Application'}
        subtitle={application.registration_code ?? 'Not yet submitted'}
        showBack
        right={<StatusBadge status={application.status} size="sm" />}
      />

      {/*
        One gap for the whole page rather than a margin on each block. Cards
        carried their own bottom margin and the score sheet, the score summary
        and the banner did not, so those three sat flush against whatever came
        next while everything else was spaced.
      */}
      <View style={styles.stack}>
        {isOwnApplication ? (
          <Banner
            tone="warning"
            message="This is your own application. Staff actions are turned off here — another committee member must verify, score and decide it."
            icon="hand-left-outline"
          />
        ) : null}

        {/* Summary */}
        <Card style={styles.card}>
          <View style={styles.summaryGrid}>
            <SummaryItem label="Business" value={application.business_name ?? '—'} />
            <SummaryItem label="Requested" value={formatCurrency(application.requested_amount)} />
            <SummaryItem
              label="Submitted"
              value={application.submitted_at ? formatDate(application.submitted_at) : 'Not yet'}
            />
            <SummaryItem label="Attempt" value={`#${application.attempt_number}`} />
          </View>

          {application.previous_application_id ? (
            <Banner
              tone="info"
              message="This is a reapplication. The applicant's previous application is preserved."
              icon="refresh-outline"
            />
          ) : null}
        </Card>

        {/* Actions, generated from the workflow */}
        {transitions.length > 0 ? (
          <Card style={styles.card}>
            <Text variant="title3">Actions</Text>

            <View style={styles.actions}>
              {transitions.map(({ transition, allowed, blockers }) => (
                <View key={transition.id} style={styles.actionItem}>
                  <Button
                    label={transition.label}
                    variant={
                      transition.id === 'reject_application'
                        ? 'danger'
                        : transition.id === 'approve_application'
                          ? 'primary'
                          : 'outline'
                    }
                    disabled={!allowed || busy}
                    fullWidth
                    onPress={() => {
                      if (transition.requiresReason) setDecisionSheet(transition.id);
                      else void runTransition(transition.id);
                    }}
                    accessibilityHint={allowed ? transition.confirm : blockers[0]}
                  />

                  {!allowed && blockers[0] ? (
                    <Text variant="caption" color="warningStrong">
                      {blockers[0]}
                    </Text>
                  ) : null}
                </View>
              ))}

              <Button
                label="Add internal note"
                variant="ghost"
                icon="create-outline"
                onPress={() => setNoteSheet(true)}
              />
            </View>
          </Card>
        ) : null}

        {/* Documents */}
        <Card style={styles.card}>
          <Text variant="title3">Documents</Text>

          {!documentsReviewable && documents.length > 0 ? (
          <Text variant="caption" muted>
            Verification is closed for this application. To raise a problem with a document now,
            return the application for corrections or decline it.
          </Text>
        ) : null}

        {documents.length === 0 ? (
            <Text variant="callout" muted>
              No documents uploaded yet.
            </Text>
          ) : (
            documents.map((document) => (
              <View key={document.id} style={styles.documentRow}>
                <View style={styles.documentText}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {document.document_type_id.replace(/_/g, ' ')}
                  </Text>
                  <Text variant="caption" muted numberOfLines={1}>
                    {document.file_name}
                    {document.version > 1 ? ` · version ${document.version}` : ''}
                  </Text>
                  <Badge
                    label={DOCUMENT_STATUS_LABELS[document.status]}
                    tone={DOC_TONES[document.status] ?? 'neutral'}
                    size="sm"
                  />
                </View>

                <View style={styles.documentActions}>
                  <Button
                    label="View"
                    variant="ghost"
                    size="sm"
                    icon="eye-outline"
                    onPress={() => setPreviewing(document)}
                  />
                  {documentsReviewable && !isOwnApplication && document.status !== 'verified' ? (
                    <Button
                      label="Verify"
                      variant="ghost"
                      size="sm"
                      icon="checkmark-circle-outline"
                      disabled={busy}
                      onPress={() => void handleVerifyDocument(document)}
                    />
                  ) : null}
                  {documentsReviewable && !isOwnApplication && document.status !== 'rejected' ? (
                    <Button
                      label="Reject"
                      variant="ghost"
                      size="sm"
                      icon="close-circle-outline"
                      disabled={busy}
                      onPress={() => setRejectingDocument(document)}
                    />
                  ) : null}
                </View>
              </View>
            ))
          )}
        </Card>

        {/* Answers */}
        {APPLICATION_STEPS.filter((step) => step.kind === 'form').map((step) => {
          const fields = getVisibleFields(step, values);
          if (fields.length === 0) return null;

          return (
            <Card key={step.id} style={styles.card}>
              <Text variant="title3">{step.title}</Text>
              {fields.map((field) => (
                <View key={field.id} style={styles.answerRow}>
                  <Text variant="caption" muted>
                    {field.label}
                  </Text>
                  <Text variant="body">{formatAnswer(field, values[field.id])}</Text>
                </View>
              ))}
            </Card>
          );
        })}

        {/* Scoring. Reviewers score before deciding, and the sheet locks after. */}
        <ScoreSheetCard
          value={myScores}
          onSave={handleSaveScores}
          saving={savingScores}
          readOnly={isOwnApplication || !SCOREABLE_STATUSES.includes(application.status)}
        />

        <CommitteeScoreSummary sheets={scoreRows.map((review) => review.scores)} />

        {/* Review notes */}
        {noteRows.length > 0 ? (
          <Card style={styles.card}>
            <Text variant="title3">Review notes</Text>
            {noteRows.map((review) => (
              <View key={review.id} style={styles.noteRow}>
                <View style={styles.noteHeader}>
                  <Text variant="label">{review.reviewer?.full_name ?? 'Reviewer'}</Text>
                  <Badge
                    label={review.is_internal ? 'Internal' : 'Shared with applicant'}
                    tone={review.is_internal ? 'neutral' : 'info'}
                    size="sm"
                  />
                </View>
                <Text variant="callout" muted>
                  {review.notes}
                </Text>
                <Text variant="caption" muted>
                  {formatDateTime(review.created_at)}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        {/* History */}
        <Card style={styles.card}>
          <Text variant="title3">Status history</Text>
          {history.map((entry) => (
            <View key={entry.id} style={styles.historyRow}>
              <Ionicons name="ellipse" size={7} color={colors.brandMuted} />
              <View style={styles.historyText}>
                <Text variant="callout">
                  {entry.from_status ? `${entry.from_status} → ` : ''}
                  {entry.to_status}
                </Text>
                <Text variant="caption" muted>
                  {formatDateTime(entry.created_at)}
                  {entry.reason_code ? ` · ${entry.reason_code.replace(/_/g, ' ')}` : ''}
                </Text>
              </View>
            </View>
          ))}
        </Card>

        <Card style={styles.card}>
          <Text variant="title3">Journey</Text>
          <ApplicationTimeline status={application.status} />
        </Card>
      </View>

      {/* ------------------------------ Sheets ----------------------------- */}

      <Sheet
        visible={Boolean(decisionSheet)}
        onClose={() => setDecisionSheet(null)}
        title={activeTransition?.label ?? 'Confirm'}
        subtitle={activeTransition?.confirm}
      >
        <Text variant="label">Reason</Text>
        {reasons.map((reason) => (
          <Button
            key={reason.id}
            label={reason.label}
            variant={reasonCode === reason.id ? 'secondary' : 'outline'}
            fullWidth
            onPress={() => setReasonCode(reason.id)}
          />
        ))}

        <TextField
          label="Notes"
          value={reasonNote}
          onChangeText={setReasonNote}
          rows={3}
          placeholder="Add any detail that should be recorded with this decision."
          helpText="Kept as an internal note."
        />

        <Button
          label={activeTransition?.label ?? 'Confirm'}
          variant={decisionSheet === 'reject_application' ? 'danger' : 'primary'}
          disabled={!reasonCode || busy}
          loading={busy}
          fullWidth
          size="lg"
          onPress={() =>
            decisionSheet &&
            void runTransition(decisionSheet, {
              reasonCode: reasonCode ?? undefined,
              reasonNote: reasonNote || undefined,
            })
          }
        />
      </Sheet>

      <Sheet
        visible={Boolean(rejectingDocument)}
        onClose={() => setRejectingDocument(null)}
        title="Reject this document"
        subtitle="The applicant is told which document and why."
      >
        {getReasons('document_rejection').map((reason) => (
          <Button
            key={reason.id}
            label={reason.label}
            variant={docReasonCode === reason.id ? 'secondary' : 'outline'}
            fullWidth
            onPress={() => setDocReasonCode(reason.id)}
          />
        ))}

        <TextField
          label="Explanation for the applicant"
          value={docReasonNote}
          onChangeText={setDocReasonNote}
          rows={3}
          placeholder="Tell them exactly what to fix."
        />

        <Button
          label="Reject document"
          variant="danger"
          disabled={!docReasonCode || busy}
          loading={busy}
          fullWidth
          onPress={handleRejectDocument}
        />
      </Sheet>

      <Sheet
        visible={noteSheet}
        onClose={() => setNoteSheet(false)}
        title="Internal note"
        subtitle="Only the committee and administrators can see this."
      >
        <TextField
          value={note}
          onChangeText={setNote}
          rows={4}
          placeholder="What should other reviewers know?"
          accessibilityLabel="Internal note"
        />
        <Button
          label="Save note"
          onPress={handleAddNote}
          disabled={!note.trim() || busy}
          loading={busy}
          fullWidth
        />
      </Sheet>

      <DocumentViewer
        visible={Boolean(previewing)}
        onClose={() => setPreviewing(null)}
        document={previewing}
        subtitle={previewing?.document_type_id.replace(/_/g, ' ')}
        actor={actor}
      />
    </Screen>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryItem}>
      <Text variant="caption" muted>
        {label}
      </Text>
      <Text variant="bodyMedium" numberOfLines={1}>
        {value}
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
      return field.options?.find((option) => option.value === value)?.label ?? String(value);
    default:
      return String(value);
  }
}

const styles = StyleSheet.create({
  stack: {
    gap: rhythm.section,
  },
  card: {
    gap: spacing.md,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.base,
  },
  summaryItem: {
    minWidth: '45%',
    flexGrow: 1,
    gap: 1,
  },
  actions: {
    gap: spacing.sm,
  },
  actionItem: {
    gap: spacing.xs,
  },
  documentRow: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  documentText: {
    gap: spacing.xs,
  },
  documentActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  answerRow: {
    gap: 1,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  noteRow: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  historyText: {
    flex: 1,
    gap: 1,
  },
});
