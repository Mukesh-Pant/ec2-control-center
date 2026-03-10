"""Shared utilities for EC2 Controller Lambda — CORS, errors, caller extraction."""

import json
import os
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

ALLOWED_ORIGIN = os.environ.get('ALLOWED_ORIGIN', '*')


def get_cors():
    """Return CORS headers dict."""
    return {
        'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'POST,GET,OPTIONS',
        'Content-Type': 'application/json',
    }


def get_caller(event):
    """Extract caller email from REST API Cognito authorizer claims."""
    try:
        claims = event['requestContext']['authorizer']['claims']
        return claims.get('email', claims.get('cognito:username', 'unknown'))
    except (KeyError, TypeError):
        return 'unknown'


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
