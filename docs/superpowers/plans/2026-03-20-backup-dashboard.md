# Backup Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Backup dashboard (M9) that lets users create on-demand and scheduled EC2 backups via AWS Backup, view recovery points, and restore to a new or replacement instance — all within the existing RBAC model.

**Architecture:** Lambda (`backup.py`) manages AWS Backup Plans/Selections/Jobs dynamically via boto3. The frontend `backup.js` IIFE module provides a three-panel UI (instance selector, recovery points table, schedules table) wired to a new `/backup` REST API endpoint.

**Tech Stack:** Python 3.12 (boto3 `backup` + `ec2` clients), AWS Backup service (Vault, Plans, Selections, Jobs), CloudFormation (central-stack.yaml + member-role-stack.yaml), Vanilla JS (IIFE pattern, same as existing modules), AWS API Gateway REST v1.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `lambda/ec2_controller/backup.py` | **Create** | All backup logic: list, create, schedule, restore, delete |
| `lambda/ec2_controller/index.py` | **Modify** | Add `/backup` route to `lambda_handler` dispatcher |
| `cloudformation/central-stack.yaml` | **Modify** | BackupVault, BackupServiceRole, Lambda IAM permissions, env vars, API Gateway `/backup` resource + 3 methods, Deployment DependsOn, Outputs |
| `cloudformation/member-role-stack.yaml` | **Modify** | Add `backup:StartBackupJob`, `backup:StartRestoreJob`, `backup:ListRecoveryPointsByResource` to member IAM policy |
| `frontend/js/backup.js` | **Create** | Backup tab IIFE module: instance selector, recovery points, schedules, modals |
| `frontend/js/api.js` | **Modify** | Add `getBackups()` and `postBackup()` methods |
| `frontend/js/app.js` | **Modify** | Add `backup` to `PAGE_TITLES`, call `Backup.onTabActivated()` in `go()`, call `Backup.init()` in `init()` |
| `frontend/index.html` | **Modify** | Add sidebar nav item, page view container (3 panels + 2 modals), script tag |
| `frontend/css/styles.css` | **Modify** | Backup tab styles |

---

## Task 1: CloudFormation — Backup Vault, IAM Role, Lambda Permissions, Env Vars

**Files:**
- Modify: `cloudformation/central-stack.yaml`

### Background
The existing `LambdaExecutionRole` has a single `EC2ControlPolicy` inline policy with Sid blocks (EC2Control, STSCrossAccount, DynamoDB, etc.). Add a new `AWSBackupControl` Sid block to it. The `MainLambda` Environment.Variables block currently has 7 variables; add 2 more.

- [ ] **Step 1: Add BackupVault resource**

In `central-stack.yaml`, find the `UserAccountsTable` DynamoDB resource (around line 453) and add the following YAML block **after** it:

```yaml
  BackupVault:
    Type: AWS::Backup::BackupVault
    Properties:
      BackupVaultName: !Sub 'ec2-control-vault-${Environment}'
      AccessPolicy:
        Version: '2012-10-17'
        Statement:
          - Sid: AllowMemberAccountBackups
            Effect: Allow
            Principal:
              AWS:
                - 'arn:aws:iam::196750375951:root'
            Action:
              - backup:CopyIntoBackupVault
            Resource: '*'
```

- [ ] **Step 2: Add BackupServiceRole resource**

Directly after the `BackupVault` block, add:

```yaml
  BackupServiceRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub 'ec2-control-backup-role-${Environment}'
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: backup.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup
        - arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores
      Tags:
        - Key: Project
          Value: EC2Control
        - Key: Environment
          Value: !Ref Environment
```

- [ ] **Step 3: Add AWSBackupControl Sid to LambdaExecutionRole**

In `central-stack.yaml`, find the `CognitoUserMgmt` Sid block inside `LambdaExecutionRole`. Add a new Sid block **after** it (before `CloudWatchLogs`):

```yaml
            - Sid: AWSBackupControl
              Effect: Allow
              Action:
                - backup:CreateBackupPlan
                - backup:UpdateBackupPlan
                - backup:DeleteBackupPlan
                - backup:CreateBackupSelection
                - backup:DeleteBackupSelection
                - backup:StartBackupJob
                - backup:StartRestoreJob
                - backup:ListBackupPlans
                - backup:ListBackupSelections
                - backup:ListRecoveryPointsByResource
                - backup:DeleteRecoveryPoint
                - backup:DescribeBackupJob
                - backup:DescribeRestoreJob
              Resource: '*'
            - Sid: BackupPassRole
              Effect: Allow
              Action:
                - iam:PassRole
              Resource: !GetAtt BackupServiceRole.Arn
```

- [ ] **Step 4: Add env vars to MainLambda**

Find the `MainLambda` `Environment.Variables` block (currently ends at `CENTRAL_ACCOUNT_ID`). Add two new lines:

```yaml
        BACKUP_ROLE_ARN: !GetAtt BackupServiceRole.Arn
        BACKUP_VAULT_NAME: !Sub 'ec2-control-vault-${Environment}'
```

- [ ] **Step 5: Add Outputs for Backup resources**

Find the `Outputs:` section (near end of file). Add before the last output:

```yaml
  BackupVaultArn:
    Description: AWS Backup Vault ARN for EC2 recovery points. M9.
    Value: !GetAtt BackupVault.BackupVaultArn

  BackupServiceRoleArn:
    Description: IAM role used by AWS Backup service. M9.
    Value: !GetAtt BackupServiceRole.Arn
```

- [ ] **Step 6: Commit**

```bash
git add cloudformation/central-stack.yaml
git commit -m "feat(M9): add BackupVault, BackupServiceRole, Lambda backup permissions to CF"
```

---

## Task 2: CloudFormation — API Gateway `/backup` Resource + Methods

**Files:**
- Modify: `cloudformation/central-stack.yaml`

### Background
The existing pattern (from `/accounts`): one `AWS::ApiGateway::Resource` + three `AWS::ApiGateway::Method` resources (GET, POST, OPTIONS). All three must be added to `RestApiDeployment` DependsOn. Find `ResourceUsers` in the template and add the backup resource/methods after it.

- [ ] **Step 1: Add ResourceBackup**

Find `ResourceUsers:` in the template. After its block, add:

```yaml
  ResourceBackup:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: !Ref RestApi
      ParentId: !GetAtt RestApi.RootResourceId
      PathPart: backup
```

- [ ] **Step 2: Add MethodGetBackup**

```yaml
  MethodGetBackup:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref RestApi
      ResourceId: !Ref ResourceBackup
      HttpMethod: GET
      AuthorizationType: COGNITO_USER_POOLS
      AuthorizerId: !Ref RestApiAuthorizer
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${MainLambda.Arn}/invocations'
```

- [ ] **Step 3: Add MethodPostBackup**

```yaml
  MethodPostBackup:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref RestApi
      ResourceId: !Ref ResourceBackup
      HttpMethod: POST
      AuthorizationType: COGNITO_USER_POOLS
      AuthorizerId: !Ref RestApiAuthorizer
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: !Sub 'arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${MainLambda.Arn}/invocations'
```

- [ ] **Step 4: Add MethodOptionsBackup (CORS preflight)**

```yaml
  MethodOptionsBackup:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: !Ref RestApi
      ResourceId: !Ref ResourceBackup
      HttpMethod: OPTIONS
      AuthorizationType: NONE
      Integration:
        Type: MOCK
        RequestTemplates:
          application/json: '{"statusCode": 200}'
        IntegrationResponses:
          - StatusCode: 200
            ResponseParameters:
              method.response.header.Access-Control-Allow-Headers: "'Content-Type,Authorization'"
              method.response.header.Access-Control-Allow-Methods: "'GET,POST,OPTIONS'"
              method.response.header.Access-Control-Allow-Origin: "'*'"
            ResponseTemplates:
              application/json: ''
      MethodResponses:
        - StatusCode: 200
          ResponseParameters:
            method.response.header.Access-Control-Allow-Headers: true
            method.response.header.Access-Control-Allow-Methods: true
            method.response.header.Access-Control-Allow-Origin: true
```

- [ ] **Step 5: Add all three methods to RestApiDeployment DependsOn**

Find `RestApiDeployment:` → `DependsOn:` list. After `MethodOptionsUsers`, add:

```yaml
    - MethodGetBackup
    - MethodPostBackup
    - MethodOptionsBackup
```

- [ ] **Step 6: Update RestApiDeployment Description to force new deployment**

Find `Description: !Sub 'Deployment ${LambdaCodeVersion}'` under `RestApiDeployment`. Change to:

```yaml
      Description: !Sub 'Deployment ${LambdaCodeVersion}-backup'
```

- [ ] **Step 7: Commit**

```bash
git add cloudformation/central-stack.yaml
git commit -m "feat(M9): add /backup API Gateway resource and GET/POST/OPTIONS methods"
```

---

## Task 3: CloudFormation — Update Member Role Stack

**Files:**
- Modify: `cloudformation/member-role-stack.yaml`

### Background
The member role currently has three Sid blocks: EC2Control, CloudWatchMetrics, CostExplorerReadOnly. Add a new Sid for backup permissions.

- [ ] **Step 1: Add backup permissions Sid to member IAM policy**

Find the `CostExplorerReadOnly` Sid block in `member-role-stack.yaml`. Add a new block after it:

```yaml
        - Sid: BackupReadAndStart
          Effect: Allow
          Action:
            - backup:StartBackupJob
            - backup:StartRestoreJob
            - backup:ListRecoveryPointsByResource
          Resource: '*'
```

- [ ] **Step 2: Commit**

```bash
git add cloudformation/member-role-stack.yaml
git commit -m "feat(M9): add backup permissions to member account IAM role"
```

---

## Task 4: Backend — Create backup.py

**Files:**
- Create: `lambda/ec2_controller/backup.py`

### Background
Follow the same structure as `accounts.py`: module-level boto3 client helpers, then public handlers called from `index.py`. Use `from utils import get_caller, get_caller_groups, is_admin, response, error_response, get_cors` imports. Read env vars `BACKUP_ROLE_ARN` and `BACKUP_VAULT_NAME` at module level.

**Cross-account pattern:** When `accountId != CENTRAL_ACCOUNT_ID`, assume the member role via STS (role ARN: `arn:aws:iam::{accountId}:role/EC2ControlCrossAccountRole-{ENVIRONMENT}`) and create region-specific boto3 `backup` and `ec2` clients with those credentials. When `accountId == CENTRAL_ACCOUNT_ID`, use default Lambda credentials.

- [ ] **Step 1: Write backup.py skeleton with imports, env vars, client helpers**

Create `lambda/ec2_controller/backup.py`:

```python
"""AWS Backup integration — on-demand backups, schedules, and restore."""

import os
import json
import logging
import uuid
import boto3

from utils import get_caller, is_admin, get_caller_groups, response, error_response

logger = logging.getLogger()
logger.setLevel(logging.INFO)

BACKUP_ROLE_ARN  = os.environ.get('BACKUP_ROLE_ARN', '')
BACKUP_VAULT_NAME = os.environ.get('BACKUP_VAULT_NAME', 'ec2-control-vault-production')
CENTRAL_ACCOUNT_ID = os.environ.get('CENTRAL_ACCOUNT_ID', '')
ENVIRONMENT = os.environ.get('ENVIRONMENT', 'production')

_sts_client = None


def _get_sts():
    global _sts_client
    if _sts_client is None:
        _sts_client = boto3.client('sts')
    return _sts_client


def _get_clients(account_id, region):
    """Return (backup_client, ec2_client) scoped to account_id/region.
    Uses STS AssumeRole for member accounts; default creds for central account.
    """
    if account_id == CENTRAL_ACCOUNT_ID:
        return (
            boto3.client('backup', region_name=region),
            boto3.client('ec2', region_name=region),
        )
    role_arn = f'arn:aws:iam::{account_id}:role/EC2ControlCrossAccountRole-{ENVIRONMENT}'
    creds = _get_sts().assume_role(
        RoleArn=role_arn,
        RoleSessionName='ec2ctrl-backup',
    )['Credentials']
    kwargs = dict(
        aws_access_key_id=creds['AccessKeyId'],
        aws_secret_access_key=creds['SecretAccessKey'],
        aws_session_token=creds['SessionToken'],
        region_name=region,
    )
    return boto3.client('backup', **kwargs), boto3.client('ec2', **kwargs)


def _get_allowed_account_ids(caller_email):
    """Return set of accountIds the caller has access to (operators only).
    Admins: returns None (bypass — all accounts allowed).
    Re-uses the accounts module to avoid duplicating DynamoDB logic.
    """
    import accounts as accts
    assignments = accts.get_user_accounts(caller_email)
    return {a['accountId'] for a in assignments}


def _check_account_access(event, account_id):
    """Returns error_response(403) if caller cannot access account_id, else None."""
    if is_admin(event):
        return None
    allowed = _get_allowed_account_ids(get_caller(event))
    if account_id not in allowed:
        return error_response(403, 'Access denied to this account.')
    return None
```

- [ ] **Step 2: Write handle_backup_list (GET /backup)**

Append to `backup.py`:

```python
def handle_backup_list(event):
    """GET /backup?instanceId=&accountId=&region="""
    params = event.get('queryStringParameters') or {}
    instance_id = params.get('instanceId', '')
    account_id  = params.get('accountId', '')
    region      = params.get('region', 'ap-south-1')

    if not instance_id or not account_id:
        return error_response(400, 'instanceId and accountId are required.')

    guard = _check_account_access(event, account_id)
    if guard:
        return guard

    try:
        backup_client, _ = _get_clients(account_id, region)
        instance_arn = f'arn:aws:ec2:{region}:{account_id}:instance/{instance_id}'

        # Collect recovery points (paginated, max 100)
        recovery_points = []
        kwargs = {'ResourceArn': instance_arn, 'MaxResults': 100}
        while True:
            rp_resp = backup_client.list_recovery_points_by_resource(**kwargs)
            for rp in rp_resp.get('RecoveryPoints', []):
                recovery_points.append({
                    'recoveryPointArn': rp.get('RecoveryPointArn', ''),
                    'creationDate': str(rp.get('CreationDate', '')),
                    'status': rp.get('Status', ''),
                    'backupSizeBytes': rp.get('BackupSizeBytes', 0),
                    'retentionDays': None,  # not returned by list; omitted
                })
            next_token = rp_resp.get('NextToken')
            if not next_token:
                break
            kwargs['NextToken'] = next_token

        # Collect plans (paginated, max 100); filter to those selecting this instance
        plans = []
        plan_kwargs = {'MaxResults': 100}
        while True:
            plan_resp = backup_client.list_backup_plans(**plan_kwargs)
            for plan_summary in plan_resp.get('BackupPlansList', []):
                plan_id = plan_summary['BackupPlanId']
                # Check selections for this plan
                sel_resp = backup_client.list_backup_selections(BackupPlanId=plan_id)
                for sel in sel_resp.get('BackupSelectionsList', []):
                    sel_id = sel['SelectionId']
                    sel_detail = backup_client.get_backup_selection(
                        BackupPlanId=plan_id, SelectionId=sel_id
                    )
                    resources = sel_detail.get('BackupSelection', {}).get('Resources', [])
                    if instance_arn in resources:
                        # Get plan details for cron + retention
                        plan_detail = backup_client.get_backup_plan(BackupPlanId=plan_id)
                        rules = plan_detail.get('BackupPlan', {}).get('Rules', [{}])
                        rule = rules[0] if rules else {}
                        lifecycle = rule.get('Lifecycle', {})
                        retention = lifecycle.get('DeleteAfterDays')
                        plans.append({
                            'backupPlanId': plan_id,
                            'backupPlanName': plan_summary.get('BackupPlanName', ''),
                            'selectionId': sel_id,
                            'scheduleCron': rule.get('ScheduleExpression', ''),
                            'retentionDays': retention,
                            'lastExecutionDate': str(plan_summary.get('LastExecutionDate', '')),
                        })
                        break  # only one selection per plan in our model
            next_token = plan_resp.get('NextToken')
            if not next_token:
                break
            plan_kwargs['NextToken'] = next_token

        return response(200, {'recoveryPoints': recovery_points, 'plans': plans})

    except Exception as e:
        logger.exception('handle_backup_list error')
        return error_response(500, str(e))
```

- [ ] **Step 3: Write handle_backup_mutation (POST /backup) dispatcher**

Append to `backup.py`:

```python
def handle_backup_mutation(event):
    """POST /backup — dispatch by action."""
    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return error_response(400, 'Invalid JSON body.')

    action = body.get('action', '').strip().lower()
    dispatch = {
        'createbackup':   _create_backup,
        'createschedule': _create_schedule,
        'updateschedule': _update_schedule,
        'deleteschedule': _delete_schedule,
        'listschedules':  _list_schedules,
        'restore':        _restore,
        'deleterecovery': _delete_recovery,
    }
    handler = dispatch.get(action)
    if not handler:
        return error_response(400, f'Unknown action: {action}')
    return handler(event, body)
```

- [ ] **Step 4: Write _create_backup (on-demand backup)**

Append to `backup.py`:

```python
def _create_backup(event, body):
    """On-demand backup of a single EC2 instance."""
    account_id   = body.get('accountId', '')
    instance_arn = body.get('instanceArn', '')
    region       = body.get('region', 'ap-south-1')

    if not account_id or not instance_arn:
        return error_response(400, 'accountId and instanceArn are required.')

    guard = _check_account_access(event, account_id)
    if guard:
        return guard

    backup_client, _ = _get_clients(account_id, region)
    try:
        job = backup_client.start_backup_job(
            BackupVaultName=BACKUP_VAULT_NAME,
            ResourceArn=instance_arn,
            IamRoleArn=BACKUP_ROLE_ARN,
            IdempotencyToken=str(uuid.uuid4()),
            Lifecycle={'DeleteAfterDays': 30},  # default retention; schedules override this
        )
        return response(200, {'jobId': job['BackupJobId'], 'message': 'Backup job started.'})
    except Exception as e:
        logger.exception('_create_backup error')
        return error_response(500, str(e))
```

- [ ] **Step 5: Write _create_schedule**

Append to `backup.py`:

```python
def _create_schedule(event, body):
    """Create a Backup Plan + Selection for an EC2 instance."""
    account_id      = body.get('accountId', '')
    instance_arn    = body.get('instanceArn', '')
    region          = body.get('region', 'ap-south-1')
    schedule_cron   = body.get('scheduleCron', 'cron(0 2 * * ? *)')
    retention_days  = int(body.get('retentionDays', 30))
    plan_name       = body.get('backupPlanName', '')

    if not account_id or not instance_arn or not plan_name:
        return error_response(400, 'accountId, instanceArn, and backupPlanName are required.')
    if retention_days < 1 or retention_days > 365:
        return error_response(400, 'retentionDays must be between 1 and 365.')

    guard = _check_account_access(event, account_id)
    if guard:
        return guard

    backup_client, _ = _get_clients(account_id, region)
    try:
        plan_resp = backup_client.create_backup_plan(
            BackupPlan={
                'BackupPlanName': plan_name,
                'Rules': [{
                    'RuleName': 'scheduled-backup',
                    'TargetBackupVaultName': BACKUP_VAULT_NAME,
                    'ScheduleExpression': schedule_cron,
                    'Lifecycle': {'DeleteAfterDays': retention_days},
                }],
            }
        )
        plan_id = plan_resp['BackupPlanId']

        backup_client.create_backup_selection(
            BackupPlanId=plan_id,
            BackupSelection={
                'SelectionName': 'instance-selection',
                'IamRoleArn': BACKUP_ROLE_ARN,
                'Resources': [instance_arn],
            }
        )
        return response(200, {'backupPlanId': plan_id, 'message': 'Schedule created.'})
    except Exception as e:
        logger.exception('_create_schedule error')
        return error_response(500, str(e))
```

- [ ] **Step 6: Write _update_schedule**

Append to `backup.py`:

```python
def _update_schedule(event, body):
    """Update an existing Backup Plan's schedule/retention."""
    account_id     = body.get('accountId', '')
    region         = body.get('region', 'ap-south-1')
    plan_id        = body.get('backupPlanId', '')
    plan_name      = body.get('backupPlanName', '')
    schedule_cron  = body.get('scheduleCron', 'cron(0 2 * * ? *)')
    retention_days = int(body.get('retentionDays', 30))

    if not account_id or not plan_id or not plan_name:
        return error_response(400, 'accountId, backupPlanId, and backupPlanName are required.')

    guard = _check_account_access(event, account_id)
    if guard:
        return guard

    backup_client, _ = _get_clients(account_id, region)
    try:
        backup_client.update_backup_plan(
            BackupPlanId=plan_id,
            BackupPlan={
                'BackupPlanName': plan_name,
                'Rules': [{
                    'RuleName': 'scheduled-backup',
                    'TargetBackupVaultName': BACKUP_VAULT_NAME,
                    'ScheduleExpression': schedule_cron,
                    'Lifecycle': {'DeleteAfterDays': retention_days},
                }],
            }
        )
        return response(200, {'message': 'Schedule updated.'})
    except Exception as e:
        logger.exception('_update_schedule error')
        return error_response(500, str(e))
```

- [ ] **Step 7: Write _delete_schedule**

Append to `backup.py`:

```python
def _delete_schedule(event, body):
    """Delete a Backup Plan + its Selection."""
    account_id = body.get('accountId', '')
    region     = body.get('region', 'ap-south-1')
    plan_id    = body.get('backupPlanId', '')
    sel_id     = body.get('selectionId', '')

    if not account_id or not plan_id or not sel_id:
        return error_response(400, 'accountId, backupPlanId, and selectionId are required.')

    guard = _check_account_access(event, account_id)
    if guard:
        return guard

    backup_client, _ = _get_clients(account_id, region)
    try:
        backup_client.delete_backup_selection(BackupPlanId=plan_id, SelectionId=sel_id)
        backup_client.delete_backup_plan(BackupPlanId=plan_id)
        return response(200, {'message': 'Schedule deleted.'})
    except Exception as e:
        logger.exception('_delete_schedule error')
        return error_response(500, str(e))
```

- [ ] **Step 8: Write _list_schedules**

Append to `backup.py`:

```python
def _list_schedules(event, body):
    """List all Backup Plans that target instances in caller's allowed accounts."""
    account_id = body.get('accountId', '')
    region     = body.get('region', 'ap-south-1')

    if not account_id:
        return error_response(400, 'accountId is required.')

    guard = _check_account_access(event, account_id)
    if guard:
        return guard

    backup_client, _ = _get_clients(account_id, region)
    try:
        plans = []
        kwargs = {'MaxResults': 100}
        while True:
            plan_resp = backup_client.list_backup_plans(**kwargs)
            for plan_summary in plan_resp.get('BackupPlansList', []):
                plan_id = plan_summary['BackupPlanId']
                sel_resp = backup_client.list_backup_selections(BackupPlanId=plan_id)
                for sel in sel_resp.get('BackupSelectionsList', []):
                    sel_detail = backup_client.get_backup_selection(
                        BackupPlanId=plan_id, SelectionId=sel['SelectionId']
                    )
                    resources = sel_detail.get('BackupSelection', {}).get('Resources', [])
                    # Filter: resource ARN must contain the requested accountId
                    if any(f':{account_id}:' in r for r in resources):
                        plan_detail = backup_client.get_backup_plan(BackupPlanId=plan_id)
                        rules = plan_detail.get('BackupPlan', {}).get('Rules', [{}])
                        rule = rules[0] if rules else {}
                        lifecycle = rule.get('Lifecycle', {})
                        plans.append({
                            'backupPlanId': plan_id,
                            'backupPlanName': plan_summary.get('BackupPlanName', ''),
                            'selectionId': sel['SelectionId'],
                            'scheduleCron': rule.get('ScheduleExpression', ''),
                            'retentionDays': lifecycle.get('DeleteAfterDays'),
                            'lastExecutionDate': str(plan_summary.get('LastExecutionDate', '')),
                            'resources': resources,
                        })
                        break
            next_token = plan_resp.get('NextToken')
            if not next_token:
                break
            kwargs['NextToken'] = next_token

        return response(200, {'plans': plans})
    except Exception as e:
        logger.exception('_list_schedules error')
        return error_response(500, str(e))
```

- [ ] **Step 9: Write _restore**

Append to `backup.py`:

```python
def _restore(event, body):
    """Start a restore job. restoreType: 'new_instance' or 'replace'.
    AWS Backup always creates a NEW instance. 'replace' additionally stops the original.
    """
    account_id        = body.get('accountId', '')
    region            = body.get('region', 'ap-south-1')
    recovery_point_arn = body.get('recoveryPointArn', '')
    instance_id       = body.get('instanceId', '')
    restore_type      = body.get('restoreType', 'new_instance').strip().lower()

    if not account_id or not recovery_point_arn or not instance_id:
        return error_response(400, 'accountId, recoveryPointArn, and instanceId are required.')
    if restore_type not in ('new_instance', 'replace'):
        return error_response(400, "restoreType must be 'new_instance' or 'replace'.")

    guard = _check_account_access(event, account_id)
    if guard:
        return guard

    backup_client, ec2_client = _get_clients(account_id, region)
    try:
        # Gather restore metadata from existing instance
        desc = ec2_client.describe_instances(InstanceIds=[instance_id])
        inst = desc['Reservations'][0]['Instances'][0]
        subnet_id = inst.get('SubnetId', '')
        sg_ids    = [sg['GroupId'] for sg in inst.get('SecurityGroups', [])]
        iam_prof  = inst.get('IamInstanceProfile', {}).get('Arn', '')

        metadata = {
            'subnetId':         subnet_id,
            'securityGroupIds': json.dumps(sg_ids),
        }
        if iam_prof:  # optional — omit entirely if not present
            metadata['iamInstanceProfileArn'] = iam_prof

        restore_resp = backup_client.start_restore_job(
            RecoveryPointArn=recovery_point_arn,
            Metadata=metadata,
            IamRoleArn=BACKUP_ROLE_ARN,
            IdempotencyToken=str(uuid.uuid4()),
            ResourceType='EC2',
        )
        job_id = restore_resp['RestoreJobId']

        if restore_type == 'replace':
            # Stop original instance (not terminate — user confirms then terminates manually)
            ec2_client.stop_instances(InstanceIds=[instance_id])
            return response(200, {
                'restoreJobId': job_id,
                'message': 'Restore started and original instance stopped. Verify the new instance, then manually terminate the original.',
            })

        return response(200, {
            'restoreJobId': job_id,
            'message': 'Restore started. A new instance will appear shortly in the Instances tab.',
        })

    except Exception as e:
        logger.exception('_restore error')
        return error_response(500, str(e))
```

- [ ] **Step 10: Write _delete_recovery**

Append to `backup.py`:

```python
def _delete_recovery(event, body):
    """Delete a specific recovery point."""
    account_id         = body.get('accountId', '')
    region             = body.get('region', 'ap-south-1')
    recovery_point_arn = body.get('recoveryPointArn', '')

    if not account_id or not recovery_point_arn:
        return error_response(400, 'accountId and recoveryPointArn are required.')

    guard = _check_account_access(event, account_id)
    if guard:
        return guard

    backup_client, _ = _get_clients(account_id, region)
    try:
        backup_client.delete_recovery_point(
            BackupVaultName=BACKUP_VAULT_NAME,
            RecoveryPointArn=recovery_point_arn,
        )
        return response(200, {'message': 'Recovery point deleted.'})
    except Exception as e:
        logger.exception('_delete_recovery error')
        return error_response(500, str(e))
```

- [ ] **Step 11: Commit**

```bash
git add lambda/ec2_controller/backup.py
git commit -m "feat(M9): add backup.py with on-demand backup, schedules, restore, delete"
```

---

## Task 5: Backend — Wire /backup Route in index.py

**Files:**
- Modify: `lambda/ec2_controller/index.py`

### Background
The `lambda_handler` function routes via `if/elif` on `method` + `path`. Import `backup` module at the top alongside `accounts`, `audit`, etc. Add two new elif branches.

- [ ] **Step 1: Add import for backup module**

Find the imports section at the top of `index.py` (look for `import accounts` or `import audit`). Add:

```python
import backup
```

- [ ] **Step 2: Add /backup routes to lambda_handler**

Find the `lambda_handler` routing block. After the `/users` routes (the last elif before the `else: return error_response(404...)`), add:

```python
    elif path == '/backup' and method == 'GET':
        return backup.handle_backup_list(event)
    elif path == '/backup' and method == 'POST':
        return backup.handle_backup_mutation(event)
```

- [ ] **Step 3: Commit**

```bash
git add lambda/ec2_controller/index.py
git commit -m "feat(M9): wire /backup GET and POST routes in lambda_handler"
```

---

## Task 6: Frontend — Add API wrapper methods to api.js

**Files:**
- Modify: `frontend/js/api.js`

### Background
`api.js` exposes a public object with named methods. Each method calls `_fetch(method, path, body)`. Find `postUsers` (the last method before the `return` statement) and add the backup methods after it.

- [ ] **Step 1: Add getBackups and postBackup to api.js**

Find the line `postUsers: function(body) {` in `api.js`. After its closing `},`, add:

```javascript
    getBackups: function (instanceId, accountId, region) {
      return _fetch('GET', '/backup?instanceId=' + encodeURIComponent(instanceId) +
        '&accountId=' + encodeURIComponent(accountId) +
        '&region=' + encodeURIComponent(region), null);
    },
    postBackup: function (body) {
      return _fetch('POST', '/backup', body);
    },
```

- [ ] **Step 2: Verify the return statement still exports the new methods**

The `return { ... }` block at the bottom of the `api.js` IIFE must include `getBackups` and `postBackup`. Find the return block and add them:

```javascript
    getBackups:    getBackups,   // or inline — match existing style
    postBackup:    postBackup,
```

Note: if the methods are defined inline in the return object (as in the existing code), no change to the return block is needed — just verify by reading the file.

- [ ] **Step 3: Commit**

```bash
git add frontend/js/api.js
git commit -m "feat(M9): add getBackups and postBackup to api.js"
```

---

## Task 7: Frontend — Create backup.js

**Files:**
- Create: `frontend/js/backup.js`

### Background
Follow the IIFE pattern: `const Backup = (function() { ... return {...}; })();`. Private state at top. Expose only the public API. All onclick handlers in HTML call `Backup.methodName()`. `onTabActivated()` loads data the first time the tab is opened (lazy-load pattern identical to `Users.onTabActivated()`).

- [ ] **Step 1: Write backup.js — state, init, onTabActivated**

Create `frontend/js/backup.js`:

```javascript
'use strict';

const Backup = (function () {
  // ─── Private state
  var loaded        = false;
  var selInstance   = null;   // { instanceId, accountId, region, instanceArn }
  var recoveryPoints = [];
  var plans          = [];
  var editPlan       = null;  // plan being edited (null = create mode)
  var restoreArn     = null;  // recoveryPointArn for current restore modal

  // ─── Init: register event listeners (called once by App.init)
  function init() {
    var sel = document.getElementById('bk-instance-select');
    if (sel) sel.addEventListener('change', _onInstanceChange);
  }

  // ─── Lazy-load: called by App.go('backup') on first visit
  function onTabActivated() {
    if (!loaded) {
      loaded = true;
      _populateInstanceSelector();
    }
  }

  // ─── Populate instance dropdown from already-loaded instances
  function _populateInstanceSelector() {
    var sel  = document.getElementById('bk-instance-select');
    var wrap = document.getElementById('bk-content');
    if (!sel) return;

    var instances = typeof Instances !== 'undefined' ? Instances.getAll() : [];
    sel.innerHTML = '<option value="">— Select an instance —</option>';

    var role = Auth.getRole();
    instances.forEach(function (inst) {
      if (role === 'none') return;  // pending-approval: no instances
      var opt = document.createElement('option');
      opt.value = JSON.stringify({
        instanceId:  inst.InstanceId,
        accountId:   inst.accountId,
        region:      inst.region,
        instanceArn: 'arn:aws:ec2:' + inst.region + ':' + inst.accountId + ':instance/' + inst.InstanceId,
      });
      opt.textContent = inst.InstanceId + ' (' + (inst.Tags && inst.Tags.find(t => t.Key==='Name') ? inst.Tags.find(t => t.Key==='Name').Value : 'unnamed') + ') — ' + inst.accountId;
      sel.appendChild(opt);
    });

    if (wrap) wrap.style.display = 'none';  // hide panels until instance selected
  }

  function _onInstanceChange() {
    var sel = document.getElementById('bk-instance-select');
    var val = sel ? sel.value : '';
    if (!val) {
      selInstance = null;
      var wrap = document.getElementById('bk-content');
      if (wrap) wrap.style.display = 'none';
      return;
    }
    selInstance = JSON.parse(val);
    load(selInstance.instanceId, selInstance.accountId, selInstance.region);
  }

  // ─── Load recovery points + plans for selected instance
  async function load(instanceId, accountId, region) {
    _setLoading(true);
    try {
      var res  = await API.getBackups(instanceId, accountId, region);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load backups.');
      recoveryPoints = data.recoveryPoints || [];
      plans          = data.plans          || [];
      _renderRecoveryPoints();
      _renderPlans();
      var wrap = document.getElementById('bk-content');
      if (wrap) wrap.style.display = '';
    } catch (e) {
      App.toast(e.message, 'error');
    } finally {
      _setLoading(false);
    }
  }

  function _setLoading(on) {
    var spinner = document.getElementById('bk-loading');
    if (spinner) spinner.style.display = on ? '' : 'none';
  }
```

- [ ] **Step 2: Write render helpers**

Append to `backup.js` (inside the IIFE, before the return):

```javascript
  function _fmtBytes(bytes) {
    if (!bytes) return '—';
    var gb = (bytes / 1073741824).toFixed(1);
    return gb + ' GB';
  }

  function _fmtDate(d) {
    if (!d || d === 'None') return '—';
    return new Date(d).toLocaleString();
  }

  function _renderRecoveryPoints() {
    var wrap = document.getElementById('bk-rp-tbody');
    if (!wrap) return;
    if (!recoveryPoints.length) {
      wrap.innerHTML = '<tr><td colspan="4" class="bk-empty">No recovery points yet. Click "Back Up Now" to create one.</td></tr>';
      return;
    }
    var role = Auth.getRole();
    var canAct = (role === 'admin' || role === 'operator');
    wrap.innerHTML = recoveryPoints.map(function (rp) {
      var actions = canAct
        ? '<button class="btn btn-sm btn-out" onclick="Backup.openRestoreModal(\'' + rp.recoveryPointArn + '\')">Restore</button> ' +
          '<button class="btn btn-sm btn-danger-out" onclick="Backup.deleteRecovery(\'' + rp.recoveryPointArn + '\')">Delete</button>'
        : '<span class="bk-view-only">View only</span>';
      return '<tr>' +
        '<td>' + _fmtDate(rp.creationDate) + '</td>' +
        '<td><span class="bk-status bk-status-' + (rp.status || '').toLowerCase() + '">' + (rp.status || '—') + '</span></td>' +
        '<td>' + _fmtBytes(rp.backupSizeBytes) + '</td>' +
        '<td>' + actions + '</td>' +
        '</tr>';
    }).join('');
  }

  function _renderPlans() {
    var wrap = document.getElementById('bk-plans-tbody');
    if (!wrap) return;
    if (!plans.length) {
      wrap.innerHTML = '<tr><td colspan="4" class="bk-empty">No schedules configured.</td></tr>';
      return;
    }
    var role = Auth.getRole();
    var canAct = (role === 'admin' || role === 'operator');
    wrap.innerHTML = plans.map(function (p) {
      var actions = canAct
        ? '<button class="btn btn-sm btn-out" onclick="Backup.openScheduleForm(\'' + p.backupPlanId + '\')">Edit</button> ' +
          '<button class="btn btn-sm btn-danger-out" onclick="Backup.deleteSchedule(\'' + p.backupPlanId + '\',\'' + p.selectionId + '\')">Delete</button>'
        : '—';
      return '<tr>' +
        '<td>' + _friendlyCron(p.scheduleCron) + '</td>' +
        '<td>' + (p.retentionDays ? p.retentionDays + ' days' : '—') + '</td>' +
        '<td>' + _fmtDate(p.lastExecutionDate) + '</td>' +
        '<td>' + actions + '</td>' +
        '</tr>';
    }).join('');
  }

  function _friendlyCron(cron) {
    var map = {
      'cron(0 2 * * ? *)':    'Daily at 02:00 UTC',
      'cron(0 2 ? * SUN *)':  'Weekly (Sun) at 02:00 UTC',
      'cron(0 2 1 * ? *)':    'Monthly (1st) at 02:00 UTC',
    };
    return map[cron] || (cron || '—');
  }
```

- [ ] **Step 3: Write backupNow**

Append to `backup.js` (inside IIFE):

```javascript
  // ─── On-demand backup
  async function backupNow() {
    if (!selInstance) return App.toast('Select an instance first.', 'error');
    var btn = document.getElementById('bk-btn-now');
    _setBtnLoading(btn, true);
    try {
      var res  = await API.postBackup({ action: 'createbackup', ...selInstance });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Backup failed.');
      App.toast(data.message || 'Backup job started.', 'success');
      App.log('Backup job started for ' + selInstance.instanceId);
    } catch (e) {
      App.toast(e.message, 'error');
    } finally {
      _setBtnLoading(btn, false);
    }
  }

  function _setBtnLoading(btn, on) {
    if (!btn) return;
    btn.disabled = on;
    btn.textContent = on ? 'Starting…' : 'Back Up Now';
  }
```

- [ ] **Step 4: Write restore modal functions**

Append to `backup.js` (inside IIFE):

```javascript
  // ─── Restore modal
  function openRestoreModal(arn) {
    restoreArn = arn;
    var modal = document.getElementById('bk-restore-modal');
    if (modal) {
      modal.style.display = 'flex';
      // Reset radio to default
      var radio = modal.querySelector('input[name="bk-restore-type"][value="new_instance"]');
      if (radio) radio.checked = true;
    }
  }

  function closeRestoreModal() {
    restoreArn = null;
    var modal = document.getElementById('bk-restore-modal');
    if (modal) modal.style.display = 'none';
  }

  async function confirmRestore() {
    if (!selInstance || !restoreArn) return;
    var radio = document.querySelector('input[name="bk-restore-type"]:checked');
    var restoreType = radio ? radio.value : 'new_instance';

    var msg = restoreType === 'replace'
      ? 'This will create a new instance and STOP the original. Continue?'
      : 'This will create a new instance. The original keeps running. Continue?';
    if (!confirm(msg)) return;

    closeRestoreModal();
    var btn = document.getElementById('bk-confirm-restore');
    _setBtnLoading(btn, true);
    try {
      var res = await API.postBackup({
        action: 'restore',
        recoveryPointArn: restoreArn,
        restoreType: restoreType,
        instanceId: selInstance.instanceId,
        accountId:  selInstance.accountId,
        region:     selInstance.region,
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Restore failed.');
      App.toast(data.message || 'Restore job started.', 'success');
    } catch (e) {
      App.toast(e.message, 'error');
    } finally {
      _setBtnLoading(btn, false);
    }
  }
```

- [ ] **Step 5: Write schedule form functions**

Append to `backup.js` (inside IIFE):

```javascript
  // ─── Schedule form modal (add or edit)
  var CRON_PRESETS = {
    daily:   { cron: 'cron(0 2 * * ? *)',   days: 30  },
    weekly:  { cron: 'cron(0 2 ? * SUN *)', days: 90  },
    monthly: { cron: 'cron(0 2 1 * ? *)',   days: 365 },
    custom:  { cron: '',                     days: 30  },
  };

  function openScheduleForm(planId) {
    editPlan = planId ? plans.find(function (p) { return p.backupPlanId === planId; }) : null;
    var modal = document.getElementById('bk-sched-modal');
    if (!modal) return;
    modal.style.display = 'flex';

    // Pre-fill if editing
    var preset = document.getElementById('bk-sched-preset');
    var customRow = document.getElementById('bk-sched-custom-row');
    var cronInput = document.getElementById('bk-sched-cron');
    var retInput  = document.getElementById('bk-sched-retention');

    if (editPlan) {
      // Detect preset or fallback to custom
      var matchedPreset = Object.keys(CRON_PRESETS).find(function (k) {
        return CRON_PRESETS[k].cron === editPlan.scheduleCron;
      }) || 'custom';
      if (preset) preset.value = matchedPreset;
      if (cronInput) cronInput.value = editPlan.scheduleCron;
      if (retInput)  retInput.value  = editPlan.retentionDays || 30;
      if (customRow) customRow.style.display = (matchedPreset === 'custom') ? '' : 'none';
    } else {
      if (preset) preset.value = 'daily';
      if (cronInput) cronInput.value = CRON_PRESETS.daily.cron;
      if (retInput)  retInput.value  = CRON_PRESETS.daily.days;
      if (customRow) customRow.style.display = 'none';
    }
  }

  function onPresetChange() {
    var preset     = document.getElementById('bk-sched-preset');
    var customRow  = document.getElementById('bk-sched-custom-row');
    var cronInput  = document.getElementById('bk-sched-cron');
    var retInput   = document.getElementById('bk-sched-retention');
    var val        = preset ? preset.value : 'daily';
    var p          = CRON_PRESETS[val] || CRON_PRESETS.daily;
    if (cronInput) cronInput.value = p.cron;
    if (retInput && !editPlan) retInput.value = p.days;  // don't overwrite retention when editing
    if (customRow) customRow.style.display = (val === 'custom') ? '' : 'none';
  }

  function closeScheduleModal() {
    editPlan = null;
    var modal = document.getElementById('bk-sched-modal');
    if (modal) modal.style.display = 'none';
  }

  async function saveSchedule() {
    if (!selInstance) return;
    var cronInput  = document.getElementById('bk-sched-cron');
    var retInput   = document.getElementById('bk-sched-retention');
    var scheduleCron  = cronInput  ? cronInput.value.trim()  : '';
    var retentionDays = retInput   ? parseInt(retInput.value) : 30;

    if (!scheduleCron) return App.toast('Cron expression is required.', 'error');
    if (isNaN(retentionDays) || retentionDays < 1 || retentionDays > 365) {
      return App.toast('Retention must be between 1 and 365 days.', 'error');
    }

    var instanceId   = selInstance.instanceId;
    var planName     = 'ec2ctrl-' + instanceId + '-' + Date.now();
    var action       = editPlan ? 'updateschedule' : 'createschedule';
    var payload      = {
      action,
      scheduleCron,
      retentionDays,
      ...selInstance,
      backupPlanName: editPlan ? editPlan.backupPlanName : planName,
    };
    if (editPlan) {
      payload.backupPlanId = editPlan.backupPlanId;
    }

    closeScheduleModal();
    try {
      var res  = await API.postBackup(payload);
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save schedule.');
      App.toast(data.message || 'Schedule saved.', 'success');
      load(selInstance.instanceId, selInstance.accountId, selInstance.region);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }
```

- [ ] **Step 6: Write deleteSchedule and deleteRecovery**

Append to `backup.js` (inside IIFE):

```javascript
  // ─── Delete schedule
  async function deleteSchedule(planId, selId) {
    if (!selInstance) return;
    if (!confirm('Delete this backup schedule? Existing recovery points are not affected.')) return;
    try {
      var res  = await API.postBackup({
        action: 'deleteschedule',
        backupPlanId: planId,
        selectionId: selId,
        accountId: selInstance.accountId,
        region:    selInstance.region,
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to delete schedule.');
      App.toast('Schedule deleted.', 'success');
      load(selInstance.instanceId, selInstance.accountId, selInstance.region);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }

  // ─── Delete recovery point
  async function deleteRecovery(arn) {
    if (!selInstance) return;
    if (!confirm('Permanently delete this recovery point? This cannot be undone.')) return;
    try {
      var res  = await API.postBackup({
        action: 'deleterecovery',
        recoveryPointArn: arn,
        accountId: selInstance.accountId,
        region:    selInstance.region,
      });
      var data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to delete recovery point.');
      App.toast('Recovery point deleted.', 'success');
      load(selInstance.instanceId, selInstance.accountId, selInstance.region);
    } catch (e) {
      App.toast(e.message, 'error');
    }
  }
```

- [ ] **Step 7: Write public return block — close IIFE**

Append to `backup.js`:

```javascript
  // ─── Public API
  return {
    init:              init,
    onTabActivated:    onTabActivated,
    load:              load,
    backupNow:         backupNow,
    openRestoreModal:  openRestoreModal,
    closeRestoreModal: closeRestoreModal,
    confirmRestore:    confirmRestore,
    openScheduleForm:  openScheduleForm,
    onPresetChange:    onPresetChange,
    closeScheduleModal:closeScheduleModal,
    saveSchedule:      saveSchedule,
    deleteSchedule:    deleteSchedule,
    deleteRecovery:    deleteRecovery,
  };
})();
```

- [ ] **Step 8: Commit**

```bash
git add frontend/js/backup.js
git commit -m "feat(M9): add backup.js IIFE module with backup, schedule, restore, delete"
```

---

## Task 8: Frontend — Update app.js

**Files:**
- Modify: `frontend/js/app.js`

- [ ] **Step 1: Add backup to PAGE_TITLES**

Find `PAGE_TITLES` object in `app.js` (contains `dashboard`, `instances`, `billing`, etc.). Add:

```javascript
    backup:    'Backups',
```

- [ ] **Step 2: Add Backup.onTabActivated() call in go()**

Find the block in `go()` that calls `onTabActivated()` for other modules (e.g., `if (page === 'users') Users.onTabActivated()`). Add after it:

```javascript
      if (page === 'backup')    Backup.onTabActivated();
```

- [ ] **Step 3: Add Backup.init() in App.init()**

Find `App.init()` (or the `init` function). It currently calls `Instances.init()`, `Audit.init()`, etc. Add:

```javascript
      Backup.init();
```

- [ ] **Step 4: Commit**

```bash
git add frontend/js/app.js
git commit -m "feat(M9): register Backup module in app.js PAGE_TITLES, go(), init()"
```

---

## Task 9: Frontend — HTML (sidebar nav + page view + modals + script tag)

**Files:**
- Modify: `frontend/index.html`

### Background
The sidebar nav items follow `<a class="nitem" id="nav-{name}" onclick="App.go('{name}')">`. Page views follow `<div class="pv" id="pv-{name}">`. Add the Backup nav item after the Instances nav item (NOT in the admin section — all roles see this tab). Add the page view after `pv-users`. Add the script tag before `app.js`.

- [ ] **Step 1: Add sidebar nav item**

Find `<a class="nitem" id="nav-instances"` in `index.html`. After it (and its closing `</a>`), add:

```html
            <a class="nitem" id="nav-backup" onclick="App.go('backup')">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              Backups
            </a>
```

- [ ] **Step 2: Add page view container**

Find `<div class="pv" id="pv-users">` and its closing `</div>`. After it, add:

```html
        <!-- ═══ BACKUP PAGE ═══ -->
        <div class="pv" id="pv-backup">
          <div class="ph">
            <div class="ph-l">
              <h1 class="ph-title">Backups</h1>
              <p class="ph-sub">Manage EC2 instance backups and recovery points</p>
            </div>
          </div>

          <!-- Instance selector -->
          <div class="card bk-selector-card">
            <label class="bk-label" for="bk-instance-select">Select Instance</label>
            <select id="bk-instance-select" class="bk-select">
              <option value="">— Select an instance —</option>
            </select>
          </div>

          <div id="bk-loading" style="display:none" class="acct-loading">Loading…</div>

          <!-- Main content: shown after instance selected -->
          <div id="bk-content" style="display:none">

            <!-- Recovery Points panel -->
            <div class="card">
              <div class="bk-panel-header">
                <h2 class="bk-panel-title">Recovery Points</h2>
                <button id="bk-btn-now" class="btn btn-primary btn-sm"
                  onclick="Backup.backupNow()">Back Up Now</button>
              </div>
              <table class="tbl">
                <thead>
                  <tr>
                    <th>Created</th><th>Status</th><th>Size</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody id="bk-rp-tbody">
                  <tr><td colspan="4" class="bk-empty">Select an instance to view recovery points.</td></tr>
                </tbody>
              </table>
            </div>

            <!-- Schedules panel -->
            <div class="card">
              <div class="bk-panel-header">
                <h2 class="bk-panel-title">Backup Schedules</h2>
                <button class="btn btn-out btn-sm"
                  onclick="Backup.openScheduleForm(null)">+ Add Schedule</button>
              </div>
              <table class="tbl">
                <thead>
                  <tr>
                    <th>Schedule</th><th>Retention</th><th>Last Run</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody id="bk-plans-tbody">
                  <tr><td colspan="4" class="bk-empty">No schedules configured.</td></tr>
                </tbody>
              </table>
            </div>

          </div><!-- /#bk-content -->
        </div><!-- /#pv-backup -->
```

- [ ] **Step 3: Add Restore modal**

Find the closing `</main>` tag or look for existing modals (e.g., the accounts grant modal). Before the closing `</body>` tag, add:

```html
        <!-- Backup: Restore modal -->
        <div id="bk-restore-modal" class="modal-overlay" style="display:none" onclick="if(event.target===this)Backup.closeRestoreModal()">
          <div class="modal-box">
            <h3 class="modal-title">Restore Recovery Point</h3>
            <p class="modal-sub">AWS Backup always creates a new instance. Choose what happens to the original:</p>
            <div class="bk-restore-options">
              <label class="bk-radio-label">
                <input type="radio" name="bk-restore-type" value="new_instance" checked>
                <div>
                  <strong>New Instance</strong>
                  <p>Create a new instance. Original keeps running. You verify, then terminate manually.</p>
                </div>
              </label>
              <label class="bk-radio-label">
                <input type="radio" name="bk-restore-type" value="replace">
                <div>
                  <strong>Replace (Stop Original)</strong>
                  <p>Create a new instance and stop the original. You terminate the original after verifying.</p>
                </div>
              </label>
            </div>
            <div class="modal-actions">
              <button class="btn btn-out" onclick="Backup.closeRestoreModal()">Cancel</button>
              <button id="bk-confirm-restore" class="btn btn-primary" onclick="Backup.confirmRestore()">Start Restore</button>
            </div>
          </div>
        </div>

        <!-- Backup: Schedule form modal -->
        <div id="bk-sched-modal" class="modal-overlay" style="display:none" onclick="if(event.target===this)Backup.closeScheduleModal()">
          <div class="modal-box">
            <h3 class="modal-title" id="bk-sched-modal-title">Add Backup Schedule</h3>
            <div class="form-group">
              <label class="bk-label">Schedule Preset</label>
              <select id="bk-sched-preset" class="bk-select" onchange="Backup.onPresetChange()">
                <option value="daily">Daily (02:00 UTC)</option>
                <option value="weekly">Weekly — Sunday (02:00 UTC)</option>
                <option value="monthly">Monthly — 1st (02:00 UTC)</option>
                <option value="custom">Custom cron…</option>
              </select>
            </div>
            <div id="bk-sched-custom-row" class="form-group" style="display:none">
              <label class="bk-label">Custom Cron Expression</label>
              <input id="bk-sched-cron" type="text" class="inp" placeholder="cron(0 2 * * ? *)">
            </div>
            <div class="form-group">
              <label class="bk-label">Retention (days)</label>
              <input id="bk-sched-retention" type="number" class="inp" min="1" max="365" value="30">
            </div>
            <div class="modal-actions">
              <button class="btn btn-out" onclick="Backup.closeScheduleModal()">Cancel</button>
              <button class="btn btn-primary" onclick="Backup.saveSchedule()">Save Schedule</button>
            </div>
          </div>
        </div>
```

- [ ] **Step 4: Add script tag before app.js**

Find `<script src="js/users.js"></script>`. After it, add:

```html
        <script src="js/backup.js"></script>
```

- [ ] **Step 5: Commit**

```bash
git add frontend/index.html
git commit -m "feat(M9): add Backup tab HTML — sidebar nav, page view, modals, script tag"
```

---

## Task 10: Frontend — Add Backup tab styles to styles.css

**Files:**
- Modify: `frontend/css/styles.css`

- [ ] **Step 1: Add backup styles**

Find the end of the existing CSS (or the start of the users section styles). Add a new section:

```css
/* ═══════════════════════════════════════════════════
   BACKUP TAB — M9
═══════════════════════════════════════════════════ */
.bk-selector-card { padding: 1.25rem 1.5rem; margin-bottom: 1.25rem; }
.bk-label { display: block; font-size: .8rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; margin-bottom: .4rem; }
.bk-select { width: 100%; max-width: 480px; padding: .55rem .75rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 6px; color: var(--text); font-size: .9rem; }
.bk-select:focus { outline: none; border-color: var(--accent); }

.bk-panel-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; }
.bk-panel-title  { font-size: 1rem; font-weight: 600; margin: 0; }
.bk-empty        { color: var(--text-muted); font-style: italic; text-align: center; padding: 1.5rem 0; }
.bk-view-only    { font-size: .75rem; color: var(--text-muted); }

/* Status badge */
.bk-status { display: inline-block; padding: .15rem .5rem; border-radius: 4px; font-size: .75rem; font-weight: 600; text-transform: uppercase; }
.bk-status-completed { background: rgba(34,197,94,.15); color: #22c55e; }
.bk-status-running   { background: rgba(59,130,246,.15); color: #3b82f6; }
.bk-status-failed    { background: rgba(239,68,68,.15);  color: #ef4444; }
.bk-status-partial   { background: rgba(251,191,36,.15); color: #fbbf24; }

/* Restore modal radio options */
.bk-restore-options  { display: flex; flex-direction: column; gap: .75rem; margin: 1rem 0; }
.bk-radio-label      { display: flex; align-items: flex-start; gap: .75rem; padding: .85rem 1rem; border: 1px solid var(--border); border-radius: 8px; cursor: pointer; }
.bk-radio-label:has(input:checked) { border-color: var(--accent); background: rgba(99,102,241,.07); }
.bk-radio-label input { margin-top: .2rem; accent-color: var(--accent); }
.bk-radio-label strong { display: block; font-size: .9rem; margin-bottom: .2rem; }
.bk-radio-label p    { font-size: .8rem; color: var(--text-muted); margin: 0; }

/* Schedule form */
.form-group { margin-bottom: 1rem; }
.form-group .inp { width: 100%; }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/css/styles.css
git commit -m "feat(M9): add Backup tab CSS styles"
```

---

## Task 11: Deploy and Verify

- [ ] **Step 1: Run deploy**

From Git Bash in project root:
```bash
./deploy.sh
```
Expected: CloudFormation stack UPDATE_COMPLETE, S3 upload succeeded, CloudFront invalidation triggered.

- [ ] **Step 2: Verify BackupVault exists**

In AWS Console → AWS Backup → Backup vaults → confirm `ec2-control-vault-production` exists.

- [ ] **Step 3: Verify BackupServiceRole exists**

In AWS Console → IAM → Roles → search `ec2-control-backup-role-production` → confirm it exists with the two managed policies attached.

- [ ] **Step 4: Test on-demand backup**

Open `https://solobil.com` → login as admin → Backups tab → select an instance → "Back Up Now" → check AWS Backup console → verify a backup job appears under `ec2-control-vault-production`.

- [ ] **Step 5: Test schedule creation**

Backups tab → "+ Add Schedule" → select Daily → retention 30 → Save → verify Backup Plan + Selection appear in AWS Backup console.

- [ ] **Step 6: Test recovery points list**

Wait for backup job to complete (or check immediately) → refresh Backups tab → verify recovery points table populates.

- [ ] **Step 7: Test restore (new instance)**

Click Restore → select "New Instance" → Start Restore → verify toast → check EC2 Instances console for new instance.

- [ ] **Step 8: Test restore (replace)**

Click Restore → select "Replace (Stop Original)" → Start Restore → verify original instance is stopped in EC2 console, new instance created.

- [ ] **Step 9: Test RBAC (operator)**

Login as operator account → Backups tab → verify only assigned-account instances appear in dropdown → verify backup/restore buttons visible.

- [ ] **Step 10: Test RBAC (viewer)**

Login as viewer account → Backups tab → verify table shows recovery points but no action buttons.

- [ ] **Step 11: Test delete recovery point**

Click Delete on a recovery point → confirm → verify it disappears from list.

- [ ] **Step 12: Test delete schedule**

Click Delete on a schedule → confirm → verify plan removed from AWS Backup console.

- [ ] **Step 13: Final commit — milestone tag**

```bash
git add cloudformation/central-stack.yaml cloudformation/member-role-stack.yaml \
  lambda/ec2_controller/backup.py lambda/ec2_controller/index.py \
  frontend/js/backup.js frontend/js/api.js frontend/js/app.js \
  frontend/index.html frontend/css/styles.css
git commit -m "feat: M9 complete — Backup dashboard with AWS Backup, schedules, restore"
```

---

## Cross-Account Backup Note

If backup jobs for member account instances fail with `AccessDeniedException`:
1. Check the vault access policy — may need to add `backup:StartBackupJob` alongside `backup:CopyIntoBackupVault`
2. Verify the member account role has `backup:StartBackupJob` (added in Task 3)
3. Update the vault `AccessPolicy` ARN list in `central-stack.yaml` with the failing account ARN and redeploy
