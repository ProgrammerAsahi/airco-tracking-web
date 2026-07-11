# Airco Tracking Web — current handoff

<p align="center">
  <a href="./HANDOFF.zh.md"><img alt="简体中文" src="https://img.shields.io/badge/HANDOFF-简体中文-d73a49"></a>
  <a href="./HANDOFF.md"><img alt="English" src="https://img.shields.io/badge/HANDOFF-English-0969da"></a>
</p>

Last updated: 2026-07-11 (Europe/Amsterdam)

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
- Deployed commit/image: `715acf223377d6b450a2a594e32eee0515a85797` in the shared private ACR
- Ready revision: `airco-tracking-web--0000041`; provisioning state `Succeeded`
- Successful deployment workflow run: `29061171454`
- Deployment workflow: `.github/workflows/deploy.yml`; Markdown/docs-only pushes do not deploy

Both custom web hostnames and their existing managed-certificate names are declared in `infra/app.bicep`. Do not remove those `customDomains` entries: an application Bicep deployment would otherwise clear the bindings.

## Implemented product experience

### Browser UI and routing

- `/` is the public heatwave-themed landing portal. Logged-in subscribers are directed to the cool Ready experience instead of being shown the acquisition portal again.
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
- Subscription cancellation preserves entitlement through the paid period. Account deletion is rejected while an active subscription still grants benefits.

### Internationalisation contract

- Application-owned browser text, dialogs, errors, accessibility labels, metadata, dates, prices, verification emails, Stripe Checkout, and the Billing Portal support Chinese, Dutch, English, and French.
- `test-fixtures/i18n.local.json` is the complete browser fallback schema. Azure Table values are optional non-empty overrides; a missing new language safely falls back to the bundled value during mixed-version rollout.
- The backend `airco_tracker/i18n_local.json` `web` scope is the production seed source and must remain value-for-value equivalent as a JSON map. The current contract contains 38 browser keys, each with exactly four non-empty languages.
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
- If a customer-managed ACS sender is later verified, link it in the backend foundation first, set the same `ACS_EMAIL_DOMAIN_NAME` GitHub variable in both repositories, and deploy. The Azure-managed domain remains the safe fallback until then.
- Stripe secrets are supplied only by GitHub Actions or an explicitly configured local environment. Do not run a manual production deployment with missing Stripe configuration.

## Current verification state

The detailed subscription/payment matrix is maintained in `docs/SUBSCRIPTION_BILLING_TEST_PLAN.md` and `.en.md`. Production testing has covered initial Checkout, successful and failed cards, 3D Secure success/failure, cancellation at period end, upgrade, scheduled downgrade, switching billing interval, inventory entitlement gating, profile changes, language/country changes, email changes, logout/login persistence, and account-deletion rules.

The four-language release candidate passes 71/71 frontend tests, app/server typecheck, production build, production-mode deployment verification, and `git diff --check`. French Landing, Subscribe, Profile, login/nickname, and unsubscribe states were visually checked at 1440×900 and 390×844; header language changes preserve navigation while leaving the saved Profile preference unchanged. Production deployment and real French OTP/stock-alert delivery are the remaining release checks.

The coordinated Service Bus release is deployed and verified:

- CI run `29061171454` passed 59/59 tests, typecheck, production build, shell/Bicep checks, and deployment verification.
- Production runs immutable image `715acf223377d6b450a2a594e32eee0515a85797` on ready revision `airco-tracking-web--0000041`.
- `https://airco-tracker.eu/health` and the `www` health endpoint return 200; anonymous `/api/inventory` returns 401.
- A real production OTP session exercised code creation/consumption, session creation/deletion, canonical user reads, a language write and restore, and `alertrecipients` synchronization after account-wide Table access was removed. All requests returned 200 and the original preference was restored.
- Backend targeted delivery reached two authorized inboxes, and a later real scanner run completed the restored Service Bus pipeline with zero active/scheduled/dead-letter messages.

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
