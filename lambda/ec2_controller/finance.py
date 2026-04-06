"""Finance backend — Vendors, Customers, Settings, Alerts, and Invoice Proof file handling."""

import os
import re
import json
import logging
import uuid
from datetime import datetime, timezone, timedelta
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Key

from utils import require_admin, response, error_response

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# ─── Environment variables ────────────────────────────────────────────────────
FINANCE_TABLE  = os.environ.get('FINANCE_TABLE', 'ec2-control-finance-production')
FINANCE_BUCKET = os.environ.get('FINANCE_BUCKET', '')

# ─── Lazy singletons ──────────────────────────────────────────────────────────
_ddb_table = None
_s3_client = None


def _get_table():
    global _ddb_table
    if _ddb_table is None:
        _ddb_table = boto3.resource('dynamodb').Table(FINANCE_TABLE)
    return _ddb_table


def _get_s3():
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client(
            's3',
            region_name=os.environ.get('AWS_REGION', 'ap-south-1'),
        )
    return _s3_client


# ─── Decimal serialisation ────────────────────────────────────────────────────

def _serialise_item(item):
    """Convert Decimal values returned by DynamoDB to float for JSON serialisation."""
    out = {}
    for k, v in item.items():
        if isinstance(v, Decimal):
            out[k] = float(v)
        elif isinstance(v, dict):
            out[k] = _serialise_item(v)
        elif isinstance(v, list):
            out[k] = [_serialise_item(i) if isinstance(i, dict) else
                      (float(i) if isinstance(i, Decimal) else i)
                      for i in v]
        else:
            out[k] = v
    return out


# ─── Settings helper ──────────────────────────────────────────────────────────

_SETTINGS_DEFAULTS = {
    'entityType':          'SETTINGS',
    'entityId':            'GLOBAL',
    'usdToNpr':            135,
    'inrToNpr':            1.62,
    'expiryWarningDays':   30,
    'paymentWarningDays':  7,
    'defaultCurrency':     'USD',
    'wht_rate':            0.18,
    'margin_rate':         0.12,
    'vat_rate':            0.13,
    'usd_to_npr':          135,
    'usd_to_inr':          84,
    'show_breakdown':      False,
    'taxAccounts':         {},
}


def _get_settings():
    """Fetch the SETTINGS/GLOBAL item from DynamoDB. Returns defaults dict if not found."""
    try:
        result = _get_table().get_item(
            Key={'entityType': 'SETTINGS', 'entityId': 'GLOBAL'}
        )
        item = result.get('Item')
        if item:
            return _serialise_item(item)
    except Exception as e:
        logger.error("Failed to fetch settings: %s", e)
    return dict(_SETTINGS_DEFAULTS)


# ─── GSI query helper ─────────────────────────────────────────────────────────

def _query_by_type(entity_type):
    """Query the type-index GSI for all items with the given entityType. Paginated."""
    table = _get_table()
    items = []
    kwargs = {
        'IndexName': 'type-index',
        'KeyConditionExpression': Key('entityType').eq(entity_type),
    }
    while True:
        result = table.query(**kwargs)
        items.extend(result.get('Items', []))
        if 'LastEvaluatedKey' not in result:
            break
        kwargs['ExclusiveStartKey'] = result['LastEvaluatedKey']
    return [_serialise_item(i) for i in items]


# ─── Alert computation ────────────────────────────────────────────────────────

def _parse_date(date_str):
    """Parse an ISO date string (YYYY-MM-DD) to a date object, or None if invalid."""
    try:
        return datetime.strptime(date_str, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None


def _compute_alerts(vendors, customers, settings):
    """
    Derive alerts from vendor/customer data + settings thresholds.

    Returns a list of alert dicts:
      {type, severity, entityType, entityId, entityName, message, link}

    Alert types:
      VENDORS (skip if manualStatus == 'inactive'):
        - agreementEnd past today         → vendor_expired   (critical)
        - agreementEnd within warning window → vendor_expiring (warning)

      CUSTOMERS:
        - nextDueDate past today          → payment_overdue   (critical)
        - nextDueDate within warning window → payment_due     (warning)
        - any milestone paid=False + dueDate past today → milestone_overdue (critical)
        - agreementEnd within warning window → contract_expiring (warning)
    """
    today = datetime.now(timezone.utc).date()
    expiry_warn_days  = int(settings.get('expiryWarningDays',  30))
    payment_warn_days = int(settings.get('paymentWarningDays', 7))
    alerts = []

    # ── Vendor alerts ─────────────────────────────────────────────────────────
    for vendor in vendors:
        if vendor.get('manualStatus') == 'inactive':
            continue

        vendor_id   = vendor.get('entityId', '')
        vendor_name = vendor.get('name', vendor_id)
        end_str     = vendor.get('agreementEnd', '')
        if not end_str:
            continue

        end_date = _parse_date(end_str)
        if end_date is None:
            continue

        if end_date < today:
            alerts.append({
                'type':       'vendor_expired',
                'severity':   'critical',
                'entityType': 'VENDOR',
                'entityId':   vendor_id,
                'entityName': vendor_name,
                'message':    f'Vendor agreement for "{vendor_name}" expired on {end_str}.',
                'link':       f'/finance/vendors/{vendor_id}',
            })
        elif end_date <= today + timedelta(days=expiry_warn_days):
            days_left = (end_date - today).days
            alerts.append({
                'type':       'vendor_expiring',
                'severity':   'warning',
                'entityType': 'VENDOR',
                'entityId':   vendor_id,
                'entityName': vendor_name,
                'message':    f'Vendor agreement for "{vendor_name}" expires in {days_left} day(s) on {end_str}.',
                'link':       f'/finance/vendors/{vendor_id}',
            })

    # ── Customer alerts ───────────────────────────────────────────────────────
    for customer in customers:
        customer_id   = customer.get('entityId', '')
        customer_name = customer.get('name', customer_id)

        # Payment due / overdue
        next_due_str = customer.get('nextDueDate', '')
        if next_due_str:
            next_due = _parse_date(next_due_str)
            if next_due is not None:
                if next_due < today:
                    alerts.append({
                        'type':       'payment_overdue',
                        'severity':   'critical',
                        'entityType': 'CUSTOMER',
                        'entityId':   customer_id,
                        'entityName': customer_name,
                        'message':    f'Payment from "{customer_name}" was due on {next_due_str} and is overdue.',
                        'link':       f'/finance/customers/{customer_id}',
                    })
                elif next_due <= today + timedelta(days=payment_warn_days):
                    days_left = (next_due - today).days
                    alerts.append({
                        'type':       'payment_due',
                        'severity':   'warning',
                        'entityType': 'CUSTOMER',
                        'entityId':   customer_id,
                        'entityName': customer_name,
                        'message':    f'Payment from "{customer_name}" is due in {days_left} day(s) on {next_due_str}.',
                        'link':       f'/finance/customers/{customer_id}',
                    })

        # Milestone overdue
        milestones = customer.get('milestones', [])
        if isinstance(milestones, list):
            for ms in milestones:
                if ms.get('paid', False):
                    continue
                ms_due_str = ms.get('dueDate', '')
                if not ms_due_str:
                    continue
                ms_due = _parse_date(ms_due_str)
                if ms_due is not None and ms_due < today:
                    ms_name = ms.get('name', ms_due_str)
                    alerts.append({
                        'type':       'milestone_overdue',
                        'severity':   'critical',
                        'entityType': 'CUSTOMER',
                        'entityId':   customer_id,
                        'entityName': customer_name,
                        'message':    f'Milestone "{ms_name}" for "{customer_name}" was due on {ms_due_str} and is unpaid.',
                        'link':       f'/finance/customers/{customer_id}',
                    })

        # Contract expiring
        agreement_end_str = customer.get('agreementEnd', '')
        if agreement_end_str:
            agreement_end = _parse_date(agreement_end_str)
            if agreement_end is not None and today <= agreement_end <= today + timedelta(days=expiry_warn_days):
                days_left = (agreement_end - today).days
                alerts.append({
                    'type':       'contract_expiring',
                    'severity':   'warning',
                    'entityType': 'CUSTOMER',
                    'entityId':   customer_id,
                    'entityName': customer_name,
                    'message':    f'Contract with "{customer_name}" expires in {days_left} day(s) on {agreement_end_str}.',
                    'link':       f'/finance/customers/{customer_id}',
                })

    return alerts


# ─── Vendor handlers ──────────────────────────────────────────────────────────

def handle_finance_vendors_list(event):
    """GET /finance/vendors — returns all VENDOR items."""
    guard = require_admin(event)
    if guard:
        return guard
    try:
        items = _query_by_type('VENDOR')
        return response(200, {'items': items})
    except Exception as e:
        logger.error("Failed to list vendors: %s", e)
        return error_response(500, 'Failed to retrieve vendors.')


def handle_finance_vendors_mutation(event):
    """POST /finance/vendors — action: create / update / delete."""
    guard = require_admin(event)
    if guard:
        return guard

    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return error_response(400, 'Invalid JSON body.')

    action = body.get('action', '').strip().lower()

    if action == 'create':
        vendor_id = 'v-' + str(uuid.uuid4())
        vendor_data = body.get('vendor', {})
        item = {**vendor_data}
        item['entityType'] = 'VENDOR'
        item['entityId']   = vendor_id
        item['createdAt']  = datetime.now(timezone.utc).isoformat()
        try:
            _get_table().put_item(Item=item)
            return response(200, {'vendorId': vendor_id})
        except Exception as e:
            logger.error("Failed to create vendor: %s", e)
            return error_response(500, 'Failed to create vendor.')

    elif action == 'update':
        vendor = body.get('vendor', {})
        vendor_id = vendor.get('entityId', '')
        if not vendor_id:
            return error_response(400, 'vendor.entityId is required for update.')
        item = {**vendor}
        item['entityType'] = 'VENDOR'
        if not item.get('createdAt'):
            item['createdAt'] = datetime.now(timezone.utc).isoformat()
        item['updatedAt'] = datetime.now(timezone.utc).isoformat()
        try:
            _get_table().put_item(Item=item)
            return response(200, {'vendorId': vendor_id})
        except Exception as e:
            logger.error("Failed to update vendor %s: %s", vendor_id, e)
            return error_response(500, 'Failed to update vendor.')

    elif action == 'delete':
        vendor_id = body.get('vendorId', '')
        if not vendor_id:
            return error_response(400, 'vendorId is required for delete.')
        if not vendor_id.startswith('v-'):
            return error_response(400, 'Invalid vendorId format')
        try:
            _get_table().delete_item(Key={'entityType': 'VENDOR', 'entityId': vendor_id})
            return response(200, {'deleted': vendor_id})
        except Exception as e:
            logger.error("Failed to delete vendor %s: %s", vendor_id, e)
            return error_response(500, 'Failed to delete vendor.')

    else:
        return error_response(400, f'Unknown action: {action}')


# ─── Customer handlers ────────────────────────────────────────────────────────

def handle_finance_customers_list(event):
    """GET /finance/customers — returns all CUSTOMER items."""
    guard = require_admin(event)
    if guard:
        return guard
    try:
        items = _query_by_type('CUSTOMER')
        return response(200, {'items': items})
    except Exception as e:
        logger.error("Failed to list customers: %s", e)
        return error_response(500, 'Failed to retrieve customers.')


def handle_finance_customers_mutation(event):
    """POST /finance/customers — action: create / update / delete."""
    guard = require_admin(event)
    if guard:
        return guard

    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return error_response(400, 'Invalid JSON body.')

    action = body.get('action', '').strip().lower()

    if action == 'create':
        customer_id = 'c-' + str(uuid.uuid4())
        customer_data = body.get('customer', {})
        item = {**customer_data}
        item['entityType'] = 'CUSTOMER'
        item['entityId']   = customer_id
        item['createdAt']  = datetime.now(timezone.utc).isoformat()
        try:
            _get_table().put_item(Item=item)
            return response(200, {'customerId': customer_id})
        except Exception as e:
            logger.error("Failed to create customer: %s", e)
            return error_response(500, 'Failed to create customer.')

    elif action == 'update':
        customer = body.get('customer', {})
        customer_id = customer.get('entityId', '')
        if not customer_id:
            return error_response(400, 'customer.entityId is required for update.')
        item = {**customer}
        item['entityType'] = 'CUSTOMER'
        if not item.get('createdAt'):
            item['createdAt'] = datetime.now(timezone.utc).isoformat()
        item['updatedAt'] = datetime.now(timezone.utc).isoformat()
        try:
            _get_table().put_item(Item=item)
            return response(200, {'customerId': customer_id})
        except Exception as e:
            logger.error("Failed to update customer %s: %s", customer_id, e)
            return error_response(500, 'Failed to update customer.')

    elif action == 'delete':
        customer_id = body.get('customerId', '')
        if not customer_id:
            return error_response(400, 'customerId is required for delete.')
        if not customer_id.startswith('c-'):
            return error_response(400, 'Invalid customerId format')
        try:
            _get_table().delete_item(Key={'entityType': 'CUSTOMER', 'entityId': customer_id})
            return response(200, {'deleted': customer_id})
        except Exception as e:
            logger.error("Failed to delete customer %s: %s", customer_id, e)
            return error_response(500, 'Failed to delete customer.')

    else:
        return error_response(400, f'Unknown action: {action}')


# ─── Settings handlers ────────────────────────────────────────────────────────

def handle_finance_settings_get(event):
    """GET /finance/settings — return SETTINGS/GLOBAL item or defaults."""
    guard = require_admin(event)
    if guard:
        return guard
    settings = _get_settings()
    return response(200, settings)


def handle_finance_settings_save(event):
    """POST /finance/settings — save full settings object as SETTINGS/GLOBAL."""
    guard = require_admin(event)
    if guard:
        return guard

    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return error_response(400, 'Invalid JSON body.')

    SETTINGS_KEYS = {
        'usdToNpr', 'inrToNpr', 'expiryWarningDays', 'paymentWarningDays',
        'defaultCurrency', 'wht_rate', 'margin_rate', 'vat_rate',
        'usd_to_npr', 'usd_to_inr', 'show_breakdown', 'taxAccounts'
    }
    numeric_keys = {'usdToNpr', 'inrToNpr', 'expiryWarningDays', 'paymentWarningDays',
                    'wht_rate', 'margin_rate', 'vat_rate', 'usd_to_npr', 'usd_to_inr'}
    cleaned = {'entityType': 'SETTINGS', 'entityId': 'GLOBAL'}
    for k in SETTINGS_KEYS:
        if k not in body:
            continue
        if k in numeric_keys:
            try:
                cleaned[k] = float(body[k])
            except (TypeError, ValueError):
                return error_response(400, f'Invalid value for {k}: must be numeric')
        else:
            cleaned[k] = body[k]

    try:
        _get_table().put_item(Item=cleaned)
        return response(200, {'saved': True})
    except Exception as e:
        logger.error("Failed to save settings: %s", e)
        return error_response(500, 'Failed to save settings.')


# ─── Alerts handler ───────────────────────────────────────────────────────────

def handle_finance_alerts(event):
    """GET /finance/alerts — compute alerts fresh from vendors + customers + settings."""
    guard = require_admin(event)
    if guard:
        return guard

    try:
        vendors   = _query_by_type('VENDOR')
        customers = _query_by_type('CUSTOMER')
        settings  = _get_settings()
        alerts    = _compute_alerts(vendors, customers, settings)
        return response(200, {'alerts': alerts})
    except Exception as e:
        logger.error("Failed to compute alerts: %s", e)
        return error_response(500, 'Failed to compute alerts.')


# ─── Invoice proof handlers ───────────────────────────────────────────────────

def handle_finance_invoice_proof_upload(event):
    """POST /finance/invoice-proof — return a presigned PUT URL for S3 upload."""
    guard = require_admin(event)
    if guard:
        return guard

    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return error_response(400, 'Invalid JSON body.')

    vendor_id  = body.get('vendorId', '').strip()
    invoice_id = body.get('invoiceId', '').strip()
    filename   = re.sub(r'[/\\]', '_', body.get('filename', 'proof').strip()) or 'proof'

    if not vendor_id or not invoice_id:
        return error_response(400, 'vendorId and invoiceId are required.')

    if not FINANCE_BUCKET:
        return error_response(500, 'FINANCE_BUCKET is not configured.')

    key = f'invoices/{vendor_id}/{invoice_id}/{filename}'
    try:
        url = _get_s3().generate_presigned_url(
            'put_object',
            Params={'Bucket': FINANCE_BUCKET, 'Key': key},
            ExpiresIn=300,
        )
        return response(200, {'uploadUrl': url, 'key': key})
    except Exception as e:
        logger.error("Failed to generate upload URL: %s", e)
        return error_response(500, 'Failed to generate upload URL.')


def handle_finance_invoice_proof_download(event):
    """GET /finance/invoice-proof?vendorId=...&invoiceId=... — return a presigned GET URL."""
    guard = require_admin(event)
    if guard:
        return guard

    params     = event.get('queryStringParameters') or {}
    vendor_id  = params.get('vendorId', '').strip()
    invoice_id = params.get('invoiceId', '').strip()

    if not vendor_id or not invoice_id:
        return error_response(400, 'vendorId and invoiceId are required.')

    if not FINANCE_BUCKET:
        return error_response(500, 'FINANCE_BUCKET is not configured.')

    prefix = f'invoices/{vendor_id}/{invoice_id}/'
    try:
        resp     = _get_s3().list_objects_v2(Bucket=FINANCE_BUCKET, Prefix=prefix, MaxKeys=1)
        contents = resp.get('Contents', [])
        if not contents:
            return error_response(404, 'Proof file not found.')
        key = contents[0]['Key']
        url = _get_s3().generate_presigned_url(
            'get_object',
            Params={'Bucket': FINANCE_BUCKET, 'Key': key},
            ExpiresIn=900,
        )
        return response(200, {'downloadUrl': url})
    except Exception as e:
        logger.error("Failed to generate download URL: %s", e)
        return error_response(500, 'Failed to generate download URL.')
