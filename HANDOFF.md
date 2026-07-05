# Airco Tracking Web — current handoff

Last updated: 2026-07-05 (Europe/Amsterdam)

## Current objective

Provide a public, low-cost, read-only dashboard for the private Airco Tracker inventory snapshot. The first production version is complete: it lists the available-product count for all tracked retailers, uses a glacier-blue responsive UI, and reads live inventory through a same-origin API backed by Managed Identity.

A 2026-07-05 doc round updated backend references after the backend repository was renamed from `airco-tracking-nl` to `airco-tracking`. The backend now uses a country-based adapter registry (`adapters/nl/`, `adapters/registry.py`); the frontend references the backend by its new name in docs, scripts, and the shared inventory contract comment. No frontend code or behavior changed; the inventory schema remains version `1` and fully compatible.

A 2026-07-03 quality round improved the frontend with: client-side polling driven by `refresh_interval_seconds` plus `visibilitychange` refetch, a shared `shared/inventory.ts` type module eliminating client/server type duplication, deepened server validation (products, timestamps, `site_count` cross-check), BlobServiceClient reuse at startup, removal of the hard-coded `27` magic number from the verify script, sample JSON moved out of the production build, expanded test coverage (3 → 14 tests), and a `if: success()` gate on the deploy summary step.

A 2026-07-04 feature round added a retailer product detail page: clicking a stocked retailer card opens a full-screen overlay listing all in-stock products (name, price, BTU, delivery) sorted by price ascending, each linking directly to the retailer's product page. Hash-based routing (`#/RetailerName`) supports browser back and shareable URLs. No backend changes were needed; `inventory.json` already contains product arrays.

A 2026-07-04 presale round added separate tabs for immediate stock vs presale products: the detail page shows a "现货" (green dot) tab and a "预售" (blue dot) tab when a retailer has both types. The backend `inventory.json` now includes a `presale` boolean field per product; the frontend validates and uses it to split the product list. Presale products (multi-week lead times, pre-orders) never trigger email alerts.

A 2026-07-04 localization round added Chinese, Dutch, and English UI copy backed by the existing Azure Table Storage. The initial executable inline-data approach was blocked by the strict CSP; it is now replaced by escaped inert JSON that the external React module validates and parses. Language changes update visible copy, errors, document metadata, accessibility labels, Amsterdam timestamps, prices, and BTU formatting without reloading.

The 2026-07-05 retailer expansion adds explicit Bostools brand metadata so the 28th backend inventory site renders with its correct shop link and a stable glacier-compatible brand treatment.

No active blocker exists. The next agent should first confirm what the user wants to add rather than assuming that every candidate item below is authorized.

## Repository and production

- Repository: `https://github.com/ProgrammerAsahi/airco-tracking-web`
- Branch: `main`
- Local path: `~/airco-tracking-web`
- Live URL: `https://airco-tracking-web.livelystone-5966d837.westeurope.azurecontainerapps.io`
- Feature commit: `5f82190` (backend-reference doc updates after backend rename; no code change)
- Deployed image tag: `069f587e0cc84b7f1c82d3e04020c71e8b5c38d2` (last code deployment; doc-only commits do not redeploy)
- Successful deployment workflow: GitHub Actions run `28735567922`
- Azure resource group: `airco-tracker-nl-rg` (Azure does not support RG rename; deferred)
- Backend repository: `https://github.com/ProgrammerAsahi/airco-tracking` (renamed from `airco-tracking-nl`)
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
- **Localization**: a flag menu switches Chinese, Dutch, and English and persists the choice in `localStorage`. Dates and numbers use `zh-CN`, `nl-NL`, or `en-GB`; the document language, title, description, errors, and accessible card labels update with the selected language.

### Same-origin API

- `server/server.ts` serves both the Vite output and `/api/inventory` on port 3000.
- Production reads the private Blob with `DefaultAzureCredential` and the assigned runtime identity.
- The `BlobServiceClient` is constructed once at startup and reused across cache misses, avoiding repeated credential-chain probes.
- Blob reads are cached for 30 seconds and concurrent cache misses share one in-flight read.
- `/health` provides the deployment health check.
- Security headers include CSP, frame denial, MIME sniffing protection, no-referrer, and restricted browser permissions.
- `server/i18n.ts` loads the `web` scope from Azure Table Storage, caches it for five minutes, and injects escaped `application/json` into the HTML shell. No executable inline script or browser Azure credential is used.
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
- Deployment uses the full commit SHA as the immutable image tag and fails unless `/health`, the homepage i18n/CSP contract, and `/api/inventory` pass.

## Data contract and backend relationship

- Backend repository: `~/airco-tracking` / `ProgrammerAsahi/airco-tracking`.
- Producer: `airco_tracker/inventory.py` in the backend repository.
- Blob: private container `airco-tracker`, object `inventory.json`.
- Snapshot schema version: `1`.
- Frontend runtime validation: `server/inventory.ts`.
- Browser types: `src/types.ts`.
- Local fixture: `test-fixtures/inventory.sample.json`.
- The API returns the whole snapshot. The overview uses counts and the retailer detail overlay uses product arrays.
- Any producer/schema change must be coordinated across both repositories. Do not make the Blob public and do not replace the API with a browser-side SAS URL.

## Verification evidence

Current local verification after the 2026-07-04 localization repair:

- `pnpm test`: 17/17 tests passed: 14 inventory-contract tests plus CSP-safe i18n serialization, hostile `</script>` escaping, and malformed bundle validation.
- `pnpm typecheck`: browser and server TypeScript passed.
- `pnpm build`: Node server and Vite production bundles passed.
- All shell scripts passed `bash -n`.
- `git diff --check`: clean.
- Sample JSON moved from `public/` to `test-fixtures/`; no longer ships in the production image.
- `verify-deployment.mjs` validates the strict script CSP, inert 3-language JSON data element, absence of the broken `window.__I18N__` injection, and dynamic inventory site counts.
- Production-mode local verification passed with 27 sites and 22 available products at that moment.
- Browser QA confirmed live switching among `zh-CN`, `nl`, and `en`; translated title/description/date/card labels and locale-aware price/BTU formatting all changed correctly.
- Deploy summary step gated with `if: success()`.

Prior production deployment evidence (run `28681867269`, commit `039ea44`): succeeded, 27 sites and 15 available products at that moment.

2026-07-04 feature deployment:
- Actions run `28703023049` for commit `d8fcc49`: succeeded in 2m55s.
- Production image: `airco-tracking-web:d8fcc49e2867685e71ec87eea8dfa8c143c50c87`.
- `/health`: ok. `/api/inventory`: 27 sites, 17 available. `/`: HTML served. `verify-deployment.mjs`: passed.
- Sample fixture now includes real product data for local testing of the detail page.
- Inventory totals are time-sensitive; re-run `scripts/verify-deployment.mjs` or query the live API before citing a current count.

2026-07-04 localization repair deployment:
- Actions run `28717820865` for commit/image `5d022fc45e9e9d03bec567cd6afaee5f59e37f90`: succeeded in 2m52s.
- The strengthened production verifier passed `/health`, strict `script-src 'self'`, the escaped 33-key `application/json` translation block, absence of executable inline translation data, and the live inventory contract.
- Live API verification returned 27 sites, 20 available products, and 0 stale sites at `2026-07-04T19:54:00Z`.
- Browser QA on the production URL switched Chinese → Dutch → English without reload. It verified translated hero/section/card labels, `html lang`, localized Amsterdam timestamps, and localized document titles; `window.__I18N__` remained undefined by design.

2026-07-05 Bostools expansion deployment:
- Actions run `28735567922` for frontend commit `069f587`: succeeded in 2m42s.
- Frontend image: `airco-tracking-web:069f587e0cc84b7f1c82d3e04020c71e8b5c38d2`.
- Production API verified: 28 sites, 20 available products, 0 stale sites. Bostools brand metadata renders correctly with 1 presale product.
- Backend companion run `28735561062` for commit `6e50bf4`: succeeded in 4m13s.

2026-07-05 backend rename + registry refactor (doc-only frontend update):
- Backend commit `afdde97`: renamed `airco-tracking-nl` → `airco-tracking`, moved 27 adapters into `adapters/nl/`, added `registry.py` with `load_adapter_classes(countries)`, fixed `i18n_local.json` packaging. Backend Actions run `28745071912` succeeded; verification execution `airco-tracker-job-ftzu1v6` Succeeded.
- Frontend commit `5f82190`: updated backend repo/path references in `README.md`, `AGENTS.md`, `CLAUDE.md`, `HANDOFF.md`, `shared/inventory.ts`, and two scripts. No code or behavior change; doc-only commit did not trigger a deploy.
- Frontend `pnpm test` (17/17), `pnpm typecheck`, and `pnpm build` all passed locally.
- Production verification 2026-07-05T15:14Z: `/health` ok, `/api/inventory` returned 28 sites / 20 available / 0 stale; `verify-deployment.mjs` passed.

## Known limitations and candidate next work

These are options, not pre-authorized tasks:

1. **Official logo assets** — cards currently use brand-colored initials. If the user wants real logos, decide on licensing, local asset ownership, fallbacks, and update maintenance before adding them. Avoid runtime third-party logo services.
2. **Custom domain** — only the generated `azurecontainerapps.io` hostname is configured.
3. **Freshness UX** — each stale site is styled, but there is no prominent global warning when several retailers are stale or the snapshot itself is old.
4. **Automated browser tests** — contract and deployment checks cover i18n data, but no committed Playwright accessibility or visual-regression suite exists.
5. **Observability** — deployment checks health and data, but there is no dedicated alert for repeated API failures or high Container App error rates.

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

## Localization contract

- Azure Table Storage table `i18n` stores 44 entries: 33 `web` rows and 11 email rows, each with `zh`, `nl`, and `en` values. The backend repository owns the seed/fallback source and Table role assignment.
- The frontend reads only the `web` partition through Managed Identity. `server/i18n.ts` serializes it into `<script id="i18n-data" type="application/json">`; `<`, `>`, and `&` are escaped so a translation cannot terminate the raw-text element.
- `shared/i18n.ts` validates the parsed bundles. The browser never executes Table content and the CSP remains `script-src 'self'` without `unsafe-inline`.
- Hero line breaks are rendered as React elements after splitting the narrow `<br>` token; arbitrary translation HTML is never rendered.
- No new translation keys were required for the repair, so the already seeded Table remains compatible.
