# Airco Tracking Web — current handoff

Last updated: 2026-07-03 (Europe/Amsterdam)

## Current objective

Provide a public, low-cost, read-only dashboard for the private Airco Tracker NL inventory snapshot. The first production version is complete: it lists the available-product count for all tracked retailers, uses a glacier-blue responsive UI, and reads live inventory through a same-origin API backed by Managed Identity.

No active blocker exists. The next agent should first confirm what the user wants to add rather than assuming that every candidate item below is authorized.

## Repository and production

- Repository: `https://github.com/ProgrammerAsahi/airco-tracking-web`
- Branch: `main`
- Local path: `~/airco-tracking-web`
- Live URL: `https://airco-tracking-web.livelystone-5966d837.westeurope.azurecontainerapps.io`
- Feature commit and deployed image tag: `039ea44845af806883021dbc2fb14da3e45aa74e`
- Successful deployment workflow: GitHub Actions run `28681867269`
- Azure resource group: `airco-tracker-nl-rg`
- Container App: `airco-tracking-web`
- Provisioning state after first deployment: `Succeeded`
- Scale: 0–2 replicas
- Runtime image registry: existing backend ACR; image name `airco-tracking-web:<full-git-sha>`

The Git branch history uses the repository-local GitHub noreply author. A temporary first push made with a macOS-inferred author was immediately replaced with `--force-with-lease`, and its obsolete workflow run `28681851914` was cancelled. Do not reintroduce machine-derived Git identity.

## What is implemented

### Browser UI

- React 19 + TypeScript + Vite.
- Glacier-blue page background, hero treatment, summary metrics, and stock-status accents.
- Retailer cards show a brand-colored initial mark, retailer name, large available count, status, and outbound-link arrow.
- Retailers with stock sort first by count; ties use Dutch locale name sorting.
- Stale sites use a dashed, muted card state.
- Responsive grid: six columns on wide desktop, five below 1180px, three below 900px, two below 620px, one below 400px.
- Reduced-motion support and no horizontal overflow at the 1440×900 target.

### Same-origin API

- `server/server.ts` serves both the Vite output and `/api/inventory` on port 3000.
- Production reads the private Blob with `DefaultAzureCredential` and the assigned runtime identity.
- Blob reads are cached for 30 seconds and concurrent cache misses share one in-flight read.
- `/health` provides the deployment health check.
- Security headers include CSP, frame denial, MIME sniffing protection, no-referrer, and restricted browser permissions.
- The API validates snapshot version, totals, site status, stale flags, counts, and products arrays before returning data.
- Local production mode uses `INVENTORY_FILE=public/inventory.sample.json`; this override is not configured in Azure.

### Azure and CI/CD

- Chosen host: Azure Container Apps Consumption, because the app needs a server-side Managed Identity API as well as static assets.
- The app reuses the backend project's Container Apps Environment, ACR, Storage Account, and runtime UAMI. No second environment, registry, database, Function App, Storage Account, or Key Vault was created.
- External HTTPS ingress targets port 3000. Minimum replicas are 0 and maximum replicas are 2.
- Runtime identity reads the existing private `airco-tracker/inventory.json` Blob and pulls the private ACR image without passwords.
- The new GitHub repository has its own branch-restricted federated credential on the existing `airco-github-deployer` identity.
- GitHub stores only non-secret Azure identifiers as Actions Variables. No `AZURE_CREDENTIALS` secret or Client Secret exists for this workflow.
- Pull requests run `.github/workflows/ci.yml`; pushes to `main` run `.github/workflows/deploy.yml`.
- Deployment uses the full commit SHA as the immutable image tag and fails unless `/health` and `/api/inventory` pass.

## Data contract and backend relationship

- Backend repository: `~/airco-tracking-nl` / `ProgrammerAsahi/airco-tracking-nl`.
- Producer: `airco_tracker/inventory.py` in the backend repository.
- Blob: private container `airco-tracker`, object `inventory.json`.
- Snapshot schema version: `1`.
- Frontend runtime validation: `server/inventory.ts`.
- Browser types: `src/types.ts`.
- Local fixture: `public/inventory.sample.json`.
- The API currently returns the whole snapshot, including product arrays, although the first UI uses only aggregate and per-site counts.
- Any producer/schema change must be coordinated across both repositories. Do not make the Blob public and do not replace the API with a browser-side SAS URL.

## Verification evidence

Before the first production deployment:

- `pnpm test`: 3/3 inventory-contract tests passed.
- `pnpm typecheck`: browser and server TypeScript passed.
- `pnpm build`: Node server and Vite production bundles passed.
- Both Bicep templates compiled successfully.
- All shell scripts passed `bash -n`.
- `git diff --check`: clean.
- Local production verification: 27 sites and 19 available products from the non-sensitive fixture.
- Browser QA at 1440×900: 27 cards, 6 stocked cards, total 19, no horizontal overflow, no console warnings or errors.

Production deployment evidence:

- Actions run `28681867269`: succeeded.
- Image: `airco-tracking-web:039ea44845af806883021dbc2fb14da3e45aa74e`.
- Azure provisioning: `Succeeded`.
- Verification script read the private live Blob through the deployed API: 27 sites and 15 available products at that moment.
- Inventory totals are time-sensitive; re-run `scripts/verify-deployment.mjs` or query the live API before citing a current count.

## Known limitations and candidate next work

These are options, not pre-authorized tasks:

1. **Retailer/product drill-down** — cards link to retailer home pages. The API already contains product arrays, so a detail panel could list current products, prices, BTU, delivery text, and product links.
2. **Official logo assets** — cards currently use brand-colored initials. If the user wants real logos, decide on licensing, local asset ownership, fallbacks, and update maintenance before adding them. Avoid runtime third-party logo services.
3. **Localization** — visible copy is currently Simplified Chinese. English and Dutch UI locales are not implemented.
4. **Custom domain** — only the generated `azurecontainerapps.io` hostname is configured.
5. **Freshness UX** — each stale site is styled, but there is no prominent global warning when several retailers are stale or the snapshot itself is old.
6. **Automated browser tests** — contract tests exist, but no Playwright/Vitest accessibility or visual-regression suite is committed.
7. **Observability** — deployment checks health and data, but there is no dedicated alert for repeated API failures or high Container App error rates.
8. **Schema sharing** — browser and server interfaces are maintained manually. A generated JSON Schema or shared package could reduce drift if the contract becomes more complex.

## Resume checklist for the next agent

```bash
cd ~/airco-tracking-web
git status --short
git log -5 --oneline
git fetch origin
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
```

Then:

1. Read `CLAUDE.md`, `AGENTS.md`, and this handoff.
2. Confirm the user's requested next feature and inspect only the relevant files.
3. For UI work, run `pnpm dev` and validate 1440×900 plus a narrow breakpoint.
4. For server work, run production mode with the sample fixture and `scripts/verify-deployment.mjs`.
5. For schema work, inspect and update the backend producer and tests as a coordinated change.
6. Update this handoff after meaningful work or deployment.

Never record personal data, secret values, tokens, local machine identities, or unnecessary Azure identifiers in this file.
