# Airco Tracking Web

<p align="center">
  <a href="./README.md"><img alt="简体中文" src="https://img.shields.io/badge/README-简体中文-d73a49"></a>
  <a href="./README.en.md"><img alt="English" src="https://img.shields.io/badge/README-English-0969da"></a>
  <a href="./README.nl.md"><img alt="Nederlands" src="https://img.shields.io/badge/README-Nederlands-f58220"></a>
</p>

Een ijsblauw TypeScript/React-dashboard voor de live voorraad-snapshot van [Airco Tracker](https://github.com/ProgrammerAsahi/airco-tracking).

**Live:** [airco-tracker.eu](https://airco-tracker.eu/)

De homepage (`/`) is een publieke portal met een hittegolf-thema. Voorraaddashboards staan onder `/deliver-to/<country>` en tonen actuele voorraad- en voorverkoopaantallen voor winkels die naar het gekozen bestemmingsland kunnen leveren, inclusief productdetails, prijzen, BTU-waarden, bezorgtekst en directe productlinks. Het bezorgland is onderdeel van de URL (`/deliver-to/nl`, `/deliver-to/fr`); de interfacetaal blijft onafhankelijk via `?lang=en` en de taalwisselaar. Chinees, Nederlands en Engels kunnen zonder herladen worden gewisseld. Productie gebruikt een same-origin TypeScript API en Managed Identity; Storage Keys, SAS-tokens en secrets bereiken de browser niet.

## Architectuur

```text
Browser
  └─ HTTPS → Azure Container Apps (scale 0–2)
                 ├─ serves the Vite/React build
                 ├─ GET /api/inventory
                 │      └─ Managed Identity → private inventory.json Blob
                 ├─ POST /api/billing/create-checkout-session
                 │      └─ Stripe Checkout, card payments in the first billing pass
                 └─ embeds escaped, inert i18n JSON
                        └─ Managed Identity → Azure Table Storage
```

De app hergebruikt de bestaande Container Apps Environment, ACR, Storage Account en runtime-identiteit van `airco-tracking`. In dezelfde resource group wordt slechts één extra Container App aangemaakt.

## Lokale ontwikkeling

Vereist Node.js 22 en pnpm 11.7.

```bash
pnpm install
# Terminal 1, after `pnpm build:server`
PORT=4174 INVENTORY_FILE=test-fixtures/inventory.sample.json I18N_FILE=test-fixtures/i18n.local.json pnpm start
# Terminal 2
pnpm dev
```

Open <http://127.0.0.1:4173> voor de publieke portal. De ontwikkelomgeving proxyt `/api` naar een lokale Node-server.

Gebruik `/deliver-to/<country>?lang=<language>` voor landbewuste pagina's. `/deliver-to/fr?lang=en` toont bijvoorbeeld winkels die naar Frankrijk kunnen leveren met een Engelse interface, terwijl `/deliver-to/nl?lang=zh` Nederland als bezorgbestemming houdt en alleen de interfacetaal naar Chinees wisselt.

Lokale test van de productieserver:

```bash
pnpm test
pnpm build
PORT=4174 INVENTORY_FILE=test-fixtures/inventory.sample.json I18N_FILE=test-fixtures/i18n.local.json pnpm start
node scripts/verify-deployment.mjs http://127.0.0.1:4174
```

## Azure-implementatie

De repository gebruikt GitHub OIDC in plaats van een client secret. De eenmalige bootstrap voegt een repository-specifieke federated credential toe aan de bestaande `airco-github-deployer` identity en schrijft alleen niet-geheime identifiers naar GitHub Actions Variables:

```bash
./scripts/bootstrap-github-oidc.sh
```

Elke push naar `main` draait tests, compileert TypeScript en Bicep, bouwt een immutable image in de bestaande ACR, implementeert `airco-tracking-web` en verifieert `/health`, het strict-CSP i18n HTML-contract en `/api/inventory`. Alleen-Markdown/docs-wijzigingen worden door de deployment workflow genegeerd en triggeren geen productie-implementatie.

- `.github/workflows/ci.yml`: valideert pull requests.
- `.github/workflows/deploy.yml`: implementeert `main` naar Azure.
- `infra/app.bicep`: Container App met externe HTTPS ingress, scale-to-zero, Managed Identity en private ACR pull.

## Runtime-configuratie

| Variable | Purpose |
| --- | --- |
| `AZURE_STORAGE_ACCOUNT_URL` | Bestaande private Blob account URL |
| `AZURE_STORAGE_CONTAINER` | Standaard `airco-tracker` |
| `AZURE_INVENTORY_BLOB` | Standaard `inventory.json` |
| `AZURE_CLIENT_ID` | User-assigned runtime identity |
| `INVENTORY_CACHE_SECONDS` | Blob-leescache, standaard 30 seconden |
| `INVENTORY_FILE` | Alleen lokale file override |
| `I18N_FILE` | Alleen lokale vertaling-JSON override |
| `APP_BASE_URL` | Publieke origin voor Stripe return URLs, bijvoorbeeld `https://airco-tracker.eu` |
| `STRIPE_SECRET_KEY` | Stripe secret key. Gebruik eerst test mode (`sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret voor `/api/billing/webhook` |
| `STRIPE_PRICE_WEEKLY_BASIC` | Stripe recurring Price ID voor `weekly_basic` |
| `STRIPE_PRICE_WEEKLY_PRIORITY` | Stripe recurring Price ID voor `weekly_priority` |
| `STRIPE_PRICE_MONTHLY_BASIC` | Stripe recurring Price ID voor `monthly_basic` |
| `STRIPE_PRICE_MONTHLY_PRIORITY` | Stripe recurring Price ID voor `monthly_priority` |

### Stripe billing setup

De eerste billing-integratie gebruikt hosted Stripe Checkout en ondersteunt in eerste instantie alleen kaartbetalingen. Kaartgegevens raken de Airco Tracker-server nooit. Maak vier recurring Prices aan in Stripe test mode en koppel ze aan de variabelen hierboven:

- `weekly_basic`: €10 / week
- `weekly_priority`: €20 / week
- `monthly_basic`: €15 / month
- `monthly_priority`: €30 / month

Configureer een Stripe webhook endpoint op:

```text
https://airco-tracker.eu/api/billing/webhook
```

Abonneer minimaal op:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Gebruik Stripe test cards om Checkout te verifiëren voordat de omgevingsvariabelen naar live mode worden omgezet.

## Onderhoud van documenttalen

Alle Markdown-documentatie moet Chinese, Engelse en Nederlandse versies hebben met taalbadges bovenaan. Wanneer een document wijzigt, moeten alle drie taalversies samen worden bijgewerkt.

Voeg geen Azure keys, langlevende SAS-tokens of secrets toe aan deze repository.
