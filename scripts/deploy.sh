#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-airco-tracker-rg}"
IMAGE_TAG="${IMAGE_TAG:-$(git -C "$PROJECT_DIR" rev-parse --short=12 HEAD 2>/dev/null || date -u +manual-%Y%m%d%H%M%S)}"

command -v az >/dev/null || { echo "Azure CLI (az) is required." >&2; exit 1; }
command -v node >/dev/null || { echo "Node.js is required." >&2; exit 1; }
az account show >/dev/null || { echo "Run 'az login' first." >&2; exit 1; }

single_resource_name() {
  local env_var="$1"
  local resource_type="$2"
  local configured="${!env_var:-}"
  if [ -n "$configured" ]; then
    echo "$configured"
    return
  fi

  local names
  names="$(az resource list \
    --resource-group "$RESOURCE_GROUP" \
    --resource-type "$resource_type" \
    --query "[].name" \
    --output tsv)"
  local count
  count="$(printf '%s\n' "$names" | awk 'NF { count++ } END { print count + 0 }')"
  if [ "$count" != "1" ]; then
    echo "Expected exactly one $resource_type in $RESOURCE_GROUP; found $count. Set $env_var explicitly." >&2
    return 1
  fi
  printf '%s\n' "$names" | awk 'NF { print; exit }'
}

single_resource_id() {
  local env_var="$1"
  local resource_type="$2"
  local configured="${!env_var:-}"
  if [ -n "$configured" ]; then
    echo "$configured"
    return
  fi

  local ids
  ids="$(az resource list \
    --resource-group "$RESOURCE_GROUP" \
    --resource-type "$resource_type" \
    --query "[].id" \
    --output tsv)"
  local count
  count="$(printf '%s\n' "$ids" | awk 'NF { count++ } END { print count + 0 }')"
  if [ "$count" != "1" ]; then
    echo "Expected exactly one $resource_type in $RESOURCE_GROUP; found $count. Set $env_var explicitly." >&2
    return 1
  fi
  printf '%s\n' "$ids" | awk 'NF { print; exit }'
}

runtime_identity_name() {
  if [ -n "${IDENTITY_NAME:-}" ]; then
    echo "$IDENTITY_NAME"
    return
  fi

  local names
  names="$(az identity list \
    --resource-group "$RESOURCE_GROUP" \
    --query "[?name!='airco-github-deployer'].name" \
    --output tsv)"
  local count
  count="$(printf '%s\n' "$names" | awk 'NF { count++ } END { print count + 0 }')"
  if [ "$count" != "1" ]; then
    echo "Expected exactly one runtime managed identity in $RESOURCE_GROUP; found $count. Set IDENTITY_NAME explicitly." >&2
    return 1
  fi
  printf '%s\n' "$names" | awk 'NF { print; exit }'
}

require_value() {
  if [ -z "$2" ]; then
    echo "Could not determine $1 in resource group $RESOURCE_GROUP." >&2
    exit 1
  fi
}

ACR_NAME="$(single_resource_name ACR_NAME Microsoft.ContainerRegistry/registries)"
require_value ACR_NAME "$ACR_NAME"
ACR_LOGIN_SERVER="${ACR_LOGIN_SERVER:-$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query loginServer --output tsv)}"
require_value ACR_LOGIN_SERVER "$ACR_LOGIN_SERVER"
ENVIRONMENT_NAME="$(single_resource_name CONTAINER_ENVIRONMENT_NAME Microsoft.App/managedEnvironments)"
require_value CONTAINER_ENVIRONMENT_NAME "$ENVIRONMENT_NAME"
IDENTITY_NAME="$(runtime_identity_name)"
require_value IDENTITY_NAME "$IDENTITY_NAME"
STORAGE_NAME="$(single_resource_name STORAGE_ACCOUNT_NAME Microsoft.Storage/storageAccounts)"
require_value STORAGE_ACCOUNT_NAME "$STORAGE_NAME"
COMMUNICATION_SERVICE_NAME="$(single_resource_name COMMUNICATION_SERVICE_NAME Microsoft.Communication/CommunicationServices)"
require_value COMMUNICATION_SERVICE_NAME "$COMMUNICATION_SERVICE_NAME"
EMAIL_DOMAIN_ID="$(single_resource_id EMAIL_DOMAIN_ID Microsoft.Communication/EmailServices/Domains)"
require_value EMAIL_DOMAIN_ID "$EMAIL_DOMAIN_ID"
MAIL_FROM_DOMAIN="$(
  az resource show \
    --ids "$EMAIL_DOMAIN_ID" \
    --api-version 2023-04-01-preview \
    --query properties.mailFromSenderDomain \
    --output tsv
)"
require_value MAIL_FROM_DOMAIN "$MAIL_FROM_DOMAIN"
AUTH_EMAIL_FROM="${AUTH_EMAIL_FROM:-DoNotReply@$MAIL_FROM_DOMAIN}"
require_value AUTH_EMAIL_FROM "$AUTH_EMAIL_FROM"
APP_BASE_URL="${APP_BASE_URL:-https://airco-tracker.eu}"
STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-}"
STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-}"
STRIPE_PRICE_WEEKLY_BASIC="${STRIPE_PRICE_WEEKLY_BASIC:-}"
STRIPE_PRICE_WEEKLY_PRIORITY="${STRIPE_PRICE_WEEKLY_PRIORITY:-}"
STRIPE_PRICE_MONTHLY_BASIC="${STRIPE_PRICE_MONTHLY_BASIC:-}"
STRIPE_PRICE_MONTHLY_PRIORITY="${STRIPE_PRICE_MONTHLY_PRIORITY:-}"
IMAGE="$ACR_LOGIN_SERVER/airco-tracking-web:$IMAGE_TAG"

az acr build \
  --registry "$ACR_NAME" \
  --image "airco-tracking-web:$IMAGE_TAG" \
  "$PROJECT_DIR"

az deployment group create \
  --name "airco-web-${IMAGE_TAG:0:12}" \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$PROJECT_DIR/infra/app.bicep" \
  --parameters \
    containerImage="$IMAGE" \
    containerEnvironmentName="$ENVIRONMENT_NAME" \
    acrName="$ACR_NAME" \
    identityName="$IDENTITY_NAME" \
    storageAccountName="$STORAGE_NAME" \
    communicationServiceName="$COMMUNICATION_SERVICE_NAME" \
    authEmailFrom="$AUTH_EMAIL_FROM" \
    appBaseUrl="$APP_BASE_URL" \
    stripeSecretKey="$STRIPE_SECRET_KEY" \
    stripeWebhookSecret="$STRIPE_WEBHOOK_SECRET" \
    stripePriceWeeklyBasic="$STRIPE_PRICE_WEEKLY_BASIC" \
    stripePriceWeeklyPriority="$STRIPE_PRICE_WEEKLY_PRIORITY" \
    stripePriceMonthlyBasic="$STRIPE_PRICE_MONTHLY_BASIC" \
    stripePriceMonthlyPriority="$STRIPE_PRICE_MONTHLY_PRIORITY" \
  --output none

APP_URL="$(
  az containerapp show \
    --name airco-tracking-web \
    --resource-group "$RESOURCE_GROUP" \
    --query 'properties.configuration.ingress.fqdn' \
    --output tsv
)"
APP_URL="https://$APP_URL"

node "$PROJECT_DIR/scripts/verify-deployment.mjs" "$APP_URL"
echo "Deployed $IMAGE"
echo "Application URL: $APP_URL"
