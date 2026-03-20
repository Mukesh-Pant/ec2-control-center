"""AWS Backup integration — on-demand backups, schedules, and restore."""

import os
import json
import logging
import uuid
import boto3

from utils import get_caller, is_admin, response, error_response

logger = logging.getLogger()
logger.setLevel(logging.INFO)

BACKUP_ROLE_ARN   = os.environ.get('BACKUP_ROLE_ARN', '')
BACKUP_VAULT_NAME = os.environ.get('BACKUP_VAULT_NAME', 'ec2-control-vault-production')
CENTRAL_ACCOUNT_ID = os.environ.get('CENTRAL_ACCOUNT_ID', '')
ENVIRONMENT        = os.environ.get('ENVIRONMENT', 'production')

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
    """Return set of accountIds the caller has access to (for operators).
    Imports accounts module inline to avoid circular imports.
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


# ─────────────────────────────────────────────
# GET /backup
# ─────────────────────────────────────────────

def handle_backup_list(event):
    """GET /backup?instanceId=&accountId=&region="""
    params      = event.get('queryStringParameters') or {}
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
        rp_kwargs = {'ResourceArn': instance_arn, 'MaxResults': 100}
        while True:
            rp_resp = backup_client.list_recovery_points_by_resource(**rp_kwargs)
            for rp in rp_resp.get('RecoveryPoints', []):
                recovery_points.append({
                    'recoveryPointArn': rp.get('RecoveryPointArn', ''),
                    'creationDate':     str(rp.get('CreationDate', '')),
                    'status':           rp.get('Status', ''),
                    'backupSizeBytes':  rp.get('BackupSizeBytes', 0),
                })
            next_token = rp_resp.get('NextToken')
            if not next_token:
                break
            rp_kwargs['NextToken'] = next_token

        # Collect plans that select this instance
        plans = []
        plan_kwargs = {'MaxResults': 100}
        while True:
            plan_resp = backup_client.list_backup_plans(**plan_kwargs)
            for plan_summary in plan_resp.get('BackupPlansList', []):
                plan_id = plan_summary['BackupPlanId']
                sel_resp = backup_client.list_backup_selections(BackupPlanId=plan_id)
                for sel in sel_resp.get('BackupSelectionsList', []):
                    sel_detail = backup_client.get_backup_selection(
                        BackupPlanId=plan_id, SelectionId=sel['SelectionId']
                    )
                    resources = sel_detail.get('BackupSelection', {}).get('Resources', [])
                    if instance_arn in resources:
                        plan_detail = backup_client.get_backup_plan(BackupPlanId=plan_id)
                        rules = plan_detail.get('BackupPlan', {}).get('Rules', [{}])
                        rule = rules[0] if rules else {}
                        lifecycle = rule.get('Lifecycle', {})
                        plans.append({
                            'backupPlanId':      plan_id,
                            'backupPlanName':    plan_summary.get('BackupPlanName', ''),
                            'selectionId':       sel['SelectionId'],
                            'scheduleCron':      rule.get('ScheduleExpression', ''),
                            'retentionDays':     lifecycle.get('DeleteAfterDays'),
                            'lastExecutionDate': str(plan_summary.get('LastExecutionDate', '')),
                        })
                        break
            next_token = plan_resp.get('NextToken')
            if not next_token:
                break
            plan_kwargs['NextToken'] = next_token

        return response(200, {'recoveryPoints': recovery_points, 'plans': plans})

    except Exception as e:
        logger.exception('handle_backup_list error')
        return error_response(500, str(e))


# ─────────────────────────────────────────────
# POST /backup — dispatcher
# ─────────────────────────────────────────────

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


# ─────────────────────────────────────────────
# Action handlers
# ─────────────────────────────────────────────

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

    try:
        backup_client, _ = _get_clients(account_id, region)
        job = backup_client.start_backup_job(
            BackupVaultName=BACKUP_VAULT_NAME,
            ResourceArn=instance_arn,
            IamRoleArn=BACKUP_ROLE_ARN,
            IdempotencyToken=str(uuid.uuid4()),
            Lifecycle={'DeleteAfterDays': 30},
        )
        return response(200, {'jobId': job['BackupJobId'], 'message': 'Backup job started.'})
    except Exception as e:
        logger.exception('_create_backup error')
        return error_response(500, str(e))


def _create_schedule(event, body):
    """Create a Backup Plan + Selection for an EC2 instance."""
    account_id     = body.get('accountId', '')
    instance_arn   = body.get('instanceArn', '')
    region         = body.get('region', 'ap-south-1')
    schedule_cron  = body.get('scheduleCron', 'cron(0 2 * * ? *)')
    retention_days = int(body.get('retentionDays', 30))
    plan_name      = body.get('backupPlanName', '')

    if not account_id or not instance_arn or not plan_name:
        return error_response(400, 'accountId, instanceArn, and backupPlanName are required.')
    if retention_days < 1 or retention_days > 365:
        return error_response(400, 'retentionDays must be between 1 and 365.')

    guard = _check_account_access(event, account_id)
    if guard:
        return guard

    try:
        backup_client, _ = _get_clients(account_id, region)
        plan_resp = backup_client.create_backup_plan(
            BackupPlan={
                'BackupPlanName': plan_name,
                'Rules': [{
                    'RuleName':              'scheduled-backup',
                    'TargetBackupVaultName': BACKUP_VAULT_NAME,
                    'ScheduleExpression':    schedule_cron,
                    'Lifecycle':             {'DeleteAfterDays': retention_days},
                }],
            }
        )
        plan_id = plan_resp['BackupPlanId']
        backup_client.create_backup_selection(
            BackupPlanId=plan_id,
            BackupSelection={
                'SelectionName': 'instance-selection',
                'IamRoleArn':    BACKUP_ROLE_ARN,
                'Resources':     [instance_arn],
            }
        )
        return response(200, {'backupPlanId': plan_id, 'message': 'Schedule created.'})
    except Exception as e:
        logger.exception('_create_schedule error')
        return error_response(500, str(e))


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

    try:
        backup_client, _ = _get_clients(account_id, region)
        backup_client.update_backup_plan(
            BackupPlanId=plan_id,
            BackupPlan={
                'BackupPlanName': plan_name,
                'Rules': [{
                    'RuleName':              'scheduled-backup',
                    'TargetBackupVaultName': BACKUP_VAULT_NAME,
                    'ScheduleExpression':    schedule_cron,
                    'Lifecycle':             {'DeleteAfterDays': retention_days},
                }],
            }
        )
        return response(200, {'message': 'Schedule updated.'})
    except Exception as e:
        logger.exception('_update_schedule error')
        return error_response(500, str(e))


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

    try:
        backup_client, _ = _get_clients(account_id, region)
        backup_client.delete_backup_selection(BackupPlanId=plan_id, SelectionId=sel_id)
        backup_client.delete_backup_plan(BackupPlanId=plan_id)
        return response(200, {'message': 'Schedule deleted.'})
    except Exception as e:
        logger.exception('_delete_schedule error')
        return error_response(500, str(e))


def _list_schedules(event, body):
    """List all Backup Plans targeting instances in the given account."""
    account_id = body.get('accountId', '')
    region     = body.get('region', 'ap-south-1')

    if not account_id:
        return error_response(400, 'accountId is required.')

    guard = _check_account_access(event, account_id)
    if guard:
        return guard

    try:
        backup_client, _ = _get_clients(account_id, region)
        plans = []
        plan_kwargs = {'MaxResults': 100}
        while True:
            plan_resp = backup_client.list_backup_plans(**plan_kwargs)
            for plan_summary in plan_resp.get('BackupPlansList', []):
                plan_id = plan_summary['BackupPlanId']
                sel_resp = backup_client.list_backup_selections(BackupPlanId=plan_id)
                for sel in sel_resp.get('BackupSelectionsList', []):
                    sel_detail = backup_client.get_backup_selection(
                        BackupPlanId=plan_id, SelectionId=sel['SelectionId']
                    )
                    resources = sel_detail.get('BackupSelection', {}).get('Resources', [])
                    # Filter: resource ARN must belong to the requested account
                    if any(f':{account_id}:' in r for r in resources):
                        plan_detail = backup_client.get_backup_plan(BackupPlanId=plan_id)
                        rules = plan_detail.get('BackupPlan', {}).get('Rules', [{}])
                        rule = rules[0] if rules else {}
                        lifecycle = rule.get('Lifecycle', {})
                        plans.append({
                            'backupPlanId':      plan_id,
                            'backupPlanName':    plan_summary.get('BackupPlanName', ''),
                            'selectionId':       sel['SelectionId'],
                            'scheduleCron':      rule.get('ScheduleExpression', ''),
                            'retentionDays':     lifecycle.get('DeleteAfterDays'),
                            'lastExecutionDate': str(plan_summary.get('LastExecutionDate', '')),
                            'resources':         resources,
                        })
                        break
            next_token = plan_resp.get('NextToken')
            if not next_token:
                break
            plan_kwargs['NextToken'] = next_token

        return response(200, {'plans': plans})
    except Exception as e:
        logger.exception('_list_schedules error')
        return error_response(500, str(e))


def _restore(event, body):
    """Start a restore job. AWS Backup always creates a NEW instance.
    restoreType 'replace' additionally stops the original instance.
    """
    account_id         = body.get('accountId', '')
    region             = body.get('region', 'ap-south-1')
    recovery_point_arn = body.get('recoveryPointArn', '')
    instance_id        = body.get('instanceId', '')
    restore_type       = body.get('restoreType', 'new_instance').strip().lower()

    if not account_id or not recovery_point_arn or not instance_id:
        return error_response(400, 'accountId, recoveryPointArn, and instanceId are required.')
    if restore_type not in ('new_instance', 'replace'):
        return error_response(400, "restoreType must be 'new_instance' or 'replace'.")

    guard = _check_account_access(event, account_id)
    if guard:
        return guard

    try:
        backup_client, ec2_client = _get_clients(account_id, region)

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

    try:
        backup_client, _ = _get_clients(account_id, region)
        backup_client.delete_recovery_point(
            BackupVaultName=BACKUP_VAULT_NAME,
            RecoveryPointArn=recovery_point_arn,
        )
        return response(200, {'message': 'Recovery point deleted.'})
    except Exception as e:
        logger.exception('_delete_recovery error')
        return error_response(500, str(e))
