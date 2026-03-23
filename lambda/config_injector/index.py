"""Config Injector Lambda — CloudFormation Custom Resource.

On Create/Update:
1. Downloads frontend.zip from the code S3 bucket
2. Injects CONFIG values into index.html (replaces placeholder)
3. Uploads all frontend files to the portal S3 bucket
4. Invalidates CloudFront cache
5. Sends CloudFormation response
"""

import boto3
import json
import os
import zipfile
import tempfile
import time
import urllib.request
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client('s3')
cf = boto3.client('cloudfront')
cognito = boto3.client('cognito-idp')

MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
}


def send_response(event, status, reason='OK', data={}):
    body = json.dumps({
        'Status': status,
        'Reason': reason,
        'PhysicalResourceId': event.get('PhysicalResourceId', 'deploy-frontend'),
        'StackId': event['StackId'],
        'RequestId': event['RequestId'],
        'LogicalResourceId': event['LogicalResourceId'],
        'Data': data
    }).encode('utf-8')
    req = urllib.request.Request(
        url=event['ResponseURL'],
        data=body,
        method='PUT'
    )
    req.add_header('Content-Type', '')
    req.add_header('Content-Length', len(body))
    urllib.request.urlopen(req)


def get_mime_type(filename):
    ext = os.path.splitext(filename)[1].lower()
    return MIME_TYPES.get(ext, 'application/octet-stream')


def _empty_bucket(bucket_name):
    """Delete all object versions and delete markers so CF can remove the bucket."""
    paginator = s3.get_paginator('list_object_versions')
    try:
        delete_list = []
        for page in paginator.paginate(Bucket=bucket_name):
            for v in page.get('Versions', []):
                delete_list.append({'Key': v['Key'], 'VersionId': v['VersionId']})
            for m in page.get('DeleteMarkers', []):
                delete_list.append({'Key': m['Key'], 'VersionId': m['VersionId']})
        for i in range(0, len(delete_list), 1000):
            s3.delete_objects(
                Bucket=bucket_name,
                Delete={'Objects': delete_list[i:i+1000], 'Quiet': True}
            )
        logger.info("Emptied %d object versions from %s", len(delete_list), bucket_name)
    except s3.exceptions.NoSuchBucket:
        logger.info("Bucket %s already gone — skipping", bucket_name)
    except Exception as e:
        logger.warning("Failed to empty bucket %s: %s", bucket_name, e)
        raise


def handler(event, context):
    logger.info("Event: %s", json.dumps(event))

    try:
        if event['RequestType'] == 'Delete':
            props = event.get('ResourceProperties', {})
            portal_bucket = props.get('PortalBucket', '')
            if portal_bucket:
                logger.info("Delete — emptying bucket: %s", portal_bucket)
                _empty_bucket(portal_bucket)
            send_response(event, 'SUCCESS')
            return

        props = event['ResourceProperties']
        portal_bucket = props['PortalBucket']
        distribution_id = props['DistributionId']
        code_bucket = props['CodeBucket']
        frontend_key = props['FrontendS3Key']

        # Build CONFIG object to inject
        config_js = (
            f"const CONFIG = {{\n"
            f"  COGNITO_DOMAIN: '{props['CognitoDomain']}',\n"
            f"  CLIENT_ID: '{props['ClientId']}',\n"
            f"  REDIRECT_URI: '{props['RedirectUri']}',\n"
            f"  API_URL: '{props['ApiUrl']}',\n"
            f"  USER_POOL_ID: '{props['UserPoolId']}',\n"
            f"}};"
        )
        logger.info("CONFIG to inject:\n%s", config_js)

        # Download frontend zip
        with tempfile.TemporaryDirectory() as tmpdir:
            zip_path = os.path.join(tmpdir, 'frontend.zip')
            s3.download_file(code_bucket, frontend_key, zip_path)
            logger.info("Downloaded %s/%s", code_bucket, frontend_key)

            # Extract
            extract_dir = os.path.join(tmpdir, 'frontend')
            with zipfile.ZipFile(zip_path, 'r') as zf:
                zf.extractall(extract_dir)

            # Inject CONFIG into index.html
            index_path = os.path.join(extract_dir, 'index.html')
            if os.path.exists(index_path):
                with open(index_path, 'r', encoding='utf-8') as f:
                    html = f.read()

                # Replace the placeholder
                placeholder = 'const CONFIG = { /*__INJECT__*/ };'
                if placeholder in html:
                    html = html.replace(placeholder, config_js)
                    logger.info("CONFIG placeholder replaced successfully")
                else:
                    logger.warning("CONFIG placeholder not found in index.html — injecting at top of first <script>")
                    html = html.replace('<script>', f'<script>\n{config_js}\n', 1)

                with open(index_path, 'w', encoding='utf-8') as f:
                    f.write(html)

            # Upload all files to portal bucket
            file_count = 0
            for root, dirs, files in os.walk(extract_dir):
                for filename in files:
                    local_path = os.path.join(root, filename)
                    s3_key = os.path.relpath(local_path, extract_dir).replace('\\', '/')
                    content_type = get_mime_type(filename)

                    with open(local_path, 'rb') as f:
                        s3.put_object(
                            Bucket=portal_bucket,
                            Key=s3_key,
                            Body=f.read(),
                            ContentType=content_type,
                            CacheControl='max-age=0, no-cache, no-store, must-revalidate'
                        )
                    file_count += 1
                    logger.info("Uploaded %s (%s)", s3_key, content_type)

            logger.info("Uploaded %d files to %s", file_count, portal_bucket)

            # Invalidate CloudFront
            cf.create_invalidation(
                DistributionId=distribution_id,
                InvalidationBatch={
                    'Paths': {
                        'Quantity': 1,
                        'Items': ['/*']
                    },
                    'CallerReference': str(int(time.time()))
                }
            )
            logger.info("CloudFront invalidation created for %s", distribution_id)

        # Update Cognito App Client with real CloudFront URL
        # (CallbackURLs was set to placeholder 'https://localhost' in CF template
        #  to avoid EarlyValidation cross-reference errors)
        real_url = props['RedirectUri']  # e.g. https://d1234.cloudfront.net/index.html
        user_pool_id = props['UserPoolId']
        client_id = props['ClientId']

        # Get current client config to preserve existing settings
        current = cognito.describe_user_pool_client(
            UserPoolId=user_pool_id,
            ClientId=client_id
        )['UserPoolClient']

        cognito.update_user_pool_client(
            UserPoolId=user_pool_id,
            ClientId=client_id,
            ClientName=current['ClientName'],
            RefreshTokenValidity=current.get('RefreshTokenValidity', 7),
            AccessTokenValidity=current.get('AccessTokenValidity', 60),
            IdTokenValidity=current.get('IdTokenValidity', 60),
            TokenValidityUnits=current.get('TokenValidityUnits', {}),
            ExplicitAuthFlows=current.get('ExplicitAuthFlows', []),
            AllowedOAuthFlows=current.get('AllowedOAuthFlows', ['code']),
            AllowedOAuthScopes=current.get('AllowedOAuthScopes', ['email', 'openid']),
            AllowedOAuthFlowsUserPoolClient=True,
            SupportedIdentityProviders=current.get('SupportedIdentityProviders', ['COGNITO']),
            CallbackURLs=[real_url],
            LogoutURLs=[real_url],
            PreventUserExistenceErrors='ENABLED',
        )
        logger.info("Updated Cognito App Client %s with callback URL: %s", client_id, real_url)

        send_response(event, 'SUCCESS', 'Frontend deployed', {'FilesUploaded': str(file_count)})

    except Exception as e:
        logger.exception("Config Injector FAILED")
        send_response(event, 'FAILED', str(e))
