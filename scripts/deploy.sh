#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-airco-tracker-rg}"
PREFIX="${AZURE_PREFIX:-aircontrack}"
APP_NAME="${AZURE_WEB_APP_NAME:-airco-tracking-web}"
RETENTION_JOB_NAME="${AZURE_WEB_RETENTION_JOB_NAME:-airco-web-retention-cleanup}"
ACS_EMAIL_DOMAIN_NAME="${ACS_EMAIL_DOMAIN_NAME:-AzureManagedDomain}"
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

email_domain_id() {
  if [ -n "${EMAIL_DOMAIN_ID:-}" ]; then
    printf '%s\n' "$EMAIL_DOMAIN_ID"
    return
  fi
  if [[ ! "$ACS_EMAIL_DOMAIN_NAME" =~ ^[A-Za-z0-9.-]+$ ]]; then
    echo "ACS_EMAIL_DOMAIN_NAME contains unsupported characters." >&2
    return 1
  fi

  local ids
  ids="$(az resource list \
    --resource-group "$RESOURCE_GROUP" \
    --resource-type Microsoft.Communication/EmailServices/Domains \
    --query "[?ends_with(name, '/${ACS_EMAIL_DOMAIN_NAME}')].id" \
    --output tsv)"
  local count
  count="$(printf '%s\n' "$ids" | awk 'NF { count++ } END { print count + 0 }')"
  if [ "$count" != "1" ]; then
    echo "Expected exactly one ACS Email Domain named $ACS_EMAIL_DOMAIN_NAME in $RESOURCE_GROUP; found $count. Set ACS_EMAIL_DOMAIN_NAME or EMAIL_DOMAIN_ID explicitly." >&2
    return 1
  fi
  printf '%s\n' "$ids" | awk 'NF { print; exit }'
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
WEB_IDENTITY_NAME="${WEB_IDENTITY_NAME:-${PREFIX}-identity}"
require_value WEB_IDENTITY_NAME "$WEB_IDENTITY_NAME"
az identity show --name "$WEB_IDENTITY_NAME" --resource-group "$RESOURCE_GROUP" --output none
RETENTION_IDENTITY_NAME="${RETENTION_IDENTITY_NAME:-${PREFIX}-web-retention}"
require_value RETENTION_IDENTITY_NAME "$RETENTION_IDENTITY_NAME"
az identity show --name "$RETENTION_IDENTITY_NAME" --resource-group "$RESOURCE_GROUP" --output none
STORAGE_NAME="$(single_resource_name STORAGE_ACCOUNT_NAME Microsoft.Storage/storageAccounts)"
require_value STORAGE_ACCOUNT_NAME "$STORAGE_NAME"
KEY_VAULT_NAME="$(single_resource_name KEY_VAULT_NAME Microsoft.KeyVault/vaults)"
require_value KEY_VAULT_NAME "$KEY_VAULT_NAME"
COMMUNICATION_SERVICE_NAME="$(single_resource_name COMMUNICATION_SERVICE_NAME Microsoft.Communication/CommunicationServices)"
require_value COMMUNICATION_SERVICE_NAME "$COMMUNICATION_SERVICE_NAME"
EMAIL_DOMAIN_ID="$(email_domain_id)"
require_value EMAIL_DOMAIN_ID "$EMAIL_DOMAIN_ID"
MAIL_FROM_DOMAIN="$(
  az resource show \
    --ids "$EMAIL_DOMAIN_ID" \
    --query properties.fromSenderDomain \
    --output tsv
)"
require_value MAIL_FROM_DOMAIN "$MAIL_FROM_DOMAIN"
AUTH_EMAIL_FROM="${AUTH_EMAIL_FROM:-DoNotReply@$MAIL_FROM_DOMAIN}"
require_value AUTH_EMAIL_FROM "$AUTH_EMAIL_FROM"
AUTH_EMAIL_REPLY_TO="${AUTH_EMAIL_REPLY_TO:-support@$MAIL_FROM_DOMAIN}"
require_value AUTH_EMAIL_REPLY_TO "$AUTH_EMAIL_REPLY_TO"
APP_BASE_URL="${APP_BASE_URL:-https://airco-tracker.eu}"
AUTH_EMAIL_CODE_BUDGET_PER_HOUR="${AUTH_EMAIL_CODE_BUDGET_PER_HOUR:-5}"
AUTH_IP_CODE_BUDGET_PER_HOUR="${AUTH_IP_CODE_BUDGET_PER_HOUR:-20}"
AUTH_GLOBAL_CODE_BUDGET_PER_HOUR="${AUTH_GLOBAL_CODE_BUDGET_PER_HOUR:-1000}"
AUTH_CODE_HMAC_PEPPER_VERSION="${AUTH_CODE_HMAC_PEPPER_VERSION:-v1}"
STRIPE_SECRET_KEY="${STRIPE_SECRET_KEY:-}"
STRIPE_WEBHOOK_SECRET="${STRIPE_WEBHOOK_SECRET:-}"
STRIPE_PRICE_ALERTS_PASS="${STRIPE_PRICE_ALERTS_PASS:-}"
STRIPE_PRICE_RADAR_PASS="${STRIPE_PRICE_RADAR_PASS:-}"
STRIPE_PRICE_RADAR_UPGRADE="${STRIPE_PRICE_RADAR_UPGRADE:-}"
LEGAL_OPERATOR_NAME="${LEGAL_OPERATOR_NAME:-}"
LEGAL_OPERATOR_ADDRESS="${LEGAL_OPERATOR_ADDRESS:-}"
LEGAL_PUBLICATION_DIRECTOR="${LEGAL_PUBLICATION_DIRECTOR:-}"
LEGAL_HOST_NAME="${LEGAL_HOST_NAME:-}"
LEGAL_HOST_ADDRESS="${LEGAL_HOST_ADDRESS:-}"
LEGAL_HOST_PHONE="${LEGAL_HOST_PHONE:-}"
LEGAL_CONTACT_EMAIL="${LEGAL_CONTACT_EMAIL:-}"
LEGAL_CONTACT_PHONE="${LEGAL_CONTACT_PHONE:-}"
LEGAL_PRIVACY_EMAIL="${LEGAL_PRIVACY_EMAIL:-}"
LEGAL_WITHDRAWAL_EMAIL="${LEGAL_WITHDRAWAL_EMAIL:-}"
LEGAL_FR_MEDIATOR_NAME="${LEGAL_FR_MEDIATOR_NAME:-}"
LEGAL_FR_MEDIATOR_ADDRESS="${LEGAL_FR_MEDIATOR_ADDRESS:-}"
LEGAL_FR_MEDIATOR_URL="${LEGAL_FR_MEDIATOR_URL:-}"
LEGAL_BUSINESS_REGISTRATION_STATUS="${LEGAL_BUSINESS_REGISTRATION_STATUS:-}"
LEGAL_BUSINESS_REGISTRATION_LEGAL_CONFIRMATION="${LEGAL_BUSINESS_REGISTRATION_LEGAL_CONFIRMATION:-false}"
LEGAL_KVK_NUMBER="${LEGAL_KVK_NUMBER:-}"
LEGAL_VAT_STATUS="${LEGAL_VAT_STATUS:-}"
LEGAL_VAT_ID="${LEGAL_VAT_ID:-}"
LEGAL_PRODUCTION_READY="${LEGAL_PRODUCTION_READY:-false}"
LEGAL_RECORD_RETENTION_YEARS="${LEGAL_RECORD_RETENTION_YEARS:-7}"
LEGAL_RECORD_RETENTION_BASIS_CONFIRMED="${LEGAL_RECORD_RETENTION_BASIS_CONFIRMED:-false}"
require_value STRIPE_SECRET_KEY "$STRIPE_SECRET_KEY"
require_value STRIPE_WEBHOOK_SECRET "$STRIPE_WEBHOOK_SECRET"
require_value STRIPE_PRICE_ALERTS_PASS "$STRIPE_PRICE_ALERTS_PASS"
require_value STRIPE_PRICE_RADAR_PASS "$STRIPE_PRICE_RADAR_PASS"
require_value STRIPE_PRICE_RADAR_UPGRADE "$STRIPE_PRICE_RADAR_UPGRADE"
IMAGE="$ACR_LOGIN_SERVER/airco-tracking-web:$IMAGE_TAG"

PREVIOUS_REVISION=""
PREVIOUS_RETENTION_IMAGE=""
RETENTION_JOB_PREEXISTED=false
CANDIDATE_REVISION=""
if az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --output none 2>/dev/null; then
  # JMESPath numeric literals use backticks, not shell command substitution.
  # shellcheck disable=SC2016
  PREVIOUS_REVISION="$(
    az containerapp show \
      --name "$APP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --query 'properties.configuration.ingress.traffic[?weight == `100`].revisionName | [0]' \
      --output tsv
  )"
  if [[ -z "$PREVIOUS_REVISION" ]]; then
    PREVIOUS_REVISION="$(
      az containerapp show \
        --name "$APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --query properties.latestReadyRevisionName \
        --output tsv
    )"
  fi
  require_value PREVIOUS_REVISION "$PREVIOUS_REVISION"
fi
if az containerapp job show --name "$RETENTION_JOB_NAME" --resource-group "$RESOURCE_GROUP" --output none 2>/dev/null; then
  RETENTION_JOB_PREEXISTED=true
  PREVIOUS_RETENTION_IMAGE="$(
    az containerapp job show \
      --name "$RETENTION_JOB_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --query 'properties.template.containers[0].image' \
      --output tsv
  )"
  require_value PREVIOUS_RETENTION_IMAGE "$PREVIOUS_RETENTION_IMAGE"
fi

DEPLOYMENT_STARTED=false

start_and_verify_job() {
  local job_name="$1"
  local timeout_seconds="$2"
  local execution_name
  execution_name="$(
    az containerapp job start \
      --name "$job_name" \
      --resource-group "$RESOURCE_GROUP" \
      --query name \
      --output tsv
  )"
  if [[ -z "$execution_name" ]]; then
    echo "Failed to start verification execution for $job_name." >&2
    return 1
  fi
  echo "Verification execution: $job_name / $execution_name"
  local deadline=$(( $(date +%s) + timeout_seconds ))
  while true; do
    local status
    status="$(
      az containerapp job execution show \
        --name "$job_name" \
        --resource-group "$RESOURCE_GROUP" \
        --job-execution-name "$execution_name" \
        --query properties.status \
        --output tsv 2>/dev/null || true
    )"
    if [[ "$status" == "Succeeded" ]]; then
      echo "$job_name verification succeeded."
      return 0
    fi
    if [[ "$status" == "Failed" ]]; then
      echo "$job_name verification failed. View its Container Apps execution logs for details." >&2
      return 1
    fi
    if [[ "$(date +%s)" -ge "$deadline" ]]; then
      echo "$job_name verification timed out (status: ${status:-unknown})." >&2
      return 1
    fi
    sleep 10
  done
}

rollback_web() {
  local exit_code=$?
  local previous_restored=false
  trap - EXIT
  set +e
  if [[ "$DEPLOYMENT_STARTED" == "true" && -n "$PREVIOUS_REVISION" ]]; then
    echo "Deployment failed; reactivating $PREVIOUS_REVISION and restoring 100% traffic." >&2
    if az containerapp revision activate \
        --name "$APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --revision "$PREVIOUS_REVISION" \
        --output none \
      && az containerapp ingress traffic set \
        --name "$APP_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --revision-weight "$PREVIOUS_REVISION=100" \
        --output none; then
      previous_restored=true
      previous_fqdn="$(
        az containerapp revision show \
          --name "$APP_NAME" \
          --resource-group "$RESOURCE_GROUP" \
          --revision "$PREVIOUS_REVISION" \
          --query properties.fqdn \
          --output tsv
      )"
      if [[ -n "$previous_fqdn" ]]; then
        node "$PROJECT_DIR/scripts/verify-deployment.mjs" "https://$previous_fqdn" || true
      fi
    else
      echo "Could not restore the previous revision; leaving the candidate active to avoid an outage." >&2
    fi
  fi
  if [[ "$DEPLOYMENT_STARTED" == "true" \
    && -n "$CANDIDATE_REVISION" \
    && "$CANDIDATE_REVISION" != "$PREVIOUS_REVISION" \
    && ( -z "$PREVIOUS_REVISION" || "$previous_restored" == "true" ) ]]; then
    echo "Deactivating failed candidate revision $CANDIDATE_REVISION." >&2
    az containerapp revision deactivate \
      --name "$APP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --revision "$CANDIDATE_REVISION" \
      --output none
  fi
  if [[ "$DEPLOYMENT_STARTED" == "true" ]]; then
    if [[ "$RETENTION_JOB_PREEXISTED" == "true" && -n "$PREVIOUS_RETENTION_IMAGE" ]]; then
      echo "Restoring $RETENTION_JOB_NAME to $PREVIOUS_RETENTION_IMAGE." >&2
      az containerapp job update \
        --name "$RETENTION_JOB_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --image "$PREVIOUS_RETENTION_IMAGE" \
        --output none
    elif az containerapp job show --name "$RETENTION_JOB_NAME" --resource-group "$RESOURCE_GROUP" --output none 2>/dev/null; then
      echo "Removing newly created, unverified cleanup job $RETENTION_JOB_NAME." >&2
      az containerapp job delete \
        --name "$RETENTION_JOB_NAME" \
        --resource-group "$RESOURCE_GROUP" \
        --yes \
        --output none
    fi
  fi
  exit "$exit_code"
}
trap rollback_web EXIT

az acr build \
  --registry "$ACR_NAME" \
  --image "airco-tracking-web:$IMAGE_TAG" \
  "$PROJECT_DIR"

DEPLOYMENT_STARTED=true
az deployment group create \
  --name "airco-web-${IMAGE_TAG:0:12}" \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$PROJECT_DIR/infra/app.bicep" \
  --parameters \
    containerImage="$IMAGE" \
    appName="$APP_NAME" \
    stableRevisionName="$PREVIOUS_REVISION" \
    containerEnvironmentName="$ENVIRONMENT_NAME" \
    acrName="$ACR_NAME" \
    webIdentityName="$WEB_IDENTITY_NAME" \
    retentionIdentityName="$RETENTION_IDENTITY_NAME" \
    retentionCleanupJobName="$RETENTION_JOB_NAME" \
    storageAccountName="$STORAGE_NAME" \
    keyVaultName="$KEY_VAULT_NAME" \
    communicationServiceName="$COMMUNICATION_SERVICE_NAME" \
    authEmailFrom="$AUTH_EMAIL_FROM" \
    authEmailReplyTo="$AUTH_EMAIL_REPLY_TO" \
    authEmailCodeBudgetPerHour="$AUTH_EMAIL_CODE_BUDGET_PER_HOUR" \
    authIpCodeBudgetPerHour="$AUTH_IP_CODE_BUDGET_PER_HOUR" \
    authGlobalCodeBudgetPerHour="$AUTH_GLOBAL_CODE_BUDGET_PER_HOUR" \
    authCodeHmacPepperVersion="$AUTH_CODE_HMAC_PEPPER_VERSION" \
    appBaseUrl="$APP_BASE_URL" \
    stripeSecretKey="$STRIPE_SECRET_KEY" \
    stripeWebhookSecret="$STRIPE_WEBHOOK_SECRET" \
    stripePriceAlertsPass="$STRIPE_PRICE_ALERTS_PASS" \
    stripePriceRadarPass="$STRIPE_PRICE_RADAR_PASS" \
    stripePriceRadarUpgrade="$STRIPE_PRICE_RADAR_UPGRADE" \
    legalOperatorName="$LEGAL_OPERATOR_NAME" \
    legalOperatorAddress="$LEGAL_OPERATOR_ADDRESS" \
    legalPublicationDirector="$LEGAL_PUBLICATION_DIRECTOR" \
    legalHostName="$LEGAL_HOST_NAME" \
    legalHostAddress="$LEGAL_HOST_ADDRESS" \
    legalHostPhone="$LEGAL_HOST_PHONE" \
    legalContactEmail="$LEGAL_CONTACT_EMAIL" \
    legalContactPhone="$LEGAL_CONTACT_PHONE" \
    legalPrivacyEmail="$LEGAL_PRIVACY_EMAIL" \
    legalWithdrawalEmail="$LEGAL_WITHDRAWAL_EMAIL" \
    legalFrMediatorName="$LEGAL_FR_MEDIATOR_NAME" \
    legalFrMediatorAddress="$LEGAL_FR_MEDIATOR_ADDRESS" \
    legalFrMediatorUrl="$LEGAL_FR_MEDIATOR_URL" \
    legalBusinessRegistrationStatus="$LEGAL_BUSINESS_REGISTRATION_STATUS" \
    legalBusinessRegistrationLegalConfirmation="$LEGAL_BUSINESS_REGISTRATION_LEGAL_CONFIRMATION" \
    legalKvkNumber="$LEGAL_KVK_NUMBER" \
    legalVatStatus="$LEGAL_VAT_STATUS" \
    legalVatId="$LEGAL_VAT_ID" \
    legalProductionReady="$LEGAL_PRODUCTION_READY" \
    legalRecordRetentionYears="$LEGAL_RECORD_RETENTION_YEARS" \
    legalRecordRetentionBasisConfirmed="$LEGAL_RECORD_RETENTION_BASIS_CONFIRMED" \
  --output none

CANDIDATE_REVISION="$(
  az containerapp show \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query properties.latestRevisionName \
    --output tsv
)"
require_value CANDIDATE_REVISION "$CANDIDATE_REVISION"
CANDIDATE_FQDN="$(
  az containerapp revision show \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --revision "$CANDIDATE_REVISION" \
    --query properties.fqdn \
    --output tsv
)"
require_value CANDIDATE_FQDN "$CANDIDATE_FQDN"

# Exercise the newly deployed cleanup job before changing user traffic. This
# verifies its image, dedicated identity, and table RBAC immediately instead of
# discovering a broken scheduled job at the next cron tick. The cleanup itself
# is idempotent and applies the same expiry rules used by scheduled executions.
start_and_verify_job "$RETENTION_JOB_NAME" 360

# The Bicep template keeps the prior revision at 100%. Exercise the candidate
# through its revision-specific FQDN before any user traffic can reach it.
node "$PROJECT_DIR/scripts/verify-deployment.mjs" "https://$CANDIDATE_FQDN"

az containerapp ingress traffic set \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --revision-weight "$CANDIDATE_REVISION=100" \
  --output none

APP_FQDN="$(
  az containerapp show \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query properties.configuration.ingress.fqdn \
    --output tsv
)"
require_value APP_FQDN "$APP_FQDN"
APP_URL="${DEPLOYMENT_VERIFY_URL:-https://$APP_FQDN}"

node "$PROJECT_DIR/scripts/verify-deployment.mjs" "$APP_URL"

# A zero-traffic revision still has a revision-specific public FQDN while it is
# active. Deactivate every historical revision after the candidate has passed
# both direct and production-FQDN verification. Revisions remain available for
# an explicit reactivation during a future rollback.
ACTIVE_OLD_REVISIONS="$(
  az containerapp revision list \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query "[?properties.active && name != '${CANDIDATE_REVISION}'].name" \
    --output tsv
)"
while IFS= read -r old_revision; do
  [[ -z "$old_revision" ]] && continue
  echo "Deactivating historical revision $old_revision."
  az containerapp revision deactivate \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --revision "$old_revision" \
    --output none
done <<< "$ACTIVE_OLD_REVISIONS"

trap - EXIT
echo "Deployed $IMAGE"
echo "Active revision: $CANDIDATE_REVISION"
if [[ -n "$PREVIOUS_REVISION" && "$PREVIOUS_REVISION" != "$CANDIDATE_REVISION" ]]; then
  echo "Previous revision retained inactive for explicit rollback: $PREVIOUS_REVISION"
fi
echo "Application URL: $APP_URL"
