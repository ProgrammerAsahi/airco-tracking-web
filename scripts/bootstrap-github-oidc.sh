#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-airco-tracker-rg}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-ProgrammerAsahi/airco-tracking-web}"
GITHUB_BRANCH="${GITHUB_BRANCH:-main}"

command -v az >/dev/null || { echo "Azure CLI (az) is required." >&2; exit 1; }
command -v gh >/dev/null || { echo "GitHub CLI (gh) is required." >&2; exit 1; }
az account show >/dev/null || { echo "Run 'az login' first." >&2; exit 1; }
gh auth status >/dev/null 2>&1 || { echo "Run 'gh auth login' first." >&2; exit 1; }

az deployment group create \
  --name airco-web-github-oidc \
  --resource-group "$RESOURCE_GROUP" \
  --template-file "$PROJECT_DIR/infra/github-oidc.bicep" \
  --parameters githubRepository="$GITHUB_REPOSITORY" githubBranch="$GITHUB_BRANCH" \
  --output none

output() {
  az deployment group show \
    --name airco-web-github-oidc \
    --resource-group "$RESOURCE_GROUP" \
    --query "properties.outputs.$1.value" \
    --output tsv
}

gh variable set AZURE_CLIENT_ID --repo "$GITHUB_REPOSITORY" --body "$(output clientId)"
gh variable set AZURE_TENANT_ID --repo "$GITHUB_REPOSITORY" --body "$(output tenantId)"
gh variable set AZURE_SUBSCRIPTION_ID --repo "$GITHUB_REPOSITORY" --body "$(output subscriptionId)"
gh variable set AZURE_RESOURCE_GROUP --repo "$GITHUB_REPOSITORY" --body "$RESOURCE_GROUP"

echo "GitHub OIDC configured for $GITHUB_REPOSITORY on branch $GITHUB_BRANCH."
