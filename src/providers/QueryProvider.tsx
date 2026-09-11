/**
 * React Query configuration.
 *
 * Defaults are tuned for slow, metered mobile connections rather than a
 * desktop browser: data stays fresh for longer, refetch-on-focus is off (it
 * silently burns data every time the user switches apps), and retries back off
 * rather than hammering a connection that is already struggling.
 *
 * The cache is written to the device and restored on launch. Without it every
 * cold start showed skeletons while the network was asked for things the phone
 * already knew — on a slow Lagos connection that is several seconds of staring
 * at grey boxes before your own application appears. With it the last known
 * state paints immediately and is revalidated behind it.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, focusManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { toUserError } from '@/lib/errors';

/**
 * How long a restored cache may be used before it is thrown away rather than
 * shown. A day-old application status is still worth painting instantly; a
 * month-old one is misleading.
 */
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        // Must exceed MAX_CACHE_AGE_MS, or entries are evicted from memory
        // before the persisted copy is considered stale and nothing restores.
        gcTime: 25 * 60 * 60 * 1000,
        // Refetching on every app focus is expensive on mobile data. Screens
        // that need freshness offer pull-to-refresh instead.
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: (failureCount, error) => {
          const userError = toUserError(error);
          // Never retry a permission or validation failure — it will fail
          // identically every time and just delays the error message.
          if (!userError.retryable) return false;
          return failureCount < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      },
      mutations: {
        // A mutation retry can duplicate a submission; the user retries.
        retry: false,
      },
    },
  });
}

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'zwcc.query-cache',
  // A dropped write must never take the app down; a missing cache just means a
  // normal cold start.
  throttleTime: 2000,
});

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(createQueryClient);

  // React Query's focus tracking is browser-based; wire it to AppState so
  // `refetchOnReconnect` and friends behave correctly on a phone.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    });
    return () => subscription.remove();
  }, []);

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: MAX_CACHE_AGE_MS,
        dehydrateOptions: {
          // Only successful queries are worth restoring. Persisting an error
          // would show a stale failure on a launch that might have worked.
          shouldDehydrateQuery: (query) => query.state.status === 'success',
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}

/** Query keys, centralised so invalidation cannot miss a cache entry. */
export const queryKeys = {
  profile: (userId: string) => ['profile', userId] as const,
  myApplication: (userId: string) => ['application', 'mine', userId] as const,
  applicationHistory: (userId: string) => ['application', 'history', userId] as const,
  application: (id: string) => ['application', id] as const,
  applicationContext: (id: string) => ['application', id, 'context'] as const,
  documents: (applicationId: string) => ['documents', applicationId] as const,
  statusHistory: (applicationId: string) => ['application', applicationId, 'history'] as const,
  reviews: (applicationId: string) => ['reviews', applicationId] as const,
  agreement: (applicationId: string) => ['agreement', applicationId] as const,
  beneficiary: (userId: string) => ['beneficiary', userId] as const,
  monitoring: (beneficiaryId: string) => ['monitoring', beneficiaryId] as const,
  reportMedia: (reportId: string) => ['report-media', reportId] as const,
  notifications: (userId: string) => ['notifications', userId] as const,
  unreadCount: (userId: string) => ['notifications', userId, 'unread'] as const,
  committeeList: (filters: unknown) => ['committee', 'applications', filters] as const,
  committeeStats: () => ['committee', 'stats'] as const,
  beneficiaries: (status: string) => ['beneficiaries', status] as const,
  reportsForReview: () => ['reports', 'review-queue'] as const,
  users: (filters: unknown) => ['admin', 'users', filters] as const,
  auditLog: (filters: unknown) => ['admin', 'audit', filters] as const,
};
