/**
 * Blocks screenshots and screen recording while a screen is showing someone
 * else's identity documents.
 *
 * A committee member is trusted with a stranger's passport photograph, their
 * ID card and their CAC certificate for as long as it takes to verify them, and
 * with nothing after that. A screenshot quietly turns that into a copy in a
 * personal camera roll, which then travels through WhatsApp backups and shared
 * phones. The block is what stops the easy case.
 *
 * What it actually does, so nobody over-trusts it:
 *
 *   Android  FLAG_SECURE on the window. Screenshots are refused by the system,
 *            screen recordings come out black, and the app is blanked in the
 *            recent-apps carousel.
 *   iOS      The window layer is hosted inside a secure text field, which is
 *            the same mechanism that keeps password fields out of screenshots.
 *            Captures come out blank on iOS 13 and later.
 *
 * Neither stops a second phone pointed at the screen. Nothing does. This closes
 * the one-tap path, and the audit entry covers the rest by making a capture
 * attempt something the church can see afterwards.
 */
import {
  addScreenshotListener,
  allowScreenCaptureAsync,
  preventScreenCaptureAsync,
} from 'expo-screen-capture';
import { useEffect } from 'react';

import { logger } from '@/lib/logger';
import { auditService } from '@/services/audit.service';
import type { Role } from '@/types/roles';

export interface ScreenCaptureGuardOptions {
  /** Turn the guard off — an applicant looking at their own file is not a leak. */
  enabled?: boolean;
  /** Recorded on the audit entry if a capture is attempted anyway. */
  documentId?: string | null;
  actorId?: string | null;
  actorRole?: Role | null;
}

/**
 * Distinct per mount. `expo-screen-capture` reference-counts by key, so two
 * viewers open at once cannot have the first to close re-enable capture for the
 * second.
 */
let nextKey = 0;

export function useScreenCaptureGuard({
  enabled = true,
  documentId,
  actorId,
  actorRole,
}: ScreenCaptureGuardOptions = {}) {
  useEffect(() => {
    if (!enabled) return;

    const key = `zwcc-document-${nextKey++}`;
    let released = false;

    // Never throws outward: failing to block a screenshot must not stop a
    // committee member from reading the document they have to verify.
    preventScreenCaptureAsync(key).catch((error) => {
      logger.error('Could not block screen capture', error);
    });

    // Android's FLAG_SECURE refuses the capture outright, so this fires on iOS,
    // where the screenshot is taken but comes out blank. Either way the attempt
    // is worth recording against the document.
    const subscription = addScreenshotListener(() => {
      void auditService.record({
        action: 'document.capture_attempted',
        entityType: 'document',
        entityId: documentId ?? null,
        actorId,
        actorRole,
      });
    });

    return () => {
      if (released) return;
      released = true;
      subscription.remove();
      allowScreenCaptureAsync(key).catch(() => {
        // Nothing useful to do: the flag clears when the activity is recreated.
      });
    };
  }, [enabled, documentId, actorId, actorRole]);
}
