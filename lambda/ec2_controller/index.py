"""EC2 Controller Lambda — Main handler for REST API v1.

Routes:
  POST /ec2           — actions: list, status, start, stop
  GET  /accounts      — list registered AWS accounts (admin only)
  POST /accounts      — account mutations (admin only)
  GET  /audit         — audit event log  (query: instanceId, userEmail, limit, lastKey)
  GET  /audit/daily   — per-day running hours + cost (query: instanceId, days)
  GET  /pricing       — live on-demand hourly rates (query: region, types)
  GET  /users         — list all Cognito users with roles and assignments (admin only)
  POST /users         — setRole, grantAccount, revokeAccount, getPermissions (admin only)
  GET  /labs                — list labs (admin=all, operator=own)
  POST /labs                — provision new lab instance
  DELETE /labs              — terminate lab (admin only)
  POST /labs/payment        — upload payment screenshot
  GET  /labs/keypair        — get pre-signed .pem download URL
  GET  /labs/windows-password — decrypt Windows RDP password
  GET  /labs/pricing        — cost breakdown from AWS Price List API
  GET  /labs/network-options  — VPCs, subnets, security groups for account
"""

import json
import logging
import os
import boto3
from concurrent.futures import ThreadPoolExecutor, as_completed

from utils import response, error_response, get_caller, map_aws_error, is_admin, require_admin, get_caller_groups
from accounts import (get_accounts, get_all_accounts, get_ec2_client, get_all_regions,
                      get_user_accounts, get_allowed_account_ids, grant_account, revoke_account)
import audit
import pricing
import backup
import labs
from console_login import handle_console_login

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Module-level boto3 singletons — created once per warm container
_ddb_resource   = None
_cognito_client = None


def _get_ddb():
    global _ddb_resource
    if _ddb_resource is None:
        _ddb_resource = boto3.resource('dynamodb')
    return _ddb_resource


def _get_cognito():
    global _cognito_client
    if _cognito_client is None:
        _cognito_client = boto3.client('cognito-idp')
    return _cognito_client


def lambda_handler(event, context):
    logger.info("Event: %s", json.dumps(event))

    method = event.get('httpMethod', 'POST')
    path   = event.get('path', '/ec2')

    if path == '/ec2' and method == 'POST':
        return handle_ec2(event)
    elif path == '/accounts' and method == 'GET':
        return handle_accounts_list(event)
    elif path == '/accounts' and method == 'POST':
        return handle_accounts_mutation(event)
    elif path == '/audit' and method == 'GET':
        return handle_audit_log(event)
    elif path == '/audit/daily' and method == 'GET':
        return handle_audit_daily(event)
    elif path == '/pricing' and method == 'GET':
        return handle_pricing(event)
    elif path == '/users' and method == 'GET':
        return handle_users_list(event)
    elif path == '/users' and method == 'POST':
        return handle_users_mutation(event)
    elif path == '/backup' and method == 'GET':
        return backup.handle_backup_list(event)
    elif path == '/backup' and method == 'POST':
        return backup.handle_backup_mutation(event)
    elif path == '/console-login' and method == 'POST':
        return handle_console_login(event)
    elif path == '/labs' and method == 'GET':
        return labs.handle_labs_list(event)
    elif path == '/labs' and method == 'POST':
        return labs.handle_labs_provision(event)
    elif path == '/labs' and method == 'DELETE':
        return labs.handle_labs_delete(event)
    elif path == '/labs/payment' and method == 'GET':
        return labs.handle_labs_payment_view(event)
    elif path == '/labs/payment' and method == 'POST':
        return labs.handle_labs_payment(event)
    elif path == '/labs/keypair' and method == 'GET':
        return labs.handle_labs_keypair(event)
    elif path == '/labs/windows-password' and method == 'GET':
        return labs.handle_labs_windows_password(event)
    elif path == '/labs/pricing' and method == 'GET':
        return labs.handle_labs_pricing(event)
    elif path == '/labs/network-options' and method == 'GET':
        return labs.handle_labs_network_options(event)
    else:
        return error_response(404, 'Not found')


# ─── EC2 Actions ─────────────────────────────────────────────────────────────

def handle_ec2(event):
    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return error_response(400, 'Invalid JSON body')

    action        = body.get('action', '').strip().lower()
    instance_id   = body.get('instanceId', '').strip()
    region        = body.get('region', '').strip()
    account_id    = body.get('accountId', '').strip()
    # Optional fields sent by frontend for richer audit logs
    instance_name = body.get('instanceName', '').strip()
    instance_type = body.get('instanceType', '').strip()

    if action not in ('list', 'start', 'stop', 'status', 'terminate'):
        return error_response(400, 'Invalid action. Must be list, start, stop, status, or terminate.')

    caller = get_caller(event)
    logger.info("action=%s instance=%s region=%s account=%s caller=%s",
                action, instance_id, region, account_id, caller)

    try:
        if action == 'list':
            return handle_list(event)

        if not instance_id:
            return error_response(400, 'instanceId is required.')
        if not region:
            return error_response(400, 'region is required.')

        # ── RBAC: terminate is admin-only ──
        if action == 'terminate':
            err = require_admin(event)
            if err:
                return err

        # ── RBAC: non-admins may only act on their assigned accounts ──
        if not is_admin(event):
            groups = get_caller_groups(event)
            if not groups:
                return error_response(403, 'Your account is pending approval. Contact an administrator.')
            allowed_ids = get_allowed_account_ids(caller)
            if account_id not in allowed_ids:
                return error_response(403, 'You do not have access to this account.')
            if action in ('start', 'stop'):
                assignments = get_user_accounts(caller)
                assignment = next((a for a in assignments if a['accountId'] == account_id), None)
                if not assignment or assignment.get('accessLevel') == 'viewer':
                    return error_response(403, 'Viewer access is read-only. Start/stop not permitted.')

        client = get_ec2_client(account_id, region)

        if action == 'status':
            return handle_status(client, instance_id, region)
        elif action == 'start':
            return handle_start(client, instance_id, region, account_id,
                                caller, instance_name, instance_type)
        elif action == 'stop':
            return handle_stop(client, instance_id, region, account_id,
                               caller, instance_name, instance_type)
        elif action == 'terminate':
            return handle_terminate(client, instance_id, region, account_id,
                                    caller, instance_name, instance_type)

    except IndexError:
        return error_response(404, 'Instance not found.')
    except Exception as e:
        return map_aws_error(e, region)


def handle_list(event):
    caller = get_caller(event)

    if is_admin(event):
        accounts = get_accounts()
    else:
        groups = get_caller_groups(event)
        if not groups:
            return response(200, {'instances': [], 'pendingApproval': True})
        allowed_ids = get_allowed_account_ids(caller)
        if not allowed_ids:
            return response(200, {'instances': [], 'noAccountsAssigned': True})
        all_enabled = get_accounts()
        accounts = [a for a in all_enabled if a['accountId'] in allowed_ids]

    all_instances = []

    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = []
        for account in accounts:
            acct_id   = account['accountId']
            acct_name = account.get('accountName', acct_id)
            regions   = account.get('regions') or get_all_regions(acct_id)
            for region in regions:
                futures.append(executor.submit(
                    _list_instances_in_region, acct_id, acct_name, region
                ))

        for future in as_completed(futures):
            result = future.result()
            if result:
                all_instances.extend(result)

    all_instances.sort(key=lambda x: (
        0 if x['state'] == 'running' else 1,
        x.get('accountName', ''),
        x['region'],
        x['name']
    ))

    logger.info("Total instances found: %d", len(all_instances))
    return response(200, {'instances': all_instances})


def _list_instances_in_region(account_id, account_name, region):
    instances = []
    try:
        client = get_ec2_client(account_id, region)

        # 1. Collect all raw instances and volume IDs
        raw_insts   = []
        all_vol_ids = []
        paginator   = client.get_paginator('describe_instances')
        for page in paginator.paginate():
            for reservation in page['Reservations']:
                for inst in reservation['Instances']:
                    raw_insts.append(inst)
                    for bdm in inst.get('BlockDeviceMappings', []):
                        vid = bdm.get('Ebs', {}).get('VolumeId')
                        if vid:
                            all_vol_ids.append(vid)

        # 2. Batch-fetch volume sizes (best-effort)
        vol_size_map = {}
        if all_vol_ids:
            try:
                vol_pag = client.get_paginator('describe_volumes')
                for page in vol_pag.paginate(VolumeIds=all_vol_ids):
                    for vol in page['Volumes']:
                        vol_size_map[vol['VolumeId']] = vol['Size']
            except Exception as e:
                logger.warning("describe_volumes failed %s/%s: %s", account_id, region, e)

        # 3. Fetch Elastic IPs (best-effort)
        eip_map = {}
        if raw_insts:
            try:
                inst_ids = [i['InstanceId'] for i in raw_insts]
                addrs = client.describe_addresses(
                    Filters=[{'Name': 'instance-id', 'Values': inst_ids}]
                )
                for addr in addrs.get('Addresses', []):
                    if 'InstanceId' in addr:
                        eip_map[addr['InstanceId']] = addr['PublicIp']
            except Exception as e:
                logger.warning("describe_addresses failed %s/%s: %s", account_id, region, e)

        # 4. Build enriched instance list
        for inst in raw_insts:
            name = inst['InstanceId']
            for tag in inst.get('Tags', []):
                if tag['Key'] == 'Name':
                    name = tag['Value'] or inst['InstanceId']
                    break

            platform_raw = inst.get('Platform', '')
            platform     = 'Windows' if platform_raw and platform_raw.lower() == 'windows' else 'Linux'

            storage_gb = sum(
                vol_size_map.get(bdm.get('Ebs', {}).get('VolumeId', ''), 0)
                for bdm in inst.get('BlockDeviceMappings', [])
            )

            instances.append({
                'instanceId':   inst['InstanceId'],
                'name':         name,
                'state':        inst['State']['Name'],
                'instanceType': inst.get('InstanceType', 'N/A'),
                'publicIp':     inst.get('PublicIpAddress', ''),
                'platform':     platform,
                'storageGb':    storage_gb,
                'elasticIp':    eip_map.get(inst['InstanceId'], ''),
                'region':       region,
                'accountId':    account_id,
                'accountName':  account_name,
            })
    except Exception as e:
        logger.warning("Failed listing instances in %s/%s: %s", account_id, region, e)
    return instances


def handle_status(client, instance_id, region):
    resp = client.describe_instances(InstanceIds=[instance_id])
    inst = resp['Reservations'][0]['Instances'][0]
    return response(200, {
        'state':        inst['State']['Name'],
        'instanceType': inst.get('InstanceType', 'N/A'),
        'publicIp':     inst.get('PublicIpAddress', 'N/A'),
        'launchTime':   str(inst.get('LaunchTime', '')),
        'instanceId':   instance_id,
        'region':       region,
    })


def handle_start(client, instance_id, region, account_id,
                 caller, instance_name, instance_type):
    resp  = client.start_instances(InstanceIds=[instance_id])
    state = resp['StartingInstances'][0]['CurrentState']['Name']
    logger.info("STARTED %s in %s by %s", instance_id, region, caller)

    audit.log_action(
        instance_id=instance_id,
        instance_name=instance_name,
        instance_type=instance_type,
        action='start',
        user_email=caller,
        result='success',
        account_id=account_id,
        region=region,
    )

    return response(200, {
        'message':     'Instance start initiated.',
        'state':       state,
        'requestedBy': caller,
    })


def handle_stop(client, instance_id, region, account_id,
                caller, instance_name, instance_type):
    resp  = client.stop_instances(InstanceIds=[instance_id])
    state = resp['StoppingInstances'][0]['CurrentState']['Name']
    logger.info("STOPPED %s in %s by %s", instance_id, region, caller)

    audit.log_action(
        instance_id=instance_id,
        instance_name=instance_name,
        instance_type=instance_type,
        action='stop',
        user_email=caller,
        result='success',
        account_id=account_id,
        region=region,
    )

    return response(200, {
        'message':     'Instance stop initiated.',
        'state':       state,
        'requestedBy': caller,
    })


def handle_terminate(client, instance_id, region, account_id,
                     caller, instance_name, instance_type):
    # Release any associated Elastic IP first (best-effort)
    try:
        addrs = client.describe_addresses(
            Filters=[{'Name': 'instance-id', 'Values': [instance_id]}]
        )
        for addr in addrs.get('Addresses', []):
            try:
                client.release_address(AllocationId=addr['AllocationId'])
            except Exception as e:
                logger.warning('terminate: EIP release failed %s: %s', addr.get('AllocationId'), e)
    except Exception as e:
        logger.warning('terminate: describe_addresses failed for %s: %s', instance_id, e)

    resp  = client.terminate_instances(InstanceIds=[instance_id])
    state = resp['TerminatingInstances'][0]['CurrentState']['Name']
    logger.info("TERMINATED %s in %s by %s", instance_id, region, caller)

    audit.log_action(
        instance_id=instance_id,
        instance_name=instance_name,
        instance_type=instance_type,
        action='terminate',
        user_email=caller,
        result='success',
        account_id=account_id,
        region=region,
    )
    return response(200, {
        'message':     'Instance termination initiated.',
        'state':       state,
        'requestedBy': caller,
    })


# ─── Accounts: List ──────────────────────────────────────────────────────────

def handle_accounts_list(event):
    if is_admin(event):
        # Admins see all accounts (enabled + disabled) for management
        accounts = get_all_accounts()
    else:
        # Operators/viewers: return only their enabled assigned accounts
        groups = get_caller_groups(event)
        if not groups:
            return error_response(403, 'Your account is pending approval. Contact an administrator.')
        caller = get_caller(event)
        allowed_ids = get_allowed_account_ids(caller)
        if not allowed_ids:
            return response(200, {'accounts': []})
        all_enabled = get_accounts()
        accounts = [a for a in all_enabled if a['accountId'] in allowed_ids]
    safe = [{
        'accountId':      a['accountId'],
        'accountName':    a.get('accountName', a['accountId']),
        'roleArn':        a.get('roleArn', ''),
        'consoleRoleArn': a.get('consoleRoleArn', ''),
        'enabled':        a.get('enabled', False),
        'isCentral':      a.get('roleArn', '') == 'LOCAL',
    } for a in accounts]
    return response(200, {'accounts': safe})


# ─── Accounts: Mutations (M5) ────────────────────────────────────────────────

def handle_accounts_mutation(event):
    err = require_admin(event)
    if err:
        return err
    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return error_response(400, 'Invalid JSON body')

    action     = body.get('action', '').strip().lower()
    account_id = body.get('accountId', '').strip()

    if not account_id:
        return error_response(400, 'accountId is required.')

    caller = get_caller(event)
    logger.info("accounts mutation: action=%s accountId=%s caller=%s",
                action, account_id, caller)

    table = _get_ddb().Table(os.environ.get('ACCOUNTS_TABLE', 'ec2-control-accounts-production'))

    # Prevent mutations on the central account's roleArn/removal
    def _is_central(acct_id):
        try:
            item = table.get_item(Key={'accountId': acct_id}).get('Item', {})
            return item.get('roleArn', '') == 'LOCAL'
        except Exception:
            return False

    if action == 'add':
        account_name = body.get('accountName', '').strip()
        role_arn     = body.get('roleArn', '').strip()
        if not account_name:
            return error_response(400, 'accountName is required.')
        if not role_arn or not role_arn.startswith('arn:aws:iam::'):
            return error_response(400, 'roleArn must be a valid IAM role ARN.')
        if not account_id.isdigit() or len(account_id) != 12:
            return error_response(400, 'accountId must be a 12-digit AWS account ID.')
        try:
            item = {
                'accountId':   account_id,
                'accountName': account_name,
                'roleArn':     role_arn,
                'enabled':     True,
            }
            console_role_arn = body.get('consoleRoleArn', '').strip()
            if console_role_arn:
                item['consoleRoleArn'] = console_role_arn
            table.put_item(Item=item)
            logger.info("Account added: %s (%s) by %s", account_id, account_name, caller)
            return response(200, {'message': f'Account {account_id} added successfully.',
                                  'accountId': account_id})
        except Exception as e:
            logger.error("Failed to add account %s: %s", account_id, e)
            return error_response(500, 'Failed to add account.')

    elif action == 'update':
        account_name = body.get('accountName', '').strip()
        if not account_name:
            return error_response(400, 'accountName is required.')
        try:
            update_expr = 'SET accountName = :n'
            expr_values = {':n': account_name}
            if 'consoleRoleArn' in body:
                update_expr += ', consoleRoleArn = :crn'
                expr_values[':crn'] = body['consoleRoleArn'].strip()
            table.update_item(
                Key={'accountId': account_id},
                UpdateExpression=update_expr,
                ExpressionAttributeValues=expr_values,
            )
            return response(200, {'message': 'Account updated.', 'accountId': account_id})
        except Exception as e:
            logger.error("Failed to update account %s: %s", account_id, e)
            return error_response(500, 'Failed to update account.')

    elif action in ('enable', 'disable'):
        enabled = (action == 'enable')
        try:
            table.update_item(
                Key={'accountId': account_id},
                UpdateExpression='SET enabled = :e',
                ExpressionAttributeValues={':e': enabled},
            )
            return response(200, {'message': f'Account {action}d.', 'accountId': account_id,
                                  'enabled': enabled})
        except Exception as e:
            logger.error("Failed to %s account %s: %s", action, account_id, e)
            return error_response(500, f'Failed to {action} account.')

    elif action == 'remove':
        if _is_central(account_id):
            return error_response(400, 'Cannot remove the central account.')
        try:
            table.delete_item(Key={'accountId': account_id})
            logger.info("Account removed: %s by %s", account_id, caller)
            return response(200, {'message': f'Account {account_id} removed.', 'accountId': account_id})
        except Exception as e:
            logger.error("Failed to remove account %s: %s", account_id, e)
            return error_response(500, 'Failed to remove account.')

    elif action == 'test':
        return _test_account_connection(account_id)

    else:
        return error_response(400, 'Invalid action. Must be add, update, enable, disable, remove, or test.')


def _test_account_connection(account_id):
    """Test cross-account connectivity by attempting to list instances in one region."""
    region = os.environ.get('AWS_REGION', 'ap-south-1')
    try:
        client = get_ec2_client(account_id, region)
        resp   = client.describe_instances(MaxResults=5)
        count  = sum(len(r['Instances']) for r in resp.get('Reservations', []))
        return response(200, {
            'success':    True,
            'accountId':  account_id,
            'region':     region,
            'message':    f'Connection successful. Found {count} instance(s) in {region}.',
        })
    except Exception as e:
        error_msg = str(e)
        logger.warning("Connection test failed for %s: %s", account_id, error_msg)
        # Friendly message for common errors
        if 'AccessDenied' in error_msg or 'is not authorized' in error_msg:
            friendly = 'Access denied. Verify the cross-account role exists and trusts the central account.'
        elif 'NoCredentialProviders' in error_msg or 'could not be assumed' in error_msg.lower():
            friendly = 'Could not assume role. Check the role ARN and ExternalId in the trust policy.'
        else:
            friendly = f'Connection failed: {error_msg}'
        return response(200, {
            'success':   False,
            'accountId': account_id,
            'message':   friendly,
        })


# ─── Audit: Event Log ────────────────────────────────────────────────────────

def handle_audit_log(event):
    qs = event.get('queryStringParameters') or {}
    instance_id = qs.get('instanceId', '').strip()
    user_email  = qs.get('userEmail', '').strip()
    action      = qs.get('action', '').strip()
    account_id  = qs.get('accountId', '').strip()
    limit       = int(qs.get('limit', 50))

    # Decode pagination key (passed as JSON string)
    raw_key  = qs.get('lastKey', '')
    last_key = None
    if raw_key:
        try:
            last_key = json.loads(raw_key)
        except Exception:
            pass

    items, next_key = audit.get_audit_log(
        instance_id=instance_id or None,
        user_email=user_email or None,
        action=action or None,
        account_id=account_id or None,
        limit=limit,
        last_key=last_key,
    )

    return response(200, {
        'items':   items,
        'lastKey': next_key,
        'count':   len(items),
    })


# ─── Audit: Daily Summary ────────────────────────────────────────────────────

def handle_audit_daily(event):
    qs = event.get('queryStringParameters') or {}
    instance_id = qs.get('instanceId', '').strip()
    days        = int(qs.get('days', 30))

    if not instance_id:
        return error_response(400, 'instanceId is required.')
    if not 1 <= days <= 90:
        return error_response(400, 'days must be between 1 and 90.')

    summary = audit.get_daily_summary(instance_id=instance_id, days=days)

    # Compute totals for the response
    total_running = round(sum(r['runningHours'] for r in summary), 2)
    total_cost    = round(sum(r['estimatedCost'] for r in summary), 4)
    instance_type = summary[0]['instanceType'] if summary else 'unknown'
    hourly_rate   = summary[0]['hourlyRate'] if summary else 0.0

    return response(200, {
        'instanceId':   instance_id,
        'instanceType': instance_type,
        'hourlyRate':   hourly_rate,
        'days':         days,
        'totalRunningHours': total_running,
        'totalEstimatedCost': total_cost,
        'summary':      summary,
    })


# ─── Pricing: Live on-demand rates ───────────────────────────────────────────

def handle_pricing(event):
    qs = event.get('queryStringParameters') or {}
    region    = qs.get('region', 'ap-south-1').strip()
    types_str = qs.get('types', '').strip()
    instance_types = [t.strip() for t in types_str.split(',') if t.strip()] if types_str else []
    prices = {t: pricing.get_hourly_price(t, region) for t in instance_types}
    return response(200, {'region': region, 'prices': prices})


# ─── Users: List (M8) ────────────────────────────────────────────────────────

def handle_users_list(event):
    err = require_admin(event)
    if err:
        return err

    user_pool_id = os.environ.get('USER_POOL_ID', '')
    cognito = _get_cognito()

    users = []
    paginator = cognito.get_paginator('list_users')
    for page in paginator.paginate(UserPoolId=user_pool_id):
        for u in page['Users']:
            email = next(
                (a['Value'] for a in u.get('Attributes', []) if a['Name'] == 'email'),
                u['Username']
            )
            users.append({
                'email':     email,
                'username':  u['Username'],
                'status':    u['UserStatus'],
                'enabled':   u['Enabled'],
                'createdAt': str(u.get('UserCreateDate', '')),
                'updatedAt': str(u.get('UserLastModifiedDate', '')),
                'groups':    [],
                'accountAssignments': [],
            })

    def _enrich(user):
        try:
            resp = cognito.admin_list_groups_for_user(
                UserPoolId=user_pool_id,
                Username=user['username']
            )
            user['groups'] = [g['GroupName'] for g in resp.get('Groups', [])]
        except Exception as e:
            logger.warning("Could not fetch groups for %s: %s", user['username'], e)
        user['accountAssignments'] = get_user_accounts(user['email'])
        return user

    with ThreadPoolExecutor(max_workers=10) as executor:
        results = list(executor.map(_enrich, users))

    return response(200, {'users': results})


# ─── Users: Mutations (M8) ───────────────────────────────────────────────────

def handle_users_mutation(event):
    err = require_admin(event)
    if err:
        return err

    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return error_response(400, 'Invalid JSON body')

    action = body.get('action', '').strip().lower()
    email  = body.get('email', '').strip()
    caller = get_caller(event)

    if not email:
        return error_response(400, 'email is required.')

    user_pool_id = os.environ.get('USER_POOL_ID', '')
    cognito = _get_cognito()
    ALL_GROUPS = ['admins', 'operators', 'viewers']
    GROUP_MAP  = {'admin': 'admins', 'operator': 'operators', 'viewer': 'viewers'}

    if action == 'setrole':
        role = body.get('role', '').strip().lower()
        if role not in ('admin', 'operator', 'viewer', 'none'):
            return error_response(400, 'role must be admin, operator, viewer, or none.')
        for g in ALL_GROUPS:
            try:
                cognito.admin_remove_user_from_group(
                    UserPoolId=user_pool_id, Username=email, GroupName=g)
            except Exception:
                pass
        if role != 'none':
            cognito.admin_add_user_to_group(
                UserPoolId=user_pool_id,
                Username=email,
                GroupName=GROUP_MAP[role]
            )
        logger.info("Role %s set for %s by %s", role, email, caller)
        return response(200, {'message': f'Role set to {role} for {email}.', 'email': email, 'role': role})

    elif action == 'grantaccount':
        account_id   = body.get('accountId', '').strip()
        access_level = body.get('accessLevel', 'viewer').strip().lower()
        if not account_id:
            return error_response(400, 'accountId is required.')
        if access_level not in ('operator', 'viewer'):
            return error_response(400, 'accessLevel must be operator or viewer.')
        grant_account(email, account_id, access_level, caller)
        logger.info("Account %s granted (%s) to %s by %s", account_id, access_level, email, caller)
        return response(200, {'message': 'Access granted.', 'email': email, 'accountId': account_id,
                               'accessLevel': access_level})

    elif action == 'revokeaccount':
        account_id = body.get('accountId', '').strip()
        if not account_id:
            return error_response(400, 'accountId is required.')
        revoke_account(email, account_id)
        logger.info("Account %s revoked from %s by %s", account_id, email, caller)
        return response(200, {'message': 'Access revoked.', 'email': email, 'accountId': account_id})

    elif action == 'getpermissions':
        assignments = get_user_accounts(email)
        try:
            groups_resp = cognito.admin_list_groups_for_user(
                UserPoolId=user_pool_id, Username=email)
            groups = [g['GroupName'] for g in groups_resp.get('Groups', [])]
        except Exception:
            groups = []
        return response(200, {'email': email, 'groups': groups, 'accountAssignments': assignments})

    else:
        return error_response(400, 'Invalid action. Must be setRole, grantAccount, revokeAccount, or getPermissions.')
