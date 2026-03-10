'''Lambda function to list, start, stop, and check status of EC2 instances across all AWS regions.
This function is designed to be invoked via API Gateway and uses IAM permissions to manage EC2 instances. It also includes CORS headers for cross-origin requests and logs all actions for auditing purposes.
'''

import boto3
import json
import os
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

HOME_REGION = os.environ.get('AWS_REGION_NAME', 'ap-south-1')

def get_cors():
    return {
        'Access-Control-Allow-Origin':  os.environ.get('ALLOWED_ORIGIN', '*'),
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
        'Content-Type':                 'application/json',
    }

def get_caller(event):
    try:
        claims = event['requestContext']['authorizer']['claims']
        return claims.get('email', claims.get('cognito:username', 'unknown'))
    except (KeyError, TypeError):
        return 'unknown'

def ec2_client(region):
    return boto3.client('ec2', region_name=region)

def get_all_regions():
    try:
        resp = ec2_client(HOME_REGION).describe_regions(
            Filters=[{'Name': 'opt-in-status', 'Values': ['opt-in-not-required', 'opted-in']}]
        )
        return [r['RegionName'] for r in resp['Regions']]
    except Exception as e:
        logger.warning("Could not fetch regions: %s", e)
        return [HOME_REGION]

def list_instances_in_region(region):
    instances = []
    try:
        client    = ec2_client(region)
        paginator = client.get_paginator('describe_instances')
        for page in paginator.paginate():
            for reservation in page['Reservations']:
                for inst in reservation['Instances']:
                    name = inst['InstanceId']
                    for tag in inst.get('Tags', []):
                        if tag['Key'] == 'Name':
                            name = tag['Value']
                            break
                    instances.append({
                        'instanceId':   inst['InstanceId'],
                        'name':         name,
                        'state':        inst['State']['Name'],
                        'instanceType': inst.get('InstanceType', 'N/A'),
                        'publicIp':     inst.get('PublicIpAddress', 'N/A'),
                        'region':       region,
                    })
    except Exception as e:
        logger.warning("Failed in region %s: %s", region, e)
    return instances

def lambda_handler(event, context):
    logger.info("Event: %s", json.dumps(event))
    CORS = get_cors()

    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return err(400, 'Invalid JSON body', CORS)

    action      = body.get('action', '').strip().lower()
    instance_id = body.get('instanceId', '').strip()
    region      = body.get('region', HOME_REGION).strip()

    if action not in ('list', 'start', 'stop', 'status'):
        return err(400, 'Invalid action.', CORS)

    caller = get_caller(event)
    logger.info("action=%s instance=%s region=%s caller=%s", action, instance_id, region, caller)

    try:
        if action == 'list':
            from concurrent.futures import ThreadPoolExecutor, as_completed
            all_regions   = get_all_regions()
            all_instances = []
            logger.info("Querying %d regions", len(all_regions))

            with ThreadPoolExecutor(max_workers=10) as executor:
                futures = {executor.submit(list_instances_in_region, r): r for r in all_regions}
                for future in as_completed(futures):
                    all_instances.extend(future.result())

            all_instances.sort(key=lambda x: (
                0 if x['state'] == 'running' else 1,
                x['region'],
                x['name']
            ))

            logger.info("Total instances found: %d across %d regions", len(all_instances), len(all_regions))
            return {
                'statusCode': 200,
                'headers': CORS,
                'body': json.dumps({'instances': all_instances})
            }

        if not instance_id:
            return err(400, 'instanceId is required.', CORS)

        client = ec2_client(region)

        if action == 'status':
            resp = client.describe_instances(InstanceIds=[instance_id])
            inst = resp['Reservations'][0]['Instances'][0]
            return {
                'statusCode': 200,
                'headers': CORS,
                'body': json.dumps({
                    'state':        inst['State']['Name'],
                    'instanceType': inst.get('InstanceType', 'N/A'),
                    'publicIp':     inst.get('PublicIpAddress', 'N/A'),
                    'launchTime':   str(inst.get('LaunchTime', '')),
                    'instanceId':   instance_id,
                    'region':       region,
                })
            }

        elif action == 'start':
            resp  = client.start_instances(InstanceIds=[instance_id])
            state = resp['StartingInstances'][0]['CurrentState']['Name']
            logger.info("STARTED %s in %s by %s", instance_id, region, caller)
            return {
                'statusCode': 200,
                'headers': CORS,
                'body': json.dumps({'message': 'Instance start initiated.', 'state': state, 'requestedBy': caller})
            }

        elif action == 'stop':
            resp  = client.stop_instances(InstanceIds=[instance_id])
            state = resp['StoppingInstances'][0]['CurrentState']['Name']
            logger.info("STOPPED %s in %s by %s", instance_id, region, caller)
            return {
                'statusCode': 200,
                'headers': CORS,
                'body': json.dumps({'message': 'Instance stop initiated.', 'state': state, 'requestedBy': caller})
            }

    except Exception as e:
        code = getattr(e, 'response', {}).get('Error', {}).get('Code', '')
        msg  = getattr(e, 'response', {}).get('Error', {}).get('Message', str(e))
        logger.error("Error: %s - %s", code, msg)
        if code == 'IncorrectInstanceState':
            return err(409, 'Cannot change instance from its current state.', CORS)
        elif code == 'UnauthorizedOperation':
            return err(403, 'Lambda IAM role lacks permission.', CORS)
        elif code == 'InvalidInstanceID.NotFound':
            return err(404, 'Instance not found in region ' + region, CORS)
        elif isinstance(e, IndexError):
            return err(404, 'Instance not found.', CORS)
        else:
            logger.exception("Unexpected error")
            return err(500, 'Internal server error.', CORS)

def err(code, msg, cors):
    logger.error("Error %s: %s", code, msg)
    return {
        'statusCode': code,
        'headers':    cors,
        'body':       json.dumps({'message': msg}),
    }
