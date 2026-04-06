"""Shared utilities for EC2 Controller Lambda — CORS, errors, caller extraction."""

import json
import os
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ALLOWED_ORIGIN = os.environ.get('ALLOWED_ORIGIN', 'http://localhost:3000')
ALLOWED_ORIGINS = [origin.strip() for origin in ALLOWED_ORIGIN.split(',') if origin.strip()]


def get_cors():
    """Return CORS headers dict."""
    allow_origin = ALLOWED_ORIGINS[0] if ALLOWED_ORIGINS else 'http://localhost:3000'
    return {
        'Access-Control-Allow-Origin': allow_origin,
        'Vary': 'Origin',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'POST,GET,DELETE,OPTIONS',
        'Content-Type': 'application/json',
    }


def get_caller(event):
    """Extract caller email from REST API Cognito authorizer claims."""
    try:
        claims = event['requestContext']['authorizer']['claims']
        return claims.get('email', claims.get('cognito:username', 'unknown'))
    except (KeyError, TypeError):
        return 'unknown'


def get_caller_groups(event):
    """Extract cognito:groups list from JWT claims.
    Handles both JSON-array encoding '["admins"]' and comma-separated 'admins,operators'.
    Returns [] if no groups claim present."""
    try:
        claims = event['requestContext']['authorizer']['claims']
        raw = claims.get('cognito:groups', '')
        if not raw:
            return []
        if raw.startswith('['):
            return json.loads(raw)
        return [g.strip() for g in raw.split(',') if g.strip()]
    except Exception:
        return []


def is_admin(event):
    """Return True if the caller is in the 'admins' Cognito group."""
    return 'admins' in get_caller_groups(event)


def require_admin(event):
    """Return a 403 error response if the caller is not an admin, else None."""
    if not is_admin(event):
        return error_response(403, 'Admin access required.')
    return None


def response(status_code, body):
    """Build an HTTP API response with CORS headers."""
    return {
        'statusCode': status_code,
        'headers': get_cors(),
        'body': json.dumps(body, default=str),
    }


def error_response(status_code, message):
    """Build an error response."""
    logger.error("Error %s: %s", status_code, message)
    return response(status_code, {'message': message})


def map_aws_error(e, region=''):
    """Map boto3 ClientError to appropriate HTTP error response."""
    code = getattr(e, 'response', {}).get('Error', {}).get('Code', '')
    msg = getattr(e, 'response', {}).get('Error', {}).get('Message', str(e))
    logger.error("AWS Error: %s - %s", code, msg)

    if code == 'IncorrectInstanceState':
        return error_response(409, 'Cannot change instance from its current state.')
    elif code == 'UnauthorizedOperation':
        return error_response(403, 'Lambda IAM role lacks permission for this operation.')
    elif code == 'InvalidInstanceID.NotFound':
        return error_response(404, f'Instance not found in region {region}')
    else:
        return error_response(500, 'Internal server error.')
