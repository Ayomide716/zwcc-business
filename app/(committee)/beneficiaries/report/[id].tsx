/**
 * Reading and reviewing one monthly progress report.
 *
 * Media is loaded lazily through signed URLs, in one batched request rather
 * than one per photo.
 */
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState, LoadingState, Skeleton } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { EVALUATION_SCALE, REPORT_FIELDS } from '@/config/monitoring.config';
import { GRANT_PROGRAM } from '@/config/program.config';
import { useReportMedia } from '@/hooks/queries';
import { formatDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useActor } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { monitoringService } from '@/services/monitoring.service';
import { colors, radius, spacing } from '@/theme';
import type { ProgressReportRow } from '@/types/database';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export default function ReportReviewScreen() {
  const router = useRouter();
  const toast = useToast();
  const actor = useActor();
  const client = useQueryClient();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [reviewSheet, setReviewSheet] = useState(false);
  const [notes, setNotes] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [activeVideo, setActiveVideo] = useState<string | null>(null);

  const report = useQuery({
    queryKey: ['progress-report', id],
    queryFn: async (): Promise<ProgressReportRow> => {
      const { data, error } = await supabase
        .from('progress_reports')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: Boolean(id),
  });

  const media = useReportMedia(id);

  const answers = useMemo(
    () => (report.data?.data as Record<string, unknown>) ?? {},
    [report.data?.data],
  );

  async function handleReview() {
    if (!id) return;

    setSubmitting(true);
    try {
      await monitoringService.reviewReport(id, actor, {
        notes: notes.trim() || undefined,
        score: score ?? undefined,
      });

      void client.invalidateQueries({ queryKey: ['progress-report', id] });
      void client.invalidateQueries({ queryKey: ['reports', 'review-queue'] });

      setReviewSheet(false);
      toast.success('Report reviewed', 'The beneficiary has been notified.');
      router.back();
    } catch (error) {
      toast.error(error, 'Could not save your review');
    } finally {
      setSubmitting(false);
    }
  }

  if (report.isLoading) {
    return (
      <Screen>
        <LoadingState message="Loading report…" />
      </Screen>
    );
  }

  if (!report.data) {
    return (
      <Screen>
        <ScreenHeader title="Report" showBack />
        <EmptyState title="Report not found" />
      </Screen>
    );
  }

  const reviewed = report.data.status === 'reviewed';

  return (
    <Screen
      footer={
        reviewed ? undefined : (
          <Button
            label="Mark as reviewed"
            onPress={() => setReviewSheet(true)}
            fullWidth
            size="lg"
            icon="checkmark-circle-outline"
          />
        )
      }
    >
      <ScreenHeader
        title={`Month ${report.data.period_number} report`}
        subtitle={`Submitted ${formatDateTime(report.data.submitted_at)}`}
        showBack
        right={
          <Badge
            label={reviewed ? 'Reviewed' : 'Awaiting review'}
            tone={reviewed ? 'success' : 'warning'}
            size="sm"
          />
        }
      />

      {reviewed && report.data.review_notes ? (
        <Card variant="flat" style={styles.reviewCard}>
          <Text variant="label">Your review</Text>
          <Text variant="callout" muted>
            {report.data.review_notes}
          </Text>
          {report.data.review_score ? (
            <Text variant="caption" color="brand">
              Score: {report.data.review_score} / 5 —{' '}
              {EVALUATION_SCALE.find((item) => item.value === report.data?.review_score)?.label}
            </Text>
          ) : null}
        </Card>
      ) : null}

      <Card style={styles.card}>
        {REPORT_FIELDS.map((field) => {
          const value = answers[field.id];
          if (value === undefined || value === null || value === '') return null;

          return (
            <View key={field.id} style={styles.answerRow}>
              <Text variant="caption" muted>
                {field.label}
              </Text>
              <Text variant="body">
                {field.type === 'currency' && typeof value === 'number'
                  ? `${GRANT_PROGRAM.currencySymbol}${new Intl.NumberFormat('en-NG').format(value)}`
                  : String(value)}
              </Text>
            </View>
          );
        })}
      </Card>

      {/* Media */}
      <Card style={styles.card}>
        <Text variant="title3">Photos and video</Text>

        {media.isLoading ? (
          <View style={styles.mediaRow}>
            <Skeleton width={120} height={120} radius={12} />
            <Skeleton width={120} height={120} radius={12} />
          </View>
        ) : (media.data?.length ?? 0) === 0 ? (
          <Text variant="callout" muted>
            No media was attached to this report.
          </Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.mediaRow}>
              {media.data?.map((item) =>
                item.url ? (
                  item.media_type === 'image' ? (
                    <Image
                      key={item.id}
                      source={{ uri: item.url }}
                      style={styles.media}
                      contentFit="cover"
                      // Cached so scrolling back does not re-download.
                      cachePolicy="memory-disk"
                      transition={150}
                      accessibilityLabel={item.caption ?? 'Business progress photo'}
                    />
                  ) : (
                    <Button
                      key={item.id}
                      label="Play video"
                      variant="outline"
                      icon="play-circle-outline"
                      onPress={() => setActiveVideo(item.url)}
                      style={styles.videoButton}
                    />
                  )
                ) : null,
              )}
            </View>
          </ScrollView>
        )}
      </Card>

      <Sheet
        visible={Boolean(activeVideo)}
        onClose={() => setActiveVideo(null)}
        title="Business progress video"
        scrollable={false}
      >
        {activeVideo ? <ReportVideo uri={activeVideo} /> : null}
      </Sheet>

      <Sheet
        visible={reviewSheet}
        onClose={() => setReviewSheet(false)}
        title="Review this report"
        subtitle="Your notes are shared with the beneficiary."
      >
        <Text variant="label">How is the business doing?</Text>
        <View style={styles.scaleRow}>
          {EVALUATION_SCALE.map((item) => (
            <Button
              key={item.value}
              label={String(item.value)}
              variant={score === item.value ? 'primary' : 'outline'}
              size="sm"
              onPress={() => setScore(item.value)}
              accessibilityLabel={`${item.value} out of 5, ${item.label}`}
              style={styles.scaleButton}
            />
          ))}
        </View>
        {score ? (
          <Text variant="caption" muted align="center">
            {EVALUATION_SCALE.find((item) => item.value === score)?.label}
          </Text>
        ) : null}

        <TextField
          label="Notes for the beneficiary"
          value={notes}
          onChangeText={setNotes}
          rows={4}
          placeholder="Encouragement, guidance, or anything they should focus on."
        />

        <Button
          label="Save review"
          onPress={handleReview}
          loading={submitting}
          fullWidth
          size="lg"
        />
      </Sheet>
    </Screen>
  );
}

/** Video playback. Isolated so the player is created only when a video opens. */
function ReportVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = false;
    instance.play();
  });

  return (
    <VideoView
      player={player}
      style={styles.video}
      nativeControls
      fullscreenOptions={{ enable: true }}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    marginBottom: spacing.base,
  },
  reviewCard: {
    gap: spacing.xs,
    marginBottom: spacing.base,
    backgroundColor: colors.successSurface,
  },
  answerRow: {
    gap: 2,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.divider,
  },
  mediaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  media: {
    width: 120,
    height: 120,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  videoButton: {
    height: 120,
    width: 140,
  },
  video: {
    width: '100%',
    height: 220,
    borderRadius: radius.md,
    backgroundColor: colors.brandDark,
  },
  scaleRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  scaleButton: {
    flex: 1,
  },
});
