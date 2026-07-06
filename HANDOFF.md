# Airco Tracking Web — current handoff

Last updated: 2026-07-06 (Europe/Amsterdam)

## Current objective

Provide a public, low-cost, read-only dashboard for the private Airco Tracker inventory snapshot. The first production version is complete: it lists immediate-stock and presale counts for all tracked retailers, uses a glacier-blue responsive UI, and reads live inventory through a same-origin API backed by Managed Identity.

A 2026-07-06 routing round made delivery destination a URL-level state: `/deliver-to/<country>` filters retailers by backend-provided site-level `delivery_coverage`, while `?lang=<zh|nl|en>` and the language switcher control only the interface language. `/` and unknown app paths canonicalize to `/deliver-to/nl`; existing hash-based retailer detail routes still work under the delivery-country path.

A 2026-07-06 hardening round made the frontend compatible with the backend's post-rename country-aware schema. The UI now treats `available_product_count` as total visible orderable products and uses `immediate_product_count` / `presale_product_count` (or derived product-array fallbacks) for user-facing counts, so presales are no longer shown as in-stock. Presale overview now includes mixed retailers, presale card clicks open the presale detail tab, and the footer country label is data-driven. The API validator accepts both old and new schema-v1 snapshots while enforcing stricter consistency checks; it also accepts optional site-level `delivery_coverage` tokens. The Docker image now includes the local i18n fallback file, and deployment verification cross-checks inventory totals.

A 2026-07-05 doc round updated backend references after the backend repository was renamed from `airco-tracking-nl` to `airco-tracking`. The backend now uses a country-based adapter registry (`adapters/nl/`, `adapters/registry.py`); the frontend references the backend by its new name in docs, scripts, and the shared inventory contract comment. No frontend code or behavior changed; the inventory schema remains version `1` and fully compatible.

A 2026-07-05 Azure consolidation moved all backend infrastructure into a single `airco-tracker-rg` resource group (the old `airco-tracker-nl-rg` was deleted). The runtime UAMI and deployer UAMI were recreated with new clientIds — the GitHub Actions `AZURE_CLIENT_ID` variable on both repos was updated to the new deployer clientId `8adc0579-710f-4fcb-8762-28cea100a8a9`. The frontend Container App's identity reference was updated via `app.bicep` redeploy to point at the new runtime UAMI. No frontend code or image changed; the doc-only commits used `[skip ci]`.

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
- Live URL: `https://airco-tracking-web.livelystone-5966d837.westeurope.azurecontainerapps.io/deliver-to/nl`
- Feature commit: `d787664` (accept site-level delivery coverage in inventory schema)
- Deployed image tag: `d78766428dd017e4fb31b7a4cb74ed3c5e60ae4d`
- Successful deployment workflow: GitHub Actions run `28789724133`
- Azure resource group: `airco-tracker-rg` (all resources consolidated here 2026-07-05; old `airco-tracker-nl-rg` deleted)
- Backend repository: `https://github.com/ProgrammerAsahi/airco-tracking` (renamed from `airco-tracking-nl`)
- Deployer UAMI clientId (GitHub Actions `AZURE_CLIENT_ID`): `8adc0579-710f-4fcb-8762-28cea100a8a9` (recreated 2026-07-05)
- Container App: `airco-tracking-web`
- Provisioning state after first deployment: `Succeeded`
- Scale: 0–2 replicas
- Runtime image registry: existing backend ACR; image name `airco-tracking-web:<full-git-sha>`

The Git branch history uses the repository-local GitHub noreply author. A temporary first push made with a macOS-inferred author was immediately replaced with `--force-with-lease`, and its obsolete workflow run `28681851914` was cancelled. Do not reintroduce machine-derived Git identity.

## What is implemented

### Browser UI

- React 19 + TypeScript + Vite.
- Glacier-blue page background, hero treatment, summary metrics, and stock-status accents.
- Retailer cards show a brand-colored initial mark, retailer name, tab-specific count, status, and outbound-link arrow.
- Retailers with immediate stock or presale sort first by the active tab's count; ties use Dutch locale name sorting.
- Stale sites use a dashed, muted card state.
- Responsive grid: six columns on wide desktop, five below 1180px, three below 900px, two below 620px, one below 400px.
- Reduced-motion support and no horizontal overflow at the 1440×900 target.
- **Polling**: the UI refetches `/api/inventory` on an interval driven by the snapshot's `refresh_interval_seconds` (clamped to ≥ 60s), and immediately on `visibilitychange` when the tab becomes visible again. This replaces the previous fetch-once-on-mount behavior.
- **Delivery-country routing**: `/deliver-to/<iso2>` filters the full backend inventory to sites whose `delivery_coverage` contains that country or a matching region alias (`eu`, `eea`, `nordics`, `benelux`, `dach`). `/deliver-to/nl` contains the current 28 Dutch-focused retailers. `/deliver-to/fr?lang=en` is the canonical shape for a France-delivery page in English. Language and delivery destination are deliberately independent.
- **Retailer detail page**: clicking a stocked retailer card opens a full-screen overlay (`RetailerDetail` component) listing active-tab products for that retailer. Products are sorted by price ascending. Each product card links directly to the retailer's product page (`product.url`, `target="_blank"`). Hash-based routing (`#/siteKey` and `#/siteKey/presale`) supports browser back button and shareable URLs. Unstocked cards remain non-interactive.
- **Presale tabs**: the detail page separates products into "现货" (immediate stock, green dot) and "预售" (presale, blue dot) tabs. Tabs appear only when a retailer has both types. Default is 现货, opens 预售 when selected from a presale overview card, and falls back to 预售 if only presale products exist. The backend provides a `presale` boolean per product.
- **Localization**: a flag menu switches Chinese, Dutch, and English and persists the choice in `localStorage`. Dates and numbers use `zh-CN`, `nl-NL`, or `en-GB`; the document language, title, description, errors, and accessible card labels update with the selected language.

### Same-origin API

- `server/server.ts` serves both the Vite output and `/api/inventory` on port 3000.
- Production reads the private Blob with `DefaultAzureCredential` and the assigned runtime identity.
- The `BlobServiceClient` is constructed once at startup and reused across cache misses, avoiding repeated credential-chain probes.
- Blob reads are cached for 30 seconds and concurrent cache misses share one in-flight read.
- `/health` provides the deployment health check.
- Security headers include strict CSP (`script-src 'self'`, `style-src 'self'`), HSTS, frame denial, MIME sniffing protection, no-referrer, and restricted browser permissions.
- `/api/inventory` has a small in-memory per-client rate limit (`RATE_LIMIT_MAX_REQUESTS`, default 120 per `RATE_LIMIT_WINDOW_SECONDS`, default 60) to reduce low-effort abuse while keeping `/health` and static assets unaffected.
- `server/i18n.ts` loads the `web` scope from Azure Table Storage, caches it for five minutes, and injects escaped `application/json` into the HTML shell. No executable inline script or browser Azure credential is used.
- The API validates snapshot version, totals, `refresh_interval_seconds`, strict ISO timestamps, site status, stale flags, counts, HTTPS product URLs/specs, product-site ownership, and cross-checks `site_count`, `stale_site_count`, `available_product_count`, `immediate_product_count`, and `presale_product_count` before returning data.
- Local production mode uses `INVENTORY_FILE=test-fixtures/inventory.sample.json`; this override is not configured in Azure.
- Shared data contract: `shared/inventory.ts` is the single source of truth for the inventory types, used by both `src/types.ts` (browser) and `server/inventory.ts` (API).

### Azure and CI/CD

- Chosen host: Azure Container Apps Consumption, because the app needs a server-side Managed Identity API as well as static assets.
- The app reuses the backend project's Container Apps Environment, ACR, Storage Account, and runtime UAMI. No second environment, registry, database, Function App, Storage Account, or Key Vault was created.
- External HTTPS ingress targets port 3000. Minimum replicas are 0 and maximum replicas are 2. Scale-to-zero means the first request after idle has a multi-second cold start; this is an accepted tradeoff for the low-traffic dashboard. If latency becomes an issue, set `minReplicas: 1` in `infra/app.bicep`.
- Runtime identity reads the existing private `airco-tracker/inventory.json` Blob and pulls the private ACR image without passwords.
- The new GitHub repository has its own branch-restricted federated credential (`github-airco-tracking-web`) on the existing `airco-github-deployer` identity. The bicep name uses `last(split(githubRepository,'/'))` for idempotency.
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
- The API returns the whole snapshot. The overview uses immediate/presale counts and the retailer detail overlay uses product arrays.
- Schema v1 now supports optional `country`, `site_id`, site-level `delivery_coverage`, `immediate_product_count`, and `presale_product_count` fields. The frontend keeps fallback derivation from product arrays so old snapshots and new snapshots both work.
- Any producer/schema change must be coordinated across both repositories. Do not make the Blob public and do not replace the API with a browser-side SAS URL.

## Verification evidence

Current local verification (2026-07-06):

- `pnpm test`: 26/26 tests passed: 19 inventory-contract tests, 4 delivery-routing/filter tests, plus CSP-safe i18n serialization, hostile `</script>` escaping, and malformed bundle validation.
- `pnpm typecheck`: browser and server TypeScript passed.
- `pnpm build`: Node server and Vite production bundles passed.
- Local fixture and live production inventory JSON both pass the new validator.
- All shell scripts passed `bash -n`.
- `git diff --check`: clean.
- `verify-deployment.mjs` validates the strict script CSP, inert 3-language JSON data element, absence of the broken `window.__I18N__` injection, `/deliver-to/nl?lang=en` deep-link fallback, dynamic inventory site counts, site-level `delivery_coverage`, and aggregate product-count consistency.

Production deployment history (compact):

- **2026-07-06 delivery coverage schema compatibility**: Actions run `28789724133` for frontend commit `d787664` succeeded in 2m41s. Backend commit `352338c` then produced inventory with site-level `delivery_coverage`; live API verified `2026-07-06T12:01:31.736406+00:00`: 28 sites, 22 available products (12 immediate, 10 presale), 0 stale, and coverage present on all site records. The live deployment verifier passed against the public URL.
- **2026-07-05 backend rename + Azure consolidation**: Backend `afdde97` deployed (Actions `28745071912`, Succeeded). Azure resources moved to `airco-tracker-rg`; UAMIs + EmailService recreated with new clientIds; `app.bicep` redeployed to update the Container App identity reference. Frontend doc-only commits (`5f82190`, `43e9a82`, `c9fc94c`, `f150a2b`) used `[skip ci]` — no frontend image redeploy. Production API verified 2026-07-05T17:21Z: 28 sites / 19 available / 0 stale. `verify-deployment.mjs` passed.
- **2026-07-05 OIDC bicep fix**: `infra/github-oidc.bicep` changed from `uniqueString()` to `last(split(githubRepository,'/'))` for idempotent federated-credential names. Redeployed; no frontend code/image change. (commit `f150a2b`)
- **2026-07-05 Bostools**: Actions `28735567922` for frontend commit `069f587`: succeeded in 2m42s. 28 sites, 20 available, 0 stale.
- **2026-07-04 localization repair**: Actions `28717820865` for commit `5d022fc`: succeeded. Strict CSP + 3-language inert JSON verified. Browser QA confirmed zh/nl/en switching.
- **2026-07-04 feature (detail page + presale tabs)**: Actions `28703023049` for commit `d8fcc49`: succeeded.
- **2026-07-03 first deploy**: Actions `28681867269` for commit `039ea44`: succeeded. 27 sites, 15 available.
- Inventory totals are time-sensitive; re-run `scripts/verify-deployment.mjs` or query the live API before citing a current count.

## Known limitations and candidate next work

These are options, not pre-authorized tasks:

1. **Official logo assets** — cards currently use brand-colored initials. If the user wants real logos, decide on licensing, local asset ownership, fallbacks, and update maintenance before adding them. Avoid runtime third-party logo services.
2. **Custom domain** — only the generated `azurecontainerapps.io` hostname is configured.
3. **Freshness UX** — each stale site is styled, but there is no prominent global warning when several retailers are stale or the snapshot itself is old.
4. **Automated browser tests** — contract and deployment checks cover i18n data, but no committed Playwright accessibility or visual-regression suite exists.
5. **Observability** — deployment checks health and data, but there is no dedicated alert for repeated API failures or high Container App error rates.

## Standard local verification

```bash
cd ~/airco-tracking-web
pnpm install --frozen-lockfile
pnpm test          # 17 tests
pnpm typecheck
pnpm build
bash -n scripts/*.sh
git diff --check
```

Development preview (two terminals):
```bash
# Terminal 1: API server with sample data
PORT=4174 INVENTORY_FILE=test-fixtures/inventory.sample.json I18N_FILE=test-fixtures/i18n.local.json pnpm start
# Terminal 2: Vite dev server (proxies /api to :4174)
pnpm dev   # http://127.0.0.1:4173
```

Production-mode integration check:
```bash
PORT=4174 INVENTORY_FILE=test-fixtures/inventory.sample.json I18N_FILE=test-fixtures/i18n.local.json pnpm start
node scripts/verify-deployment.mjs http://127.0.0.1:4174
```

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
2. Verify the GitHub Actions variables are current: `gh variable list -R ProgrammerAsahi/airco-tracking-web` should show `AZURE_RESOURCE_GROUP=airco-tracker-rg` and `AZURE_CLIENT_ID=8adc0579-710f-4fcb-8762-28cea100a8a9`. If a deploy fails with OIDC errors, the deployer UAMI clientId may have drifted from the variable.
3. Confirm the user's requested next feature and inspect only the relevant files.
4. For UI work, run `pnpm dev` and validate 1440×900 plus a narrow breakpoint.
5. For server work, run production mode with the sample fixture and `scripts/verify-deployment.mjs`.
6. For schema work, inspect and update the backend producer and tests as a coordinated change.
7. Update this handoff after meaningful work or deployment.

Never record personal data, secret values, tokens, local machine identities, or unnecessary Azure identifiers in this file.

## Localization contract

- Azure Table Storage table `i18n` stores 44 entries: 33 `web` rows and 11 email rows, each with `zh`, `nl`, and `en` values. The backend repository owns the seed/fallback source and Table role assignment.
- The frontend reads only the `web` partition through Managed Identity. `server/i18n.ts` serializes it into `<script id="i18n-data" type="application/json">`; `<`, `>`, and `&` are escaped so a translation cannot terminate the raw-text element.
- `shared/i18n.ts` validates the parsed bundles. The browser never executes Table content and the CSP remains `script-src 'self'; style-src 'self'` without `unsafe-inline`.
- Hero line breaks are rendered as React elements after splitting the narrow `<br>` token; arbitrary translation HTML is never rendered.
- No new translation keys were required for the repair, so the already seeded Table remains compatible.
