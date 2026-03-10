# EC2 Control Portal v2 — Claude Project Context

## What This Project Is

A **production AWS web portal** for managing EC2 instances across multiple AWS accounts.
Users log in via Cognito (PKCE auth), see all EC2 instances grouped by account and region,
and can Start / Stop / check Status of any instance. Everything is serverless — no servers to manage.

**Owner:** Mukesh
**Admin email (Cognito):** joshiadarsh421@gmail.com
**Primary region:** ap-south-1 (Mumbai)
**Cognito domain prefix:** ocu-ec2-ctrl-v2

---

## Project Location

```
c:\Users\MUKESH\Desktop\EC2-control-center\
```

The `AutomateServer-main/` subfolder is the OLD v1 codebase (kept for reference only).
All new v2 code is in the root-level folders.

---

## Current Build State

### ✅ MILESTONE 1 — COMPLETE + LIVE IN PRODUCTION
Fully deployed, tested, and working. Portal is live. Start/stop EC2 instances confirmed working.

**Live AWS Resources:**
- Stack name: `ec2-control-production` (ap-south-1) — status: `CREATE_COMPLETE`
- Portal URL: `https://d3v0ebskiqqkg7.cloudfront.net`
- API URL: `https://f791qibyod.execute-api.ap-south-1.amazonaws.com`
- Cognito User Pool ID: `ap-south-1_qOtoGkjER`
- Cognito Client ID: `2sa6co5jqct1fdumd0sr8v7jhr`
- Cognito Domain: `ocu-ec2-ctrl-v2.auth.ap-south-1.amazoncognito.com`
- CloudFront Distribution ID: `E1XDECJP6ONGSM`
- Portal S3 Bucket: `ec2-control-portal-196750375951-ap-south-1`
- Code S3 Bucket: `ec2-control-code-196750375951-ap-south-1`
- Account Registry DynamoDB Table: `ec2-control-accounts-production`
- AWS Account ID: `196750375951`

### ⏳ MILESTONE 2 — NEXT (Audit Logging)
### ⏳ MILESTONE 3 — TODO (Scheduling)
### ⏳ MILESTONE 4 — TODO (Idle Auto-Stop + SNS)
### ⏳ MILESTONE 5 — TODO (Multi-account onboarding)

---

## Project File Structure

```
EC2-control-center/
├── CLAUDE.md                          ← This file
├── deploy.sh                          ← One-command deploy script (run on laptop terminal)
├── deploy-config.env                  ← Config values (already filled in)
│
├── cloudformation/
│   ├── central-stack.yaml             ← Main AWS stack (~22 resources) — M1
│   └── member-role-stack.yaml         ← For adding member accounts later — M5
│
├── lambda/
│   ├── ec2_controller/
│   │   ├── index.py                   ← Main handler: routes /ec2, /accounts
│   │   ├── accounts.py                ← STS AssumeRole + DynamoDB account registry
│   │   └── utils.py                   ← CORS, error mapping, JWT claims extraction
│   ├── config_injector/
│   │   └── index.py                   ← Custom resource: deploys frontend automatically
│   ├── scheduler/                     ← M3: Empty, to be built
│   └── idle_checker/                  ← M4: Empty, to be built
│
├── frontend/
│   ├── index.html                     ← SPA shell (CONFIG auto-injected at deploy)
│   ├── css/styles.css                 ← Full dark theme, responsive
│   └── js/
│       ├── auth.js                    ← PKCE auth flow
│       ├── api.js                     ← Fetch wrapper with auto token refresh
│       ├── instances.js               ← Instance list, start/stop, polling
│       └── app.js                     ← Init, tabs, toast, activity log
│
└── docs/                              ← Empty, for documentation
```

---

## Architecture (M1)

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
    │ stores tokens in sessionStorage
    ▼
frontend SPA (index.html + css/ + js/)
    │ API calls with Bearer JWT token
    ▼
HTTP API Gateway (API Gateway v2)
    │ JWT Authorizer validates token on every request
    ▼
Lambda: ec2-controller-production (Python 3.12)
    │ reads account registry from DynamoDB
    │ uses ThreadPoolExecutor to query all regions in parallel
    ▼
EC2 instances in the AWS account
```

**Config injection at deploy time:**
```
deploy.sh → uploads frontend.zip to S3
         → CloudFormation runs Config Injector Lambda (custom resource)
         → Lambda injects CONFIG values into index.html
         → Uploads all frontend files to portal S3 bucket
         → Invalidates CloudFront cache
         → Portal is LIVE (zero manual steps)
```

---

## Key Architecture Decisions

| Decision | Choice | Why |
|---|---|---|
| API Gateway | HTTP API v2 | 73% cheaper than REST API, built-in CORS, no helper Lambda needed |
| Auth | Authorization Code + PKCE | Replaces deprecated implicit grant; enables refresh tokens |
| Lambda code | S3 zip (not inline ZipFile) | Allows multi-file Lambda modules |
| Config injection | Custom Resource Lambda | Zero manual copy-paste of CF outputs |
| Multi-account | STS AssumeRole + DynamoDB registry | Ready from M1, activate in M5 |
| Idle auto-stop | Default ON, opt-out with tag | More aggressive cost savings |

---

## AWS Resources Created (M1 — ~22 resources)

1. S3 Portal Bucket — `ec2-control-portal-{accountId}-ap-south-1` (private, CloudFront only)
2. CloudFront OAC — secure S3 origin access
3. CloudFront Distribution — HTTPS portal
4. S3 Bucket Policy — CloudFront-only read
5. Cognito User Pool — `ec2-control-users-production`
6. Cognito App Client — PKCE, no secret, code flow
7. Cognito Domain — `ocu-ec2-ctrl-v2.auth.ap-south-1.amazoncognito.com`
8. Cognito First User — `joshiadarsh421@gmail.com` (invite email sent)
9. DynamoDB AccountRegistry — `ec2-control-accounts-production`
10. Lambda Execution Role — `ec2-control-lambda-role-production-ap-south-1`
11. Main Lambda — `ec2-controller-production` (120s timeout, 256MB)
12. Config Injector Role — s3:PutObject + cloudfront:CreateInvalidation
13. Config Injector Lambda — `ec2-config-injector-production`
14. Config Injector Custom Resource — auto-deploys frontend
15. HTTP API — `ec2-control-api-production`
16. HTTP API JWT Authorizer — Cognito-backed
17. HTTP API Integration — Lambda proxy, payload v2.0
18. HTTP API Route POST /ec2 — authenticated
19. HTTP API Route GET /accounts — authenticated
20. HTTP API Stage — `$default`, AutoDeploy: true
21. Lambda Permission — HTTP API wildcard (no helper Lambda needed)
22. Seed Account Lambda + Custom Resource — registers central account in DynamoDB

---

## Lambda API Contract

### POST /ec2

**Action: list** — returns all EC2s across all registered accounts
```json
Request:  { "action": "list" }
Response: { "instances": [{ "instanceId", "name", "state", "instanceType", "publicIp", "region", "accountId", "accountName" }] }
```

**Action: status** — current state of one instance
```json
Request:  { "action": "status", "instanceId": "i-xxx", "region": "ap-south-1", "accountId": "123..." }
Response: { "state", "instanceType", "publicIp", "launchTime", "instanceId", "region" }
```

**Action: start / stop**
```json
Request:  { "action": "start", "instanceId": "i-xxx", "region": "ap-south-1", "accountId": "123..." }
Response: { "message", "state", "requestedBy" }
```

### GET /accounts
```json
Response: { "accounts": [{ "accountId", "accountName", "enabled" }] }
```

**Important:** HTTP API v2 uses `event.requestContext.http.method/path` and JWT claims at `event.requestContext.authorizer.jwt.claims` (NOT `event.httpMethod` or `event.requestContext.authorizer.claims` like REST API v1).

---

## Code Patterns to Remember

### Lambda (Python)
- HTTP API v2 payload: method at `event['requestContext']['http']['method']`
- JWT caller: `event['requestContext']['authorizer']['jwt']['claims'].get('email')`
- CORS headers must be returned in every response (HTTP API native CORS handles preflight only)
- All Lambda modules imported from same directory (index.py imports utils, accounts)

### Frontend (JavaScript)
- All JS modules are IIFE pattern: `const ModuleName = (function() { ... return { publicMethods }; })()`
- Module load order in index.html: auth.js → api.js → instances.js → app.js
- CONFIG placeholder in index.html: `const CONFIG = { /*__INJECT__*/ };` (replaced at deploy)
- Auth uses `sessionStorage` (not localStorage) — clears on tab close
- API calls use `Bearer {token}` header (HTTP API JWT authorizer requires this)
- Token auto-refresh triggers when < 5 minutes to expiry

### CloudFormation
- HTTP API requires `PayloadFormatVersion: '2.0'` on the integration
- HTTP API stage `$default` with `AutoDeploy: true` — no separate Deployment resource
- Single `AWS::Lambda::Permission` with wildcard covers all routes
- Config Injector custom resource passes all CONFIG values as properties

---

## Deploy Config (Already Set)

```
ADMIN_EMAIL=joshiadarsh421@gmail.com
COGNITO_DOMAIN_PREFIX=ocu-ec2-ctrl-v2
ENVIRONMENT=production
AWS_REGION=ap-south-1
```

Stack name: `ec2-control-production`
Code S3 bucket: `ec2-control-code-{AWS_ACCOUNT_ID}-ap-south-1`

---

## How to Deploy / Re-deploy

**Prerequisites:**
- AWS CLI installed and configured with admin credentials
- `zip` utility available in terminal
- Run from Git Bash / WSL / any bash terminal on the laptop

**Command:**
```bash
cd "c:/Users/MUKESH/Desktop/EC2-control-center"
./deploy.sh
```

**What deploy.sh does automatically:**
1. Creates S3 code bucket (if not exists)
2. Zips Lambda functions and frontend
3. Uploads zips to S3 code bucket
4. Runs `aws cloudformation deploy` (creates or updates stack)
5. Config Injector Lambda (triggered by CloudFormation) automatically:
   - Injects CONFIG into index.html
   - Uploads frontend files to portal S3 bucket
   - Invalidates CloudFront cache
6. Prints portal URL and CloudFormation outputs

**After deploy:** Open the `PortalURL` from the outputs in a browser.

---

## Adding More Users (after M1 deploy)

```bash
aws cognito-idp admin-create-user \
  --user-pool-id POOL_ID_FROM_OUTPUTS \
  --username newuser@company.com \
  --user-attributes Name=email,Value=newuser@company.com Name=email_verified,Value=true \
  --desired-delivery-mediums EMAIL \
  --region ap-south-1
```

---

## Adding Member Accounts (M5)

1. Deploy `cloudformation/member-role-stack.yaml` in the target account
2. Copy the `RoleArn` output
3. Register in DynamoDB:
```bash
aws dynamodb put-item \
  --table-name ec2-control-accounts-production \
  --item '{"accountId":{"S":"TARGET_ACCT_ID"},"accountName":{"S":"My Account"},"roleArn":{"S":"ROLE_ARN"},"enabled":{"BOOL":true}}' \
  --region ap-south-1
```
4. Instances from that account appear in portal automatically

---

## Known Issues / Watch-outs

- CloudFront URL changes only apply after cache invalidation (handled automatically by Config Injector)
- Cognito domain prefix `ocu-ec2-ctrl-v2` must be globally unique — if taken, change it
- First deploy takes 8-12 minutes (CloudFront distribution creation is slow)
- Updates take 2-5 minutes
- On first login, Cognito forces a password change

---

## Deployment Notes (Lessons Learned from M1)

These issues were hit during M1 deployment — avoid repeating them in future milestones:

- **`aws cloudformation deploy` vs `create-stack`**: `deploy` uses changesets which trigger `AWS::EarlyValidation::ResourceExistenceCheck` — this blocked deployments when orphaned S3 buckets existed. For fresh stacks, prefer `aws cloudformation create-stack`. For updates to existing live stack, `deploy` works fine.
- **`IdentitySource` for `AWS::ApiGatewayV2::Authorizer`** must be a **YAML list**, not a string: `- '$request.header.Authorization'`
- **`MfaConfiguration: 'OFF'`** — must be quoted string `'OFF'` in YAML; `OPTIONAL` requires SMS config
- **`CognitoAppClient.CallbackURLs`** — set to `['https://localhost']` placeholder in CF template; Config Injector updates it to real CloudFront URL post-deploy (avoids circular reference)
- **`update_user_pool_client()`** does NOT accept `GenerateSecret` parameter — it's only valid at client creation
- **S3 portal bucket** has versioning enabled — when deleting stack, must delete all object versions first before CloudFormation can delete the bucket. Use: `aws s3api delete-objects` with version listing
- **IAM policy Resource fields** — avoid `!GetAtt` cross-references that EarlyValidation rejects; use computed ARNs (`!Sub 'arn:aws:s3:::bucket-name'`) or `'*'`
- **CloudFront `ForwardedValues`** — use instead of `CachePolicyId` to avoid EarlyValidation errors on managed cache policy IDs
- **Lambda code not updating on stack update** — CloudFormation only calls `UpdateFunctionCode` when the `S3Key` string in the template changes. Changing env vars alone (e.g. adding `DEPLOY_VERSION`) is NOT enough — CF only calls `UpdateFunctionConfiguration`. Fix: include `LambdaCodeVersion` in the S3Key itself: `S3Key: !Sub 'lambda/ec2-controller-${Environment}-${LambdaCodeVersion}.zip'`. deploy.sh uploads to that same versioned key, so every deploy uses a new S3Key → guaranteed code update.

## Milestone 2 Starting Point

**What to build for M2 (Audit Logging):**

Files to create/modify:
| File | Change |
|---|---|
| `cloudformation/central-stack.yaml` | Add: DynamoDB AuditLog table, GET /audit route, update Lambda role for audit table |
| `lambda/ec2_controller/audit.py` | NEW: `log_action()` writes to DynamoDB with TTL (90 days) |
| `lambda/ec2_controller/index.py` | Add: GET /audit handler, call `audit.log_action()` after every start/stop |
| `frontend/js/audit.js` | NEW: Audit log table with filters (user, instance), pagination |
| `frontend/js/app.js` | Add: Audit Log tab |
| `frontend/index.html` | Add: audit panel HTML |
| `frontend/css/styles.css` | Add: audit table styles |

DynamoDB AuditLog Table design:
- PK: `INSTANCE#{instanceId}`, SK: `{ISO-timestamp}#{action}`
- GSI `user-index`: PK: `userEmail`, SK: same
- TTL: 90 days, PAY_PER_REQUEST
- Fields: accountId, region, action, userEmail, result, details, timestamp

Deploy approach for M2: Use `aws cloudformation deploy` (stack already exists — update, not create).

## Git & GitHub Workflow

This project uses Git (local) + GitHub (remote) for version control. **Always keep the repo in sync.**

### Repository
- GitHub repo: `ec2-control-center` (private)
- Branch: `main`

### Rules for Every Session
- **Commit frequently** — after completing any logical unit of work (new file, feature working, bug fixed)
- **Push after every commit** — `git push origin main` — so GitHub always has the latest
- **Never leave uncommitted changes** at the end of a session
- **Never commit**: `.zip` files, AWS credentials, `.env` secrets, `__pycache__/`

### Commit Message Convention
```
<type>: <short summary>

<optional body — what changed and why>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
```

Types: `feat` (new feature), `fix` (bug fix), `chore` (infra/config), `docs` (docs only), `refactor`

Examples:
- `feat(m2): add AuditLog DynamoDB table to CloudFormation stack`
- `feat(m2): implement audit.py — log_action() with 90-day TTL`
- `fix: correct CORS headers in Lambda error responses`
- `chore: update deploy.sh to include scheduler Lambda zip`

### Commit Checkpoints Per Milestone
Commit at minimum after each of these:
1. CloudFormation changes (stack yaml updated)
2. Each new Lambda file or significant Lambda change
3. Each new frontend file or significant frontend change
4. After successful deploy and smoke test
5. At end of every working session

---

## Next Session Checklist

Before starting development, always:
1. Read this CLAUDE.md
2. Check which milestone we're on (currently: starting M2)
3. Check `C:\Users\MUKESH\.claude\plans\tender-kindling-peach.md` for detailed implementation plan
4. Never modify files in `AutomateServer-main/` — that's the old v1 code kept for reference
5. Stack is LIVE — test changes carefully; don't delete/recreate the stack unnecessarily
6. `git status` — ensure working tree is clean before starting new work
7. `git push origin main` — ensure latest is on GitHub
