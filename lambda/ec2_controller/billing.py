"""Billing module — fetches costs from AWS Cost Explorer.

Queries ALL AWS services to show the full bill, with EC2/EBS highlighted.
Also queries EC2 by USAGE_TYPE for detailed compute/storage breakdown.

Two strategies per account:
  1. Central account — direct boto3 ce client (always works).
  2. Member accounts — STS AssumeRole then ce client (works if the
     cross-account role has ce:GetCostAndUsage; skipped gracefully if not).
"""

import logging
import os
from datetime import datetime, timezone, timedelta

import boto3
from botocore.exceptions import ClientError

from accounts import get_accounts

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Cost Explorer is a global service; must use us-east-1 endpoint.
CE_REGION = 'us-east-1'

EC2_SERVICES = [
    'Amazon Elastic Compute Cloud - Compute',
    'Amazon Elastic Block Store',
    'Amazon EC2 - Other',
]


# ─── Date helpers ──────────────────────────────────────────────────────────────

def _date_range(range_key):
    today = datetime.now(timezone.utc).date()
    if range_key == 'today':
        start = today
        end   = today + timedelta(days=1)
    elif range_key == 'yesterday':
        start = today - timedelta(days=1)
        end   = today
    elif range_key == '7d':
        start = today - timedelta(days=7)
        end   = today + timedelta(days=1)
    elif range_key == '14d':
        start = today - timedelta(days=14)
        end   = today + timedelta(days=1)
    elif range_key == '30d':
        start = today - timedelta(days=30)
        end   = today + timedelta(days=1)
    else:
        start = today - timedelta(days=7)
        end   = today + timedelta(days=1)
    return str(start), str(end)


# ─── CE client helpers ─────────────────────────────────────────────────────────

def _ce_client_central():
    return boto3.client('ce', region_name=CE_REGION)


def _ce_client_for_account(account_id):
    role_arn = (
        f'arn:aws:iam::{account_id}:role/'
        f'EC2ControlCrossAccountRole-{os.environ.get("ENVIRONMENT", "production")}'
    )
    try:
        sts   = boto3.client('sts')
        creds = sts.assume_role(
            RoleArn=role_arn,
            RoleSessionName='EC2ControlBillingCheck',
        )['Credentials']
        return boto3.client(
            'ce',
            region_name=CE_REGION,
            aws_access_key_id=creds['AccessKeyId'],
            aws_secret_access_key=creds['SecretAccessKey'],
            aws_session_token=creds['SessionToken'],
        )
    except Exception as e:
        logger.info("Cannot assume CE role for account %s: %s", account_id, e)
        return None


# ─── CE queries ─────────────────────────────────────────────────────────────────

def _query_all_services(ce_client, start_date, end_date):
    """Query ALL services grouped by SERVICE + LINKED_ACCOUNT (daily)."""
    try:
        resp = ce_client.get_cost_and_usage(
            TimePeriod={'Start': start_date, 'End': end_date},
            Granularity='DAILY',
            GroupBy=[
                {'Type': 'DIMENSION', 'Key': 'SERVICE'},
                {'Type': 'DIMENSION', 'Key': 'LINKED_ACCOUNT'},
            ],
            Metrics=['UnblendedCost'],
        )
        return resp.get('ResultsByTime', [])
    except ClientError as e:
        logger.warning("CE all-services query failed: %s", e)
        return []
    except Exception as e:
        logger.warning("CE all-services unexpected error: %s", e)
        return []


def _query_ec2_usage_types(ce_client, start_date, end_date):
    """Query EC2 services grouped by USAGE_TYPE + LINKED_ACCOUNT (monthly totals)."""
    try:
        resp = ce_client.get_cost_and_usage(
            TimePeriod={'Start': start_date, 'End': end_date},
            Granularity='MONTHLY',
            Filter={
                'Dimensions': {
                    'Key':    'SERVICE',
                    'Values': EC2_SERVICES,
                }
            },
            GroupBy=[
                {'Type': 'DIMENSION', 'Key': 'USAGE_TYPE'},
                {'Type': 'DIMENSION', 'Key': 'LINKED_ACCOUNT'},
            ],
            Metrics=['UnblendedCost', 'UsageQuantity'],
        )
        return resp.get('ResultsByTime', [])
    except Exception as e:
        logger.warning("CE usage-type query failed: %s", e)
        return []


# ─── Aggregation ────────────────────────────────────────────────────────────────

def _aggregate_all_services(results):
    """
    Parse CE ResultsByTime (SERVICE + LINKED_ACCOUNT) into:
    {
      accountId: {
        'total': float,
        'ec2': float, 'ebs': float, 'other_ec2': float, 'other_services': float,
        'by_service': { service_name: float },   # sorted by cost desc
        'daily': { 'YYYY-MM-DD': float },
      }
    }
    """
    by_account = {}

    for day_result in results:
        date_str = day_result['TimePeriod']['Start']
        for group in day_result.get('Groups', []):
            keys = group.get('Keys', [])
            if len(keys) < 2:
                continue
            service, account_id = keys[0], keys[1]
            amount = float(group['Metrics']['UnblendedCost']['Amount'])
            if amount < 0.00001:
                continue

            if account_id not in by_account:
                by_account[account_id] = {
                    'total': 0.0, 'ec2': 0.0, 'ebs': 0.0,
                    'other_ec2': 0.0, 'other_services': 0.0,
                    'by_service': {}, 'daily': {},
                }
            rec = by_account[account_id]
            rec['total'] += amount
            rec['daily'][date_str] = rec['daily'].get(date_str, 0.0) + amount
            rec['by_service'][service] = rec['by_service'].get(service, 0.0) + amount

            if service == 'Amazon Elastic Compute Cloud - Compute':
                rec['ec2'] += amount
            elif service == 'Amazon Elastic Block Store':
                rec['ebs'] += amount
            elif service == 'Amazon EC2 - Other':
                rec['other_ec2'] += amount
            else:
                rec['other_services'] += amount

    for acct in by_account.values():
        acct['total']          = round(acct['total'],          4)
        acct['ec2']            = round(acct['ec2'],            4)
        acct['ebs']            = round(acct['ebs'],            4)
        acct['other_ec2']      = round(acct['other_ec2'],      4)
        acct['other_services'] = round(acct['other_services'], 4)
        acct['by_service'] = {
            k: round(v, 4)
            for k, v in sorted(acct['by_service'].items(), key=lambda x: -x[1])
        }
        acct['daily'] = {
            d: round(v, 4) for d, v in sorted(acct['daily'].items())
        }

    return by_account


def _aggregate_usage_types(results):
    """
    Parse CE usage-type results into:
    {
      accountId: [
        {'usageType': str, 'cost': float, 'quantity': float},
        ...  # sorted by cost desc
      ]
    }
    """
    by_account = {}

    for period in results:
        for group in period.get('Groups', []):
            keys = group.get('Keys', [])
            if len(keys) < 2:
                continue
            usage_type, account_id = keys[0], keys[1]
            amount   = float(group['Metrics']['UnblendedCost']['Amount'])
            quantity = float(group['Metrics'].get('UsageQuantity', {}).get('Amount', 0))
            if amount < 0.00001:
                continue

            if account_id not in by_account:
                by_account[account_id] = {}
            um = by_account[account_id]
            if usage_type not in um:
                um[usage_type] = {'cost': 0.0, 'quantity': 0.0}
            um[usage_type]['cost']     += amount
            um[usage_type]['quantity'] += quantity

    out = {}
    for acct_id, um in by_account.items():
        items = [
            {
                'usageType': ut,
                'cost':      round(v['cost'],     4),
                'quantity':  round(v['quantity'],  2),
            }
            for ut, v in um.items()
        ]
        items.sort(key=lambda x: -x['cost'])
        out[acct_id] = items

    return out


# ─── Empty account record ───────────────────────────────────────────────────────

def _empty_acct(limited=False):
    return {
        'total': 0.0, 'ec2': 0.0, 'ebs': 0.0,
        'other_ec2': 0.0, 'other_services': 0.0,
        'by_service': {}, 'daily': {},
        'limitedData': limited, 'usageTypes': [],
    }


# ─── Public API ─────────────────────────────────────────────────────────────────

def get_billing(range_key='7d', filter_account_id=None):
    """
    Fetch ALL AWS costs + EC2 usage-type detail from Cost Explorer.

    Returns:
    {
      'startDate', 'endDate', 'rangeKey', 'currency', 'dataSource',
      'grandTotal': float,     # total AWS spend across all services
      'ec2Total':   float,     # EC2 compute only
      'ebsTotal':   float,     # EBS only
      'byAccount': {
        accountId: {
          'accountId', 'accountName',
          'total', 'ec2', 'ebs', 'other_ec2', 'other_services',
          'by_service': { service: float },  # all services, sorted by cost
          'daily': { date: float },
          'usageTypes': [{ 'usageType', 'cost', 'quantity' }],
          'limitedData': bool,
        }
      },
      'disclaimer': str,
    }
    """
    start_date, end_date = _date_range(range_key)
    logger.info("Billing query: %s → %s (range=%s)", start_date, end_date, range_key)

    # Step 1: Central account queries
    central_ce      = _ce_client_central()
    central_all     = _aggregate_all_services(
                          _query_all_services(central_ce, start_date, end_date))
    central_ut      = _aggregate_usage_types(
                          _query_ec2_usage_types(central_ce, start_date, end_date))
    logger.info("CE central returned data for accounts: %s", list(central_all.keys()))

    # Step 2: Per-registered-account logic
    registered_accounts = get_accounts()
    account_names       = {
        a['accountId']: a.get('accountName', a['accountId'])
        for a in registered_accounts
    }
    central_account_id = os.environ.get('CENTRAL_ACCOUNT_ID', '')

    by_account = {}

    for acct in registered_accounts:
        acct_id = acct['accountId']
        if filter_account_id and acct_id != filter_account_id:
            continue

        # Already returned by central CE (payer / same account)
        if acct_id in central_all:
            by_account[acct_id] = central_all[acct_id]
            by_account[acct_id]['limitedData'] = False
            by_account[acct_id]['usageTypes']  = central_ut.get(acct_id, [])
            continue

        # Central account with no spend in this period
        if acct.get('roleArn') == 'LOCAL' or acct_id == central_account_id:
            by_account[acct_id] = _empty_acct(limited=False)
            by_account[acct_id]['usageTypes'] = central_ut.get(acct_id, [])
            continue

        # Member account — try cross-account CE
        member_ce = _ce_client_for_account(acct_id)
        if member_ce is None:
            by_account[acct_id] = _empty_acct(limited=True)
            continue

        member_all = _aggregate_all_services(
                         _query_all_services(member_ce, start_date, end_date))
        member_ut  = _aggregate_usage_types(
                         _query_ec2_usage_types(member_ce, start_date, end_date))

        if acct_id in member_all:
            by_account[acct_id] = member_all[acct_id]
            by_account[acct_id]['limitedData'] = False
            by_account[acct_id]['usageTypes']  = member_ut.get(acct_id, [])
        else:
            by_account[acct_id] = _empty_acct(limited=False)
            by_account[acct_id]['usageTypes'] = []

    # Attach names; ensure every registered account is present
    for acct in registered_accounts:
        acct_id = acct['accountId']
        if filter_account_id and acct_id != filter_account_id:
            continue
        if acct_id not in by_account:
            by_account[acct_id] = _empty_acct(limited=False)
        by_account[acct_id]['accountId']   = acct_id
        by_account[acct_id]['accountName'] = account_names.get(acct_id, acct_id)

    # Keep only registered accounts
    registered_ids = {a['accountId'] for a in registered_accounts}
    by_account = {k: v for k, v in by_account.items() if k in registered_ids}

    grand_total = round(sum(v['total'] for v in by_account.values()), 4)
    ec2_total   = round(sum(v['ec2']   for v in by_account.values()), 4)
    ebs_total   = round(sum(v['ebs']   for v in by_account.values()), 4)

    return {
        'startDate':  start_date,
        'endDate':    end_date,
        'rangeKey':   range_key,
        'currency':   'USD',
        'dataSource': 'cost_explorer',
        'byAccount':  by_account,
        'grandTotal': grand_total,
        'ec2Total':   ec2_total,
        'ebsTotal':   ebs_total,
        'disclaimer': (
            'Costs retrieved directly from AWS Cost Explorer — same source as your '
            'AWS Console billing. Shows ALL AWS services; EC2 Compute, EBS Storage, '
            'and EC2-Other are broken out separately. Reserved / Savings Plans '
            'discounts are applied automatically. Accounts marked "limited" need '
            'ce:GetCostAndUsage added to their cross-account role.'
        ),
    }
