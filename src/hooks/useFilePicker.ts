/**
 * Picking files from the camera, photo library or document browser.
 *
 * Wraps the three Expo pickers behind one shape (`LocalFile`) so upload code
 * does not care where a file came from, and handles the permission denials that
 * each picker reports differently.
 */
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useState } from 'react';
import { Alert, Linking, Platform } from 'react-native';

import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { LocalFile } from '@/services/storage.service';

export type PickSource = 'camera' | 'library' | 'files';

interface PickOptions {
  /** MIME types the caller will accept. */
  accepts?: string[];
  /** Allow selecting several files (library and files only). */
  multiple?: boolean;
  /** Include videos when picking from the library. */
  allowVideo?: boolean;
}

/**
 * When a permission has been permanently denied, the only route forward is the
 * OS settings app — so say that rather than silently doing nothing.
 */
function promptForSettings(what: string) {
  Alert.alert(
    `${what} permission needed`,
    `Please allow access to your ${what.toLowerCase()} in Settings so you can attach files.`,
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open Settings', onPress: () => void Linking.openSettings() },
    ],
  );
}

function inferMimeType(uri: string, provided?: string | null): string {
  if (provided) return provided;
  const extension = uri.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    pdf: 'application/pdf',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
  };
  return (extension && map[extension]) || 'application/octet-stream';
}

export function useFilePicker() {
  const [picking, setPicking] = useState(false);

  const pickFromCamera = useCallback(async (): Promise<LocalFile[]> => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      if (!permission.canAskAgain) promptForSettings('Camera');
      return [];
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.9,
      // Compression happens in the storage service, where the target size is
      // known; capture at good quality so the compressed result is still sharp.
      allowsEditing: false,
      exif: false,
    });

    if (result.canceled) return [];

    return result.assets.map((asset, index) => ({
      uri: asset.uri,
      name: asset.fileName ?? `photo-${Date.now()}-${index}.jpg`,
      mimeType: inferMimeType(asset.uri, asset.mimeType),
      size: asset.fileSize ?? 0,
    }));
  }, []);

  const pickFromLibrary = useCallback(
    async (options: PickOptions = {}): Promise<LocalFile[]> => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        if (!permission.canAskAgain) promptForSettings('Photos');
        return [];
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: options.allowVideo ? ['images', 'videos'] : ['images'],
        allowsMultipleSelection: options.multiple ?? false,
        quality: 0.9,
        exif: false,
      });

      if (result.canceled) return [];

      return result.assets.map((asset, index) => ({
        uri: asset.uri,
        name: asset.fileName ?? `upload-${Date.now()}-${index}`,
        mimeType: inferMimeType(asset.uri, asset.mimeType),
        size: asset.fileSize ?? 0,
      }));
    },
    [],
  );

  const pickDocument = useCallback(
    async (options: PickOptions = {}): Promise<LocalFile[]> => {
      const result = await DocumentPicker.getDocumentAsync({
        type: options.accepts?.length ? options.accepts : ['application/pdf', 'image/*'],
        multiple: options.multiple ?? false,
        // Copying to the cache directory guarantees a readable file:// URI,
        // which content:// URIs from Android's document provider are not.
        copyToCacheDirectory: true,
      });

      if (result.canceled) return [];

      return result.assets.map((asset) => ({
        uri: asset.uri,
        name: asset.name,
        mimeType: inferMimeType(asset.uri, asset.mimeType),
        size: asset.size ?? 0,
      }));
    },
    [],
  );

  /** One entry point; the caller picks the source. */
  const pick = useCallback(
    async (source: PickSource, options: PickOptions = {}): Promise<LocalFile[]> => {
      setPicking(true);
      try {
        switch (source) {
          case 'camera':
            return await pickFromCamera();
          case 'library':
            return await pickFromLibrary(options);
          case 'files':
          default:
            return await pickDocument(options);
        }
      } catch (error) {
        logger.error('File picker failed', error, { source });
        throw new AppError(
          'upload',
          'Could not open',
          Platform.OS === 'android'
            ? 'We could not open your files. Please try a different source.'
            : 'We could not open that. Please try again.',
          true,
          error,
        );
      } finally {
        setPicking(false);
      }
    },
    [pickFromCamera, pickFromLibrary, pickDocument],
  );

  return { pick, picking };
}
