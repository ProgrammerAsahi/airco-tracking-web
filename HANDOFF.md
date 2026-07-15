# Airco Tracking Web — current handoff

<p align="center">
  <a href="./HANDOFF.zh.md"><img alt="简体中文" src="https://img.shields.io/badge/HANDOFF-简体中文-d73a49"></a>
  <a href="./HANDOFF.md"><img alt="English" src="https://img.shields.io/badge/HANDOFF-English-0969da"></a>
</p>

Last updated: 2026-07-14 (Europe/Amsterdam)

Update this English file and `HANDOFF.zh.md` together whenever current status, verification evidence, blockers, or next steps change. Do not record secrets, email addresses, access tokens, payment data, or unnecessary personal information.

## Current objective

Operate the public Airco Tracker portal, authenticated account experience, Stripe subscription flow, and country-aware inventory dashboard at `https://airco-tracker.eu/`. Anonymous users can view the portal and pricing; inventory under `/deliver-to/<country>` requires an active Realtime Radar (`priority`) entitlement.

The deployed coordinated frontend/backend release adds a stable user UUID and a minimal, 32-shard `alertrecipients` projection for the backend Azure Service Bus alert pipeline. Subscriber growth no longer makes the inventory scanner enumerate the canonical `users` table for every stock event.

## Repository and production

- Repository: `https://github.com/ProgrammerAsahi/airco-tracking-web`
- Branch/local path: `main`, `~/airco-tracking-web`
- Live URLs: `https://airco-tracker.eu/` and `https://www.airco-tracker.eu/`
- Container App: `airco-tracking-web`
- Azure resource group: `airco-tracker-rg`
- Backend repository: `https://github.com/ProgrammerAsahi/airco-tracking`
- Deployed frontend commit/image: `aircotrackertdzvfmmi.azurecr.io/airco-tracking-web:db98ce83f7f46517a75fa9977d4985dc25d5eee1`
- Coordinated backend commit/image: `e4194c25cce82f650eb96d72b37f10bdd6d067a7`
- Ready revision: `airco-tracking-web--0000053`; provisioning state `Provisioned`; revision health `Healthy`; traffic 100%
- Successful deployment workflow runs: frontend `29367033016`, backend `29167702065`
- Deployment workflow: `.github/workflows/deploy.yml`; Markdown/docs-only pushes do not deploy

Both custom web hostnames and their existing managed-certificate names are declared in `infra/app.bicep`. Do not remove those `customDomains` entries: an application Bicep deployment would otherwise clear the bindings.

## Implemented product experience

### Browser UI and routing

- `/` is the public heatwave-themed landing portal. Its five-part sticky-scroll narrative moves from the Seine heatwave to a stifling Paris apartment, PortaSplit cooling, a notification/live-radar scene built from the real French inventory UI, and a blue-hour Seine finale viewed from outside the now-cool apartment. The fourth scene stages email and stock-data reveals. The fifth scene adds restrained pointer/scroll parallax, warm window light, river glints, dark-background typography tuned per language, a subscription CTA, and an optimized 1672×941 background. All scenes share responsive four-language copy and reduced-motion fallbacks. Logged-in subscribers are directed to the cool Ready experience instead of being shown the acquisition portal again.
- Email-code login is implemented. First-time users choose a nickname; Google, Apple, and Microsoft buttons remain explicit placeholders and do not start OAuth.
- `/profile` supports nickname and verified-email changes, language preference, delivery country, logout, subscription management, and account deletion when no active entitlement remains.
- `/subscribe` offers four Stripe test-mode plans: weekly/monthly × Inventory Alerts (`basic`) or Realtime Radar (`priority`). The current plan is disabled; upgrades are immediate and eligible downgrades are scheduled for period end.
- `/ready` confirms that alerting is active. Priority subscribers also receive a button to the inventory page.
- `/deliver-to/nl` and `/deliver-to/fr` filter retailers by delivery coverage. Anonymous, unsubscribed, and basic-only users cannot read realtime inventory.
- Interface language (`zh`, `nl`, `en`, or `fr`) is independent from delivery country and can be switched in the header without a reload. An explicit header/query choice survives normal in-app navigation. Saving the Profile preference changes the persisted account default, the alert-recipient projection, stock-alert email language, and the Stripe customer locale.

### Same-origin API, auth, and billing

- `server/server.ts` serves the Vite build and same-origin APIs. `/api/inventory` reads the private Blob through Managed Identity, validates schema version `1`, caches reads, and rate-limits low-effort abuse.
- Auth codes, sessions, and canonical user profiles are stored in Azure Table Storage. Codes are hashed, expire, have a resend cooldown and attempt limit, and are delivered through Azure Communication Services Email. Verification subjects, plain text, HTML, safety footer, and HTML language metadata are complete in all four supported languages.
- The canonical `users` partition uses an `id:<uuid>` profile row plus `email:<base64url>` and `stripe:<base64url>` index rows. ETag/CAS protects codes and profile mutations; monotonic `profileRevision`/`sourceRevision` values reject stale writes. Verified email changes preserve the UUID and transactionally replace the email index.
- Stripe uses hosted Checkout and Customer Portal; card numbers never touch the Airco Tracker server. Webhooks are signature-verified before subscription state is written.
- `/api/billing/sync-checkout-status` repairs a delayed Checkout webhook after the authenticated user returns. Plan changes are resolved from the actual Stripe Price rather than stale metadata.
- The legacy preview-era `/api/auth/subscription/preview-payment` and `/api/auth/subscription/cancel` routes have been removed. Subscription grants and cancellation now remain behind the Stripe billing service; production verification requires both retired paths to fail closed with 404.
- Subscription cancellation preserves entitlement through the paid period. Account deletion is rejected while an active subscription still grants benefits.

### Internationalisation contract

- Application-owned browser text, dialogs, errors, accessibility labels, metadata, dates, prices, verification emails, Stripe Checkout, and the Billing Portal support Chinese, Dutch, English, and French.
- `test-fixtures/i18n.local.json` is the complete browser fallback schema. Azure Table values are optional non-empty overrides; a missing new language safely falls back to the bundled value during mixed-version rollout.
- The backend `airco_tracker/i18n_local.json` `web` scope is the production seed source and must remain value-for-value equivalent as a JSON map. The current contract contains 41 browser keys, each with exactly four non-empty languages.
- Retailer/product names and retailer-supplied delivery wording remain source evidence and are not machine-translated.

## Alert-recipient projection contract

Every Azure-backed user has a stable UUID `userId`. New users receive a random UUID; legacy rows deterministically backfill one with optimistic concurrency. Changing email preserves `userId`, so subscription and preference state remain attached to the same account.

Legacy email-key rows migrate to the UUID model deterministically. Public API responses strip the UUID, revision fields, and Stripe identifiers. Production fails closed if ACS is unavailable or canonical identity/entitlement cannot be proven.

Registration, verified-email/language/country changes, Stripe subscription events, cancellation, and account deletion synchronize the `alertrecipients` Table. The projection:

- uses exactly 32 partitions, `r-00`…`r-1f`;
- computes the shard as the last SHA-256 byte of `userId` modulo 32;
- stores only current email-delivery fields, language, delivery country, entitlement state, and synchronization metadata;
- excludes nickname, Stripe customer/subscription IDs, payment method, and card data;
- is deleted with the account.

The backend daily reconciler repairs partial cross-table failures and legacy rows from canonical `users`; it is not part of the per-event hot path. Changing the shard count or projection schema requires a coordinated, versioned migration in both repositories.

## Azure deployment and sender-domain selection

- The app reuses the backend Container Apps Environment, ACR, Storage Account, shared runtime identity, and ACS resources.
- The old storage-account-wide Table contributor assignment has been removed. The shared identity now has only the required per-table roles; real production OTP login, profile/projection writes, logout, retention, and scanner execution passed after narrowing.
- GitHub Actions uses branch-restricted OIDC and immutable commit-SHA images; no Azure client secret or `AZURE_CREDENTIALS` secret exists.
- `scripts/deploy.sh` selects an ACS Email Domain by exact `ACS_EMAIL_DOMAIN_NAME`, defaulting to `AzureManagedDomain`. `EMAIL_DOMAIN_ID` remains an explicit emergency/administrative override.
- Production now uses the verified customer-managed `airco-tracker.eu` ACS sender in both repositories; the Azure-managed domain remains the explicit fallback.
- The temporary operator Table-data permission used to seed and verify the four-language production rows has been revoked. Runtime and deploy identities retain only their scoped application permissions.
- Stripe secrets are supplied only by GitHub Actions or an explicitly configured local environment. Do not run a manual production deployment with missing Stripe configuration.

## Current verification state

The detailed subscription/payment matrix is maintained in `docs/SUBSCRIPTION_BILLING_TEST_PLAN.md` and `.en.md`. Production testing has covered initial Checkout, successful and failed cards, 3D Secure success/failure, cancellation at period end, upgrade, scheduled downgrade, switching billing interval, inventory entitlement gating, profile changes, language/country changes, email changes, logout/login persistence, and account-deletion rules.

The four-language release is deployed. It passed 71/71 frontend tests, app/server typecheck, production build, production-mode deployment verification, and `git diff --check`. French Landing, Subscribe, Login/nickname, Profile, and Unsubscribe states passed production visual checks at 1440×900 and 390×844 with no console errors or warnings. Header language changes preserve navigation while leaving the saved Profile preference unchanged; saving the Profile preference updates both the web default and alert-email language.

The fourth landing scene additionally passed local visual QA at 1440×900, 1024×768, 390×844, and 844×390 across Chinese, Dutch, English, and French. Production rechecks confirmed the staged email/live-stock transition, French and Chinese copy, optimized 1672×941 background, five stock data cards, subscription CTA, protected anonymous inventory behavior, and a clean browser console.

The fifth blue-hour landing scene passed local visual QA across all four languages at 1440×900, plus focused Chinese/English checks at 390×844 and 844×390. Production rechecks at 1440×900 and 390×844 confirmed the final headline/CTA layout, the 1672×941 optimized scene asset, no horizontal overflow, a clean browser console, immutable asset caching, and preserved anonymous inventory protection.

The subscription-bypass security hotfix passed 71/71 tests, app/server typecheck, production build, shell validation, `git diff --check`, and local plus custom-domain production smoke tests. Both retired auth subscription paths return 404. A privacy-preserving production audit found two current test-mode active entitlements; both have matching Stripe Customer and Subscription records, matching ownership, active/trialing status, and a future Stripe period end. No active entitlement missing Stripe identifiers was found.

The current production release is deployed and verified:

- Frontend workflow `29367033016` deployed security hotfix commit `db98ce8`; backend workflow `29167702065` remains on commit `e4194c2`. Their complete test, build, and deployment checks passed.
- Production runs ready web revision `airco-tracking-web--0000053` with provisioning state `Provisioned`, revision health `Healthy`, and 100% traffic.
- `https://airco-tracker.eu/health` and the `www` health endpoint return 200; anonymous `/api/inventory` returns 401.
- POST requests to the retired `/api/auth/subscription/preview-payment` and `/api/auth/subscription/cancel` endpoints return 404 in production.
- Production i18n Table contains 56 translation entries across the `web` and `email` scopes. Automated contracts confirm every key has exactly four non-empty `zh`/`nl`/`en`/`fr` values and that the frontend/backend web maps match.
- A real French OTP sent through the custom ACS sender reached an authorized Outlook inbox. A French alert-pipeline canary traversed the Service Bus pipeline to an authorized Gmail inbox and reached final status `delivered`.
- The language-preference test exercised Profile persistence and `alertrecipients` synchronization; the test account was restored to `zh` afterwards. Service Bus active, scheduled, and dead-letter counts were all zero after the canary, and the temporary operator Table permission was removed.

## Known limitations and next work

1. Google, Apple, and Microsoft login buttons are UI placeholders; only email-code login is functional.
2. Billing is still in Stripe test mode and card-first. iDEAL/Wero or other payment methods require a separate product and compliance pass.
3. Several delayed/duplicate webhook and subscription-expiry boundary scenarios remain deferred in the billing test plan.
4. Production uses the verified customer-managed `airco-tracker.eu` ACS sender. A higher-quota request remains open; keep the current one-worker/13-second limit and gradual domain warm-up until Azure approves it.
5. There is no committed Playwright visual/accessibility regression suite or dedicated production alert for repeated frontend/API failures.

## Resume checklist

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

Then verify the current GitHub Actions variables, Azure resource names, Stripe test-mode configuration, production responses, and the backend projection contract before changing code. UI work should be checked at 1440×900 and a narrow breakpoint; server/schema work must be coordinated with `~/airco-tracking`.
