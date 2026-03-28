"""Labs Expiry Checker Lambda — Milestone 11.

Triggered every 15 minutes by EventBridge.

Behavior:
  - Job 1: Warning emails — Scan LABS_TABLE for labs where expiresAt <= (now + 1 hour)
    AND warningSent = False AND status = running. For each, publish an SNS warning email,
    then set warningSent = True in DynamoDB.
  - Job 2: Stop expired labs — Scan LABS_TABLE for labs where expiresAt <= now AND
    status = running. For each, STS AssumeRole into the member account, call
    ec2.stop_instances(InstanceIds=[lab['instanceId']]), then update DynamoDB status
    to 'stopped'.

Environment variables (set by CloudFormation):
  LABS_TABLE       — DynamoDB table name for labs registry
  SNS_TOPIC_ARN    — ARN of the SNS topic for notifications
  CENTRAL_ACCOUNT_ID — central account ID
  ENVIRONMENT      — 'production' or 'development'
"""

import os
import logging
import boto3
from datetime import datetime, timezone, timedelta
from botocore.dynamodb.conditions import Attr

logger = logging.getLogger()
logger.setLevel(logging.INFO)

LABS_TABLE       = os.environ.get('LABS_TABLE', '')
SNS_TOPIC_ARN    = os.environ.get('SNS_TOPIC_ARN', '')
CENTRAL_ACCOUNT_ID = os.environ.get('CENTRAL_ACCOUNT_ID', '')
ENVIRONMENT      = os.environ.get('ENVIRONMENT', 'production')

# Module-level lazy-loading singletons
_ddb = None
_sns = None


def _get_ddb():
    """Lazy-load DynamoDB resource (module-level singleton)."""
    global _ddb
    if _ddb is None:
        _ddb = boto3.resource('dynamodb')
    return _ddb


def _get_sns():
    """Lazy-load SNS client (module-level singleton)."""
    global _sns
    if _sns is None:
        _sns = boto3.client('sns')
    return _sns


def lambda_handler(event, context):
    """Main handler — runs both warning and stop jobs."""
    # Guard: ensure LABS_TABLE is configured
    if not LABS_TABLE:
        logger.error("LABS_TABLE env var not set; aborting")
        return {
            'statusCode': 500,
            'error': 'LABS_TABLE not configured',
        }

    logger.info("Labs expiry checker triggered")

    now = datetime.now(timezone.utc)

    # Job 1: Send warning emails for labs expiring within 1 hour
    warning_count = _send_warning_emails(now)

    # Job 2: Stop expired labs
    stopped_count = _stop_expired_labs(now)

    logger.info("Labs expiry check complete. Warnings=%d, Stopped=%d",
                warning_count, stopped_count)
    return {
        'statusCode': 200,
        'warnings': warning_count,
        'stopped': stopped_count,
    }


def _send_warning_emails(now):
    """Scan for labs expiring within 1 hour, send SNS warning, mark warningSent=True."""
    if not SNS_TOPIC_ARN:
        logger.warning("SNS_TOPIC_ARN not set; skipping warning emails")
        return 0

    warning_count = 0
    one_hour_from_now = now + timedelta(hours=1)

    try:
        ddb = _get_ddb()
        table = ddb.Table(LABS_TABLE)

        # Scan for labs where:
        #   expiresAt is between now and (now + 1 hour) [i.e., expiring soon but not yet expired]
        #   AND warningSent = False
        #   AND status is running or provisioning (provisioning labs may never reach 'running'
        #       if the user hasn't visited the Labs tab, so warn them regardless)
        now_str          = now.strftime('%Y-%m-%dT%H:%M:%SZ')
        one_hour_str     = one_hour_from_now.strftime('%Y-%m-%dT%H:%M:%SZ')
        scan_kwargs = {
            'FilterExpression': (
                Attr('expiresAt').between(now_str, one_hour_str)
                & Attr('warningSent').eq(False)
                & Attr('status').is_in(['running', 'provisioning'])
            )
        }

        # Manual pagination (table.scan() returns a dict, not a paginator)
        resp = table.scan(**scan_kwargs)
        warning_labs = resp.get('Items', [])

        while 'LastEvaluatedKey' in resp:
            resp = table.scan(ExclusiveStartKey=resp['LastEvaluatedKey'], **scan_kwargs)
            warning_labs.extend(resp.get('Items', []))

        for lab in warning_labs:
            try:
                # Send warning email
                _send_warning_email(lab)

                # Update DynamoDB: set warningSent = True
                table.update_item(
                    Key={'labId': lab['labId']},
                    UpdateExpression='SET warningSent = :v',
                    ExpressionAttributeValues={':v': True}
                )
                warning_count += 1
                logger.info("Warning sent for lab %s (expires %s)",
                            lab['labId'], lab['expiresAt'])

            except Exception as e:
                logger.warning("Failed to send warning for lab %s: %s",
                               lab.get('labId', '?'), e)
                # Continue to next lab

    except Exception as e:
        logger.error("Failed to scan for warning labs: %s", e)

    return warning_count


def _send_warning_email(lab):
    """Publish an SNS warning email for a lab expiring soon."""
    lab_id = lab.get('labId', 'unknown')
    instance_id = lab.get('instanceId', 'unknown')
    region = lab.get('region', 'unknown')
    expires_at = lab.get('expiresAt', 'unknown')

    subject = f'EC2 Lab Expiry Warning — {instance_id}'
    message = (
        f'Your EC2 lab (labId: {lab_id}, instanceId: {instance_id}, region: {region}) '
        f'will auto-stop in 1 hour at {expires_at}. Extend it via the portal if needed.'
    )

    sns = _get_sns()
    sns.publish(
        TopicArn=SNS_TOPIC_ARN,
        Subject=subject,
        Message=message,
    )
    logger.info("SNS warning email published for lab %s", lab_id)


def _stop_expired_labs(now):
    """Scan for labs where expiresAt <= now and status = 'running'; stop them."""
    stopped_count = 0

    try:
        ddb = _get_ddb()
        table = ddb.Table(LABS_TABLE)

        # Scan for labs where:
        #   expiresAt <= now (already expired)
        #   AND status is running or provisioning (provisioning labs may never have
        #       been transitioned by handle_labs_list if the user never visited Labs tab)
        now_str = now.strftime('%Y-%m-%dT%H:%M:%SZ')
        scan_kwargs = {
            'FilterExpression': (
                Attr('expiresAt').lte(now_str)
                & Attr('status').is_in(['running', 'provisioning'])
            )
        }

        # Manual pagination (table.scan() returns a dict, not a paginator)
        resp = table.scan(**scan_kwargs)
        expired_labs = resp.get('Items', [])

        while 'LastEvaluatedKey' in resp:
            resp = table.scan(ExclusiveStartKey=resp['LastEvaluatedKey'], **scan_kwargs)
            expired_labs.extend(resp.get('Items', []))

        for lab in expired_labs:
            try:
                # Stop the instance
                account_id = lab.get('accountId')
                region = lab.get('region')
                instance_id = lab.get('instanceId')

                if not account_id or not region or not instance_id:
                    logger.warning("Lab %s missing accountId/region/instanceId; skipping",
                                  lab.get('labId', '?'))
                    continue

                # Get EC2 client (with STS assume-role if needed)
                ec2 = _get_ec2_client(account_id, region)

                # Stop the instance
                ec2.stop_instances(InstanceIds=[instance_id])
                logger.info("Stopped instance %s (lab %s)",
                            instance_id, lab.get('labId', '?'))

                # Update DynamoDB: set status = 'stopped'
                table.update_item(
                    Key={'labId': lab['labId']},
                    UpdateExpression='SET #s = :v',
                    ExpressionAttributeNames={'#s': 'status'},
                    ExpressionAttributeValues={':v': 'stopped'}
                )

                stopped_count += 1

            except Exception as e:
                logger.warning("Failed to stop lab %s: %s",
                               lab.get('labId', '?'), e)
                # Continue to next lab

    except Exception as e:
        logger.error("Failed to scan for expired labs: %s", e)

    return stopped_count


def _get_ec2_client(account_id, region):
    """Get EC2 client (with STS AssumeRole for member accounts)."""
    if account_id == CENTRAL_ACCOUNT_ID or account_id == 'LOCAL':
        return boto3.client('ec2', region_name=region)

    # Member account — assume role
    sts = boto3.client('sts')
    role_arn = f'arn:aws:iam::{account_id}:role/EC2ControlCrossAccountRole-{ENVIRONMENT}'
    assumed = sts.assume_role(
        RoleArn=role_arn,
        RoleSessionName=f'ec2ctrl-expiry-{account_id}',
        ExternalId=f'ec2-control-{CENTRAL_ACCOUNT_ID}',
        DurationSeconds=900,
    )
    creds = assumed['Credentials']

    return boto3.client(
        'ec2',
        region_name=region,
        aws_access_key_id=creds['AccessKeyId'],
        aws_secret_access_key=creds['SecretAccessKey'],
        aws_session_token=creds['SessionToken'],
    )
