# Labs / My Servers React Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the My Servers screen (4-step lab wizard + filterable lab list) and admin Lab Settings screen in the React frontend, wiring to the existing production `labs.py` Lambda.

**Architecture:** Nine independent tasks building bottom-up: types → query hooks → nav/routing → list row → filterable list → wizard → shell screen → admin settings. Each task compiles and type-checks on its own before the next starts.

**Tech Stack:** React 18, TypeScript 5.6 strict, TanStack Query v5, Vite 5, `@tanstack/react-query`, lucide-react icons, existing `@/components/ui` (Button, Badge, Card, PageHeader, EmptyState, Icon), CSS variables from `src/styles/tokens.css`.

---

## Critical Backend Facts (read before writing any code)

These differ from the spec — use these exact shapes:

| Endpoint | Method | Request | Response |
|----------|--------|---------|----------|
| `/labs` | GET | — | `{ labs: Lab[] }` |
| `/labs` | POST | `{ action, ...fields }` | varies |
| `/labs` | DELETE | `{ labId }` | `{ message }` |
| `/labs/pricing` | GET | query: `instanceType, region, os, storageGb, elasticIp, hoursPerDay, totalDays` | `{ breakdown: {...}, runningHours, totalDays, hoursPerDay }` |
| `/labs/pricing-settings` | GET | — | `{ settings: PricingSettings }` |
| `/labs/pricing-settings` | POST | partial settings dict | `{ settings, message }` |
| `/labs/templates` | GET | — | `{ templates: LabTemplate[] }` |
| `/labs/templates` | POST | `{ templates: LabTemplate[] }` | `{ templates, message }` (FULL REPLACE, not individual CRUD) |
| `/labs/payment` | POST | `{ fileData: "<base64>", mimeType }` | `{ paymentKey: "<s3-key>" }` |
| `/labs/payment` | GET | `?labId=` | `{ url: "<presigned>" }` |
| `/labs/keypair` | GET | `?labId=` | `{ url: "<presigned>" }` |
| `/labs/windows-password` | GET | `?labId=` | `{ password: "..." }` |
| `/labs/network-options` | GET | `?accountId=&region=` | `{ vpcs, subnets, securityGroups }` |

**Payment upload is base64, NOT a presigned PUT.** Read the file with `FileReader.readAsDataURL`, strip the `data:...;base64,` prefix, POST the base64 string.

**Pricing `os` param**: use `'ubuntu'` or `'windows'` (NOT `platform`). `totalDays = months × 30`.

**Submit body**: `{ action: 'submit', accountId, region, platform, instanceType, storageGb, elasticIp, subnetId, securityGroupIds: string[], durationHours, paymentKey, labName? }`.
`durationHours = hoursPerDay × 30 × months`.

**Admin `/labs` list scan** returns special records (`PRICING_SETTINGS`, `LAB_TEMPLATE_SETTINGS`). Filter client-side: keep only items where `lab.status` is a valid status string.

**Lab field name**: `userEmail` (not `callerEmail`), `estimatedCost` (not `estimatedCostUsd`).

**Badge tones**: `'ok' | 'err' | 'warn' | 'muted' | 'accent'` — no `'danger'`. Use `'err'` for rejected/terminated badges.

**Button variants**: `'primary' | 'ghost' | 'accent' | 'danger' | 'ok'` — `'danger'` IS valid for buttons.

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/types/api.ts` | Modify | Add all Lab* interfaces |
| `src/lib/queries/labs.ts` | Create | TanStack Query hooks for labs CRUD + pricing |
| `src/lib/queries/labSettings.ts` | Create | Hooks for pricing settings + templates |
| `src/features/app/nav.ts` | Modify | Add `lab-settings` nav item + ADMIN_ONLY_PAGES |
| `src/App.tsx` | Modify | Add `/app/lab-settings` route |
| `src/pages/app/labs/LabRow.tsx` | Create | Single lab table row + inline expand panel |
| `src/pages/app/labs/LabList.tsx` | Create | Filterable table with bucket tabs + auto-poll |
| `src/pages/app/labs/LabWizard.tsx` | Create | 4-step provisioning wizard |
| `src/pages/app/MyServersScreen.tsx` | Modify | Wire wizard + list into the shell screen |
| `src/pages/app/LabSettingsScreen.tsx` | Create | Admin pricing settings + template management |

---

## Task 1: Lab TypeScript Interfaces

**Files:**
- Modify: `src/types/api.ts`

- [ ] **Step 1: Add Lab interfaces**

Append to the bottom of `src/types/api.ts`:

```typescript
// ── Labs (M11) ────────────────────────────────────────────────────────────

export interface LabVpc {
  vpcId: string;
  name: string;
  cidrBlock: string;
}

export interface LabSubnet {
  subnetId: string;
  name: string;
  cidrBlock: string;
  availabilityZone: string;
  vpcId: string;
}

export interface LabSecurityGroup {
  groupId: string;
  groupName: string;
  description: string;
  vpcId: string;
}

export interface LabNetworkOptions {
  vpcs: LabVpc[];
  subnets: LabSubnet[];
  securityGroups: LabSecurityGroup[];
}

export interface Lab {
  labId: string;
  labName: string;
  userEmail: string;
  accountId: string;
  region: string;
  instanceId?: string;
  instanceType: string;
  platform: 'ubuntu' | 'windows';
  storageGb: number;
  elasticIp: boolean;
  subnetId: string;
  securityGroupIds: string; // JSON-encoded string from backend
  durationHours: number;
  expiresAt?: string;
  status: 'pending_approval' | 'provisioning' | 'running' | 'stopped' | 'terminated' | 'rejected';
  estimatedCost?: number;
  paymentS3Key?: string;
  publicIp?: string;
  keyName?: string;
  keyS3Key?: string;
  allocationId?: string;
  createdAt?: string;
}

export interface LabsListResponse {
  labs: Lab[];
}

export interface LabMutationResponse {
  labId?: string;
  instanceId?: string;
  status?: string;
  estimatedCost?: number;
  message?: string;
}

export interface LabPricingBreakdown {
  ec2Hourly: number;
  ec2Cost: number;
  ebsCost: number;
  eipCost: number;
  dataTransferCost: number;
  backupCost: number;
  monitoringCost: number;
  currencyRate: number;
  currencyCode: string;
  totalUsd: number;
  subtotalUsd: number;
  whtPercent: number;
  whtAmount: number;
  discountPercent: number;
  discountAmount: number;
  vatPercent: number;
  vatAmount: number;
  finalTotalUsd: number;
  marginPercent?: number; // admin-only
  marginAmount?: number;  // admin-only
}

export interface LabPricingResponse {
  breakdown: LabPricingBreakdown;
  runningHours: number;
  totalDays: number;
  hoursPerDay: number;
}

export interface LabPaymentUploadResponse {
  paymentKey: string; // s3 key; pass as paymentKey in submit body
}

export interface LabUrlResponse {
  url: string; // presigned URL — used for keypair download, payment view
}

export interface LabWindowsPasswordResponse {
  password: string;
}

export interface LabTemplate {
  id: string;
  name: string;
  description: string;
  badge?: string;
  instanceType: string;
  vcpu: number;
  ram: string;
  storageGb: number;
  platform: 'ubuntu' | 'windows';
  elasticIp: boolean;
  useCases: string[];
}

export interface LabTemplatesResponse {
  templates: LabTemplate[];
  message?: string;
}

export interface LabPricingSettings {
  whtPercent: number;
  vatPercent: number;
  marginPercent: number;
  dataTransferMonthlyUsd: number;
  includeBackup: boolean;
  includeMonitoring: boolean;
  currencyRate: number;
  currencyCode: string;
  discountPercent: number;
  showBreakdown: boolean;
}

export interface LabPricingSettingsResponse {
  settings: LabPricingSettings;
  message?: string;
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/api.ts
git commit -m "feat(frontend): add Lab TypeScript interfaces to api.ts"
```

---

## Task 2: Labs Query Hooks

**Files:**
- Create: `src/lib/queries/labs.ts`

- [ ] **Step 1: Create the file**

```typescript
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
    mutationFn: (body: Record<string, unknown>) =>
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
      const p = params!;
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
    enabled: Boolean(accountId),
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
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/queries/labs.ts
git commit -m "feat(frontend): add TanStack Query hooks for labs"
```

---

## Task 3: Lab Settings Query Hooks

**Files:**
- Create: `src/lib/queries/labSettings.ts`

- [ ] **Step 1: Create the file**

```typescript
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
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/queries/labSettings.ts
git commit -m "feat(frontend): add TanStack Query hooks for lab settings"
```

---

## Task 4: Nav + Routing for Lab Settings

**Files:**
- Modify: `src/features/app/nav.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Update nav.ts**

In `src/features/app/nav.ts`, make these three changes:

1. Add `lab-settings` to the Administration section items:
```typescript
// In the Administration section, add after { id: 'users', ... }:
{ id: 'lab-settings', label: 'Lab Settings', icon: 'Settings2' },
```

2. Add `'lab-settings'` to `ADMIN_ONLY_PAGES`:
```typescript
export const ADMIN_ONLY_PAGES = new Set(['accounts', 'users', 'lab-settings']);
```

3. Add to `PAGE_TITLES`:
```typescript
'lab-settings': 'Lab Settings',
```

- [ ] **Step 2: Update App.tsx**

In `src/App.tsx`:

Add the import after the `UsersScreen` import line:
```typescript
import LabSettingsScreen from '@/pages/app/LabSettingsScreen';
```

Add the route inside the `/app` nested Route block, before the catch-all `*` route:
```typescript
<Route path="lab-settings" element={<LabSettingsScreen />} />
```

- [ ] **Step 3: Create LabSettingsScreen stub** (so the import resolves now; full implementation in Task 9)

Create `src/pages/app/LabSettingsScreen.tsx`:
```typescript
import { PageHeader } from '@/components/ui';
import { getRole } from '@/lib/auth';
import { Navigate } from 'react-router-dom';

export default function LabSettingsScreen() {
  const role = getRole();
  if (role !== 'admin') return <Navigate to="/app/instances" replace />;
  return (
    <div className="page">
      <PageHeader eyebrow="Administration" title="Lab Settings" sub="Pricing configuration and template management." />
      <p style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>Loading…</p>
    </div>
  );
}
```

- [ ] **Step 4: Type-check and verify nav renders**

```bash
cd frontend && npx tsc --noEmit
```

Start dev server (`npm run dev`) and log in as admin — confirm "Lab Settings" appears in the Administration sidebar section. Log in as operator — confirm it is hidden.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/app/nav.ts frontend/src/App.tsx frontend/src/pages/app/LabSettingsScreen.tsx
git commit -m "feat(frontend): add Lab Settings nav item and route"
```

---

## Task 5: LabRow Component

**Files:**
- Create: `src/pages/app/labs/LabRow.tsx`

The `labs/` directory does not exist yet — create the file and the directory will be created automatically.

- [ ] **Step 1: Create LabRow.tsx**

```typescript
// src/pages/app/labs/LabRow.tsx
import { useState } from 'react';
import { Badge, Button } from '@/components/ui';
import { ChevronRight } from 'lucide-react';
import type { Lab } from '@/types/api';
import { getRole } from '@/lib/auth';
import {
  useLabMutation,
  useDeleteLab,
  useLabPaymentView,
  useLabKeypair,
  useLabWindowsPassword,
} from '@/lib/queries/labs';

interface Props {
  lab: Lab;
  isExpanded: boolean;
  onToggle: (labId: string) => void;
  accountName?: string;
}

function statusBadge(status: Lab['status']) {
  switch (status) {
    case 'pending_approval': return <Badge tone="warn" dot>Pending Approval</Badge>;
    case 'provisioning':     return <Badge tone="accent" dot>Provisioning</Badge>;
    case 'running':          return <Badge tone="ok" dot>Running</Badge>;
    case 'stopped':          return <Badge tone="muted" dot>Stopped</Badge>;
    case 'terminated':       return <Badge tone="muted">Terminated</Badge>;
    case 'rejected':         return <Badge tone="err">Rejected</Badge>;
  }
}

function formatExpiry(expiresAt?: string) {
  if (!expiresAt) return <span style={{ color: 'var(--ink-4)' }}>—</span>;
  const ms = new Date(expiresAt).getTime() - Date.now();
  const days = Math.floor(ms / 86_400_000);
  const label = days < 0 ? 'Expired' : days === 0 ? 'Today' : `${days}d`;
  const color = ms < 0 ? 'var(--red-2)' : days <= 7 ? 'var(--amber-2)' : 'var(--green-2)';
  return <span style={{ color, fontWeight: 600 }}>{label}</span>;
}

function copyToClipboard(text: string) {
  void navigator.clipboard.writeText(text);
}

function downloadBlob(filename: string, content: string, mimeType = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mimeType }));
  a.download = filename;
  a.click();
}

function ExpandPanel({ lab }: { lab: Lab }) {
  const role = getRole();
  const isAdmin = role === 'admin';
  const labMut = useLabMutation();
  const deleteMut = useDeleteLab();
  const paymentViewMut = useLabPaymentView();
  const keypairMut = useLabKeypair();
  const winPassMut = useLabWindowsPassword();
  const [winPassword, setWinPassword] = useState('');
  const [confirmTerminate, setConfirmTerminate] = useState(false);
  const [mutError, setMutError] = useState('');

  const viewPayment = async () => {
    setMutError('');
    try {
      const res = await paymentViewMut.mutateAsync(lab.labId);
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Failed to load payment.');
    }
  };

  const approveLab = async () => {
    setMutError('');
    try {
      await labMut.mutateAsync({ action: 'approve', labId: lab.labId });
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Approval failed.');
    }
  };

  const rejectLab = async () => {
    setMutError('');
    try {
      await labMut.mutateAsync({ action: 'reject', labId: lab.labId });
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Rejection failed.');
    }
  };

  const downloadKeypair = async () => {
    setMutError('');
    try {
      const res = await keypairMut.mutateAsync(lab.labId);
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Failed to download keypair.');
    }
  };

  const getWindowsPassword = async () => {
    setMutError('');
    try {
      const res = await winPassMut.mutateAsync(lab.labId);
      setWinPassword(res.password);
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Failed to get password.');
    }
  };

  const terminateLab = async () => {
    setMutError('');
    try {
      await deleteMut.mutateAsync(lab.labId);
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Termination failed.');
      setConfirmTerminate(false);
    }
  };

  const downloadRdp = () => {
    const rdp = [
      'full address:s:' + (lab.publicIp ?? ''),
      'username:s:Administrator',
      'authentication level:i:0',
    ].join('\r\n');
    downloadBlob(`${lab.labName}.rdp`, rdp, 'application/x-rdp');
  };

  const infoRows: [string, React.ReactNode][] = [
    ['Lab ID',        <span style={{ fontFamily: 'var(--f-mono)', fontSize: 12 }}>{lab.labId}</span>],
    ['Instance ID',   lab.instanceId || '—'],
    ['Public IP',     lab.publicIp   || '—'],
    ['Elastic IP',    lab.allocationId ? `${lab.publicIp ?? '—'} (${lab.allocationId})` : '—'],
    ['Platform',      lab.platform === 'ubuntu' ? 'Linux (Ubuntu)' : 'Windows'],
    ['Instance Type', lab.instanceType],
    ['Storage',       `${lab.storageGb} GB`],
    ['Est. Cost',     lab.estimatedCost != null ? `$${lab.estimatedCost.toFixed(2)}` : '—'],
    ['Expires',       formatExpiry(lab.expiresAt)],
    ...(isAdmin ? [['Submitted By', lab.userEmail] as [string, React.ReactNode]] : []),
  ];

  return (
    <div style={{ padding: '16px var(--pad)', background: 'var(--surface-2)', borderTop: '1px solid var(--line)' }}>
      {/* Lab info grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 12px', fontSize: 13, marginBottom: 16 }}>
        {infoRows.map(([k, v]) => (
          <>
            <span key={`k-${k}`} style={{ color: 'var(--ink-3)', fontWeight: 500 }}>{k}</span>
            <span key={`v-${k}`}>{v}</span>
          </>
        ))}
      </div>

      {/* Status-dependent zone */}
      {lab.status === 'running' && (
        <div>
          {lab.platform === 'ubuntu' ? (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 4 }}>SSH command</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={{ fontFamily: 'var(--f-mono)', fontSize: 12, background: 'var(--surface)', padding: '6px 10px', borderRadius: 'var(--r)', border: '1px solid var(--line)', flex: 1 }}>
                  {`ssh -i keypair.pem ubuntu@${lab.publicIp ?? '<ip>'}`}
                </code>
                <Button size="xs" variant="ghost" onClick={() => copyToClipboard(`ssh -i keypair.pem ubuntu@${lab.publicIp ?? ''}`)}>Copy</Button>
              </div>
              <div style={{ marginTop: 8 }}>
                <Button size="xs" variant="ghost" icon="Download" onClick={() => void downloadKeypair()} disabled={keypairMut.isPending}>
                  {keypairMut.isPending ? 'Loading…' : 'Download keypair (.pem)'}
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 8 }}>Connect via RDP to {lab.publicIp ?? '—'} as Administrator</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button size="xs" variant="ghost" icon="Download" onClick={downloadRdp}>Download .rdp file</Button>
                <Button size="xs" variant="ghost" onClick={() => void getWindowsPassword()} disabled={winPassMut.isPending}>
                  {winPassMut.isPending ? 'Fetching…' : 'Get Windows password'}
                </Button>
              </div>
              {winPassword && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <code style={{ fontFamily: 'var(--f-mono)', fontSize: 12, background: 'var(--surface)', padding: '6px 10px', borderRadius: 'var(--r)', border: '1px solid var(--line)' }}>
                    {winPassword}
                  </code>
                  <Button size="xs" variant="ghost" onClick={() => copyToClipboard(winPassword)}>Copy</Button>
                </div>
              )}
            </div>
          )}
          {isAdmin && !confirmTerminate && (
            <Button size="xs" variant="danger" onClick={() => setConfirmTerminate(true)}>Terminate lab</Button>
          )}
          {isAdmin && confirmTerminate && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>Terminate this lab?</span>
              <Button size="xs" variant="danger" onClick={() => void terminateLab()} disabled={deleteMut.isPending}>
                {deleteMut.isPending ? 'Terminating…' : 'Yes, terminate'}
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setConfirmTerminate(false)}>Cancel</Button>
            </div>
          )}
        </div>
      )}

      {lab.status === 'provisioning' && (
        <div>
          <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>
            ⚙ Provisioning your lab — auto-refreshing every 15 s…
          </div>
          {isAdmin && (
            <div style={{ marginTop: 10 }}>
              {!confirmTerminate
                ? <Button size="xs" variant="danger" onClick={() => setConfirmTerminate(true)}>Terminate</Button>
                : (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Button size="xs" variant="danger" onClick={() => void terminateLab()} disabled={deleteMut.isPending}>
                      {deleteMut.isPending ? 'Terminating…' : 'Yes, terminate'}
                    </Button>
                    <Button size="xs" variant="ghost" onClick={() => setConfirmTerminate(false)}>Cancel</Button>
                  </div>
                )
              }
            </div>
          )}
        </div>
      )}

      {lab.status === 'pending_approval' && (
        <div>
          {isAdmin ? (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button size="xs" variant="ghost" onClick={() => void viewPayment()} disabled={paymentViewMut.isPending}>
                {paymentViewMut.isPending ? 'Loading…' : 'View payment screenshot'}
              </Button>
              <Button size="xs" variant="accent" onClick={() => void approveLab()} disabled={labMut.isPending}>
                {labMut.isPending ? 'Approving…' : 'Approve'}
              </Button>
              <Button size="xs" variant="danger" onClick={() => void rejectLab()} disabled={labMut.isPending}>
                {labMut.isPending ? 'Rejecting…' : 'Reject'}
              </Button>
            </div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>Awaiting admin approval — you'll be notified when it's ready.</div>
          )}
        </div>
      )}

      {mutError && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>{mutError}</div>
      )}
    </div>
  );
}

const SHORT_ID_LEN = 8;

export function LabRow({ lab, isExpanded, onToggle, accountName }: Props) {
  return (
    <>
      <tr
        onClick={() => onToggle(lab.labId)}
        style={{ cursor: 'pointer' }}
        className={isExpanded ? 'tbl-row-active' : ''}
      >
        <td style={{ width: 32, paddingRight: 0 }}>
          <ChevronRight
            size={14}
            style={{
              transform: isExpanded ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.15s',
              color: 'var(--ink-3)',
            }}
          />
        </td>
        <td style={{ fontFamily: 'var(--f-mono)', fontSize: 12 }}>{lab.labId.slice(0, SHORT_ID_LEN)}</td>
        <td>{lab.platform === 'ubuntu' ? 'Linux' : 'Windows'}</td>
        <td style={{ fontFamily: 'var(--f-mono)', fontSize: 12 }}>{lab.instanceType}</td>
        <td>{statusBadge(lab.status)}</td>
        <td style={{ fontSize: 12, color: 'var(--ink-2)' }}>{accountName ?? lab.accountId}</td>
        <td>{formatExpiry(lab.expiresAt)}</td>
        <td style={{ fontSize: 12, color: 'var(--ink-3)' }}>{lab.userEmail}</td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={8} style={{ padding: 0, borderBottom: '1px solid var(--line)' }}>
            <ExpandPanel lab={lab} />
          </td>
        </tr>
      )}
    </>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/app/labs/LabRow.tsx
git commit -m "feat(frontend): add LabRow component with inline expand panel"
```

---

## Task 6: LabList Component

**Files:**
- Create: `src/pages/app/labs/LabList.tsx`

- [ ] **Step 1: Create LabList.tsx**

```typescript
// src/pages/app/labs/LabList.tsx
import { useState } from 'react';
import { EmptyState } from '@/components/ui';
import type { Lab } from '@/types/api';
import { useLabsList } from '@/lib/queries/labs';
import { useAccounts } from '@/lib/queries/accounts';
import { getRole } from '@/lib/auth';
import { LabRow } from './LabRow';

type Bucket = 'active' | 'pending' | 'history';

const BUCKET_STATUSES: Record<Bucket, Lab['status'][]> = {
  active:  ['running', 'provisioning'],
  pending: ['pending_approval'],
  history: ['terminated', 'rejected'],
};

interface Filters {
  platform: string;
  instanceType: string;
  status: string;
  account: string;
}

const EMPTY_FILTERS: Filters = { platform: '', instanceType: '', status: '', account: '' };

function bucketCount(labs: Lab[], bucket: Bucket): number {
  return labs.filter((l) => (BUCKET_STATUSES[bucket] as string[]).includes(l.status)).length;
}

export function LabList() {
  const role = getRole();
  const isAdmin = role === 'admin';
  const { data, isLoading, error } = useLabsList();
  const { data: acctData } = useAccounts();
  const labs = data?.labs ?? [];
  const accountMap = Object.fromEntries(
    (acctData?.accounts ?? []).map((a) => [a.accountId, a.accountName]),
  );

  const [bucket, setBucket] = useState<Bucket>('active');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const bucketLabs = labs.filter((l) => (BUCKET_STATUSES[bucket] as string[]).includes(l.status));

  const visibleLabs = bucketLabs.filter((l) => {
    if (filters.platform && l.platform !== filters.platform) return false;
    if (filters.instanceType && l.instanceType !== filters.instanceType) return false;
    if (filters.status && l.status !== filters.status) return false;
    if (filters.account && l.accountId !== filters.account) return false;
    return true;
  });

  const hasFilters = Object.values(filters).some(Boolean);
  const uniqueTypes    = [...new Set(bucketLabs.map((l) => l.instanceType))];
  const uniqueStatuses = [...new Set(bucketLabs.map((l) => l.status))];
  const uniqueAccounts = [...new Set(bucketLabs.map((l) => l.accountId))];

  const setFilter = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const toggleRow = (labId: string) => {
    setExpandedId((prev) => (prev === labId ? null : labId));
  };

  const switchBucket = (b: Bucket) => {
    setBucket(b);
    setFilters(EMPTY_FILTERS);
    setExpandedId(null);
  };

  const EMPTY_MESSAGES: Record<Bucket, { title: string; description: string }> = {
    active:  { title: 'No active labs', description: 'Provision one using the New Lab button above.' },
    pending: { title: 'No pending labs', description: 'Submitted labs awaiting admin approval will appear here.' },
    history: { title: 'No lab history', description: 'Terminated and rejected labs will appear here.' },
  };

  return (
    <div>
      {/* Bucket tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {(['active', 'pending', 'history'] as Bucket[]).map((b) => {
          const count = bucketCount(labs, b);
          return (
            <button
              key={b}
              type="button"
              onClick={() => switchBucket(b)}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--r)',
                border: '1px solid var(--line)',
                background: bucket === b ? 'var(--accent)' : 'var(--surface)',
                color: bucket === b ? '#fff' : 'var(--ink-2)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                gap: 6,
                alignItems: 'center',
              }}
            >
              {b.charAt(0).toUpperCase() + b.slice(1)}
              {count > 0 && (
                <span style={{
                  background: bucket === b ? 'rgba(255,255,255,0.25)' : 'var(--surface-2)',
                  borderRadius: 99,
                  padding: '1px 7px',
                  fontSize: 11,
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Filter bar */}
      {bucketLabs.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
          <select className="inp" style={{ height: 30, fontSize: 12, width: 130 }} value={filters.platform} onChange={(e) => setFilter('platform', e.target.value)}>
            <option value="">All platforms</option>
            <option value="ubuntu">Linux</option>
            <option value="windows">Windows</option>
          </select>
          <select className="inp" style={{ height: 30, fontSize: 12, width: 140 }} value={filters.instanceType} onChange={(e) => setFilter('instanceType', e.target.value)}>
            <option value="">All types</option>
            {uniqueTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="inp" style={{ height: 30, fontSize: 12, width: 150 }} value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">All statuses</option>
            {uniqueStatuses.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
          </select>
          {isAdmin && (
            <select className="inp" style={{ height: 30, fontSize: 12, width: 160 }} value={filters.account} onChange={(e) => setFilter('account', e.target.value)}>
              <option value="">All accounts</option>
              {uniqueAccounts.map((id) => <option key={id} value={id}>{accountMap[id] ?? id}</option>)}
            </select>
          )}
          {hasFilters && (
            <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} style={{ fontSize: 12, color: 'var(--ink-3)', background: 'none', border: 0, cursor: 'pointer', textDecoration: 'underline' }}>
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* States */}
      {isLoading && <div style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>Loading labs…</div>}
      {error && <div style={{ padding: 'var(--pad)', color: 'var(--danger)', fontSize: 13 }}>Failed to load labs.</div>}

      {!isLoading && !error && bucketLabs.length === 0 && (
        <EmptyState icon="Monitor" title={EMPTY_MESSAGES[bucket].title} description={EMPTY_MESSAGES[bucket].description} />
      )}

      {visibleLabs.length === 0 && bucketLabs.length > 0 && hasFilters && (
        <div style={{ padding: 'var(--pad)', fontSize: 13, color: 'var(--ink-3)' }}>No labs match the current filters.</div>
      )}

      {visibleLabs.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>Lab ID</th>
                <th>Platform</th>
                <th>Instance Type</th>
                <th>Status</th>
                <th>Account</th>
                <th>Expires</th>
                {isAdmin && <th>Submitted By</th>}
              </tr>
            </thead>
            <tbody>
              {visibleLabs.map((lab) => (
                <LabRow
                  key={lab.labId}
                  lab={lab}
                  isExpanded={expandedId === lab.labId}
                  onToggle={toggleRow}
                  accountName={accountMap[lab.accountId]}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/app/labs/LabList.tsx
git commit -m "feat(frontend): add LabList filterable table with bucket tabs"
```

---

## Task 7: LabWizard Component

**Files:**
- Create: `src/pages/app/labs/LabWizard.tsx`

- [ ] **Step 1: Create LabWizard.tsx**

```typescript
// src/pages/app/labs/LabWizard.tsx
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import { useAccounts } from '@/lib/queries/accounts';
import {
  useLabMutation,
  useLabPricing,
  useLabNetworkOptions,
  useLabPaymentUpload,
  type LabPricingParams,
} from '@/lib/queries/labs';
import { useLabTemplates } from '@/lib/queries/labSettings';
import type { LabTemplate } from '@/types/api';

const REGION = 'ap-south-1'; // labs always deploy to the project's primary region

const INSTANCE_GROUPS = [
  {
    label: 'Burstable',
    options: [
      { value: 't3.micro',  label: 't3.micro — 2 vCPU · 1 GB RAM · Burstable' },
      { value: 't3.small',  label: 't3.small — 2 vCPU · 2 GB RAM · Burstable' },
      { value: 't3.medium', label: 't3.medium — 2 vCPU · 4 GB RAM · Burstable' },
      { value: 't3.large',  label: 't3.large — 2 vCPU · 8 GB RAM · Burstable' },
    ],
  },
  {
    label: 'General Purpose',
    options: [
      { value: 'm5.large',  label: 'm5.large — 2 vCPU · 8 GB RAM · General Purpose' },
      { value: 'm5.xlarge', label: 'm5.xlarge — 4 vCPU · 16 GB RAM · General Purpose' },
    ],
  },
  {
    label: 'Compute Optimized',
    options: [
      { value: 'c5.large',  label: 'c5.large — 2 vCPU · 4 GB RAM · Compute Optimized' },
      { value: 'c5.xlarge', label: 'c5.xlarge — 4 vCPU · 8 GB RAM · Compute Optimized' },
    ],
  },
  {
    label: 'Memory Optimized',
    options: [
      { value: 'r5.large',  label: 'r5.large — 2 vCPU · 16 GB RAM · Memory Optimized' },
      { value: 'r5.xlarge', label: 'r5.xlarge — 4 vCPU · 32 GB RAM · Memory Optimized' },
    ],
  },
];

function applyTemplate(tpl: LabTemplate, setters: {
  setPlatform: (v: 'ubuntu' | 'windows') => void;
  setInstanceType: (v: string) => void;
  setStorageGb: (v: number) => void;
  setElasticIp: (v: boolean) => void;
}) {
  setters.setPlatform(tpl.platform);
  setters.setInstanceType(tpl.instanceType);
  setters.setStorageGb(tpl.storageGb);
  setters.setElasticIp(tpl.elasticIp);
}

interface Props {
  onClose: () => void;
  onSubmitted: () => void; // called when Step 4 is shown — tells parent to switch LabList to pending tab
}

export function LabWizard({ onClose, onSubmitted }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 state
  const [platform, setPlatform]       = useState<'ubuntu' | 'windows'>('ubuntu');
  const [instanceType, setInstanceType] = useState('t3.micro');
  const [storageGb, setStorageGb]     = useState(20);
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [months, setMonths]           = useState(1);
  const [accountId, setAccountId]     = useState('');
  const [elasticIp, setElasticIp]     = useState(true);
  const [labName, setLabName]         = useState('');

  // Step 3 state
  const [paymentFile, setPaymentFile]       = useState<File | null>(null);
  const [paymentKey, setPaymentKey]         = useState('');
  const [uploadingPayment, setUploadingPayment] = useState(false);
  const [uploadError, setUploadError]       = useState('');
  const [submitError, setSubmitError]       = useState('');

  const { data: acctData } = useAccounts();
  const accounts = acctData?.accounts ?? [];
  const { data: templatesData } = useLabTemplates();
  const templates = templatesData?.templates ?? [];

  const networkQuery = useLabNetworkOptions(accountId, REGION);
  const networkOpts  = networkQuery.data;

  // Auto-select first subnet + first security group (default VPC items appear first)
  const subnetId = networkOpts?.subnets[0]?.subnetId ?? '';
  const securityGroupIds = networkOpts?.securityGroups
    .filter((sg) => sg.groupName === 'default' || networkOpts.securityGroups.indexOf(sg) === 0)
    .slice(0, 1)
    .map((sg) => sg.groupId) ?? [];

  // Set default accountId once accounts load
  useEffect(() => {
    if (!accountId && accounts.length > 0) {
      setAccountId(accounts[0]?.accountId ?? '');
    }
  }, [accounts, accountId]);

  // Enforce min storage for Windows
  useEffect(() => {
    if (platform === 'windows' && storageGb < 35) setStorageGb(35);
  }, [platform, storageGb]);

  const totalDays = months * 30;
  const durationHours = hoursPerDay * totalDays;

  const pricingParams: LabPricingParams | null = step === 2 ? {
    instanceType,
    region: REGION,
    os: platform,
    storageGb,
    elasticIp,
    hoursPerDay,
    totalDays,
  } : null;

  const pricingQuery = useLabPricing(pricingParams);
  const breakdown    = pricingQuery.data?.breakdown;

  const paymentUploadMut = useLabPaymentUpload();
  const labMut           = useLabMutation();

  const readFileAsBase64 = (file: File): Promise<{ base64: string; mimeType: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const [header, base64] = result.split(',');
        const mimeType = header.replace('data:', '').replace(';base64', '');
        resolve({ base64: base64 ?? '', mimeType });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPaymentFile(file);
    setPaymentKey('');
    setUploadError('');
    setUploadingPayment(true);
    try {
      const { base64, mimeType } = await readFileAsBase64(file);
      const res = await paymentUploadMut.mutateAsync({ fileData: base64, mimeType });
      setPaymentKey(res.paymentKey);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed. Try again.');
    } finally {
      setUploadingPayment(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitError('');
    try {
      await labMut.mutateAsync({
        action: 'submit',
        accountId,
        region: REGION,
        platform,
        instanceType,
        storageGb,
        elasticIp,
        subnetId,
        securityGroupIds,
        durationHours,
        paymentKey,
        ...(labName ? { labName } : {}),
        ...(breakdown ? { estimatedCost: breakdown.finalTotalUsd } : {}),
      });
      setStep(4);
      onSubmitted();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed.');
    }
  };

  const resetAndClose = () => {
    setStep(1);
    setPlatform('ubuntu');
    setInstanceType('t3.micro');
    setStorageGb(20);
    setHoursPerDay(8);
    setMonths(1);
    setElasticIp(true);
    setLabName('');
    setPaymentFile(null);
    setPaymentKey('');
    onClose();
  };

  const CARD_STYLE: React.CSSProperties = {
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: 'var(--r)',
    padding: 24,
    marginBottom: 16,
  };

  const STEP_LABEL_STYLE: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    color: 'var(--ink-3)',
    marginBottom: 4,
  };

  // ── Step 1: Configure ────────────────────────────────────────────────────
  if (step === 1) return (
    <div style={CARD_STYLE}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>New Lab — Step 1 of 4: Configure</div>
        <Button size="xs" variant="ghost" onClick={resetAndClose}>Cancel</Button>
      </div>

      {/* Template gallery */}
      {templates.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={STEP_LABEL_STYLE}>Quick-start templates</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
            {templates.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => applyTemplate(tpl, { setPlatform, setInstanceType, setStorageGb, setElasticIp })}
                style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--line)',
                  borderRadius: 'var(--r)',
                  padding: '10px 12px',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>{tpl.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{tpl.instanceType} · {tpl.ram}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Form */}
      <div className="field" style={{ marginBottom: 14 }}>
        <label className="field-label">Platform</label>
        <div style={{ display: 'flex', gap: 12 }}>
          {(['ubuntu', 'windows'] as const).map((p) => (
            <label key={p} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
              <input type="radio" name="platform" value={p} checked={platform === p} onChange={() => setPlatform(p)} />
              {p === 'ubuntu' ? 'Linux (Ubuntu)' : 'Windows'}
            </label>
          ))}
        </div>
      </div>

      <div className="field" style={{ marginBottom: 14 }}>
        <label className="field-label">Instance type</label>
        <select className="inp" value={instanceType} onChange={(e) => setInstanceType(e.target.value)}>
          {INSTANCE_GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>
          ))}
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
        <div className="field">
          <label className="field-label">Storage (GB)</label>
          <input className="inp" type="number" min={platform === 'windows' ? 35 : 8} max={500} value={storageGb}
            onChange={(e) => setStorageGb(parseInt(e.target.value) || 20)} />
        </div>
        <div className="field">
          <label className="field-label">Hours / day</label>
          <input className="inp" type="number" min={1} max={24} value={hoursPerDay}
            onChange={(e) => setHoursPerDay(parseInt(e.target.value) || 8)} />
        </div>
        <div className="field">
          <label className="field-label">Duration (months)</label>
          <input className="inp" type="number" min={1} max={36} value={months}
            onChange={(e) => setMonths(parseInt(e.target.value) || 1)} />
        </div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 16 }}>
        {hoursPerDay} hrs/day × {months} month{months !== 1 ? 's' : ''} = {durationHours} hours total
      </div>

      <div className="field" style={{ marginBottom: 14 }}>
        <label className="field-label">AWS account</label>
        <select className="inp" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          {accounts.filter((a) => a.enabled && !a.isCentral).map((a) => (
            <option key={a.accountId} value={a.accountId}>{a.accountName} ({a.accountId})</option>
          ))}
        </select>
      </div>

      <div className="field" style={{ marginBottom: 14 }}>
        <label className="field-label">Lab name (optional)</label>
        <input className="inp" value={labName} onChange={(e) => setLabName(e.target.value)} placeholder="My Dev Lab" maxLength={100} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={elasticIp} onChange={(e) => setElasticIp(e.target.checked)} />
          Allocate Elastic IP (fixed public IP; stops IP changing on restart)
        </label>
      </div>

      <div style={{ fontSize: 12, color: 'var(--ink-3)', marginBottom: 16 }}>
        Network: Default VPC / Default Subnet (auto-selected)
        {networkQuery.isLoading && ' — loading…'}
        {networkQuery.error && ' — could not load network options'}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" icon="ChevronRight" iconRight="ChevronRight" onClick={() => setStep(2)} disabled={!accountId || !subnetId}>
          Next: Review pricing →
        </Button>
      </div>
    </div>
  );

  // ── Step 2: Pricing ──────────────────────────────────────────────────────
  if (step === 2) return (
    <div style={CARD_STYLE}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>New Lab — Step 2 of 4: Pricing</div>
        <Button size="xs" variant="ghost" onClick={resetAndClose}>Cancel</Button>
      </div>

      {pricingQuery.isLoading && (
        <div style={{ color: 'var(--ink-3)', fontSize: 13, marginBottom: 16 }}>Loading pricing…</div>
      )}
      {pricingQuery.error && (
        <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 16 }}>
          Could not load pricing — check your connection.{' '}
          <button type="button" onClick={() => void pricingQuery.refetch()} style={{ color: 'var(--accent)', background: 'none', border: 0, cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {breakdown && (
        <table className="tbl" style={{ marginBottom: 16 }}>
          <tbody>
            <tr><td>Compute ({pricingQuery.data?.runningHours?.toFixed(0)} hrs)</td><td style={{ textAlign: 'right', fontFamily: 'var(--f-mono)' }}>${breakdown.ec2Cost.toFixed(2)}</td></tr>
            <tr><td>Storage ({storageGb} GB × {months} mo)</td><td style={{ textAlign: 'right', fontFamily: 'var(--f-mono)' }}>${breakdown.ebsCost.toFixed(2)}</td></tr>
            {breakdown.eipCost > 0 && <tr><td>Elastic IP</td><td style={{ textAlign: 'right', fontFamily: 'var(--f-mono)' }}>${breakdown.eipCost.toFixed(2)}</td></tr>}
            <tr><td>Data transfer</td><td style={{ textAlign: 'right', fontFamily: 'var(--f-mono)' }}>${breakdown.dataTransferCost.toFixed(2)}</td></tr>
            <tr><td style={{ color: 'var(--ink-3)' }}>Subtotal</td><td style={{ textAlign: 'right', fontFamily: 'var(--f-mono)', color: 'var(--ink-3)' }}>${breakdown.subtotalUsd.toFixed(2)}</td></tr>
            {breakdown.whtAmount > 0 && <tr><td>WHT ({breakdown.whtPercent}%)</td><td style={{ textAlign: 'right', fontFamily: 'var(--f-mono)' }}>${breakdown.whtAmount.toFixed(2)}</td></tr>}
            {breakdown.discountAmount > 0 && <tr><td>Discount ({breakdown.discountPercent}%)</td><td style={{ textAlign: 'right', fontFamily: 'var(--f-mono)', color: 'var(--green-2)' }}>−${breakdown.discountAmount.toFixed(2)}</td></tr>}
            {breakdown.vatAmount > 0 && <tr><td>VAT ({breakdown.vatPercent}%)</td><td style={{ textAlign: 'right', fontFamily: 'var(--f-mono)' }}>${breakdown.vatAmount.toFixed(2)}</td></tr>}
            <tr style={{ fontWeight: 700 }}>
              <td>Total</td>
              <td style={{ textAlign: 'right', fontFamily: 'var(--f-mono)', fontSize: 16 }}>
                {breakdown.currencyCode} {(breakdown.finalTotalUsd * breakdown.currencyRate).toFixed(2)}
              </td>
            </tr>
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="ghost" onClick={() => setStep(1)}>← Back</Button>
        <Button variant="primary" onClick={() => setStep(3)} disabled={pricingQuery.isLoading || !!pricingQuery.error}>
          Next: Payment →
        </Button>
      </div>
    </div>
  );

  // ── Step 3: Payment ──────────────────────────────────────────────────────
  if (step === 3) return (
    <div style={CARD_STYLE}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>New Lab — Step 3 of 4: Payment</div>
        <Button size="xs" variant="ghost" onClick={resetAndClose}>Cancel</Button>
      </div>

      {/* Summary */}
      <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 14, marginBottom: 16, fontSize: 13 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '4px 12px' }}>
          <span style={{ color: 'var(--ink-3)' }}>Platform</span> <span>{platform === 'ubuntu' ? 'Linux (Ubuntu)' : 'Windows'}</span>
          <span style={{ color: 'var(--ink-3)' }}>Type</span>     <span>{instanceType}</span>
          <span style={{ color: 'var(--ink-3)' }}>Storage</span>  <span>{storageGb} GB</span>
          <span style={{ color: 'var(--ink-3)' }}>Duration</span> <span>{durationHours} hrs ({months} mo × {hoursPerDay} hrs/day)</span>
          {breakdown && (
            <>
              <span style={{ color: 'var(--ink-3)' }}>Total</span>
              <span style={{ fontWeight: 700 }}>{breakdown.currencyCode} {(breakdown.finalTotalUsd * breakdown.currencyRate).toFixed(2)}</span>
            </>
          )}
        </div>
      </div>

      <div className="field" style={{ marginBottom: 14 }}>
        <label className="field-label">Payment screenshot</label>
        <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => void handleFileChange(e)} style={{ fontSize: 13 }} />
        {uploadingPayment && <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 4 }}>Uploading…</div>}
        {paymentKey && !uploadingPayment && <div style={{ fontSize: 12, color: 'var(--green-2)', marginTop: 4 }}>✓ Payment uploaded</div>}
        {uploadError && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{uploadError}</div>}
      </div>

      {submitError && <div style={{ fontSize: 13, color: 'var(--danger)', marginBottom: 12 }}>{submitError}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button variant="ghost" onClick={() => setStep(2)}>← Back</Button>
        <Button variant="primary" onClick={() => void handleSubmit()} disabled={!paymentKey || uploadingPayment || labMut.isPending}>
          {labMut.isPending ? 'Submitting…' : 'Submit request'}
        </Button>
      </div>
    </div>
  );

  // ── Step 4: Submitted ────────────────────────────────────────────────────
  return (
    <div style={{ ...CARD_STYLE, textAlign: 'center', padding: 40 }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>✓</div>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Request submitted!</div>
      <div style={{ fontSize: 13, color: 'var(--ink-3)', marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
        An admin will review your payment and provision your lab. It'll appear in the list below once approved.
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <Button variant="primary" onClick={resetAndClose}>View my labs</Button>
        <Button variant="ghost" onClick={() => { setStep(1); setPlatform('ubuntu'); setInstanceType('t3.micro'); setStorageGb(20); setHoursPerDay(8); setMonths(1); setElasticIp(true); setLabName(''); setPaymentFile(null); setPaymentKey(''); }}>
          Submit another
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/app/labs/LabWizard.tsx
git commit -m "feat(frontend): add LabWizard 4-step provisioning wizard"
```

---

## Task 8: MyServersScreen

**Files:**
- Modify: `src/pages/app/MyServersScreen.tsx`

Replace the entire stub file with:

- [ ] **Step 1: Replace MyServersScreen.tsx**

```typescript
// src/pages/app/MyServersScreen.tsx
import { useState } from 'react';
import { Button, PageHeader } from '@/components/ui';
import { getRole } from '@/lib/auth';
import { Navigate } from 'react-router-dom';
import { LabWizard } from './labs/LabWizard';
import { LabList } from './labs/LabList';

export default function MyServersScreen() {
  const role = getRole();
  if (role === 'viewer' || role === 'none') return <Navigate to="/app/instances" replace />;

  const [showWizard, setShowWizard] = useState(false);

  const handleSubmitted = () => {
    // LabList auto-switches to pending bucket after a submit.
    // Wizard shows Step 4 confirmation; closing it returns to the list.
    setShowWizard(false);
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Labs"
        title="My Servers"
        sub="Provision and manage your EC2 lab instances."
        actions={
          <Button
            icon={showWizard ? undefined : 'Plus'}
            variant={showWizard ? 'ghost' : 'primary'}
            size="sm"
            onClick={() => setShowWizard((v) => !v)}
          >
            {showWizard ? 'Cancel' : 'New Lab'}
          </Button>
        }
      />

      {showWizard && (
        <LabWizard
          onClose={() => setShowWizard(false)}
          onSubmitted={handleSubmitted}
        />
      )}

      <LabList />
    </div>
  );
}
```

- [ ] **Step 2: Type-check and smoke test**

```bash
cd frontend && npx tsc --noEmit
```

Start dev server, navigate to My Servers. Verify:
- "New Lab" button shows wizard inline
- "Cancel" collapses wizard
- Lab list renders with bucket tabs
- Admin sees Submitted By column, operator does not

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/app/MyServersScreen.tsx
git commit -m "feat(frontend): wire LabWizard and LabList into MyServersScreen"
```

---

## Task 9: LabSettingsScreen

Replace the stub created in Task 4 with the full implementation.

**Files:**
- Modify: `src/pages/app/LabSettingsScreen.tsx`

- [ ] **Step 1: Write LabSettingsScreen.tsx**

```typescript
// src/pages/app/LabSettingsScreen.tsx
import { useState, useEffect } from 'react';
import { Button, Card, PageHeader } from '@/components/ui';
import { getRole } from '@/lib/auth';
import { Navigate } from 'react-router-dom';
import {
  useLabPricingSettings,
  useLabPricingSettingsMutation,
  useLabTemplates,
  useLabTemplatesMutation,
} from '@/lib/queries/labSettings';
import type { LabPricingSettings, LabTemplate } from '@/types/api';

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  color: 'var(--ink-3)',
  marginBottom: 10,
};

// ── Pricing Settings ─────────────────────────────────────────────────────────

function PricingSettingsPanel() {
  const { data, isLoading, error } = useLabPricingSettings();
  const mut = useLabPricingSettingsMutation();
  const [form, setForm] = useState<Partial<LabPricingSettings>>({});
  const [saveMsg, setSaveMsg] = useState('');
  const [saveErr, setSaveErr] = useState('');

  useEffect(() => {
    if (data?.settings) setForm(data.settings);
  }, [data]);

  const setField = (key: keyof LabPricingSettings, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveMsg('');
    setSaveErr('');
  };

  const save = async () => {
    setSaveMsg('');
    setSaveErr('');
    try {
      await mut.mutateAsync(form as Record<string, unknown>);
      setSaveMsg('Settings saved.');
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  if (isLoading) return <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading settings…</p>;
  if (error) return <p style={{ color: 'var(--danger)', fontSize: 13 }}>Failed to load settings.</p>;

  const numField = (label: string, key: keyof LabPricingSettings, step = 0.01, max?: number) => (
    <div className="field" style={{ marginBottom: 14 }}>
      <label className="field-label">{label}</label>
      <input
        className="inp"
        type="number"
        step={step}
        min={0}
        max={max}
        value={(form[key] as number) ?? 0}
        onChange={(e) => setField(key, parseFloat(e.target.value) || 0)}
      />
    </div>
  );

  return (
    <Card>
      <div style={SECTION_LABEL}>Pricing Settings</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 20px' }}>
        {numField('WHT %',              'whtPercent',              0.01, 100)}
        {numField('VAT %',              'vatPercent',              0.01, 100)}
        {numField('Margin %',           'marginPercent',           0.01, 200)}
        {numField('Discount %',         'discountPercent',         0.01, 100)}
        {numField('Currency rate (USD→local)', 'currencyRate',     0.0001)}
        {numField('Data transfer / month (USD)', 'dataTransferMonthlyUsd', 0.01)}
      </div>
      <div className="field" style={{ marginBottom: 14 }}>
        <label className="field-label">Currency code</label>
        <input className="inp" value={(form.currencyCode as string) ?? ''} onChange={(e) => setField('currencyCode', e.target.value)} maxLength={5} style={{ width: 120 }} />
      </div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={Boolean(form.includeBackup)} onChange={(e) => setField('includeBackup', e.target.checked)} />
          Include backup cost estimate
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={Boolean(form.includeMonitoring)} onChange={(e) => setField('includeMonitoring', e.target.checked)} />
          Include detailed monitoring cost
        </label>
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <Button variant="primary" size="sm" onClick={() => void save()} disabled={mut.isPending}>
          {mut.isPending ? 'Saving…' : 'Save settings'}
        </Button>
        {saveMsg && <span style={{ fontSize: 13, color: 'var(--green-2)' }}>{saveMsg}</span>}
        {saveErr && <span style={{ fontSize: 13, color: 'var(--danger)' }}>{saveErr}</span>}
      </div>
    </Card>
  );
}

// ── Template Management ───────────────────────────────────────────────────────

const INSTANCE_GROUPS_FLAT = [
  { value: 't3.micro',  label: 't3.micro (2 vCPU · 1 GB)' },
  { value: 't3.small',  label: 't3.small (2 vCPU · 2 GB)' },
  { value: 't3.medium', label: 't3.medium (2 vCPU · 4 GB)' },
  { value: 't3.large',  label: 't3.large (2 vCPU · 8 GB)' },
  { value: 'm5.large',  label: 'm5.large (2 vCPU · 8 GB)' },
  { value: 'm5.xlarge', label: 'm5.xlarge (4 vCPU · 16 GB)' },
  { value: 'c5.large',  label: 'c5.large (2 vCPU · 4 GB)' },
  { value: 'c5.xlarge', label: 'c5.xlarge (4 vCPU · 8 GB)' },
  { value: 'r5.large',  label: 'r5.large (2 vCPU · 16 GB)' },
  { value: 'r5.xlarge', label: 'r5.xlarge (4 vCPU · 32 GB)' },
];

type EditableTemplate = Omit<LabTemplate, 'vcpu' | 'ram'> & { vcpu: number; ram: string };

function blankTemplate(): EditableTemplate {
  return { id: '', name: '', description: '', instanceType: 't3.micro', vcpu: 2, ram: '1 GB', storageGb: 20, platform: 'ubuntu', elasticIp: true, useCases: [] };
}

function TemplateForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: EditableTemplate;
  onSave: (t: EditableTemplate) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [t, setT] = useState<EditableTemplate>(initial ?? blankTemplate());
  const set = (key: keyof EditableTemplate, value: unknown) => setT((prev) => ({ ...prev, [key]: value }));

  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 16, marginTop: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
        <div className="field">
          <label className="field-label">Template name</label>
          <input className="inp" value={t.name} onChange={(e) => set('name', e.target.value)} placeholder="Dev Sandbox" />
        </div>
        <div className="field">
          <label className="field-label">Platform</label>
          <select className="inp" value={t.platform} onChange={(e) => set('platform', e.target.value as 'ubuntu' | 'windows')}>
            <option value="ubuntu">Linux (Ubuntu)</option>
            <option value="windows">Windows</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label">Instance type</label>
          <select className="inp" value={t.instanceType} onChange={(e) => set('instanceType', e.target.value)}>
            {INSTANCE_GROUPS_FLAT.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field-label">Storage (GB)</label>
          <input className="inp" type="number" min={8} max={500} value={t.storageGb} onChange={(e) => set('storageGb', parseInt(e.target.value) || 20)} />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Description</label>
          <input className="inp" value={t.description} onChange={(e) => set('description', e.target.value)} placeholder="Personal websites and blogs" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button size="xs" variant="primary" onClick={() => onSave(t)} disabled={isPending || !t.name}>
          {isPending ? 'Saving…' : 'Save template'}
        </Button>
        <Button size="xs" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function TemplateManagementPanel() {
  const { data, isLoading, error } = useLabTemplates();
  const mut = useLabTemplatesMutation();
  const [editingId, setEditingId] = useState<string | null>(null); // null = no form; '' = adding new
  const [mutError, setMutError] = useState('');

  const templates: EditableTemplate[] = (data?.templates ?? []).map((t) => ({
    ...t,
    vcpu: t.vcpu,
    ram:  t.ram,
  }));

  const saveAll = async (updated: EditableTemplate[]) => {
    setMutError('');
    try {
      await mut.mutateAsync(updated as unknown as Record<string, unknown>[]);
      setEditingId(null);
    } catch (err) {
      setMutError(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  const addTemplate = (t: EditableTemplate) => {
    const id = t.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    void saveAll([...templates, { ...t, id: id || `template-${Date.now()}` }]);
  };

  const updateTemplate = (updated: EditableTemplate) => {
    void saveAll(templates.map((t) => (t.id === updated.id ? updated : t)));
  };

  const deleteTemplate = (id: string) => {
    void saveAll(templates.filter((t) => t.id !== id));
  };

  if (isLoading) return <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading templates…</p>;
  if (error) return <p style={{ color: 'var(--danger)', fontSize: 13 }}>Failed to load templates.</p>;

  return (
    <div style={{ marginTop: 16 }}>
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={SECTION_LABEL}>Lab Templates</div>
        <Button size="xs" variant="ghost" icon="Plus" onClick={() => setEditingId('')}>Add template</Button>
      </div>

      {editingId === '' && (
        <TemplateForm onSave={addTemplate} onCancel={() => setEditingId(null)} isPending={mut.isPending} />
      )}

      {templates.length === 0 && editingId !== '' && (
        <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>No templates yet. Add one above.</p>
      )}

      {templates.length > 0 && (
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Platform</th>
              <th>Instance Type</th>
              <th>Storage</th>
              <th style={{ width: 140 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((tpl) => (
              <>
                <tr key={tpl.id}>
                  <td className="strong">{tpl.name}</td>
                  <td>{tpl.platform === 'ubuntu' ? 'Linux' : 'Windows'}</td>
                  <td style={{ fontFamily: 'var(--f-mono)', fontSize: 12 }}>{tpl.instanceType}</td>
                  <td>{tpl.storageGb} GB</td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <Button size="xs" variant="ghost" icon="Pencil" onClick={() => setEditingId(tpl.id)}>Edit</Button>
                      <Button size="xs" variant="danger" icon="Trash2" onClick={() => void deleteTemplate(tpl.id)}>Delete</Button>
                    </div>
                  </td>
                </tr>
                {editingId === tpl.id && (
                  <tr key={`edit-${tpl.id}`}>
                    <td colSpan={5} style={{ padding: 0 }}>
                      <TemplateForm initial={tpl} onSave={updateTemplate} onCancel={() => setEditingId(null)} isPending={mut.isPending} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      )}

      {mutError && <div style={{ marginTop: 8, fontSize: 12, color: 'var(--danger)' }}>{mutError}</div>}
    </Card>
    </div>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function LabSettingsScreen() {
  const role = getRole();
  if (role !== 'admin') return <Navigate to="/app/instances" replace />;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Administration"
        title="Lab Settings"
        sub="Configure pricing model and manage quick-start templates for lab provisioning."
      />
      <PricingSettingsPanel />
      <TemplateManagementPanel />
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Smoke test**

Start dev server. Log in as admin:
- Navigate to Lab Settings — verify pricing form loads with current values
- Change a value, click Save — verify "Settings saved." appears
- Navigate to Lab Templates — verify template table renders default templates
- Click "Add template", fill form, save — verify new row appears

Log in as operator — navigate to `/app/lab-settings` — verify redirect to `/app/instances`.
Verify "Lab Settings" does not appear in the operator's sidebar.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/app/LabSettingsScreen.tsx
git commit -m "feat(frontend): add LabSettingsScreen with pricing settings and template management"
```

---

## End-to-End Golden Path Test

After all 9 tasks are committed:

- [ ] Run `cd frontend && npm run build` — must produce no errors

- [ ] **Operator flow:**
  1. Log in as operator → My Servers shows LabList (empty Active bucket)
  2. Click "New Lab" → wizard appears
  3. Step 1: select template, choose account, click Next
  4. Step 2: pricing breakdown renders with local currency total
  5. Step 3: upload payment screenshot → "✓ Payment uploaded" → Submit request
  6. Step 4: confirmation card → "View my labs" → wizard collapses, LabList shows Pending tab with new lab

- [ ] **Admin flow:**
  1. Log in as admin → My Servers shows pending lab from operator
  2. Click lab row → expand panel shows "View payment screenshot", "Approve", "Reject"
  3. Click Approve → lab transitions to provisioning → auto-refresh at 15 s
  4. Lab transitions to running → expand shows SSH command (or RDP)
  5. Lab Settings → pricing form editable → template management works

- [ ] **Commit the final verification note** (update any plan checkbox that was skipped)
