/**
 * Deleting your own account.
 *
 * The app never deletes anything itself. It asks the `delete-account` function,
 * which holds the only key allowed to remove a sign-in account, and which
 * decides from the caller's own session who is being deleted. Nothing here can
 * name another person.
 *
 * Whether someone may delete is a rule in the database
 * (`account_deletion_blocker`), read here to explain it before they try and
 * enforced there when they do — so the screen and the server always agree.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FunctionsHttpError } from '@supabase/supabase-js';

import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { supabase } from '@/lib/supabase';

/**
 * Why an account cannot be deleted from the app. Mirrors the codes returned by
 * `account_deletion_blocker()`; an unknown code is treated as a refusal rather
 * than ignored, so a new rule in the database can never be skipped by an older
 * version of the app.
 */
export type DeletionBlocker = 'staff' | 'grant_in_progress' | 'not_signed_in' | (string & {});

/**
 * Local copies of personal data. The cached query results hold the person's
 * application and profile, and drafts hold form answers typed while offline.
 * Both go with the account. Dismissed hints and announcements are left: they
 * say nothing about anyone.
 */
const PERSONAL_KEYS = ['zwcc.query-cache'];
const PERSONAL_PREFIXES = ['zwcc.draft.'];

export const accountService = {
  async getDeletionBlocker(): Promise<DeletionBlocker | null> {
    const { data, error } = await supabase.rpc('account_deletion_blocker');
    if (error) throw error;
    return (data as DeletionBlocker | null) ?? null;
  },

  async deleteAccount(): Promise<void> {
    const { error } = await supabase.functions.invoke('delete-account', { method: 'POST' });
    if (!error) return;

    // The function explains itself in its response body; the SDK only says
    // "non-2xx". Read the body so the person sees the real reason.
    let message = 'Your account could not be deleted. Please try again.';
    let code: string | undefined;
    if (error instanceof FunctionsHttpError) {
      try {
        const body = (await error.context.json()) as { error?: string; code?: string };
        if (body.error) message = body.error;
        code = body.code;
      } catch {
        // Keep the general message.
      }
    }

    throw new AppError(
      code === 'staff' || code === 'grant_in_progress' ? 'permission' : 'server',
      'Account not deleted',
      message,
      code !== 'staff' && code !== 'grant_in_progress',
      error,
    );
  },

  /** Wipe this phone's copies of the person's data. Never throws. */
  async clearLocalData(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const personal = keys.filter(
        (key) =>
          PERSONAL_KEYS.includes(key) || PERSONAL_PREFIXES.some((prefix) => key.startsWith(prefix)),
      );
      if (personal.length > 0) await AsyncStorage.multiRemove(personal);
    } catch (error) {
      logger.error('Could not clear local data after account deletion', error);
    }
  },
};
