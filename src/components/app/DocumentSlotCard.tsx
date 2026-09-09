/**
 * One document requirement: its state, and the actions available on it.
 *
 * The card is built from a `DocumentSlot`, which pairs a configured document
 * type with whatever has been uploaded — so a type added to the config appears
 * here automatically.
 */
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/Progress';
import { Text } from '@/components/ui/Text';
import { DOCUMENT_STATUS_LABELS, type DocumentStatus } from '@/config/documents.config';
import { formatFileSize } from '@/lib/format';
import type { DocumentSlot } from '@/services/document.service';
import { colors, radius, spacing, type Tone } from '@/theme';

const STATUS_TONES: Record<DocumentStatus, Tone> = {
  missing: 'neutral',
  uploaded: 'info',
  under_review: 'progress',
  verified: 'success',
  rejected: 'danger',
};

const STATUS_ICONS: Record<DocumentStatus, keyof typeof Ionicons.glyphMap> = {
  missing: 'cloud-upload-outline',
  uploaded: 'document-text',
  under_review: 'hourglass-outline',
  verified: 'checkmark-circle',
  rejected: 'alert-circle',
};

export interface DocumentSlotCardProps {
  slot: DocumentSlot;
  /** False once the workflow closes documents for editing. */
  editable: boolean;
  uploading?: boolean;
  /** Fraction uploaded, 0 to 1. Only meaningful while `uploading`. */
  uploadProgress?: number;
  onUpload: () => void;
  onPreview?: () => void;
  onRemove?: () => void;
}

export function DocumentSlotCard({
  slot,
  editable,
  uploading,
  uploadProgress = 0,
  onUpload,
  onPreview,
  onRemove,
}: DocumentSlotCardProps) {
  const tone = STATUS_TONES[slot.status];
  const hasFile = Boolean(slot.document);
  const isRequired = slot.requirement === 'required';

  return (
    <Card variant="outlined" style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.icon, hasFile && styles.iconFilled]}>
          <Ionicons
            name={STATUS_ICONS[slot.status]}
            size={20}
            color={hasFile ? colors.brand : colors.textMuted}
          />
        </View>

        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <Text variant="bodyMedium" style={styles.title}>
              {slot.label}
            </Text>
            {isRequired ? (
              <Text variant="caption" color="danger">
                Required
              </Text>
            ) : (
              <Text variant="caption" muted>
                Optional
              </Text>
            )}
          </View>

          <Text variant="caption" muted>
            {slot.description}
          </Text>
        </View>
      </View>

      {uploading ? (
        // A photo on a slow Nigerian mobile connection can take a while. A bar
        // that actually moves is the difference between waiting and giving up.
        <View style={styles.uploading}>
          <ProgressBar
            value={uploadProgress}
            label={uploadProgress >= 1 ? 'Finishing up' : 'Uploading'}
            showPercentage={uploadProgress > 0 && uploadProgress < 1}
            tone="brand"
          />
          <Text variant="caption" muted accessibilityLiveRegion="polite">
            Please keep this screen open until it finishes.
          </Text>
        </View>
      ) : null}

      <View style={styles.statusRow}>
        <Badge label={DOCUMENT_STATUS_LABELS[slot.status]} tone={tone} size="sm" />
        {slot.document ? (
          <Text variant="caption" muted numberOfLines={1} style={styles.fileName}>
            {slot.document.file_name} · {formatFileSize(slot.document.size_bytes)}
          </Text>
        ) : null}
      </View>

      {slot.status === 'rejected' && slot.rejectionReason ? (
        <View style={styles.rejection}>
          <Text variant="caption" color="dangerStrong">
            {slot.rejectionReason}
            {slot.document?.rejection_note ? ` — ${slot.document.rejection_note}` : ''}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {editable ? (
          <Button
            label={hasFile ? 'Replace' : 'Upload'}
            onPress={onUpload}
            variant={hasFile ? 'outline' : 'primary'}
            size="sm"
            loading={uploading}
            icon={hasFile ? 'swap-horizontal' : 'cloud-upload-outline'}
            accessibilityLabel={`${hasFile ? 'Replace' : 'Upload'} ${slot.label}`}
          />
        ) : null}

        {hasFile && onPreview ? (
          <Button
            label="View"
            onPress={onPreview}
            variant="ghost"
            size="sm"
            icon="eye-outline"
            accessibilityLabel={`View ${slot.label}`}
          />
        ) : null}

        {hasFile && editable && onRemove && slot.status !== 'verified' ? (
          <Button
            label="Remove"
            onPress={onRemove}
            variant="ghost"
            size="sm"
            icon="trash-outline"
            accessibilityLabel={`Remove ${slot.label}`}
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  uploading: {
    gap: spacing.xs,
  },
  card: {
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconFilled: {
    backgroundColor: colors.brandSurfaceStrong,
  },
  headerText: {
    flex: 1,
    gap: spacing.xxs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  fileName: {
    flex: 1,
  },
  rejection: {
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.dangerSurface,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
});
