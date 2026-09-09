/**
 * Data-fetching hooks.
 *
 * Thin wrappers over the service layer so screens never call Supabase and never
 * hand-roll cache keys. Invalidation lives here too, beside the queries it
 * affects.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { queryKeys } from '@/providers/QueryProvider';
import { useAuth } from '@/providers/AuthProvider';
import { applicationService } from '@/services/application.service';
import { agreementService } from '@/services/agreement.service';
import { documentService } from '@/services/document.service';
import { monitoringService } from '@/services/monitoring.service';
import { notifications } from '@/services/notifications';
import { profileService } from '@/services/profile.service';
import { reviewService } from '@/services/review.service';
import type { Role } from '@/types/roles';

/* -------------------------------------------------------------------------- */
/* Applicant                                                                   */
/* -------------------------------------------------------------------------- */

export function useMyApplication() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.myApplication(user?.id ?? 'anonymous'),
    queryFn: () => applicationService.getMyApplication(user!.id),
    enabled: Boolean(user?.id),
  });
}

export function useMyApplicationHistory() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.applicationHistory(user?.id ?? 'anonymous'),
    queryFn: () => applicationService.getMyApplicationHistory(user!.id),
    enabled: Boolean(user?.id),
  });
}

export function useApplicationContext(applicationId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.applicationContext(applicationId ?? 'none'),
    queryFn: () => applicationService.getWithContext(applicationId!),
    enabled: Boolean(applicationId),
  });
}

export function useDocuments(applicationId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.documents(applicationId ?? 'none'),
    queryFn: () => applicationService.getDocuments(applicationId!),
    enabled: Boolean(applicationId),
  });
}

export function useStatusHistory(applicationId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.statusHistory(applicationId ?? 'none'),
    queryFn: () => applicationService.getStatusHistory(applicationId!),
    enabled: Boolean(applicationId),
  });
}

export function useReviews(applicationId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.reviews(applicationId ?? 'none'),
    queryFn: () => reviewService.list(applicationId!),
    enabled: Boolean(applicationId),
  });
}

export function useAgreement(applicationId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.agreement(applicationId ?? 'none'),
    queryFn: () => agreementService.getByApplication(applicationId!),
    enabled: Boolean(applicationId),
  });
}

/* -------------------------------------------------------------------------- */
/* Monitoring                                                                  */
/* -------------------------------------------------------------------------- */

export function useMyBeneficiary() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.beneficiary(user?.id ?? 'anonymous'),
    queryFn: () => monitoringService.getMyBeneficiary(user!.id),
    enabled: Boolean(user?.id),
  });
}

export function useMonitoringOverview(beneficiaryId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.monitoring(beneficiaryId ?? 'none'),
    queryFn: () => monitoringService.getOverview(beneficiaryId!),
    enabled: Boolean(beneficiaryId),
  });
}

export function useReportMedia(reportId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.reportMedia(reportId ?? 'none'),
    queryFn: async () => {
      const media = await monitoringService.getReportMedia(reportId!);
      const urls = await monitoringService.getMediaUrls(media);
      return media.map((item) => ({ ...item, url: urls[item.storage_path] ?? null }));
    },
    enabled: Boolean(reportId),
    // Signed URLs expire; do not serve a stale one from cache for long.
    staleTime: 30 * 60_000,
  });
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                               */
/* -------------------------------------------------------------------------- */

export function useNotifications() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.notifications(user?.id ?? 'anonymous'),
    queryFn: () => notifications.list(user!.id),
    enabled: Boolean(user?.id),
  });
}

export function useUnreadCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: queryKeys.unreadCount(user?.id ?? 'anonymous'),
    queryFn: () => notifications.unreadCount(user!.id),
    enabled: Boolean(user?.id),
    staleTime: 30_000,
  });
}

export function useMarkNotificationRead() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: (notificationId: string) => notifications.markRead(notificationId),
    onSuccess: () => {
      if (!user) return;
      void client.invalidateQueries({ queryKey: queryKeys.notifications(user.id) });
      void client.invalidateQueries({ queryKey: queryKeys.unreadCount(user.id) });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const client = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: () => notifications.markAllRead(user!.id),
    onSuccess: () => {
      if (!user) return;
      void client.invalidateQueries({ queryKey: queryKeys.notifications(user.id) });
      void client.invalidateQueries({ queryKey: queryKeys.unreadCount(user.id) });
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Committee                                                                   */
/* -------------------------------------------------------------------------- */

export interface CommitteeFilters {
  statuses?: string[];
  search?: string;
  sector?: string;
  sortBy?: 'submitted_at' | 'requested_amount' | 'created_at';
  ascending?: boolean;
  page?: number;
  pageSize?: number;
}

export function useCommitteeApplications(filters: CommitteeFilters) {
  return useQuery({
    queryKey: queryKeys.committeeList(filters),
    queryFn: () => applicationService.listForCommittee(filters),
    // Keeps the previous page visible while the next one loads, so the list
    // does not flash empty on every keystroke in the search box.
    placeholderData: (previous) => previous,
  });
}

export function useCommitteeStats() {
  return useQuery({
    queryKey: queryKeys.committeeStats(),
    queryFn: () => applicationService.getStatistics(),
    staleTime: 2 * 60_000,
  });
}

export function useBeneficiaries(status: 'active' | 'completed' | 'paused' = 'active') {
  return useQuery({
    queryKey: queryKeys.beneficiaries(status),
    queryFn: () => monitoringService.listBeneficiaries({ status }),
  });
}

export function useReportsForReview() {
  return useQuery({
    queryKey: queryKeys.reportsForReview(),
    queryFn: () => monitoringService.listReportsForReview(),
  });
}

/* -------------------------------------------------------------------------- */
/* Administration                                                              */
/* -------------------------------------------------------------------------- */

export function useUsers(filters: { role?: Role; search?: string }) {
  return useQuery({
    queryKey: queryKeys.users(filters),
    queryFn: () => profileService.listUsers(filters),
    placeholderData: (previous) => previous,
  });
}

/* -------------------------------------------------------------------------- */
/* Shared invalidation                                                         */
/* -------------------------------------------------------------------------- */

/**
 * After a workflow transition almost everything on screen is stale. One helper
 * so no caller forgets a key and leaves a dashboard showing an old status.
 */
export function useInvalidateApplication() {
  const client = useQueryClient();
  const { user } = useAuth();

  return (applicationId?: string) => {
    if (user) {
      void client.invalidateQueries({ queryKey: queryKeys.myApplication(user.id) });
      void client.invalidateQueries({ queryKey: queryKeys.applicationHistory(user.id) });
      void client.invalidateQueries({ queryKey: queryKeys.beneficiary(user.id) });
      void client.invalidateQueries({ queryKey: queryKeys.unreadCount(user.id) });
      void client.invalidateQueries({ queryKey: queryKeys.notifications(user.id) });
    }
    if (applicationId) {
      void client.invalidateQueries({ queryKey: ['application', applicationId] });
      void client.invalidateQueries({ queryKey: queryKeys.documents(applicationId) });
      void client.invalidateQueries({ queryKey: queryKeys.agreement(applicationId) });
      void client.invalidateQueries({ queryKey: queryKeys.reviews(applicationId) });
    }
    void client.invalidateQueries({ queryKey: ['committee'] });
    void client.invalidateQueries({ queryKey: ['beneficiaries'] });
  };
}

export { documentService, applicationService, monitoringService, agreementService, reviewService };
