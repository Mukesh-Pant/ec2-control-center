// src/lib/queries/labSettings.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  LabPricingSettingsResponse,
  LabTemplatesResponse,
} from '@/types/api';

export const LAB_PRICING_SETTINGS_KEY = ['labPricingSettings'] as const;
export const LAB_TEMPLATES_KEY = ['labTemplates'] as const;

export function useLabPricingSettings() {
  return useQuery({
    queryKey: LAB_PRICING_SETTINGS_KEY,
    queryFn: () => apiFetch<LabPricingSettingsResponse>('/labs/pricing-settings'),
    staleTime: 60_000,
  });
}

export function useLabPricingSettingsMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<LabPricingSettingsResponse>('/labs/pricing-settings', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LAB_PRICING_SETTINGS_KEY });
    },
  });
}

export function useLabTemplates() {
  return useQuery({
    queryKey: LAB_TEMPLATES_KEY,
    queryFn: () => apiFetch<LabTemplatesResponse>('/labs/templates'),
    staleTime: 60_000,
  });
}

export function useLabTemplatesMutation() {
  const qc = useQueryClient();
  return useMutation({
    // Replaces ALL templates at once — backend does full replacement
    mutationFn: (templates: Record<string, unknown>[]) =>
      apiFetch<LabTemplatesResponse>('/labs/templates', {
        method: 'POST',
        body: JSON.stringify({ templates }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LAB_TEMPLATES_KEY });
    },
  });
}
