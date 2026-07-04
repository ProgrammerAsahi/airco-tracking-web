# Airco Tracking Web — current handoff

Last updated: 2026-07-03 (Europe/Amsterdam)

## Current objective

Provide a public, low-cost, read-only dashboard for the private Airco Tracker NL inventory snapshot. The first production version is complete: it lists the available-product count for all tracked retailers, uses a glacier-blue responsive UI, and reads live inventory through a same-origin API backed by Managed Identity.

A 2026-07-03 quality round improved the frontend with: client-side polling driven by `refresh_interval_seconds` plus `visibilitychange` refetch, a shared `shared/inventory.ts` type module eliminating client/server type duplication, deepened server validation (products, timestamps, `site_count` cross-check), BlobServiceClient reuse at startup, removal of the hard-coded `27` magic number from the verify script, sample JSON moved out of the production build, expanded test coverage (3 → 14 tests), and a `if: success()` gate on the deploy summary step.

A 2026-07-04 feature round added a retailer product detail page: clicking a stocked retailer card opens a full-screen overlay listing all in-stock products (name, price, BTU, delivery) sorted by price ascending, each linking directly to the retailer's product page. Hash-based routing (`#/RetailerName`) supports browser back and shareable URLs. No backend changes were needed; `inventory.json` already contains product arrays.

A 2026-07-04 presale round added separate tabs for immediate stock vs presale products: the detail page shows a "现货" (green dot) tab and a "预售" (blue dot) tab when a retailer has both types. The backend `inventory.json` now includes a `presale` boolean field per product; the frontend validates and uses it to split the product list. Presale products (multi-week lead times, pre-orders) never trigger email alerts.

No active blocker exists. The next agent should first confirm what the user wants to add rather than assuming that every candidate item below is authorized.

## Repository and production

- Repository: `https://github.com/ProgrammerAsahi/airco-tracking-web`
- Branch: `main`
- Local path: `~/airco-tracking-web`
- Live URL: `https://airco-tracking-web.livelystone-5966d837.westeurope.azurecontainerapps.io`
- Feature commit and deployed image tag: `e5527716c06fa44093666c93e1685cb4f26ef287`
- Successful deployment workflow: GitHub Actions run `28704599395`
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
- **Polling**: the UI refetches `/api/inventory` on an interval driven by the snapshot's `refresh_interval_seconds` (clamped to ≥ 60s), and immediately on `visibilitychange` when the tab becomes visible again. This replaces the previous fetch-once-on-mount behavior.
- **Retailer detail page**: clicking a stocked retailer card opens a full-screen overlay (`RetailerDetail` component) listing all in-stock products for that retailer. Products are sorted by price ascending. Each product card links directly to the retailer's product page (`product.url`, `target="_blank"`). Hash-based routing (`#/RetailerName`) supports browser back button and shareable URLs. Unstocked cards remain non-interactive.
- **Presale tabs**: the detail page separates products into "现货" (immediate stock, green dot) and "预售" (presale, blue dot) tabs. Tabs appear only when a retailer has both types. Default is 现货; falls back to 预售 if only presale products exist. The backend provides a `presale` boolean per product.

### Same-origin API

- `server/server.ts` serves both the Vite output and `/api/inventory` on port 3000.
- Production reads the private Blob with `DefaultAzureCredential` and the assigned runtime identity.
- The `BlobServiceClient` is constructed once at startup and reused across cache misses, avoiding repeated credential-chain probes.
- Blob reads are cached for 30 seconds and concurrent cache misses share one in-flight read.
- `/health` provides the deployment health check.
- Security headers include CSP, frame denial, MIME sniffing protection, no-referrer, and restricted browser permissions.
- The API validates snapshot version, totals, `refresh_interval_seconds`, `updated_at` timestamp, site status, stale flags, counts, products arrays (including individual product fields), and cross-checks `site_count` against the actual number of site entries before returning data.
- Local production mode uses `INVENTORY_FILE=test-fixtures/inventory.sample.json`; this override is not configured in Azure.
- Shared data contract: `shared/inventory.ts` is the single source of truth for the inventory types, used by both `src/types.ts` (browser) and `server/inventory.ts` (API).

### Azure and CI/CD

- Chosen host: Azure Container Apps Consumption, because the app needs a server-side Managed Identity API as well as static assets.
- The app reuses the backend project's Container Apps Environment, ACR, Storage Account, and runtime UAMI. No second environment, registry, database, Function App, Storage Account, or Key Vault was created.
- External HTTPS ingress targets port 3000. Minimum replicas are 0 and maximum replicas are 2. Scale-to-zero means the first request after idle has a multi-second cold start; this is an accepted tradeoff for the low-traffic dashboard. If latency becomes an issue, set `minReplicas: 1` in `infra/app.bicep`.
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
- Local fixture: `test-fixtures/inventory.sample.json`.
- The API currently returns the whole snapshot, including product arrays, although the first UI uses only aggregate and per-site counts.
- Any producer/schema change must be coordinated across both repositories. Do not make the Blob public and do not replace the API with a browser-side SAS URL.

## Verification evidence

After the 2026-07-03 quality round:

- `pnpm test`: 14/14 inventory-contract tests passed (was 3; now covers products validation, timestamp validation, site_count cross-check, stale/status branches, malformed JSON, and array top-level rejection).
- `pnpm typecheck`: browser and server TypeScript passed.
- `pnpm build`: Node server and Vite production bundles passed.
- All shell scripts passed `bash -n`.
- `git diff --check`: clean.
- Sample JSON moved from `public/` to `test-fixtures/`; no longer ships in the production image.
- `verify-deployment.mjs` no longer hard-codes `27`; it validates `site_count === Object.keys(sites).length` dynamically.
- Deploy summary step gated with `if: success()`.

Prior production deployment evidence (run `28681867269`, commit `039ea44`): succeeded, 27 sites and 15 available products at that moment.

2026-07-04 feature deployment:
- Actions run `28703023049` for commit `d8fcc49`: succeeded in 2m55s.
- Production image: `airco-tracking-web:d8fcc49e2867685e71ec87eea8dfa8c143c50c87`.
- `/health`: ok. `/api/inventory`: 27 sites, 17 available. `/`: HTML served. `verify-deployment.mjs`: passed.
- Sample fixture now includes real product data for local testing of the detail page.
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

## 2026-07-04 i18n round

Multi-language support added with zh/nl/en switcher:
- Azure Table Storage table "i18n" stores all translations (PartitionKey=scope, RowKey=key, columns zh/nl/en). 44 entries seeded via scripts/seed-i18n.py.
- Frontend: server/i18n.ts loads web-scope translations at startup, injects into HTML as window.__I18N__. React useTranslation hook + LanguageSwitcher component (flag emoji dropdown).
- Backend: i18n_table.py loads email-scope translations from Table Storage with i18n_local.json fallback. i18n.py refactored to use dynamic loading.
- Foundation bicep: Storage Table Data Contributor role added for Managed Identity.
- Frontend commit: e84ea249. Backend commit: bd373ba.
- Production verified: __I18N__ populated from Table Storage, all endpoints OK.
