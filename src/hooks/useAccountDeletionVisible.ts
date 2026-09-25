/**
 * Whether this person should see the Delete account button.
 *
 * Everyone, once ACCOUNT_DELETION_IN_APP is on. Until then, only accounts whose
 * email fingerprint is on the preview list, so the flow can be tested on a
 * real phone without showing it to applicants.
 */
import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';

import {
  ACCOUNT_DELETION_IN_APP,
  ACCOUNT_DELETION_PREVIEW_EMAIL_SHA256,
} from '@/config/account.config';
import { useAuth } from '@/providers/AuthProvider';

export function useAccountDeletionVisible(): boolean {
  const { profile } = useAuth();
  const email = profile?.email?.trim().toLowerCase() ?? null;
  const [previewer, setPreviewer] = useState(false);

  useEffect(() => {
    if (ACCOUNT_DELETION_IN_APP || !email || ACCOUNT_DELETION_PREVIEW_EMAIL_SHA256.length === 0) {
      setPreviewer(false);
      return;
    }
    let cancelled = false;
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, email)
      .then((digest) => {
        if (!cancelled) setPreviewer(ACCOUNT_DELETION_PREVIEW_EMAIL_SHA256.includes(digest));
      })
      .catch(() => {
        // Hidden is the safe answer if the check cannot run.
        if (!cancelled) setPreviewer(false);
      });
    return () => {
      cancelled = true;
    };
  }, [email]);

  return ACCOUNT_DELETION_IN_APP || previewer;
}
