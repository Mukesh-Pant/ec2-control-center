"""Labs provisioning backend — temporary EC2 lab instances with key management."""

import base64
import json
import logging
import os
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from decimal import Decimal

import boto3
from botocore.exceptions import ClientError

import pricing
from accounts import get_allowed_account_ids
from utils import get_caller, get_caller_groups, is_admin, require_admin, response, error_response

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ─── Environment variables ────────────────────────────────────────────────────
LABS_TABLE         = os.environ.get('LABS_TABLE', 'ec2-control-labs-development')
LABS_KEYS_BUCKET   = os.environ.get('LABS_KEYS_BUCKET', '')
LABS_PAYMENTS_BUCKET = os.environ.get('LABS_PAYMENTS_BUCKET', '')
CENTRAL_ACCOUNT_ID = os.environ.get('CENTRAL_ACCOUNT_ID', '')
ENVIRONMENT        = os.environ.get('ENVIRONMENT', 'production')
MAX_DURATION_HOURS = 2160  # 90 days

# ─── Lazy singletons ──────────────────────────────────────────────────────────
_ddb = None
_s3  = None
_sts = None


def _get_ddb():
    global _ddb
    if _ddb is None:
        _ddb = boto3.resource('dynamodb')
    return _ddb


def _get_s3():
    global _s3
    if _s3 is None:
        _s3 = boto3.client('s3')
    return _s3


def _get_sts():
    global _sts
    if _sts is None:
        _sts = boto3.client('sts')
    return _sts


def _get_labs_table():
    return _get_ddb().Table(LABS_TABLE)


# ─── Cross-account helpers ────────────────────────────────────────────────────

def _assume_role(account_id):
    """Return credentials dict for the member account cross-account role."""
    role_arn = f'arn:aws:iam::{account_id}:role/EC2ControlCrossAccountRole-{ENVIRONMENT}'
    assumed = _get_sts().assume_role(
        RoleArn=role_arn,
        RoleSessionName=f'ec2ctrl-labs-{account_id}',
        ExternalId=f'ec2-control-{CENTRAL_ACCOUNT_ID}',
        DurationSeconds=900,
    )
    return assumed['Credentials']


def _get_member_creds(account_id):
    """Return creds dict or None. None means central account — use default Lambda creds."""
    if account_id == CENTRAL_ACCOUNT_ID:
        return None
    return _assume_role(account_id)


def _boto3_client(service, region, creds=None):
    """Create a boto3 client, optionally with assumed-role creds."""
    kwargs = {'region_name': region}
    if creds:
        kwargs.update({
            'aws_access_key_id':     creds['AccessKeyId'],
            'aws_secret_access_key': creds['SecretAccessKey'],
            'aws_session_token':     creds['SessionToken'],
        })
    return boto3.client(service, **kwargs)


# ─── AMI lookup ───────────────────────────────────────────────────────────────

_AMI_SSM_PATHS = {
    'amazon-linux': '/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-6.1-x86_64',
    'ubuntu':       '/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp2/ami-id',
    'windows':      '/aws/service/ami-windows-latest/Windows_Server-2022-English-Full-Base',
}

_ROOT_DEVICE = {
    'amazon-linux': '/dev/xvda',
    'ubuntu':       '/dev/sda1',
    'rhel':         '/dev/sda1',
    'windows':      '/dev/sda1',
}

_SSH_USER = {
    'amazon-linux': 'ec2-user',
    'ubuntu':       'ubuntu',
    'rhel':         'ec2-user',
    'windows':      None,  # RDP
}

SUPPORTED_PLATFORMS = set(_ROOT_DEVICE.keys())


def _get_latest_ami(platform, region, creds):
    """Return the latest AMI ID for platform+region using SSM or describe_images."""
    if platform in _AMI_SSM_PATHS:
        ssm = _boto3_client('ssm', region, creds)
        param = ssm.get_parameter(Name=_AMI_SSM_PATHS[platform])
        return param['Parameter']['Value']
    elif platform == 'rhel':
        ec2 = _boto3_client('ec2', region, creds)
        resp = ec2.describe_images(
            Owners=['309956199498'],  # Red Hat official
            Filters=[
                {'Name': 'name',         'Values': ['RHEL-9.*HVM*GP3*']},
                {'Name': 'architecture', 'Values': ['x86_64']},
                {'Name': 'state',        'Values': ['available']},
            ]
        )
        images = sorted(resp['Images'], key=lambda x: x['CreationDate'], reverse=True)
        if not images:
            raise ValueError(f'No RHEL 9 AMI found in region {region}')
        return images[0]['ImageId']
    else:
        raise ValueError(f'Unknown platform: {platform}')


# ─── RBAC guard ───────────────────────────────────────────────────────────────

def _require_operator_or_admin(event):
    """Return error_response(403) if caller is not admin or operator, else None."""
    groups = get_caller_groups(event)
    if not groups:
        return error_response(403, 'Access denied.')
    if 'viewers' in groups and 'admins' not in groups and 'operators' not in groups:
        return error_response(403, 'Labs tab requires operator or admin role.')
    if 'admins' not in groups and 'operators' not in groups:
        return error_response(403, 'Access denied.')
    return None


def _check_lab_ownership(lab, caller, groups):
    """Return True if caller may access this lab record."""
    if 'admins' in groups:
        return True
    return lab.get('userEmail') == caller


# ─── Cost estimate helper ─────────────────────────────────────────────────────

def _calculate_estimated_cost(platform, instance_type, region, storage_gb, elastic_ip, duration_hours):
    """Return total estimated cost as float. Returns 0.0 on any pricing error."""
    try:
        if platform == 'windows':
            ec2_hourly = pricing.get_hourly_price_windows(instance_type, region)
        else:
            ec2_hourly = pricing.get_hourly_price(instance_type, region)
        ec2_cost = round(ec2_hourly * duration_hours, 4)
        ebs_per_gb_month = pricing.get_ebs_price(region, 'gp3')
        ebs_cost = round(ebs_per_gb_month * storage_gb * (duration_hours / 730), 4)
        eip_hourly = pricing.get_eip_price(region) if elastic_ip else 0.0
        eip_cost = round(eip_hourly * duration_hours, 4)
        return round(ec2_cost + ebs_cost + eip_cost, 4)
    except Exception as exc:
        logger.warning('_calculate_estimated_cost failed: %s', exc)
        return 0.0


# ─────────────────────────────────────────────────────────────────────────────
# POST /labs/payment
# ─────────────────────────────────────────────────────────────────────────────

def handle_labs_payment(event):
    """Accept a base64-encoded payment screenshot and store it in S3.

    Body: {fileData: "<base64>", mimeType: "image/jpeg"}
    Returns: {paymentKey: "payments/<file_id>.jpg"}
    """
    guard = _require_operator_or_admin(event)
    if guard:
        return guard

    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return error_response(400, 'Invalid JSON body.')

    file_data = body.get('fileData', '')
    mime_type = body.get('mimeType', 'image/jpeg')

    if not file_data:
        return error_response(400, 'fileData is required.')
    if not LABS_PAYMENTS_BUCKET:
        return error_response(500, 'LABS_PAYMENTS_BUCKET is not configured.')

    ALLOWED_MIME_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'application/pdf'}
    MAX_PAYMENT_BYTES = 5 * 1024 * 1024  # 5 MB

    if mime_type not in ALLOWED_MIME_TYPES:
        return error_response(400, f'Unsupported file type. Allowed: jpeg, png, webp, pdf')

    try:
        decoded_bytes = base64.b64decode(file_data)
    except Exception:
        return error_response(400, 'fileData is not valid base64.')

    if len(decoded_bytes) > MAX_PAYMENT_BYTES:
        return error_response(400, 'File exceeds 5 MB limit.')

    file_id = str(uuid.uuid4())
    s3_key  = f'payments/{file_id}.jpg'

    try:
        _get_s3().put_object(
            Bucket=LABS_PAYMENTS_BUCKET,
            Key=s3_key,
            Body=decoded_bytes,
            ContentType=mime_type,
        )
    except ClientError as e:
        logger.exception('handle_labs_payment S3 put_object error')
        return error_response(500, str(e))

    return response(200, {'paymentKey': s3_key})


# ─────────────────────────────────────────────────────────────────────────────
# GET /labs/pricing
# ─────────────────────────────────────────────────────────────────────────────

def handle_labs_pricing(event):
    """Return cost breakdown for a lab configuration.

    Query params: instanceType, region, os, storageGb, elasticIp, durationHours
    """
    guard = _require_operator_or_admin(event)
    if guard:
        return guard

    params = event.get('queryStringParameters') or {}

    instance_type  = params.get('instanceType', '')
    region         = params.get('region', 'ap-south-1')
    os_param       = params.get('os', 'amazon-linux').lower()
    storage_gb_str = params.get('storageGb', '20')
    elastic_ip_str = params.get('elasticIp', 'false')
    duration_str   = params.get('durationHours', '1')

    if not instance_type:
        return error_response(400, 'instanceType is required.')

    try:
        storage_gb     = int(storage_gb_str)
        duration_hours = float(duration_str)
        elastic_ip     = elastic_ip_str.lower() in ('true', '1', 'yes')
    except (ValueError, TypeError):
        return error_response(400, 'storageGb and durationHours must be numeric.')

    if storage_gb < 8 or storage_gb > 16384:
        return error_response(400, 'storageGb must be between 8 and 16384.')
    if duration_hours <= 0:
        return error_response(400, 'durationHours must be positive.')
    if duration_hours > MAX_DURATION_HOURS:
        return error_response(400, f'durationHours cannot exceed {MAX_DURATION_HOURS} (90 days).')

    try:
        if os_param == 'windows':
            ec2_hourly = pricing.get_hourly_price_windows(instance_type, region)
        else:
            ec2_hourly = pricing.get_hourly_price(instance_type, region)

        ec2_cost         = round(ec2_hourly * duration_hours, 4)
        ebs_per_gb_month = pricing.get_ebs_price(region, 'gp3')
        ebs_cost         = round(ebs_per_gb_month * storage_gb * (duration_hours / 730), 4)
        eip_hourly       = pricing.get_eip_price(region) if elastic_ip else 0.0
        eip_cost         = round(eip_hourly * duration_hours, 4)
        total            = round(ec2_cost + ebs_cost + eip_cost, 4)
        return response(200, {
            'breakdown': {
                'ec2Hourly':    ec2_hourly,
                'ec2Cost':      ec2_cost,
                'ebsPerGbMonth': ebs_per_gb_month,
                'ebsCost':      ebs_cost,
                'eipHourly':    eip_hourly,
                'eipCost':      eip_cost,
                'totalUsd':     total,
            },
            'durationHours': duration_hours,
            'pricingSource':  'AWS Price List API',
        })
    except Exception as exc:
        logger.exception('handle_labs_pricing error')
        return error_response(500, str(exc))


# ─────────────────────────────────────────────────────────────────────────────
# GET /labs/network-options
# ─────────────────────────────────────────────────────────────────────────────

def handle_labs_network_options(event):
    """Return VPCs, subnets, and security groups for a given account+region.

    Query params: accountId, region
    """
    guard = _require_operator_or_admin(event)
    if guard:
        return guard

    params     = event.get('queryStringParameters') or {}
    account_id = params.get('accountId', '')
    region     = params.get('region', 'ap-south-1')

    if not account_id:
        return error_response(400, 'accountId is required.')

    caller_email = get_caller(event)
    if not is_admin(event):
        allowed = get_allowed_account_ids(caller_email)
        if account_id not in allowed:
            return error_response(403, 'You do not have access to this account.')

    try:
        creds = _get_member_creds(account_id)
        ec2   = _boto3_client('ec2', region, creds)

        # VPCs
        vpcs_resp = ec2.describe_vpcs(
            Filters=[{'Name': 'state', 'Values': ['available']}]
        )
        vpcs = []
        for v in vpcs_resp.get('Vpcs', []):
            name = next(
                (t['Value'] for t in v.get('Tags', []) if t['Key'] == 'Name'), ''
            )
            vpcs.append({
                'vpcId':     v['VpcId'],
                'name':      name,
                'cidrBlock': v.get('CidrBlock', ''),
            })

        # Subnets (with pagination)
        subnets_resp = ec2.describe_subnets(
            Filters=[{'Name': 'state', 'Values': ['available']}],
            MaxResults=1000,
        )
        all_subnets = subnets_resp.get('Subnets', [])
        while subnets_resp.get('NextToken'):
            subnets_resp = ec2.describe_subnets(
                Filters=[{'Name': 'state', 'Values': ['available']}],
                NextToken=subnets_resp['NextToken'],
                MaxResults=1000,
            )
            all_subnets.extend(subnets_resp.get('Subnets', []))
        subnets = []
        for s in all_subnets:
            name = next(
                (t['Value'] for t in s.get('Tags', []) if t['Key'] == 'Name'), ''
            )
            subnets.append({
                'subnetId':         s['SubnetId'],
                'name':             name,
                'cidrBlock':        s.get('CidrBlock', ''),
                'availabilityZone': s.get('AvailabilityZone', ''),
                'vpcId':            s.get('VpcId', ''),
            })

        # Security groups (with pagination)
        sgs_resp = ec2.describe_security_groups(MaxResults=1000)
        all_sgs = sgs_resp.get('SecurityGroups', [])
        while sgs_resp.get('NextToken'):
            sgs_resp = ec2.describe_security_groups(
                NextToken=sgs_resp['NextToken'],
                MaxResults=1000,
            )
            all_sgs.extend(sgs_resp.get('SecurityGroups', []))
        security_groups = []
        for sg in all_sgs:
            security_groups.append({
                'groupId':     sg['GroupId'],
                'groupName':   sg.get('GroupName', ''),
                'description': sg.get('Description', ''),
                'vpcId':       sg.get('VpcId', ''),
            })

    except ClientError as e:
        logger.exception('handle_labs_network_options error')
        return error_response(500, str(e))

    return response(200, {
        'vpcs':           vpcs,
        'subnets':        subnets,
        'securityGroups': security_groups,
    })


# ─────────────────────────────────────────────────────────────────────────────
# POST /labs  — provision a new lab instance
# ─────────────────────────────────────────────────────────────────────────────

def handle_labs_provision(event):
    """Provision a new lab EC2 instance and store metadata in DynamoDB."""
    guard = _require_operator_or_admin(event)
    if guard:
        return guard

    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return error_response(400, 'Invalid JSON body.')

    # Required fields
    account_id       = body.get('accountId', '').strip()
    region           = body.get('region', '').strip()
    platform         = body.get('platform', '').strip().lower()
    instance_type    = body.get('instanceType', '').strip()
    storage_gb       = body.get('storageGb')
    elastic_ip       = bool(body.get('elasticIp', False))
    subnet_id        = body.get('subnetId', '').strip()
    security_group_ids = body.get('securityGroupIds', [])
    duration_hours   = body.get('durationHours')
    payment_key      = body.get('paymentKey', '').strip()

    # Validate required fields
    missing = [f for f, v in [
        ('accountId', account_id), ('region', region), ('platform', platform),
        ('instanceType', instance_type), ('subnetId', subnet_id),
    ] if not v]
    if missing:
        return error_response(400, f'Missing required fields: {", ".join(missing)}')
    if storage_gb is None:
        return error_response(400, 'storageGb is required.')
    if duration_hours is None:
        return error_response(400, 'durationHours is required.')
    if not security_group_ids:
        return error_response(400, 'securityGroupIds is required and must not be empty.')
    if platform not in SUPPORTED_PLATFORMS:
        return error_response(400, f'Unsupported platform: {platform}. Supported: {", ".join(sorted(SUPPORTED_PLATFORMS))}')

    try:
        storage_gb     = int(storage_gb)
        duration_hours = float(duration_hours)
    except (ValueError, TypeError):
        return error_response(400, 'storageGb and durationHours must be numeric.')

    if storage_gb < 8 or storage_gb > 16384:
        return error_response(400, 'storageGb must be between 8 and 16384.')
    if duration_hours <= 0:
        return error_response(400, 'durationHours must be positive.')
    if duration_hours > MAX_DURATION_HOURS:
        return error_response(400, f'durationHours cannot exceed {MAX_DURATION_HOURS} (90 days).')
    if not isinstance(security_group_ids, list) or len(security_group_ids) == 0:
        return error_response(400, 'securityGroupIds must be a non-empty list.')

    caller_email = get_caller(event)

    # Account access check for operators
    if not is_admin(event):
        allowed = get_allowed_account_ids(caller_email)
        if account_id not in allowed:
            return error_response(403, 'You do not have access to this account.')

    # Verify payment screenshot exists in S3 before accepting
    if payment_key:
        try:
            _get_s3().head_object(Bucket=LABS_PAYMENTS_BUCKET, Key=payment_key)
        except Exception:
            return error_response(400, 'Payment screenshot not found. Please upload your payment screenshot first.')

    # Estimated cost — use frontend-provided value if present; else calculate
    if 'estimatedCost' in body:
        try:
            estimated_cost = float(body['estimatedCost'])
        except (ValueError, TypeError):
            estimated_cost = 0.0
    else:
        estimated_cost = _calculate_estimated_cost(
            platform, instance_type, region, storage_gb, elastic_ip, duration_hours
        )

    try:
        creds = _get_member_creds(account_id)
        ec2   = _boto3_client('ec2', region, creds)

        # Lookup latest AMI
        ami_id = _get_latest_ami(platform, region, creds)
        logger.info('labs_provision: AMI %s for platform %s in %s', ami_id, platform, region)

        # Generate lab ID
        lab_id   = str(uuid.uuid4())
        key_name = f'ec2ctrl-lab-{lab_id}'

        # Create EC2 key pair and save .pem to S3
        key_resp = ec2.create_key_pair(KeyName=key_name)
        pem_bytes = key_resp['KeyMaterial'].encode('utf-8')
        s3_key    = f'keys/{lab_id}.pem'
        if not LABS_KEYS_BUCKET:
            return error_response(500, 'LABS_KEYS_BUCKET is not configured.')
        _get_s3().put_object(
            Bucket=LABS_KEYS_BUCKET,
            Key=s3_key,
            Body=pem_bytes,
            ContentType='text/plain',
        )
        logger.info('labs_provision: stored .pem at s3://%s/%s', LABS_KEYS_BUCKET, s3_key)

        # Launch instance
        run_resp = ec2.run_instances(
            ImageId=ami_id,
            InstanceType=instance_type,
            KeyName=key_name,
            SubnetId=subnet_id,
            SecurityGroupIds=security_group_ids,
            MinCount=1,
            MaxCount=1,
            BlockDeviceMappings=[{
                'DeviceName': _ROOT_DEVICE[platform],
                'Ebs': {
                    'VolumeSize':          storage_gb,
                    'VolumeType':          'gp3',
                    'DeleteOnTermination': True,
                },
            }],
            TagSpecifications=[{
                'ResourceType': 'instance',
                'Tags': [
                    {'Key': 'Name',               'Value': f'ec2ctrl-lab-{lab_id}'},
                    {'Key': 'ec2ctrl:labId',       'Value': lab_id},
                    {'Key': 'ec2ctrl:managedBy',   'Value': 'ec2-control'},
                ],
            }],
        )
        instance_id = run_resp['Instances'][0]['InstanceId']
        logger.info('labs_provision: launched instance %s', instance_id)

        # Optionally allocate and associate an Elastic IP
        allocation_id = ''
        if elastic_ip:
            try:
                eip_resp      = ec2.allocate_address(Domain='vpc')
                allocation_id = eip_resp['AllocationId']
                ec2.associate_address(InstanceId=instance_id, AllocationId=allocation_id)
                logger.info('labs_provision: allocated EIP %s for instance %s', allocation_id, instance_id)
            except Exception as e:
                logger.error("EIP allocation/association failed: %s", e)
                # Cleanup: delete key pair and .pem
                try:
                    ec2.delete_key_pair(KeyName=key_name)
                except Exception:
                    pass
                try:
                    _get_s3().delete_object(Bucket=LABS_KEYS_BUCKET, Key=f'keys/{lab_id}.pem')
                except Exception:
                    pass
                return error_response(500, 'Failed to allocate Elastic IP.')

        # Compute expiry timestamp
        expires_at = (datetime.utcnow() + timedelta(hours=duration_hours)).isoformat()

        # Write DynamoDB record
        item = {
            'labId':          lab_id,
            'userEmail':      caller_email,
            'accountId':      account_id,
            'region':         region,
            'instanceId':     instance_id,
            'instanceType':   instance_type,
            'platform':       platform,
            'amiId':          ami_id,
            'storageGb':      Decimal(str(storage_gb)),
            'elasticIp':      bool(elastic_ip),
            'allocationId':   allocation_id,
            'keyName':        key_name,
            'keyS3Key':       s3_key,
            'durationHours':  Decimal(str(duration_hours)),
            'expiresAt':      expires_at,
            'warningSent':    False,
            'status':         'provisioning',
            'estimatedCost':  Decimal(str(estimated_cost)),
            'paymentStatus':  'paid' if payment_key else 'pending',
            'paymentS3Key':   payment_key,
            'publicIp':       '',
            'publicDns':      '',
            'createdAt':      datetime.utcnow().isoformat(),
        }
        _get_labs_table().put_item(Item=item)
        logger.info('labs_provision: DynamoDB record written for lab %s', lab_id)

    except ClientError as e:
        logger.exception('handle_labs_provision AWS error')
        return error_response(500, str(e))
    except ValueError as e:
        logger.exception('handle_labs_provision value error')
        return error_response(400, str(e))

    return response(200, {
        'labId':         lab_id,
        'instanceId':    instance_id,
        'estimatedCost': estimated_cost,
    })


# ─────────────────────────────────────────────────────────────────────────────
# GET /labs  — list labs
# ─────────────────────────────────────────────────────────────────────────────

def handle_labs_list(event):
    """List lab records. Admins see all; operators see their own labs only."""
    guard = _require_operator_or_admin(event)
    if guard:
        return guard

    caller_email = get_caller(event)
    groups       = get_caller_groups(event)
    table        = _get_labs_table()

    try:
        if 'admins' in groups:
            scan_resp = table.scan()
            labs = scan_resp.get('Items', [])
            # Handle pagination
            while 'LastEvaluatedKey' in scan_resp:
                scan_resp = table.scan(ExclusiveStartKey=scan_resp['LastEvaluatedKey'])
                labs.extend(scan_resp.get('Items', []))
        else:
            # Operators: query by user-index GSI
            query_resp = table.query(
                IndexName='user-index',
                KeyConditionExpression=boto3.dynamodb.conditions.Key('userEmail').eq(caller_email),
            )
            labs = query_resp.get('Items', [])
            while 'LastEvaluatedKey' in query_resp:
                query_resp = table.query(
                    IndexName='user-index',
                    KeyConditionExpression=boto3.dynamodb.conditions.Key('userEmail').eq(caller_email),
                    ExclusiveStartKey=query_resp['LastEvaluatedKey'],
                )
                labs.extend(query_resp.get('Items', []))
    except ClientError as e:
        logger.exception('handle_labs_list DynamoDB error')
        return error_response(500, str(e))

    # For labs still in provisioning state, poll EC2 and update if running
    provisioning_labs = [lab for lab in labs if lab.get('status') == 'provisioning']
    if provisioning_labs:
        with ThreadPoolExecutor(max_workers=min(10, len(provisioning_labs))) as pool:
            futures = {pool.submit(_maybe_update_provisioning_status, lab): lab for lab in provisioning_labs}
            for f in as_completed(futures):
                pass  # results written back to DynamoDB inside the helper
    updated_labs = labs

    # Serialise Decimal values for JSON
    serialised = [_serialise_lab(lab) for lab in updated_labs]

    return response(200, {'labs': serialised})


def _maybe_update_provisioning_status(lab):
    """If lab status is 'provisioning', check EC2 and update DynamoDB if now running."""
    if lab.get('status') != 'provisioning':
        return lab

    account_id  = lab.get('accountId', '')
    region      = lab.get('region', 'ap-south-1')
    instance_id = lab.get('instanceId', '')
    lab_id      = lab.get('labId', '')

    if not instance_id or not lab_id:
        return lab

    try:
        creds = _get_member_creds(account_id)
        ec2   = _boto3_client('ec2', region, creds)
        desc  = ec2.describe_instances(InstanceIds=[instance_id])
        if not desc.get('Reservations'):
            logger.warning("No Reservations for instance %s — possibly terminated", lab.get('instanceId'))
            return lab
        inst  = desc['Reservations'][0]['Instances'][0]
        state = inst.get('State', {}).get('Name', '')
        if state == 'running':
            public_ip  = inst.get('PublicIpAddress', '')
            public_dns = inst.get('PublicDnsName', '')
            # Update DynamoDB
            _get_labs_table().update_item(
                Key={'labId': lab_id},
                UpdateExpression='SET #st = :s, publicIp = :ip, publicDns = :dns',
                ExpressionAttributeNames={'#st': 'status'},
                ExpressionAttributeValues={
                    ':s':   'running',
                    ':ip':  public_ip,
                    ':dns': public_dns,
                },
            )
            lab = dict(lab)
            lab['status']    = 'running'
            lab['publicIp']  = public_ip
            lab['publicDns'] = public_dns
    except Exception as e:
        logger.warning('_maybe_update_provisioning_status error for lab %s: %s', lab_id, e)

    return lab


def _serialise_lab(lab):
    """Convert Decimal values to float/int for JSON serialisation."""
    out = {}
    for k, v in lab.items():
        if isinstance(v, Decimal):
            # Preserve integer appearance for whole numbers
            out[k] = float(v)
        else:
            out[k] = v
    return out


# ─────────────────────────────────────────────────────────────────────────────
# GET /labs/keypair?labId=xxx
# ─────────────────────────────────────────────────────────────────────────────

def handle_labs_keypair(event):
    """Return a pre-signed S3 URL for downloading the lab's .pem file."""
    guard = _require_operator_or_admin(event)
    if guard:
        return guard

    params = event.get('queryStringParameters') or {}
    lab_id = params.get('labId', '').strip()
    if not lab_id:
        return error_response(400, 'labId is required.')

    caller_email = get_caller(event)
    groups       = get_caller_groups(event)

    try:
        resp = _get_labs_table().get_item(Key={'labId': lab_id})
    except ClientError as e:
        logger.exception('handle_labs_keypair DynamoDB get_item error')
        return error_response(500, str(e))

    lab = resp.get('Item')
    if not lab:
        return error_response(404, f'Lab {lab_id} not found.')

    if not _check_lab_ownership(lab, caller_email, groups):
        return error_response(403, 'Access denied to this lab.')

    key_s3_key = lab.get('keyS3Key', '')
    if not key_s3_key:
        return error_response(404, 'Key file not found for this lab.')
    if not LABS_KEYS_BUCKET:
        return error_response(500, 'LABS_KEYS_BUCKET is not configured.')

    try:
        presigned_url = _get_s3().generate_presigned_url(
            'get_object',
            Params={'Bucket': LABS_KEYS_BUCKET, 'Key': key_s3_key},
            ExpiresIn=900,
        )
    except ClientError as e:
        logger.exception('handle_labs_keypair presigned URL error')
        return error_response(500, str(e))

    return response(200, {'url': presigned_url})


# ─────────────────────────────────────────────────────────────────────────────
# GET /labs/windows-password?labId=xxx
# ─────────────────────────────────────────────────────────────────────────────

def handle_labs_windows_password(event):
    """Decrypt and return the Windows administrator password for a lab instance."""
    guard = _require_operator_or_admin(event)
    if guard:
        return guard

    params = event.get('queryStringParameters') or {}
    lab_id = params.get('labId', '').strip()
    if not lab_id:
        return error_response(400, 'labId is required.')

    caller_email = get_caller(event)
    groups       = get_caller_groups(event)

    try:
        db_resp = _get_labs_table().get_item(Key={'labId': lab_id})
    except ClientError as e:
        logger.exception('handle_labs_windows_password DynamoDB error')
        return error_response(500, str(e))

    lab = db_resp.get('Item')
    if not lab:
        return error_response(404, f'Lab {lab_id} not found.')

    if not _check_lab_ownership(lab, caller_email, groups):
        return error_response(403, 'Access denied to this lab.')

    if lab.get('platform') != 'windows':
        return error_response(400, 'This lab is not a Windows instance.')

    account_id  = lab.get('accountId', '')
    region      = lab.get('region', 'ap-south-1')

    if not is_admin(event):
        allowed = get_allowed_account_ids(caller_email)
        if account_id not in allowed:
            return error_response(403, 'You do not have access to this account.')
    instance_id = lab.get('instanceId', '')
    key_s3_key  = lab.get('keyS3Key', '')

    if not LABS_KEYS_BUCKET:
        return error_response(500, 'LABS_KEYS_BUCKET is not configured.')

    # Fetch .pem from S3
    try:
        s3_obj   = _get_s3().get_object(Bucket=LABS_KEYS_BUCKET, Key=key_s3_key)
        pem_bytes = s3_obj['Body'].read()
    except ClientError as e:
        logger.exception('handle_labs_windows_password S3 get_object error')
        return error_response(500, str(e))

    # Get encrypted password data from EC2 (retry up to 3x)
    try:
        creds = _get_member_creds(account_id)
        ec2   = _boto3_client('ec2', region, creds)

        encrypted_b64 = ''
        for attempt in range(3):
            pw_resp       = ec2.get_password_data(InstanceId=instance_id)
            encrypted_b64 = pw_resp.get('PasswordData', '').strip()
            if encrypted_b64:
                break
            if attempt < 2:
                time.sleep(5)

        if not encrypted_b64:
            return response(202, {'message': 'Password not yet available. Instance may still be initialising. Try again in a few minutes.'})

    except ClientError as e:
        logger.exception('handle_labs_windows_password get_password_data error')
        return error_response(500, str(e))

    # Decrypt with private key using cryptography library
    try:
        from cryptography.hazmat.primitives.serialization import load_pem_private_key
        from cryptography.hazmat.primitives.asymmetric.padding import PKCS1v15

        private_key = load_pem_private_key(pem_bytes, password=None)
        password    = private_key.decrypt(base64.b64decode(encrypted_b64), PKCS1v15())
        return response(200, {'password': password.decode('utf-8')})

    except Exception as e:
        logger.exception('handle_labs_windows_password decryption error')
        return error_response(500, f'Password decryption failed: {str(e)}')


# ─────────────────────────────────────────────────────────────────────────────
# DELETE /labs  — terminate a lab instance (admin only)
# ─────────────────────────────────────────────────────────────────────────────

def handle_labs_delete(event):
    """Terminate a lab EC2 instance and mark it as terminated in DynamoDB.

    Body: {labId}
    Admin only.
    """
    admin_guard = require_admin(event)
    if admin_guard:
        return admin_guard

    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return error_response(400, 'Invalid JSON body.')

    lab_id = body.get('labId', '').strip()
    if not lab_id:
        return error_response(400, 'labId is required.')

    try:
        db_resp = _get_labs_table().get_item(Key={'labId': lab_id})
    except ClientError as e:
        logger.exception('handle_labs_delete DynamoDB get_item error')
        return error_response(500, str(e))

    lab = db_resp.get('Item')
    if not lab:
        return error_response(404, f'Lab {lab_id} not found.')

    account_id    = lab.get('accountId', '')
    region        = lab.get('region', 'ap-south-1')
    instance_id   = lab.get('instanceId', '')
    allocation_id = lab.get('allocationId', '')

    try:
        creds = _get_member_creds(account_id)
        ec2   = _boto3_client('ec2', region, creds)

        ec2.terminate_instances(InstanceIds=[instance_id])
        logger.info('handle_labs_delete: terminated instance %s', instance_id)

        if allocation_id:
            ec2.release_address(AllocationId=allocation_id)
            logger.info('handle_labs_delete: released EIP %s', allocation_id)

        # Delete EC2 key pair in member account
        try:
            ec2.delete_key_pair(KeyName=lab['keyName'])
        except Exception as e:
            logger.warning("Could not delete key pair %s: %s", lab['keyName'], e)

        # Delete .pem from S3
        try:
            _get_s3().delete_object(Bucket=LABS_KEYS_BUCKET, Key=lab['keyS3Key'])
        except Exception as e:
            logger.warning("Could not delete .pem from S3 %s: %s", lab['keyS3Key'], e)

    except ClientError as e:
        logger.exception('handle_labs_delete EC2 error')
        return error_response(500, str(e))

    try:
        _get_labs_table().update_item(
            Key={'labId': lab_id},
            UpdateExpression='SET #st = :s',
            ExpressionAttributeNames={'#st': 'status'},
            ExpressionAttributeValues={':s': 'terminated'},
        )
    except ClientError as e:
        logger.exception('handle_labs_delete DynamoDB update_item error')
        return error_response(500, str(e))

    return response(200, {'message': 'Lab terminated.'})
