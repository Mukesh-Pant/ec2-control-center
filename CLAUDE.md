# EC2 Control Portal v2 — Claude Project Context

## What This Project Is

A **production AWS web portal** for managing EC2 instances across multiple AWS accounts.
Users log in via Cognito (PKCE auth), see all EC2 instances grouped by account and region,
can Start / Stop / check Status of any instance, view audit logs, get idle auto-stop alerts,
and manage member AWS accounts — all serverless, zero infrastructure to manage.

**Owner:** Mukesh
**Admin email (Cognito):** pantm8877@gmail.com
**Primary region:** ap-south-1 (Mumbai)
**Cognito domain prefix:** ocu-ec2-ctrl-v2

---

## Project Status — FULLY COMPLETE PROTOTYPE ✅

All 5 milestones shipped and confirmed working in production.

| Milestone | Feature                                                                           | Status                |
| --------- | --------------------------------------------------------------------------------- | --------------------- |
| M1        | Core platform — EC2 list/start/stop, Cognito PKCE auth, CloudFront CDN            | ✅ LIVE               |
| M2        | Audit logging — DynamoDB AuditLog, /audit + /audit/daily endpoints, Audit Log tab | ✅ LIVE               |
| M3        | Scheduling                                                                        | ⏭ SKIPPED (deferred) |
| M4        | Idle auto-stop — CloudWatch CPU check every 15 min, SNS email alert               | ✅ LIVE               |
| M5        | Multi-account — Add/enable/disable/test/remove member accounts from portal UI     | ✅ LIVE               |

**REST API migration:** Migrated from HTTP API v2 → REST API v1 (COGNITO_USER_POOLS authorizer).

---

## Live AWS Resources

- **Stack:** `ec2-control-production` (ap-south-1) — status: `UPDATE_COMPLETE`
- **Portal URL:** `https://d3v0ebskiqqkg7.cloudfront.net`
- **API URL:** `https://op7ptqz36e.execute-api.ap-south-1.amazonaws.com/prod`
- **API ID (REST API v1):** `op7ptqz36e`
- **Cognito User Pool ID:** `ap-south-1_qOtoGkjER`
- **Cognito Client ID:** `2sa6co5jqct1fdumd0sr8v7jhr`
- **Cognito Domain:** `ocu-ec2-ctrl-v2.auth.ap-south-1.amazoncognito.com`
- **CloudFront Distribution ID:** `E1XDECJP6ONGSM`
- **Portal S3 Bucket:** `ec2-control-portal-196750375951-ap-south-1`
- **Code S3 Bucket:** `ec2-control-code-196750375951-ap-south-1`
- **Account Registry Table:** `ec2-control-accounts-production`
- **Audit Log Table:** `ec2-control-audit-production`
- **AWS Account ID:** `196750375951`

---

## Project File Structure

```
EC2-control-center/
├── CLAUDE.md                          ← This file
├── deploy.sh                          ← One-command deploy script (run on laptop terminal)
├── deploy-config.env                  ← Config values (already filled in)
│
├── cloudformation/
│   ├── central-stack.yaml             ← Main AWS stack (all M1-M5 resources)
│   └── member-role-stack.yaml         ← Deploy in each member AWS account (M5)
│
├── lambda/
│   ├── ec2_controller/
│   │   ├── index.py                   ← Main handler: routes /ec2, /accounts, /audit, /audit/daily
│   │   ├── accounts.py                ← STS AssumeRole + DynamoDB account registry
│   │   ├── audit.py                   ← Audit log read/write (DynamoDB AuditLog table)
│   │   └── utils.py                   ← CORS, error mapping, JWT claims extraction (REST API v1)
│   ├── config_injector/
│   │   └── index.py                   ← Custom resource: auto-deploys frontend on CF deploy
│   ├── idle_checker/
│   │   └── index.py                   ← M4: CloudWatch CPU check, auto-stop, SNS alert
│   └── scheduler/                     ← Empty (M3 deferred)
│
├── frontend/
│   ├── index.html                     ← SPA shell (CONFIG auto-injected at deploy)
│   ├── css/styles.css                 ← Full dark theme, responsive
│   └── js/
│       ├── auth.js                    ← PKCE auth flow (10-min near-expiry buffer)
│       ├── api.js                     ← Fetch wrapper with auto token refresh
│       ├── instances.js               ← Instance list, start/stop, polling
│       ├── audit.js                   ← Audit log table, filters, pagination, daily cost
│       ├── accounts.js                ← Multi-account management UI (M5)
│       └── app.js                     ← Init, tabs, toast, activity log, session timer
│
└── docs/                              ← Empty, for documentation
```

---

## Architecture (Final)

```
User Browser
    │ HTTPS (opens portal URL)
    ▼
CloudFront (CDN) ──serves──► S3 Bucket (private, stores frontend files)
    │
    │ user logs in (PKCE flow)
    ▼
Cognito Hosted UI (email+password, admin-created users only)
    │ Authorization Code returned
    ▼
frontend/js/auth.js exchanges code for JWT tokens
    │ stores tokens in sessionStorage (10-min near-expiry auto-refresh)
    ▼
frontend SPA (index.html + css/ + js/)
    │ API calls with Bearer JWT token
    ▼
REST API Gateway (API Gateway v1, REGIONAL endpoint)
    │ COGNITO_USER_POOLS authorizer validates token on every request
    ▼
Lambda: ec2-controller-production (Python 3.12, 120s timeout, 256MB)
    │ reads account registry from DynamoDB
    │ uses ThreadPoolExecutor to query all accounts/regions in parallel
    │ STS AssumeRole for member accounts (cross-account)
    ▼
EC2 instances across all registered AWS accounts

EventBridge (rate 15 min) → idle_checker Lambda → CloudWatch metrics → auto-stop + SNS email
```

---

## Key Architecture Decisions

| Decision         | Choice                                                       | Why                                                                              |
| ---------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| API Gateway      | REST API v1 (REGIONAL)                                       | Migrated from HTTP API v2 — COGNITO_USER_POOLS authorizer, explicit CORS methods |
| Auth             | Authorization Code + PKCE                                    | Replaces deprecated implicit grant; enables refresh tokens                       |
| Lambda code      | S3 zip (versioned S3Key)                                     | Guarantees code update on every CloudFormation deploy                            |
| Config injection | Custom Resource Lambda                                       | Zero manual copy-paste of CF outputs                                             |
| Multi-account    | STS AssumeRole + DynamoDB registry                           | Central account uses local credentials; member accounts use cross-account role   |
| Idle auto-stop   | Default ON, opt-out with tag `ec2-control:no-auto-stop=true` | More aggressive cost savings                                                     |

---

## Lambda API Contract

### POST /ec2

**Action: list**

```json
Request:  { "action": "list" }
Response: { "instances": [{ "instanceId", "name", "state", "instanceType", "publicIp", "region", "accountId", "accountName" }] }
```

**Action: status / start / stop**

```json
Request:  { "action": "start", "instanceId": "i-xxx", "region": "ap-south-1", "accountId": "123..." }
Response: { "message", "state", "requestedBy" }
```

### GET /accounts

```json
Response: { "accounts": [{ "accountId", "accountName", "roleArn", "enabled", "isCentral" }] }
```

Returns ALL accounts (enabled + disabled) — uses `get_all_accounts()` not `get_accounts()`.

### POST /accounts

```json
Request:  { "action": "add|update|enable|disable|remove|test", "accountId": "...", ...}
Response: { "message": "...", "accountId": "..." }
```

### GET /audit

```json
Query:    ?instanceId=i-xxx&userEmail=x@y.com&limit=50&lastKey=...
Response: { "items": [...], "lastKey": {...}, "count": N }
```

### GET /audit/daily

```json
Query:    ?instanceId=i-xxx&days=30
Response: { "instanceId", "instanceType", "hourlyRate", "totalRunningHours", "totalEstimatedCost", "summary": [...] }
```

---

## Code Patterns to Remember

### Lambda (Python) — REST API v1

- Method: `event['httpMethod']`, Path: `event['path']`
- JWT caller: `event['requestContext']['authorizer']['claims'].get('email')`
- CORS headers must be returned in EVERY response (REST API doesn't auto-add them)
- All Lambda modules imported from same directory (index.py imports utils, accounts, audit)
- `get_accounts()` → enabled only (used for EC2 listing)
- `get_all_accounts()` → all accounts including disabled (used for admin panel)

### Frontend (JavaScript)

- All JS modules are IIFE pattern: `const ModuleName = (function() { ... return { publicMethods }; })()`
- Module load order in index.html: auth.js → api.js → instances.js → audit.js → accounts.js → app.js
- CONFIG placeholder in index.html: `const CONFIG = { /*__INJECT__*/ };` (replaced at deploy)
- Auth uses `sessionStorage` (not localStorage) — clears on tab close
- `isNearExpiry()` triggers token refresh when < **10 minutes** to expiry (generous buffer for clock skew)
- API calls use `Bearer {token}` header

### CloudFormation — REST API v1

- `AuthorizationType: COGNITO_USER_POOLS` + `AuthorizerId: !Ref RestApiAuthorizer`
- Each resource needs explicit OPTIONS mock method for CORS preflight
- `GatewayResponseDefault4XX` and `GatewayResponseDefault5XX` for CORS on error responses
- `RestApiDeployment` must DependsOn ALL methods — and after each CF deploy, a fresh API deployment is created automatically by deploy.sh (prevents stale snapshots)
- `AWS::ApiGateway::Deployment` is immutable — `Description: !Sub 'Deployment ${LambdaCodeVersion}'` forces new one each deploy
- Lambda permission SourceArn: `arn:aws:execute-api:{region}:{accountId}:{RestApi}/*/*`
- `IntegrationHttpMethod: POST` on ALL integrations (even GET routes) — this is fixed for Lambda proxy

---

## Deploy Config (Already Set)

```
ADMIN_EMAIL=pantm8877@gmail.com
COGNITO_DOMAIN_PREFIX=ocu-ec2-ctrl-v2
ENVIRONMENT=production
AWS_REGION=ap-south-1
NOTIFICATION_EMAIL=pantm8877@gmail.com
```

Stack name: `ec2-control-production`
Code S3 bucket: `ec2-control-code-{AWS_ACCOUNT_ID}-ap-south-1`

---

## How to Deploy / Re-deploy

**Prerequisites:**

- AWS CLI installed and configured with admin credentials
- `zip` utility available in terminal
- Run from Git Bash on the laptop

**Command:**

```bash
cd "c:/Users/MUKESH/Desktop/EC2-control-center"
./deploy.sh
```

**What deploy.sh does automatically:**

1. Creates S3 code bucket (if not exists)
2. Zips Lambda functions (ec2_controller, idle_checker, config_injector) and frontend
3. Uploads versioned zips to S3 code bucket
4. Runs `aws cloudformation deploy` (updates stack, forces new Lambda code + new API deployment)
5. Config Injector Lambda (triggered by CloudFormation) automatically:
   - Injects CONFIG into index.html
   - Uploads frontend files to portal S3 bucket
   - Invalidates CloudFront cache
6. Prints portal URL and CloudFormation outputs

**After deploy:** Open the `PortalURL` in a browser.

---

## Adding More Users

```bash
aws cognito-idp admin-create-user \
  --user-pool-id ap-south-1_qOtoGkjER \
  --username newuser@company.com \
  --user-attributes Name=email,Value=newuser@company.com Name=email_verified,Value=true \
  --desired-delivery-mediums EMAIL \
  --region ap-south-1
```

---

## Adding Member Accounts (M5 — via Portal UI)

1. Deploy `cloudformation/member-role-stack.yaml` in the target account:

```bash
aws cloudformation deploy \
  --template-file cloudformation/member-role-stack.yaml \
  --stack-name ec2-control-member-role \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides CentralAccountId=196750375951 Environment=production \
  --region ap-south-1 \
  --profile <member-account-profile>
```

2. Copy the `RoleArn` from the stack outputs
3. Go to the **Accounts** tab in the portal → **+ Add Account**
4. Fill in Account ID, Name, and Role ARN → Click **Add Account**
5. Click **Test** to verify the cross-account connection
6. Instances from that account appear automatically in the Instances tab

---

## Known Issues / Watch-outs

- CloudFront URL changes only apply after cache invalidation (auto-handled by Config Injector)
- Cognito domain prefix `ocu-ec2-ctrl-v2` must be globally unique
- First deploy takes 8-12 minutes (CloudFront distribution creation is slow)
- Updates take 2-5 minutes
- On first login, Cognito forces a password change
- **REST API deployment snapshot** — after every CloudFormation update, a new API deployment is created automatically (prevents stale method auth config in the snapshot)

---

## Lessons Learned (All Milestones)

### M1 Deployment Gotchas

- `aws cloudformation deploy` uses changesets → `AWS::EarlyValidation::ResourceExistenceCheck` blocks on orphaned buckets. For fresh stacks use `create-stack`; for updates `deploy` is fine.
- `MfaConfiguration: 'OFF'` — must be quoted in YAML
- `CallbackURLs` set to `['https://localhost']` placeholder; Config Injector sets real CloudFront URL
- `update_user_pool_client()` does NOT accept `GenerateSecret` (create-only param)
- S3 bucket with versioning: must delete all object versions before CF can delete bucket
- IAM policy `!GetAtt` cross-refs trigger EarlyValidation — use `!Sub` computed ARNs or `'*'`
- `CloudFront ForwardedValues` instead of `CachePolicyId` to avoid EarlyValidation errors

### M2+ Deployment Gotchas

- **Lambda code not updating**: CloudFormation only calls `UpdateFunctionCode` when `S3Key` changes. Fix: include `LambdaCodeVersion` IN the S3Key: `S3Key: !Sub 'lambda/ec2-controller-${Environment}-${LambdaCodeVersion}.zip'`
- **REST API CORS**: every resource needs an explicit OPTIONS mock method — `AuthorizationType: NONE`
- **REST API event format**: `event['httpMethod']` and `event['path']` (not `requestContext.http.*` like HTTP API v2)
- **REST API claims path**: `event['requestContext']['authorizer']['claims']` (not `.jwt.claims`)
- **Cognito authorizer cache** can cache stale results when new methods are added. After CF deploy, always run `aws apigateway create-deployment --rest-api-id ... --stage-name prod` to flush — deploy.sh does this automatically.
- **`IdentitySource` for REST API Cognito authorizer**: plain string `method.request.header.Authorization` (not a YAML list like HTTP API v2)
- **YAML colons in Description strings**: must quote — `Description: 'text with colon: here'`
- **`ScanIndexForward`** is not valid on DynamoDB `scan()` — use `Query()` with `ScanIndexForward` or post-sort in Python
- **`get_accounts()` vs `get_all_accounts()`**: `get_accounts()` filters enabled=True (for EC2 listing); `get_all_accounts()` returns all (for admin panel — needed to show/re-enable disabled accounts)
- **Token near-expiry buffer**: use 10 minutes (not 5) in `isNearExpiry()` to handle server clock skew with Cognito authorizer

---

## Git & GitHub

- **Repo:** `https://github.com/Mukesh-Pant/ec2-control-center` (private)
- **Branch:** `main`
- **Commit only at milestone/feature completion** — not on every minor change
- **Never commit:** `.zip` files, `deploy-config.env`, `__pycache__/`, `.env` secrets

### Commit Message Convention

```
<type>: <short summary>

```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`

---

## Next Session Checklist

Before starting any development:

1. Read this CLAUDE.md in full
2. Run `git status` — ensure working tree is clean
3. Identify the feature or fix to work on
4. Stack is LIVE — test changes carefully; don't delete/recreate the stack
5. All milestones complete — next work is likely new features or bug fixes
