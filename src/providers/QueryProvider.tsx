/**
 * React Query configuration.
 *
 * Defaults are tuned for slow, metered mobile connections rather than a
 * desktop browser: data stays fresh for longer, refetch-on-focus is off (it
 * silently burns data every time the user switches apps), and retries back off
 * rather than hammering a connection that is already struggling.
 */
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { toUserError } from '@/lib/errors';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 15 * 60_000,
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

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
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
