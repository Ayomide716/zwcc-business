/**
 * Document upload (brief §11).
 *
 * The screen renders one card per configured document type, grouped by
 * category. A type added to `documents.config.ts` (and seeded into
 * `document_types`) appears here with no change to this file.
 */
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { DocumentSlotCard } from '@/components/app';
import { Button } from '@/components/ui/Button';
import { Banner, LoadingState } from '@/components/ui/Feedback';
import { ScreenHeader } from '@/components/ui/Header';
import { ProgressBar } from '@/components/ui/Progress';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Text } from '@/components/ui/Text';
import {
  DOCUMENT_CATEGORY_LABELS,
  getDocumentType,
  getRequiredDocumentTypes,
  type DocumentCategory,
} from '@/config/documents.config';
import { useDocuments, useInvalidateApplication, useMyApplication } from '@/hooks/queries';
import { useFilePicker, type PickSource } from '@/hooks/useFilePicker';
import { useAuth } from '@/providers/AuthProvider';
import { useToast } from '@/providers/ToastProvider';
import { documentService } from '@/services/document.service';
import { storageService } from '@/services/storage.service';
import { spacing } from '@/theme';
import { areDocumentsEditable } from '@/workflow/engine';

export default function DocumentsScreen() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuth();
  const { pick } = useFilePicker();
  const invalidate = useInvalidateApplication();

  const { data: application, isLoading } = useMyApplication();
  const { data: documents = [], refetch, isRefetching } = useDocuments(application?.id);

  const [uploadingTypeId, setUploadingTypeId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [sourceSheetFor, setSourceSheetFor] = useState<string | null>(null);

  const editable = application ? areDocumentsEditable(application.status) : false;

  const slots = useMemo(() => documentService.buildSlots(documents), [documents]);

  const grouped = useMemo(() => {
    const categories: DocumentCategory[] = ['personal', 'business', 'church', 'other'];
    return categories
      .map((category) => ({
        category,
        label: DOCUMENT_CATEGORY_LABELS[category],
        slots: slots.filter((slot) => slot.category === category),
      }))
      .filter((group) => group.slots.length > 0);
  }, [slots]);

  const requiredProgress = useMemo(() => {
    const required = getRequiredDocumentTypes();
    if (required.length === 0) return 1;
    const satisfied = required.filter((type) =>
      slots.some((slot) => slot.typeId === type.id && slot.document),
    );
    return satisfied.length / required.length;
  }, [slots]);

  const handleUpload = useCallback(
    async (typeId: string, source: PickSource) => {
      if (!application || !user) return;

      setSourceSheetFor(null);
      setUploadingTypeId(typeId);
      setUploadProgress(0);

      try {
        const type = getDocumentType(typeId);
        const files = await pick(source, { accepts: type?.accepts, multiple: false });
        const file = files[0];
        if (!file) return;

        await documentService.upload(application.id, user.id, typeId, file, (fraction) =>
          setUploadProgress(fraction),
        );
        invalidate(application.id);
        toast.success('Uploaded', `${type?.label ?? 'Document'} added to your application.`);
      } catch (error) {
        toast.error(error, 'Upload failed');
      } finally {
        setUploadingTypeId(null);
        setUploadProgress(0);
      }
    },
    [application, user, pick, invalidate, toast],
  );

  const handlePreview = useCallback(
    async (storagePath: string) => {
      try {
        const url = await storageService.getDocumentUrl(storagePath);
        // Opened in the in-app browser so the signed URL never leaves the app
        // into a shared browser history.
        await WebBrowser.openBrowserAsync(url);
      } catch (error) {
        toast.error(error, 'Could not open the document');
      }
    },
    [toast],
  );

  const handleRemove = useCallback(
    (documentId: string, label: string) => {
      Alert.alert(
        `Remove ${label}?`,
        'You will need to upload it again before you can submit.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              if (!user) return;
              try {
                await documentService.remove(documentId, user.id);
                invalidate(application?.id);
                toast.success('Removed');
              } catch (error) {
                toast.error(error, 'Could not remove the document');
              }
            },
          },
        ],
      );
    },
    [user, application?.id, invalidate, toast],
  );

  if (isLoading) {
    return (
      <Screen>
        <LoadingState message="Loading your documents…" />
      </Screen>
    );
  }

  if (!application) {
    return (
      <Screen>
        <ScreenHeader title="Documents" showBack />
        <Banner
          tone="info"
          message="Start your application before uploading documents."
          action={{
            label: 'Start application',
            onPress: () => router.push('/(onboarding)/eligibility'),
          }}
        />
      </Screen>
    );
  }

  const activeType = sourceSheetFor ? getDocumentType(sourceSheetFor) : null;

  return (
    <Screen
      onRefresh={() => void refetch()}
      refreshing={isRefetching}
      footer={
        editable ? (
          <Button
            label="Back to my application"
            variant="outline"
            onPress={() => router.push('/(applicant)/application')}
            fullWidth
          />
        ) : undefined
      }
    >
      <ScreenHeader
        eyebrow="Your application"
        title="Documents"
        subtitle="Upload clear photos or PDFs. Files are private and only visible to you and the review team."
        showBack
      />

      {!editable ? (
        <Banner
          tone="info"
          title="Locked"
          message="Your application has been submitted, so documents can no longer be changed."
          icon="lock-closed-outline"
        />
      ) : null}

      <View style={styles.progress}>
        <ProgressBar
          value={requiredProgress}
          label="Required documents"
          showPercentage
          tone={requiredProgress === 1 ? 'success' : 'warning'}
        />
      </View>

      {grouped.map((group) => (
        <View key={group.category} style={styles.group}>
          <Text variant="label" muted>
            {group.label.toUpperCase()}
          </Text>

          {group.slots.map((slot) => (
            <DocumentSlotCard
              key={slot.typeId}
              slot={slot}
              editable={editable}
              uploading={uploadingTypeId === slot.typeId}
              uploadProgress={uploadProgress}
              onUpload={() => setSourceSheetFor(slot.typeId)}
              onPreview={
                slot.document
                  ? () => void handlePreview(slot.document!.storage_path)
                  : undefined
              }
              onRemove={
                slot.document
                  ? () => handleRemove(slot.document!.id, slot.label)
                  : undefined
              }
            />
          ))}
        </View>
      ))}

      <Sheet
        visible={Boolean(sourceSheetFor)}
        onClose={() => setSourceSheetFor(null)}
        title={activeType ? `Add ${activeType.label.toLowerCase()}` : 'Add document'}
        subtitle={activeType?.hint}
      >
        {activeType?.allowCamera ? (
          <Button
            label="Take a photo"
            icon="camera-outline"
            variant="outline"
            fullWidth
            onPress={() => sourceSheetFor && void handleUpload(sourceSheetFor, 'camera')}
          />
        ) : null}

        <Button
          label="Choose from photos"
          icon="images-outline"
          variant="outline"
          fullWidth
          onPress={() => sourceSheetFor && void handleUpload(sourceSheetFor, 'library')}
        />

        <Button
          label="Choose a file"
          icon="folder-open-outline"
          variant="outline"
          fullWidth
          onPress={() => sourceSheetFor && void handleUpload(sourceSheetFor, 'files')}
        />

        {activeType ? (
          <Text variant="caption" muted align="center">
            Accepted: {activeType.accepts.includes('application/pdf') ? 'PDF, JPG, PNG' : 'JPG, PNG'} ·
            Maximum {activeType.maxSizeMb} MB
          </Text>
        ) : null}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: {
    marginBottom: spacing.lg,
  },
  group: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
});
