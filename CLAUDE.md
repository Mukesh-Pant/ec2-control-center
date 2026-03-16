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
├── example-deploy-config.env   ← Template for deploy-config.env
├── oculogo.png                 ← One Cloud Utopia logo (source)
├── cloudformation/
│   ├── central-stack.yaml      ← All AWS resources (M1-M7 + custom domain + auth)
│   ├── acm-cert-stack.yaml     ← ACM cert for custom domain (us-east-1, deploy ONCE)
│   └── member-role-stack.yaml  ← Cross-account IAM role (deploy in each member account)
├── lambda/
│   ├── ec2_controller/
│   │   ├── index.py            ← Main handler: /ec2, /accounts, /audit, /pricing routes
│   │   ├── accounts.py         ← Account registry (DynamoDB + STS AssumeRole)
│   │   ├── audit.py            ← Audit log read/write
│   │   ├── pricing.py          ← EC2 on-demand pricing lookup
│   │   └── utils.py            ← CORS helpers, JWT claims, error mapping
│   ├── config_injector/
│   │   └── index.py            ← Custom resource: injects CONFIG, uploads frontend, invalidates CDN
│   └── idle_checker/
│       └── index.py            ← CPU check, auto-stop, SNS alert
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
        ├── app.js              ← App init, tabs, toast, session timer
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
         ├── DynamoDB → account registry + audit logs
         └── Cost Explorer → billing data

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
- Admin check: `email === 'pantm8877@gmail.com'` in `_bootApp()`

**`authui.js`** — Auth page UI controller (IIFE → `AuthUI` global)
- `showView(view)` — Toggles between 6 form states: `login`, `signup`, `verify`, `forgot`, `reset`, `newpass`
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
```

### api.js Contract (must be preserved)
```javascript
Auth.isNearExpiry()    // returns boolean — true if < 10 min to expiry
Auth.refreshTokens()   // returns Promise<boolean> — true on success, false on failure
Auth.getToken()        // returns string — JWT id_token
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

---

## Code Patterns

### Lambda (Python) — REST API v1
- Method/path: `event['httpMethod']`, `event['path']`
- JWT caller email: `event['requestContext']['authorizer']['claims'].get('email')`
- CORS headers required in EVERY response (REST API v1 doesn't auto-add them)
- `get_accounts()` → enabled only (EC2 listing); `get_all_accounts()` → all (admin panel)

### Frontend (JavaScript)
- All modules: IIFE pattern — `const ModuleName = (function() { ... return {...}; })()`
- **Script load order:** `cognito-sdk (CDN+fallback)` → `auth` → `authui` → `api` → `instances` → `audit` → `billing` → `analytics` → `accounts` → `app`
- `const CONFIG = { /*__INJECT__*/ };` in index.html — replaced at deploy by config_injector
- Auth uses `sessionStorage`; `isNearExpiry()` = < 10 min buffer (handles Cognito clock skew)
- `Auth.init()` is the entry point — decides whether to show login page or boot dashboard
- Dashboard pages: `dashboard`, `instances`, `billing`, `analytics`, `audit`, `accounts`
- Admin-only pages: `accounts` tab visible only when `App.setAdmin(true)`

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

- **Repo:** `https://github.com/Mukesh-Pant/ec2-control-center` (private) | **Branch:** `main`
- **Commit at milestone/feature completion only**
- **Never commit:** `deploy-config.env`, `.zip` files, `__pycache__/`, secrets
- **Commit types:** `feat`, `fix`, `chore`, `docs`, `refactor`
