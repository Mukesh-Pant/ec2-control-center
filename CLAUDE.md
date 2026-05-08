# EC2 Control Portal — Claude Project Context

## Vision & Product

**EC2 Control** by **One Cloud Utopia** is a production SaaS web portal for managing EC2 instances
across multiple AWS accounts. Users sign up, log in via a custom-built auth page (Cognito SDK / SRP),
see all EC2 instances grouped by account and region, Start / Stop / check Status, view audit logs,
get idle auto-stop alerts, see billing insights, manage member AWS accounts, and self-provision
dedicated EC2 lab environments. The portal also includes a Finance module for OCU's own business
finances (Vendors, Customers, Alerts, FinSettings).

Frontend v2.0.0 is a full React 18 + TypeScript 5.6 + Vite 5 rewrite. Fully serverless, zero
infrastructure to manage.

**Live URL:** `https://app.onecloudutopia.com`
**Owner:** Mukesh | **Admin email:** pantm8877@gmail.com | **Region:** ap-south-1

---

## Milestones

| # | Feature | Status |
|---|---------|--------|
| M1 | Core platform — EC2 list/start/stop, Cognito auth, CloudFront CDN | ✅ LIVE |
| M2 | Audit logging — DynamoDB AuditLog, /audit + /audit/daily endpoints | ✅ LIVE |
| M3 | Scheduling | ⏭ SKIPPED |
| M4 | Idle auto-stop — CloudWatch CPU check every 15 min, SNS email alert | ✅ LIVE |
| M5 | Multi-account — Add/enable/disable/test/remove accounts from portal UI | ✅ LIVE |
| M6 | SaaS deployment — custom domain, ACM cert, Route 53 A ALIAS | ✅ LIVE |
| M7 | Custom auth page + self-signup + custom domain setup | ✅ LIVE |
| M8 | RBAC — Cognito groups, user-account assignments, /users admin panel | ✅ LIVE |
| M9 | Backup — AWS Backup service, on-demand + scheduled backups, restore, /backup endpoint | ✅ LIVE |
| M10 | Console Login — one-click AWS Console via STS federation + Firefox container tabs extension | ✅ LIVE |
| M11 | My Servers (Labs) — self-service EC2 lab provisioning, payment upload, pending-approval workflow, admin controls, Lab Settings | ✅ LIVE |
| M12 | Quick-Add Account — CloudFormation Quick-Create button in Add Account modal; public S3 template hosting; pre-filled params | ✅ LIVE |
| Perf | Performance — STS cred caching, boto3 singletons, skeleton loading, Lambda 512MB, CloudFront PriceClass_200 | ✅ LIVE |
| Arch | Frontend v2.0.0 — full React 18 + TypeScript 5.6 + Vite 5 rewrite; TanStack Query v5; Zustand 5; React Router v6 | ✅ LIVE |
| Finance | Finance module — Vendors, Customers, Alerts, FinSettings (OCU business finances) | ✅ LIVE |

**API:** REST API v1 (migrated from HTTP API v2) with COGNITO_USER_POOLS authorizer.

---

## AWS Accounts

### SaaS / Production — `976792586566` (primary)
- **Stack:** `ec2-control-production` (ap-south-1)
- **Portal URL:** `https://app.onecloudutopia.com`
- **Domain:** `app.onecloudutopia.com` (subdomain of `onecloudutopia.com`)
- **Hosted Zone (onecloudutopia.com):** `Z09322302BWL3NDKZIX2J`
- **ACM Cert (us-east-1):** Stack `ec2-control-acm-onecloudutopia` | `DomainName=app.onecloudutopia.com HostedZoneId=Z09322302BWL3NDKZIX2J`
- **Cognito Domain Prefix:** `solobil-ec2-ctrl-prod`
- **Code S3 Bucket:** `ec2-control-code-976792586566-ap-south-1`
- **AWS CLI Profile:** `solobil-prod`

### Dev / Staging — `172030246614` (ocu_dev)
- **Stack:** `ec2-control-development` (ap-south-1)
- **Portal URL:** `https://d1f7pmzpwdrl1i.cloudfront.net`
- **API URL:** `https://u0bcgfkwec.execute-api.ap-south-1.amazonaws.com/prod`
- **Cognito User Pool:** `ap-south-1_p43GSdwV0` | **Client:** `4nhrk7k1q76k1hkllkfj79123h`
- **Cognito Domain Prefix:** `solobil-ec2-ctrl-dev`
- **CloudFront Distribution:** `E3SX2BGVD0BKHU`
- **AWS CLI Profile:** `solobil-dev`
- **Deploy trigger:** GitHub Actions auto-deploys on every merge to `develop`

### Personal / Prototype — `196750375951` (retired — superseded by ocu_dev)
- **Portal URL:** `https://d3v0ebskiqqkg7.cloudfront.net`
- **AWS CLI Profile:** `default`
- No longer used for team dev; kept for reference only

**Prod table names:** `ec2-control-accounts-production`, `ec2-control-audit-production`, `ec2-control-user-accounts-production`, `ec2-control-labs-production`
**Dev table names:** `ec2-control-accounts-development`, `ec2-control-audit-development`, `ec2-control-user-accounts-development`, `ec2-control-labs-development`

---

## Project Structure

```
EC2-control-center/
├── deploy.sh                   ← One-command deploy (Git Bash)
├── deploy-config.env           ← Config values — never commit
├── example-deploy-config.env   ← Template for deploy-config.env
├── oculogo.png                 ← One Cloud Utopia logo (source)
├── cloudformation/
│   ├── central-stack.yaml      ← All AWS resources (M1–M12 + custom domain + auth + RBAC + Backup + Console Login + Labs)
│   ├── acm-cert-stack.yaml     ← ACM cert for custom domain (us-east-1, deploy ONCE)
│   └── member-role-stack.yaml  ← Cross-account IAM role (deploy in each member account)
├── lambda/
│   ├── ec2_controller/
│   │   ├── index.py            ← Main handler: /ec2, /accounts, /audit, /pricing, /users, /backup, /console-login, /labs routes
│   │   ├── accounts.py         ← Account registry + user-account assignment CRUD
│   │   ├── audit.py            ← Audit log read/write
│   │   ├── backup.py           ← AWS Backup: on-demand, schedule, restore, delete (M9)
│   │   ├── console_login.py    ← Console login: STS AssumeRole → Federation API → SigninToken URL (M10)
│   │   ├── labs.py             ← Labs: submit/approve/reject provisioning, key pair, EIP, payment view, pricing settings, templates (M11)
│   │   ├── pricing.py          ← EC2 on-demand pricing lookup
│   │   └── utils.py            ← CORS helpers, JWT claims, error mapping, RBAC helpers
│   ├── config_injector/
│   │   └── index.py            ← Custom resource: injects CONFIG, uploads frontend build, invalidates CDN
│   └── idle_checker/
│       └── index.py            ← CPU check, auto-stop, SNS alert
├── firefox-extension/
│   ├── manifest.json           ← MV3; matches app.onecloudutopia.com; permissions: contextualIdentities, cookies, tabs, storage
│   ├── background.js           ← Container tab manager: one named Firefox container per AWS account
│   ├── content.js              ← Sets window.wrappedJSObject.EC2CTRL_EXTENSION=true; bridges postMessage → background
│   └── icons/                  ← icon-48.png + icon-96.png
└── frontend/                   ← React 18 + TypeScript 5.6 + Vite 5 SPA (v2.0.0)
    ├── package.json            ← App dependencies; version 2.0.0
    ├── vite.config.ts          ← Vite 5 build config; path alias @/ → src/
    ├── tsconfig.json           ← TypeScript 5.6 strict mode
    ├── index.html              ← Vite SPA entry point (CONFIG auto-injected at deploy)
    └── src/
        ├── main.tsx            ← React 18 entry: createRoot + QueryClientProvider + RouterProvider
        ├── App.tsx             ← Root router: auth routes + app routes under <RequireAuth>
        ├── components/
        │   └── ui/             ← Shared UI primitives: Button, Badge, PageHeader, Modal, Spinner, etc.
        ├── features/
        │   └── app/
        │       ├── nav.ts      ← Navigation: 4 sections (Overview, Intelligence, Finance, Administration)
        │       └── mockData.ts ← Unused placeholder data (Finance module is now fully wired)
        ├── hooks/              ← TanStack Query hooks: useLabs, useLabSettings, useLabTemplates, etc.
        ├── lib/
        │   ├── api.ts          ← apiFetch<T> wrapper: Bearer JWT, ApiError on non-2xx, auto-refresh on 401
        │   └── auth.ts         ← Cognito SDK SRP wrapper: getRole, getToken, getEmail, refreshTokens, logout, restoreSession
        ├── pages/
        │   ├── auth/           ← Login, SignUp, VerifyEmail, ForgotPassword page components
        │   └── app/
        │       ├── DashboardScreen.tsx
        │       ├── InstancesScreen.tsx
        │       ├── BackupsScreen.tsx
        │       ├── MyServersScreen.tsx      ← "My Servers" tab (labs backend); RBAC guard + LabWizard + LabList
        │       ├── BillingScreen.tsx
        │       ├── AnalyticsScreen.tsx
        │       ├── AuditScreen.tsx
        │       ├── AccountsScreen.tsx
        │       ├── UsersScreen.tsx
        │       ├── LabSettingsScreen.tsx    ← Admin only: pricing settings panel + template management panel
        │       ├── finance/
        │       │   ├── VendorsScreen.tsx    ← OCU business finance — full CRUD (useVendors + useVendorMutation)
        │       │   ├── CustomersScreen.tsx  ← OCU business finance — full CRUD (useCustomers + useCustomerMutation)
        │       │   ├── AlertsScreen.tsx     ← OCU business finance — live alerts (useFinanceAlerts)
        │       │   └── FinSettingsScreen.tsx ← OCU business finance — live settings save (useFinanceSettings + useFinanceSettingsMutation)
        │       └── labs/
        │           ├── LabList.tsx          ← Filterable row-based table with inline expand panel
        │           ├── LabRow.tsx           ← Single row + inline detail panel rendering
        │           └── LabWizard.tsx        ← 4-step provisioning wizard (Configure → Pricing → Payment → Submitted)
        └── stores/
            ├── auth.ts         ← Zustand 5 auth store: email, role, isAuthenticated, isBooting, syncFromStorage, bootstrap, signOut
            └── tweaks.ts       ← Zustand 5 UI tweaks/preferences store
```

---

## Architecture

```
Browser → CloudFront → S3 (private — React build artifacts)
       ↓
       React 18 SPA (Vite build; TypeScript strict)
       ↓ Login page (React auth components)
       lib/auth.ts → amazon-cognito-identity-js → Cognito User Pool (SRP)
       ↓ JWT tokens stored in sessionStorage; synced to Zustand auth store
       lib/api.ts → apiFetch<T> → Bearer JWT on every request
       ↓
       REST API Gateway (v1, REGIONAL, COGNITO_USER_POOLS authorizer)
       ↓
       Lambda: ec2-controller (Python 3.12, 512MB, 120s)
         ├── STS AssumeRole → member accounts (credentials cached 10 min per container)
         ├── ThreadPoolExecutor → parallel multi-account/region queries
         ├── DynamoDB → account registry + audit logs + user-account assignments + labs
         ├── Cognito IdP → group management (admins/operators/viewers)
         ├── Cost Explorer → billing data
         ├── AWS Backup → ec2-control-vault-production (on-demand, scheduled, restore)
         ├── AWS Federation API → console login (STS AssumeRole → signin.aws.amazon.com → SigninToken)
         └── Labs/My Servers EC2 provisioning (key pair + EIP + EC2 launch, pending-approval gate)

Console Login flow (M10):
  AccountsScreen "Console Login" button
    → POST /console-login → Lambda STS AssumeRole → Federation SigninToken URL
    → window.postMessage({type:'EC2CTRL_OPEN_CONSOLE', ...})
    → content.js bridges to background.js
    → Firefox container tab opened (one named container per AWS account)

Domain: app.onecloudutopia.com → CloudFront

EventBridge (every 15 min) → idle_checker Lambda → CloudWatch → auto-stop + SNS
```

### Navigation Structure (React app)
| Section | Pages | RBAC |
|---------|-------|------|
| Overview | Dashboard, Instances, Backups, My Servers | All authenticated roles |
| Intelligence | Billing & Cost, Analytics, Audit Log | All authenticated roles |
| Finance | Vendors, Customers, Alerts, Fin Settings | All authenticated roles (backend pending) |
| Administration | Accounts, Users, Lab Settings | Admin only |

---

## React Frontend Architecture

### Tech Stack
- **React 18** — functional components, concurrent features
- **TypeScript 5.6** — strict mode throughout; no `any` except at API boundaries
- **Vite 5** — dev server + production build; path alias `@/` → `src/`
- **TanStack Query v5** — all server state; `useQuery`, `useMutation`
- **Zustand 5** — auth store + UI tweaks store (client state only)
- **React Router v6** — nested routes; `<RequireAuth>` guard wraps all app routes

### Key Modules

**`lib/auth.ts`** — Cognito SDK wrapper (module-level, not a class)
- `getRole()` — returns `'admin'|'operator'|'viewer'|'none'` from sessionStorage
- `getToken()` — returns JWT id_token string
- `getEmail()` — returns email string
- `getExpiry()` — returns Unix ms timestamp
- `isNearExpiry()` — returns `true` if < 10 min to expiry
- `refreshTokens()` — returns `Promise<boolean>` (true = success)
- `logout()` — SDK signOut + sessionStorage clear + redirect
- `restoreSession()` — tries to restore from sessionStorage tokens

**`lib/api.ts`** — `apiFetch<T>` wrapper
- Reads Bearer token from `Auth.getToken()`
- On 401: calls `Auth.refreshTokens()`; if fails → `Auth.logout()` + `window.location.replace('/login')`
- Throws `ApiError` (`{ status: number, message: string }`) on non-2xx
- Generic: `apiFetch<MyType>('/endpoint', { method: 'POST', body: JSON.stringify(data) })`

**`stores/auth.ts`** — Zustand auth store
- State: `email`, `role`, `isAuthenticated`, `isBooting`
- Actions: `syncFromStorage()` — reads sessionStorage and updates store; `bootstrap()` — full auth init; `signOut()` — calls `Auth.logout()`
- `useAuthStore` hook used in components requiring auth state reactivity

### Component Conventions
- All components: functional, TypeScript-typed props
- `useState` MUST appear before any conditional early returns (Rules of Hooks)
- `useEffect` functional updater form to avoid stale closure: `setState((prev) => ...)`
- `<React.Fragment key={k}>` for keyed mapped lists — NEVER `<>` shorthand in `.map()` returns
- `import React, { useState, useEffect }` — explicit React import (project pattern)

### UI Primitive Constraints
- **Badge `tone` prop:** ONLY `'ok'|'err'|'warn'|'muted'|'accent'` — `'danger'` is NOT valid
- **Button `variant` prop:** `'primary'|'ghost'|'accent'|'danger'|'ok'` — `'danger'` IS valid for Button
- **Button `icon` prop:** Lucide icon name string (e.g. `'Plus'`, `'Trash2'`); optional

### TanStack Query Patterns
- `refetchInterval` must use function form: `refetchInterval: (query) => query.state.data?.someCondition ? 5000 : false`
- Mutations: `useMutation({ mutationFn: ..., onSuccess: () => queryClient.invalidateQueries(...) })`
- Query keys: arrays, e.g. `['labs']`, `['lab-settings']`, `['lab-templates']`

---

## Auth System (Custom SRP — M7)

The portal uses a **custom-built React login page** (not Cognito Hosted UI) with the
`amazon-cognito-identity-js` SDK for SRP authentication. The password never leaves the browser.

### SDK Loading
- Loaded via npm package (`amazon-cognito-identity-js`) in the React build
- No CDN or fallback needed — bundled by Vite at build time

### Token Storage (sessionStorage keys)
```
id_token       — JWT for API auth (Bearer header)
access_token   — Cognito access token
refresh_token  — For session refresh
token_expiry   — Unix ms timestamp of id_token expiry
user_email     — Display name extracted from JWT payload
user_groups    — JSON array of Cognito groups e.g. ["admins"]
```

### apiFetch Contract (must be preserved)
```typescript
Auth.isNearExpiry()    // returns boolean — true if < 10 min to expiry
Auth.refreshTokens()   // returns Promise<boolean> — true on success, false on failure
Auth.getToken()        // returns string — JWT id_token
Auth.getRole()         // returns 'admin'|'operator'|'viewer'|'none'
Auth.logout()          // clears session, redirects to /login
```

### Cognito Configuration (CloudFormation)
- `AllowAdminCreateUserOnly: false` — Open self-signup
- `ExplicitAuthFlows`: `ALLOW_USER_SRP_AUTH`, `ALLOW_USER_PASSWORD_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH`
- Email verification template configured for sign-up flow
- `NEW_PASSWORD_REQUIRED` challenge: handled for admin accounts created via CF `CognitoFirstUser`

---

## RBAC System (M8)

### Cognito Groups
- `admins` — full access: all accounts, start/stop, user management, account management, Lab Settings
- `operators` — assigned accounts only: can start/stop instances, provision labs
- `viewers` — assigned accounts only: read-only (no start/stop)
- No group — blocked at login with pending-approval screen

### User-Account Assignments (DynamoDB)
- Table: `ec2-control-user-accounts-production`
- PK: `userEmail` | SK: `accountId` | GSI: `account-index` (PK: accountId)
- Fields: `accessLevel` (`operator`|`viewer`), `grantedBy`, `grantedAt`
- Admins bypass the table — they see all enabled accounts

### Lambda RBAC Helpers (utils.py)
- `get_caller_groups(event)` — extracts `cognito:groups` from JWT claims; handles both JSON-array `["admins"]` and comma-separated `admins,operators` encoding (REST API v1 authorizer quirk)
- `is_admin(event)` — returns True if caller is in admins group
- `require_admin(event)` — returns 403 error response if not admin; used as guard at top of admin-only handlers

### React RBAC Patterns
- `getRole()` from `lib/auth.ts` — call in component body (before any conditional returns)
- Route guard: `<Navigate to="/app/instances" replace />` for unauthorized roles
- Admin-only routes: Accounts, Users, Lab Settings — protected via `<RequireAuth>` + role check
- `useState` and all hooks MUST appear before RBAC guard conditional returns

### /users API Endpoint
- `GET /users` — admin only; lists all Cognito users with groups + account assignments (enriched via ThreadPoolExecutor)
- `POST /users` — admin only; actions: `setRole`, `grantAccount`, `revokeAccount`, `getPermissions`
- **CRITICAL:** `handle_users_mutation` calls `.lower()` on `action`, so comparisons must use lowercase (`'setrole'`, `'grantaccount'`, `'revokeaccount'`, `'getpermissions'`) — NOT camelCase

---

## Backup System (M9)

### Infrastructure (central-stack.yaml)
- **Backup Vault:** `ec2-control-vault-production` (ap-south-1) — all recovery points stored here
- **Backup Service Role:** `ec2-control-backup-role-production` (IAM role assumed by AWS Backup)
  - Managed policies: `AWSBackupServiceRolePolicyForBackup` + `AWSBackupServiceRolePolicyForRestores`
- **Lambda env vars:** `BACKUP_ROLE_ARN` + `BACKUP_VAULT_NAME`
- **API Gateway:** `/backup` resource — GET (list), POST (mutations), OPTIONS (CORS)
- **Known limitation:** Adding a new member account requires manually updating vault policy in `central-stack.yaml` and redeploying

### Lambda (backup.py)
- `handle_backup_list(event)` — GET /backup: lists recovery points + backup plans for an instance
- `handle_backup_mutation(event)` — POST /backup: routes on `action` field (`.strip().lower()`)
- Actions: `createbackup`, `createschedule`, `updateschedule`, `deleteschedule`, `listschedules`, `restore`, `deleterecovery`
- **Cross-account:** Lambda assumes member role via STS, creates `boto3.client('backup', ...)` with those creds
- **Central account** (`976792586566`): uses default Lambda credentials (no STS)
- **Restore behaviour:** `start_restore_job()` always creates a NEW EC2 instance; `replace` mode also stops the original instance (does NOT terminate — user must do that manually)
- **Restore metadata:** extracts `subnetId` + `securityGroupIds` from `describe_instances()`; includes `iamInstanceProfileArn` only if present (omit entirely if absent — AWS Backup rejects null/empty)
- **Schedule naming:** `ec2ctrl-{instanceId}-{preset}` (e.g. `ec2ctrl-i-0abc123-daily`)
- **RBAC:** admins see all; operators/viewers scoped to allowed accountIds; viewers cannot trigger mutations

### Adding a New Member Account (Backup)
After onboarding via Accounts tab, also add account ARN to vault `AccessPolicy` in `central-stack.yaml` and redeploy.

---

## Quick-Add Account System (M12)

### Overview
Replaces the fully manual "deploy YAML yourself" onboarding with a one-click CloudFormation Quick-Create button inside the Add Account modal. Non-IT clients click a button, a new tab opens with CloudFormation pre-loaded, they give the stack a name and hit Deploy, then copy two ARN values from Outputs back into the form.

### Infrastructure
- **TemplatesBucket:** `ec2-control-templates-{accountId}-{region}` (public S3) — hosts `member-role-stack.yaml` with public `s3:GetObject` restricted to exactly that one object path (no wildcard)
- **deploy.sh Step 5b:** uploads `cloudformation/member-role-stack.yaml` to `TemplatesBucket` after CF deploy
- **config_injector:** injects 3 CONFIG keys — `CENTRAL_ACCOUNT_ID`, `ENVIRONMENT`, `MEMBER_ROLE_TEMPLATE_URL` — plus empties `TemplatesBucket` on stack delete alongside `PortalBucket`

### CloudFormation Quick-Create URL format
```
https://{region}.console.aws.amazon.com/cloudformation/home
  ?region={region}
  #/stacks/create/review
  ?templateURL={encoded-s3-url}
  &stackName=ec2-control-member-role
  &param_CentralAccountId={central-account-id}
  &param_Environment={environment}
```
The `?` after `#/stacks/create/review` is the SPA fragment query separator — this is correct AWS console URL format.

---

## Console Login System (M10)

### Lambda (console_login.py)
- `handle_console_login(event)` — POST /console-login
- RBAC: admins + operators only; viewers → 403; LOCAL (central account roleArn) → 400
- Flow: parse body → RBAC → account lookup → STS `assume_role(DurationSeconds=3600, ExternalId=f'ec2-control-{CENTRAL_ACCOUNT_ID}')` → build Session JSON → call Federation API → return `loginUrl`
- Federation endpoint: `https://signin.aws.amazon.com/federation?Action=getSigninToken&SessionDuration=3540&Session=<url-encoded-json>`
- **`SessionDuration=3540` (59 min)** — must be strictly less than the 3600s credential lifetime; using 3600 causes HTTP 400 from the federation endpoint due to the credential expiry boundary check
- `urllib.parse.quote(session_json, safe='')` — encode ALL chars including `/` (AWS session tokens contain `/`)
- Role chaining cap: Lambda role → member role = role chaining → DurationSeconds hard-capped at 3600s regardless of `MaxSessionDuration` on target role
- Returns: `{ loginUrl, accountId, accountName }`

### Firefox Extension (firefox-extension/)
- **manifest.json** (MV3): matches `https://app.onecloudutopia.com/*`
- **content.js**: uses `window.wrappedJSObject.EC2CTRL_EXTENSION = true` — Firefox XRay isolation requires `wrappedJSObject` to write to the underlying page window (direct `window.X = true` is invisible to page scripts)
- **background.js**: one named Firefox container per AWS account (`EC2Ctrl — <accountName>`); if account tab is already open → focus it; containerId persisted across restarts; tabId cleared on tab close
- Extension detection: page checks `window.EC2CTRL_EXTENSION`; content.js also dispatches `EC2CTRL_EXTENSION_READY` CustomEvent; install banner shown after 800ms if absent

---

## My Servers / Labs System (M11)

**UI name:** "My Servers" (tab label, page title, user-facing copy throughout the React app)
**Backend name:** "labs" (API paths `/labs/*`, DynamoDB table `ec2-control-labs-*`, Python module `labs.py`, query keys `['labs']`)
Never rename the backend or API paths — only the UI label changed.

### Overview
My Servers lets operators provision a dedicated EC2 instance ("lab") for hands-on training. The flow uses a pending-approval gate so an admin must review payment before any EC2 is launched.

```
User: 4-step wizard (Configure → Pricing → Payment → Submitted)
  → POST /labs { action:'submit' } → DynamoDB status='pending_approval', no EC2 launched

Admin: My Servers tab → Pending filter → click row to expand → View Payment → Approve / Reject
  → POST /labs { action:'approve', labId } → EC2 provisioned (key pair + EIP + instance)
  → POST /labs { action:'reject',  labId } → DynamoDB status='rejected', no EC2
```

### DynamoDB Table
- **Table:** `ec2-control-labs-production` / `ec2-control-labs-development`
- **PK:** `labId` (UUID)
- **Status values:** `pending_approval` → `provisioning` → `running` → `stopped` → `terminated` | `rejected`

**Key fields:**
| Field | Type | Description |
|-------|------|-------------|
| `labId` | String | UUID primary key |
| `status` | String | Current state |
| `callerEmail` | String | Submitting user |
| `accountId` | String | Target AWS account |
| `region` | String | AWS region |
| `instanceType` | String | e.g. `t3.micro` |
| `platform` | String | `ubuntu` / `windows` |
| `storageGb` | Number | EBS size in GB (min 35 for Windows) |
| `hoursPerDay` | Number | Hours/day the lab will be used |
| `months` | Number | Number of months |
| `durationHours` | Number | `hoursPerDay × 30 × months` |
| `subnetId` | String | Stored at submit; used at approve |
| `securityGroupIds` | String | JSON-serialized list; stored at submit |
| `estimatedCostUsd` | Number | Calculated at submit |
| `instanceId` | String | Set after approval + provisioning |
| `keyName` | String | EC2 key pair name |
| `keyS3Key` | String | S3 path to .pem |
| `allocationId` | String | EIP allocation ID (if EIP enabled) |
| `publicIp` | String | Assigned EIP |
| `expiresAt` | String | ISO timestamp; set at approval |
| `paymentKey` | String | S3 path to payment screenshot |

### Backend — `labs.py`
- `handle_labs_list(event)` — GET /labs: returns all labs (admin) or caller's labs (operator)
- `handle_labs_provision(event)` — POST /labs: routes on `action` field (`.strip().lower()`)
  - `'submit'` → validates fields, verifies payment in S3, writes `pending_approval` record
  - `'approve'` → admin only; calls `_do_provision_ec2`; updates DynamoDB
  - `'reject'` → admin only; sets `status='rejected'`
- `handle_labs_delete(event)` — DELETE /labs: terminate instance + cleanup
- `handle_labs_payment(event)` — POST /labs/payment: generate presigned S3 upload URL for payment screenshot
- `handle_labs_payment_view(event)` — GET /labs/payment: admin only; returns 15-min presigned download URL
- `handle_labs_keypair(event)` — GET /labs/keypair: returns presigned download URL for .pem
- `handle_labs_windows_password(event)` — GET /labs/windows-password: retrieves RDP password
- `handle_labs_pricing(event)` — GET /labs/pricing: on-demand pricing for wizard pricing step
- `handle_labs_network_options(event)` — GET /labs/network-options: lists subnets + security groups
- `handle_labs_pricing_settings(event)` — GET /labs/pricing-settings: returns stored pricing settings (WHT%, VAT%, margin, discount, currency, etc.); POST saves (admin only)
- `handle_labs_templates(event)` — GET /labs/templates: returns saved lab templates list; POST full-replaces the list (admin only)
- `_do_provision_ec2(fields, lab_id, estimated_cost, caller_email)` → `(item_dict, instance_id)`: full provisioning (key pair + EIP + EC2 launch + DynamoDB write)
- `_validate_lab_fields(body)` → `(fields_dict, None)` or `(None, error_response)`: shared validation

**Limits:**
- `MAX_DURATION_HOURS = 26280` (3 years at 24 hrs/day)
- EBS storage: 8–500 GB (Windows: 35–500 GB)
- `hoursPerDay`: 1–24; `months`: 1–36

**EIP cleanup rule:** if EIP allocation/association fails, terminate the EC2 instance BEFORE deleting key pair + .pem (to avoid orphaned running instances).

### React Frontend — My Servers

**`MyServersScreen.tsx`** — route `/app/servers`
- RBAC guard: viewers and unapproved users redirected to `/app/instances`
- `useState` hooks declared before RBAC guard (Rules of Hooks requirement)
- Toggle button: "New Lab" (primary, Plus icon) → "Cancel" (ghost, no icon) controls wizard visibility
- Renders `<LabWizard>` (when open) + `<LabList>` (always)

**`LabWizard.tsx`** — 4-step provisioning wizard
- Step 1 (Configure): region, instance type grouped by family, platform (ubuntu/windows), storage GB, hours/day, months; Windows auto-bumps storage to min 35 GB via `useEffect([platform])`
- Step 2 (Pricing): fetches `/labs/pricing` + `/labs/pricing-settings`; shows cost breakdown with WHT/VAT/margin applied; AWS Pricing Calculator link
- Step 3 (Payment): file upload → presigned S3 URL; submit button disabled until `paymentKey && !uploadingPayment && !labMut.isPending && subnetId`
- Step 4 (Submitted): confirmation; auto-navigates to Pending filter on exit
- FileReader null guard: `if (typeof reader.result !== 'string') { reject(new Error('Failed to read file')); return; }` before using result
- All `parseInt` calls include radix 10: `parseInt(e.target.value, 10)`

**`LabList.tsx`** — filterable row-based table
- Filters: Active (running + provisioning), Pending, History, All; attribute filters: platform, server type, status, account, region, submitted by (admin combobox)
- One inline detail panel open at a time; clicking same row again collapses it

**`LabSettingsScreen.tsx`** — route `/app/lab-settings` (admin only)
- **PricingSettingsPanel**: 6 numeric fields (WHT%, VAT%, margin%, discount%, currency rate, data transfer per GB), currency code text input, 2 checkboxes (includeBackup, includeMonitoring)
- **TemplateManagementPanel**: template table with Add (form above table), Edit (inline below row), Delete; all mutations use full-replace via `POST /labs/templates`; uses `<React.Fragment key={tpl.id}>` for keyed rows with conditional inline edit row

**Status badges:**
| Status | Tone |
|--------|------|
| `pending_approval` | `warn` |
| `provisioning` | `accent` |
| `running` | `ok` |
| `stopped` | `muted` |
| `terminated` | `err` |
| `rejected` | `err` |

### API endpoints (Labs / My Servers)
| Method | Path | Description |
|--------|------|-------------|
| GET | /labs | List labs (admin: all; operator: own) |
| POST | /labs | `action: submit/approve/reject` |
| DELETE | /labs | Terminate lab instance |
| POST | /labs/payment | Get presigned S3 upload URL for payment screenshot |
| GET | /labs/payment | Admin only — presigned download URL for payment screenshot |
| GET | /labs/keypair | Presigned download URL for .pem key |
| GET | /labs/windows-password | RDP password for Windows labs |
| GET | /labs/pricing | On-demand pricing for wizard |
| GET | /labs/network-options | Subnets + security groups for an account/region |
| GET | /labs/pricing-settings | Stored pricing settings (WHT%, VAT%, margin, currency, etc.) |
| POST | /labs/pricing-settings | Save pricing settings (admin only) |
| GET | /labs/templates | Lab templates list |
| POST | /labs/templates | Full-replace lab templates list (admin only) |

---

## Finance Module

The Finance module tracks **OCU's own business finances** — not end-user billing. It is separate from
the Billing & Cost tab (which shows AWS spend per EC2 instance).

### Screens
| Screen | Route | Description |
|--------|-------|-------------|
| Vendors | `/app/vendors` | OCU vendor management (suppliers, contractors) |
| Customers | `/app/customers` | OCU customer management (invoicing, relationships) |
| Alerts | `/app/alerts` | Finance alerts and notifications |
| Fin Settings | `/app/finsettings` | Finance configuration |

### Current State
- All 4 screens are **fully wired** — live API calls, real data, no mock imports
- Query hooks in `lib/queries/finance.ts`: `useVendors`, `useVendorMutation`, `useCustomers`, `useCustomerMutation`, `useFinanceAlerts`, `useFinanceSettings`, `useFinanceSettingsMutation`
- Backend (`/finance` endpoints) is complete — DynamoDB single table `ec2-control-finance-{env}`, `require_admin` on all handlers
- `features/app/mockData.ts` still exists but is no longer imported anywhere — safe to delete if desired

### Design Principle
- Finance module is part of the standard nav for all authenticated users
- Follows the same `apiFetch<T>` + TanStack Query patterns as all other screens
- Finance API lives under `/finance` path (separate from `/labs` and `/ec2`)

---

## Key Architecture Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| API Gateway | REST API v1 REGIONAL | COGNITO_USER_POOLS authorizer; explicit CORS per method |
| Auth | Custom SRP via amazon-cognito-identity-js SDK | Full design control; password never leaves browser; no Hosted UI redirect |
| Frontend | React 18 + TypeScript 5.6 + Vite 5 | Original vanilla JS/IIFE grew to 15+ modules; TS strict + component model + TanStack Query brings type safety, server state management, and long-term maintainability |
| Server state | TanStack Query v5 | Declarative caching, background refetch, mutation invalidation — replaces manual fetch + `onTabActivated` patterns |
| Client state | Zustand 5 | Minimal boilerplate auth store; no Redux overhead |
| Routing | React Router v6 nested routes | `<RequireAuth>` guard + `<Navigate>` for RBAC; layout nesting without prop drilling |
| Self-signup | Open to all (Cognito rate-limited) | SaaS product — anyone can create an account |
| Domain | `app.onecloudutopia.com` (subdomain of company domain) | Hosted under One Cloud Utopia's official domain; no apex redirect needed for a subdomain |
| Lambda code | Versioned S3 zip key | Forces code update on every CF deploy |
| Config injection | Custom Resource Lambda | Zero manual copy-paste of CF outputs |
| Multi-account | STS AssumeRole + DynamoDB | Central creds; cross-account via role |
| Idle auto-stop | Default ON, opt-out via tag | Aggressive cost savings |
| Custom domain | CloudFront Alias + ACM (us-east-1) + Route 53 A ALIAS | Standard CDN HTTPS pattern |
| Console login | STS AssumeRole → AWS Federation API → SigninToken | No credential exposure; single-use URL; browser handles session |
| Firefox containers | One named container per AWS account | Isolated cookies per account; no cross-account session bleed |
| Lambda memory | 512 MB | Doubles CPU allocation vs 256MB; needed for 20-thread STS/EC2 ThreadPoolExecutor to run efficiently |
| CloudFront PriceClass | PriceClass_200 | Includes Asia Pacific (Mumbai) edge nodes; India users served locally not via Europe |
| STS cred caching | Module-level TTL dict + threading.Lock (10 min TTL) | 20 concurrent threads × N accounts = STS rate-limit without cache; creds last 15 min so 10 min cache is safe |
| UI tab name | "My Servers" (was "Labs") | Product branding decision — operators relate to "servers" not "labs"; backend paths unchanged |

---

## API Contract

| Method | Path | Description |
|--------|------|-------------|
| POST | /ec2 | `action: list/start/stop/status` |
| GET | /accounts | All accounts (enabled + disabled) |
| POST | /accounts | `action: add/update/enable/disable/remove/test` |
| GET | /audit | `?instanceId&userEmail&limit&lastKey` |
| GET | /audit/daily | `?instanceId&days` — cost estimate |
| GET | /pricing | `?region&types` — live on-demand hourly rates |
| GET | /users | All Cognito users with groups + account assignments (admin only) |
| POST | /users | `action: setRole/grantAccount/revokeAccount/getPermissions` (admin only) |
| GET | /backup | `?instanceId&accountId&region` — recovery points + backup plans |
| POST | /backup | `action: createbackup/createschedule/updateschedule/deleteschedule/listschedules/restore/deleterecovery` |
| POST | /console-login | `{accountId, region}` — returns `{loginUrl, accountId, accountName}` (admins + operators only) |
| GET | /labs | List labs (admin: all; operator: caller's only) |
| POST | /labs | `action: submit/approve/reject` |
| DELETE | /labs | Terminate lab instance |
| POST | /labs/payment | Get presigned S3 upload URL for payment screenshot |
| GET | /labs/payment | Admin only — presigned download URL for payment screenshot |
| GET | /labs/keypair | Presigned download URL for EC2 .pem key |
| GET | /labs/windows-password | RDP password (Windows labs only) |
| GET | /labs/pricing | On-demand pricing for wizard pricing step |
| GET | /labs/network-options | Subnets + security groups for an account/region |
| GET | /labs/pricing-settings | Pricing settings (WHT%, VAT%, margin%, discount%, currency, data transfer rate, etc.) |
| POST | /labs/pricing-settings | Save pricing settings (admin only) |
| GET | /labs/templates | Lab templates list |
| POST | /labs/templates | Full-replace lab templates list (admin only) |

---

## Code Patterns

### Lambda (Python) — REST API v1
- Method/path: `event['httpMethod']`, `event['path']`
- JWT caller email: `event['requestContext']['authorizer']['claims'].get('email')`
- CORS headers required in EVERY response (REST API v1 doesn't auto-add them)
- `get_accounts()` → enabled only (EC2 listing); `get_all_accounts()` → all (admin panel)
- `action` strings from POST body: always call `.strip().lower()` before comparing → use lowercase in `if/elif` checks (e.g. `'setrole'` not `'setRole'`)
- **boto3 singletons:** All boto3 clients/resources are module-level singletons (`_client = None` + lazy init) — never create clients inside handlers (adds TLS setup per-request)
- **STS credential caching:** `accounts.py` and `labs.py` cache assumed-role credentials in a module-level dict with a `threading.Lock` and 10-min TTL. `get_ec2_client()` and `_get_member_creds()` never call `assume_role()` more than once per 10 min per account per warm container. Do NOT remove this cache — the ThreadPoolExecutor fires 20+ concurrent STS calls without it, causing throttling.
- **DynamoDB pagination:** All `table.scan()` calls must loop over `LastEvaluatedKey` to retrieve all pages. A single `scan()` only returns up to ~1MB; silently drops records beyond that. Both `get_accounts()` and `get_all_accounts()` in `accounts.py` handle pagination correctly — follow the same pattern for any new scan.

### Frontend (React / TypeScript)
- All pages: functional components with typed props; TypeScript strict (no `any` except at API boundaries)
- **Rules of Hooks:** `useState`, `useEffect`, `useQuery`, etc. MUST appear before any conditional early return — including RBAC guards
- **RBAC guard pattern:**
  ```typescript
  export default function MyScreen() {
    const [state, setState] = useState(false); // hooks first — always
    const role = getRole();
    if (role !== 'admin') return <Navigate to="/app/instances" replace />;
    // render
  }
  ```
- **apiFetch pattern:**
  ```typescript
  const data = await apiFetch<MyType>('/endpoint', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  ```
- **TanStack Query:**
  ```typescript
  const { data, isLoading } = useQuery({ queryKey: ['labs'], queryFn: () => apiFetch<Lab[]>('/labs') });
  const mut = useMutation({ mutationFn: (body) => apiFetch('/labs', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['labs'] }) });
  // refetchInterval must be a function (v5 API):
  refetchInterval: (query) => query.state.data?.status === 'provisioning' ? 5000 : false,
  ```
- **Fragment keys:** `<React.Fragment key={item.id}>` — NEVER `<>` inside `.map()` when a key is needed
- **useEffect functional updater:**
  ```typescript
  useEffect(() => {
    if (platform === 'windows') setStorageGb((s) => Math.max(s, 35));
  }, [platform]); // functional updater removes storageGb from deps
  ```
- **Badge tones:** `'ok'|'err'|'warn'|'muted'|'accent'` — `'danger'` is NOT valid for Badge
- **Button variants:** `'primary'|'ghost'|'accent'|'danger'|'ok'` — `'danger'` IS valid for Button
- CONFIG injected at deploy by `config_injector` — keys: `COGNITO_DOMAIN`, `CLIENT_ID`, `REDIRECT_URI`, `API_URL`, `USER_POOL_ID`, `CENTRAL_ACCOUNT_ID`, `ENVIRONMENT`, `MEMBER_ROLE_TEMPLATE_URL`

### CloudFormation
- `AuthorizationType: COGNITO_USER_POOLS` + `AuthorizerId: !Ref RestApiAuthorizer`
- Every resource needs explicit OPTIONS mock method (`AuthorizationType: NONE`) for CORS
- `GatewayResponseDefault4XX/5XX` needed for CORS on error responses
- `AWS::ApiGateway::Deployment` is immutable — use versioned `Description` to force new one
- `IntegrationHttpMethod: POST` on ALL integrations (Lambda proxy requires POST regardless of route)
- `IdentitySource: method.request.header.Authorization` — plain string (not a list)
- deploy.sh flushes REST API deployment snapshot after every CF deploy (prevents stale auth)
- `EarlyValidation::ResourceExistenceCheck` fails if named resources already exist (orphaned from failed deploy) — delete them manually before re-deploying
- S3 buckets with versioning: must delete all object versions before CF or manual deletion

### Custom Domain (CloudFront + ACM + Route 53)
- ACM cert MUST be in us-east-1 (CloudFront requirement), even if stack is in another region
- Deploy `acm-cert-stack.yaml` to us-east-1 once per domain; CF auto-validates via Route 53
- Route 53 A ALIAS → CloudFront uses HostedZoneId `Z2FDTNDATAQYW2` (global CF zone, hardcoded)
- Cannot have a CNAME and A record for the same name — delete existing CNAMEs before deploy
- `CustomDomain` = primary domain (what users visit), `ApexDomain` = secondary (redirects to CustomDomain)

---

## Deploy

**Build frontend (required before deploy):**
```bash
cd frontend && npm install && npm run build
```

**Standard deploy (all config already set in deploy-config.env):**
```bash
./deploy.sh
```

**New custom domain setup (one-time per domain):**
```bash
# 1. Deploy ACM cert to us-east-1 (subdomain — no ApexDomain needed)
aws cloudformation deploy \
  --template-file cloudformation/acm-cert-stack.yaml \
  --stack-name ec2-control-acm-onecloudutopia --region us-east-1 --profile solobil-prod \
  --parameter-overrides DomainName=app.onecloudutopia.com HostedZoneId=Z09322302BWL3NDKZIX2J

# 2. Get cert ARN
aws cloudformation describe-stacks --stack-name ec2-control-acm-onecloudutopia \
  --region us-east-1 --profile solobil-prod --query 'Stacks[0].Outputs'

# 3. Set CUSTOM_DOMAIN=app.onecloudutopia.com, APEX_DOMAIN=, ACM_CERT_ARN, HOSTED_ZONE_ID in deploy-config.env, then run ./deploy.sh
```

**deploy-config.env fields:** `ADMIN_EMAIL`, `COGNITO_DOMAIN_PREFIX`, `ENVIRONMENT`, `AWS_REGION` (required) | `AWS_PROFILE`, `NOTIFICATION_EMAIL`, `CUSTOM_DOMAIN`, `APEX_DOMAIN`, `ACM_CERT_ARN`, `HOSTED_ZONE_ID` (optional)

**Add member account (Quick-Create — recommended for non-IT clients):**
Portal → Accounts tab → **+ Add Account** → select AWS region → click **Open CloudFormation in AWS Console** → stack pre-filled (template auto-loaded, `CentralAccountId` + `Environment` pre-filled) → deploy → copy `RoleArn` + `ConsoleRoleArn` from Outputs → paste into modal → Add Account → Test.

**Add member account (CLI — for power users):**
```bash
aws cloudformation deploy \
  --template-file cloudformation/member-role-stack.yaml \
  --stack-name ec2-control-member-role --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides CentralAccountId=976792586566 Environment=production \
  --region ap-south-1 --profile <member-profile>
# Then: Portal → Accounts tab → + Add Account → paste RoleArn + ConsoleRoleArn → Test
```

---

## Git & GitHub

- **Primary repo (team):** `https://github.com/OneCloudUtopia/ec2-control-center` (private) | `origin` remote
- **Portfolio repo (Mukesh):** `https://github.com/Mukesh-Pant/ec2-control-center` (private) | `personal` remote — manually synced after prod releases
- **Branches:** `develop` (default, auto-deploys to dev) → `main` (auto-deploys to prod, Mukesh approval required)
- **CI/CD:** GitHub Actions — `.github/workflows/deploy-dev.yml` + `.github/workflows/deploy-prod.yml` (OIDC auth, no stored AWS keys)
- **Workflow:** `feat/branch` → PR to `develop` (1 approval, any member) → PR to `main` (Mukesh approval)
- **Commit at milestone/feature completion only**
- **Never commit:** `deploy-config.env`, `deploy-config-dev.env`, `.zip` files, `__pycache__/`, `node_modules/`, `frontend/dist/`, secrets
- **Commit types:** `feat`, `fix`, `chore`, `docs`, `refactor`
- **Portfolio sync after prod release:** `git checkout main && git pull origin main && git push personal main`

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
