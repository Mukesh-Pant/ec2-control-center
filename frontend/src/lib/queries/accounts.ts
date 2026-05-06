import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { AccountsResponse, AccountActionResponse, ConsoleLoginResponse } from '@/types/api';

export const ACCOUNTS_KEY = ['accounts'] as const;

export function useAccounts() {
  return useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: () => apiFetch<AccountsResponse>('/accounts'),
    staleTime: 60_000,
  });
}

export function useAccountMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<AccountActionResponse>('/accounts', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    },
  });
}

export function useConsoleLogin() {
  return useMutation({
    mutationFn: (body: { accountId: string; region: string }) =>
      apiFetch<ConsoleLoginResponse>('/console-login', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}
