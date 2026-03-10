"""EC2 Controller Lambda — Main handler for HTTP API v2.

Routes:
  POST /ec2      — actions: list, status, start, stop
  GET  /accounts — list registered AWS accounts
"""

import json
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from utils import response, error_response, get_caller, map_aws_error
from accounts import get_accounts, get_ec2_client, get_all_regions

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def lambda_handler(event, context):
    logger.info("Event: %s", json.dumps(event))

    # Route based on HTTP API v2 payload
    http = event.get('requestContext', {}).get('http', {})
    method = http.get('method', 'POST')
    path = http.get('path', '/ec2')

    if path == '/ec2' and method == 'POST':
        return handle_ec2(event)
    elif path == '/accounts' and method == 'GET':
        return handle_accounts(event)
    else:
        return error_response(404, 'Not found')


# ─── EC2 Actions ───────────────────────────────────────────

def handle_ec2(event):
    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return error_response(400, 'Invalid JSON body')

    action = body.get('action', '').strip().lower()
    instance_id = body.get('instanceId', '').strip()
    region = body.get('region', '').strip()
    account_id = body.get('accountId', '').strip()

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
            return handle_start(client, instance_id, region, caller)
        elif action == 'stop':
            return handle_stop(client, instance_id, region, caller)

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
            acct_id = account['accountId']
            acct_name = account.get('accountName', acct_id)
            regions = account.get('regions') or get_all_regions(acct_id)
            for region in regions:
                futures.append(executor.submit(
                    _list_instances_in_region, acct_id, acct_name, region
                ))

        for future in as_completed(futures):
            result = future.result()
            if result:
                all_instances.extend(result)

    # Sort: running first, then by account, region, name
    all_instances.sort(key=lambda x: (
        0 if x['state'] == 'running' else 1,
        x.get('accountName', ''),
        x['region'],
        x['name']
    ))

    logger.info("Total instances found: %d", len(all_instances))
    return response(200, {'instances': all_instances})


def _list_instances_in_region(account_id, account_name, region):
    """List all EC2 instances in one region for one account."""
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
                        'instanceId': inst['InstanceId'],
                        'name': name,
                        'state': inst['State']['Name'],
                        'instanceType': inst.get('InstanceType', 'N/A'),
                        'publicIp': inst.get('PublicIpAddress', 'N/A'),
                        'region': region,
                        'accountId': account_id,
                        'accountName': account_name,
                    })
    except Exception as e:
        logger.warning("Failed listing instances in %s/%s: %s", account_id, region, e)
    return instances


def handle_status(client, instance_id, region):
    resp = client.describe_instances(InstanceIds=[instance_id])
    inst = resp['Reservations'][0]['Instances'][0]
    return response(200, {
        'state': inst['State']['Name'],
        'instanceType': inst.get('InstanceType', 'N/A'),
        'publicIp': inst.get('PublicIpAddress', 'N/A'),
        'launchTime': str(inst.get('LaunchTime', '')),
        'instanceId': instance_id,
        'region': region,
    })


def handle_start(client, instance_id, region, caller):
    resp = client.start_instances(InstanceIds=[instance_id])
    state = resp['StartingInstances'][0]['CurrentState']['Name']
    logger.info("STARTED %s in %s by %s", instance_id, region, caller)
    return response(200, {
        'message': 'Instance start initiated.',
        'state': state,
        'requestedBy': caller
    })


def handle_stop(client, instance_id, region, caller):
    resp = client.stop_instances(InstanceIds=[instance_id])
    state = resp['StoppingInstances'][0]['CurrentState']['Name']
    logger.info("STOPPED %s in %s by %s", instance_id, region, caller)
    return response(200, {
        'message': 'Instance stop initiated.',
        'state': state,
        'requestedBy': caller
    })


# ─── Accounts ─────────────────────────────────────────────

def handle_accounts(event):
    accounts = get_accounts()
    # Strip sensitive fields
    safe = []
    for a in accounts:
        safe.append({
            'accountId': a['accountId'],
            'accountName': a.get('accountName', a['accountId']),
            'enabled': a.get('enabled', False),
        })
    return response(200, {'accounts': safe})
