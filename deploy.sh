#!/bin/bash
# ═══════════════════════════════════════════════
# EC2 Control Portal v2 — One-Command Deployment
# ═══════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load config
if [ ! -f "$SCRIPT_DIR/deploy-config.env" ]; then
  echo "ERROR: deploy-config.env not found. Copy from deploy-config.env and fill in values."
  exit 1
fi
source "$SCRIPT_DIR/deploy-config.env"

# Validate required vars
for VAR in ADMIN_EMAIL COGNITO_DOMAIN_PREFIX ENVIRONMENT AWS_REGION; do
  if [ -z "${!VAR:-}" ]; then
    echo "ERROR: $VAR is not set in deploy-config.env"
    exit 1
  fi
done

# Get AWS Account ID
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region "$AWS_REGION")
echo "AWS Account: $AWS_ACCOUNT_ID"
echo "Region:      $AWS_REGION"
echo "Environment: $ENVIRONMENT"
echo ""

STACK_NAME="ec2-control-${ENVIRONMENT}"
CODE_BUCKET="ec2-control-code-${AWS_ACCOUNT_ID}-${AWS_REGION}"

# ─── Step 1: Create code bucket if needed ───
echo "==> Ensuring code bucket exists: $CODE_BUCKET"
if ! aws s3 ls "s3://${CODE_BUCKET}" --region "$AWS_REGION" 2>/dev/null; then
  aws s3 mb "s3://${CODE_BUCKET}" --region "$AWS_REGION"
  echo "    Created bucket: $CODE_BUCKET"
else
  echo "    Bucket already exists."
fi

# ─── Step 2: Package Lambda functions ───
echo ""
echo "==> Packaging Lambda functions..."

TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# EC2 Controller
echo "    Zipping ec2_controller..."
(cd "$SCRIPT_DIR/lambda/ec2_controller" && zip -qr "$TEMP_DIR/ec2-controller.zip" .)

# Idle Checker (M4) — includes ec2_controller modules for accounts.py + audit.py
echo "    Zipping idle_checker..."
(cd "$SCRIPT_DIR/lambda/idle_checker" && \
  cp "$SCRIPT_DIR/lambda/ec2_controller/accounts.py" . && \
  cp "$SCRIPT_DIR/lambda/ec2_controller/audit.py" . && \
  cp "$SCRIPT_DIR/lambda/ec2_controller/utils.py" . && \
  zip -qr "$TEMP_DIR/idle-checker.zip" . && \
  rm -f accounts.py audit.py utils.py)

# Config Injector
echo "    Zipping config_injector..."
(cd "$SCRIPT_DIR/lambda/config_injector" && zip -qr "$TEMP_DIR/config-injector.zip" .)

# ─── Step 3: Package frontend ───
echo "    Zipping frontend..."
(cd "$SCRIPT_DIR/frontend" && zip -qr "$TEMP_DIR/frontend.zip" .)

# ─── Step 4: Upload to S3 ───
echo ""
echo "==> Uploading artifacts to S3..."
LAMBDA_VERSION=$(date +%s)

aws s3 cp "$TEMP_DIR/ec2-controller.zip" \
  "s3://${CODE_BUCKET}/lambda/ec2-controller-${ENVIRONMENT}-${LAMBDA_VERSION}.zip" \
  --region "$AWS_REGION" --quiet

aws s3 cp "$TEMP_DIR/idle-checker.zip" \
  "s3://${CODE_BUCKET}/lambda/idle-checker-${ENVIRONMENT}-${LAMBDA_VERSION}.zip" \
  --region "$AWS_REGION" --quiet

aws s3 cp "$TEMP_DIR/config-injector.zip" \
  "s3://${CODE_BUCKET}/lambda/config-injector-${ENVIRONMENT}.zip" \
  --region "$AWS_REGION" --quiet

aws s3 cp "$TEMP_DIR/frontend.zip" \
  "s3://${CODE_BUCKET}/frontend/frontend-${ENVIRONMENT}.zip" \
  --region "$AWS_REGION" --quiet

echo "    Uploaded 4 artifacts."

# ─── Step 5: Deploy CloudFormation stack ───
echo ""
echo "==> Deploying CloudFormation stack: $STACK_NAME"
echo "    This may take 8-12 minutes on first deploy..."
echo ""

# Build parameter overrides — NotificationEmail is optional
PARAM_OVERRIDES=(
  "AdminEmail=${ADMIN_EMAIL}"
  "CognitoDomainPrefix=${COGNITO_DOMAIN_PREFIX}"
  "Environment=${ENVIRONMENT}"
  "LambdaCodeS3Bucket=${CODE_BUCKET}"
  "LambdaCodeVersion=${LAMBDA_VERSION}"
)

if [ -n "${NOTIFICATION_EMAIL:-}" ]; then
  PARAM_OVERRIDES+=("NotificationEmail=${NOTIFICATION_EMAIL}")
fi

aws cloudformation deploy \
  --template-file "$SCRIPT_DIR/cloudformation/central-stack.yaml" \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides "${PARAM_OVERRIDES[@]}" \
  --region "$AWS_REGION" \
  --no-fail-on-empty-changeset

# ─── Step 6: Flush REST API deployment snapshot ───
# Forces a fresh deployment snapshot so all new methods (with Cognito auth) are properly captured.
# Without this, newly added methods can fail with "Invalid key=value pair" on first request.
echo ""
echo "==> Flushing REST API deployment snapshot..."
REST_API_ID=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`RestApiId`].OutputValue' \
  --output text \
  --region "$AWS_REGION" 2>/dev/null || echo "")

if [ -n "$REST_API_ID" ] && [ "$REST_API_ID" != "None" ]; then
  aws apigateway create-deployment \
    --rest-api-id "$REST_API_ID" \
    --stage-name prod \
    --description "Post-deploy flush ${LAMBDA_VERSION}" \
    --region "$AWS_REGION" --output none
  echo "    REST API deployment flushed (ID: $REST_API_ID)"
else
  echo "    Skipped (RestApiId output not found in stack)"
fi

# ─── Step 7: Show outputs ───
echo ""
echo "═══════════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE"
echo "═══════════════════════════════════════════════"
echo ""

aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
  --output table \
  --region "$AWS_REGION"

PORTAL_URL=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --query 'Stacks[0].Outputs[?OutputKey==`PortalURL`].OutputValue' \
  --output text \
  --region "$AWS_REGION")

echo ""
echo "Portal URL: $PORTAL_URL"
echo ""
echo "The Config Injector has automatically:"
echo "  - Injected CONFIG values into index.html"
echo "  - Uploaded all frontend files to S3"
echo "  - Invalidated CloudFront cache"
echo ""
echo "Your portal is LIVE. Open the URL above in a browser."
echo "Check your email ($ADMIN_EMAIL) for the Cognito login credentials."
echo ""
