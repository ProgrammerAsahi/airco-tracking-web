# Airco Tracking Web — handoff

Last updated: 2026-07-03 (Europe/Amsterdam)

## Purpose

Public, read-only inventory overview for the private `airco-tracking-nl` snapshot. The frontend is TypeScript/React/Vite. A minimal Node/TypeScript service serves the static build and exposes `/api/inventory` by reading private Blob Storage with Managed Identity.

## Local verification

- `pnpm test`: inventory contract tests.
- `pnpm typecheck`: browser and server TypeScript checks.
- `pnpm build`: server and Vite production builds.
- Local production verification: 27 sites, 19 available products.
- Browser verification: 1440×900, 27 cards, 6 stocked cards, no horizontal overflow, no console warnings/errors.

## Azure architecture

- Resource group: `airco-tracker-nl-rg`
- Container App: `airco-tracking-web`
- Existing Container Apps Environment, ACR, Storage Account, and runtime UAMI are reused.
- The app scales from 0 to 2 replicas and caches Blob reads for 30 seconds.
- GitHub Actions authenticates with OIDC through the existing `airco-github-deployer` identity and a repository-specific federated credential.
- No Storage Key, SAS token, client secret, email address, or Key Vault secret belongs in this repository.

## Data contract

- Production: same-origin `/api/inventory` reads `airco-tracker/inventory.json`.
- Development: `/inventory.sample.json` uses a committed non-sensitive example.
- Schema version: `1`.
- The API validates top-level totals and every site's status, stale flag, count, and products array before returning data.

## Deployment

- Pull requests run `.github/workflows/ci.yml`.
- Pushes to `main` run `.github/workflows/deploy.yml`.
- Images use the full Git commit SHA and are built in the existing Azure Container Registry.
- `scripts/verify-deployment.mjs` must pass against both `/health` and `/api/inventory` before deployment succeeds.

Update this file after architecture or deployment changes. Never record personal data or secret values.
