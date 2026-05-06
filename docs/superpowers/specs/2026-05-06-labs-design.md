# Labs / My Servers Screen — Design Spec

**Date:** 2026-05-06
**Feature:** M11 Labs — React frontend migration (MyServersScreen + LabSettingsScreen)
**Status:** Approved for implementation

---

## Overview

Migrate the existing vanilla-JS Labs feature to the React frontend. The feature has two surfaces:

- **My Servers** (`/app/my-servers`) — available to operators and admins; 4-step provisioning wizard + filterable lab list
- **Lab Settings** (`/app/lab-settings`) — admin-only; pricing configuration + template management

The backend Lambda (`labs.py`) already exists and is production-ready. The React frontend must wire up to it exactly.

---

## Section 1: Data Model & Query Hooks

### TypeScript interfaces (`src/types/api.ts` additions)

```typescript
export interface LabTemplate {
  templateId: string;
  name: string;
  platform: 'ubuntu' | 'windows';
  instanceType: string;
  storageGb: number;
  hoursPerDay: number;
  months: number;
}

export interface Lab {
  labId: string;
  status: 'pending_approval' | 'provisioning' | 'running' | 'stopped' | 'terminated' | 'rejected';
  callerEmail: string;
  accountId: string;
  region: string;
  instanceType: string;
  platform: 'ubuntu' | 'windows';
  storageGb: number;
  hoursPerDay: number;
  months: number;
  durationHours: number;
  estimatedCostUsd: number;
  instanceId?: string;
  publicIp?: string;
  allocationId?: string;
  keyName?: string;
  expiresAt?: string;
  paymentKey?: string;
  subnetId?: string;
  securityGroupIds?: string;  // JSON-serialised string from backend
  createdAt?: string;
}

export interface LabsListResponse {
  labs: Lab[];
}

export interface LabPricingParams {
  instanceType: string;
  region: string;
  storageGb: number;
  hoursPerDay: number;
  months: number;
}

export interface LabPricingResponse {
  baseHourlyUsd: number;
  totalComputeUsd: number;
  totalStorageUsd: number;
  whtPercent: number;
  vatPercent: number;
  marginPercent: number;
  discountPercent: number;
  currencyRate: number;
  currencySymbol: string;
  finalAmountLocal: number;
}

export interface LabNetworkOption {
  subnetId: string;
  vpcId: string;
  availabilityZone: string;
  isDefault: boolean;
}

export interface LabNetworkOptions {
  subnets: LabNetworkOption[];
  securityGroupIds: string[];
}

export interface LabSettings {
  whtPercent: number;
  vatPercent: number;
  marginPercent: number;
  discountPercent: number;
  currencyRate: number;
  currencySymbol: string;
  templates: LabTemplate[];
}

export interface LabMutationResponse {
  message: string;
  labId?: string;
}

export interface LabPaymentUploadResponse {
  uploadUrl: string;
  s3Key: string;
}

export interface LabKeypairResponse {
  downloadUrl: string;
}

export interface LabWindowsPasswordResponse {
  password: string;
}

export interface LabPaymentViewResponse {
  downloadUrl: string;
}
```

### API functions (`src/lib/api.ts` additions)

```typescript
getLabsList(): Promise<LabsListResponse>                        // GET /labs
provisionLab(body): Promise<LabMutationResponse>               // POST /labs
deleteLabInstance(labId): Promise<LabMutationResponse>         // DELETE /labs
getLabPricing(params): Promise<LabPricingResponse>             // GET /labs/pricing
getLabNetworkOptions(accountId, region): Promise<LabNetworkOptions>  // GET /labs/network-options
uploadLabPayment(body): Promise<LabPaymentUploadResponse>      // POST /labs/payment
getLabPaymentView(labId): Promise<LabPaymentViewResponse>      // GET /labs/payment
getLabKeypair(labId): Promise<LabKeypairResponse>              // GET /labs/keypair
getLabWindowsPassword(labId): Promise<LabWindowsPasswordResponse>  // GET /labs/windows-password
getLabSettings(): Promise<LabSettings>                         // GET /labs/settings
updateLabSettings(body): Promise<LabMutationResponse>          // POST /labs/settings
```

### TanStack Query hooks (`src/lib/queries/labs.ts`)

- `useLabsList()` — `queryKey: ['labs']`; `refetchInterval` computed from data: `labs.some(l => l.status === 'provisioning') ? 15_000 : false`
- `useLabMutation()` — POST /labs; invalidates `['labs']` on success
- `useDeleteLab()` — DELETE /labs; invalidates `['labs']` on success
- `useLabPricing(params, enabled)` — GET /labs/pricing; `enabled` flag to defer until Step 2 is reached; `staleTime: 60_000`
- `useLabNetworkOptions(accountId, region)` — GET /labs/network-options; `staleTime: 300_000`
- `useLabSettings()` — GET /labs/settings; `staleTime: 60_000`
- `useLabSettingsMutation()` — POST /labs/settings; invalidates `['labSettings']` on success

---

## Section 2: MyServersScreen + LabWizard

### File structure

```
src/pages/app/MyServersScreen.tsx        — operator screen: toggle wizard / lab list
src/pages/app/labs/LabWizard.tsx         — 4-step wizard
src/pages/app/labs/LabList.tsx           — filterable table + auto-polling
src/pages/app/labs/LabRow.tsx            — single row + inline expand panel
src/pages/app/LabSettingsScreen.tsx      — admin-only pricing + template management
src/lib/queries/labs.ts                  — all TanStack Query hooks
src/lib/queries/labSettings.ts           — lab settings hooks
```

Routes and nav additions:
- `App.tsx`: add `<Route path="/app/my-servers" element={<MyServersScreen />} />` and `<Route path="/app/lab-settings" element={<LabSettingsScreen />} />`
- `src/lib/nav.ts`: add "My Servers" under a "Labs" group (visible to all authenticated users); add "Lab Settings" under "Administration" (admin only)

### MyServersScreen

Header: eyebrow "Labs", title "My Servers", sub "Provision and manage your EC2 lab instances."

Action button: "New Lab" (primary, Plus icon). Clicking it shows the `<LabWizard>` inline above the list (not a modal — renders as a card block). While the wizard is open the button changes to "Cancel" (ghost). Closing wizard (Cancel or Step 4 Submitted) collapses it back.

Body: `<LabList>` always rendered below (even while wizard is open). Loading and error states shown inside LabList.

### LabWizard (4 steps)

**Step 1 — Configure**

Template gallery: 2-column responsive grid of template cards. Each card shows name, platform icon, instance type, storage, duration. Clicking a card pre-fills the form below. "Start from scratch" link clears the selection.

Form fields (all with defaults):
- Platform: radio buttons — Linux (Ubuntu) / Windows
- Instance type: grouped `<select>` — families: Burstable (t3.*), General (m5.*), Compute (c5.*), Memory (r5.*). Each option label: `t3.micro — 2 vCPU · 1 GB RAM · Burstable`
- Storage (GB): number input; min 8 (Linux) / min 35 (Windows); max 500; auto-bumps to 35 on Windows select
- Hours per day: number input 1–24
- Duration (months): number input 1–36
- Live preview: "X hrs/day × Y months = Z hours total"

Account: `<select>` populated from `useAccounts()`. Defaults to first account. Region: hardcoded `ap-south-1`.

Network: auto-selects default subnet + default security group from `useLabNetworkOptions(accountId, region)`. User sees "Default VPC / Default Subnet (auto-selected)" — no manual selection needed.

"Next: Review pricing →" button advances to Step 2.

**Step 2 — Pricing**

Fetches `useLabPricing(params)` with Step 1 values. Shows breakdown table:

| Line | Amount |
|------|--------|
| Compute (X hrs) | $Y.YY |
| Storage (Z GB × N months) | $Y.YY |
| Subtotal | $Y.YY |
| Margin (M%) | $Y.YY |
| WHT (W%) | $Y.YY |
| VAT (V%) | $Y.YY |
| Discount (D%) | −$Y.YY |
| **Total** | **{symbol} NNNN.NN** |

Below table: hint block with AWS Pricing Calculator link for independent verification.

"← Back" and "Next: Payment →" buttons.

**Step 3 — Review & Pay**

Summary card repeating key selections (platform, type, storage, duration, account).

Payment upload: file input accepting images (PNG/JPG). On file select, calls POST /labs/payment to get presigned upload URL, uploads the file via `fetch(uploadUrl, { method: 'PUT', body: file })`. Stores the returned `s3Key`.

"Submit request" button: calls POST /labs `{ action: 'submit', ...fields, paymentKey: s3Key }`. Disabled until file is uploaded.

On success: advance to Step 4.

**Step 4 — Submitted**

Full-width confirmation card: checkmark icon, "Request submitted!", "An admin will review your payment and provision your lab. You'll see it appear in the list below once approved." Two buttons: "View my labs" (scrolls to LabList, collapses wizard) and "Submit another" (resets to Step 1).

After Step 4, `_activeFilter` in LabList auto-switches to "Pending".

---

## Section 3: LabList + LabRow

### LabList

**Filter buckets** (3 pill-tabs, shown above filter bar):
- **Active** — `running` + `provisioning` — shows count badge
- **Pending** — `pending_approval` — shows count badge
- **History** — `terminated` + `rejected`

Default bucket: Active. Switching bucket collapses any open row.

**Filter bar** (below buckets, shown when bucket has > 0 results):
- Platform: All / Linux / Windows
- Instance Type: All + each unique type present in current bucket's results
- Status: All + each unique status in current bucket
- Account: All + accounts present in results (admin only shows account name + ID)
- Clear filters link: visible when any filter is active

**Table columns:** Chevron | Lab ID (short, `font-mono`) | Platform | Instance Type | Status badge | Account | Expires | (admin: Submitted By)

**Auto-polling:** `refetchInterval: labs.some(l => l.status === 'provisioning') ? 15_000 : false`. When a provisioning lab transitions to running, the row updates in place without losing expanded state (keyed by `labId`).

**Empty states:** per-bucket — "No active labs — provision one with New Lab", "No pending labs", "No lab history yet."

### LabRow

Clicking any row toggles an inline `<tr>` inserted immediately below it. Only one row open at a time; opening a new row collapses the previously open one.

**Expand panel zones:**

*Lab Info grid* (always shown):

| Field | Value |
|-------|-------|
| Lab ID | `labId` (monospace) |
| Instance ID | `instanceId` or — |
| Public IP | `publicIp` or — |
| Elastic IP | `publicIp` (allocationId in parentheses) or — |
| Platform | Linux / Windows |
| Instance Type | e.g. t3.micro |
| Storage | X GB |
| Estimated Cost | {symbol} NNNN.NN |
| Submitted By | `callerEmail` (admin only) |
| Expires | colored span (see below) |

Expiry colour: green if > 7 days remaining, yellow if ≤ 7 days, red if expired or absent.

*Status-dependent zone:*

- **`running`** — Connection section:
  - Linux: SSH command (`ssh -i keypair.pem ubuntu@{publicIp}`) with copy-to-clipboard button; "Download keypair (.pem)" button
  - Windows: Instructions + "Get Windows password" button (fetches and reveals inline); "Download .rdp file" button
  - Admin only: "Terminate lab" (danger, requires confirm step inside panel)

- **`provisioning`** — Pulsing "Provisioning your lab — auto-refreshing every 15 s…" message. Admin gets Terminate button.

- **`pending_approval`** — Admin: "View payment screenshot" (opens new tab) + "Approve" (accent) + "Reject" (danger, confirm step inline). Non-admin: "Awaiting admin approval — you'll be notified when it's ready."

- **`terminated` / `rejected`** — Lab Info grid only.

**Status badges** (using `<Badge>` component):
| Status | tone |
|--------|------|
| `pending_approval` | `warn` + dot |
| `provisioning` | `accent` + dot |
| `running` | `ok` + dot |
| `stopped` | `muted` + dot |
| `terminated` | `muted` |
| `rejected` | `danger` |

---

## Section 4: LabSettingsScreen (admin-only)

Route: `/app/lab-settings`. Redirects non-admins to `/app/my-servers`.

### Pricing Settings panel

Card with `<PageHeader eyebrow="Administration" title="Lab Settings">`.

Form fields:
| Field | Type | Constraints |
|-------|------|-------------|
| WHT % | number input | 0–100, step 0.01 |
| VAT % | number input | 0–100, step 0.01 |
| Margin % | number input | 0–200, step 0.01 |
| Discount % | number input | 0–100, step 0.01 |
| Currency rate (USD→local) | number input | step 0.0001, min 0 |
| Currency symbol | text input | max 5 chars |

Values loaded from `useLabSettings()`. "Save settings" button at the bottom. On success: inline success message "Settings saved." On error: inline error message. No toast — the form is the focus.

Backend: GET /labs/settings returns current config; POST /labs/settings `{ action: 'updatesettings', ...fields }` saves.

DynamoDB: `ec2-control-lab-settings-{environment}` table, single item PK `config`.

### Template Management panel

Separate card below Pricing Settings.

Table columns: Name | Platform | Instance Type | Storage | Duration | Actions (Edit / Delete).

"Add template" button (ghost, Plus icon): opens inline form below the table.
Editing a row: replaces the row's inline area with the same form pre-filled.

Template form fields: Name (text), Platform (radio), Instance Type (select, same groups as wizard), Storage GB (number), Hours/day (number), Months (number).

Save: POST /labs/settings `{ action: 'savetemplate', template: {...} }`.
Delete: POST /labs/settings `{ action: 'deletetemplate', templateId }` — requires confirm step inline.

Templates stored in the same DynamoDB settings item as a `templates: []` list. `GET /labs/settings` returns them alongside pricing config. The wizard Step 1 gallery reads from the same endpoint via `useLabSettings()`.

---

## Backend endpoints (existing, no changes required)

| Method | Path | Description |
|--------|------|-------------|
| GET | /labs | List labs |
| POST | /labs | action: submit / approve / reject |
| DELETE | /labs | Terminate lab instance |
| POST | /labs/payment | Get presigned S3 upload URL |
| GET | /labs/payment | Admin — presigned download URL |
| GET | /labs/keypair | Presigned download URL for .pem |
| GET | /labs/windows-password | RDP password |
| GET | /labs/pricing | On-demand pricing with tax/margin applied |
| GET | /labs/network-options | Default subnet + security groups |
| GET | /labs/settings | Pricing config + templates |
| POST | /labs/settings | action: updatesettings / savetemplate / deletetemplate |

---

## RBAC

| Role | My Servers | Wizard | LabList | Lab Settings |
|------|-----------|--------|---------|--------------|
| admin | ✅ | ✅ | ✅ (all labs, approve/reject/view-payment) | ✅ |
| operator | ✅ | ✅ | ✅ (own labs only) | ❌ redirect |
| viewer | ❌ redirect | ❌ | ❌ | ❌ redirect |
| none | ❌ redirect | ❌ | ❌ | ❌ redirect |

Redirect target for unauthorized access: `/app/instances`.

---

## Error handling

- Wizard Step 1→2 transition: if `useLabNetworkOptions` fails, show inline error "Could not load network options — try again" with Retry button. Do not block navigation.
- Wizard Step 2: if pricing fetch fails, show "Could not load pricing — check your connection" with Retry. Block "Next" until pricing resolves.
- Wizard Step 3 payment upload: if presigned URL fetch or PUT fails, show inline error. Do not advance to Step 4.
- LabList: standard loading/error states using `isLoading` / `error` from `useLabsList()`.
- All mutation errors: inline below the triggering button, red, 13px.

---

## Testing approach

- Unit: LabWizard step transitions, pricing calculation display, filter logic
- Integration: mutation hooks call correct endpoints with correct payloads
- Manual golden path: submit → pending → admin approve → provisioning → running → SSH connect info visible → terminate
