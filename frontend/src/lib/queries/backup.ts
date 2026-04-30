import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { BackupListResponse, BackupMutationResponse } from '@/types/api';

export function backupKey(instanceId: string, accountId: string, region: string) {
  return ['backup', instanceId, accountId, region] as const;
}

export function useBackupList(instanceId: string, accountId: string, region: string) {
  return useQuery({
    queryKey: backupKey(instanceId, accountId, region),
    queryFn: () => {
      const params = new URLSearchParams({ instanceId, accountId, region });
      return apiFetch<BackupListResponse>(`/backup?${params.toString()}`);
    },
    enabled: Boolean(instanceId && accountId && region),
    staleTime: 30_000,
  });
}

export function useBackupMutation(instanceId: string, accountId: string, region: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<BackupMutationResponse>('/backup', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: backupKey(instanceId, accountId, region) });
    },
  });
}
