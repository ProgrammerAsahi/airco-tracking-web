# Airco Tracking Web

Ice-blue TypeScript/React dashboard for the [Airco Tracker NL](https://github.com/ProgrammerAsahi/airco-tracking-nl) live inventory snapshot.

The page shows the current available-product count for all 27 tracked retailers. Production uses a same-origin TypeScript API to read the private Azure Blob snapshot through Managed Identity; no Storage Key, SAS token, or secret reaches the browser.

## Architecture

```text
Browser
  └─ HTTPS → Azure Container Apps (scale 0–2)
                 ├─ serves the Vite/React build
                 └─ GET /api/inventory
                        └─ Managed Identity → private inventory.json Blob
```

The app reuses the existing Container Apps Environment, ACR, Storage Account, and runtime identity from `airco-tracking-nl`. It creates only one additional Container App in the same resource group.

## Local development

Requires Node.js 22 and pnpm 11.7.

```bash
pnpm install
pnpm dev
```

Open <http://127.0.0.1:4173>. Development reads `public/inventory.sample.json`.

To test the production server locally:

```bash
pnpm test
pnpm build
PORT=4174 INVENTORY_FILE=public/inventory.sample.json pnpm start
node scripts/verify-deployment.mjs http://127.0.0.1:4174
```

## Azure deployment

The repository uses GitHub OIDC rather than a client secret. The one-time bootstrap adds a repository-specific federated credential to the existing `airco-github-deployer` identity and writes only non-secret identifiers to GitHub Actions Variables:

```bash
./scripts/bootstrap-github-oidc.sh
```

Every push to `main` then runs tests, compiles TypeScript and Bicep, builds an immutable image in the existing ACR, deploys `airco-tracking-web`, and verifies both `/health` and `/api/inventory`.

- `.github/workflows/ci.yml`: validates pull requests.
- `.github/workflows/deploy.yml`: deploys `main` to Azure.
- `infra/app.bicep`: Container App with external HTTPS ingress, scale-to-zero, Managed Identity, and private ACR pull.

## Runtime configuration

| Variable | Purpose |
| --- | --- |
| `AZURE_STORAGE_ACCOUNT_URL` | Existing private Blob account URL |
| `AZURE_STORAGE_CONTAINER` | Defaults to `airco-tracker` |
| `AZURE_INVENTORY_BLOB` | Defaults to `inventory.json` |
| `AZURE_CLIENT_ID` | User-assigned runtime identity |
| `INVENTORY_CACHE_SECONDS` | Blob read cache, defaults to 30 seconds |
| `INVENTORY_FILE` | Local-only file override |

Do not add Azure keys, long-lived SAS tokens, or secrets to this repository.
