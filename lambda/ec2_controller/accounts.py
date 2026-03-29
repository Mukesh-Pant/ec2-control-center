"""Account registry and cross-account EC2 client management."""

import os
import logging
import time
import threading
import boto3

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ACCOUNTS_TABLE = os.environ.get('ACCOUNTS_TABLE', 'ec2-control-accounts-production')
USER_ACCOUNTS_TABLE = os.environ.get('USER_ACCOUNTS_TABLE', 'ec2-control-user-accounts-production')
ENVIRONMENT = os.environ.get('ENVIRONMENT', 'production')
CENTRAL_ACCOUNT_ID = os.environ.get('CENTRAL_ACCOUNT_ID', '')

_sts_client = None
_ddb_resource = None

# STS credential cache: {account_id: {'creds': {...}, 'expires_at': float}}
_creds_cache: dict = {}
_creds_lock = threading.Lock()
_CREDS_TTL = 600  # 10 min; creds are valid for 15 min (DurationSeconds=900)


def _get_sts():
    global _sts_client
    if _sts_client is None:
        _sts_client = boto3.client('sts')
    return _sts_client


def _get_ddb():
    global _ddb_resource
    if _ddb_resource is None:
        _ddb_resource = boto3.resource('dynamodb')
    return _ddb_resource


def get_accounts():
    """Fetch all enabled accounts from DynamoDB AccountRegistry (handles pagination)."""
    table = _get_ddb().Table(ACCOUNTS_TABLE)
    items, kwargs = [], {
        'FilterExpression': 'enabled = :t',
        'ExpressionAttributeValues': {':t': True},
    }
    while True:
        result = table.scan(**kwargs)
        items.extend(result.get('Items', []))
        if 'LastEvaluatedKey' not in result:
            break
        kwargs['ExclusiveStartKey'] = result['LastEvaluatedKey']
    return items


def get_all_accounts():
    """Fetch all accounts from DynamoDB AccountRegistry, including disabled (handles pagination)."""
    table = _get_ddb().Table(ACCOUNTS_TABLE)
    items, kwargs = [], {}
    while True:
        result = table.scan(**kwargs)
        items.extend(result.get('Items', []))
        if 'LastEvaluatedKey' not in result:
            break
        kwargs['ExclusiveStartKey'] = result['LastEvaluatedKey']
    return items


def _get_cached_creds(account_id: str) -> dict:
    """Return cached STS credentials for a member account, refreshing if stale."""
    now = time.monotonic()
    with _creds_lock:
        entry = _creds_cache.get(account_id)
        if entry and entry['expires_at'] > now and entry['creds'] is not None:
            return entry['creds']
        # Sentinel: mark in-progress so concurrent threads skip the STS call
        _creds_cache[account_id] = {'creds': None, 'expires_at': 0}

    # Perform the STS call outside the lock to avoid blocking other threads
    role_arn = f'arn:aws:iam::{account_id}:role/EC2ControlCrossAccountRole-{ENVIRONMENT}'
    logger.info("Refreshing STS creds for account %s", account_id)
    assumed = _get_sts().assume_role(
        RoleArn=role_arn,
        RoleSessionName=f'ec2-control-{account_id}',
        ExternalId=f'ec2-control-{CENTRAL_ACCOUNT_ID}',
        DurationSeconds=900,
    )
    creds = assumed['Credentials']
    with _creds_lock:
        _creds_cache[account_id] = {'creds': creds, 'expires_at': now + _CREDS_TTL}
    return creds


def get_ec2_client(account_id, region):
    """Return a boto3 EC2 client, using cached STS credentials for member accounts."""
    if not account_id or account_id == CENTRAL_ACCOUNT_ID:
        return boto3.client('ec2', region_name=region)
    creds = _get_cached_creds(account_id)
    return boto3.client(
        'ec2',
        region_name=region,
        aws_access_key_id=creds['AccessKeyId'],
        aws_secret_access_key=creds['SecretAccessKey'],
        aws_session_token=creds['SessionToken'],
    )


def get_user_accounts(email):
    """Return all account assignments for a user. Each item has accountId, accessLevel, grantedBy, grantedAt."""
    table = _get_ddb().Table(USER_ACCOUNTS_TABLE)
    resp = table.query(
        KeyConditionExpression=boto3.dynamodb.conditions.Key('userEmail').eq(email)
    )
    return resp.get('Items', [])


def get_allowed_account_ids(email):
    """Return the set of accountIds this user is assigned to (any access level)."""
    return {item['accountId'] for item in get_user_accounts(email)}


def grant_account(email, account_id, access_level, granted_by):
    """Grant or update a user's access to an account."""
    from datetime import datetime, timezone
    table = _get_ddb().Table(USER_ACCOUNTS_TABLE)
    table.put_item(Item={
        'userEmail':   email,
        'accountId':   account_id,
        'accessLevel': access_level,
        'grantedBy':   granted_by,
        'grantedAt':   datetime.now(timezone.utc).isoformat(),
    })


def revoke_account(email, account_id):
    """Remove a user's access to a specific account."""
    table = _get_ddb().Table(USER_ACCOUNTS_TABLE)
    table.delete_item(Key={'userEmail': email, 'accountId': account_id})


def get_all_regions(account_id=None):
    """Get all opted-in regions for an account."""
    try:
        client = get_ec2_client(account_id, os.environ.get('AWS_REGION', 'ap-south-1'))
        resp = client.describe_regions(
            Filters=[{'Name': 'opt-in-status', 'Values': ['opt-in-not-required', 'opted-in']}]
        )
        return [r['RegionName'] for r in resp['Regions']]
    except Exception as e:
        logger.warning("Could not fetch regions for account %s: %s", account_id, e)
        return [os.environ.get('AWS_REGION', 'ap-south-1')]
