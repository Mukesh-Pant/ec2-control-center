"""EC2 Controller Lambda — Main handler for HTTP API v2.

Routes:
  POST /ec2           — actions: list, status, start, stop
  GET  /accounts      — list registered AWS accounts
  GET  /audit         — audit event log  (query: instanceId, userEmail, limit, lastKey)
  GET  /audit/daily   — per-day running hours + cost (query: instanceId, days)
"""

import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from utils import response, error_response, get_caller, map_aws_error
from accounts import get_accounts, get_all_accounts, get_ec2_client, get_all_regions
import audit

logger = logging.getLogger()
logger.setLevel(logging.INFO)


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

    if action not in ('list', 'start', 'stop', 'status'):
        return error_response(400, 'Invalid action. Must be list, start, stop, or status.')

    caller = get_caller(event)
    logger.info("action=%s instance=%s region=%s account=%s caller=%s",
                action, instance_id, region, account_id, caller)

    try:
        if action == 'list':
            return handle_list()

        if not instance_id:
            return error_response(400, 'instanceId is required.')
        if not region:
            return error_response(400, 'region is required.')

        client = get_ec2_client(account_id, region)

        if action == 'status':
            return handle_status(client, instance_id, region)
        elif action == 'start':
            return handle_start(client, instance_id, region, account_id,
                                caller, instance_name, instance_type)
        elif action == 'stop':
            return handle_stop(client, instance_id, region, account_id,
                               caller, instance_name, instance_type)

    except IndexError:
        return error_response(404, 'Instance not found.')
    except Exception as e:
        return map_aws_error(e, region)


def handle_list():
    accounts = get_accounts()
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
        paginator = client.get_paginator('describe_instances')
        for page in paginator.paginate():
            for reservation in page['Reservations']:
                for inst in reservation['Instances']:
                    name = inst['InstanceId']
                    for tag in inst.get('Tags', []):
                        if tag['Key'] == 'Name':
                            name = tag['Value'] or inst['InstanceId']
                            break
                    instances.append({
                        'instanceId':   inst['InstanceId'],
                        'name':         name,
                        'state':        inst['State']['Name'],
                        'instanceType': inst.get('InstanceType', 'N/A'),
                        'publicIp':     inst.get('PublicIpAddress', 'N/A'),
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


# ─── Accounts: List ──────────────────────────────────────────────────────────

def handle_accounts_list(event):
    accounts = get_all_accounts()
    safe = [{
        'accountId':   a['accountId'],
        'accountName': a.get('accountName', a['accountId']),
        'roleArn':     a.get('roleArn', ''),
        'enabled':     a.get('enabled', False),
        'isCentral':   a.get('roleArn', '') == 'LOCAL',
    } for a in accounts]
    return response(200, {'accounts': safe})


# ─── Accounts: Mutations (M5) ────────────────────────────────────────────────

def handle_accounts_mutation(event):
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

    import boto3
    import os
    ddb   = boto3.resource('dynamodb')
    table = ddb.Table(os.environ.get('ACCOUNTS_TABLE', 'ec2-control-accounts-production'))

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
            table.put_item(Item={
                'accountId':   account_id,
                'accountName': account_name,
                'roleArn':     role_arn,
                'enabled':     True,
            })
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
            table.update_item(
                Key={'accountId': account_id},
                UpdateExpression='SET accountName = :n',
                ExpressionAttributeValues={':n': account_name},
            )
            return response(200, {'message': 'Account name updated.', 'accountId': account_id})
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
    import os
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
