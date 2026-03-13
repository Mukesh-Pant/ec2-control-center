"""Audit logging for EC2 actions.

Writes every start/stop event to DynamoDB with a 90-day TTL.
Provides:
  - log_action()        — write one event (never raises, failures logged only)
  - get_audit_log()     — query by instance or user, paginated
  - get_daily_summary() — per-day running hours, stopped hours, estimated cost
"""

import os
import logging
import time
from datetime import datetime, timezone, timedelta

import boto3
from boto3.dynamodb.conditions import Key, Attr

import pricing

logger = logging.getLogger()
logger.setLevel(logging.INFO)

AUDIT_TABLE = os.environ.get('AUDIT_TABLE', 'ec2-control-audit-production')
TTL_DAYS = 90

_ddb_table = None


def _get_table():
    global _ddb_table
    if _ddb_table is None:
        _ddb_table = boto3.resource('dynamodb').Table(AUDIT_TABLE)
    return _ddb_table


# ─── Write ─────────────────────────────────────────────────────────────────

def log_action(instance_id, instance_name, instance_type, action,
               user_email, result, account_id, region, details=''):
    """Write one audit event to DynamoDB. Never raises — failures are logged only."""
    now = datetime.now(timezone.utc)
    # Millisecond-precision ISO timestamp → guaranteed unique SK with action suffix
    timestamp = now.strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'
    date_str = now.strftime('%Y-%m-%d')
    ttl = int(time.time()) + TTL_DAYS * 86400

    try:
        _get_table().put_item(Item={
            'pk':           f'INSTANCE#{instance_id}',
            'sk':           f'{timestamp}#{action}',
            'instanceId':   instance_id,
            'instanceName': instance_name or instance_id,
            'instanceType': instance_type or 'unknown',
            'action':       action,
            'userEmail':    user_email,
            'result':       result,
            'accountId':    account_id,
            'region':       region,
            'details':      str(details),
            'timestamp':    timestamp,
            'date':         date_str,
            'ttl':          ttl,
        })
        logger.info("Audit: %s %s by %s → %s", action, instance_id, user_email, result)
    except Exception as e:
        logger.error("Audit write failed (non-fatal): %s", e)


# ─── Query: Event Log ───────────────────────────────────────────────────────

def get_audit_log(instance_id=None, user_email=None, action=None,
                  account_id=None, limit=50, last_key=None):
    """
    Query audit events (newest first).
      - instance_id → query by PK INSTANCE#{id}  (fast, uses table key)
      - user_email  → query GSI user-index        (fast, uses GSI)
      - neither     → full scan with pagination   (admin use / audit overview)
      - action / account_id → applied as FilterExpression on top of any of the above

    Returns: (items: list, next_last_key: dict | None)
    """
    table = _get_table()
    limit = min(int(limit), 200)
    kwargs = {'Limit': limit, 'ScanIndexForward': False}
    if last_key:
        kwargs['ExclusiveStartKey'] = last_key

    # Build optional FilterExpression
    filter_expr = None
    if action:
        filter_expr = Attr('action').eq(action)
    if account_id:
        acct_expr = Attr('accountId').eq(account_id)
        filter_expr = filter_expr & acct_expr if filter_expr else acct_expr

    try:
        if instance_id:
            # When both instance_id and user_email are provided, filter by user too
            if user_email:
                user_expr = Attr('userEmail').eq(user_email)
                filter_expr = filter_expr & user_expr if filter_expr else user_expr
            if filter_expr is not None:
                kwargs['FilterExpression'] = filter_expr
            resp = table.query(
                KeyConditionExpression=Key('pk').eq(f'INSTANCE#{instance_id}'),
                **kwargs
            )
            return resp.get('Items', []), resp.get('LastEvaluatedKey')

        elif user_email:
            if filter_expr is not None:
                kwargs['FilterExpression'] = filter_expr
            resp = table.query(
                IndexName='user-index',
                KeyConditionExpression=Key('userEmail').eq(user_email),
                **kwargs
            )
            return resp.get('Items', []), resp.get('LastEvaluatedKey')

        else:
            # Full scan — paginate internally until we have enough results
            # DynamoDB Limit on scan limits *scanned* items, not returned items,
            # so with a FilterExpression we may get far fewer than requested.
            if filter_expr is not None:
                scan_kwargs = {'FilterExpression': filter_expr}
            else:
                scan_kwargs = {}
            if last_key:
                scan_kwargs['ExclusiveStartKey'] = last_key

            items_collected = []
            scan_cursor = None
            # Scan in batches up to 5× the requested limit to satisfy filter
            batch_limit = min(limit * 5, 500)

            while len(items_collected) < limit:
                call_kwargs = {**scan_kwargs, 'Limit': batch_limit}
                if scan_cursor:
                    call_kwargs['ExclusiveStartKey'] = scan_cursor
                elif last_key and 'ExclusiveStartKey' not in call_kwargs:
                    call_kwargs['ExclusiveStartKey'] = last_key

                resp = table.scan(**call_kwargs)
                items_collected.extend(resp.get('Items', []))
                scan_cursor = resp.get('LastEvaluatedKey')
                if not scan_cursor:
                    break
                # Remove last_key from subsequent iterations (already applied)
                scan_kwargs.pop('ExclusiveStartKey', None)

            # Sort newest first
            items_collected.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
            # Return up to limit; pass cursor so frontend can load more
            next_key = scan_cursor if len(items_collected) >= limit else None
            return items_collected[:limit], next_key

    except Exception as e:
        logger.error("Audit query failed: %s", e)
        return [], None


# ─── Query: Daily Summary ───────────────────────────────────────────────────

def get_daily_summary(instance_id, days=30):
    """
    Compute per-day running hours, stopped hours, event count, and estimated cost
    for one EC2 instance over the past N days.

    Algorithm:
      1. Fetch all events for the instance in the time window (oldest → newest).
      2. Walk events in order: a START action opens an interval; a STOP closes it.
      3. If the instance appears to still be running at the end of the window,
         close the interval at "now".
      4. For each interval, distribute the running minutes across calendar days.
      5. Apply the on-demand hourly price to compute estimated cost per day.

    Returns: list of dicts (newest date first):
      {
        date, runningHours, stoppedHours, events,
        estimatedCost, instanceType, hourlyRate
      }
    Only days with activity OR within the last 7 days are included.
    """
    table = _get_table()
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=days)
    # sk starts with timestamp, so gte on the ISO string works as a range filter
    cutoff_sk = cutoff.strftime('%Y-%m-%dT%H:%M:%SZ')

    try:
        resp = table.query(
            KeyConditionExpression=(
                Key('pk').eq(f'INSTANCE#{instance_id}') &
                Key('sk').gte(cutoff_sk)
            ),
            ScanIndexForward=True,   # oldest → newest for timeline walk
        )
        events = resp.get('Items', [])
    except Exception as e:
        logger.error("Daily summary query failed: %s", e)
        return []

    if not events:
        return []

    # Determine instance type and price from most recent event (region-aware, live pricing)
    last_event    = events[-1]
    instance_type = last_event.get('instanceType', 'unknown')
    region        = last_event.get('region', 'ap-south-1')
    hourly_price  = pricing.get_hourly_price(instance_type, region)

    # ── Walk events to build (start_dt, end_dt) running intervals ──────────
    START_ACTIONS = {'start', 'scheduled-start', 'auto-start'}
    STOP_ACTIONS  = {'stop', 'scheduled-stop', 'auto-stop-idle', 'auto-stop'}

    running_intervals = []
    pending_start = None

    for ev in events:
        if ev.get('result') != 'success':
            continue
        action = ev.get('action', '')
        ts = ev.get('timestamp', '')
        try:
            ev_dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
        except Exception:
            continue

        if action in START_ACTIONS:
            pending_start = ev_dt
        elif action in STOP_ACTIONS and pending_start is not None:
            running_intervals.append((pending_start, ev_dt))
            pending_start = None

    # Close open interval at "now" if instance is still running
    if pending_start is not None:
        running_intervals.append((pending_start, now))

    # ── Initialise daily buckets ────────────────────────────────────────────
    daily = {}
    for i in range(days):
        day = (now - timedelta(days=days - 1 - i)).strftime('%Y-%m-%d')
        daily[day] = {'runningMinutes': 0.0, 'events': 0}

    # Count events per day
    for ev in events:
        d = ev.get('date', '')
        if d in daily:
            daily[d]['events'] += 1

    # Distribute running intervals across calendar days
    for (s, e) in running_intervals:
        cursor = s.replace(hour=0, minute=0, second=0, microsecond=0)
        while cursor.date() <= e.date():
            day_str = cursor.strftime('%Y-%m-%d')
            day_end = cursor + timedelta(days=1)
            overlap_start = max(s, cursor)
            overlap_end   = min(e, day_end)
            minutes = max(0.0, (overlap_end - overlap_start).total_seconds() / 60.0)
            if day_str in daily:
                daily[day_str]['runningMinutes'] += minutes
            cursor += timedelta(days=1)

    # ── Build result list ───────────────────────────────────────────────────
    # Include days with activity OR the last 7 days (so recent days always show)
    recent_cutoff = (now - timedelta(days=7)).strftime('%Y-%m-%d')
    result = []
    for day_str in sorted(daily.keys(), reverse=True):
        d = daily[day_str]
        running_hrs = round(d['runningMinutes'] / 60.0, 2)
        stopped_hrs = round(max(0.0, 24.0 - running_hrs), 2)
        cost = round(running_hrs * hourly_price, 4)
        if d['events'] > 0 or d['runningMinutes'] > 0 or day_str >= recent_cutoff:
            result.append({
                'date':          day_str,
                'runningHours':  running_hrs,
                'stoppedHours':  stopped_hrs,
                'events':        d['events'],
                'estimatedCost': cost,
                'instanceType':  instance_type,
                'hourlyRate':    hourly_price,
            })

    return result
