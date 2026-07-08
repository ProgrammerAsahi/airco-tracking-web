# Airco Tracking Web

Ice-blue TypeScript/React dashboard for the [Airco Tracker](https://github.com/ProgrammerAsahi/airco-tracking) live inventory snapshot.

**Live:** [airco-tracker.eu](https://airco-tracker.eu/)

The homepage (`/`) is a public heatwave-themed landing portal. Inventory dashboards live under `/deliver-to/<country>` and show current available and presale counts for retailers that can deliver to the selected destination country, with product drill-down, prices, BTU values, delivery text, and direct product links. Delivery destination is part of the URL (`/deliver-to/nl`, `/deliver-to/fr`); interface language stays independent through `?lang=en` and the language switcher. Chinese, Dutch, and English can be switched without reloading. Production uses a same-origin TypeScript API and Managed Identity; no Storage Key, SAS token, or secret reaches the browser.

## Architecture

```text
Browser
  └─ HTTPS → Azure Container Apps (scale 0–2)
                 ├─ serves the Vite/React build
                 ├─ GET /api/inventory
                 │      └─ Managed Identity → private inventory.json Blob
                 ├─ POST /api/billing/create-checkout-session
                 │      └─ Stripe Checkout, card payments only in the first billing pass
                 └─ embeds escaped, inert i18n JSON
                        └─ Managed Identity → Azure Table Storage
```

The app reuses the existing Container Apps Environment, ACR, Storage Account, and runtime identity from `airco-tracking`. It creates only one additional Container App in the same resource group.

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

Use `/deliver-to/<country>?lang=<language>` for country-aware views. For example, `/deliver-to/fr?lang=en` shows sites that can deliver to France with an English UI, while `/deliver-to/nl?lang=zh` keeps the Dutch delivery destination and switches only the interface language.

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

Every push to `main` then runs tests, compiles TypeScript and Bicep, builds an immutable image in the existing ACR, deploys `airco-tracking-web`, and verifies `/health`, the strict-CSP i18n HTML contract, and `/api/inventory`.

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
| `I18N_FILE` | Local-only translation JSON override |
| `APP_BASE_URL` | Public origin used for Stripe return URLs, for example `https://airco-tracker.eu` |
| `STRIPE_SECRET_KEY` | Stripe secret key. Use test mode first (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret for `/api/billing/webhook` |
| `STRIPE_PRICE_WEEKLY_BASIC` | Stripe recurring Price ID for `weekly_basic` |
| `STRIPE_PRICE_WEEKLY_PRIORITY` | Stripe recurring Price ID for `weekly_priority` |
| `STRIPE_PRICE_MONTHLY_BASIC` | Stripe recurring Price ID for `monthly_basic` |
| `STRIPE_PRICE_MONTHLY_PRIORITY` | Stripe recurring Price ID for `monthly_priority` |

### Stripe billing setup

The first billing integration uses hosted Stripe Checkout for card payments only. Card data never touches the Airco Tracker server. Create four recurring Prices in Stripe test mode and map them to the variables above:

- `weekly_basic`: €5 / week
- `weekly_priority`: €15 / week
- `monthly_basic`: €10 / month
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

Do not add Azure keys, long-lived SAS tokens, or secrets to this repository.
