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

aws s3 cp "$TEMP_DIR/config-injector.zip" \
  "s3://${CODE_BUCKET}/lambda/config-injector-${ENVIRONMENT}.zip" \
  --region "$AWS_REGION" --quiet

aws s3 cp "$TEMP_DIR/frontend.zip" \
  "s3://${CODE_BUCKET}/frontend/frontend-${ENVIRONMENT}.zip" \
  --region "$AWS_REGION" --quiet

echo "    Uploaded 3 artifacts."

# ─── Step 5: Deploy CloudFormation stack ───
echo ""
echo "==> Deploying CloudFormation stack: $STACK_NAME"
echo "    This may take 8-12 minutes on first deploy..."
echo ""

aws cloudformation deploy \
  --template-file "$SCRIPT_DIR/cloudformation/central-stack.yaml" \
  --stack-name "$STACK_NAME" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    AdminEmail="$ADMIN_EMAIL" \
    CognitoDomainPrefix="$COGNITO_DOMAIN_PREFIX" \
    Environment="$ENVIRONMENT" \
    LambdaCodeS3Bucket="$CODE_BUCKET" \
    LambdaCodeVersion="$LAMBDA_VERSION" \
  --region "$AWS_REGION" \
  --no-fail-on-empty-changeset

# ─── Step 6: Show outputs ───
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
