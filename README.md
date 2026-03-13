# EC2 Control Center

A **production-ready, serverless AWS web portal** for managing EC2 instances across multiple AWS accounts — with Cognito authentication, audit logging, idle auto-stop, billing insights, and a clean dark-ops UI.

## Live Portal

**URL:** [https://d3v0ebskiqqkg7.cloudfront.net](https://d3v0ebskiqqkg7.cloudfront.net)

---

## Features

| Feature | Description |
|---|---|
| **Multi-Account EC2 Control** | List, start, and stop EC2 instances across all registered AWS accounts in one view |
| **Cognito Auth (PKCE)** | Secure login via AWS Cognito Hosted UI — admin-created users only, no self-signup |
| **Audit Logging** | Every start/stop action logged to DynamoDB with user, timestamp, and instance metadata |
| **Idle Auto-Stop** | CloudWatch CPU monitoring every 15 min — auto-stops idle instances and sends SNS email alert |
| **Billing Insights** | Per-instance daily cost estimates using AWS Cost Explorer + EC2 pricing |
| **Account Management** | Add, enable, disable, test, and remove member AWS accounts directly from the portal UI |
| **Zero Infrastructure** | Fully serverless — API Gateway + Lambda + DynamoDB + S3 + CloudFront |

---

## Architecture

```
User Browser
    │ HTTPS
    ▼
CloudFront CDN ──────────────► S3 (private — frontend files)
    │
    │ Cognito PKCE login
    ▼
Cognito Hosted UI ──► auth.js (JWT tokens in sessionStorage)
    │
    │ Bearer JWT on every request
    ▼
REST API Gateway (v1, REGIONAL, COGNITO_USER_POOLS authorizer)
    │
    ▼
Lambda: ec2-controller (Python 3.12)
    ├── STS AssumeRole → member accounts
    ├── ThreadPoolExecutor → parallel multi-account/region queries
    ├── DynamoDB → account registry + audit logs
    └── Cost Explorer → billing data

EventBridge (every 15 min) → idle_checker Lambda → CloudWatch → auto-stop + SNS
```

---

## Project Structure

```
EC2-control-center/
├── cloudformation/
│   ├── central-stack.yaml        ← All AWS resources (deploy in your central account)
│   └── member-role-stack.yaml    ← Cross-account IAM role (deploy in each member account)
│
├── lambda/
│   ├── ec2_controller/
│   │   ├── index.py              ← Main handler: /ec2, /accounts, /audit, /billing routes
│   │   ├── accounts.py           ← Account registry (DynamoDB + STS AssumeRole)
│   │   ├── audit.py              ← Audit log read/write
│   │   ├── pricing.py            ← EC2 instance hourly pricing data
│   │   └── utils.py              ← CORS helpers, JWT claims, error mapping
│   ├── config_injector/
│   │   └── index.py              ← Custom resource: injects CONFIG, uploads frontend, invalidates CDN
│   └── idle_checker/
│       └── index.py              ← CPU check, auto-stop, SNS alert
│
├── frontend/
│   ├── index.html                ← SPA shell (CONFIG auto-injected at deploy)
│   ├── css/styles.css            ← Dark theme, responsive
│   └── js/
│       ├── auth.js               ← PKCE flow, token refresh
│       ├── api.js                ← Fetch wrapper with auto-refresh
│       ├── instances.js          ← Instance list + controls
│       ├── audit.js              ← Audit log + daily cost view
│       ├── billing.js            ← Billing dashboard
│       ├── accounts.js           ← Multi-account management
│       └── app.js                ← App init, tabs, toast, session timer
│
├── deploy.sh                     ← One-command deploy
├── deploy-config.env             ← Your config values (never commit secrets)
└── CLAUDE.md                     ← Full project context for AI-assisted development
```

---

## Prerequisites

- AWS CLI configured with admin credentials for your central account
- `zip` utility in your terminal (Git Bash on Windows)
- An AWS account to serve as the **central account**

---

## Deploy

### 1. Configure

Edit `deploy-config.env`:

```env
ADMIN_EMAIL=you@example.com
COGNITO_DOMAIN_PREFIX=your-unique-prefix   # globally unique
ENVIRONMENT=production
AWS_REGION=ap-south-1
NOTIFICATION_EMAIL=you@example.com
```

### 2. Deploy

```bash
cd EC2-control-center
./deploy.sh
```

This will:
1. Create the S3 code bucket (if needed)
2. Zip and upload Lambda functions + frontend
3. Deploy/update the CloudFormation stack
4. Automatically inject config into the frontend and push it to CloudFront
5. Print the portal URL

First deploy takes ~8-12 minutes (CloudFront). Updates take ~2-5 minutes.

### 3. Create your admin user

```bash
aws cognito-idp admin-create-user \
  --user-pool-id <UserPoolId> \
  --username you@example.com \
  --user-attributes Name=email,Value=you@example.com Name=email_verified,Value=true \
  --desired-delivery-mediums EMAIL \
  --region ap-south-1
```

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
| Auth | Cognito (Hosted UI, PKCE) |
| API | API Gateway REST v1 + Lambda (Python 3.12) |
| Database | DynamoDB (account registry + audit logs) |
| Scheduling | EventBridge |
| Notifications | SNS |
| Billing | AWS Cost Explorer |
| IaC | CloudFormation |

---

## License

MIT
