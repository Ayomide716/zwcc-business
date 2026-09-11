/**
 * The Supabase client.
 *
 * Security notes:
 *   - Only the anon key is ever present in the bundle. The service-role key
 *     must never appear in this app; anything shipped to a phone is readable.
 *     Row Level Security is what actually protects data (see migration 0002).
 *   - The session is persisted in Expo SecureStore (Keychain / Keystore) rather
 *     than AsyncStorage, so refresh tokens are encrypted at rest.
 *   - SecureStore rejects values over 2048 bytes, and a Supabase session can
 *     exceed that once custom claims are added, so the adapter transparently
 *     chunks the value.
 */
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

import { logger } from './logger';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Whether the app has been pointed at a real Supabase project. Screens use this
 * to show a clear setup message instead of failing with a confusing network
 * error when `.env` has not been filled in.
 */
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes('your-project-ref') &&
    !supabaseAnonKey.includes('your-anon'),
);

if (!isSupabaseConfigured) {
  logger.warn(
    'Supabase is not configured. Copy .env.example to .env and set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  );
}

/* -------------------------------------------------------------------------- */
/* Secure, chunking session storage                                            */
/* -------------------------------------------------------------------------- */

const CHUNK_SIZE = 1800;
const CHUNK_COUNT_SUFFIX = '__chunks';

/** SecureStore keys must match /^[A-Za-z0-9._-]+$/. */
function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

const secureStorage: SupportedStorage = {
  async getItem(key) {
    const base = safeKey(key);
    try {
      const countRaw = await SecureStore.getItemAsync(`${base}${CHUNK_COUNT_SUFFIX}`);
      if (!countRaw) return await SecureStore.getItemAsync(base);

      const count = Number.parseInt(countRaw, 10);
      const parts: string[] = [];
      for (let index = 0; index < count; index += 1) {
        const part = await SecureStore.getItemAsync(`${base}.${index}`);
        // A missing chunk means the stored session is corrupt; treat as absent
        // so the user is asked to sign in again rather than crashing.
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join('');
    } catch (error) {
      logger.error('Failed reading session from SecureStore', error);
      return null;
    }
  },

  async setItem(key, value) {
    const base = safeKey(key);
    try {
      await clearChunks(base);

      if (value.length <= CHUNK_SIZE) {
        await SecureStore.setItemAsync(base, value);
        return;
      }

      const chunks: string[] = [];
      for (let index = 0; index < value.length; index += CHUNK_SIZE) {
        chunks.push(value.slice(index, index + CHUNK_SIZE));
      }
      await Promise.all(
        chunks.map((chunk, index) => SecureStore.setItemAsync(`${base}.${index}`, chunk)),
      );
      await SecureStore.setItemAsync(`${base}${CHUNK_COUNT_SUFFIX}`, String(chunks.length));
    } catch (error) {
      logger.error('Failed writing session to SecureStore', error);
    }
  },

  async removeItem(key) {
    const base = safeKey(key);
    try {
      await clearChunks(base);
      await SecureStore.deleteItemAsync(base);
    } catch (error) {
      logger.error('Failed clearing session from SecureStore', error);
    }
  },
};

async function clearChunks(base: string): Promise<void> {
  const countRaw = await SecureStore.getItemAsync(`${base}${CHUNK_COUNT_SUFFIX}`);
  if (!countRaw) return;
  const count = Number.parseInt(countRaw, 10);
  await Promise.all(
    Array.from({ length: count }, (_unused, index) =>
      SecureStore.deleteItemAsync(`${base}.${index}`),
    ),
  );
  await SecureStore.deleteItemAsync(`${base}${CHUNK_COUNT_SUFFIX}`);
}

/** SecureStore is unavailable on web; fall back so `expo start --web` runs. */
const sessionStorage: SupportedStorage =
  Platform.OS === 'web' ? (AsyncStorage as unknown as SupportedStorage) : secureStorage;

/* -------------------------------------------------------------------------- */
/* Client                                                                      */
/* -------------------------------------------------------------------------- */

export const supabase = createClient<Database>(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key',
  {
    auth: {
      storage: sessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      // Mobile deep links are handled explicitly in the reset-password flow.
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
    global: {
      headers: { 'x-application-name': 'zwcc-business-grant' },
    },
    // Realtime is not used; keeping the rate low avoids needless sockets on
    // metered mobile connections.
    realtime: { params: { eventsPerSecond: 1 } },
  },
);

/**
 * Supabase only refreshes tokens while the app is foregrounded. Without this,
 * a session can expire while the phone is asleep and the next request fails.
 */
let appStateSubscription: { remove: () => void } | null = null;

export function startAuthAutoRefresh(): () => void {
  appStateSubscription?.remove();

  const subscription = AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
  appStateSubscription = subscription;

  if (AppState.currentState === 'active') {
    void supabase.auth.startAutoRefresh();
  }

  return () => {
    subscription.remove();
    appStateSubscription = null;
    void supabase.auth.stopAutoRefresh();
  };
}

/**
 * The project's REST origin, for the one place that talks to Storage directly
 * rather than through supabase-js: the resumable, progress-reporting upload in
 * `storage.service.ts`. Empty when the app has not been configured.
 */
export const SUPABASE_URL = supabaseUrl ?? '';

/** Storage buckets. All private — see migration 0003. */
export const BUCKETS = {
  documents: 'application-documents',
  progressMedia: 'progress-media',
  agreements: 'agreements',
  avatars: 'avatars',
} as const;
