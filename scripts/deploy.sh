#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-airco-tracker-rg}"
IMAGE_TAG="${IMAGE_TAG:-$(git -C "$PROJECT_DIR" rev-parse --short=12 HEAD 2>/dev/null || date -u +manual-%Y%m%d%H%M%S)}"

command -v az >/dev/null || { echo "Azure CLI (az) is required." >&2; exit 1; }
command -v node >/dev/null || { echo "Node.js is required." >&2; exit 1; }
az account show >/dev/null || { echo "Run 'az login' first." >&2; exit 1; }

first_resource_name() {
  az resource list \
    --resource-group "$RESOURCE_GROUP" \
    --resource-type "$1" \
    --query "[0].name" \
    --output tsv
}

runtime_identity_name() {
  az identity list \
    --resource-group "$RESOURCE_GROUP" \
    --query "[?name!='airco-github-deployer']|[0].name" \
    --output tsv
}

require_value() {
  if [ -z "$2" ]; then
    echo "Could not determine $1 in resource group $RESOURCE_GROUP." >&2
    exit 1
  fi
}

ACR_NAME="${ACR_NAME:-$(first_resource_name Microsoft.ContainerRegistry/registries)}"
require_value ACR_NAME "$ACR_NAME"
ACR_LOGIN_SERVER="${ACR_LOGIN_SERVER:-$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query loginServer --output tsv)}"
require_value ACR_LOGIN_SERVER "$ACR_LOGIN_SERVER"
ENVIRONMENT_NAME="${CONTAINER_ENVIRONMENT_NAME:-$(first_resource_name Microsoft.App/managedEnvironments)}"
require_value CONTAINER_ENVIRONMENT_NAME "$ENVIRONMENT_NAME"
IDENTITY_NAME="${IDENTITY_NAME:-$(runtime_identity_name)}"
require_value IDENTITY_NAME "$IDENTITY_NAME"
STORAGE_NAME="${STORAGE_ACCOUNT_NAME:-$(first_resource_name Microsoft.Storage/storageAccounts)}"
require_value STORAGE_ACCOUNT_NAME "$STORAGE_NAME"
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
