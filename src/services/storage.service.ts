/**
 * File uploads to private Supabase Storage buckets.
 *
 * Two things matter most here, and both are about Nigeria being a primary
 * market on metered, often slow, mobile data:
 *
 *   1. Images are re-encoded before they leave the device. A modern phone
 *      camera produces 3–6 MB photos; at 1600px wide and quality 0.7 the same
 *      picture is usually 150–350 KB and looks identical on a phone screen.
 *      That is the difference between an upload that completes on 3G and one
 *      that times out.
 *   2. Nothing is ever downloaded eagerly. Files are fetched through
 *      short-lived signed URLs only when a user actually opens them.
 *
 * Storage paths always begin with the owning user's id, because the Storage
 * RLS policies in migration 0003 authorise on that first path segment. Paths
 * are built here and nowhere else.
 */
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

import { PROGRESS_MEDIA_CONFIG, getDocumentType } from '@/config/documents.config';
import { AppError } from '@/lib/errors';
import { formatFileSize } from '@/lib/format';
import { logger } from '@/lib/logger';
import { BUCKETS, SUPABASE_URL, supabase } from '@/lib/supabase';

export interface LocalFile {
  uri: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface UploadedFile {
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

const MB = 1024 * 1024;

/* -------------------------------------------------------------------------- */
/* Paths                                                                       */
/* -------------------------------------------------------------------------- */

function extensionFor(file: LocalFile): string {
  const fromName = file.name.includes('.') ? file.name.split('.').pop() : null;
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();

  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'application/pdf': 'pdf',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
  };
  return map[file.mimeType] ?? 'bin';
}

/**
 * `<applicant>/<application>/<documentType>/<random>.<ext>`
 *
 * The filename is random rather than the user's original: uploaded names are
 * untrusted input, and a random name also stops one document from silently
 * overwriting another.
 */
export function buildDocumentPath(
  applicantId: string,
  applicationId: string,
  documentTypeId: string,
  file: LocalFile,
): string {
  const unique = Crypto.randomUUID();
  return `${applicantId}/${applicationId}/${documentTypeId}/${unique}.${extensionFor(file)}`;
}

/** `<user>/<random>.<ext>` — one folder per person, as every bucket does. */
export function buildAvatarPath(userId: string, file: LocalFile): string {
  return `${userId}/${Crypto.randomUUID()}.${extensionFor(file)}`;
}

/** `<applicant>/<report>/<random>.<ext>` */
export function buildProgressMediaPath(
  applicantId: string,
  reportId: string,
  file: LocalFile,
): string {
  const unique = Crypto.randomUUID();
  return `${applicantId}/${reportId}/${unique}.${extensionFor(file)}`;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

/** Image types `compressImage` can shrink. Anything else uploads as-is. */
const COMPRESSIBLE = ['image/jpeg', 'image/jpg', 'image/png'];

/**
 * Checks the file's kind. Split from the size check because size is only
 * meaningful after compression — see `uploadDocument`.
 */
export function validateDocumentKind(file: LocalFile, documentTypeId: string): void {
  const type = getDocumentType(documentTypeId);
  if (!type) {
    throw new AppError('validation', 'Unknown document', 'That document type is not recognised.');
  }

  if (!type.accepts.includes(file.mimeType)) {
    const readable = type.accepts.includes('application/pdf') ? 'a PDF or an image' : 'an image';
    throw new AppError(
      'validation',
      'Unsupported file',
      `Please upload ${readable} for your ${type.label.toLowerCase()}.`,
    );
  }
}

export function validateDocumentSize(file: LocalFile, documentTypeId: string): void {
  const type = getDocumentType(documentTypeId);
  if (!type) {
    throw new AppError('validation', 'Unknown document', 'That document type is not recognised.');
  }

  if (file.size > type.maxSizeMb * MB) {
    const advice = COMPRESSIBLE.includes(file.mimeType)
      ? 'try taking the photo again from further back'
      : 'please choose a smaller file';
    throw new AppError(
      'validation',
      'File too large',
      `Your ${type.label.toLowerCase()} is ${formatFileSize(file.size)}. The limit is ${type.maxSizeMb} MB — ${advice}.`,
    );
  }
}

/** Both checks, for callers that already hold a final file. */
export function validateAgainstDocumentType(file: LocalFile, documentTypeId: string): void {
  validateDocumentKind(file, documentTypeId);
  validateDocumentSize(file, documentTypeId);
}

/* -------------------------------------------------------------------------- */
/* Compression                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Shrink an image before upload. Returns the original untouched if it is not an
 * image, or if compression fails for any reason — a failed optimisation must
 * never block someone from submitting their application.
 */
export async function compressImage(
  file: LocalFile,
  options: { maxWidth?: number; quality?: number } = {},
): Promise<LocalFile> {
  if (!COMPRESSIBLE.includes(file.mimeType)) return file;

  const { maxWidth = 1600, quality = 0.7 } = options;

  try {
    const context = ImageManipulator.ImageManipulator.manipulate(file.uri);
    context.resize({ width: maxWidth });

    const image = await context.renderAsync();
    const result = await image.saveAsync({
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    const size = new File(result.uri).size;

    // Occasionally a small PNG grows when re-encoded as JPEG. Keep whichever
    // is smaller.
    if (size >= file.size) return file;

    logger.debug('Compressed image', { from: file.size, to: size });

    return {
      uri: result.uri,
      name: file.name.replace(/\.[^.]+$/, '.jpg'),
      mimeType: 'image/jpeg',
      size,
    };
  } catch (error) {
    logger.warn('Image compression failed; uploading original', { error });
    return file;
  }
}

/* -------------------------------------------------------------------------- */
/* Upload                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Read a local file into memory as an ArrayBuffer.
 *
 * React Native's `fetch` cannot reliably turn a `file://` URI into a Blob, and
 * a base64 round-trip inflates the payload by a third and doubles peak memory.
 * `File.arrayBuffer()` from expo-file-system avoids both.
 */
async function readFileBytes(uri: string): Promise<ArrayBuffer> {
  try {
    return await new File(uri).arrayBuffer();
  } catch (error) {
    throw new AppError(
      'upload',
      'Could not read file',
      'We could not read that file from your device. Please choose it again.',
      false,
      error,
    );
  }
}

/** Fraction uploaded, 0 to 1. Called many times; keep the handler cheap. */
export type UploadProgressHandler = (fraction: number) => void;

/**
 * Upload with progress, over XHR rather than supabase-js.
 *
 * supabase-js gives no progress events, which on a slow Nigerian connection
 * means a 30-second wait with nothing moving on screen. XHR does report
 * progress, and sending the file as multipart form data lets React Native
 * stream it straight from disk — so a large photo is never held in JavaScript
 * memory, which also matters on a cheap phone.
 *
 * Storage accepts multipart the same way it accepts a raw body; the part must
 * be named "file".
 */
function uploadViaXhr(
  bucket: string,
  path: string,
  file: LocalFile,
  accessToken: string,
  onProgress?: UploadProgressHandler,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType,
    } as unknown as Blob);

    const request = new XMLHttpRequest();
    request.open('POST', `${SUPABASE_URL}/storage/v1/object/${bucket}/${path}`);
    request.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    request.setRequestHeader('cache-control', '3600');
    // Paths carry a UUID, so a collision means a genuine bug rather than a
    // legitimate replacement. Fail loudly instead of silently overwriting.
    request.setRequestHeader('x-upsert', 'false');

    if (onProgress) {
      request.upload.onprogress = (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress(Math.min(event.loaded / event.total, 1));
        }
      };
    }

    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(1);
        resolve();
        return;
      }
      reject(new Error(`Storage responded ${request.status}: ${request.responseText}`));
    };
    request.onerror = () => reject(new Error('The upload could not reach the server.'));
    request.onabort = () => reject(new Error('The upload was cancelled.'));

    request.send(form);
  });
}

async function uploadToBucket(
  bucket: string,
  path: string,
  file: LocalFile,
  onProgress?: UploadProgressHandler,
): Promise<UploadedFile> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    try {
      await uploadViaXhr(bucket, path, file, session.access_token, onProgress);
      return {
        storagePath: path,
        fileName: file.name,
        mimeType: file.mimeType,
        sizeBytes: file.size,
      };
    } catch (error) {
      // Progress is a convenience, not a requirement. If the direct request
      // fails for a reason supabase-js would handle better, fall through rather
      // than telling someone their document cannot be uploaded.
      logger.warn('Progress upload failed; retrying through supabase-js', { error });
    }
  }

  const bytes = await readFileBytes(file.uri);

  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: file.mimeType,
    upsert: false,
    cacheControl: '3600',
  });

  if (error) throw error;

  return {
    storagePath: path,
    fileName: file.name,
    mimeType: file.mimeType,
    sizeBytes: file.size,
  };
}

export const storageService = {
  /** Validate, compress and upload one application document. */
  async uploadDocument(
    applicantId: string,
    applicationId: string,
    documentTypeId: string,
    file: LocalFile,
    onProgress?: UploadProgressHandler,
  ): Promise<UploadedFile> {
    // Kind first, size last. A photo straight from a modern phone camera is
    // routinely 6-10 MB, well over the per-type limit, but compresses to a
    // fraction of that — so checking the size before compressing would reject
    // documents that upload perfectly well.
    validateDocumentKind(file, documentTypeId);

    const prepared = await compressImage(file);
    validateDocumentSize(prepared, documentTypeId);

    const path = buildDocumentPath(applicantId, applicationId, documentTypeId, prepared);
    return uploadToBucket(BUCKETS.documents, path, prepared, onProgress);
  },

  /**
   * Upload a profile picture.
   *
   * Compressed hard — 512px is more than a 76pt avatar needs at any screen
   * density, and this is one more upload on metered data for something purely
   * decorative.
   */
  async uploadAvatar(userId: string, file: LocalFile): Promise<UploadedFile> {
    if (!COMPRESSIBLE.includes(file.mimeType)) {
      throw new AppError(
        'validation',
        'Unsupported file',
        'Please choose a JPG or PNG photo.',
      );
    }

    const prepared = await compressImage(file, { maxWidth: 512, quality: 0.8 });
    const path = buildAvatarPath(userId, prepared);
    return uploadToBucket(BUCKETS.avatars, path, prepared);
  },

  /** Upload one photo or video attached to a monthly progress report. */
  async uploadProgressMedia(
    applicantId: string,
    reportId: string,
    file: LocalFile,
    mediaType: 'image' | 'video',
    onProgress?: UploadProgressHandler,
  ): Promise<UploadedFile> {
    const rules = PROGRESS_MEDIA_CONFIG[mediaType];

    if (!(rules.accepts as readonly string[]).includes(file.mimeType)) {
      throw new AppError(
        'validation',
        'Unsupported file',
        mediaType === 'image'
          ? 'Please choose a JPG or PNG photo.'
          : 'Please choose an MP4 or MOV video.',
      );
    }

    const prepared =
      mediaType === 'image'
        ? await compressImage(file, PROGRESS_MEDIA_CONFIG.image.compression)
        : file;

    if (prepared.size > rules.maxSizeMb * MB) {
      throw new AppError(
        'validation',
        'File too large',
        `That ${mediaType} is ${formatFileSize(prepared.size)}. The limit is ${rules.maxSizeMb} MB — try a shorter video or a smaller photo.`,
      );
    }

    const path = buildProgressMediaPath(applicantId, reportId, prepared);
    return uploadToBucket(BUCKETS.progressMedia, path, prepared, onProgress);
  },

  /**
   * A short-lived URL for viewing a private file.
   *
   * Buckets are private, so this is the only way to read one. The default hour
   * is long enough to open a PDF and short enough that a leaked URL expires
   * before it is useful.
   */
  async getSignedUrl(bucket: string, path: string, expiresInSeconds = 3600): Promise<string> {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresInSeconds);

    if (error) throw error;
    if (!data?.signedUrl) {
      throw new AppError('not_found', 'Unavailable', 'That file could not be opened.');
    }
    return data.signedUrl;
  },

  getDocumentUrl(path: string, expiresInSeconds = 3600): Promise<string> {
    return this.getSignedUrl(BUCKETS.documents, path, expiresInSeconds);
  },

  getProgressMediaUrl(path: string, expiresInSeconds = 3600): Promise<string> {
    return this.getSignedUrl(BUCKETS.progressMedia, path, expiresInSeconds);
  },

  /**
   * Signed URLs for many files in one round trip — used by the media grid so a
   * report with six photos does not make six requests.
   */
  async getSignedUrls(
    bucket: string,
    paths: string[],
    expiresInSeconds = 3600,
  ): Promise<Record<string, string>> {
    if (paths.length === 0) return {};

    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrls(paths, expiresInSeconds);

    if (error) throw error;

    const map: Record<string, string> = {};
    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl) map[entry.path] = entry.signedUrl;
    }
    return map;
  },

  /** Remove a stored object. The database row is soft-deleted separately. */
  async remove(bucket: string, path: string): Promise<void> {
    const { error } = await supabase.storage.from(bucket).remove([path]);
    if (error) {
      // A missing object is not worth failing the user's action over.
      logger.warn('Failed to remove storage object', { bucket, path, error });
    }
  },
};
