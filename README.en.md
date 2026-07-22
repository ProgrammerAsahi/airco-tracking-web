# Airco Tracking Web

<p align="center">
  <a href="./README.md"><img alt="简体中文" src="https://img.shields.io/badge/README-简体中文-d73a49"></a>
  <a href="./README.en.md"><img alt="English" src="https://img.shields.io/badge/README-English-0969da"></a>
</p>

Ice-blue TypeScript/React dashboard for the [Airco Tracker](https://github.com/ProgrammerAsahi/airco-tracking) near-real-time inventory snapshot, normally refreshed about every 10 minutes.

The inventory contract may include an optional HTTPS `affiliate_url`. Product cards prefer that purchase destination and mark it as sponsored, while the stable merchant `url` remains the product identity, React key, and inventory-state key so affiliate-link changes cannot create false stock transitions. Missing or unsafe affiliate URLs are rejected server-side or fall back to the canonical URL. The generic four-language disclosure is served at `/affiliate-disclosure.html`.

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
                 │      └─ Stripe Checkout, one-time card payments
                 ├─ Auth / profile / Stripe webhook persistence
                 │      ├─ users (full user profile)
                 │      └─ alertrecipients (32-shard minimal mail projection)
                 └─ embeds escaped, inert i18n JSON
                        └─ Managed Identity → Azure Table Storage
```

The app reuses the existing Container Apps Environment, ACR, Storage Account, and responsibility-separated web/retention runtime identities from `airco-tracking`. It creates the `airco-tracking-web` Container App and a separate expired-record cleanup Job in the same resource group.

Users have a stable UUID `userId`, so changing an email address does not change account identity. Registration, profile/preference updates, Stripe pass purchases, refunds/disputes, entitlement expiry, and account deletion all synchronize the `alertrecipients` Table. This projection is sharded by `sha256(userId) % 32` and stores only the email, language, delivery country, and pass entitlement required for mail delivery; it excludes nicknames, Stripe IDs, payment methods, and card data. Local development without Azure Storage continues to use the in-memory user store and does not depend on this projection.

Azure-backed canonical user data uses an `id:<uuid>` profile row and `email:<base64url>` / `stripe:<base64url>` index rows. ETag/CAS plus monotonic revisions prevent duplicate code consumption, concurrent profile overwrites, and stale webhook/projection writes. A verified email change preserves the UUID and transactionally replaces the email index. Public APIs do not expose UUIDs, revisions, or Stripe identifiers.

Verification codes are stored only as versioned HMAC-SHA256 values using the independent `auth-code-hmac-pepper` Key Vault secret. The version is persisted with each code, so rotating the pepper and incrementing `AUTH_CODE_HMAC_PEPPER_VERSION` safely invalidates outstanding older and legacy unpeppered codes. Before every send attempt (including attempts where ACS later fails), Azure Table ETag/CAS counters enforce fixed-hour budgets per normalized email, per trusted client IP, and globally. Email/IP counter keys are peppered HMAC identifiers, not plaintext personal data. Container Apps explicitly trusts only the rightmost ingress-appended `X-Forwarded-For` address; local runs use the socket address and ignore forwarded headers. The fallback in-memory HTTP limiter is hard-capped and evicts old buckets.

Account deletion fails closed until paid-order evidence has first been copied to a separate pseudonymous minimum legal-retention row. That row has a deterministic one-way key and an explicit `retentionUntil`, and keeps only Stripe/order identifiers plus the contract, payment, refund, withdrawal and legal-acceptance fields needed for accounting or claims. It deliberately excludes email, nickname, withdrawal name, delivery/language preferences, alert settings, card brand and last four digits. The deadline is calculated from the latest legally relevant timestamp in every retained receipt (for example service expiry, refund/withdrawal or confirmation), rather than from account deletion. `LEGAL_RECORD_RETENTION_YEARS` accepts only `7` or `10`, and live checkout also requires `LEGAL_RECORD_RETENTION_BASIS_CONFIRMED=true`; choose `10` only when a confirmed basis such as applicable OSS records requires it. Repeated deletion attempts reuse the same row and may extend, but never shorten, an existing deadline. Once the durable ledger exists, the login profile and indexes are removed.

The published privacy periods match the running pipeline: verification codes about 10 minutes, sessions 30 days, published alert outbox rows 30 days, terminal delivery metadata 90 days, unavailable-product state compaction after 90 days, minimal tombstones 365 days, and exceptional ACS Event Grid dead-letter bodies 7 days. The web service does not create a separate persistent request/security-log database; limited platform logs follow the retention configured on the Azure workspace.

All browser `POST` requests to authentication and billing APIs require an exact same-origin `Origin`; browser-shaped requests without `Origin`, same-site sibling origins and cross-site requests fail closed. Controlled non-browser clients must omit Fetch Metadata and explicitly send `X-Airco-Api-Client: trusted-non-browser-v1`. This custom-header path is intended only for trusted operational clients; no CORS permission is exposed.

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

The browser smoke suite uses Playwright Chromium and axe to check the public portal for serious or critical accessibility violations. Install the browser once before running it locally:

```bash
pnpm exec playwright install chromium
pnpm build
pnpm test:e2e
```

CI and production deployment treat high or critical production-dependency audit findings as blocking failures and run the same browser suite.

Login, onboarding and profile/account modals use the shared accessible-dialog primitive: focus is moved inside, trapped while open and restored to the trigger on close; Escape and backdrop dismissal work, and the underlying application becomes inert. Public Terms, Privacy, Imprint and Affiliate Disclosure responses are server-rendered in `en`, `nl`, `fr` and `zh` from the same content source used for progressive enhancement. This keeps substantive text, localized metadata, canonical links and `hreflang` available to no-JavaScript clients under the strict CSP. The discontinued EU ODR platform is intentionally not linked.

## Azure deployment

The repository uses GitHub OIDC rather than a client secret. The one-time bootstrap adds a repository-specific federated credential to the existing `airco-github-deployer` identity and writes only non-secret identifiers to GitHub Actions Variables:

```bash
./scripts/bootstrap-github-oidc.sh
```

Every eligible code push to `main` runs tests, compiles TypeScript and Bicep, and builds an immutable image in the existing ACR. The Container App uses a multiple-revision release: the previous healthy revision keeps 100% traffic while the candidate is exercised through its revision FQDN. Verification covers `/health`, dependency-backed `/ready`, the strict-CSP i18n HTML contract, protected inventory, and Stripe webhook configuration. Traffic moves to the candidate only after all checks pass; a deployment or post-cutover failure automatically restores 100% traffic to the prior revision. Markdown/docs-only changes are ignored by the deployment workflow and do not trigger a production deployment.

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
| `STRIPE_PRICE_ALERTS_PASS` | One-time Stripe Price ID for the €5 Heatwave Alerts Pass |
| `STRIPE_PRICE_RADAR_PASS` | One-time Stripe Price ID for the €10 Heatwave Radar Pass |
| `STRIPE_PRICE_RADAR_UPGRADE` | One-time €5 Stripe Price ID for upgrading an active Alerts Pass to Radar |
| `WITHDRAWAL_SIGNING_KEY` | At least 32 characters for signing withdrawal-confirmation tokens; production should source it from Key Vault |
| `WITHDRAWAL_RATE_LIMIT_MAX_REQUESTS` | Withdrawal API requests allowed per source per minute; defaults to `10` |
| `AUTH_CODE_HMAC_PEPPER` | Independent, at-least-32-character verification-code HMAC secret; production injects the Key Vault secret named `auth-code-hmac-pepper` |
| `AUTH_CODE_HMAC_PEPPER_VERSION` | Short non-secret version stored with each code; defaults to `v1` and must be incremented deliberately when the pepper rotates |
| `AUTH_EMAIL_CODE_BUDGET_PER_HOUR` | Durable per-email verification-send-attempt budget; defaults to `5` per fixed UTC hour |
| `AUTH_IP_CODE_BUDGET_PER_HOUR` | Durable per-client-IP verification-send-attempt budget; defaults to `20` per fixed UTC hour |
| `AUTH_GLOBAL_CODE_BUDGET_PER_HOUR` | Durable cross-replica circuit breaker; defaults to `1000` per fixed UTC hour; failed sends count against all three budgets |
| `TRUST_PLATFORM_X_FORWARDED_FOR` | Production-only trust switch; Bicep sets `true` so only the rightmost ACA-appended IP is used, while local runs leave it unset and use the socket |
| `RATE_LIMIT_MAX_BUCKETS` | Hard cap for the process-local HTTP rate-limit map; defaults to `10000` |
| `LEGAL_OPERATOR_NAME` / `LEGAL_OPERATOR_ADDRESS` | Legal name and full address of the contracting operator |
| `LEGAL_PUBLICATION_DIRECTOR` | Real person legally responsible for publication; required for the French legal notice and live checkout |
| `LEGAL_HOST_NAME` / `LEGAL_HOST_ADDRESS` / `LEGAL_HOST_PHONE` | Verified legal name, postal address, and telephone of the actual hosting provider; all are published and required before live checkout |
| `LEGAL_CONTACT_EMAIL` / `LEGAL_CONTACT_PHONE` | Public customer-support email and telephone; both are required before live checkout |
| `LEGAL_PRIVACY_EMAIL` / `LEGAL_WITHDRAWAL_EMAIL` | Privacy and withdrawal contact addresses |
| `LEGAL_FR_MEDIATOR_NAME` / `LEGAL_FR_MEDIATOR_ADDRESS` / `LEGAL_FR_MEDIATOR_URL` | Actual contracted French consumer mediator; all three are required before live checkout and must not be guessed |
| `LEGAL_BUSINESS_REGISTRATION_STATUS` | `registered`, legally confirmed `exempt_confirmed`, or `not_registered` (which blocks live payments) |
| `LEGAL_BUSINESS_REGISTRATION_LEGAL_CONFIRMATION` | Set to `true` only after professional confirmation of the registration exemption |
| `LEGAL_KVK_NUMBER` | Required business-registration number when status is `registered` |
| `LEGAL_VAT_STATUS` / `LEGAL_VAT_ID` | `registered` or `not_registered`; registered requires a VAT ID, while receipts explicitly state no VAT is charged when unregistered |
| `LEGAL_PRODUCTION_READY` | Set to `true` only after legal review of operator, tax, and contract information |
| `LEGAL_RECORD_RETENTION_YEARS` | Confirmed legal-ledger period, exactly `7` or `10` years, measured from the latest legally relevant retained-evidence timestamp |
| `LEGAL_RECORD_RETENTION_BASIS_CONFIRMED` | Must be `true` before live checkout; set only after confirming the 7/10-year legal or accounting basis (use 10 for applicable OSS evidence) |

Before the first deployment of this version, provision one stable `auth-code-hmac-pepper` secret in the existing Key Vault using at least 32 cryptographically random bytes. Do not place the value in GitHub variables, source, logs, or deployment output. The web Managed Identity reads it through a Key Vault secret reference. To rotate it, create a new Key Vault secret version and increment `AUTH_CODE_HMAC_PEPPER_VERSION` in the same controlled rollout; codes created by older versions then fail closed.

The deployment also creates an hourly Azure Container Apps Job that deletes expired verification-code, per-email/per-IP/global budget and session rows, and deletes pseudonymous legal-ledger rows only after their anchored `retentionUntil`. The Job uses the dedicated retention identity with delete-capable access only on `users`, `authcodes`, and `authsessions`; it inherits no web ACS or Key Vault permission. Cleanup is paged and capped per execution so a backlog continues converging on later hourly runs; malformed legal deadlines fail closed instead of deleting evidence.

### Stripe billing setup

Billing uses hosted Stripe Checkout for card payments only. Card data never touches the Airco Tracker server. Create three one-time Prices in Stripe test mode and map them to the variables above:

- Heatwave Alerts Pass: €5 once, with 90 days of stock-alert emails.
- Heatwave Radar Pass: €10 once, with 90 days of stock-alert emails and near-real-time inventory access (normally refreshed about every 10 minutes).
- Alerts → Radar upgrade: €5 once, enabling near-real-time inventory immediately while preserving the Alerts Pass expiry date.

Passes never renew automatically. An active Radar Pass cannot be downgraded; after expiry, the user may buy either pass again. An active Alerts Pass can only purchase the €5 upgrade, not another same-tier pass.

The subscription page reads the public VAT status from `/api/legal/config`. It states either that the displayed total includes VAT or that VAT is legally not charged; if the status is unknown or unavailable, the formal payment action is disabled. Every public and signed-in surface links prominently to the withdrawal/refund form. That form requires the consumer name and an explicit, initially unchecked request for electronic confirmation at the account email. Inventory results disclose their normal ten-minute refresh cadence and exact ranking: retailers by matching count then name, products by price with unknown prices last; affiliate relationships never affect ranking, and stale/unverified sources are excluded.

Configure a Stripe webhook endpoint at:

```text
https://airco-tracker.eu/api/billing/webhook
```

Subscribe at least to these one-time payment, refund, and dispute events:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `charge.refunded`
- `refund.created`
- `refund.updated`
- `refund.failed`
- `charge.dispute.created`
- `charge.dispute.closed`

Use Stripe test cards to verify Checkout before switching the environment variables to live mode.

Live or unknown-format Stripe keys (including `sk_live_` and `rk_live_`) fail closed: the server refuses to create Checkout Sessions when operator identity, publication director, hosting-provider details, registration/VAT status, legal confirmation, contact details, the withdrawal signing key, or `LEGAL_PRODUCTION_READY` is incomplete. This gate is not a substitute for professional Dutch/EU legal and tax advice.

Customer Portal is not part of pass purchases. After payment, signature-verified webhooks and authenticated Checkout return sync update the entitlement; duplicate events must remain idempotent. See `docs/SUBSCRIPTION_BILLING_TEST_PLAN.en.md` for the full regression matrix.

Before enabling live payments, complete and retain evidence for every operator-identity, tax, French consumer-mediation, data-protection, and release item in `docs/LEGAL_PRODUCTION_CHECKLIST.md`.

## Documentation language maintenance

All Markdown documentation should have Chinese and English versions with language-switch badges at the top. Whenever any document changes, update both language versions together.

Do not add Azure keys, long-lived SAS tokens, or secrets to this repository.
