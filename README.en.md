# Airco Tracking Web

<p align="center">
  <a href="./README.md"><img alt="简体中文" src="https://img.shields.io/badge/README-简体中文-d73a49"></a>
  <a href="./README.en.md"><img alt="English" src="https://img.shields.io/badge/README-English-0969da"></a>
</p>

Ice-blue TypeScript/React dashboard for the [Airco Tracker](https://github.com/ProgrammerAsahi/airco-tracking) live inventory snapshot.

**Live:** [airco-tracker.eu](https://airco-tracker.eu/)

The homepage (`/`) is a public heatwave-themed landing portal with a four-part scroll narrative: the Seine during a heatwave, a stifling old Paris apartment, PortaSplit cooling, and finally email alerts plus the live stock radar. Inventory dashboards live under `/deliver-to/<country>` and show current available and presale counts for retailers that can deliver to the selected destination country, with product drill-down, prices, BTU values, delivery text, and direct product links. Delivery destination is part of the URL (`/deliver-to/nl`, `/deliver-to/fr`); interface language stays independent through `?lang=fr` and the language switcher. Chinese, Dutch, English, and French can be switched without reloading. Production uses a same-origin TypeScript API and Managed Identity; no Storage Key, SAS token, or secret reaches the browser.

## Architecture

```text
Browser
  └─ HTTPS → Azure Container Apps (scale 0–2)
                 ├─ serves the Vite/React build
                 ├─ GET /api/inventory
                 │      └─ Managed Identity → private inventory.json Blob
                 ├─ POST /api/billing/create-checkout-session
                 │      └─ Stripe Checkout, card payments in the first billing pass
                 ├─ Auth / profile / Stripe webhook persistence
                 │      ├─ users (full user profile)
                 │      └─ alertrecipients (32-shard minimal mail projection)
                 └─ embeds escaped, inert i18n JSON
                        └─ Managed Identity → Azure Table Storage
```

The app reuses the existing Container Apps Environment, ACR, Storage Account, and runtime identity from `airco-tracking`. It creates only one additional Container App in the same resource group.

Users have a stable UUID `userId`, so changing an email address does not change account identity. Registration, profile/preference updates, Stripe subscription webhooks, cancellation, and account deletion all synchronize the `alertrecipients` Table. This projection is sharded by `sha256(userId) % 32` and stores only the email, language, delivery country, and subscription state required for mail delivery; it excludes nicknames, Stripe IDs, payment methods, and card data. Local development without Azure Storage continues to use the in-memory user store and does not depend on this projection.

Azure-backed canonical user data uses an `id:<uuid>` profile row and `email:<base64url>` / `stripe:<base64url>` index rows. ETag/CAS plus monotonic revisions prevent duplicate code consumption, concurrent profile overwrites, and stale webhook/projection writes. A verified email change preserves the UUID and transactionally replaces the email index. Public APIs do not expose UUIDs, revisions, or Stripe identifiers.

The production web hostnames `airco-tracker.eu` and `www.airco-tracker.eu` are persisted in `infra/app.bicep`. Login mail uses an explicitly selected ACS Email Domain. Production now selects the verified customer-managed `airco-tracker.eu` sender through `ACS_EMAIL_DOMAIN_NAME`, while `AzureManagedDomain` remains linked as a rollback fallback; deployment never relies on resource enumeration order.

## Local development

Requires Node.js 22 and pnpm 11.7.

```bash
pnpm install
# Terminal 1, after `pnpm build:server`
PORT=4174 INVENTORY_FILE=test-fixtures/inventory.sample.json I18N_FILE=test-fixtures/i18n.local.json pnpm start
# Terminal 2
pnpm dev
```

Open <http://127.0.0.1:4173> for the public portal. Development proxies `/api` to a local Node server.

Use `/deliver-to/<country>?lang=<language>` for country-aware views. For example, `/deliver-to/fr?lang=fr` shows sites that can deliver to France with a French UI, while `/deliver-to/nl?lang=zh` keeps the Dutch delivery destination and switches only the interface language. The header switcher changes the current browsing language only; saving a language preference in Profile makes it the account default for signed-in pages and stock-alert emails. Verification-code emails follow the current language of the page that requests the code.

To test the production server locally:

```bash
pnpm test
pnpm build
PORT=4174 INVENTORY_FILE=test-fixtures/inventory.sample.json I18N_FILE=test-fixtures/i18n.local.json pnpm start
node scripts/verify-deployment.mjs http://127.0.0.1:4174
```

## Azure deployment

The repository uses GitHub OIDC rather than a client secret. The one-time bootstrap adds a repository-specific federated credential to the existing `airco-github-deployer` identity and writes only non-secret identifiers to GitHub Actions Variables:

```bash
./scripts/bootstrap-github-oidc.sh
```

Every eligible code push to `main` runs tests, compiles TypeScript and Bicep, builds an immutable image in the existing ACR, deploys `airco-tracking-web`, and verifies `/health`, the strict-CSP i18n HTML contract, and `/api/inventory`. Markdown/docs-only changes are ignored by the deployment workflow and do not trigger a production deployment.

- `.github/workflows/ci.yml`: validates pull requests.
- `.github/workflows/deploy.yml`: deploys `main` to Azure.
- `infra/app.bicep`: Container App with external HTTPS ingress, scale-to-zero, Managed Identity, and private ACR pull.

## Deployment and runtime configuration

| Variable | Purpose |
| --- | --- |
| `AZURE_STORAGE_ACCOUNT_URL` | Existing private Blob account URL |
| `AZURE_STORAGE_CONTAINER` | Defaults to `airco-tracker` |
| `AZURE_INVENTORY_BLOB` | Defaults to `inventory.json` |
| `AZURE_CLIENT_ID` | User-assigned runtime identity |
| `ACS_EMAIL_DOMAIN_NAME` | Deployment-time exact linked ACS Email Domain used for login mail; code defaults to `AzureManagedDomain`, production explicitly selects `airco-tracker.eu` |
| `AUTH_ALERT_RECIPIENTS_TABLE` | Sharded email-recipient projection table, defaults to `alertrecipients` |
| `INVENTORY_CACHE_SECONDS` | Blob read cache, defaults to 30 seconds |
| `INVENTORY_FILE` | Local-only file override |
| `I18N_FILE` | Local-only translation JSON override |
| `APP_BASE_URL` | Public origin used for Stripe return URLs, for example `https://airco-tracker.eu` |
| `STRIPE_SECRET_KEY` | Stripe secret key. Use test mode first (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret for `/api/billing/webhook` |
| `STRIPE_BILLING_PORTAL_CONFIGURATION_ID` | Stripe Customer Portal configuration ID with subscription switching enabled and all four Prices allowed |
| `STRIPE_PRICE_WEEKLY_BASIC` | Stripe recurring Price ID for `weekly_basic` |
| `STRIPE_PRICE_WEEKLY_PRIORITY` | Stripe recurring Price ID for `weekly_priority` |
| `STRIPE_PRICE_MONTHLY_BASIC` | Stripe recurring Price ID for `monthly_basic` |
| `STRIPE_PRICE_MONTHLY_PRIORITY` | Stripe recurring Price ID for `monthly_priority` |

### Stripe billing setup

The first billing integration uses hosted Stripe Checkout for card payments only. Card data never touches the Airco Tracker server. Create four recurring Prices in Stripe test mode and map them to the variables above:

- `weekly_basic`: €10 / week
- `weekly_priority`: €20 / week
- `monthly_basic`: €15 / month
- `monthly_priority`: €30 / month

Configure a Stripe webhook endpoint at:

```text
https://airco-tracker.eu/api/billing/webhook
```

Subscribe at least to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Use Stripe test cards to verify Checkout before switching the environment variables to live mode.

The Customer Portal configuration must enable subscription plan switching and allow all four Prices under the two products. Upgrades should invoice the price difference immediately; downgrades and switches to a shorter interval should take effect at the end of the current billing period. Store its `bpc_...` ID in `STRIPE_BILLING_PORTAL_CONFIGURATION_ID`; the backend explicitly uses and validates this configuration when 3D Secure is required.

## Documentation language maintenance

All Markdown documentation should have Chinese and English versions with language-switch badges at the top. Whenever any document changes, update both language versions together.

Do not add Azure keys, long-lived SAS tokens, or secrets to this repository.
