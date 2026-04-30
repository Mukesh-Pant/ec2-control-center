# Phase 6 — API Wiring & Auth UI Completion

**Date:** 2026-04-30
**Branch:** develop
**Project:** One Cloud Utopia EC2 Control Portal (React rewrite)

---

## Scope

Wire the Phase 1-5 React frontend to the real backend Lambda APIs. Replace all `mockData.ts` imports with live TanStack Query hooks. Complete the auth UI (signup, verify, forgot, reset, new-password, pending-approval). Set up a local Vite dev proxy so iteration doesn't require a full deploy cycle.

**Excluded from this phase:** Labs 4-step wizard + payment upload + admin approval (Phase 7), Console Login Firefox extension bridge (Phase 7).

**Screens staying static:** MyServers ("coming soon"), Customers, Vendors, Alerts, Finance Settings.

---

## Architecture

### Approach: TanStack Query + typed API client

TanStack Query v5 (already installed) handles caching, deduplication, and background refetch. A single `apiFetch<T>` wrapper in `src/lib/api.ts` owns auth headers and token refresh. Per-domain query hook files in `src/lib/queries/` expose typed `useQuery` / `useMutation` wrappers that each screen consumes.

This is preferred over raw `useEffect` fetching (no caching, repeated boilerplate) and Zustand server-state stores (wrong tool — Zustand is for client state).

---

## Section 1: API Layer

### `src/lib/api.ts`

Typed fetch wrapper. Single export: `apiFetch<T>(path, init?): Promise<T>`.

- Reads `CONFIG.API_URL` from `getConfig()` (`window.__APP_CONFIG__`)
- Attaches `Authorization: Bearer <id_token>` on every request
- **401 handling:** calls `refreshTokens()` → retries once → on second 401 calls `logout()` + redirects to `/login`
- **Non-2xx:** throws `ApiError extends Error` with `{ status: number, message: string }`
- **2xx:** returns `response.json()` cast to `T`

```ts
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T>
```

### `src/types/api.ts`

Typed interfaces matching actual Lambda JSON response shapes:

```ts
// EC2
interface Instance { instanceId, name, state, type, accountId, accountName, region, publicIp, privateIp, launchTime, platform }
interface InstancesResponse { instances: Instance[] }

// Accounts
interface Account { id, name, kind, region, roleArn, consoleRoleArn, status }

// Audit
interface AuditEntry { timestamp, instanceId, instanceName, userEmail, action, accountId, region, detail }
interface AuditResponse { items: AuditEntry[], lastKey?: string }

// Users
interface UserRecord { email, role, status, groups: string[], accounts: string[] }

// Backup
interface RecoveryPoint { arn, creationDate, status, backupSizeBytes, resourceArn }
interface BackupPlan { planId, planName, ruleName, scheduleExpression, startWindowMinutes }
interface BackupListResponse { recoveryPoints: RecoveryPoint[], backupPlans: BackupPlan[] }
```

### `src/lib/queries/`

Five files — one per API domain:

**`ec2.ts`**
- `useInstances()` — `useQuery({ queryKey: ['instances'], queryFn: () => apiFetch<InstancesResponse>('/ec2', { method:'POST', body: JSON.stringify({ action:'list' }) }) })`
- `useStartInstance()` — `useMutation` → `POST /ec2 { action:'start', instanceId, accountId, region }` → `invalidateQueries(['instances'])`
- `useStopInstance()` — same pattern with `action:'stop'`

**`audit.ts`**
- `useAuditLog(filters: AuditFilters)` — query key includes filters so any filter change re-fetches
- `useDailyBilling(instanceId?)` — `GET /audit/daily`

**`accounts.ts`**
- `useAccounts()` — `GET /accounts`
- `useAccountMutation()` — single mutation, `action` field routes: `add | update | enable | disable | remove | test`

**`users.ts`**
- `useUsers()` — `GET /users` (admin only — gated server-side)
- `useUserMutation()` — `action` field routes: `setrole | grantaccount | revokeaccount`

**`backup.ts`**
- `useBackupList(instanceId, accountId, region)` — `GET /backup?instanceId=...`
- `useBackupMutation()` — `action` field routes: `createbackup | createschedule | updateschedule | deleteschedule | restore | deleterecovery`

---

## Section 2: Local Dev Setup

### `vite.config.ts` additions

```ts
server: {
  proxy: {
    '/api': {
      target: 'https://u0bcgfkwec.execute-api.ap-south-1.amazonaws.com/prod',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ''),
    },
  },
},
```

Plus a `transformIndexHtml` hook that reads `VITE_*` env vars at dev-server startup and replaces `{ /*__INJECT__*/ }` with a populated CONFIG object — exactly mirroring what `config_injector` does at deploy time. Active only when `mode === 'development'`.

### `.env.local` (gitignored)

```
VITE_API_URL=/api
VITE_USER_POOL_ID=ap-south-1_p43GSdwV0
VITE_CLIENT_ID=4nhrk7k1q76k1hkllkfj79123h
VITE_COGNITO_DOMAIN=solobil-ec2-ctrl-dev
VITE_CENTRAL_ACCOUNT_ID=172030246614
VITE_ENVIRONMENT=development
VITE_MEMBER_ROLE_TEMPLATE_URL=
```

### `.env.local.example` (committed)

Same keys, empty values. Documents what a developer must create locally.

---

## Section 3: Auth UI Completion

All view states live inside the existing `LoginPage.tsx`. No new routes. The split-screen layout (brand panel left, form panel right) applies to every view.

### View state machine

```
login ──"Sign up"──────────→ signup ──submit──→ verify ──confirmed──→ login + toast
  │                                                │
  │                                            "Resend" loops back
  │
  └──"Forgot password?"──→ forgot ──code sent──→ reset ──confirmed──→ login + toast
  
login → (Cognito NEW_PASSWORD_REQUIRED challenge) → newpass ──changed──→ dashboard
login → (getRole() === 'none' after success) → pending ──logout──→ login
```

### Views

| View | Key inputs | Auth fn | On success |
|---|---|---|---|
| `signup` | email, password + strength meter | `signup()` | → `verify`, store email |
| `verify` | 6-digit code (email shown, locked) + Resend | `confirmSignup()` / `resendConfirmationCode()` | → `login` + toast |
| `forgot` | email | `forgotPassword()` | → `reset`, store email |
| `reset` | code, new password + strength meter | `confirmForgotPassword()` | → `login` + toast |
| `newpass` | new password + strength meter | `completeNewPassword()` | → dashboard |
| `pending` | info card only | `logout()` button | → `login` |

### Validation

`react-hook-form` + `zod` schemas (both installed). Password: min 8 chars, uppercase, lowercase, number, symbol — matches Cognito policy. Code: exactly 6 digits. Email: standard format.

### Error display

`friendlyAuthError(err)` from `src/lib/auth.ts` maps all Cognito error codes to human messages. Errors render inline under the relevant input — no `alert()`, no `confirm()`.

---

## Section 4: Screen Data Wiring

### Screens wired to API

| Screen | Query hook(s) | Mutations |
|---|---|---|
| Dashboard | `useInstances()` | `useStartInstance`, `useStopInstance` |
| Instances | `useInstances()` (cached — no extra call) | `useStartInstance`, `useStopInstance` |
| Audit | `useAuditLog(filters)` | Filter state → query params; pagination via `lastKey` cursor |
| Billing | `useDailyBilling()` | None |
| Analytics | `useInstances()` (cached) | None |
| Accounts | `useAccounts()` | `useAccountMutation` — test, add, enable, disable, remove |
| Users | `useUsers()` | `useUserMutation` — setrole, grantaccount, revokeaccount |
| Backups | `useBackupList(instanceId, accountId, region)` | `useBackupMutation` — createbackup, createschedule, updateschedule, deleteschedule, restore, deleterecovery |

### Screens staying static

| Screen | Reason |
|---|---|
| MyServers | Labs out of scope — shows "coming soon" card |
| Customers | No backend endpoint |
| Vendors | No backend endpoint |
| Alerts | No backend endpoint |
| Finance Settings | No backend endpoint — form stays but Save is not wired |

### RBAC gates in UI

- Start/Stop buttons: hidden when `getRole() === 'viewer'`
- Accounts + Users pages: hidden in sidebar for non-admins (already in `nav.ts`)
- User email filter on Audit: visible to admins only
- Grant/Revoke buttons on Users: visible to admins only
- All gates enforced server-side too — UI gates are UX only

### Backup screen rebuild

Phase 5 left Backups as an `EmptyState` placeholder. This phase rebuilds it with two panels:

1. **Instance selector** — dropdown populated from `useInstances()` cache (free)
2. **Recovery Points panel** — table of snapshots (ARN, date, status, size). Row actions: Restore (inline expand with instance type + subnet inputs) and Delete.
3. **Backup Schedules panel** — list of plans. Actions: Create (preset Daily/Weekly/Monthly + hour/minute picker → EventBridge cron), Edit, Delete.

Inline expand pattern (no modals) — matches legacy `backup.js` UX.

---

## Section 5: Commit Strategy

Six commits to `develop`, each auto-deployed and independently verifiable:

| # | Commit message | What ships |
|---|---|---|
| 1 | `feat(frontend): add API client, query hooks, and dev proxy` | `api.ts`, `queries/`, `types/api.ts`, `vite.config.ts`, `.env.local.example` |
| 2 | `feat(frontend): complete auth UI with all Cognito flow states` | `LoginPage.tsx` — signup, verify, forgot, reset, newpass, pending views |
| 3 | `feat(frontend): wire instances, dashboard, and analytics to real API` | 3 screens, drop mockData |
| 4 | `feat(frontend): wire audit and billing to real API` | Audit filters + pagination, Billing cost table |
| 5 | `feat(frontend): wire accounts and users to real API` | Account actions, role/grant management |
| 6 | `feat(frontend): rebuild and wire backup screen` | Full backup UI replacing Phase 5 placeholder |

### Deployment flow (per commit)

1. `npm run typecheck && npm run build` locally — must be clean before push
2. `git push origin develop`
3. GitHub Actions: `bash deploy.sh` → Vite build → zip `dist/` → CF update → `config_injector` injects CONFIG → CloudFront invalidation (~5-8 min)
4. Open `https://d1f7pmzpwdrl1i.cloudfront.net` to verify

### Final verification checklist

- [ ] Login with admin account
- [ ] Signup → email verify → login for a new test user
- [ ] Dashboard shows real fleet (instances, running count, cost)
- [ ] Instances: Start/Stop a real instance, state updates
- [ ] Audit: filter by action, results are real log entries
- [ ] Billing: real cost figures appear
- [ ] Accounts: Test button returns real latency; Disable/Enable persists
- [ ] Users: Role change persists after page refresh
- [ ] Backup: recovery points list for a real instance; Create backup works
