# Phase 6 — API Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the React frontend to the real Lambda backend — replace all `mockData.ts` imports with TanStack Query hooks, set up a local Vite dev proxy, and rebuild the Backups screen from its placeholder.

**Architecture:** `src/lib/api.ts` is a typed fetch wrapper (Authorization header, 401-retry, ApiError). Five `src/lib/queries/*.ts` files expose `useQuery`/`useMutation` hooks per domain. Screens drop their `mockData` imports and call these hooks. Vite proxies `/api/*` to the dev API Gateway in development; build output preserves the `__INJECT__` placeholder for `config_injector`.

**Tech Stack:** React 18, TanStack Query v5, Zustand 5, Vite 5, TypeScript 5.6 strict, lucide-react, react-router-dom v6, amazon-cognito-identity-js

**Note:** Auth UI (all 7 view states) is ALREADY FULLY IMPLEMENTED from Phase 3 — no auth work needed in this plan.

---

## File Map

**Create:**
- `frontend/src/types/api.ts` — typed interfaces for every Lambda response
- `frontend/src/lib/api.ts` — `apiFetch<T>` wrapper
- `frontend/src/lib/queries/ec2.ts` — `useInstances`, `useStartInstance`, `useStopInstance`
- `frontend/src/lib/queries/accounts.ts` — `useAccounts`, `useAccountMutation`
- `frontend/src/lib/queries/users.ts` — `useUsers`, `useUserMutation`
- `frontend/src/lib/queries/audit.ts` — `useAuditLog`, `useDailyBilling`
- `frontend/src/lib/queries/backup.ts` — `useBackupList`, `useBackupMutation`
- `frontend/.env.local.example` — template for local dev credentials

**Modify:**
- `frontend/vite.config.ts` — add dev proxy + dev-time CONFIG injector plugin
- `frontend/src/pages/app/DashboardScreen.tsx` — use `useInstances` + mutations
- `frontend/src/pages/app/InstancesScreen.tsx` — use `useInstances` + mutations
- `frontend/src/pages/app/AnalyticsScreen.tsx` — use `useInstances`
- `frontend/src/pages/app/AuditScreen.tsx` — use `useAuditLog`, filter state, pagination
- `frontend/src/pages/app/BillingScreen.tsx` — use `useDailyBilling`
- `frontend/src/pages/app/AccountsScreen.tsx` — use `useAccounts` + mutations
- `frontend/src/pages/app/UsersScreen.tsx` — use `useUsers` + mutations
- `frontend/src/pages/app/BackupsScreen.tsx` — full rebuild (was EmptyState placeholder)
- `frontend/src/pages/app/MyServersScreen.tsx` — replace with "coming soon" card

---

## Task 1: API Types, Client, Query Hooks, Dev Proxy

**Commit:** `feat(frontend): add API client, query hooks, and dev proxy`

**Files:**
- Create: `frontend/src/types/api.ts`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/queries/ec2.ts`
- Create: `frontend/src/lib/queries/accounts.ts`
- Create: `frontend/src/lib/queries/users.ts`
- Create: `frontend/src/lib/queries/audit.ts`
- Create: `frontend/src/lib/queries/backup.ts`
- Create: `frontend/.env.local.example`
- Modify: `frontend/vite.config.ts`

- [ ] **Step 1.1: Create `frontend/src/types/api.ts`**

```typescript
/** Typed shapes for every Lambda JSON response. Field names match the Python dicts exactly. */

export interface Instance {
  instanceId: string;
  name: string;
  state: string;          // 'running' | 'stopped' | 'pending' | 'stopping' | etc.
  instanceType: string;
  publicIp: string;
  platform: 'Linux' | 'Windows';
  storageGb: number;
  elasticIp: string;
  region: string;
  accountId: string;
  accountName: string;
}

export interface InstancesResponse {
  instances: Instance[];
  pendingApproval?: boolean;
  noAccountsAssigned?: boolean;
}

export interface ActionResponse {
  message: string;
  state?: string;
  requestedBy?: string;
}

export interface Account {
  accountId: string;
  accountName: string;
  roleArn: string;
  consoleRoleArn: string;
  enabled: boolean;
  isCentral: boolean;
}

export interface AccountsResponse {
  accounts: Account[];
}

export interface AccountActionResponse {
  message: string;
  latencyMs?: number;
}

export interface AuditEntry {
  instanceId: string;
  instanceName: string;
  instanceType: string;
  action: string;
  userEmail: string;
  accountId: string;
  region: string;
  timestamp: string;
  date: string;
  details: string;
}

export interface AuditResponse {
  items: AuditEntry[];
  lastKey?: Record<string, unknown>;
}

export interface DailyEntry {
  date: string;
  instanceId: string;
  instanceName: string;
  instanceType: string;
  region: string;
  accountId: string;
  runningHours: number;
  estimatedCostUsd: number;
}

export interface DailyBillingResponse {
  days: DailyEntry[];
  instanceId?: string;
}

export interface UserAccount {
  accountId: string;
  accessLevel: string;
  grantedBy?: string;
}

export interface UserRecord {
  email: string;
  status: string;
  groups: string[];
  accounts: UserAccount[];
}

export interface UsersResponse {
  users: UserRecord[];
}

export interface UserMutationResponse {
  message: string;
}

export interface RecoveryPoint {
  arn: string;
  creationDate: string;
  status: string;
  backupSizeBytes: number;
  instanceId: string;
  accountId: string;
}

export interface BackupPlan {
  planId: string;
  planName: string;
  scheduleExpression: string;
  startWindowMinutes?: number;
}

export interface BackupListResponse {
  recoveryPoints: RecoveryPoint[];
  backupPlans: BackupPlan[];
}

export interface BackupMutationResponse {
  message: string;
  recoveryPointArn?: string;
  planId?: string;
  loginUrl?: string;
}
```

- [ ] **Step 1.2: Create `frontend/src/lib/api.ts`**

```typescript
import { getConfig } from '@/lib/config';
import * as Auth from '@/lib/auth';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function doFetch<T>(url: string, init: RequestInit): Promise<T> {
  const token = Auth.getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init.headers as Record<string, string> | undefined),
  };
  const res = await fetch(url, { ...init, headers });
  if (res.ok) return res.json() as Promise<T>;
  let msg = res.statusText;
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) msg = body.message;
  } catch {
    /* ignore parse error */
  }
  throw new ApiError(res.status, msg);
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = getConfig().API_URL ?? '';
  const url = `${baseUrl}${path}`;

  try {
    return await doFetch<T>(url, init);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      const refreshed = await Auth.refreshTokens();
      if (!refreshed) {
        Auth.logout();
        window.location.replace('/login');
        throw err;
      }
      // retry once with fresh token
      return doFetch<T>(url, init);
    }
    throw err;
  }
}
```

- [ ] **Step 1.3: Create `frontend/src/lib/queries/ec2.ts`**

```typescript
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
```

- [ ] **Step 1.4: Create `frontend/src/lib/queries/accounts.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { AccountsResponse, AccountActionResponse } from '@/types/api';

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
```

- [ ] **Step 1.5: Create `frontend/src/lib/queries/users.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { UsersResponse, UserMutationResponse } from '@/types/api';

export const USERS_KEY = ['users'] as const;

export function useUsers() {
  return useQuery({
    queryKey: USERS_KEY,
    queryFn: () => apiFetch<UsersResponse>('/users'),
    staleTime: 60_000,
  });
}

export function useUserMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<UserMutationResponse>('/users', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: USERS_KEY });
    },
  });
}
```

- [ ] **Step 1.6: Create `frontend/src/lib/queries/audit.ts`**

```typescript
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
```

- [ ] **Step 1.7: Create `frontend/src/lib/queries/backup.ts`**

```typescript
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
```

- [ ] **Step 1.8: Create `frontend/.env.local.example`**

```
# Copy this file to .env.local and fill in your dev values.
# .env.local is gitignored — never commit it.
#
# How to use:
#   cp .env.local.example .env.local
#   Fill in your Cognito pool + client IDs from the dev CloudFormation stack.
#   Then run: npm run dev
#
# Dev API Gateway (ocu_dev account):
VITE_API_URL=/api
VITE_USER_POOL_ID=ap-south-1_p43GSdwV0
VITE_CLIENT_ID=4nhrk7k1q76k1hkllkfj79123h
VITE_COGNITO_DOMAIN=solobil-ec2-ctrl-dev
VITE_CENTRAL_ACCOUNT_ID=172030246614
VITE_ENVIRONMENT=development
VITE_MEMBER_ROLE_TEMPLATE_URL=
```

- [ ] **Step 1.9: Update `frontend/vite.config.ts` — add dev proxy + CONFIG injector plugin**

Replace the entire file with:

```typescript
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/**
 * In dev mode only: reads VITE_* env vars and injects a CONFIG object into
 * index.html at the same placeholder that lambda/config_injector replaces at
 * deploy time. The build output keeps the raw placeholder so the Lambda still
 * replaces it on every deploy.
 */
function devConfigInjector(): Plugin {
  return {
    name: 'dev-config-injector',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        if (!ctx.server) return html; // build — keep placeholder for config_injector
        const port = (ctx.server.config.server.port as number | undefined) ?? 5173;
        const cfg = {
          COGNITO_DOMAIN: process.env['VITE_COGNITO_DOMAIN'] ?? '',
          CLIENT_ID: process.env['VITE_CLIENT_ID'] ?? '',
          REDIRECT_URI: `http://localhost:${port}`,
          API_URL: process.env['VITE_API_URL'] ?? '',
          USER_POOL_ID: process.env['VITE_USER_POOL_ID'] ?? '',
          CENTRAL_ACCOUNT_ID: process.env['VITE_CENTRAL_ACCOUNT_ID'] ?? '',
          ENVIRONMENT: process.env['VITE_ENVIRONMENT'] ?? 'development',
          MEMBER_ROLE_TEMPLATE_URL: process.env['VITE_MEMBER_ROLE_TEMPLATE_URL'] ?? '',
        };
        const script =
          `const CONFIG = ${JSON.stringify(cfg, null, 2)};\n` +
          `      window.__APP_CONFIG__ = CONFIG;`;
        return html.replace(
          'const CONFIG = { /*__INJECT__*/ };\n      window.__APP_CONFIG__ = CONFIG;',
          script,
        );
      },
    },
  };
}

export default defineConfig({
  plugins: [devConfigInjector(), react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2022',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: 'https://u0bcgfkwec.execute-api.ap-south-1.amazonaws.com/prod',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
    },
  },
});
```

- [ ] **Step 1.10: Verify typecheck**

Run from `frontend/`:
```bash
npm run typecheck
```
Expected: zero errors.

- [ ] **Step 1.11: Verify build preserves placeholder**

```bash
npm run build && grep -c '__INJECT__' dist/index.html
```
Expected output: `1`

- [ ] **Step 1.12: Commit**

```bash
git add frontend/src/types/api.ts \
        frontend/src/lib/api.ts \
        frontend/src/lib/queries/ec2.ts \
        frontend/src/lib/queries/accounts.ts \
        frontend/src/lib/queries/users.ts \
        frontend/src/lib/queries/audit.ts \
        frontend/src/lib/queries/backup.ts \
        frontend/.env.local.example \
        frontend/vite.config.ts
git commit -m "feat(frontend): add API client, query hooks, and dev proxy"
```

---

## Task 2: Wire Dashboard, Instances, Analytics

**Commit:** `feat(frontend): wire instances, dashboard, and analytics to real API`

**Files:**
- Modify: `frontend/src/pages/app/DashboardScreen.tsx`
- Modify: `frontend/src/pages/app/InstancesScreen.tsx`
- Modify: `frontend/src/pages/app/AnalyticsScreen.tsx`

**Prerequisite:** Create `.env.local` from `.env.local.example` and run `npm run dev` to verify proxy works before writing these screens.

- [ ] **Step 2.1: Rewrite `frontend/src/pages/app/DashboardScreen.tsx`**

```typescript
import { useNavigate } from 'react-router-dom';
import { Button, Card, Icon, PageHeader, Stat, StatusBadge } from '@/components/ui';
import { useInstances, useStartInstance, useStopInstance } from '@/lib/queries/ec2';
import { getRole } from '@/lib/auth';

interface QuickAction {
  id: string; icon: string;
  tone: 'blue' | 'teal' | 'amber' | 'forest' | 'violet' | 'rose';
  ti: string; sub: string;
}
const QUICK_ACTIONS: QuickAction[] = [
  { id: 'instances', icon: 'Server',          tone: 'blue',   ti: 'Instances',  sub: 'Start, stop & inspect' },
  { id: 'servers',   icon: 'Monitor',         tone: 'teal',   ti: 'My Servers', sub: 'Provision lab servers' },
  { id: 'billing',   icon: 'Receipt',         tone: 'amber',  ti: 'Billing',    sub: 'Cost & usage estimates' },
  { id: 'backups',   icon: 'HardDriveUpload', tone: 'forest', ti: 'Backups',    sub: 'Snapshots & restores' },
  { id: 'audit',     icon: 'ScrollText',      tone: 'violet', ti: 'Audit Log',  sub: 'Full action history' },
  { id: 'analytics', icon: 'Activity',        tone: 'rose',   ti: 'Analytics',  sub: 'Usage & fleet health' },
];

export default function DashboardScreen() {
  const navigate = useNavigate();
  const { data, isLoading, refetch } = useInstances();
  const startMut = useStartInstance();
  const stopMut  = useStopInstance();
  const canControl = getRole() !== 'viewer';

  const inst     = data?.instances ?? [];
  const running  = inst.filter((i) => i.state === 'running').length;
  const stopped  = inst.filter((i) => i.state === 'stopped').length;
  const runPct   = inst.length === 0 ? 0 : Math.round((running / inst.length) * 100);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Fleet overview"
        title="Dashboard"
        sub="Real-time fleet overview across every linked AWS account. Updated continuously."
        actions={
          <Button icon="RotateCw" variant="ghost" size="sm" onClick={() => void refetch()}>
            Refresh
          </Button>
        }
      />

      <div className="stats">
        <Stat label="Total instances" icon="Server" value={isLoading ? '—' : inst.length} meta="across all accounts" />
        <Stat label="Running now"     icon="Play"   value={isLoading ? '—' : running} meta={`${runPct}% of fleet active`} />
        <Stat label="Stopped"         icon="Square" value={isLoading ? '—' : stopped} meta="idle · no cost accruing" />
        <Stat label="Accounts linked" icon="Building2" value={isLoading ? '—' : new Set(inst.map((i) => i.accountId)).size} meta="active AWS accounts" />
      </div>

      <div className="grid-2">
        <Card
          title="Fleet · Quick Control"
          subtitle={isLoading ? 'Loading…' : `${inst.length} instances · ${running} running`}
          pad={false}
          action={
            <Button variant="ghost" size="sm" iconRight="ArrowUpRight" onClick={() => navigate('/app/instances')}>
              View all
            </Button>
          }
        >
          {isLoading && (
            <div style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>Loading instances…</div>
          )}
          {!isLoading && inst.length === 0 && (
            <div style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>No instances found.</div>
          )}
          {inst.map((i) => (
            <div className="fleet-row" key={i.instanceId}>
              <div>
                <div className="fleet-name">{i.name}</div>
                <div className="fleet-meta">{i.accountName} · {i.region} · {i.instanceType}</div>
              </div>
              <StatusBadge state={i.state} />
              {canControl && (
                <div className="fleet-actions">
                  <Button
                    variant="ok" size="xs" icon="Play"
                    disabled={i.state === 'running' || startMut.isPending}
                    onClick={() => startMut.mutate({ instanceId: i.instanceId, instanceName: i.name, instanceType: i.instanceType, accountId: i.accountId, region: i.region })}
                  >
                    Start
                  </Button>
                  <Button
                    variant="danger" size="xs" icon="Square"
                    disabled={i.state === 'stopped' || stopMut.isPending}
                    onClick={() => stopMut.mutate({ instanceId: i.instanceId, instanceName: i.name, instanceType: i.instanceType, accountId: i.accountId, region: i.region })}
                  >
                    Stop
                  </Button>
                </div>
              )}
              <Button variant="ghost" size="xs" icon="ChevronRight" aria-label="Open instance" onClick={() => navigate('/app/instances')} />
            </div>
          ))}
        </Card>

        <Card title="Quick actions" subtitle="Jump to the most-used workflows" pad={false}>
          <div className="qa-grid">
            {QUICK_ACTIONS.map((qa) => (
              <button key={qa.id} className="qa" data-tone={qa.tone} onClick={() => navigate(`/app/${qa.id}`)} type="button">
                <span className="qa-glow" />
                <div className="qa-ico"><Icon name={qa.icon} size={20} /></div>
                <div className="qa-ti">{qa.ti}</div>
                <div className="qa-sub">{qa.sub}</div>
                <span className="qa-arrow"><Icon name="ArrowUpRight" size={14} /></span>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 2.2: Rewrite `frontend/src/pages/app/InstancesScreen.tsx`**

```typescript
import { Button, Card, PageHeader, StatusBadge } from '@/components/ui';
import { useInstances, useStartInstance, useStopInstance } from '@/lib/queries/ec2';
import { getRole } from '@/lib/auth';
import type { Instance } from '@/types/api';

export default function InstancesScreen() {
  const { data, isLoading, error, refetch } = useInstances();
  const startMut = useStartInstance();
  const stopMut  = useStopInstance();
  const canControl = getRole() !== 'viewer';

  const inst = data?.instances ?? [];
  const grouped = inst.reduce<Record<string, Instance[]>>((acc, i) => {
    const key = i.accountName;
    const list = acc[key] ?? [];
    list.push(i);
    acc[key] = list;
    return acc;
  }, {});

  return (
    <div className="page">
      <PageHeader
        eyebrow="Fleet"
        title="Instances"
        sub="Servers grouped by account — start, stop, and inspect from here."
        actions={<Button icon="RotateCw" variant="ghost" size="sm" onClick={() => void refetch()}>Refresh all</Button>}
      />

      {isLoading && (
        <div style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>Loading instances…</div>
      )}

      {error && (
        <div style={{ padding: 'var(--pad)', color: 'var(--danger)', fontSize: 13 }}>
          Failed to load instances. Check your connection and try refreshing.
        </div>
      )}

      {!isLoading && !error && inst.length === 0 && (
        <div style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>
          {data?.pendingApproval
            ? 'Your account is pending admin approval. Contact your administrator.'
            : data?.noAccountsAssigned
            ? 'No AWS accounts are assigned to your profile yet. Ask an admin to grant access.'
            : 'No instances found across your linked accounts.'}
        </div>
      )}

      {Object.entries(grouped).map(([acctName, rows]) => {
        const accountId = rows[0]?.accountId ?? '';
        return (
          <Card
            key={acctName}
            title={acctName}
            subtitle={accountId}
            pad={false}
            className="mb-gap"
          >
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Instance ID</th>
                  <th>Type</th>
                  <th>State</th>
                  <th>Region</th>
                  <th>Public IP</th>
                  {canControl && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.instanceId}>
                    <td className="strong">{i.name}</td>
                    <td className="mono">{i.instanceId}</td>
                    <td className="mono">{i.instanceType}</td>
                    <td><StatusBadge state={i.state} /></td>
                    <td className="mono">{i.region}</td>
                    <td className="mono">{i.publicIp || i.elasticIp || '—'}</td>
                    {canControl && (
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Button
                            variant="ok" size="xs" icon="Play"
                            disabled={i.state === 'running' || startMut.isPending}
                            onClick={() => startMut.mutate({ instanceId: i.instanceId, instanceName: i.name, instanceType: i.instanceType, accountId: i.accountId, region: i.region })}
                          >
                            Start
                          </Button>
                          <Button
                            variant="danger" size="xs" icon="Square"
                            disabled={i.state === 'stopped' || stopMut.isPending}
                            onClick={() => stopMut.mutate({ instanceId: i.instanceId, instanceName: i.name, instanceType: i.instanceType, accountId: i.accountId, region: i.region })}
                          >
                            Stop
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2.3: Rewrite `frontend/src/pages/app/AnalyticsScreen.tsx`**

```typescript
import { Button, Card, Donut, PageHeader, Stat } from '@/components/ui';
import { useInstances } from '@/lib/queries/ec2';

export default function AnalyticsScreen() {
  const { data, isLoading, refetch } = useInstances();
  const inst = data?.instances ?? [];

  const running  = inst.filter((i) => i.state === 'running').length;
  const stopped  = inst.filter((i) => i.state === 'stopped').length;
  const types    = Array.from(new Set(inst.map((i) => i.instanceType)));
  const accounts = Array.from(
    inst.reduce<Map<string, { name: string; count: number }>>(
      (m, i) => {
        const e = m.get(i.accountId) ?? { name: i.accountName, count: 0 };
        e.count++;
        m.set(i.accountId, e);
        return m;
      },
      new Map(),
    ).values(),
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="Intelligence"
        title="Analytics"
        sub="Usage patterns, fleet health, and activity intelligence."
        actions={<Button icon="RotateCw" variant="ghost" size="sm" onClick={() => void refetch()}>Refresh</Button>}
      />

      <div className="stats">
        <Stat label="Total instances"   icon="Server"     value={isLoading ? '—' : inst.length} meta="across all accounts" />
        <Stat label="Running"           icon="Play"        value={isLoading ? '—' : running}     meta="active right now" />
        <Stat label="Stopped"           icon="Square"      value={isLoading ? '—' : stopped}     meta="idle" />
        <Stat label="Accounts"          icon="Building2"   value={isLoading ? '—' : accounts.length} meta="linked AWS accounts" />
      </div>

      <div className="grid-2" style={{ marginBottom: 'var(--gap)' }}>
        <Card title="Fleet health" subtitle={`${running} / ${inst.length} running`} pad={false}>
          <div className="chart-row">
            <Donut running={running} total={inst.length} />
            <div className="legend" style={{ flex: 1 }}>
              <div className="legend-row">
                <div className="legend-l"><span className="legend-swatch" style={{ background: 'var(--accent)' }} /> Running</div>
                <div className="legend-n">{running}</div>
              </div>
              <div className="legend-row">
                <div className="legend-l"><span className="legend-swatch" style={{ background: 'var(--line-2)' }} /> Stopped</div>
                <div className="legend-n">{stopped}</div>
              </div>
              <div className="legend-row">
                <div className="legend-l"><span className="legend-swatch" style={{ background: 'var(--ink-5)' }} /> Other</div>
                <div className="legend-n">{inst.length - running - stopped}</div>
              </div>
            </div>
          </div>
        </Card>

        <Card title="Instances by account" subtitle="Current fleet distribution" pad={false}>
          <div style={{ padding: 'var(--pad)' }}>
            {accounts.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>No data yet.</div>
            )}
            {accounts.map((a) => {
              const pct = inst.length === 0 ? 0 : Math.round((a.count / inst.length) * 100);
              return (
                <div key={a.name} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{a.name}</span>
                    <span style={{ fontFamily: 'var(--f-mono)', fontSize: 13, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>
                      {a.count} instance{a.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ height: 6, background: 'var(--surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 3 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <Card title="Instance type breakdown" subtitle={`${types.length} types observed`} pad={false}>
        <div style={{ padding: 'var(--pad)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {types.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--ink-3)' }}>No instances to analyze yet.</div>
          )}
          {types.map((t) => {
            const count = inst.filter((i) => i.instanceType === t).length;
            return (
              <div key={t} style={{ padding: '14px 18px', border: '1px solid var(--line)', borderRadius: 'var(--r)', background: 'var(--bg)' }}>
                <div style={{ fontFamily: 'var(--f-mono)', fontSize: 12.5, color: 'var(--ink)' }}>{t}</div>
                <div style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-3)', marginTop: 4 }}>
                  {count} {count === 1 ? 'instance' : 'instances'}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2.4: Typecheck**

```bash
cd frontend && npm run typecheck
```
Expected: zero errors.

- [ ] **Step 2.5: Smoke test locally**

```bash
npm run dev
```
Open `http://localhost:5173/app/dashboard` — instances should load from the real dev API (visible in browser Network tab hitting `/api/ec2`). Verify Start/Stop buttons appear and disable correctly based on state.

- [ ] **Step 2.6: Commit**

```bash
git add frontend/src/pages/app/DashboardScreen.tsx \
        frontend/src/pages/app/InstancesScreen.tsx \
        frontend/src/pages/app/AnalyticsScreen.tsx
git commit -m "feat(frontend): wire instances, dashboard, and analytics to real API"
```

---

## Task 3: Wire Audit + Billing

**Commit:** `feat(frontend): wire audit and billing to real API`

**Files:**
- Modify: `frontend/src/pages/app/AuditScreen.tsx`
- Modify: `frontend/src/pages/app/BillingScreen.tsx`

- [ ] **Step 3.1: Rewrite `frontend/src/pages/app/AuditScreen.tsx`**

```typescript
import { useState } from 'react';
import { Button, Card, Icon, PageHeader } from '@/components/ui';
import { useAuditLog } from '@/lib/queries/audit';
import { useAccounts } from '@/lib/queries/accounts';
import { getRole } from '@/lib/auth';
import type { AuditFilters } from '@/lib/queries/audit';

const ACTIONS = ['start', 'stop', 'auto-stop', 'terminate', 'account-linked'];

export default function AuditScreen() {
  const isAdmin = getRole() === 'admin';

  const [filters, setFilters] = useState<AuditFilters>({ limit: 50 });
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [search, setSearch]         = useState('');
  const [userEmail, setUserEmail]   = useState('');
  const [action, setAction]         = useState('');
  const [accountId, setAccountId]   = useState('');

  const { data, isLoading, error } = useAuditLog(filters);
  const { data: acctData }         = useAccounts();
  const accounts = acctData?.accounts ?? [];

  const applyFilters = () => {
    setCursorStack([]);
    setFilters({ limit: 50, instanceId: search || undefined, userEmail: isAdmin ? userEmail || undefined : undefined, action: action || undefined, accountId: accountId || undefined });
  };

  const clearFilters = () => {
    setSearch('');
    setUserEmail('');
    setAction('');
    setAccountId('');
    setCursorStack([]);
    setFilters({ limit: 50 });
  };

  const loadNext = () => {
    if (!data?.lastKey) return;
    const nextKey = JSON.stringify(data.lastKey);
    setCursorStack((s) => [...s, nextKey]);
    setFilters((f) => ({ ...f, lastKey: nextKey }));
  };

  const loadPrev = () => {
    const stack = [...cursorStack];
    stack.pop();
    const prevKey = stack[stack.length - 1];
    setCursorStack(stack);
    setFilters((f) => ({ ...f, lastKey: prevKey }));
  };

  const items = data?.items ?? [];

  return (
    <div className="page">
      <PageHeader
        eyebrow="History"
        title="Audit Log"
        sub="Complete history — every action, every user, every server."
        actions={<Button icon="RotateCw" variant="ghost" size="sm" onClick={applyFilters}>Refresh</Button>}
      />

      <Card pad={false}>
        <div className="filter-bar">
          <div className="field">
            <label className="field-label">Instance</label>
            <div className="inp-group">
              <span className="inp-ico"><Icon name="Search" size={14} /></span>
              <input className="inp" placeholder="Instance ID or name…" value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyFilters()} />
            </div>
          </div>
          {isAdmin && (
            <div className="field">
              <label className="field-label">User</label>
              <input className="inp" placeholder="User email" value={userEmail} onChange={(e) => setUserEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && applyFilters()} />
            </div>
          )}
          <div className="field">
            <label className="field-label">Action</label>
            <select className="inp" value={action} onChange={(e) => { setAction(e.target.value); }}>
              <option value="">All actions</option>
              {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="field">
            <label className="field-label">Account</label>
            <select className="inp" value={accountId} onChange={(e) => { setAccountId(e.target.value); }}>
              <option value="">All accounts</option>
              {accounts.map((a) => <option key={a.accountId} value={a.accountId}>{a.accountName}</option>)}
            </select>
          </div>
          <div className="field" style={{ gap: 6, justifyContent: 'flex-end' }}>
            <Button variant="accent" size="sm" icon="Search" onClick={applyFilters}>Filter</Button>
            <Button variant="ghost" size="sm" icon="X" onClick={clearFilters}>Clear</Button>
          </div>
        </div>

        {error && (
          <div style={{ padding: 'var(--pad)', color: 'var(--danger)', fontSize: 13 }}>Failed to load audit log.</div>
        )}

        <table className="tbl">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Action</th>
              <th>Instance</th>
              <th>Type</th>
              <th>Account</th>
              <th>Region</th>
              <th>User</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>Loading…</td></tr>
            )}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>No audit entries found.</td></tr>
            )}
            {items.map((r, idx) => (
              <tr key={`${r.instanceId}-${idx}`}>
                <td className="mono">{r.timestamp}</td>
                <td><span className={`action-chip ${r.action}`}>{r.action}</span></td>
                <td>
                  <div className="strong" style={{ color: 'var(--ink)' }}>{r.instanceName}</div>
                  <div className="mono" style={{ color: 'var(--ink-4)' }}>{r.instanceId}</div>
                </td>
                <td className="mono">{r.instanceType}</td>
                <td className="mono">{r.accountId}</td>
                <td className="mono">{r.region}</td>
                <td style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{r.userEmail}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ padding: '16px var(--pad)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--line)', fontSize: 12, color: 'var(--ink-3)' }}>
          <span>{items.length} entries loaded</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="ghost" size="xs" icon="ChevronLeft" disabled={cursorStack.length === 0} onClick={loadPrev}>Prev</Button>
            <Button variant="ghost" size="xs" iconRight="ChevronRight" disabled={!data?.lastKey} onClick={loadNext}>Next</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3.2: Rewrite `frontend/src/pages/app/BillingScreen.tsx`**

```typescript
import { Button, Card, PageHeader, Stat } from '@/components/ui';
import { useDailyBilling } from '@/lib/queries/audit';

export default function BillingScreen() {
  const { data, isLoading, refetch } = useDailyBilling(30);
  const days = data?.days ?? [];

  // Aggregate totals from daily entries
  const totalCost   = days.reduce((s, d) => s + d.estimatedCostUsd, 0);
  const totalHours  = days.reduce((s, d) => s + d.runningHours, 0);
  const hourlyRate  = totalHours > 0 ? totalCost / totalHours : 0;

  // Unique instances that had any run time
  const activeInst  = new Set(days.filter((d) => d.runningHours > 0).map((d) => d.instanceId)).size;

  // Group by instanceId for per-instance cost table
  const byInstance = days.reduce<Record<string, { name: string; type: string; region: string; accountId: string; hours: number; cost: number }>>((acc, d) => {
    const e = acc[d.instanceId] ?? { name: d.instanceName, type: d.instanceType, region: d.region, accountId: d.accountId, hours: 0, cost: 0 };
    e.hours += d.runningHours;
    e.cost  += d.estimatedCostUsd;
    acc[d.instanceId] = e;
    return acc;
  }, {});
  const rows = Object.entries(byInstance).sort((a, b) => b[1].cost - a[1].cost);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Intelligence"
        title="Billing & Cost"
        sub="Transparent, per-account cost accounting with monthly projections."
        actions={<Button icon="RotateCw" variant="ghost" size="sm" onClick={() => void refetch()}>Refresh</Button>}
      />

      <div className="stats">
        <Stat label="Last 30 days"    icon="DollarSign"   value={isLoading ? '—' : `$${totalCost.toFixed(2)}`}   unit="USD"  meta="estimated cost" />
        <Stat label="Avg hourly rate"  icon="Activity"     value={isLoading ? '—' : `$${hourlyRate.toFixed(4)}`}  unit="/hr"  meta="across running instances" />
        <Stat label="Active instances" icon="Server"       value={isLoading ? '—' : activeInst}                              meta="had run time in period" />
        <Stat label="Total run hours"  icon="Clock"        value={isLoading ? '—' : Math.round(totalHours)}       unit="hrs"  meta="combined fleet hours" />
      </div>

      <Card title="Cost by instance" subtitle="Last 30 days · estimated from run hours" pad={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Instance</th>
              <th>Account</th>
              <th>Type</th>
              <th className="num">Run hours</th>
              <th className="num">Avg rate</th>
              <th className="num">Est. cost</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>Loading…</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>No cost data for the last 30 days.</td></tr>
            )}
            {rows.map(([id, r]) => (
              <tr key={id}>
                <td className="strong">{r.name}</td>
                <td style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{r.accountId}</td>
                <td className="mono">{r.type}</td>
                <td className="num mono">{r.hours.toFixed(1)}</td>
                <td className="num mono">${r.hours > 0 ? (r.cost / r.hours).toFixed(4) : '0.0000'}</td>
                <td className="num strong">${r.cost.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3.3: Typecheck**

```bash
npm run typecheck
```
Expected: zero errors.

- [ ] **Step 3.4: Smoke test — Audit**

Run `npm run dev`. Open `http://localhost:5173/app/audit`. Verify real audit entries appear. Change the Action dropdown and click Filter — network tab should show a new `/api/audit?action=...` request. Click Next if there are enough entries.

- [ ] **Step 3.5: Smoke test — Billing**

Open `http://localhost:5173/app/billing`. Verify real 30-day cost data appears (or a "No cost data" message if the dev account has no history).

- [ ] **Step 3.6: Commit**

```bash
git add frontend/src/pages/app/AuditScreen.tsx \
        frontend/src/pages/app/BillingScreen.tsx
git commit -m "feat(frontend): wire audit and billing to real API"
```

---

## Task 4: Wire Accounts + Users

**Commit:** `feat(frontend): wire accounts and users to real API`

**Files:**
- Modify: `frontend/src/pages/app/AccountsScreen.tsx`
- Modify: `frontend/src/pages/app/UsersScreen.tsx`

- [ ] **Step 4.1: Rewrite `frontend/src/pages/app/AccountsScreen.tsx`**

```typescript
import { useState } from 'react';
import { Badge, Button, Icon, PageHeader } from '@/components/ui';
import { useAccounts, useAccountMutation } from '@/lib/queries/accounts';
import type { Account } from '@/types/api';

function AddAccountModal({ onClose }: { onClose: () => void }) {
  const mut = useAccountMutation();
  const [accountId, setAccountId]     = useState('');
  const [accountName, setAccountName] = useState('');
  const [roleArn, setRoleArn]         = useState('');
  const [consoleArn, setConsoleArn]   = useState('');
  const [error, setError]             = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await mut.mutateAsync({ action: 'add', accountId, accountName, roleArn, consoleRoleArn: consoleArn });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add account.');
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 28, width: 480, maxWidth: '92vw' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Add AWS Account</div>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 0, cursor: 'pointer', color: 'var(--ink-3)' }}>
            <Icon name="X" size={16} />
          </button>
        </div>
        <form onSubmit={(e) => { void submit(e); }}>
          {[
            { id: 'acct-id',    label: 'Account ID',           val: accountId,    set: setAccountId,    ph: '123456789012' },
            { id: 'acct-name',  label: 'Account name',         val: accountName,  set: setAccountName,  ph: 'My Team Account' },
            { id: 'role-arn',   label: 'Cross-account role ARN', val: roleArn,    set: setRoleArn,      ph: 'arn:aws:iam::123456789012:role/EC2Control…' },
            { id: 'cons-arn',   label: 'Console role ARN',     val: consoleArn,   set: setConsoleArn,   ph: 'arn:aws:iam::123456789012:role/EC2Control…' },
          ].map(({ id, label, val, set, ph }) => (
            <div key={id} className="field" style={{ marginBottom: 14 }}>
              <label className="field-label" htmlFor={id}>{label}</label>
              <input id={id} className="inp" value={val} onChange={(e) => set(e.target.value)} placeholder={ph} required />
            </div>
          ))}
          {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
            <Button variant="ghost" size="sm" type="button" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" type="submit" icon="Plus" disabled={mut.isPending}>
              {mut.isPending ? 'Adding…' : 'Add account'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function AccountCard({ a }: { a: Account }) {
  const mut = useAccountMutation();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [testResult, setTestResult]       = useState<string>('');

  const doTest = async () => {
    setTestResult('Testing…');
    try {
      const res = await mut.mutateAsync({ action: 'test', accountId: a.accountId });
      setTestResult(res.latencyMs != null ? `OK · ${res.latencyMs}ms` : 'OK');
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : 'Failed');
    }
    setTimeout(() => setTestResult(''), 4000);
  };

  const doToggle = () => {
    void mut.mutateAsync({ action: a.enabled ? 'disable' : 'enable', accountId: a.accountId });
  };

  const doRemove = () => {
    void mut.mutateAsync({ action: 'remove', accountId: a.accountId }).then(() => setConfirmRemove(false));
  };

  return (
    <div className="card acct-card">
      <div className="acct-hd">
        <div>
          <div className="acct-name">
            {a.isCentral && <Icon name="Star" />}
            {a.accountName}
          </div>
          <div style={{ marginTop: 6 }}>
            <Badge tone={a.isCentral ? 'accent' : a.enabled ? 'ok' : 'muted'}>
              {a.isCentral ? 'Central' : a.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
          </div>
        </div>
      </div>
      <div className="acct-meta-list">
        <div className="acct-meta-row">
          <span className="acct-meta-k">Account ID</span>
          <span className="acct-meta-v">{a.accountId}</span>
        </div>
        <div className="acct-meta-row">
          <span className="acct-meta-k">Cross-account role</span>
          <span className="acct-meta-v">{a.isCentral ? 'LOCAL (lambda credentials)' : a.roleArn}</span>
        </div>
      </div>
      {testResult && (
        <div style={{ padding: '6px var(--pad)', fontSize: 12, color: 'var(--ink-2)', fontFamily: 'var(--f-mono)' }}>
          {testResult}
        </div>
      )}
      {confirmRemove && (
        <div style={{ padding: '12px var(--pad)', background: 'var(--surface-2)', borderTop: '1px solid var(--line)', fontSize: 13 }}>
          <div style={{ marginBottom: 10, color: 'var(--ink-2)' }}>Remove this account? This cannot be undone.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="danger" size="xs" onClick={doRemove} disabled={mut.isPending}>Confirm remove</Button>
            <Button variant="ghost" size="xs" onClick={() => setConfirmRemove(false)}>Cancel</Button>
          </div>
        </div>
      )}
      <div className="acct-actions">
        <Button size="xs" variant="ghost" icon="Activity" onClick={() => void doTest()} disabled={mut.isPending}>Test</Button>
        {!a.isCentral && (
          <>
            <Button size="xs" variant="ghost" icon={a.enabled ? 'PauseCircle' : 'PlayCircle'} onClick={doToggle} disabled={mut.isPending}>
              {a.enabled ? 'Disable' : 'Enable'}
            </Button>
            <Button size="xs" variant="danger" icon="Trash2" onClick={() => setConfirmRemove(true)}>Remove</Button>
          </>
        )}
      </div>
    </div>
  );
}

export default function AccountsScreen() {
  const { data, isLoading, error } = useAccounts();
  const [showAdd, setShowAdd] = useState(false);
  const accounts = data?.accounts ?? [];

  return (
    <div className="page">
      {showAdd && <AddAccountModal onClose={() => setShowAdd(false)} />}

      <PageHeader
        eyebrow="Administration"
        title="Accounts"
        sub="AWS accounts managed by this portal — each with a cross-account IAM role."
        actions={
          <>
            <Button icon="Plus" variant="primary" size="sm" onClick={() => setShowAdd(true)}>Add account</Button>
          </>
        }
      />

      <div className="info-banner">
        <Icon name="ShieldCheck" />
        <div>
          <div className="info-banner-ti">Access control</div>
          <div className="info-banner-body">
            <strong>Admin</strong> · full control — link/remove accounts, start/stop any instance.{' '}
            <strong>Operator</strong> · view and control assigned instances.{' '}
            <strong>Viewer</strong> · read-only.
          </div>
        </div>
      </div>

      {isLoading && <div style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>Loading accounts…</div>}
      {error    && <div style={{ padding: 'var(--pad)', color: 'var(--danger)', fontSize: 13 }}>Failed to load accounts.</div>}

      <div className="grid-2">
        {accounts.map((a) => <AccountCard key={a.accountId} a={a} />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 4.2: Rewrite `frontend/src/pages/app/UsersScreen.tsx`**

```typescript
import { useState } from 'react';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { useUsers, useUserMutation } from '@/lib/queries/users';
import { useAccounts } from '@/lib/queries/accounts';
import type { UserRecord } from '@/types/api';

function roleFromGroups(groups: string[]): 'admin' | 'operator' | 'viewer' | 'none' {
  if (groups.includes('admins'))    return 'admin';
  if (groups.includes('operators')) return 'operator';
  if (groups.includes('viewers'))   return 'viewer';
  return 'none';
}

const roleTone: Record<string, 'accent' | 'ok' | 'muted' | 'warn'> = {
  admin: 'accent', operator: 'ok', viewer: 'muted', none: 'warn',
};

function UserRow({ u, accounts }: { u: UserRecord; accounts: { accountId: string; accountName: string }[] }) {
  const mut = useUserMutation();
  const role = roleFromGroups(u.groups);
  const [selected, setSelected] = useState<string>(role);
  const [grantAcct, setGrantAcct] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState<string>('');

  const applyRole = () => {
    void mut.mutateAsync({ action: 'setrole', email: u.email, role: selected });
  };

  const grantAccount = () => {
    if (!grantAcct) return;
    void mut.mutateAsync({ action: 'grantaccount', email: u.email, accountId: grantAcct, accessLevel: 'operator' }).then(() => setGrantAcct(''));
  };

  const revokeAccount = (accountId: string) => {
    void mut.mutateAsync({ action: 'revokeaccount', email: u.email, accountId }).then(() => setConfirmRevoke(''));
  };

  return (
    <tr>
      <td className="strong">{u.email}</td>
      <td><Badge tone={roleTone[role] ?? 'muted'}>{role}</Badge></td>
      <td><Badge tone={u.status === 'CONFIRMED' ? 'ok' : 'muted'} dot>{u.status}</Badge></td>
      <td style={{ fontSize: 12, color: 'var(--ink-2)', fontFamily: 'var(--f-mono)' }}>
        {u.accounts.length === 0 ? 'None' : u.accounts.map((a) => `${a.accountId} · ${a.accessLevel.toUpperCase()}`).join(', ')}
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select className="inp" style={{ height: 30, fontSize: 12, width: 180 }} value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="admin">Admin (full access)</option>
            <option value="operator">Operator (start/stop)</option>
            <option value="viewer">Viewer (read-only)</option>
            <option value="none">None (pending)</option>
          </select>
          <Button size="xs" variant="accent" onClick={applyRole} disabled={mut.isPending || selected === role}>Apply</Button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
          <select className="inp" style={{ height: 28, fontSize: 12, width: 180 }} value={grantAcct} onChange={(e) => setGrantAcct(e.target.value)}>
            <option value="">Grant account…</option>
            {accounts.filter((a) => !u.accounts.find((ua) => ua.accountId === a.accountId)).map((a) => (
              <option key={a.accountId} value={a.accountId}>{a.accountName}</option>
            ))}
          </select>
          <Button size="xs" variant="ghost" icon="Plus" onClick={grantAccount} disabled={!grantAcct || mut.isPending}>Grant</Button>
        </div>
        {u.accounts.map((ua) => (
          confirmRevoke === ua.accountId ? (
            <div key={ua.accountId} style={{ display: 'flex', gap: 4, marginTop: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>Revoke {ua.accountId}?</span>
              <Button size="xs" variant="danger" onClick={() => revokeAccount(ua.accountId)} disabled={mut.isPending}>Yes</Button>
              <Button size="xs" variant="ghost" onClick={() => setConfirmRevoke('')}>No</Button>
            </div>
          ) : (
            <div key={ua.accountId} style={{ marginTop: 4 }}>
              <Button size="xs" variant="ghost" icon="Minus" onClick={() => setConfirmRevoke(ua.accountId)}>
                Revoke {ua.accountId}
              </Button>
            </div>
          )
        ))}
      </td>
    </tr>
  );
}

export default function UsersScreen() {
  const { data: userData, isLoading, error } = useUsers();
  const { data: acctData } = useAccounts();
  const users    = userData?.users ?? [];
  const accounts = (acctData?.accounts ?? []).map((a) => ({ accountId: a.accountId, accountName: a.accountName }));

  return (
    <div className="page">
      <PageHeader
        eyebrow="Administration"
        title="Users"
        sub="Manage user roles and per-account access permissions."
      />

      {isLoading && <div style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>Loading users…</div>}
      {error    && <div style={{ padding: 'var(--pad)', color: 'var(--danger)', fontSize: 13 }}>Failed to load users.</div>}

      <Card pad={false}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Account access</th>
              <th>Change role / Grant</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => <UserRow key={u.email} u={u} accounts={accounts} />)}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4.3: Typecheck**

```bash
npm run typecheck
```
Expected: zero errors.

- [ ] **Step 4.4: Smoke test — Accounts**

`http://localhost:5173/app/accounts` — real accounts should load. Click **Test** — should show latency. Try Enable/Disable toggle on a non-central account.

- [ ] **Step 4.5: Smoke test — Users**

`http://localhost:5173/app/users` — real user list should load with roles and account assignments. Apply a role change on a test user and verify it persists after page refresh.

- [ ] **Step 4.6: Commit**

```bash
git add frontend/src/pages/app/AccountsScreen.tsx \
        frontend/src/pages/app/UsersScreen.tsx
git commit -m "feat(frontend): wire accounts and users to real API"
```

---

## Task 5: Rebuild Backup Screen + MyServers Coming Soon

**Commit:** `feat(frontend): rebuild backup screen and stub My Servers`

**Files:**
- Modify: `frontend/src/pages/app/BackupsScreen.tsx`
- Modify: `frontend/src/pages/app/MyServersScreen.tsx`

- [ ] **Step 5.1: Rewrite `frontend/src/pages/app/BackupsScreen.tsx`**

```typescript
import { useState } from 'react';
import { Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { useInstances } from '@/lib/queries/ec2';
import { useBackupList, useBackupMutation } from '@/lib/queries/backup';
import { getRole } from '@/lib/auth';
import type { Instance, RecoveryPoint, BackupPlan } from '@/types/api';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '—';
  const gb = bytes / 1_073_741_824;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1_048_576).toFixed(0)} MB`;
}

function friendlyCron(expr: string): string {
  const m = expr.match(/cron\((\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\)/);
  if (!m) return expr;
  const [, min, hour, dom, , dow] = m;
  const time = `${hour.padStart(2, '0')}:${min.padStart(2, '0')} UTC`;
  if (dom === '*' || dom === '?') {
    if (dow === 'SUN' || dow === '1') return `Weekly (Sun) at ${time}`;
    if (dom === '1')                  return `Monthly (1st) at ${time}`;
  }
  if (dom === '*' && (dow === '?' || dow === '*')) return `Daily at ${time}`;
  return expr;
}

interface RestoreFormProps {
  arn: string;
  instanceType: string;
  onConfirm: (arn: string, instanceType: string) => void;
  onCancel: () => void;
  isPending: boolean;
}
function RestoreForm({ arn, instanceType, onConfirm, onCancel, isPending }: RestoreFormProps) {
  const [type, setType] = useState(instanceType);
  return (
    <div style={{ padding: 16, background: 'var(--surface-2)', borderTop: '1px solid var(--line)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Restore to new instance</div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: 1 }}>
          <label className="field-label">Instance type</label>
          <input className="inp" value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. t3.micro" />
        </div>
        <Button variant="accent" size="sm" onClick={() => onConfirm(arn, type)} disabled={isPending || !type}>
          {isPending ? 'Restoring…' : 'Restore'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 8 }}>
        A new EC2 instance will be created. The original instance is not affected.
      </div>
    </div>
  );
}

interface ScheduleFormProps {
  plan?: BackupPlan;
  onSave: (data: { preset: string; hour: string; minute: string; planId?: string }) => void;
  onCancel: () => void;
  isPending: boolean;
}
function ScheduleForm({ plan, onSave, onCancel, isPending }: ScheduleFormProps) {
  const [preset, setPreset]   = useState('daily');
  const [hour, setHour]       = useState('02');
  const [minute, setMinute]   = useState('00');
  return (
    <div style={{ padding: 16, background: 'var(--surface-2)', borderTop: '1px solid var(--line)' }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>{plan ? 'Edit schedule' : 'Create backup schedule'}</div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="field">
          <label className="field-label">Frequency</label>
          <select className="inp" value={preset} onChange={(e) => setPreset(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly (Sunday)</option>
            <option value="monthly">Monthly (1st)</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label">Hour (UTC)</label>
          <select className="inp" value={hour} onChange={(e) => setHour(e.target.value)}>
            {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((h) => <option key={h}>{h}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field-label">Minute</label>
          <select className="inp" value={minute} onChange={(e) => setMinute(e.target.value)}>
            {['00', '15', '30', '45'].map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <Button variant="accent" size="sm" onClick={() => onSave({ preset, hour, minute, planId: plan?.planId })} disabled={isPending}>
          {isPending ? 'Saving…' : plan ? 'Update' : 'Create'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function buildCron(preset: string, hour: string, minute: string): string {
  if (preset === 'weekly')  return `cron(${minute} ${hour} ? * SUN *)`;
  if (preset === 'monthly') return `cron(${minute} ${hour} 1 * ? *)`;
  return `cron(${minute} ${hour} * * ? *)`;
}

export default function BackupsScreen() {
  const canWrite = getRole() !== 'viewer';
  const { data: instData, isLoading: instLoading } = useInstances();
  const instances = instData?.instances ?? [];

  const [selectedId, setSelectedId] = useState('');
  const selected: Instance | undefined = instances.find((i) => i.instanceId === selectedId);

  const { data, isLoading: backupLoading, error } = useBackupList(
    selected?.instanceId ?? '',
    selected?.accountId  ?? '',
    selected?.region     ?? '',
  );
  const mut = useBackupMutation(selected?.instanceId ?? '', selected?.accountId ?? '', selected?.region ?? '');

  const rps     = data?.recoveryPoints ?? [];
  const plans   = data?.backupPlans    ?? [];

  const [restoreArn, setRestoreArn]       = useState('');
  const [showSchedForm, setShowSchedForm] = useState(false);
  const [editPlan, setEditPlan]           = useState<BackupPlan | undefined>(undefined);
  const [confirmDeleteArn, setConfirmDeleteArn]   = useState('');
  const [confirmDeletePlan, setConfirmDeletePlan] = useState('');

  const doBackupNow = () => {
    if (!selected) return;
    void mut.mutateAsync({ action: 'createbackup', instanceId: selected.instanceId, accountId: selected.accountId, region: selected.region });
  };

  const doRestore = (arn: string, instanceType: string) => {
    if (!selected) return;
    void mut.mutateAsync({ action: 'restore', recoveryPointArn: arn, instanceType, accountId: selected.accountId, region: selected.region }).then(() => setRestoreArn(''));
  };

  const doSaveSchedule = ({ preset, hour, minute, planId }: { preset: string; hour: string; minute: string; planId?: string }) => {
    if (!selected) return;
    const scheduleExpression = buildCron(preset, hour, minute);
    const action = planId ? 'updateschedule' : 'createschedule';
    void mut.mutateAsync({ action, planId, instanceId: selected.instanceId, accountId: selected.accountId, region: selected.region, scheduleExpression }).then(() => {
      setShowSchedForm(false);
      setEditPlan(undefined);
    });
  };

  const doDeleteRecovery = (arn: string) => {
    void mut.mutateAsync({ action: 'deleterecovery', recoveryPointArn: arn, accountId: selected?.accountId ?? '', region: selected?.region ?? '' }).then(() => setConfirmDeleteArn(''));
  };

  const doDeleteSchedule = (planId: string) => {
    void mut.mutateAsync({ action: 'deleteschedule', planId, accountId: selected?.accountId ?? '', region: selected?.region ?? '' }).then(() => setConfirmDeletePlan(''));
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Protection"
        title="Backups"
        sub="Snapshots and restores across your fleet. Select an instance to manage its backups."
        actions={
          canWrite && selected ? (
            <Button icon="Plus" variant="primary" size="sm" onClick={doBackupNow} disabled={mut.isPending}>
              {mut.isPending ? 'Working…' : 'Backup now'}
            </Button>
          ) : undefined
        }
      />

      {/* Instance selector */}
      <div style={{ marginBottom: 'var(--gap)' }}>
        <div className="field" style={{ maxWidth: 360 }}>
          <label className="field-label">Select instance</label>
          <select className="inp" value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setRestoreArn(''); setShowSchedForm(false); }}>
            <option value="">— choose an instance —</option>
            {instLoading && <option disabled>Loading…</option>}
            {instances.map((i) => (
              <option key={i.instanceId} value={i.instanceId}>{i.name} ({i.accountName} · {i.region})</option>
            ))}
          </select>
        </div>
      </div>

      {!selected && (
        <Card pad={false}>
          <EmptyState icon="HardDriveUpload" title="No instance selected" description="Choose an instance above to view its recovery points and backup schedules." />
        </Card>
      )}

      {selected && (
        <>
          {/* Recovery Points */}
          <Card title="Recovery Points" subtitle={`Snapshots for ${selected.name}`} pad={false}>
            {backupLoading && <div style={{ padding: 'var(--pad)', color: 'var(--ink-3)', fontSize: 13 }}>Loading…</div>}
            {error && <div style={{ padding: 'var(--pad)', color: 'var(--danger)', fontSize: 13 }}>Failed to load backup data.</div>}
            {!backupLoading && rps.length === 0 && (
              <EmptyState icon="HardDriveUpload" title="No recovery points" description="Create your first manual snapshot or enable a backup schedule." />
            )}
            {rps.length > 0 && (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>ARN</th>
                    <th>Created</th>
                    <th>Status</th>
                    <th>Size</th>
                    {canWrite && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {rps.map((rp: RecoveryPoint) => (
                    <>
                      <tr key={rp.arn}>
                        <td className="mono" style={{ fontSize: 11, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rp.arn}</td>
                        <td className="mono">{new Date(rp.creationDate).toLocaleString()}</td>
                        <td><span className="action-chip">{rp.status}</span></td>
                        <td className="mono">{formatBytes(rp.backupSizeBytes)}</td>
                        {canWrite && (
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <Button size="xs" variant="ghost" icon="RefreshCw" onClick={() => setRestoreArn(restoreArn === rp.arn ? '' : rp.arn)}>Restore</Button>
                              {confirmDeleteArn === rp.arn ? (
                                <>
                                  <Button size="xs" variant="danger" onClick={() => doDeleteRecovery(rp.arn)} disabled={mut.isPending}>Confirm</Button>
                                  <Button size="xs" variant="ghost" onClick={() => setConfirmDeleteArn('')}>Cancel</Button>
                                </>
                              ) : (
                                <Button size="xs" variant="danger" icon="Trash2" onClick={() => setConfirmDeleteArn(rp.arn)}>Delete</Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                      {restoreArn === rp.arn && (
                        <tr key={`${rp.arn}-restore`}>
                          <td colSpan={canWrite ? 5 : 4} style={{ padding: 0 }}>
                            <RestoreForm arn={rp.arn} instanceType={selected.instanceType} onConfirm={doRestore} onCancel={() => setRestoreArn('')} isPending={mut.isPending} />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {/* Backup Schedules */}
          <Card
            title="Backup Schedules"
            subtitle="Automated snapshot policies"
            pad={false}
            action={canWrite && !showSchedForm ? (
              <Button size="sm" variant="ghost" icon="Plus" onClick={() => { setShowSchedForm(true); setEditPlan(undefined); }}>New schedule</Button>
            ) : undefined}
          >
            {showSchedForm && !editPlan && (
              <ScheduleForm onSave={doSaveSchedule} onCancel={() => setShowSchedForm(false)} isPending={mut.isPending} />
            )}
            {!backupLoading && plans.length === 0 && !showSchedForm && (
              <EmptyState icon="CalendarClock" title="No backup schedules" description="Create an automated backup policy to protect this instance." />
            )}
            {plans.length > 0 && (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Schedule</th>
                    <th>Plan ID</th>
                    {canWrite && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p: BackupPlan) => (
                    <>
                      <tr key={p.planId}>
                        <td>{friendlyCron(p.scheduleExpression)}</td>
                        <td className="mono" style={{ fontSize: 11 }}>{p.planId}</td>
                        {canWrite && (
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <Button size="xs" variant="ghost" icon="Pencil" onClick={() => { setEditPlan(p); setShowSchedForm(true); }}>Edit</Button>
                              {confirmDeletePlan === p.planId ? (
                                <>
                                  <Button size="xs" variant="danger" onClick={() => doDeleteSchedule(p.planId)} disabled={mut.isPending}>Confirm</Button>
                                  <Button size="xs" variant="ghost" onClick={() => setConfirmDeletePlan('')}>Cancel</Button>
                                </>
                              ) : (
                                <Button size="xs" variant="danger" icon="Trash2" onClick={() => setConfirmDeletePlan(p.planId)}>Delete</Button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                      {editPlan?.planId === p.planId && showSchedForm && (
                        <tr key={`${p.planId}-edit`}>
                          <td colSpan={canWrite ? 3 : 2} style={{ padding: 0 }}>
                            <ScheduleForm plan={p} onSave={doSaveSchedule} onCancel={() => { setShowSchedForm(false); setEditPlan(undefined); }} isPending={mut.isPending} />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 5.2: Rewrite `frontend/src/pages/app/MyServersScreen.tsx`**

```typescript
import { Card, EmptyState, PageHeader } from '@/components/ui';

export default function MyServersScreen() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Labs"
        title="My Servers"
        sub="Self-service EC2 lab provisioning — coming in a future update."
      />
      <Card pad={false}>
        <EmptyState
          icon="Wrench"
          title="Labs coming soon"
          description="The self-service lab wizard (configure, price, pay, provision) is under active development. Check back in the next release."
        />
      </Card>
    </div>
  );
}
```

- [ ] **Step 5.3: Typecheck**

```bash
npm run typecheck
```
Expected: zero errors.

- [ ] **Step 5.4: Build — verify `__INJECT__` placeholder preserved**

```bash
npm run build && grep -c '__INJECT__' dist/index.html
```
Expected output: `1`

- [ ] **Step 5.5: Smoke test — Backups**

`http://localhost:5173/app/backups` — select an instance with real backups. Verify recovery points table loads. Try creating a backup schedule — confirm it appears in the schedules table.

- [ ] **Step 5.6: Smoke test — MyServers**

`http://localhost:5173/app/servers` — verify "Labs coming soon" card renders with no errors.

- [ ] **Step 5.7: Commit**

```bash
git add frontend/src/pages/app/BackupsScreen.tsx \
        frontend/src/pages/app/MyServersScreen.tsx
git commit -m "feat(frontend): rebuild backup screen and stub My Servers"
```

---

## Final: Push + Verify Dev Deploy

- [ ] **Step 6.1: Push to `develop`**

```bash
git push origin develop
```
GitHub Actions triggers automatically. Watch the Actions tab at `https://github.com/OneCloudUtopia/ec2-control-center/actions`.

- [ ] **Step 6.2: Wait for deploy (~5-8 min)**

When the workflow completes, open:
```
https://d1f7pmzpwdrl1i.cloudfront.net
```

- [ ] **Step 6.3: Run final verification checklist**

- [ ] Login with admin account works
- [ ] Dashboard shows real instance fleet (not mock data)
- [ ] Instances screen: Start or Stop a real instance — state updates after refresh
- [ ] Audit screen: real log entries appear; filter by Action works
- [ ] Billing screen: real 30-day cost figures (or "No cost data" message)
- [ ] Accounts screen: Test button returns real latency
- [ ] Users screen: user list loads with correct roles
- [ ] Backups screen: select an instance, recovery points load
- [ ] Signup → email verify → login flow works for a new test email
- [ ] My Servers shows "coming soon" card
