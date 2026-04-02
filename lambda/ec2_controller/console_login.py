"""Console Login — AWS Federation URL generator for browser-based console access.

Generates a time-limited AWS Console signin URL by:
  1. AssumeRole into the target member account (existing cross-account role)
  2. Calling the AWS Signin Federation API to exchange credentials for a SigninToken
  3. Building a signed console URL the browser can open directly

The returned loginUrl is single-use (SigninToken valid ~15 min to initiate).
Console session lasts 1 hour. Role chaining (Lambda role → member role) caps
DurationSeconds at 3600 regardless of MaxSessionDuration on the target role.
"""

import boto3
import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from utils import response, error_response, get_caller, get_caller_groups, is_admin
from accounts import get_all_accounts, get_allowed_account_ids, CENTRAL_ACCOUNT_ID

logger = logging.getLogger()

FEDERATION_ENDPOINT = 'https://signin.aws.amazon.com/federation'


def handle_console_login(event):
    # ── 1. Parse body ────────────────────────────────────────────────────────
    try:
        body = json.loads(event.get('body') or '{}')
    except json.JSONDecodeError:
        return error_response(400, 'Invalid JSON body')

    account_id = body.get('accountId', '').strip()
    region     = body.get('region', 'ap-south-1').strip()
    if not account_id:
        return error_response(400, 'accountId is required')

    # ── 2. RBAC — admins and operators only; viewers blocked ─────────────────
    groups = get_caller_groups(event)
    if not groups:
        return error_response(403, 'Your account is pending approval. Contact an administrator.')
    is_viewer_only = (
        'viewers' in groups
        and 'admins' not in groups
        and 'operators' not in groups
    )
    if is_viewer_only:
        return error_response(403, 'Console login is not available for viewers.')

    # ── 3. Account access check for non-admins ───────────────────────────────
    caller = get_caller(event)
    if not is_admin(event):
        allowed = get_allowed_account_ids(caller)
        if account_id not in allowed:
            return error_response(403, 'Account not assigned to your user.')

    # ── 4. Fetch account record ──────────────────────────────────────────────
    all_accounts = get_all_accounts()
    account = next(
        (a for a in all_accounts if a['accountId'] == account_id and a.get('enabled', False)),
        None
    )
    if not account:
        return error_response(404, 'Account not found or not enabled.')

    role_arn = account.get('roleArn', '')
    if role_arn == 'LOCAL':
        return error_response(400, 'Console login via federation is not supported for the central account.')

    console_role_arn = account.get('consoleRoleArn', '').strip()
    if not console_role_arn:
        return error_response(400, 'Console login role not configured for this account. Add the Console Login Role ARN in the Accounts settings.')

    # ── 5. AssumeRole with role-based session policy ──────────────────────────
    caller_is_admin = is_admin(event)
    email_prefix    = caller.split('@')[0][:32].replace('+', '-')
    session_name    = f'ec2ctrl-{"admin" if caller_is_admin else "operator"}-{email_prefix}'

    assume_kwargs = {
        'RoleArn':         console_role_arn,
        'RoleSessionName': session_name,
        'DurationSeconds': 3600,
        'ExternalId':      f'ec2-control-{CENTRAL_ACCOUNT_ID}',
    }
    if not caller_is_admin:
        assume_kwargs['PolicyArns'] = [
            {'arn': 'arn:aws:iam::aws:policy/job-function/ViewOnlyAccess'}
        ]

    sts = boto3.client('sts')
    try:
        assumed = sts.assume_role(**assume_kwargs)
    except Exception as e:
        logger.error("AssumeRole failed for %s: %s", account_id, e)
        return error_response(500, 'Failed to assume console role. Check the Console Login Role ARN and its trust policy.')

    creds = assumed['Credentials']

    # ── 6. Exchange credentials for a federation SigninToken ─────────────────
    session_json = json.dumps({
        'sessionId':    creds['AccessKeyId'],
        'sessionKey':   creds['SecretAccessKey'],
        'sessionToken': creds['SessionToken']
    })
    token_url = (
        FEDERATION_ENDPOINT
        + '?Action=getSigninToken'
        + '&SessionDuration=3540'    # 59 min: must be < credential remaining lifetime (3600s)
        + '&Session=' + urllib.parse.quote(session_json, safe='')
    )
    try:
        with urllib.request.urlopen(token_url, timeout=10) as resp_obj:
            signin_token = json.loads(resp_obj.read())['SigninToken']
    except urllib.error.HTTPError as he:
        body = he.read().decode('utf-8', errors='replace')
        logger.error("Federation HTTP %s: %s", he.code, body)
        return error_response(500, 'Failed to get console signin token.')
    except Exception as e:
        logger.error("Federation token request failed: %s", e)
        return error_response(500, 'Failed to get console signin token.')

    # ── 7. Build the console login URL ───────────────────────────────────────
    destination = 'https://{}.console.aws.amazon.com/console/home?region={}'.format(region, region)
    login_url = (
        FEDERATION_ENDPOINT
        + '?Action=login'
        + '&Issuer=solobil.com'
        + '&Destination=' + urllib.parse.quote(destination)
        + '&SigninToken=' + signin_token
    )

    account_name = account.get('accountName') or account_id
    logger.info("Console login URL generated for account=%s by caller=%s", account_id, caller)

    return response(200, {
        'loginUrl':    login_url,
        'accountId':   account_id,
        'accountName': account_name,
    })
