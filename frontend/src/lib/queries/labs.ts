// src/lib/queries/labs.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  LabsListResponse,
  LabMutationResponse,
  LabPricingResponse,
  LabNetworkOptions,
  LabPaymentUploadResponse,
  LabUrlResponse,
  LabWindowsPasswordResponse,
} from '@/types/api';

const VALID_STATUSES = new Set([
  'pending_approval', 'provisioning', 'running', 'stopped', 'terminated', 'rejected',
]);

export const LABS_KEY = ['labs'] as const;

export function useLabsList() {
  return useQuery({
    queryKey: LABS_KEY,
    queryFn: async () => {
      const data = await apiFetch<LabsListResponse>('/labs');
      // Admin scan includes special config records (PRICING_SETTINGS, LAB_TEMPLATE_SETTINGS).
      // Filter to actual lab records only.
      return {
        labs: data.labs.filter((l) => VALID_STATUSES.has(l.status)),
      };
    },
    refetchInterval: (query) => {
      const labs = query.state.data?.labs ?? [];
      return labs.some((l) => l.status === 'provisioning') ? 15_000 : false;
    },
    staleTime: 0,
  });
}

export function useLabMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { action: string } & Record<string, unknown>) =>
      apiFetch<LabMutationResponse>('/labs', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LABS_KEY });
    },
  });
}

export function useDeleteLab() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (labId: string) =>
      apiFetch<LabMutationResponse>('/labs', {
        method: 'DELETE',
        body: JSON.stringify({ labId }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LABS_KEY });
    },
  });
}

export interface LabPricingParams {
  instanceType: string;
  region: string;
  os: 'ubuntu' | 'windows';
  storageGb: number;
  elasticIp: boolean;
  hoursPerDay: number;
  totalDays: number; // = months × 30
}

export function useLabPricing(params: LabPricingParams | null) {
  return useQuery({
    queryKey: ['labPricing', params],
    queryFn: () => {
      if (!params) throw new Error('params required');
      const p = params;
      const qs = new URLSearchParams({
        instanceType: p.instanceType,
        region: p.region,
        os: p.os,
        storageGb: String(p.storageGb),
        elasticIp: String(p.elasticIp),
        hoursPerDay: String(p.hoursPerDay),
        totalDays: String(p.totalDays),
      });
      return apiFetch<LabPricingResponse>(`/labs/pricing?${qs.toString()}`);
    },
    enabled: params !== null,
    staleTime: 60_000,
  });
}

export function useLabNetworkOptions(accountId: string, region: string) {
  return useQuery({
    queryKey: ['labNetworkOptions', accountId, region],
    queryFn: () =>
      apiFetch<LabNetworkOptions>(
        `/labs/network-options?accountId=${encodeURIComponent(accountId)}&region=${encodeURIComponent(region)}`,
      ),
    enabled: Boolean(accountId) && Boolean(region),
    staleTime: 300_000,
  });
}

export function useLabPaymentUpload() {
  return useMutation({
    mutationFn: (body: { fileData: string; mimeType: string }) =>
      apiFetch<LabPaymentUploadResponse>('/labs/payment', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

export function useLabPaymentView() {
  return useMutation({
    mutationFn: (labId: string) =>
      apiFetch<LabUrlResponse>(`/labs/payment?labId=${encodeURIComponent(labId)}`),
  });
}

export function useLabKeypair() {
  return useMutation({
    mutationFn: (labId: string) =>
      apiFetch<LabUrlResponse>(`/labs/keypair?labId=${encodeURIComponent(labId)}`),
  });
}

export function useLabWindowsPassword() {
  return useMutation({
    mutationFn: (labId: string) =>
      apiFetch<LabWindowsPasswordResponse>(
        `/labs/windows-password?labId=${encodeURIComponent(labId)}`,
      ),
  });
}
