# Airco Tracking Web — shared agent instructions

## Mission

Maintain a fast, low-cost, public inventory dashboard for portable air conditioners deliverable in the Netherlands. Present the private `airco-tracking` live snapshot clearly without exposing Azure credentials or making Blob Storage public.

## Read first

1. Read `HANDOFF.md` for current deployment facts, known limitations, and likely next work.
2. Read the files relevant to the requested layer before editing:
   - Browser UI: `src/`
   - Same-origin API: `server/`
   - Azure deployment: `infra/` and `scripts/`
   - Automation: `.github/workflows/`
3. If the data shape is involved, inspect the backend producer in `~/airco-tracking/airco_tracker/inventory.py` as the source of truth.
4. Use `README.md` for user-facing setup and architecture. Keep it synchronized with behavior changes.

## Non-negotiable security rules

- This is a public repository. Never commit or log secrets, personal email addresses, machine-local identities, API tokens, Client Secrets, Storage Keys, connection strings, long-lived SAS tokens, or Key Vault values.
- Production browser code must call the same-origin `/api/inventory` endpoint. Never give the browser direct credentials to Azure Storage.
- Keep the Blob container private. The Node service reads `inventory.json` with a user-assigned Managed Identity.
- GitHub Actions authenticates to Azure with OIDC. Do not add `AZURE_CREDENTIALS` or a service-principal password.
- Only non-secret identifiers belong in GitHub Actions Variables: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, and `AZURE_RESOURCE_GROUP`.
- Reuse the existing least-privilege runtime identity and infrastructure where possible. Do not broaden Azure roles without a concrete need and explicit authorization.
- Preserve the strict `script-src 'self'; style-src 'self'` CSP. Do not add `unsafe-inline` to make runtime data injection work.
- Treat translations loaded from Table Storage as data, not trusted markup. Embed them only as escaped `application/json`, validate their shape, and never render them with `dangerouslySetInnerHTML`.
- Preserve unrelated user changes. Never overwrite a dirty worktree or rewrite shared history casually.

## Product and design contract

- Keep the calm glacier-blue visual direction unless the user requests a redesign.
- The main desktop target is a 13-inch MacBook Air-style viewport around 1440×900. Maintain responsive layouts for narrower screens.
- The primary information is each retailer's available-product count. Stocked retailers sort first, then names sort using Dutch locale rules.
- Stale retailer data must remain visibly distinguishable. Do not present stale values as freshly checked.
- Keep retailer outbound links explicit, accessible, and opened with safe `rel` attributes.
- The current brand marks are color-coded initials, not downloaded official logos. Do not introduce remote logo dependencies or copyrighted asset bundles without checking the trade-off with the user.
- Do not hard-code inventory totals in rendering logic. Counts and site status come from the snapshot. If marketing copy mentions the number of tracked sites, update it when backend coverage changes.
- Maintain keyboard semantics, readable contrast, reduced-motion support, and no horizontal overflow at supported breakpoints.
- Chinese, Dutch, and English must switch without a reload. Keep visible copy, errors, document metadata, locale-sensitive dates/numbers, and accessible labels synchronized with the selected language.

## Architecture

```text
Browser
  └─ HTTPS → Azure Container Apps (`airco-tracking-web`, scale 0–2)
                 ├─ serves `dist/` from the Vite build
                 └─ GET `/api/inventory`
                        └─ Managed Identity → private Blob
                           `airco-tracker/inventory.json`
```

- React entry and UI: `src/App.tsx`
- Brand metadata: `src/brands.ts`
- Browser data types: `src/types.ts`
- Glacier-blue responsive styling: `src/styles.css`
- Node HTTP service: `server/server.ts`
- Runtime contract validation: `server/inventory.ts`
- Contract tests: `server/inventory.test.ts`
- Non-sensitive local fixture: `test-fixtures/inventory.sample.json`
- Shared data contract: `shared/inventory.ts`
- Shared translation contract/parser: `shared/i18n.ts`
- Table Storage translation loader and CSP-safe serializer: `server/i18n.ts`
- Browser translation hook and language persistence: `src/i18n.ts`
- Container image: `Dockerfile`
- Container App definition: `infra/app.bicep`
- Repository-specific OIDC credential: `infra/github-oidc.bicep`
- Deployment and verification: `scripts/deploy.sh`, `scripts/verify-deployment.mjs`
- CI/CD: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

The frontend repo reuses the backend project's resource group, Container Apps Environment, ACR, Storage Account, and runtime user-assigned identity. It owns only the `airco-tracking-web` Container App and its repository-specific GitHub OIDC trust.

## Inventory data contract

- Current schema version: `1`.
- The producer is the backend repository's `updated_inventory()` output.
- Production reads the private Blob through `/api/inventory`; development proxies `/api` to a local Node server that reads `test-fixtures/inventory.sample.json`.
- Required top-level fields include `version`, `updated_at`, `refresh_interval_seconds`, aggregate counts, and `sites`.
- Each site includes `status`, `stale`, attempt/success timestamps, `available_product_count`, and `products`.
- The server validates the shape before returning it. Do not silently accept an unknown schema version.
- A schema change requires coordinated edits to:
  1. Backend snapshot producer and tests.
  2. `server/inventory.ts` and its tests.
  3. `src/types.ts` and UI behavior.
  4. `test-fixtures/inventory.sample.json`.
  5. README and handoff documentation in both repositories.

## Standard local workflow

Use Node.js 22 and pnpm 11.7 from the repository root:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
git diff --check
```

Development preview (requires two terminals):

```bash
# Terminal 1: start the API server with sample data
PORT=4174 INVENTORY_FILE=test-fixtures/inventory.sample.json I18N_FILE=test-fixtures/i18n.local.json pnpm start

# Terminal 2: start Vite dev server (proxies /api to :4174)
pnpm dev
# http://127.0.0.1:4173
```

Production-mode integration check:

```bash
PORT=4174 INVENTORY_FILE=test-fixtures/inventory.sample.json I18N_FILE=test-fixtures/i18n.local.json pnpm start
node scripts/verify-deployment.mjs http://127.0.0.1:4174
```

When changing layout or CSS, inspect the page at 1440×900 and at least one narrow breakpoint. Confirm the card count, stocked-card count, total, horizontal overflow, and browser console errors. A local Vite preview alone is not enough for API/server changes; also run the production-mode check.

## CI/CD and Azure workflow

- Pull requests and manual CI runs use `.github/workflows/ci.yml`.
- Pushes to `main` use `.github/workflows/deploy.yml`.
- Deployment runs tests, type checks, builds browser/server artifacts, compiles Bicep, logs in with OIDC, builds in ACR, deploys an immutable full-SHA image, and verifies `/health`, the strict-CSP i18n HTML contract, plus `/api/inventory`.
- The Container App uses external HTTPS ingress, a 30-second Blob cache, and 0–2 replicas.
- `scripts/bootstrap-github-oidc.sh` is a one-time or repair operation. Do not run it routinely.
- Documentation-only commits may use `[skip ci]` when no deployed artifact changed.
- After an authorized deployment, record the feature commit/image, Actions run, production response counts, and provisioning state in `HANDOFF.md`.

## Change workflow

1. Inspect `git status`, `git log`, and current remote state.
2. Pull or fetch before working if another agent may have pushed changes.
3. Make the smallest coherent change and add focused tests for server or contract logic.
4. Run the standard verification commands.
5. Perform browser visual QA for UI changes and production-mode API QA for server changes.
6. Update `README.md` when setup, architecture, runtime variables, or deployment behavior changes.
7. Update `HANDOFF.md` when current state, next work, production evidence, or blockers change.
8. Commit with the repository-local GitHub noreply author. Push/deploy only when authorized.

## Handoff quality

Keep `HANDOFF.md` factual and compact enough for a new agent to scan quickly. Separate durable rules (this file) from current facts (handoff). Record exact commands and verification evidence, but never include personal data, secret values, tokens, or unnecessary Azure identifiers.
