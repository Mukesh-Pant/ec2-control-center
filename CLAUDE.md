# EC2 Control Portal — Claude Project Context

## Vision & Product

**EC2 Control** by **One Cloud Utopia** is a production SaaS web portal for managing EC2 instances
across multiple AWS accounts. Users sign up, log in via a custom-built auth page (Cognito SDK / SRP),
see all EC2 instances grouped by account and region, Start / Stop / check Status, view audit logs,
get idle auto-stop alerts, see billing insights, and manage member AWS accounts.
Fully serverless, zero infrastructure to manage.

**Live URL:** `https://solobil.com` (primary) | `www.solobil.com` redirects to it via CloudFront Function
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
| M7 | Custom auth page + self-signup + domain migration to solobil.com | ✅ LIVE |
| M8 | RBAC — Cognito groups, user-account assignments, /users admin panel | ✅ LIVE |
| M9 | Backup — AWS Backup service, on-demand + scheduled backups, restore, /backup endpoint | ✅ LIVE |
| M10 | Console Login — one-click AWS Console via STS federation + Firefox container tabs extension | ✅ LIVE |
| M11 | Labs — self-service EC2 lab provisioning, payment upload, pending-approval workflow, admin controls | 🚧 IN DEV |
| Perf | Performance — STS cred caching, boto3 singletons, script defer, skeleton loading, Lambda 512MB, CloudFront PriceClass_200 | ✅ LIVE |

**API:** REST API v1 (migrated from HTTP API v2) with COGNITO_USER_POOLS authorizer.

---

## AWS Accounts

### SaaS / Production — `976792586566` (primary)
- **Stack:** `ec2-control-production` (ap-south-1)
- **Portal URL:** `https://solobil.com`
- **Domains:** `solobil.com` (primary) + `www.solobil.com` (301 redirect)
- **Hosted Zone:** `Z03300705IH6KUBEMK92`
- **ACM Cert (us-east-1):** Deploy `acm-cert-stack.yaml` with `DomainName=solobil.com ApexDomain=www.solobil.com`
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

**Prod table names:** `ec2-control-accounts-production`, `ec2-control-audit-production`, `ec2-control-user-accounts-production`
**Dev table names:** `ec2-control-accounts-development`, `ec2-control-audit-development`, `ec2-control-user-accounts-development`

---

## Project Structure

```
EC2-control-center/
├── deploy.sh                   ← One-command deploy (Git Bash)
├── deploy-config.env           ← Config values — never commit
├── example-deploy-config.env   ← Template for deploy-config.env
├── oculogo.png                 ← One Cloud Utopia logo (source)
├── cloudformation/
│   ├── central-stack.yaml      ← All AWS resources (M1-M11 + custom domain + auth + RBAC + Backup + Console Login + Labs)
│   ├── acm-cert-stack.yaml     ← ACM cert for custom domain (us-east-1, deploy ONCE)
│   └── member-role-stack.yaml  ← Cross-account IAM role (deploy in each member account)
├── lambda/
│   ├── ec2_controller/
│   │   ├── index.py            ← Main handler: /ec2, /accounts, /audit, /pricing, /users, /backup, /console-login, /labs routes
│   │   ├── accounts.py         ← Account registry + user-account assignment CRUD
│   │   ├── audit.py            ← Audit log read/write
│   │   ├── backup.py           ← AWS Backup: on-demand, schedule, restore, delete (M9)
│   │   ├── console_login.py    ← Console login: STS AssumeRole → Federation API → SigninToken URL (M10)
│   │   ├── labs.py             ← Labs: submit/approve/reject provisioning, key pair, EIP, payment view (M11)
│   │   ├── pricing.py          ← EC2 on-demand pricing lookup
│   │   └── utils.py            ← CORS helpers, JWT claims, error mapping, RBAC helpers
│   ├── config_injector/
│   │   └── index.py            ← Custom resource: injects CONFIG, uploads frontend, invalidates CDN
│   └── idle_checker/
│       └── index.py            ← CPU check, auto-stop, SNS alert
├── firefox-extension/
│   ├── manifest.json           ← MV3; matches solobil.com + www.solobil.com; permissions: contextualIdentities, cookies, tabs, storage
│   ├── background.js           ← Container tab manager: one named Firefox container per AWS account
│   ├── content.js              ← Sets window.wrappedJSObject.EC2CTRL_EXTENSION=true; bridges postMessage → background
│   └── icons/                  ← icon-48.png + icon-96.png
└── frontend/
    ├── index.html              ← SPA shell (CONFIG auto-injected at deploy) + auth page HTML
    ├── oculogo.png             ← Logo (deployed to S3 with frontend)
    ├── css/styles.css          ← Dark theme dashboard + auth page styles
    └── js/
        ├── auth.js             ← Cognito SDK SRP auth (login, signup, verify, refresh, logout)
        ├── authui.js           ← Auth page UI controller (form switching, validation, loading)
        ├── api.js              ← Fetch wrapper with auto-token-refresh
        ├── instances.js        ← Instance list + start/stop controls
        ├── audit.js            ← Audit log viewer + daily cost view
        ├── billing.js          ← Billing dashboard
        ├── analytics.js        ← Usage analytics
        ├── accounts.js         ← Multi-account management
        ├── users.js            ← User management: roles, account grants (admin only)
        ├── backup.js           ← Backup dashboard: on-demand backup, schedules, restore (M9)
        ├── labs.js             ← Labs dashboard: 4-step wizard, pending-approval flow, admin controls (M11)
        ├── app.js              ← App init, tabs, toast, session timer, role badge, extension detection (M10)
        └── vendor/
            └── amazon-cognito-identity.min.js  ← Cognito SDK v6.3.12 (CDN fallback)
```

---

## Architecture

```
Browser → CloudFront → S3 (private — frontend files)
       ↓
       Custom Auth Page (index.html)
       ↓ Cognito SDK (SRP — password never leaves browser)
       auth.js → amazon-cognito-identity-js → Cognito User Pool
       ↓ JWT tokens stored in sessionStorage
       api.js → Bearer JWT on every request
       ↓
       REST API Gateway (v1, REGIONAL, COGNITO_USER_POOLS authorizer)
       ↓
       Lambda: ec2-controller (Python 3.12, 256MB, 120s)
         ├── STS AssumeRole → member accounts
         ├── ThreadPoolExecutor → parallel multi-account/region queries
         ├── DynamoDB → account registry + audit logs + user-account assignments
         ├── Cognito IdP → group management (admins/operators/viewers)
         ├── Cost Explorer → billing data
         ├── AWS Backup → ec2-control-vault-production (on-demand, scheduled, restore)
         ├── AWS Federation API → console login (STS AssumeRole → signin.aws.amazon.com → SigninToken)
         └── Labs EC2 provisioning (key pair + EIP + EC2 launch, pending-approval gate)

Console Login flow (M10):
  accounts.js "Console Login" button
    → POST /console-login → Lambda STS AssumeRole → Federation SigninToken URL
    → window.postMessage('EC2CTRL_OPEN_CONSOLE', loginUrl)
    → content.js bridges to background.js
    → Firefox container tab opened (one named container per AWS account)

Domain: solobil.com (primary) → CloudFront
        www.solobil.com → CloudFront Function → 301 → solobil.com

EventBridge (every 15 min) → idle_checker Lambda → CloudWatch → auto-stop + SNS
```

---

## Auth System (Custom SRP — M7)

The portal uses a **custom-built login page** (not Cognito Hosted UI) with the `amazon-cognito-identity-js` SDK
for SRP (Secure Remote Password) authentication. The password never leaves the browser.

### SDK Loading
- Primary: CDN `https://cdn.jsdelivr.net/npm/amazon-cognito-identity-js@6.3.12/dist/amazon-cognito-identity.min.js`
- Fallback: Local copy at `frontend/js/vendor/amazon-cognito-identity.min.js`
- Inline check: `window.AmazonCognitoIdentity || document.write(fallback script)`

### Modules

**`auth.js`** — Cognito SDK wrapper (IIFE → `Auth` global)
- `init()` — Checks sessionStorage tokens → tries SDK session restore → shows auth page or boots dashboard
- `login(email, password)` — SRP auth, returns `{type: 'SUCCESS'}` or `{type: 'NEW_PASSWORD_REQUIRED'}`
- `completeNewPassword(newPassword)` — Handles admin first-login challenge
- `signup(email, password)` — `UserPool.signUp()` with email attribute
- `confirmSignup(email, code)` — Email verification code
- `resendConfirmationCode(email)`
- `forgotPassword(email)` / `confirmForgotPassword(email, code, newPassword)`
- `refreshTokens()` — Returns `true`/`false` (critical: `api.js` depends on this contract)
- `getToken()`, `getEmail()`, `getExpiry()`, `isNearExpiry()` — Getters for `api.js`
- `redirectToLogin()` — Clear session + reload (called by `api.js` on 401)
- `logout()` — SDK signOut + sessionStorage clear + reload
- `_bootApp(expiry)` — Hides auth page, shows app, calls `App.setUserInfo/setAdmin/setSessionExpiry/App.init`
- Admin check: reads `cognito:groups` from JWT payload (stored in `user_groups` sessionStorage key); falls back to role `none` → shows pending-approval screen via `AuthUI.showPendingApproval()`
- `getRole()` — public getter: returns `'admin'`/`'operator'`/`'viewer'`/`'none'` from sessionStorage

**`authui.js`** — Auth page UI controller (IIFE → `AuthUI` global)
- `showView(view)` — Toggles between 7 form states: `login`, `signup`, `verify`, `forgot`, `reset`, `newpass`, `pending`
- `showPendingApproval(email)` — Shows pending-approval card for users with no Cognito group
- Form handlers: `login()`, `signup()`, `confirmSignup()`, `resendCode()`, `forgotPassword()`, `confirmResetPassword()`, `completeNewPassword()`
- `togglePassword(inputId, btn)` — Show/hide with SVG icon swap
- `updateStrength(password)` — 4-bar strength indicator (red/amber/green)
- `_friendlyError(err)` — Maps Cognito error codes to user-friendly messages
- `_setLoading(btnId, loading)` — Button loading state with CSS spinner
- Enter key handlers on all form inputs

### Token Storage (sessionStorage keys)
```
id_token       — JWT for API auth (Bearer header)
access_token   — Cognito access token
refresh_token  — For session refresh
token_expiry   — Unix ms timestamp of id_token expiry
user_email     — Display name extracted from JWT payload
user_groups    — JSON array of Cognito groups e.g. ["admins"]
```

### api.js Contract (must be preserved)
```javascript
Auth.isNearExpiry()    // returns boolean — true if < 10 min to expiry
Auth.refreshTokens()   // returns Promise<boolean> — true on success, false on failure
Auth.getToken()        // returns string — JWT id_token
Auth.getRole()         // returns string — 'admin'|'operator'|'viewer'|'none'
Auth.redirectToLogin() // clears session, reloads page
```

### Cognito Configuration (CloudFormation)
- `AllowAdminCreateUserOnly: false` — Open self-signup
- `ExplicitAuthFlows`: `ALLOW_USER_SRP_AUTH`, `ALLOW_USER_PASSWORD_AUTH`, `ALLOW_REFRESH_TOKEN_AUTH`
- Email verification template configured for sign-up flow
- `NEW_PASSWORD_REQUIRED` challenge: handled for admin accounts created via CF `CognitoFirstUser`

### Auth Page Design
- Split-screen: navy gradient brand panel (left 45%) + white form panel (right 55%)
- Logo: `oculogo.png` (One Cloud Utopia cloud logo)
- Animated SVG network topology background on brand panel
- Responsive: stacks vertically at 768px, compact at 480px
- All styles in `css/styles.css` (classes prefixed `.auth-`)

---

## RBAC System (M8)

### Cognito Groups
- `admins` — full access: all accounts, start/stop, user management, account management
- `operators` — assigned accounts only: can start/stop instances
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

### /users API Endpoint
- `GET /users` — admin only; lists all Cognito users with groups + account assignments (enriched via ThreadPoolExecutor)
- `POST /users` — admin only; actions: `setRole`, `grantAccount`, `revokeAccount`, `getPermissions`
- **CRITICAL BUG FIX:** `handle_users_mutation` calls `.lower()` on `action`, so comparisons must use lowercase (`'setrole'`, `'grantaccount'`, `'revokeaccount'`, `'getpermissions'`) — NOT camelCase

### Frontend Users Module (users.js)
- `Users.load()` — fetches GET /users + GET /accounts, renders management table
- `Users.applyRole(email)` — POST /users `{action:'setRole', email, role}`
- `Users.openGrantModal(email)` / `confirmGrant()` — grant account access overlay
- `Users.revokeAccount(email, accountId)` — revoke with confirm dialog
- `Users.onTabActivated()` — lazy-loads on first visit
- Role badges: `usr-badge-admins` (blue), `usr-badge-operators` (green), `usr-badge-viewers` (gray), `usr-badge-none` (red)

### Instance Controls RBAC (instances.js)
- Viewers see "View only" badge instead of Start/Stop buttons (checked via `Auth.getRole()`)
- Pending-approval users see empty state with message instead of instance list
- No-accounts-assigned users (have a group but no grants) see separate empty state

---

## Backup System (M9)

### Infrastructure (central-stack.yaml)
- **Backup Vault:** `ec2-control-vault-production` (ap-south-1) — all recovery points stored here
- **Backup Service Role:** `ec2-control-backup-role-production` (IAM role assumed by AWS Backup)
  - Managed policies: `AWSBackupServiceRolePolicyForBackup` + `AWSBackupServiceRolePolicyForRestores`
- **Lambda env vars:** `BACKUP_ROLE_ARN` + `BACKUP_VAULT_NAME`
- **API Gateway:** `/backup` resource — GET (list), POST (mutations), OPTIONS (CORS)
- **Vault access policy:** allows member account `196750375951:root` to call `backup:CopyIntoBackupVault`
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

### Frontend (backup.js)
- IIFE module → `Backup` global
- Public API: `init()`, `onTabActivated()`, `load(instanceId)`, `backupNow()`, `openRestoreModal(arn)`, `confirmRestore()`, `openScheduleForm(planId)`, `saveSchedule()`, `deleteSchedule(planId)`, `deleteRecovery(arn)`, `onTimeChange()`
- **Inline expand pattern** — restore form expands inside Recovery Points panel; schedule form expands inside Backup Schedules panel (no floating modals)
- **Active row highlighting** — `data-arn` on `.bk-rp-row` + `.bk-rp-row--active` CSS class
- **Cron time picker** — `#bk-sched-hour` (00–23) + `#bk-sched-minute` (00/15/30/45); `_buildCron(preset, h, m)` generates AWS EventBridge cron syntax
- **Hidden cron input** — `#bk-sched-cron` (hidden, always holds current cron); `#bk-sched-cron-display` (visible text input, only shown for Custom preset, syncs to hidden)
- **Cron presets:** Daily → `cron(m h * * ? *)`, Weekly → `cron(m h ? * SUN *)`, Monthly → `cron(m h 1 * ? *)`
- `_friendlyCron(cron)` — renders e.g. "Daily at 14:30 UTC" in schedule table
- **Critical:** `confirmRestore()` captures `restoreArn` into `arnToRestore` BEFORE calling `_closeRestoreInline()` which nulls `restoreArn`

### api.js additions
- `getBackups(instanceId, accountId, region)` — GET /backup
- `postBackup(body)` — POST /backup

### Adding a New Member Account (Backup)
After onboarding via Accounts tab, also add account ARN to vault `AccessPolicy` in `central-stack.yaml` and redeploy.

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
- **manifest.json** (MV3): matches `https://solobil.com/*` AND `https://www.solobil.com/*` (portal serves on www subdomain without redirect)
- **content.js**: uses `window.wrappedJSObject.EC2CTRL_EXTENSION = true` — Firefox XRay isolation requires `wrappedJSObject` to write to the underlying page window (direct `window.X = true` is invisible to page scripts)
- **background.js**: one named Firefox container per AWS account (`EC2Ctrl — <accountName>`); if account tab is already open → focus it; containerId persisted across restarts; tabId cleared on tab close
- Extension detection: page checks `window.EC2CTRL_EXTENSION`; content.js also dispatches `EC2CTRL_EXTENSION_READY` CustomEvent; install banner shown after 800ms if absent

### Frontend (accounts.js + app.js)
- `App.isExtensionPresent()` — checks `window.EC2CTRL_EXTENSION` flag
- `App.consoleLogin(accountId, accountName)` — calls `api.consoleLogin(accountId, region)`, then `window.postMessage({type:'EC2CTRL_OPEN_CONSOLE', ...})`
- Console Login button visible on each enabled non-LOCAL account card (admins + operators only)
- Install banner shown if extension not detected after 800ms delay

### api.js addition
- `consoleLogin(accountId, region)` — POST /console-login

---

## Labs System (M11)

### Overview
Labs lets operators provision a dedicated EC2 instance ("lab") for hands-on training. The flow uses a pending-approval gate so an admin must review payment before any EC2 is launched.

```
User: 4-step wizard (Configure → Pricing → Payment → Submitted)
  → POST /labs { action:'submit' } → DynamoDB status='pending_approval', no EC2 launched

Admin: Labs tab → Pending filter → click row to expand → View Payment → Approve / Reject
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
  - `'submit'` → `_handle_labs_submit`: validates fields, verifies payment in S3, writes `pending_approval` record
  - `'approve'` → `_handle_labs_approve`: admin only; calls `_do_provision_ec2`; updates DynamoDB
  - `'reject'` → `_handle_labs_reject`: admin only; sets `status='rejected'`
- `handle_labs_delete(event)` — DELETE /labs: terminate instance + cleanup
- `handle_labs_payment(event)` — POST /labs/payment: generate presigned S3 upload URL for payment screenshot
- `handle_labs_payment_view(event)` — GET /labs/payment: admin only; returns 15-min presigned download URL
- `handle_labs_keypair(event)` — GET /labs/keypair: returns presigned download URL for .pem
- `handle_labs_windows_password(event)` — GET /labs/windows-password: retrieves RDP password
- `handle_labs_pricing(event)` — GET /labs/pricing: on-demand pricing for wizard pricing step
- `handle_labs_network_options(event)` — GET /labs/network-options: lists subnets + security groups
- `_do_provision_ec2(fields, lab_id, estimated_cost, caller_email)` → `(item_dict, instance_id)`: full provisioning (key pair + EIP + EC2 launch + DynamoDB write)
- `_validate_lab_fields(body)` → `(fields_dict, None)` or `(None, error_response)`: shared validation

**Limits:**
- `MAX_DURATION_HOURS = 26280` (3 years at 24 hrs/day)
- EBS storage: 8–500 GB (Windows: 35–500 GB)
- `hoursPerDay`: 1–24; `months`: 1–36

**EIP cleanup rule:** if EIP allocation/association fails, terminate the EC2 instance BEFORE deleting key pair + .pem (to avoid orphaned running instances).

### Frontend — `labs.js`
- IIFE → `Labs` global
- **Wizard steps:** 1=Configure, 2=Pricing, 3=Payment, 4=Submitted confirmation
- `INSTANCE_GROUPS`: grouped by family; each type is `{value, label}` — label includes vCPU/RAM/chip (e.g. `t3.micro — 2 vCPU · 1 GB RAM · Burstable`)
- `_onPlatformChange()` — bumps EBS input to 35 when Windows selected
- `_onDurationInput()` — live preview: `X hrs/day × Y months = Z hours`
- Step 2 (`fetchPricing`) — shows breakdown table + `lbs-calc-hint` block with AWS Pricing Calculator link
- Step 3 — Payment upload; submit button calls `_handleLabsSubmit()` (POST `action:'submit'`)
- Step 4 — "Request Submitted" confirmation screen; `_exitWizard()` sets `_activeFilter = 'pending'` so user lands on Pending filter
- **Lab list UI (redesigned):** filterable row-based table replaces flat card grid
  - **Filter bar:** pills — `All` / `Active` / `Pending` / `History` with live counts; default `active`; auto-falls back to `all` if active count = 0
  - Filter buckets: Active = `running`+`provisioning`; Pending = `pending_approval`; History = `terminated`+`rejected`
  - **Table columns:** Chevron | Lab Name | Platform | Instance Type | Status | Account | Region | Expires
  - **Inline expansion:** clicking a row inserts a detail `<tr>` directly below it; only one expanded at a time; X close button in panel top-right
- **State variables:** `_activeFilter` (`'all'|'active'|'pending'|'history'`) + `_expandedLabId` (labId of open row, or null)
- **Key functions:**
  - `_renderLabsList()` — computes bucket counts, applies auto-fallback, filters visible labs, builds filter bar + table HTML
  - `_renderFilterBar(counts)` — returns pill bar HTML string
  - `_setFilter(filter)` — sets `_activeFilter`, clears `_expandedLabId`, re-renders (public)
  - `_renderRow(lab)` — returns `<tr>` HTML with chevron, all columns, correct expanded class
  - `_renderExpiry(lab)` — returns colored `<span>` using `_formatExpiry()`; yellow = future, gray = expired/absent
  - `_toggleRowDetail(labId)` — expands/collapses inline detail `<tr>`; collapses any previously open row (public)
  - `_collapseDetail()` — removes detail `<tr>`, resets chevron + row class, clears `_expandedLabId`
  - `_renderDetailPanel(lab)` — returns full HTML for expanded panel based on status + role:
    - All statuses: Lab Info grid (Lab ID, Instance ID, Public IP, Elastic IP with allocationId, Platform, Instance Type, Storage, Cost, Expires); admin also shows "Submitted by"
    - `running`: Connection section (SSH command + keypair download OR RDP file + Windows password) + Actions (Download Lab Info; admin also Terminate)
    - `provisioning`: pulsing provisioning message; admin gets Terminate
    - `pending_approval`: admin sees View Payment / Approve / Reject; non-admin sees "Awaiting admin approval"
    - `terminated`/`rejected`: Lab Info only
  - Windows password div uses per-row namespaced ID `lbs-win-pass-${labId}` to avoid collisions
- `_approveLab(labId)` — POST `action:'approve'`; sets `_expandedLabId = null`, refreshes list
- `_rejectLab(labId)` — POST `action:'reject'`; sets `_expandedLabId = null`, refreshes list
- `_viewPayment(labId)` — GET presigned URL; opens in new tab
- `pollStatus()` — on `running`: sets `_activeFilter = 'active'`, calls `_renderLabsList()` then `_toggleRowDetail(labId)` to auto-expand the ready lab (replaces old `showConnectInfo`)
- **Public API:** `init`, `onTabActivated`, `_setFilter`, `_toggleRowDetail`, `_approveLab`, `_rejectLab`, `_viewPayment`, `_getWindowsPassword`, `_downloadKeypair`, `_downloadLabInfo`, `_downloadRdp`, `_confirmDelete`

**Status labels + badge classes:**
| Status | Label | Class |
|--------|-------|-------|
| `pending_approval` | Pending Approval | `lbs-badge--yellow` |
| `provisioning` | Provisioning | `lbs-badge--blue` |
| `running` | Running | `lbs-badge--green` |
| `stopped` | Stopped | `lbs-badge--gray` |
| `terminated` | Terminated | `lbs-badge--red` |
| `rejected` | Rejected | `lbs-badge--red` |

### API endpoints (M11)
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

### api.js additions (M11)
- `getLabsList()` — GET /labs
- `provisionLab(body)` — POST /labs
- `deleteLabInstance(body)` — DELETE /labs
- `uploadLabPayment(body)` — POST /labs/payment
- `getLabPaymentScreenshot(labId)` — GET /labs/payment
- `getLabKeypair(labId)` — GET /labs/keypair
- `getLabWindowsPassword(labId)` — GET /labs/windows-password
- `getLabPricing(params)` — GET /labs/pricing
- `getLabNetworkOptions(accountId, region)` — GET /labs/network-options

### Script load order (updated for M11)
`cognito-sdk` → `auth` → `authui` → `api` → `instances` → `audit` → `billing` → `analytics` → `accounts` → `users` → `backup` → `labs` → `app`

---

## Key Architecture Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| API Gateway | REST API v1 REGIONAL | COGNITO_USER_POOLS authorizer; explicit CORS per method |
| Auth | Custom SRP via amazon-cognito-identity-js SDK | Full design control; password never leaves browser; no Hosted UI redirect |
| Auth UI | Built-in login page in index.html | Enterprise branding; 6 form states; no external redirect |
| Self-signup | Open to all (Cognito rate-limited) | SaaS product — anyone can create an account |
| Domain | `solobil.com` (apex) as primary | Modern convention; `www.solobil.com` redirects via CloudFront Function |
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

### Frontend (JavaScript)
- All modules: IIFE pattern — `const ModuleName = (function() { ... return {...}; })()`
- **Script load order:** `cognito-sdk (CDN+fallback)` → `auth` → `authui` → `api` → `instances` → `audit` → `billing` → `analytics` → `accounts` → `users` → `backup` → `labs` → `app`
- **Script loading:** Cognito SDK + `auth.js` + `authui.js` are synchronous (CDN fallback uses `document.write`; `Auth` must be defined before bootstrap). All other modules (`api.js` → `app.js`) use `defer`. `Auth.init()` is called inside a `DOMContentLoaded` listener to guarantee `App` is defined when `Auth._bootApp()` calls `App.init()`.
- `const CONFIG = { /*__INJECT__*/ };` in index.html — replaced at deploy by config_injector
- Auth uses `sessionStorage`; `isNearExpiry()` = < 10 min buffer (handles Cognito clock skew)
- `Auth.init()` is the entry point — decides whether to show login page or boot dashboard
- Dashboard pages: `dashboard`, `instances`, `billing`, `analytics`, `audit`, `accounts`, `users`, `backup`, `labs`
- Admin-only pages: `accounts` and `users` tabs visible only when `App.setAdmin(true)`
- Role badge shown in sidebar: `rbac-admin` (blue) / `rbac-operator` (green) / `rbac-viewer` (gray)
- **Skeleton loading:** `App.init()` injects `.skeleton-row` shimmer placeholders into `#dash-list` and `#ag-wrap` before `Instances.refresh()` fires, so the dashboard is never blank while Lambda responds

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
- CloudFront Function (`ApexRedirectFunction`): always created but only associated when `ApexDomain` is set; checks `Host` header and returns 301

### Custom Domain (CloudFront + ACM + Route 53)
- ACM cert MUST be in us-east-1 (CloudFront requirement), even if stack is in another region
- Deploy `acm-cert-stack.yaml` to us-east-1 once per domain; CF auto-validates via Route 53
- Route 53 A ALIAS → CloudFront uses HostedZoneId `Z2FDTNDATAQYW2` (global CF zone, hardcoded)
- Cannot have a CNAME and A record for the same name — delete existing CNAMEs before deploy
- `CustomDomain` = primary domain (what users visit), `ApexDomain` = secondary (redirects to CustomDomain)

---

## Deploy

**Standard deploy (all config already set in deploy-config.env):**
```bash
./deploy.sh
```

**New custom domain setup (one-time):**
```bash
# 1. Deploy ACM cert to us-east-1
aws cloudformation deploy \
  --template-file cloudformation/acm-cert-stack.yaml \
  --stack-name ec2-control-acm-solobil --region us-east-1 --profile solobil-prod \
  --parameter-overrides DomainName=solobil.com ApexDomain=www.solobil.com HostedZoneId=Z03300705IH6KUBEMK92

# 2. Get cert ARN
aws cloudformation describe-stacks --stack-name ec2-control-acm-solobil \
  --region us-east-1 --profile solobil-prod --query 'Stacks[0].Outputs'

# 3. Set CUSTOM_DOMAIN, APEX_DOMAIN, ACM_CERT_ARN, HOSTED_ZONE_ID in deploy-config.env, then run ./deploy.sh
```

**deploy-config.env fields:** `ADMIN_EMAIL`, `COGNITO_DOMAIN_PREFIX`, `ENVIRONMENT`, `AWS_REGION` (required) | `AWS_PROFILE`, `NOTIFICATION_EMAIL`, `CUSTOM_DOMAIN`, `APEX_DOMAIN`, `ACM_CERT_ARN`, `HOSTED_ZONE_ID` (optional)

**Add member account:**
```bash
aws cloudformation deploy \
  --template-file cloudformation/member-role-stack.yaml \
  --stack-name ec2-control-member-role --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides CentralAccountId=976792586566 Environment=production \
  --region ap-south-1 --profile <member-profile>
# Then: Portal → Accounts tab → + Add Account → paste RoleArn → Test
```

---

## Git & GitHub

- **Primary repo (team):** `https://github.com/OneCloudUtopia/ec2-control-center` (private) | `origin` remote
- **Portfolio repo (Mukesh):** `https://github.com/Mukesh-Pant/ec2-control-center` (private) | `personal` remote — manually synced after prod releases
- **Branches:** `develop` (default, auto-deploys to dev) → `main` (auto-deploys to prod, Mukesh approval required)
- **CI/CD:** GitHub Actions — `.github/workflows/deploy-dev.yml` + `.github/workflows/deploy-prod.yml` (OIDC auth, no stored AWS keys)
- **Workflow:** `feat/branch` → PR to `develop` (1 approval, any member) → PR to `main` (Mukesh approval)
- **Commit at milestone/feature completion only**
- **Never commit:** `deploy-config.env`, `deploy-config-dev.env`, `.zip` files, `__pycache__/`, secrets
- **Commit types:** `feat`, `fix`, `chore`, `docs`, `refactor`
- **Portfolio sync after prod release:** `git checkout main && git pull origin main && git push personal main`
