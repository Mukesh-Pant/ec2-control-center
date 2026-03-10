"""Idle Auto-Stop Lambda — Milestone 4.

Triggered every 15 minutes by EventBridge.

Behavior:
  - Scans ALL running instances across ALL registered accounts/regions
  - For each running instance, queries CloudWatch CPUUtilization (last 60 min, 5-min periods)
  - If avg CPU < CPU_THRESHOLD (default 5%) → auto-stops the instance
  - If NO CloudWatch datapoints → instance assumed active, skip (safety first)
  - Opt-out: tag instance with  ec2-control:no-auto-stop = true  to skip it
  - Writes audit log entry (action: auto-stop-idle) with CPU stats in details
  - Publishes SNS notification with instance details + CPU stats

Environment variables (set by CloudFormation):
  ACCOUNTS_TABLE   — DynamoDB table name for account registry
  AUDIT_TABLE      — DynamoDB table name for audit log
  SNS_TOPIC_ARN    — ARN of the SNS topic for notifications
  CPU_THRESHOLD    — CPU % below which instance is considered idle (default: 5.0)
  IDLE_WINDOW_MIN  — Minutes of low CPU required before auto-stop (default: 60)
"""

import os
import logging
import json
import boto3
from datetime import datetime, timezone, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed

# ── Import sibling modules (same Lambda package) ─────────────────────────────
from accounts import get_accounts, get_ec2_client
import audit

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SNS_TOPIC_ARN   = os.environ.get('SNS_TOPIC_ARN', '')
CPU_THRESHOLD   = float(os.environ.get('CPU_THRESHOLD', '5.0'))
IDLE_WINDOW_MIN = int(os.environ.get('IDLE_WINDOW_MIN', '60'))
OPT_OUT_TAG_KEY = 'ec2-control:no-auto-stop'
OPT_OUT_TAG_VAL = 'true'


def lambda_handler(event, context):
    logger.info("Idle checker triggered. CPU threshold=%.1f%%, window=%d min",
                CPU_THRESHOLD, IDLE_WINDOW_MIN)

    accounts = get_accounts()
    stopped_count = 0
    checked_count = 0

    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = {}
        for account in accounts:
            acct_id   = account['accountId']
            acct_name = account.get('accountName', acct_id)
            # Use pre-configured regions if set, otherwise skip — don't call DescribeRegions
            # from idle checker (it adds latency; controller already handles discovery)
            regions = account.get('regions') or _get_regions(acct_id)
            for region in regions:
                f = executor.submit(_check_region, acct_id, acct_name, region)
                futures[f] = (acct_id, region)

        for future in as_completed(futures):
            acct_id, region = futures[future]
            try:
                checked, stopped = future.result()
                checked_count += checked
                stopped_count += stopped
            except Exception as e:
                logger.warning("Error checking %s/%s: %s", acct_id, region, e)

    logger.info("Idle check complete. Checked=%d, AutoStopped=%d",
                checked_count, stopped_count)
    return {
        'statusCode': 200,
        'checked': checked_count,
        'stopped': stopped_count,
    }


def _get_regions(account_id):
    """Get all enabled EC2 regions for the account."""
    try:
        ec2 = get_ec2_client(account_id, 'ap-south-1')
        resp = ec2.describe_regions(Filters=[{'Name': 'opt-in-status',
                                               'Values': ['opt-in-not-required', 'opted-in']}])
        return [r['RegionName'] for r in resp['Regions']]
    except Exception as e:
        logger.warning("Could not list regions for %s: %s", account_id, e)
        return ['ap-south-1']


def _check_region(account_id, account_name, region):
    """Check all running instances in one region. Returns (checked, stopped)."""
    checked = 0
    stopped = 0

    try:
        ec2 = get_ec2_client(account_id, region)
        cw  = _get_cw_client(account_id, region)

        paginator = ec2.get_paginator('describe_instances')
        for page in paginator.paginate(
            Filters=[{'Name': 'instance-state-name', 'Values': ['running']}]
        ):
            for reservation in page['Reservations']:
                for inst in reservation['Instances']:
                    checked += 1
                    did_stop = _evaluate_instance(
                        ec2, cw, inst, account_id, account_name, region
                    )
                    if did_stop:
                        stopped += 1

    except Exception as e:
        logger.warning("Failed region %s/%s: %s", account_id, region, e)

    return checked, stopped


def _get_cw_client(account_id, region):
    """Get CloudWatch client (with STS AssumeRole for member accounts)."""
    central_id = os.environ.get('CENTRAL_ACCOUNT_ID', '')
    if account_id == central_id or account_id == 'LOCAL':
        return boto3.client('cloudwatch', region_name=region)

    env = os.environ.get('ENVIRONMENT', 'production')
    role_arn = f'arn:aws:iam::{account_id}:role/EC2ControlCrossAccountRole-{env}'
    sts = boto3.client('sts')
    creds = sts.assume_role(RoleArn=role_arn, RoleSessionName='IdleCheckerCW')['Credentials']
    return boto3.client(
        'cloudwatch', region_name=region,
        aws_access_key_id=creds['AccessKeyId'],
        aws_secret_access_key=creds['SecretAccessKey'],
        aws_session_token=creds['SessionToken'],
    )


def _evaluate_instance(ec2, cw, inst, account_id, account_name, region):
    """
    Evaluate one running instance. Returns True if auto-stopped, False otherwise.
    """
    instance_id = inst['InstanceId']
    instance_type = inst.get('InstanceType', 'unknown')

    # Extract instance name from tags
    tags = {t['Key']: t['Value'] for t in inst.get('Tags', [])}
    instance_name = tags.get('Name', instance_id)

    # Check opt-out tag
    if tags.get(OPT_OUT_TAG_KEY, '').lower() == OPT_OUT_TAG_VAL:
        logger.info("SKIP %s — opt-out tag present", instance_id)
        return False

    # Query CloudWatch CPU metrics
    avg_cpu, datapoint_count = _get_avg_cpu(cw, instance_id)

    if datapoint_count == 0:
        # No CloudWatch data — instance too new or metrics not yet flowing.
        # Safety: do NOT stop it.
        logger.info("SKIP %s — no CloudWatch datapoints (assume active)", instance_id)
        return False

    logger.info("Instance %s (%s) avg CPU=%.2f%% over %d datapoints",
                instance_id, instance_name, avg_cpu, datapoint_count)

    if avg_cpu >= CPU_THRESHOLD:
        logger.info("ACTIVE %s — CPU %.2f%% >= threshold %.1f%%",
                    instance_id, avg_cpu, CPU_THRESHOLD)
        return False

    # CPU below threshold — auto-stop
    logger.info("IDLE %s — CPU %.2f%% < threshold %.1f%%. Stopping...",
                instance_id, avg_cpu, CPU_THRESHOLD)

    stop_result = 'success'
    stop_error  = ''
    try:
        ec2.stop_instances(InstanceIds=[instance_id])
    except Exception as e:
        stop_result = 'failed'
        stop_error  = str(e)
        logger.error("Failed to stop %s: %s", instance_id, e)

    details = json.dumps({
        'avgCpuPercent':  round(avg_cpu, 2),
        'datapoints':     datapoint_count,
        'windowMinutes':  IDLE_WINDOW_MIN,
        'threshold':      CPU_THRESHOLD,
        'error':          stop_error,
    })

    # Write audit log
    audit.log_action(
        instance_id=instance_id,
        instance_name=instance_name,
        instance_type=instance_type,
        action='auto-stop-idle',
        user_email='system:idle-checker',
        result=stop_result,
        account_id=account_id,
        region=region,
        details=details,
    )

    # Publish SNS notification
    if stop_result == 'success':
        _notify_sns(
            instance_id=instance_id,
            instance_name=instance_name,
            instance_type=instance_type,
            account_name=account_name,
            account_id=account_id,
            region=region,
            avg_cpu=avg_cpu,
            datapoint_count=datapoint_count,
        )

    return stop_result == 'success'


def _get_avg_cpu(cw, instance_id):
    """
    Query CloudWatch CPUUtilization for the past IDLE_WINDOW_MIN minutes.
    Returns (average_cpu_percent, datapoint_count).
    """
    now    = datetime.now(timezone.utc)
    start  = now - timedelta(minutes=IDLE_WINDOW_MIN)

    try:
        resp = cw.get_metric_statistics(
            Namespace='AWS/EC2',
            MetricName='CPUUtilization',
            Dimensions=[{'Name': 'InstanceId', 'Value': instance_id}],
            StartTime=start,
            EndTime=now,
            Period=300,       # 5-minute periods
            Statistics=['Average'],
        )
        datapoints = resp.get('Datapoints', [])
        if not datapoints:
            return 0.0, 0
        avg = sum(d['Average'] for d in datapoints) / len(datapoints)
        return avg, len(datapoints)
    except Exception as e:
        logger.error("CloudWatch query failed for %s: %s", instance_id, e)
        return 0.0, 0


def _notify_sns(instance_id, instance_name, instance_type,
                account_name, account_id, region, avg_cpu, datapoint_count):
    """Publish an SNS notification about the auto-stopped instance."""
    if not SNS_TOPIC_ARN:
        return

    subject = f'EC2 Auto-Stopped: {instance_name} ({instance_id})'
    message = (
        f'EC2 Control Portal — Idle Auto-Stop Alert\n'
        f'{"=" * 50}\n\n'
        f'An EC2 instance was automatically stopped because its CPU\n'
        f'utilization was below the idle threshold.\n\n'
        f'Instance Details:\n'
        f'  Name:         {instance_name}\n'
        f'  Instance ID:  {instance_id}\n'
        f'  Type:         {instance_type}\n'
        f'  Account:      {account_name} ({account_id})\n'
        f'  Region:       {region}\n\n'
        f'CPU Metrics (last {IDLE_WINDOW_MIN} minutes):\n'
        f'  Average CPU:  {avg_cpu:.2f}%\n'
        f'  Threshold:    {CPU_THRESHOLD:.1f}%\n'
        f'  Datapoints:   {datapoint_count}\n\n'
        f'To prevent auto-stop for this instance, add the tag:\n'
        f'  Key:   ec2-control:no-auto-stop\n'
        f'  Value: true\n\n'
        f'Timestamp: {datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")}\n'
    )

    try:
        boto3.client('sns').publish(
            TopicArn=SNS_TOPIC_ARN,
            Subject=subject,
            Message=message,
        )
        logger.info("SNS notification sent for %s", instance_id)
    except Exception as e:
        logger.error("SNS publish failed for %s: %s", instance_id, e)
