# EC2 Control Center

A **production SaaS web portal** for managing EC2 instances across multiple AWS accounts — with custom authentication, audit logging, idle auto-stop, billing insights, backup & restore, direct AWS Console access, self-service lab provisioning, and full business finance tracking. Built by **[One Cloud Utopia](https://onecloudutopia.com)**.

Frontend v2.0.0 is a full **React 18 + TypeScript 5.6 + Vite 5** rewrite — replacing the original vanilla JS frontend with a type-safe, component-driven SPA backed by TanStack Query v5 and Zustand 5.

**Live Portal:** [https://app.onecloudutopia.com](https://app.onecloudutopia.com)

---

## Features

| Feature | Description |
|---|---|
| **Multi-Account EC2 Control** | List, start, and stop EC2 instances across all registered AWS accounts in a single unified view |
| **Custom Auth (SRP)** | Built-in login page with self-signup, email verification, and password reset — powered by the Cognito SDK with SRP; no Hosted UI redirect |
| **Audit Logging** | Every start/stop action logged to DynamoDB with user email, timestamp, instance metadata, and account context |
| **Idle Auto-Stop** | CloudWatch CPU monitoring every 15 minutes — automatically stops idle instances and sends an SNS email alert |
| **Billing Insights** | Per-instance daily cost estimates using AWS Cost Explorer + EC2 pricing API |
| **Analytics** | Usage trends and activity summaries across all accounts and regions |
| **Account Management** | Add, enable, disable, test, and remove member AWS accounts directly from the portal UI; Quick-Add with CloudFormation one-click button |
| **RBAC** | Role-based access: admins, operators (per-account), and viewers (read-only) — managed via Cognito groups + DynamoDB assignments |
| **Backup & Restore** | On-demand and scheduled EC2 backups via AWS Backup; restore to a new instance or stop-and-replace in place |
| **Console Login** | One-click AWS Console access — each account opens in an isolated Firefox container tab with no cross-account cookie bleed |
| **My Servers (Labs)** | Self-service EC2 lab provisioning — 4-step wizard, payment upload, admin approval gate, key pair download, RDP password retrieval |
| **Lab Settings** | Admin controls for pricing (WHT/VAT/margin/discount), currency rates, and reusable lab templates |
| **Finance Module** | OCU business finances — Vendors, Customers, Alerts, and Finance Settings; full CRUD with admin-gated mutations |
| **Custom Domain** | CloudFront + ACM (us-east-1) + Route 53 A ALIAS; serves from Asia Pacific edge nodes for India-region users |
| **Zero Infrastructure** | Fully serverless — API Gateway REST v1 + Lambda + DynamoDB + S3 + CloudFront |

---

## Architecture

```
Browser
  │ HTTPS
  ▼
CloudFront CDN (PriceClass_200) ─────► S3 (private — React build artifacts)
  │
  │ React 18 SPA (TypeScript strict, Vite 5 build)
  │   ├── lib/auth.ts  — Cognito SDK SRP login → JWT in sessionStorage
  │   ├── stores/auth.ts  — Zustand 5 auth store (email, role, isAuthenticated)
  │   └── lib/api.ts  — apiFetch<T>: Bearer JWT, ApiError, auto-refresh on 401
  │
  │ REST API calls (Bearer JWT)
  ▼
API Gateway REST v1 (REGIONAL, COGNITO_USER_POOLS authorizer)
  │
  ▼
Lambda: ec2-controller (Python 3.12, 512 MB, 120 s)
  ├── STS AssumeRole → member accounts  (credentials cached 10 min, thread-safe)
  ├── ThreadPoolExecutor → parallel multi-account/region EC2 queries
  ├── DynamoDB → accounts + audit logs + RBAC assignments + labs + finance
  ├── Cognito IdP → group management (admins / operators / viewers)
  ├── Cost Explorer → billing data
  ├── AWS Backup → ec2-control-vault-production (backup, schedule, restore)
  ├── AWS Federation API → Console Login (STS → SigninToken URL)
  ├── Labs (My Servers) → key pair + EIP + EC2 provisioning, pending-approval gate
  └── Finance → /finance/vendors, /finance/customers, /finance/alerts, /finance/settings

Console Login flow:
  Portal → POST /console-login → Lambda STS AssumeRole → Federation SigninToken
         → loginUrl → Firefox Extension → isolated container tab per AWS account

EventBridge (every 15 min) → idle_checker Lambda → CloudWatch → auto-stop + SNS
```

### Navigation

| Section | Pages | Access |
|---------|-------|--------|
| Overview | Dashboard, Instances, Backups, My Servers | All authenticated roles |
| Intelligence | Billing & Cost, Analytics, Audit Log | All authenticated roles |
| Finance | Vendors, Customers, Alerts, Fin Settings | All authenticated roles |
| Administration | Accounts, Users, Lab Settings | Admin only |

---

## Project Structure

```
EC2-control-center/
├── deploy.sh                         ← One-command deploy (Git Bash / Linux)
├── deploy-config.env                 ← Config values — never commit
├── example-deploy-config.env         ← Template for deploy-config.env
├── cloudformation/
│   ├── central-stack.yaml            ← All AWS resources (deploy in your central account)
│   ├── acm-cert-stack.yaml           ← ACM cert for custom domain (deploy to us-east-1 once)
│   └── member-role-stack.yaml        ← Cross-account IAM role (deploy in each member account)
├── lambda/
│   ├── ec2_controller/
│   │   ├── index.py                  ← Main handler: routes /ec2, /accounts, /audit, /pricing,
│   │   │                                /users, /backup, /console-login, /labs, /finance
│   │   ├── accounts.py               ← Account registry (DynamoDB + STS AssumeRole)
│   │   ├── audit.py                  ← Audit log read/write
│   │   ├── backup.py                 ← AWS Backup: on-demand, schedules, restore, delete
│   │   ├── console_login.py          ← STS AssumeRole → Federation API → SigninToken URL
│   │   ├── finance.py                ← Finance: vendors, customers, alerts, settings (DynamoDB)
│   │   ├── labs.py                   ← My Servers: submit/approve/reject, EIP, payment, pricing settings, templates
│   │   ├── pricing.py                ← EC2 on-demand pricing lookup
│   │   └── utils.py                  ← CORS helpers, JWT claims, error mapping, RBAC helpers
│   ├── config_injector/
│   │   └── index.py                  ← Custom resource: injects CONFIG, uploads build, invalidates CDN
│   └── idle_checker/
│       └── index.py                  ← CPU check, auto-stop, SNS alert
├── firefox-extension/
│   ├── manifest.json                 ← MV3 manifest (matches app.onecloudutopia.com)
│   ├── background.js                 ← Container tab manager: one named container per AWS account
│   ├── content.js                    ← Signals extension presence; bridges postMessage → background
│   └── icons/
└── frontend/                         ← React 18 + TypeScript 5.6 + Vite 5 SPA (v2.0.0)
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    └── src/
        ├── main.tsx                  ← React 18 createRoot + QueryClientProvider + RouterProvider
        ├── App.tsx                   ← Root router with <RequireAuth> guard
        ├── components/ui/            ← Shared UI primitives (Button, Badge, Card, PageHeader, etc.)
        ├── lib/
        │   ├── api.ts                ← apiFetch<T>: Bearer JWT, ApiError, auto-refresh on 401
        │   └── auth.ts               ← Cognito SDK SRP wrapper (getRole, getToken, refreshTokens, logout)
        ├── lib/queries/              ← TanStack Query hooks by domain
        │   ├── accounts.ts           ← useAccounts
        │   ├── finance.ts            ← useVendors, useCustomers, useFinanceAlerts, useFinanceSettings (+ mutations)
        │   └── ...                   ← labs, labSettings, labTemplates, etc.
        ├── pages/
        │   ├── auth/                 ← Login, SignUp, VerifyEmail, ForgotPassword
        │   └── app/
        │       ├── DashboardScreen.tsx
        │       ├── InstancesScreen.tsx
        │       ├── BackupsScreen.tsx
        │       ├── MyServersScreen.tsx       ← RBAC guard + LabWizard + LabList
        │       ├── BillingScreen.tsx
        │       ├── AnalyticsScreen.tsx
        │       ├── AuditScreen.tsx
        │       ├── AccountsScreen.tsx
        │       ├── UsersScreen.tsx
        │       ├── LabSettingsScreen.tsx     ← Admin: pricing settings + template management
        │       ├── finance/
        │       │   ├── VendorsScreen.tsx     ← Full CRUD: stats, filters, inline add/edit/delete
        │       │   ├── CustomersScreen.tsx   ← Full CRUD: stats, filters, inline add/edit/delete
        │       │   ├── AlertsScreen.tsx      ← Live finance alerts (contract expiry, payment due, etc.)
        │       │   └── FinSettingsScreen.tsx ← Exchange rates, tax per-account, global rate defaults
        │       └── labs/
        │           ├── LabList.tsx           ← Filterable row table with inline expand panel
        │           ├── LabRow.tsx            ← Row + inline detail panel
        │           └── LabWizard.tsx         ← 4-step provisioning wizard
        └── stores/
            ├── auth.ts               ← Zustand 5 auth store (email, role, isAuthenticated, isBooting)
            └── tweaks.ts             ← Zustand 5 UI tweaks/preferences store
```

---

## Deploy

### Prerequisites

- AWS CLI configured with admin credentials for your central account
- Node.js 18+ (for building the React frontend)
- `zip` utility in your terminal (Git Bash on Windows)

### 1. Configure `deploy-config.env`

Copy `example-deploy-config.env` to `deploy-config.env` and fill in your values:

```env
ADMIN_EMAIL=you@example.com
COGNITO_DOMAIN_PREFIX=your-unique-prefix   # must be globally unique across AWS
ENVIRONMENT=production
AWS_REGION=ap-south-1
NOTIFICATION_EMAIL=you@example.com

# Optional: custom domain
CUSTOM_DOMAIN=yourdomain.com
APEX_DOMAIN=www.yourdomain.com             # redirects to CUSTOM_DOMAIN
ACM_CERT_ARN=arn:aws:acm:us-east-1:...    # must be in us-east-1 (CloudFront requirement)
HOSTED_ZONE_ID=Z...                        # Route 53 hosted zone ID for your domain
```

### 2. (Optional) Set up a custom domain — one time per domain

```bash
# Deploy ACM cert to us-east-1 (required by CloudFront)
aws cloudformation deploy \
  --template-file cloudformation/acm-cert-stack.yaml \
  --stack-name ec2-control-acm-cert \
  --region us-east-1 \
  --parameter-overrides DomainName=yourdomain.com HostedZoneId=<zone-id>

# Copy the cert ARN from Outputs into deploy-config.env as ACM_CERT_ARN
aws cloudformation describe-stacks \
  --stack-name ec2-control-acm-cert \
  --region us-east-1 \
  --query 'Stacks[0].Outputs'
```

### 3. Build and deploy

```bash
cd frontend && npm install && npm run build && cd ..
./deploy.sh
```

`deploy.sh` will:
1. Create the S3 code bucket (if it doesn't exist)
2. Zip and upload Lambda functions + React frontend build
3. Deploy / update the CloudFormation stack (including domain + Route 53 if configured)
4. Auto-inject runtime config into the frontend, push to S3, and invalidate the CloudFront cache
5. Upload `member-role-stack.yaml` to the public templates bucket (enables the Quick-Add button)
6. Flush the REST API deployment snapshot to avoid stale auth caching
7. Print the portal URL

**First deploy:** ~8–12 minutes (CloudFront distribution creation).  
**Subsequent updates:** ~2–5 minutes.

---

## Team Development

This project uses a GitFlow-Lite workflow with two isolated AWS environments:

| Branch | Environment | Deploy | Approval |
|--------|-------------|--------|----------|
| `develop` | Dev (`d1f7pmzpwdrl1i.cloudfront.net`) | Auto via GitHub Actions | 1 team member |
| `main` | Production (`app.onecloudutopia.com`) | Auto via GitHub Actions | Mukesh only |

**Workflow:**
1. Create a feature branch off `develop`
2. Open a PR targeting `develop` → 1 approval → merges → auto-deploys to dev
3. Verify on the dev environment
4. Open a PR `develop` → `main` → Mukesh approves → merges → auto-deploys to production

**CI/CD:** GitHub Actions with AWS OIDC (no stored credentials). See `.github/workflows/`.

---

## Adding Member AWS Accounts

The **+ Add Account** modal in the Accounts tab guides you through onboarding in two steps.

### Step 1 — Deploy the IAM role in the target account

Click **+ Add Account** → select an AWS region → click **Open CloudFormation in AWS Console**. CloudFormation opens in a new tab with the template and parameters pre-filled:

- Template automatically loaded from the hosted S3 URL
- `CentralAccountId` and `Environment` pre-populated
- Suggested stack name: `ec2-control-member-role`

Click **Deploy**, wait for `CREATE_COMPLETE` (~2 min), then go to the **Outputs** tab.

**CLI alternative:**
```bash
aws cloudformation deploy \
  --template-file cloudformation/member-role-stack.yaml \
  --stack-name ec2-control-member-role \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides CentralAccountId=<YOUR_CENTRAL_ACCOUNT_ID> Environment=production \
  --region ap-south-1 \
  --profile <member-account-profile>
```

### Step 2 — Register the account in the portal

Back in the Add Account modal:
1. Enter the **Account ID** (12-digit) and a friendly **Account Name**
2. Paste **`RoleArn`** from CloudFormation Outputs → **Cross-Account Role ARN** field
3. Paste **`ConsoleRoleArn`** → **Console Login Role ARN** field *(enables one-click Console Login)*
4. Click **Add Account** → **Test** to verify cross-account connectivity

Instances from the new account appear immediately in the Instances tab.

---

## Console Login

The **Console Login** button on each account card opens the AWS Management Console for that account — authenticated as the cross-account role, no manual credential handling required.

### How it works

1. Portal calls `POST /console-login` with the target account ID
2. Lambda assumes the cross-account role via STS and exchanges the temporary credentials for an AWS Federation SigninToken
3. The signed console URL is returned to the browser
4. The **EC2 Control Firefox Extension** opens the URL in an isolated Firefox container tab — one named container per AWS account, so sessions never mix

### Installing the Firefox Extension

1. Download or clone the `firefox-extension/` directory
2. In Firefox: `about:debugging` → **This Firefox** → **Load Temporary Add-on** → select `manifest.json`
3. For a permanent install, submit to [addons.mozilla.org](https://addons.mozilla.org) as an unlisted add-on

The portal displays an **Install Extension** banner if the extension is not detected.

### Notes

- Console sessions last **59 minutes** (AWS hard limit for role-chained STS credentials)
- Re-clicking Console Login focuses the existing tab rather than opening a duplicate
- RBAC: **admins and operators** only — viewers cannot use Console Login

---

## Backup & Restore

The **Backups** tab provides full EC2 backup management powered by AWS Backup:

- **On-demand backup** — snapshot any instance immediately from the portal
- **Scheduled backups** — daily, weekly, monthly, or custom cron with configurable retention (7 / 30 / 90 / 365 days)
- **Restore** — restore to a **new instance** (original keeps running) or **replace in place** (original is stopped after restore begins)
- **RBAC-aware** — admins have full access; operators can backup/restore assigned accounts; viewers see history only

All recovery points are stored in the central vault `ec2-control-vault-production`.

> **Note:** After onboarding a new member account via the Accounts tab, add the account ARN to the vault `AccessPolicy` in `cloudformation/central-stack.yaml` and redeploy to allow cross-account backup access.

---

## My Servers (Labs)

The **My Servers** tab lets operators provision a dedicated EC2 instance for hands-on lab work, with an admin approval gate before any EC2 is launched.

### Provisioning flow

| Step | What happens |
|------|-------------|
| **1. Configure** | Choose region, instance type (vCPU/RAM shown), OS, storage, and usage duration |
| **2. Pricing** | Review cost breakdown with WHT/VAT/margin applied; link to AWS Pricing Calculator |
| **3. Payment** | Upload a payment screenshot as proof of funding |
| **4. Submitted** | Request saved as `pending_approval` — no EC2 launched yet |

An admin opens the **Pending** filter in My Servers, expands the lab row, reviews the payment, and clicks **Approve** or **Reject**:
- **Approve** → key pair created, instance launched, Elastic IP allocated → status moves to `Running`
- **Reject** → status set to `Rejected`, no EC2 created

### Dashboard filters

| Filter | Contents |
|--------|----------|
| **Active** | Running + Provisioning labs |
| **Pending** | Labs awaiting admin approval |
| **History** | Terminated + Rejected labs |
| **All** | Every lab record |

Expanding a row shows connection details, SSH/RDP access info, Elastic IP allocation, and contextual actions (Download .pem, RDP Password, Terminate).

### Lab Settings *(admin only)*

- **Pricing Settings** — configure WHT%, VAT%, margin%, discount%, currency rate, data transfer rate, and backup/monitoring inclusion toggles applied to all cost estimates
- **Template Management** — create reusable lab configurations (instance type, platform, storage, duration) that operators can apply in one click from the wizard

---

## Finance Module

The **Finance** section tracks OCU's own business finances — fully separate from the EC2 billing and cost features.

| Screen | Description |
|--------|-------------|
| **Vendors** | Manage suppliers and contractors — CRUD with billing type, currency, amount, contract end date, and status. Stats: total vendors, active vendors, USD monthly spend. |
| **Customers** | Manage client relationships — CRUD with contract value, outstanding amount, due dates, and agreement end. Stats: total customers, USD contract value, USD outstanding. |
| **Alerts** | Live finance alerts — contract expiry warnings, payment overdue notices, and milestone alerts, generated automatically from vendor/customer data. |
| **Fin Settings** | Exchange rates (USD→NPR, INR→NPR), global WHT/VAT/margin rates, per-account tax overrides, warning thresholds, and default currency. |

All mutations (add, update, delete) are **admin-only**. Read access is available to all authenticated roles.

---

## Idle Auto-Stop

- Runs every **15 minutes** via EventBridge
- Stops any running instance with CPU utilisation below **5% for 30 consecutive minutes**
- Sends an SNS email alert to `NOTIFICATION_EMAIL`
- **Opt out** per instance with the tag: `ec2-control:no-auto-stop = true`

---

## Performance

| Area | Optimisation |
|------|-------------|
| **STS credential caching** | Assumed-role credentials are cached per account for 10 min in a thread-safe module-level dict — prevents STS rate-limit errors under the 20-thread `ThreadPoolExecutor` |
| **boto3 singletons** | All boto3 clients are module-level singletons — created once per warm Lambda container, not per request |
| **DynamoDB pagination** | All table scans loop over `LastEvaluatedKey` — no silent record truncation at the ~1 MB page boundary |
| **TanStack Query** | Client-side caching with `staleTime` + background refetch — eliminates redundant API calls across page visits |
| **Lambda memory** | Main Lambda runs at 512 MB. Lambda CPU scales linearly with memory, cutting parallel STS/EC2 execution time by ~30–50% vs 256 MB |
| **CloudFront PriceClass_200** | Serves India, South-East Asia, and Japan from regional edge nodes instead of routing through Europe |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 · TypeScript 5.6 · Vite 5 |
| Server state | TanStack Query v5 |
| Client state | Zustand 5 |
| Routing | React Router v6 |
| Frontend hosting | S3 (private) + CloudFront CDN |
| Authentication | Amazon Cognito (custom React UI, SRP via `amazon-cognito-identity-js`) |
| API | API Gateway REST v1 + Lambda Python 3.12 |
| Database | DynamoDB (accounts · audit · RBAC · labs · finance) |
| Scheduling | EventBridge |
| Notifications | SNS |
| Billing data | AWS Cost Explorer |
| Backup | AWS Backup (vault, plans, restore jobs) |
| Console access | STS Federation API + Firefox Extension (container tabs) |
| Infrastructure | CloudFormation |

---

## License

MIT
