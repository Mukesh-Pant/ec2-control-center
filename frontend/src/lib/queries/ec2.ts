import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { InstancesResponse, ActionResponse } from '@/types/api';

export const EC2_KEY = ['instances'] as const;

export function useInstances() {
  return useQuery({
    queryKey: EC2_KEY,
    queryFn: () =>
      apiFetch<InstancesResponse>('/ec2', {
        method: 'POST',
        body: JSON.stringify({ action: 'list' }),
      }),
    staleTime: 30_000,
  });
}

interface InstanceMutationVars {
  instanceId: string;
  instanceName: string;
  instanceType: string;
  accountId: string;
  region: string;
}

function useInstanceAction(action: 'start' | 'stop') {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: InstanceMutationVars) =>
      apiFetch<ActionResponse>('/ec2', {
        method: 'POST',
        body: JSON.stringify({ action, ...vars }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: EC2_KEY });
    },
  });
}

export const useStartInstance = () => useInstanceAction('start');
export const useStopInstance = () => useInstanceAction('stop');
