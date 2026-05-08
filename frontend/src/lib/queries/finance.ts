import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  VendorsResponse,
  VendorMutationResponse,
  CustomersResponse,
  CustomerMutationResponse,
  FinanceSettings,
  FinanceSettingsMutationResponse,
  FinanceAlertsResponse,
} from '@/types/api';

export const VENDORS_KEY = ['finance-vendors'] as const;
export const CUSTOMERS_KEY = ['finance-customers'] as const;
export const FINANCE_ALERTS_KEY = ['finance-alerts'] as const;
export const FINANCE_SETTINGS_KEY = ['finance-settings'] as const;

export function useVendors() {
  return useQuery({
    queryKey: VENDORS_KEY,
    queryFn: () => apiFetch<VendorsResponse>('/finance/vendors'),
    staleTime: 30_000,
  });
}

export function useVendorMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { action: string } & Record<string, unknown>) =>
      apiFetch<VendorMutationResponse>('/finance/vendors', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: VENDORS_KEY });
    },
  });
}

export function useCustomers() {
  return useQuery({
    queryKey: CUSTOMERS_KEY,
    queryFn: () => apiFetch<CustomersResponse>('/finance/customers'),
    staleTime: 30_000,
  });
}

export function useCustomerMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { action: string } & Record<string, unknown>) =>
      apiFetch<CustomerMutationResponse>('/finance/customers', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: CUSTOMERS_KEY });
    },
  });
}

export function useFinanceAlerts() {
  return useQuery({
    queryKey: FINANCE_ALERTS_KEY,
    queryFn: () => apiFetch<FinanceAlertsResponse>('/finance/alerts'),
    staleTime: 30_000,
  });
}

export function useFinanceSettings() {
  return useQuery({
    queryKey: FINANCE_SETTINGS_KEY,
    queryFn: () => apiFetch<FinanceSettings>('/finance/settings'),
    staleTime: 60_000,
  });
}

export function useFinanceSettingsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<FinanceSettingsMutationResponse>('/finance/settings', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: FINANCE_SETTINGS_KEY });
    },
  });
}
