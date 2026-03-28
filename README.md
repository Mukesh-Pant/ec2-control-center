# EC2 Control Center

A **production SaaS web portal** for managing EC2 instances across multiple AWS accounts — with custom authentication, audit logging, idle auto-stop, billing insights, backup & restore, and direct AWS Console access. Built by **One Cloud Utopia**.

**Live Portal:** [https://solobil.com](https://solobil.com)

---

## Features

| Feature | Description |
|---|---|
| **Multi-Account EC2 Control** | List, start, and stop EC2 instances across all registered AWS accounts in one view |
| **Custom Auth (SRP)** | Built-in login page with self-signup, email verification, password reset — powered by Cognito SDK |
| **Audit Logging** | Every start/stop action logged to DynamoDB with user, timestamp, and instance metadata |
| **Idle Auto-Stop** | CloudWatch CPU monitoring every 15 min — auto-stops idle instances and sends SNS email alert |
| **Billing Insights** | Per-instance daily cost estimates using AWS Cost Explorer + EC2 pricing |
| **Analytics** | Usage trends and activity summaries across accounts |
| **Account Management** | Add, enable, disable, test, and remove member AWS accounts directly from the portal UI |
| **RBAC** | Role-based access control via Cognito groups — admins, operators, viewers with per-account grants |
| **Backup & Restore** | On-demand and scheduled EC2 backups via AWS Backup; restore to new instance or replace in place |
| **Console Login** | One-click AWS Console access for any account — each account opens in an isolated Firefox container tab |
| **Custom Domain** | Serve on your own domain with apex redirect via CloudFront + ACM + Route 53 |
| **Zero Infrastructure** | Fully serverless — API Gateway + Lambda + DynamoDB + S3 + CloudFront |

---

## Architecture

```
Browser
  │ HTTPS
  ▼
CloudFront CDN ──────────────► S3 (private — frontend files)
  │
  │ Custom auth page (built-in)
  ▼
Cognito SDK (SRP) ──► auth.js (JWT tokens in sessionStorage)
  │
  │ Bearer JWT on every request
  ▼
REST API Gateway (v1, REGIONAL, COGNITO_USER_POOLS authorizer)
  │
  ▼
Lambda: ec2-controller (Python 3.12)
  ├── STS AssumeRole → member accounts
  ├── ThreadPoolExecutor → parallel multi-account/region queries
  ├── DynamoDB → account registry + audit logs + user-account RBAC
  ├── Cognito IdP → group management (admins/operators/viewers)
  ├── Cost Explorer → billing data
  ├── AWS Backup → ec2-control-vault-production (backup, schedule, restore)
  └── AWS Federation API → console login URLs (STS AssumeRole → SigninToken)

Console Login flow:
  Portal (Console Login button)
    → POST /console-login (Lambda: STS AssumeRole → signin.aws.amazon.com federation)
    → loginUrl returned to browser
    → Firefox Extension bridges URL to background.js
    → Opens AWS Console in isolated Firefox container tab (one container per account)

Domain: solobil.com (primary) ← www.solobil.com redirects via CloudFront Function

EventBridge (every 15 min) → idle_checker Lambda → CloudWatch → auto-stop + SNS
```

---

## Project Structure

```
EC2-control-center/
├── cloudformation/
│   ├── central-stack.yaml        ← All AWS resources (deploy in your central account)
│   ├── acm-cert-stack.yaml       ← ACM cert for custom domain (deploy to us-east-1 once)
│   └── member-role-stack.yaml    ← Cross-account IAM role (deploy in each member account)
├── lambda/
│   ├── ec2_controller/
│   │   ├── index.py              ← Main handler: /ec2, /accounts, /audit, /pricing, /users, /backup, /console-login
│   │   ├── accounts.py           ← Account registry (DynamoDB + STS AssumeRole)
│   │   ├── audit.py              ← Audit log read/write
│   │   ├── backup.py             ← AWS Backup: on-demand, schedules, restore, delete
│   │   ├── console_login.py      ← Console login: STS AssumeRole → Federation API → SigninToken URL
│   │   ├── pricing.py            ← EC2 on-demand pricing lookup
│   │   └── utils.py              ← CORS helpers, JWT claims, error mapping, RBAC helpers
│   ├── config_injector/
│   │   └── index.py              ← Custom resource: injects CONFIG, uploads frontend, invalidates CDN
│   └── idle_checker/
│       └── index.py              ← CPU check, auto-stop, SNS alert
├── frontend/
│   ├── index.html                ← SPA shell + auth page (CONFIG auto-injected at deploy)
│   ├── oculogo.png               ← One Cloud Utopia logo
│   ├── css/styles.css            ← Dark theme dashboard + auth page styles
│   └── js/
│       ├── auth.js               ← Cognito SDK SRP auth, token management
│       ├── authui.js             ← Auth page UI controller (forms, validation, loading)
│       ├── api.js                ← Fetch wrapper with auto-refresh
│       ├── instances.js          ← Instance list + controls (RBAC-aware)
│       ├── audit.js              ← Audit log + daily cost view
│       ├── billing.js            ← Billing dashboard
│       ├── analytics.js          ← Usage analytics
│       ├── accounts.js           ← Multi-account management + Console Login button
│       ├── users.js              ← User management: roles, account grants (admin only)
│       ├── backup.js             ← Backup dashboard: on-demand, schedules, restore
│       ├── app.js                ← App init, tabs, toast, session timer, role badge, extension detection
│       └── vendor/
│           └── amazon-cognito-identity.min.js  ← Cognito SDK v6.3.12 (CDN fallback)
├── firefox-extension/
│   ├── manifest.json             ← MV3 extension manifest (solobil.com + www.solobil.com)
│   ├── background.js             ← Container tab manager: one named container per AWS account
│   ├── content.js                ← Signals extension presence to portal; bridges postMessage to background
│   └── icons/
│       ├── icon-48.png
│       └── icon-96.png
├── deploy.sh                     ← One-command deploy
├── deploy-config.env             ← Your config values (never commit — contains secrets)
└── CLAUDE.md                     ← Full project context for AI-assisted development
```

---

## Deploy

### Prerequisites
- AWS CLI configured with admin credentials for your central account
- `zip` utility in your terminal (Git Bash on Windows)

### 1. Configure `deploy-config.env`

```env
ADMIN_EMAIL=you@example.com
COGNITO_DOMAIN_PREFIX=your-unique-prefix   # globally unique across all AWS accounts
ENVIRONMENT=production
AWS_REGION=ap-south-1
NOTIFICATION_EMAIL=you@example.com

# Optional: custom domain
CUSTOM_DOMAIN=yourdomain.com
APEX_DOMAIN=www.yourdomain.com             # redirects to CUSTOM_DOMAIN
ACM_CERT_ARN=arn:aws:acm:us-east-1:...    # must be from us-east-1
HOSTED_ZONE_ID=Z...                        # Route 53 hosted zone for your domain
```

### 2. (Optional) Set up custom domain — one time per domain

```bash
# Deploy ACM cert to us-east-1 (required for CloudFront)
aws cloudformation deploy \
  --template-file cloudformation/acm-cert-stack.yaml \
  --stack-name ec2-control-acm-cert \
  --region us-east-1 \
  --parameter-overrides DomainName=yourdomain.com ApexDomain=www.yourdomain.com HostedZoneId=<zone-id>

# Get cert ARN and paste into deploy-config.env as ACM_CERT_ARN
aws cloudformation describe-stacks --stack-name ec2-control-acm-cert \
  --region us-east-1 --query 'Stacks[0].Outputs'
```

### 3. Deploy

```bash
./deploy.sh
```

This will:
1. Create the S3 code bucket (if needed)
2. Zip and upload Lambda functions + frontend
3. Deploy/update the CloudFormation stack (including custom domain + Route 53 records if set)
4. Auto-inject config into the frontend, push to S3, invalidate CloudFront cache
5. Flush the REST API deployment snapshot
6. Print the portal URL

First deploy: ~8-12 min (CloudFront). Updates: ~2-5 min.

---

## Team Development

This project uses a GitFlow-Lite workflow with two isolated AWS environments:

| Branch | Environment | Deploy | Who can merge |
|--------|-------------|--------|---------------|
| `develop` | Dev (ocu_dev account) | Auto via GitHub Actions | 1 approval — any team member |
| `main` | Production (solobil.com) | Auto via GitHub Actions | Mukesh approval required |

**Workflow:**
1. Create a feature branch from `develop`
2. Open a PR targeting `develop` — any team member approves → auto-deploys to dev
3. Verify on the dev environment URL
4. Mukesh opens PR: `develop` → `main` → merge → auto-deploys to production

**CI/CD:** GitHub Actions with AWS OIDC (no stored credentials). See `.github/workflows/`.

For the full onboarding guide, branch naming, commit format, and code patterns: see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Adding Member AWS Accounts

1. Deploy the cross-account role in the target account:

```bash
aws cloudformation deploy \
  --template-file cloudformation/member-role-stack.yaml \
  --stack-name ec2-control-member-role \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides CentralAccountId=<YOUR_CENTRAL_ACCOUNT_ID> Environment=production \
  --region ap-south-1 \
  --profile <member-account-profile>
```

2. Copy the `RoleArn` from the stack outputs.
3. In the portal → **Accounts** tab → **+ Add Account** → paste the Role ARN.
4. Click **Test** to verify. Instances appear immediately in the Instances tab.

---

## Console Login

The **Console Login** button on each account card opens the AWS Management Console for that account directly in your browser — authenticated as the cross-account role, no manual credential copy-paste required.

### How it works

1. The portal calls `POST /console-login` with the target account ID
2. The Lambda assumes the cross-account role via STS and exchanges the temporary credentials for an AWS Federation SigninToken
3. The signed console URL is sent back to the browser
4. The **EC2 Control Firefox Extension** opens the URL in an isolated container tab — each AWS account gets its own named container so sessions never mix

### Browser Extension

The extension is required for Console Login (it handles opening container tabs). Install it in Firefox:

1. Download the `firefox-extension/` directory
2. In Firefox, go to `about:debugging` → **This Firefox** → **Load Temporary Add-on** → select `manifest.json`
3. For permanent install, submit to [addons.mozilla.org](https://addons.mozilla.org) as an unlisted add-on

The portal displays an **Install Extension** banner when the extension is not detected.

### Notes

- Console sessions last **59 minutes** (AWS hard limit for role-chained credentials)
- Each AWS account gets a dedicated Firefox container — no cross-account cookie bleed
- Re-clicking Console Login focuses the existing tab if it is still open
- RBAC: **admins and operators** only — viewers cannot use Console Login

---

## Backup & Restore

The Backup tab lets you create and manage EC2 backups powered by **AWS Backup**:

- **On-demand backup** — snapshot any instance immediately
- **Scheduled backups** — daily, weekly, monthly (or custom cron), any time you choose, with configurable retention (7 / 30 / 90 / 365 days)
- **Restore** — restore a recovery point to a **new instance** (original keeps running) or **replace** (original is stopped after restore starts)
- **RBAC-aware** — admins full access; operators can backup/restore assigned accounts; viewers see history only

Recovery points are stored in the central vault `ec2-control-vault-production`.

> **Adding a new member account:** after onboarding via the Accounts tab, also add the account ARN to the vault `AccessPolicy` in `cloudformation/central-stack.yaml` and redeploy.

---

## Idle Auto-Stop

- Checks all running instances every **15 minutes** via EventBridge
- Stops instances with CPU < 5% for the past 30 minutes
- Sends an SNS email alert to `NOTIFICATION_EMAIL`
- Opt out per-instance with tag: `ec2-control:no-auto-stop = true`

---

## Tech Stack

| Layer | Service |
|---|---|
| Frontend hosting | S3 + CloudFront |
| Auth | Cognito (Custom UI, SRP via amazon-cognito-identity-js) |
| API | API Gateway REST v1 + Lambda (Python 3.12) |
| Database | DynamoDB (account registry + audit logs) |
| Scheduling | EventBridge |
| Notifications | SNS |
| Billing | AWS Cost Explorer |
| Backup | AWS Backup (vault, plans, restore jobs) |
| Console Access | STS Federation + Firefox Extension (container tabs) |
| IaC | CloudFormation |

---

## License

MIT
