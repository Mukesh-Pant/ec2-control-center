# Finance Module Full-Stack Wiring — Design Spec

**Date:** 2026-05-08  
**Author:** Mukesh  
**Status:** Approved

---

## Overview

Wire the Finance module (Vendors, Customers, Alerts, Fin Settings) end-to-end. All 4 screens currently have UI shells with zero backend connectivity; `FinSettingsScreen` also uses mock ACCOUNTS data that must be replaced with the real `/accounts` API.

---

## Scope

- New Lambda module: `finance.py`
- New DynamoDB table: `ec2-control-finance-{env}`
- New API Gateway routes: `/finance/vendors`, `/finance/customers`, `/finance/alerts`, `/finance/settings`
- New React hooks: `useVendors`, `useCustomers`, `useFinanceAlerts`, `useFinanceSettings`
- Updated screens: VendorsScreen, CustomersScreen, AlertsScreen, FinSettingsScreen
- CloudFormation: `central-stack.yaml` additions for table + routes

---

## Data Layer

### Table: `ec2-control-finance-{env}`

| Attribute | Type | Description |
|-----------|------|-------------|
| `entityType` | String (PK) | `VENDOR`, `CUSTOMER`, `SETTINGS` |
| `entityId` | String (SK) | UUID for records; `global` for settings singleton |

**Vendor item fields:**
- `vendorId` — UUID (same as entityId)
- `name` — String
- `category` — String (e.g. "Software", "Infrastructure", "Services", "Consulting")
- `status` — String: `active` | `inactive` | `expired`
- `billingType` — String: `recurring` | `one-time` | `variable`
- `currency` — String: `USD` | `NPR` | `INR`
- `amount` — Number (monthly for recurring; total for one-time; 0 for variable)
- `renewalDate` — String ISO date (optional, for recurring vendors)
- `notes` — String (optional)
- `createdAt` — String ISO timestamp
- `updatedAt` — String ISO timestamp

**Customer item fields:**
- `customerId` — UUID (same as entityId)
- `name` — String
- `type` — String: `Business` | `Individual`
- `status` — String: `active` | `inactive`
- `currency` — String: `USD` | `NPR` | `INR`
- `contractValue` — Number
- `outstandingAmount` — Number
- `contractExpiry` — String ISO date (optional)
- `notes` — String (optional)
- `createdAt` — String ISO timestamp
- `updatedAt` — String ISO timestamp

**Settings item** (`entityType=SETTINGS`, `entityId=global`):
- `exchangeRates` — Map: `{ USD_NPR: Number, INR_NPR: Number }`
- `contractExpiryWarningDays` — Number (default: 30)
- `paymentDueWarningDays` — Number (default: 7)
- `defaultCurrency` — String: `USD` | `NPR` | `INR`
- `accountTaxSettings` — Map: `{ [accountId]: { wht: Number, vat: Number, margin: Number, rebate: Number } }`
- `updatedAt` — String ISO timestamp

---

## API Design

### New Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /finance/vendors | All roles | List all vendors |
| POST | /finance/vendors | Admin only | `action: add \| update \| delete` |
| GET | /finance/customers | All roles | List all customers |
| POST | /finance/customers | Admin only | `action: add \| update \| delete` |
| GET | /finance/alerts | All roles | Auto-computed alert list |
| GET | /finance/settings | All roles | Full settings object (with default if not set) |
| POST | /finance/settings | Admin only | Save full settings object |

### Lambda: `finance.py`

**`handle_finance_vendors_list(event)`** — GET /finance/vendors
- Queries table with `entityType=VENDOR`
- Returns all vendor items, sorted by `name`

**`handle_finance_vendors_mutation(event)`** — POST /finance/vendors
- Requires admin (`require_admin`)
- `action: add` → generate UUID, write item, return item
- `action: update` → update item by `vendorId`, return updated item
- `action: delete` → delete item by `vendorId`

**`handle_finance_customers_list(event)`** — GET /finance/customers
- Queries table with `entityType=CUSTOMER`
- Returns all customer items, sorted by `name`

**`handle_finance_customers_mutation(event)`** — POST /finance/customers
- Requires admin (`require_admin`)
- `action: add` → generate UUID, write item, return item
- `action: update` → update item by `customerId`, return updated item
- `action: delete` → delete item by `customerId`

**`handle_finance_alerts(event)`** — GET /finance/alerts
- Reads settings to get `contractExpiryWarningDays` and `paymentDueWarningDays`
- Scans all VENDOR records: flag any with `renewalDate` within warning window or `status=expired`
- Scans all CUSTOMER records: flag any with `contractExpiry` within 30 days, `outstandingAmount > 0`
- Returns sorted list of alert objects: `{ id, type, severity, message, entityId, entityType, date }`
- Severity: `error` for expired/overdue, `warning` for expiring soon

**`handle_finance_settings_get(event)`** — GET /finance/settings
- Gets SETTINGS/global item; if not found, returns safe defaults

**`handle_finance_settings_save(event)`** — POST /finance/settings
- Requires admin (`require_admin`)
- Full-replace write to SETTINGS/global

**`index.py` routing additions:**
```python
elif path.startswith('/finance/vendors'):
    if method == 'GET': return finance.handle_finance_vendors_list(event)
    if method == 'POST': return finance.handle_finance_vendors_mutation(event)
elif path.startswith('/finance/customers'):
    if method == 'GET': return finance.handle_finance_customers_list(event)
    if method == 'POST': return finance.handle_finance_customers_mutation(event)
elif path == '/finance/alerts':
    return finance.handle_finance_alerts(event)
elif path == '/finance/settings':
    if method == 'GET': return finance.handle_finance_settings_get(event)
    if method == 'POST': return finance.handle_finance_settings_save(event)
```

---

## Frontend Design

### New Hooks (`frontend/src/hooks/`)

**`useVendors.ts`**
```typescript
useVendors()           // GET /finance/vendors → queryKey: ['finance-vendors']
useVendorMutation()    // POST /finance/vendors, invalidates ['finance-vendors']
```

**`useCustomers.ts`**
```typescript
useCustomers()         // GET /finance/customers → queryKey: ['finance-customers']
useCustomerMutation()  // POST /finance/customers, invalidates ['finance-customers']
```

**`useFinanceAlerts.ts`**
```typescript
useFinanceAlerts()     // GET /finance/alerts → queryKey: ['finance-alerts']
```

**`useFinanceSettings.ts`**
```typescript
useFinanceSettings()        // GET /finance/settings → queryKey: ['finance-settings']
useFinanceSettingsMutation() // POST /finance/settings, invalidates ['finance-settings']
```

### Screen Changes

**`VendorsScreen.tsx`**
- Replace hardcoded zero stats with computed values from `useVendors()` data
- Wire filter controls (search, status, billing type, currency) against in-memory vendor list
- "Add vendor" button → toggle inline add form above the table
- Vendor rows in a table with Edit / Delete actions (admin only)
- Edit: inline edit row replaces the data row (same pattern as LabSettingsScreen template editing)
- Delete: confirm inline (no browser confirm dialog), then mutation
- Status badges: `active`→`ok`, `inactive`→`muted`, `expired`→`err`

**`CustomersScreen.tsx`**
- Same pattern as Vendors with customer-specific fields
- Stats computed from `useCustomers()` data

**`AlertsScreen.tsx`**
- Replace empty state with `useFinanceAlerts()` data
- Render each alert as a row: icon (severity), message, entity name, date
- If no alerts: keep "Nothing needs your attention" empty state
- Read-only (no write actions)

**`FinSettingsScreen.tsx`**
- Replace `import { ACCOUNTS } from '@/features/app/mockData'` with `useAccounts()` hook (already exists)
- Replace hardcoded form defaults with `useFinanceSettings()` data
- Wire "Save settings" button to `useFinanceSettingsMutation()`
- Per-account tax "Apply" buttons: optimistically update `accountTaxSettings` map and call save mutation

### Add/Edit UI Pattern
Inline panels (no `<Modal>` component) consistent with LabSettingsScreen:
- Add form: appears above the table when "Add vendor/customer" is clicked, dismissed on cancel or success
- Edit form: appears as an extra row below the target row (same as template editing in LabSettingsScreen)
- All `useState` hooks declared before any RBAC/conditional returns

---

## CloudFormation Changes (`central-stack.yaml`)

1. **New DynamoDB table resource**: `FinanceTable` — `ec2-control-finance-{Environment}`, PAY_PER_REQUEST, PK=`entityType` String, SK=`entityId` String

2. **Lambda env var**: `FINANCE_TABLE_NAME: !Sub ec2-control-finance-${Environment}`

3. **New API Gateway resources**: `/finance`, `/finance/vendors`, `/finance/customers`, `/finance/alerts`, `/finance/settings` — each with GET/POST methods (as applicable) and OPTIONS mock for CORS

4. **New API deployment**: bump deployment `Description` to force a snapshot refresh

---

## RBAC Summary

| Action | Admins | Operators | Viewers |
|--------|--------|-----------|---------|
| View Vendors/Customers/Alerts/Settings | ✅ | ✅ | ✅ |
| Add/Edit/Delete Vendors | ✅ | ❌ | ❌ |
| Add/Edit/Delete Customers | ✅ | ❌ | ❌ |
| Save Fin Settings | ✅ | ❌ | ❌ |

Frontend: hide Add/Edit/Delete buttons when `role !== 'admin'`. Backend: `require_admin` guard on all POST handlers.

---

## Error Handling

- All mutations: show inline error message on `ApiError` (no toast library needed — use existing error display pattern)
- GET queries: show skeleton loading (same as other screens) then error state if failed
- Settings save: optimistic UI not used; disable save button during mutation, re-enable on settle

---

## Files Changed

**New files:**
- `lambda/ec2_controller/finance.py`
- `frontend/src/hooks/useVendors.ts`
- `frontend/src/hooks/useCustomers.ts`
- `frontend/src/hooks/useFinanceAlerts.ts`
- `frontend/src/hooks/useFinanceSettings.ts`

**Modified files:**
- `lambda/ec2_controller/index.py` — add /finance/* routing
- `cloudformation/central-stack.yaml` — FinanceTable + env var + API routes
- `frontend/src/pages/app/finance/VendorsScreen.tsx`
- `frontend/src/pages/app/finance/CustomersScreen.tsx`
- `frontend/src/pages/app/finance/AlertsScreen.tsx`
- `frontend/src/pages/app/finance/FinSettingsScreen.tsx`

**Removed mock data usage:**
- `frontend/src/features/app/mockData.ts` — `ACCOUNTS` import removed from FinSettingsScreen (the only active usage)
