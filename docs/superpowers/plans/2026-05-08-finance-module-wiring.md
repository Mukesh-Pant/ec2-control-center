# Finance Module Frontend Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire all four Finance screens (Vendors, Customers, Alerts, Fin Settings) to the already-deployed backend, and remove the only active mock data import (`ACCOUNTS` from `mockData.ts` in `FinSettingsScreen`).

**Architecture:** Backend is 100% complete — `finance.py`, `index.py` routing, DynamoDB table `ec2-control-finance-{env}`, S3 bucket, IAM, and all API Gateway routes are live in `central-stack.yaml`. All work is in the React frontend: add Finance types to `api.ts`, create `lib/queries/finance.ts` with TanStack Query hooks, then rewrite each Finance screen to use those hooks.

**Tech Stack:** React 18, TypeScript 5.6, TanStack Query v5, `apiFetch<T>` from `@/lib/api`, existing UI primitives from `@/components/ui`.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `frontend/src/types/api.ts` | Add `Vendor`, `Customer`, `FinanceSettings`, `FinanceAlert` types |
| Create | `frontend/src/lib/queries/finance.ts` | TanStack Query hooks for all finance endpoints |
| Rewrite | `frontend/src/pages/app/AlertsScreen.tsx` | Wire to `useFinanceAlerts()` |
| Rewrite | `frontend/src/pages/app/FinSettingsScreen.tsx` | Replace mock ACCOUNTS, wire settings save |
| Rewrite | `frontend/src/pages/app/VendorsScreen.tsx` | Full CRUD wired to `/finance/vendors` |
| Rewrite | `frontend/src/pages/app/CustomersScreen.tsx` | Full CRUD wired to `/finance/customers` |

---

## Backend reminder (already built — do NOT modify)

`finance.py` handler signatures:
- `handle_finance_vendors_list(event)` — GET /finance/vendors → `{ items: Vendor[] }`
- `handle_finance_vendors_mutation(event)` — POST /finance/vendors → body `{ action: 'create'|'update'|'delete', vendor?: {...}, vendorId?: string }`
  - create: `{ vendor: { name, category, billingType, currency, amount, agreementEnd?, manualStatus, notes? } }`
  - update: `{ vendor: { entityId, ...fields } }`
  - delete: `{ vendorId: 'v-uuid' }`
- `handle_finance_customers_list(event)` — GET /finance/customers → `{ items: Customer[] }`
- `handle_finance_customers_mutation(event)` — POST /finance/customers → body `{ action: 'create'|'update'|'delete', customer?: {...}, customerId?: string }`
- `handle_finance_alerts(event)` — GET /finance/alerts → `{ alerts: FinanceAlert[] }`
- `handle_finance_settings_get(event)` — GET /finance/settings → full settings object (flat, not wrapped)
- `handle_finance_settings_save(event)` — POST /finance/settings → body is flat settings object
- All handlers have `require_admin` guard — non-admins receive 403

Settings keys accepted by backend: `usdToNpr`, `inrToNpr`, `expiryWarningDays`, `paymentWarningDays`, `defaultCurrency`, `wht_rate`, `margin_rate`, `vat_rate`, `taxAccounts`

---

## Task 1 — Add Finance types to `api.ts`

**Files:**
- Modify: `frontend/src/types/api.ts`

- [ ] **Step 1: Append Finance types at the bottom of `api.ts`**

Add the following block at the end of `frontend/src/types/api.ts`, after the last existing interface:

```typescript
// ── Finance module ────────────────────────────────────────────────────────

export interface Vendor {
  entityId: string;
  name: string;
  category: string;
  billingType: 'recurring' | 'one-time' | 'variable';
  currency: 'USD' | 'NPR' | 'INR';
  amount: number;
  agreementEnd?: string;   // ISO date YYYY-MM-DD
  manualStatus: 'active' | 'inactive';
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface VendorsResponse {
  items: Vendor[];
}

export interface VendorMutationResponse {
  vendorId?: string;
  deleted?: string;
}

export interface Customer {
  entityId: string;
  name: string;
  type: 'Business' | 'Individual';
  currency: 'USD' | 'NPR' | 'INR';
  contractValue: number;
  outstandingAmount: number;
  nextDueDate?: string;   // ISO date YYYY-MM-DD — triggers payment alerts
  agreementEnd?: string;  // ISO date YYYY-MM-DD — triggers contract expiry alerts
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CustomersResponse {
  items: Customer[];
}

export interface CustomerMutationResponse {
  customerId?: string;
  deleted?: string;
}

export interface FinanceSettings {
  usdToNpr: number;
  inrToNpr: number;
  expiryWarningDays: number;
  paymentWarningDays: number;
  defaultCurrency: 'USD' | 'NPR' | 'INR';
  wht_rate: number;     // decimal, e.g. 0.18 = 18%
  margin_rate: number;  // decimal
  vat_rate: number;     // decimal
  taxAccounts: Record<string, { wht?: number; vat?: number; margin?: number; rebate?: number }>;
}

export interface FinanceSettingsMutationResponse {
  saved: boolean;
}

export type FinanceAlertType =
  | 'vendor_expired'
  | 'vendor_expiring'
  | 'payment_overdue'
  | 'payment_due'
  | 'milestone_overdue'
  | 'contract_expiring';

export type FinanceAlertSeverity = 'critical' | 'warning';

export interface FinanceAlert {
  type: FinanceAlertType;
  severity: FinanceAlertSeverity;
  entityType: 'VENDOR' | 'CUSTOMER';
  entityId: string;
  entityName: string;
  message: string;
  link: string;
}

export interface FinanceAlertsResponse {
  alerts: FinanceAlert[];
}
```

- [ ] **Step 2: Verify TypeScript compiles with new types**

```powershell
cd frontend; npx tsc --noEmit
```

Expected: no errors (or only pre-existing errors unrelated to Finance).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/api.ts
git commit -m "feat(frontend): add Finance module types to api.ts"
```

---

## Task 2 — Create `lib/queries/finance.ts`

**Files:**
- Create: `frontend/src/lib/queries/finance.ts`

- [ ] **Step 1: Create the queries file**

Create `frontend/src/lib/queries/finance.ts` with the following content:

```typescript
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
    mutationFn: (body: Record<string, unknown>) =>
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
    mutationFn: (body: Record<string, unknown>) =>
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```powershell
cd frontend; npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/queries/finance.ts
git commit -m "feat(frontend): add Finance TanStack Query hooks"
```

---

## Task 3 — Wire `AlertsScreen.tsx`

**Files:**
- Rewrite: `frontend/src/pages/app/AlertsScreen.tsx`

This is the simplest screen — read-only, no mutations.

- [ ] **Step 1: Replace AlertsScreen.tsx entirely**

```typescript
import React from 'react';
import { Badge, Card, EmptyState, Icon, PageHeader } from '@/components/ui';
import { useFinanceAlerts } from '@/lib/queries/finance';
import type { FinanceAlert } from '@/types/api';

function alertIconName(type: FinanceAlert['type']): string {
  if (type === 'vendor_expired' || type === 'payment_overdue' || type === 'milestone_overdue') {
    return 'AlertOctagon';
  }
  return 'AlertTriangle';
}

function alertBadgeTone(severity: FinanceAlert['severity']): 'err' | 'warn' {
  return severity === 'critical' ? 'err' : 'warn';
}

function alertColor(severity: FinanceAlert['severity']): string {
  return severity === 'critical' ? 'var(--danger)' : 'var(--warn)';
}

export default function AlertsScreen() {
  const { data, isLoading, error } = useFinanceAlerts();
  const alerts = data?.alerts ?? [];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Finance"
        title="Alerts & Notifications"
        sub="Contract expirations, payment reminders, and cost anomalies."
      />
      <Card pad={!isLoading && !error && alerts.length > 0 ? false : undefined}>
        {isLoading && (
          <p style={{ padding: 24, color: 'var(--ink-3)', fontSize: 13 }}>Loading alerts…</p>
        )}
        {error && (
          <p style={{ padding: 24, color: 'var(--danger)', fontSize: 13 }}>
            {error instanceof Error ? error.message : 'Failed to load alerts.'}
          </p>
        )}
        {!isLoading && !error && alerts.length === 0 && (
          <EmptyState
            icon="BellOff"
            title="Nothing needs your attention"
            description="Alerts appear here when contracts are about to expire, payments are overdue, or cost anomalies are detected."
          />
        )}
        {!isLoading && !error && alerts.length > 0 && (
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                <th>Message</th>
                <th>Entity</th>
                <th style={{ width: 110 }}>Severity</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a, i) => (
                <tr key={i}>
                  <td>
                    <Icon
                      name={alertIconName(a.type)}
                      size={14}
                      color={alertColor(a.severity)}
                    />
                  </td>
                  <td style={{ fontSize: 13 }}>{a.message}</td>
                  <td>
                    <div style={{ fontSize: 13 }}>{a.entityName}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-4)' }}>{a.entityType}</div>
                  </td>
                  <td>
                    <Badge tone={alertBadgeTone(a.severity)}>
                      {a.severity}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```powershell
cd frontend; npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/app/AlertsScreen.tsx
git commit -m "feat(frontend): wire AlertsScreen to /finance/alerts"
```

---

## Task 4 — Wire `FinSettingsScreen.tsx`

**Files:**
- Rewrite: `frontend/src/pages/app/FinSettingsScreen.tsx`

Removes the `ACCOUNTS` mock import. Replaces static form with live settings from `useFinanceSettings()` and real accounts from `useAccounts()`. Wires Save and per-row Apply buttons.

- [ ] **Step 1: Replace FinSettingsScreen.tsx entirely**

```typescript
import React, { useState, useEffect } from 'react';
import { Button, Card, PageHeader } from '@/components/ui';
import { useAccounts } from '@/lib/queries/accounts';
import { useFinanceSettings, useFinanceSettingsMutation } from '@/lib/queries/finance';
import type { FinanceSettings } from '@/types/api';

type TaxRow = { wht: string; vat: string; margin: string; rebate: string };

export default function FinSettingsScreen() {
  const { data: settingsData, isLoading: settingsLoading } = useFinanceSettings();
  const { data: accountsData } = useAccounts();
  const mut = useFinanceSettingsMutation();

  const [form, setForm] = useState<Partial<FinanceSettings>>({});
  const [taxEdits, setTaxEdits] = useState<Record<string, TaxRow>>({});
  const [saveMsg, setSaveMsg] = useState('');
  const [saveErr, setSaveErr] = useState('');

  useEffect(() => {
    if (settingsData) {
      setForm(settingsData);
      const edits: Record<string, TaxRow> = {};
      const accts = settingsData.taxAccounts ?? {};
      for (const [id, v] of Object.entries(accts)) {
        edits[id] = {
          wht:    v.wht    != null ? String(v.wht)    : '',
          vat:    v.vat    != null ? String(v.vat)    : '',
          margin: v.margin != null ? String(v.margin) : '',
          rebate: v.rebate != null ? String(v.rebate) : '',
        };
      }
      setTaxEdits(edits);
    }
  }, [settingsData]);

  const setField = (key: keyof FinanceSettings, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveMsg('');
    setSaveErr('');
  };

  const buildSaveBody = (overrideTax?: Record<string, TaxRow>): Record<string, unknown> => {
    const tax = overrideTax ?? taxEdits;
    const taxAccounts: Record<string, { wht?: number; vat?: number; margin?: number; rebate?: number }> = {};
    for (const [id, row] of Object.entries(tax)) {
      taxAccounts[id] = {
        wht:    row.wht    !== '' ? parseFloat(row.wht)    : undefined,
        vat:    row.vat    !== '' ? parseFloat(row.vat)    : undefined,
        margin: row.margin !== '' ? parseFloat(row.margin) : undefined,
        rebate: row.rebate !== '' ? parseFloat(row.rebate) : undefined,
      };
    }
    return {
      ...form,
      taxAccounts,
    };
  };

  const saveGlobal = async () => {
    setSaveMsg('');
    setSaveErr('');
    try {
      await mut.mutateAsync(buildSaveBody());
      setSaveMsg('Settings saved.');
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  const applyAccountTax = async (accountId: string) => {
    setSaveMsg('');
    setSaveErr('');
    try {
      await mut.mutateAsync(buildSaveBody());
      setSaveMsg(`Tax settings applied for ${accountId}.`);
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Save failed.');
    }
  };

  const accounts = accountsData?.accounts ?? [];
  const whtGlobal = form.wht_rate != null ? (form.wht_rate * 100).toFixed(1) : '18.0';
  const vatGlobal = form.vat_rate != null ? (form.vat_rate * 100).toFixed(1) : '13.0';
  const marginGlobal = form.margin_rate != null ? (form.margin_rate * 100).toFixed(1) : '12.0';

  return (
    <div className="page">
      <PageHeader
        eyebrow="Configuration"
        title="Finance Settings"
        sub="Exchange rates, tax management, and finance alert defaults."
      />

      <Card title="Exchange rates" subtitle="Used across billing, vendors, and customers">
        {settingsLoading ? (
          <p style={{ color: 'var(--ink-3)', fontSize: 13 }}>Loading settings…</p>
        ) : (
          <>
            <div className="grid-2" style={{ gap: 20 }}>
              <div className="field">
                <label className="field-label">USD → NPR rate</label>
                <input
                  className="inp"
                  type="number"
                  step={0.01}
                  min={0}
                  value={(form.usdToNpr as number) ?? 135}
                  onChange={(e) => setField('usdToNpr', parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="field">
                <label className="field-label">INR → NPR rate</label>
                <input
                  className="inp"
                  type="number"
                  step={0.0001}
                  min={0}
                  value={(form.inrToNpr as number) ?? 1.62}
                  onChange={(e) => setField('inrToNpr', parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>
            <div style={{ height: 20 }} />
            <div className="grid-2" style={{ gap: 20 }}>
              <div className="field">
                <label className="field-label">Contract expiry warning (days)</label>
                <input
                  className="inp"
                  type="number"
                  step={1}
                  min={1}
                  value={(form.expiryWarningDays as number) ?? 30}
                  onChange={(e) => setField('expiryWarningDays', parseInt(e.target.value, 10) || 30)}
                />
              </div>
              <div className="field">
                <label className="field-label">Payment due warning (days)</label>
                <input
                  className="inp"
                  type="number"
                  step={1}
                  min={1}
                  value={(form.paymentWarningDays as number) ?? 7}
                  onChange={(e) => setField('paymentWarningDays', parseInt(e.target.value, 10) || 7)}
                />
              </div>
            </div>
            <div style={{ height: 20 }} />
            <div className="field" style={{ maxWidth: 320 }}>
              <label className="field-label">Default currency</label>
              <select
                className="inp"
                value={(form.defaultCurrency as string) ?? 'USD'}
                onChange={(e) => setField('defaultCurrency', e.target.value as FinanceSettings['defaultCurrency'])}
              >
                <option value="USD">USD — US Dollar</option>
                <option value="NPR">NPR — Nepalese Rupee</option>
                <option value="INR">INR — Indian Rupee</option>
              </select>
            </div>
            <div style={{ marginTop: 24, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'flex-end' }}>
              {saveMsg && <span style={{ fontSize: 13, color: 'var(--green-2)' }}>{saveMsg}</span>}
              {saveErr && <span style={{ fontSize: 13, color: 'var(--danger)' }}>{saveErr}</span>}
              <Button variant="primary" size="sm" icon="Save" onClick={() => void saveGlobal()} disabled={mut.isPending}>
                {mut.isPending ? 'Saving…' : 'Save settings'}
              </Button>
            </div>
          </>
        )}
      </Card>

      <div style={{ height: 24 }} />

      <Card
        title="Tax management · per account"
        subtitle="Override global rates per customer account. Rebate is applied to the final price and shown as a discount line item."
        pad={false}
      >
        <table className="tbl">
          <thead>
            <tr>
              <th>Account</th>
              <th className="num">WHT % (global {whtGlobal}%)</th>
              <th className="num">VAT % (global {vatGlobal}%)</th>
              <th className="num">Margin % (global {marginGlobal}%)</th>
              <th className="num">Rebate %</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const row: TaxRow = taxEdits[a.accountId] ?? { wht: '', vat: '', margin: '', rebate: '' };
              const setTax = (field: keyof TaxRow, val: string) =>
                setTaxEdits((prev) => ({
                  ...prev,
                  [a.accountId]: { ...row, [field]: val },
                }));
              return (
                <tr key={a.accountId}>
                  <td>
                    <div className="strong" style={{ color: 'var(--ink)' }}>{a.accountId}</div>
                    <div className="mono" style={{ color: 'var(--ink-4)' }}>{a.accountName}</div>
                  </td>
                  <td className="num">
                    <input
                      className="inp"
                      style={{ width: 80, textAlign: 'right' }}
                      type="number"
                      step={0.1}
                      min={0}
                      placeholder="Use global"
                      value={row.wht}
                      onChange={(e) => setTax('wht', e.target.value)}
                    />
                  </td>
                  <td className="num">
                    <input
                      className="inp"
                      style={{ width: 80, textAlign: 'right' }}
                      type="number"
                      step={0.1}
                      min={0}
                      placeholder="Use global"
                      value={row.vat}
                      onChange={(e) => setTax('vat', e.target.value)}
                    />
                  </td>
                  <td className="num">
                    <input
                      className="inp"
                      style={{ width: 80, textAlign: 'right' }}
                      type="number"
                      step={0.1}
                      min={0}
                      placeholder="Use global"
                      value={row.margin}
                      onChange={(e) => setTax('margin', e.target.value)}
                    />
                  </td>
                  <td className="num">
                    <input
                      className="inp"
                      style={{ width: 80, textAlign: 'right' }}
                      type="number"
                      step={0.1}
                      min={0}
                      placeholder="0"
                      value={row.rebate}
                      onChange={(e) => setTax('rebate', e.target.value)}
                    />
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => void applyAccountTax(a.accountId)}
                      disabled={mut.isPending}
                    >
                      Apply
                    </Button>
                  </td>
                </tr>
              );
            })}
            {accounts.length === 0 && !settingsLoading && (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--ink-4)', fontSize: 13, padding: 20 }}>
                  No accounts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {(saveMsg || saveErr) && (
          <div style={{ padding: '8px 16px', fontSize: 12 }}>
            {saveMsg && <span style={{ color: 'var(--green-2)' }}>{saveMsg}</span>}
            {saveErr && <span style={{ color: 'var(--danger)' }}>{saveErr}</span>}
          </div>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```powershell
cd frontend; npx tsc --noEmit
```

Expected: no errors. In particular, no reference to `mockData` should remain.

- [ ] **Step 3: Verify mock import is gone**

```powershell
Select-String -Path frontend/src/pages/app/FinSettingsScreen.tsx -Pattern "mockData"
```

Expected: no output (zero matches).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/app/FinSettingsScreen.tsx
git commit -m "feat(frontend): wire FinSettingsScreen — replace mock ACCOUNTS, add live settings save"
```

---

## Task 5 — Wire `VendorsScreen.tsx`

**Files:**
- Rewrite: `frontend/src/pages/app/VendorsScreen.tsx`

Full CRUD: stats computed from live data, client-side filters, inline add form, per-row edit and delete. Mutation controls hidden from non-admin roles (read-only view for operators/viewers).

- [ ] **Step 1: Replace VendorsScreen.tsx entirely**

```typescript
import React, { useState } from 'react';
import { Badge, Button, Card, EmptyState, Icon, PageHeader, Stat } from '@/components/ui';
import { useVendors, useVendorMutation } from '@/lib/queries/finance';
import { getRole } from '@/lib/auth';
import type { Vendor } from '@/types/api';

type VendorFormData = {
  name: string;
  category: string;
  billingType: 'recurring' | 'one-time' | 'variable';
  currency: 'USD' | 'NPR' | 'INR';
  amount: string;
  agreementEnd: string;
  manualStatus: 'active' | 'inactive';
  notes: string;
};

function blankVendor(): VendorFormData {
  return { name: '', category: '', billingType: 'recurring', currency: 'USD', amount: '', agreementEnd: '', manualStatus: 'active', notes: '' };
}

function vendorToForm(v: Vendor): VendorFormData {
  return {
    name: v.name,
    category: v.category,
    billingType: v.billingType,
    currency: v.currency,
    amount: v.amount != null ? String(v.amount) : '',
    agreementEnd: v.agreementEnd ?? '',
    manualStatus: v.manualStatus,
    notes: v.notes ?? '',
  };
}

function VendorForm({
  initial,
  onSave,
  onCancel,
  isPending,
  err,
}: {
  initial?: VendorFormData;
  onSave: (f: VendorFormData) => void;
  onCancel: () => void;
  isPending: boolean;
  err: string;
}) {
  const [f, setF] = useState<VendorFormData>(initial ?? blankVendor());
  const set = (k: keyof VendorFormData, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
        <div className="field">
          <label className="field-label">Name *</label>
          <input className="inp" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="AWS" />
        </div>
        <div className="field">
          <label className="field-label">Category</label>
          <input className="inp" value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="Infrastructure" />
        </div>
        <div className="field">
          <label className="field-label">Billing type</label>
          <select className="inp" value={f.billingType} onChange={(e) => set('billingType', e.target.value as VendorFormData['billingType'])}>
            <option value="recurring">Recurring</option>
            <option value="one-time">One-time</option>
            <option value="variable">Variable</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label">Currency</label>
          <select className="inp" value={f.currency} onChange={(e) => set('currency', e.target.value as VendorFormData['currency'])}>
            <option value="USD">USD</option>
            <option value="NPR">NPR</option>
            <option value="INR">INR</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label">Monthly amount</label>
          <input className="inp" type="number" min={0} step={0.01} value={f.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0" />
        </div>
        <div className="field">
          <label className="field-label">Agreement end date</label>
          <input className="inp" type="date" value={f.agreementEnd} onChange={(e) => set('agreementEnd', e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Status</label>
          <select className="inp" value={f.manualStatus} onChange={(e) => set('manualStatus', e.target.value as 'active' | 'inactive')}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Notes</label>
          <input className="inp" value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optional notes" />
        </div>
      </div>
      {err && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button size="xs" variant="primary" onClick={() => onSave(f)} disabled={isPending || !f.name.trim()}>
          {isPending ? 'Saving…' : 'Save vendor'}
        </Button>
        <Button size="xs" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function vendorStatusTone(v: Vendor): 'ok' | 'muted' | 'warn' {
  if (v.manualStatus === 'inactive') return 'muted';
  if (v.agreementEnd) {
    const end = new Date(v.agreementEnd);
    const today = new Date();
    const daysLeft = (end.getTime() - today.getTime()) / 86_400_000;
    if (daysLeft < 0) return 'err' as never;
    if (daysLeft <= 30) return 'warn';
  }
  return 'ok';
}

export default function VendorsScreen() {
  const role = getRole();
  const isAdmin = role === 'admin';
  const { data, isLoading, error } = useVendors();
  const mut = useVendorMutation();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [billingFilter, setBillingFilter] = useState('all');
  const [currencyFilter, setCurrencyFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mutErr, setMutErr] = useState('');

  const vendors = data?.items ?? [];

  const filtered = vendors.filter((v) => {
    if (search && !v.name.toLowerCase().includes(search.toLowerCase()) && !v.category.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && v.manualStatus !== statusFilter) return false;
    if (billingFilter !== 'all' && v.billingType !== billingFilter) return false;
    if (currencyFilter !== 'all' && v.currency !== currencyFilter) return false;
    return true;
  });

  const today = new Date();
  const monthlyPayables = vendors.filter((v) => v.billingType === 'recurring' && v.manualStatus !== 'inactive').reduce((s, v) => s + (v.amount ?? 0), 0);
  const activeCount = vendors.filter((v) => v.manualStatus !== 'inactive').length;
  const expiringCount = vendors.filter((v) => {
    if (!v.agreementEnd) return false;
    const daysLeft = (new Date(v.agreementEnd).getTime() - today.getTime()) / 86_400_000;
    return daysLeft <= 30;
  }).length;
  const irregularCount = vendors.filter((v) => v.billingType === 'variable').length;

  const addVendor = async (f: VendorFormData) => {
    setMutErr('');
    try {
      await mut.mutateAsync({
        action: 'create',
        vendor: { ...f, amount: parseFloat(f.amount) || 0 },
      });
      setShowAdd(false);
    } catch (err) {
      setMutErr(err instanceof Error ? err.message : 'Failed to save.');
    }
  };

  const updateVendor = async (entityId: string, f: VendorFormData) => {
    setMutErr('');
    try {
      await mut.mutateAsync({
        action: 'update',
        vendor: { ...f, amount: parseFloat(f.amount) || 0, entityId },
      });
      setEditingId(null);
    } catch (err) {
      setMutErr(err instanceof Error ? err.message : 'Failed to save.');
    }
  };

  const deleteVendor = async (vendorId: string) => {
    setMutErr('');
    try {
      await mut.mutateAsync({ action: 'delete', vendorId });
    } catch (err) {
      setMutErr(err instanceof Error ? err.message : 'Failed to delete.');
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Finance"
        title="Vendors"
        sub="Services and tools we pay for."
        actions={
          isAdmin ? (
            <Button icon={showAdd ? 'X' : 'Plus'} variant={showAdd ? 'ghost' : 'primary'} size="sm" onClick={() => { setShowAdd((s) => !s); setEditingId(null); }}>
              {showAdd ? 'Cancel' : 'Add vendor'}
            </Button>
          ) : undefined
        }
      />

      <div className="stats">
        <Stat label="Monthly payables" icon="DollarSign" value={`NPR ${monthlyPayables.toLocaleString()}`} meta="recurring vendors only" />
        <Stat label="Active vendors" icon="CheckCircle2" value={String(activeCount)} meta="including expiring soon" />
        <Stat label="Expiring / expired" icon="AlertCircle" value={String(expiringCount)} meta="needs attention" />
        <Stat label="Irregular vendors" icon="Activity" value={String(irregularCount)} meta="variable / unscheduled" />
      </div>

      <Card pad={false}>
        {isAdmin && showAdd && (
          <div style={{ padding: '12px 16px 0' }}>
            <VendorForm onSave={addVendor} onCancel={() => setShowAdd(false)} isPending={mut.isPending} err={showAdd ? mutErr : ''} />
          </div>
        )}

        <div className="filter-bar">
          <div className="field">
            <label className="field-label">Search</label>
            <div className="inp-group">
              <span className="inp-ico"><Icon name="Search" size={14} /></span>
              <input className="inp" placeholder="Name or category…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Status</label>
            <select className="inp" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label">Billing</label>
            <select className="inp" value={billingFilter} onChange={(e) => setBillingFilter(e.target.value)}>
              <option value="all">All types</option>
              <option value="recurring">Recurring</option>
              <option value="one-time">One-time</option>
              <option value="variable">Variable</option>
            </select>
          </div>
          <div className="field">
            <label className="field-label">Currency</label>
            <select className="inp" value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)}>
              <option value="all">All currencies</option>
              <option value="USD">USD</option>
              <option value="NPR">NPR</option>
              <option value="INR">INR</option>
            </select>
          </div>
        </div>

        {isLoading && <p style={{ padding: 24, color: 'var(--ink-3)', fontSize: 13 }}>Loading vendors…</p>}
        {error && <p style={{ padding: 24, color: 'var(--danger)', fontSize: 13 }}>{error instanceof Error ? error.message : 'Failed to load vendors.'}</p>}

        {!isLoading && !error && filtered.length === 0 && (
          <EmptyState
            icon="PackageOpen"
            title="No vendors yet"
            description="Track the services and tools your company pays for. Add your first vendor to see monthly payables and renewal alerts here."
            actions={isAdmin ? <Button variant="primary" size="sm" icon="Plus" onClick={() => setShowAdd(true)}>Add your first vendor</Button> : undefined}
          />
        )}

        {!isLoading && !error && filtered.length > 0 && (
          <>
            {mutErr && !showAdd && <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--danger)' }}>{mutErr}</div>}
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Billing</th>
                  <th className="num">Amount</th>
                  <th>Agreement end</th>
                  <th>Status</th>
                  {isAdmin && <th style={{ width: 120 }}></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <React.Fragment key={v.entityId}>
                    <tr>
                      <td className="strong">{v.name}</td>
                      <td style={{ color: 'var(--ink-4)', fontSize: 13 }}>{v.category}</td>
                      <td style={{ fontSize: 13 }}>{v.billingType}</td>
                      <td className="num mono">{v.currency} {v.amount?.toLocaleString()}</td>
                      <td style={{ fontSize: 13 }}>{v.agreementEnd ?? '—'}</td>
                      <td>
                        <Badge tone={vendorStatusTone(v) === ('err' as never) ? 'err' : vendorStatusTone(v)}>
                          {v.manualStatus}
                        </Badge>
                      </td>
                      {isAdmin && (
                        <td>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <Button size="xs" variant="ghost" icon="Pencil" onClick={() => { setEditingId(v.entityId); setShowAdd(false); setMutErr(''); }}>Edit</Button>
                            <Button size="xs" variant="danger" icon="Trash2" onClick={() => void deleteVendor(v.entityId)} disabled={mut.isPending}>Delete</Button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {isAdmin && editingId === v.entityId && (
                      <tr>
                        <td colSpan={isAdmin ? 7 : 6} style={{ padding: '0 16px 12px' }}>
                          <VendorForm
                            initial={vendorToForm(v)}
                            onSave={(f) => void updateVendor(v.entityId, f)}
                            onCancel={() => { setEditingId(null); setMutErr(''); }}
                            isPending={mut.isPending}
                            err={editingId === v.entityId ? mutErr : ''}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>
    </div>
  );
}
```

**Note on status badge:** `vendorStatusTone` returns `'ok'`, `'muted'`, `'warn'`, or the string `'err'` (expired case). Since `Badge` `tone` doesn't accept `'danger'`, use `'err'`. The function signature should return `'ok' | 'muted' | 'warn' | 'err'` — update the return type annotation accordingly:

```typescript
function vendorStatusTone(v: Vendor): 'ok' | 'muted' | 'warn' | 'err' {
  if (v.manualStatus === 'inactive') return 'muted';
  if (v.agreementEnd) {
    const end = new Date(v.agreementEnd);
    const today = new Date();
    const daysLeft = (end.getTime() - today.getTime()) / 86_400_000;
    if (daysLeft < 0) return 'err';
    if (daysLeft <= 30) return 'warn';
  }
  return 'ok';
}
```

And in the JSX, use directly (the `as never` cast in Step 1's code above should be replaced with the corrected return type):

```tsx
<Badge tone={vendorStatusTone(v)}>
  {v.manualStatus}
</Badge>
```

- [ ] **Step 2: Verify TypeScript compiles**

```powershell
cd frontend; npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/app/VendorsScreen.tsx
git commit -m "feat(frontend): wire VendorsScreen — full CRUD against /finance/vendors"
```

---

## Task 6 — Wire `CustomersScreen.tsx`

**Files:**
- Rewrite: `frontend/src/pages/app/CustomersScreen.tsx`

Same structural pattern as VendorsScreen but with customer-specific fields.

- [ ] **Step 1: Replace CustomersScreen.tsx entirely**

```typescript
import React, { useState } from 'react';
import { Badge, Button, Card, EmptyState, Icon, PageHeader, Stat } from '@/components/ui';
import { useCustomers, useCustomerMutation } from '@/lib/queries/finance';
import { getRole } from '@/lib/auth';
import type { Customer } from '@/types/api';

type CustomerFormData = {
  name: string;
  type: 'Business' | 'Individual';
  currency: 'USD' | 'NPR' | 'INR';
  contractValue: string;
  outstandingAmount: string;
  nextDueDate: string;
  agreementEnd: string;
  notes: string;
};

function blankCustomer(): CustomerFormData {
  return { name: '', type: 'Business', currency: 'USD', contractValue: '', outstandingAmount: '', nextDueDate: '', agreementEnd: '', notes: '' };
}

function customerToForm(c: Customer): CustomerFormData {
  return {
    name: c.name,
    type: c.type,
    currency: c.currency,
    contractValue: c.contractValue != null ? String(c.contractValue) : '',
    outstandingAmount: c.outstandingAmount != null ? String(c.outstandingAmount) : '',
    nextDueDate: c.nextDueDate ?? '',
    agreementEnd: c.agreementEnd ?? '',
    notes: c.notes ?? '',
  };
}

function CustomerForm({
  initial,
  onSave,
  onCancel,
  isPending,
  err,
}: {
  initial?: CustomerFormData;
  onSave: (f: CustomerFormData) => void;
  onCancel: () => void;
  isPending: boolean;
  err: string;
}) {
  const [f, setF] = useState<CustomerFormData>(initial ?? blankCustomer());
  const set = (k: keyof CustomerFormData, v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--line)', borderRadius: 'var(--r)', padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
        <div className="field">
          <label className="field-label">Name *</label>
          <input className="inp" value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Acme Corp" />
        </div>
        <div className="field">
          <label className="field-label">Type</label>
          <select className="inp" value={f.type} onChange={(e) => set('type', e.target.value as 'Business' | 'Individual')}>
            <option value="Business">Business</option>
            <option value="Individual">Individual</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label">Currency</label>
          <select className="inp" value={f.currency} onChange={(e) => set('currency', e.target.value as CustomerFormData['currency'])}>
            <option value="USD">USD</option>
            <option value="NPR">NPR</option>
            <option value="INR">INR</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label">Contract value</label>
          <input className="inp" type="number" min={0} step={0.01} value={f.contractValue} onChange={(e) => set('contractValue', e.target.value)} placeholder="0" />
        </div>
        <div className="field">
          <label className="field-label">Outstanding amount</label>
          <input className="inp" type="number" min={0} step={0.01} value={f.outstandingAmount} onChange={(e) => set('outstandingAmount', e.target.value)} placeholder="0" />
        </div>
        <div className="field">
          <label className="field-label">Next payment due</label>
          <input className="inp" type="date" value={f.nextDueDate} onChange={(e) => set('nextDueDate', e.target.value)} />
        </div>
        <div className="field">
          <label className="field-label">Agreement end date</label>
          <input className="inp" type="date" value={f.agreementEnd} onChange={(e) => set('agreementEnd', e.target.value)} />
        </div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label className="field-label">Notes</label>
          <input className="inp" value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Optional notes" />
        </div>
      </div>
      {err && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 8 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <Button size="xs" variant="primary" onClick={() => onSave(f)} disabled={isPending || !f.name.trim()}>
          {isPending ? 'Saving…' : 'Save customer'}
        </Button>
        <Button size="xs" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export default function CustomersScreen() {
  const role = getRole();
  const isAdmin = role === 'admin';
  const { data, isLoading, error } = useCustomers();
  const mut = useCustomerMutation();

  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mutErr, setMutErr] = useState('');

  const customers = data?.items ?? [];

  const filtered = customers.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase())
  );

  const today = new Date();
  const activeCount = customers.length;
  const totalContract = customers.reduce((s, c) => s + (c.contractValue ?? 0), 0);
  const totalOutstanding = customers.reduce((s, c) => s + (c.outstandingAmount ?? 0), 0);
  const expiring30 = customers.filter((c) => {
    if (!c.agreementEnd) return false;
    const daysLeft = (new Date(c.agreementEnd).getTime() - today.getTime()) / 86_400_000;
    return daysLeft >= 0 && daysLeft <= 30;
  }).length;

  const addCustomer = async (f: CustomerFormData) => {
    setMutErr('');
    try {
      await mut.mutateAsync({
        action: 'create',
        customer: {
          ...f,
          contractValue: parseFloat(f.contractValue) || 0,
          outstandingAmount: parseFloat(f.outstandingAmount) || 0,
        },
      });
      setShowAdd(false);
    } catch (err) {
      setMutErr(err instanceof Error ? err.message : 'Failed to save.');
    }
  };

  const updateCustomer = async (entityId: string, f: CustomerFormData) => {
    setMutErr('');
    try {
      await mut.mutateAsync({
        action: 'update',
        customer: {
          ...f,
          contractValue: parseFloat(f.contractValue) || 0,
          outstandingAmount: parseFloat(f.outstandingAmount) || 0,
          entityId,
        },
      });
      setEditingId(null);
    } catch (err) {
      setMutErr(err instanceof Error ? err.message : 'Failed to save.');
    }
  };

  const deleteCustomer = async (customerId: string) => {
    setMutErr('');
    try {
      await mut.mutateAsync({ action: 'delete', customerId });
    } catch (err) {
      setMutErr(err instanceof Error ? err.message : 'Failed to delete.');
    }
  };

  return (
    <div className="page">
      <PageHeader
        eyebrow="Finance"
        title="Customers"
        sub="Clients, contracts, and billing relationships."
        actions={
          isAdmin ? (
            <Button icon={showAdd ? 'X' : 'Plus'} variant={showAdd ? 'ghost' : 'primary'} size="sm" onClick={() => { setShowAdd((s) => !s); setEditingId(null); }}>
              {showAdd ? 'Cancel' : 'Add customer'}
            </Button>
          ) : undefined
        }
      />

      <div className="stats">
        <Stat label="Active customers" icon="Users" value={String(activeCount)} meta="signed & billable" />
        <Stat label="Contract value" icon="FileText" value={`NPR ${totalContract.toLocaleString()}`} meta="total booked" />
        <Stat label="Outstanding" icon="Clock" value={`NPR ${totalOutstanding.toLocaleString()}`} meta="invoices pending" />
        <Stat label="Expiring · 30d" icon="AlertCircle" value={String(expiring30)} meta="needs renewal" />
      </div>

      <Card pad={false}>
        {isAdmin && showAdd && (
          <div style={{ padding: '12px 16px 0' }}>
            <CustomerForm onSave={addCustomer} onCancel={() => setShowAdd(false)} isPending={mut.isPending} err={showAdd ? mutErr : ''} />
          </div>
        )}

        <div className="filter-bar">
          <div className="field">
            <label className="field-label">Search</label>
            <div className="inp-group">
              <span className="inp-ico"><Icon name="Search" size={14} /></span>
              <input className="inp" placeholder="Customer name…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </div>

        {isLoading && <p style={{ padding: 24, color: 'var(--ink-3)', fontSize: 13 }}>Loading customers…</p>}
        {error && <p style={{ padding: 24, color: 'var(--danger)', fontSize: 13 }}>{error instanceof Error ? error.message : 'Failed to load customers.'}</p>}

        {!isLoading && !error && filtered.length === 0 && (
          <EmptyState
            icon="Users"
            title="No customers yet"
            description="Track clients and contracts here. Contract value, payment milestones, and renewal alerts appear once you add your first customer."
            actions={isAdmin ? <Button variant="primary" size="sm" icon="Plus" onClick={() => setShowAdd(true)}>Add your first customer</Button> : undefined}
          />
        )}

        {!isLoading && !error && filtered.length > 0 && (
          <>
            {mutErr && !showAdd && <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--danger)' }}>{mutErr}</div>}
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th className="num">Contract value</th>
                  <th className="num">Outstanding</th>
                  <th>Next due</th>
                  <th>Agreement end</th>
                  {isAdmin && <th style={{ width: 120 }}></th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <React.Fragment key={c.entityId}>
                    <tr>
                      <td className="strong">{c.name}</td>
                      <td>
                        <Badge tone="muted">{c.type}</Badge>
                      </td>
                      <td className="num mono">{c.currency} {c.contractValue?.toLocaleString()}</td>
                      <td className="num mono" style={{ color: (c.outstandingAmount ?? 0) > 0 ? 'var(--warn)' : undefined }}>
                        {c.currency} {c.outstandingAmount?.toLocaleString() ?? '0'}
                      </td>
                      <td style={{ fontSize: 13 }}>{c.nextDueDate ?? '—'}</td>
                      <td style={{ fontSize: 13 }}>{c.agreementEnd ?? '—'}</td>
                      {isAdmin && (
                        <td>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                            <Button size="xs" variant="ghost" icon="Pencil" onClick={() => { setEditingId(c.entityId); setShowAdd(false); setMutErr(''); }}>Edit</Button>
                            <Button size="xs" variant="danger" icon="Trash2" onClick={() => void deleteCustomer(c.entityId)} disabled={mut.isPending}>Delete</Button>
                          </div>
                        </td>
                      )}
                    </tr>
                    {isAdmin && editingId === c.entityId && (
                      <tr>
                        <td colSpan={isAdmin ? 7 : 6} style={{ padding: '0 16px 12px' }}>
                          <CustomerForm
                            initial={customerToForm(c)}
                            onSave={(f) => void updateCustomer(c.entityId, f)}
                            onCancel={() => { setEditingId(null); setMutErr(''); }}
                            isPending={mut.isPending}
                            err={editingId === c.entityId ? mutErr : ''}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```powershell
cd frontend; npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/app/CustomersScreen.tsx
git commit -m "feat(frontend): wire CustomersScreen — full CRUD against /finance/customers"
```

---

## Task 7 — Final verification

- [ ] **Step 1: Confirm no mockData imports remain in app screens**

```powershell
Select-String -Path frontend/src/pages -Recurse -Pattern "mockData"
```

Expected: zero matches.

- [ ] **Step 2: Full TypeScript check**

```powershell
cd frontend; npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Build passes**

```powershell
cd frontend; npm run build
```

Expected: build succeeds with no errors (warnings are OK).

- [ ] **Step 4: Final commit if anything unstaged**

```bash
git status
# If clean, nothing to do. Otherwise:
git add -A
git commit -m "chore(frontend): finance module wiring complete"
```

---

## Summary of Changes

| File | What changed |
|------|-------------|
| `frontend/src/types/api.ts` | Added `Vendor`, `Customer`, `FinanceSettings`, `FinanceAlert` + response types |
| `frontend/src/lib/queries/finance.ts` | New file — 6 TanStack Query hooks for all `/finance/*` endpoints |
| `frontend/src/pages/app/AlertsScreen.tsx` | Wired to `useFinanceAlerts()`, renders alert table or empty state |
| `frontend/src/pages/app/FinSettingsScreen.tsx` | Removed `ACCOUNTS` mock, wired to `useFinanceSettings()` + `useAccounts()`, Save and Apply buttons live |
| `frontend/src/pages/app/VendorsScreen.tsx` | Full CRUD: live stats, client-side filters, inline add form, per-row edit/delete (admin only) |
| `frontend/src/pages/app/CustomersScreen.tsx` | Full CRUD: same pattern as Vendors with customer fields |
