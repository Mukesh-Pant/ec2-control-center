import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { AuditResponse, DailyBillingResponse } from '@/types/api';

export interface AuditFilters {
  instanceId?: string;
  userEmail?: string;
  action?: string;
  accountId?: string;
  limit?: number;
  lastKey?: string;
}

export function useAuditLog(filters: AuditFilters = {}) {
  const params = new URLSearchParams();
  if (filters.instanceId) params.set('instanceId', filters.instanceId);
  if (filters.userEmail) params.set('userEmail', filters.userEmail);
  if (filters.action) params.set('action', filters.action);
  if (filters.accountId) params.set('accountId', filters.accountId);
  params.set('limit', String(filters.limit ?? 50));
  if (filters.lastKey) params.set('lastKey', filters.lastKey);

  return useQuery({
    queryKey: ['audit', filters],
    queryFn: () => apiFetch<AuditResponse>(`/audit?${params.toString()}`),
    staleTime: 30_000,
  });
}

export function useDailyBilling(days = 30) {
  const params = new URLSearchParams({ days: String(days) });
  return useQuery({
    queryKey: ['billing', days],
    queryFn: () => apiFetch<DailyBillingResponse>(`/audit/daily?${params.toString()}`),
    staleTime: 60_000,
  });
}
