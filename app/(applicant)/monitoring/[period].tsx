/**
 * Submit (or view) one month's business progress report.
 *
 * Media handling is deliberately forgiving: photos are attached locally first,
 * uploaded one at a time on submit, and a failure on one photo does not discard
 * the written report or the other attachments.
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Banner, EmptyState, LoadingState } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { PROGRESS_MEDIA_CONFIG } from '@/config/documents.config';
import { REPORT_FIELDS, type ReportFieldDefinition } from '@/config/monitoring.config';
import { useInvalidateApplication, useMonitoringOverview, useMyBeneficiary } from '@/hooks/queries';
import { useFilePicker } from '@/hooks/useFilePicker';
import { formatCurrencyInput, formatDate, parseCurrencyInput } from '@/lib/format';
import { GRANT_PROGRAM } from '@/config/program.config';
import { useToast } from '@/providers/ToastProvider';
import { monitoringService } from '@/services/monitoring.service';
import type { LocalFile } from '@/services/storage.service';
import { colors, radius, spacing } from '@/theme';

interface Attachment {
  file: LocalFile;
  type: 'image' | 'video';
}

export default function ReportScreen() {
  const router = useRouter();
  const toast = useToast();
  const { pick } = useFilePicker();
  const invalidate = useInvalidateApplication();
  const { period: periodParam } = useLocalSearchParams<{ period: string }>();

  const { data: beneficiary, isLoading } = useMyBeneficiary();
  const { data: overview, isLoading: loadingOverview } = useMonitoringOverview(beneficiary?.id);

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [mediaSheet, setMediaSheet] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const periodNumber = Number.parseInt(periodParam ?? '', 10);
  const period = useMemo(
    () => overview?.periods.find((candidate) => candidate.periodNumber === periodNumber) ?? null,
    [overview?.periods, periodNumber],
  );

  const imageCount = attachments.filter((item) => item.type === 'image').length;
  const videoCount = attachments.filter((item) => item.type === 'video').length;

  function validate(): boolean {
    const next: Record<string, string> = {};

    for (const field of REPORT_FIELDS) {
      const value = values[field.id];

      if (field.required) {
        if (value === undefined || value === null || value === '') {
          next[field.id] = 'This is required.';
          continue;
        }
        if (
          field.minLength &&
          typeof value === 'string' &&
          value.trim().length < field.minLength
        ) {
          next[field.id] = `Please write at least ${field.minLength} characters.`;
        }
      }
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function addMedia(type: 'image' | 'video', source: 'camera' | 'library') {
    setMediaSheet(false);

    const rules = PROGRESS_MEDIA_CONFIG[type];
    const current = type === 'image' ? imageCount : videoCount;

    if (current >= rules.maxCount) {
      toast.info(
        'Limit reached',
        `You can attach up to ${rules.maxCount} ${type === 'image' ? 'photos' : 'videos'}.`,
      );
      return;
    }

    try {
      const files = await pick(source, {
        allowVideo: type === 'video',
        multiple: type === 'image',
        accepts: [...rules.accepts],
      });

      const room = rules.maxCount - current;
      setAttachments((existing) => [
        ...existing,
        ...files.slice(0, room).map((file) => ({ file, type })),
      ]);
    } catch (error) {
      toast.error(error, 'Could not attach that');
    }
  }

  async function handleSubmit() {
    if (!beneficiary || !period) return;
    if (!validate()) return;

    setSubmitting(true);
    try {
      const { mediaErrors } = await monitoringService.submitReport(
        beneficiary,
        period,
        values,
        attachments.map((item) => ({ file: item.file, type: item.type })),
      );

      invalidate(beneficiary.application_id);

      if (mediaErrors.length > 0) {
        toast.info(
          'Report submitted',
          `${mediaErrors.length} attachment${mediaErrors.length === 1 ? '' : 's'} could not be uploaded. You can add them later.`,
        );
      } else {
        toast.success('Report submitted', 'Thank you for your update.');
      }

      router.replace('/(applicant)/monitoring');
    } catch (error) {
      toast.error(error, 'Could not submit your report');
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading || loadingOverview) {
    return (
      <Screen>
        <LoadingState message="Loading…" />
      </Screen>
    );
  }

  if (!beneficiary || !period) {
    return (
      <Screen>
        <ScreenHeader title="Report" showBack />
        <EmptyState title="Report not found" message="That reporting period does not exist." />
      </Screen>
    );
  }

  /* Already submitted — show it read-only. */
  if (period.report) {
    const submitted = period.report.data as Record<string, unknown>;

    return (
      <Screen>
        <ScreenHeader
          title={`${period.label} report`}
          subtitle={`Submitted ${formatDate(period.report.submitted_at)}`}
          showBack
        />

        {period.report.status === 'reviewed' && period.report.review_notes ? (
          <Banner
            tone="success"
            title="Reviewed by our team"
            message={period.report.review_notes}
          />
        ) : null}

        <Card style={styles.readonly}>
          {REPORT_FIELDS.map((field) => (
            <View key={field.id} style={styles.readonlyRow}>
              <Text variant="caption" muted>
                {field.label}
              </Text>
              <Text variant="body">
                {formatReportValue(field, submitted[field.id])}
              </Text>
            </View>
          ))}
        </Card>
      </Screen>
    );
  }

  if (!period.submittable) {
    return (
      <Screen>
        <ScreenHeader title={`${period.label} report`} showBack />
        <EmptyState
          icon="calendar-outline"
          title="Not open yet"
          message={`This report opens shortly before it is due on ${formatDate(period.dueDate)}.`}
        />
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <Button
          label="Submit report"
          onPress={handleSubmit}
          loading={submitting}
          fullWidth
          size="lg"
          icon="paper-plane-outline"
        />
      }
    >
      <ScreenHeader
        title={`${period.label} report`}
        subtitle={`Due ${formatDate(period.dueDate)}`}
        showBack
      />

      {period.status === 'overdue' ? (
        <Banner
          tone="warning"
          title="This report is overdue"
          message="Please submit it as soon as you can."
        />
      ) : null}

      <View style={styles.fields}>
        {REPORT_FIELDS.map((field) => (
          <ReportField
            key={field.id}
            field={field}
            value={values[field.id]}
            error={errors[field.id]}
            onChange={(value) => {
              setValues((current) => ({ ...current, [field.id]: value }));
              setErrors((current) => {
                if (!current[field.id]) return current;
                const next = { ...current };
                delete next[field.id];
                return next;
              });
            }}
          />
        ))}
      </View>

      {/* Attachments */}
      <View style={styles.mediaSection}>
        <View style={styles.mediaHeader}>
          <Text variant="label">Photos and video</Text>
          <Text variant="caption" muted>
            {imageCount}/{PROGRESS_MEDIA_CONFIG.image.maxCount} photos ·{' '}
            {videoCount}/{PROGRESS_MEDIA_CONFIG.video.maxCount} videos
          </Text>
        </View>

        <Text variant="caption" muted>
          Photos of your shop, stock or work help us see your progress. They are compressed before
          upload to save your data.
        </Text>

        {attachments.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow}>
            {attachments.map((item, index) => (
              <View key={`${item.file.uri}-${index}`} style={styles.thumb}>
                {item.type === 'image' ? (
                  <Image source={{ uri: item.file.uri }} style={styles.thumbImage} contentFit="cover" />
                ) : (
                  <View style={[styles.thumbImage, styles.thumbVideo]}>
                    <Ionicons name="videocam" size={22} color={colors.brand} />
                  </View>
                )}

                <Pressable
                  onPress={() =>
                    setAttachments((current) => current.filter((_item, i) => i !== index))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Remove attachment ${index + 1}`}
                  hitSlop={8}
                  style={styles.thumbRemove}
                >
                  <Ionicons name="close" size={12} color={colors.textInverse} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        ) : null}

        <Button
          label="Add photo or video"
          variant="outline"
          icon="camera-outline"
          onPress={() => setMediaSheet(true)}
        />
      </View>

      <Sheet visible={mediaSheet} onClose={() => setMediaSheet(false)} title="Add to your report">
        <Button
          label="Take a photo"
          icon="camera-outline"
          variant="outline"
          fullWidth
          onPress={() => void addMedia('image', 'camera')}
        />
        <Button
          label="Choose photos"
          icon="images-outline"
          variant="outline"
          fullWidth
          onPress={() => void addMedia('image', 'library')}
        />
        <Button
          label="Choose a video"
          icon="videocam-outline"
          variant="outline"
          fullWidth
          onPress={() => void addMedia('video', 'library')}
        />
        <Text variant="caption" muted align="center">
          Videos up to {PROGRESS_MEDIA_CONFIG.video.maxSizeMb} MB.
        </Text>
      </Sheet>
    </Screen>
  );
}

function ReportField({
  field,
  value,
  error,
  onChange,
}: {
  field: ReportFieldDefinition;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  if (field.type === 'currency') {
    return (
      <TextField
        label={field.label}
        value={typeof value === 'number' ? formatCurrencyInput(String(value)) : ''}
        onChangeText={(text) => onChange(parseCurrencyInput(text))}
        keyboardType="number-pad"
        inputMode="numeric"
        prefix={GRANT_PROGRAM.currencySymbol}
        placeholder="0"
        required={field.required}
        error={error}
        helpText={field.helpText}
      />
    );
  }

  if (field.type === 'number') {
    return (
      <TextField
        label={field.label}
        value={typeof value === 'number' ? String(value) : ''}
        onChangeText={(text) => {
          const digits = text.replace(/[^\d]/g, '');
          onChange(digits ? Number.parseInt(digits, 10) : null);
        }}
        keyboardType="number-pad"
        inputMode="numeric"
        required={field.required}
        error={error}
        helpText={field.helpText}
      />
    );
  }

  return (
    <TextField
      label={field.label}
      value={typeof value === 'string' ? value : ''}
      onChangeText={onChange}
      rows={field.rows ?? 3}
      maxLength={field.maxLength}
      showCounter={Boolean(field.maxLength)}
      placeholder={field.placeholder}
      required={field.required}
      error={error}
      helpText={field.helpText}
    />
  );
}

function formatReportValue(field: ReportFieldDefinition, value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Not answered';
  if (field.type === 'currency' && typeof value === 'number') {
    return `${GRANT_PROGRAM.currencySymbol}${new Intl.NumberFormat('en-NG').format(value)}`;
  }
  return String(value);
}

const styles = StyleSheet.create({
  fields: {
    gap: spacing.lg,
  },
  mediaSection: {
    gap: spacing.md,
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  mediaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  thumbRow: {
    flexGrow: 0,
  },
  thumb: {
    marginRight: spacing.sm,
  },
  thumbImage: {
    width: 84,
    height: 84,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  thumbVideo: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  readonly: {
    gap: spacing.base,
  },
  readonlyRow: {
    gap: 2,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
});
