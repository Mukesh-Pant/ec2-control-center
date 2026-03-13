# EC2 Control Portal v2 — Claude Project Context

## Vision

A **production SaaS web portal** for managing EC2 instances across multiple AWS accounts.
Users log in via Cognito (PKCE auth), see all EC2 instances grouped by account and region,
can Start / Stop / check Status, view audit logs, get idle auto-stop alerts, see billing insights,
and manage member AWS accounts — fully serverless, zero infrastructure to manage.
Deployed as a SaaS product at `dashboard.solobil.com` (AWS account: `976792586566`).

**Owner:** Mukesh | **Admin email:** pantm8877@gmail.com | **Region:** ap-south-1

---

## Milestones

| # | Feature | Status |
|---|---------|--------|
| M1 | Core platform — EC2 list/start/stop, Cognito PKCE auth, CloudFront CDN | ✅ LIVE |
| M2 | Audit logging — DynamoDB AuditLog, /audit + /audit/daily endpoints | ✅ LIVE |
| M3 | Scheduling | ⏭ SKIPPED |
| M4 | Idle auto-stop — CloudWatch CPU check every 15 min, SNS email alert | ✅ LIVE |
| M5 | Multi-account — Add/enable/disable/test/remove accounts from portal UI | ✅ LIVE |
| M6 | SaaS deployment — custom domain, ACM cert, Route 53 A ALIAS | ✅ LIVE |

**API:** REST API v1 (migrated from HTTP API v2) with COGNITO_USER_POOLS authorizer.

---

## AWS Accounts

### SaaS / Production — `976792586566` (primary)
- **Stack:** `ec2-control-production` (ap-south-1)
- **Portal URL:** `https://dashboard.solobil.com`
- **Custom Domain:** `dashboard.solobil.com` | **Hosted Zone:** `Z03300705IH6KUBEMK92`
- **ACM Cert (us-east-1):** `arn:aws:acm:us-east-1:976792586566:certificate/c29bb984-228e-4875-8557-b2e9fbc94234`
- **Cognito Domain Prefix:** `solobil-ec2-ctrl-prod`
- **Code S3 Bucket:** `ec2-control-code-976792586566-ap-south-1`
- **AWS CLI Profile:** `solobil-prod`

### Personal / Prototype — `196750375951`
- **Stack:** `ec2-control-production` (ap-south-1) — UPDATE_COMPLETE
- **Portal URL:** `https://d3v0ebskiqqkg7.cloudfront.net`
- **API URL:** `https://op7ptqz36e.execute-api.ap-south-1.amazonaws.com/prod`
- **Cognito User Pool:** `ap-south-1_qOtoGkjER` | **Client:** `2sa6co5jqct1fdumd0sr8v7jhr`
- **Cognito Domain Prefix:** `ocu-ec2-ctrl-v2`
- **CloudFront Distribution:** `E1XDECJP6ONGSM`
- **AWS CLI Profile:** `default`

**Shared table names:** `ec2-control-accounts-production`, `ec2-control-audit-production`

---

## Project Structure

```
EC2-control-center/
├── deploy.sh                   ← One-command deploy (Git Bash)
├── deploy-config.env           ← Config values — never commit
├── cloudformation/
│   ├── central-stack.yaml      ← All AWS resources (M1-M6 + custom domain)
│   ├── acm-cert-stack.yaml     ← ACM cert for custom domain (us-east-1, deploy ONCE)
│   └── member-role-stack.yaml  ← Cross-account IAM role (deploy in each member account)
├── lambda/
│   ├── ec2_controller/         ← index.py, accounts.py, audit.py, utils.py
│   ├── config_injector/        ← Injects CONFIG, uploads frontend, invalidates CDN
│   └── idle_checker/           ← CloudWatch CPU check, auto-stop, SNS alert
└── frontend/
    ├── index.html              ← SPA shell (CONFIG auto-injected at deploy)
    ├── css/styles.css
    └── js/                     ← auth, api, instances, audit, billing, analytics, accounts, app
```

---

## Architecture

```
Browser → CloudFront → S3 (frontend)
       → Cognito PKCE login → JWT tokens (sessionStorage)
       → REST API Gateway (COGNITO_USER_POOLS authorizer)
       → Lambda ec2-controller (Python 3.12, 256MB, 120s)
             ├── DynamoDB (account registry + audit logs)
             ├── STS AssumeRole → member accounts
             └── ThreadPoolExecutor (parallel multi-account queries)

EventBridge (15 min) → idle_checker → CloudWatch → auto-stop + SNS
```

---

## Key Architecture Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| API Gateway | REST API v1 REGIONAL | COGNITO_USER_POOLS authorizer; explicit CORS per method |
| Auth | Authorization Code + PKCE | Refresh tokens; replaces deprecated implicit grant |
| Lambda code | Versioned S3 zip key | Forces code update on every CF deploy |
| Config injection | Custom Resource Lambda | Zero manual copy-paste of CF outputs |
| Multi-account | STS AssumeRole + DynamoDB | Central creds; cross-account via role |
| Idle auto-stop | Default ON, opt-out via tag | Aggressive cost savings |
| Custom domain | CloudFront Alias + ACM (us-east-1) + Route 53 A ALIAS | Standard CDN HTTPS pattern |

---

## API Contract

| Method | Path | Description |
|--------|------|-------------|
| POST | /ec2 | `action: list/start/stop/status` |
| GET | /accounts | All accounts (enabled + disabled) |
| POST | /accounts | `action: add/update/enable/disable/remove/test` |
| GET | /audit | `?instanceId&userEmail&limit&lastKey` |
| GET | /audit/daily | `?instanceId&days` — cost estimate |

---

## Code Patterns

### Lambda (Python) — REST API v1
- Method/path: `event['httpMethod']`, `event['path']`
- JWT caller email: `event['requestContext']['authorizer']['claims'].get('email')`
- CORS headers required in EVERY response (REST API v1 doesn't auto-add them)
- `get_accounts()` → enabled only (EC2 listing); `get_all_accounts()` → all (admin panel)

### Frontend (JavaScript)
- All modules: IIFE pattern — `const ModuleName = (function() { ... return {...}; })()`
- Load order: auth → api → instances → audit → billing → analytics → accounts → app
- `const CONFIG = { /*__INJECT__*/ };` in index.html — replaced at deploy by config_injector
- Auth uses `sessionStorage`; `isNearExpiry()` = < 10 min buffer (handles Cognito clock skew)

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
- Deploy `acm-cert-stack.yaml` to us-east-1 once per subdomain; CF auto-validates via Route 53
- Route 53 A ALIAS → CloudFront uses HostedZoneId `Z2FDTNDATAQYW2` (global CF zone, hardcoded)
- Cannot have a CNAME and A record for the same name — delete existing CNAMEs before deploy

---

## Deploy

**Standard deploy (all config already set in deploy-config.env):**
```bash
./deploy.sh
```

**New custom subdomain setup (one-time):**
```bash
# 1. Deploy ACM cert to us-east-1
aws cloudformation deploy \
  --template-file cloudformation/acm-cert-stack.yaml \
  --stack-name <stack-name> --region us-east-1 --profile solobil-prod \
  --parameter-overrides DomainName=<subdomain.solobil.com> HostedZoneId=Z03300705IH6KUBEMK92

# 2. Get cert ARN
aws cloudformation describe-stacks --stack-name <stack-name> \
  --region us-east-1 --profile solobil-prod --query 'Stacks[0].Outputs'

# 3. Set CUSTOM_DOMAIN, ACM_CERT_ARN, HOSTED_ZONE_ID in deploy-config.env, then run ./deploy.sh
```

**deploy-config.env fields:** `ADMIN_EMAIL`, `COGNITO_DOMAIN_PREFIX`, `ENVIRONMENT`, `AWS_REGION` (required) | `AWS_PROFILE`, `NOTIFICATION_EMAIL`, `CUSTOM_DOMAIN`, `ACM_CERT_ARN`, `HOSTED_ZONE_ID` (optional)

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

- **Repo:** `https://github.com/Mukesh-Pant/ec2-control-center` (private) | **Branch:** `main`
- **Commit at milestone/feature completion only**
- **Never commit:** `deploy-config.env`, `.zip` files, `__pycache__/`, secrets
- **Commit types:** `feat`, `fix`, `chore`, `docs`, `refactor`
