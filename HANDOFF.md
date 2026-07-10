# Airco Tracking Web — current handoff

<p align="center">
  <a href="./HANDOFF.zh.md"><img alt="简体中文" src="https://img.shields.io/badge/HANDOFF-简体中文-d73a49"></a>
  <a href="./HANDOFF.md"><img alt="English" src="https://img.shields.io/badge/HANDOFF-English-0969da"></a>
</p>

Last updated: 2026-07-10 (Europe/Amsterdam)

Update this English file and `HANDOFF.zh.md` together whenever current status, verification evidence, blockers, or next steps change. Do not record secrets, email addresses, access tokens, payment data, or unnecessary personal information.

## Current objective

Operate the public Airco Tracker portal, authenticated account experience, Stripe subscription flow, and country-aware inventory dashboard at `https://airco-tracker.eu/`. Anonymous users can view the portal and pricing; inventory under `/deliver-to/<country>` requires an active Realtime Radar (`priority`) entitlement.

The current coordinated frontend/backend change adds a stable user UUID and a minimal, 32-shard `alertrecipients` projection for the backend Azure Service Bus alert pipeline. Subscriber growth must not make the inventory scanner enumerate the canonical `users` table for every stock event.

## Repository and production

- Repository: `https://github.com/ProgrammerAsahi/airco-tracking-web`
- Branch/local path: `main`, `~/airco-tracking-web`
- Live URLs: `https://airco-tracker.eu/` and `https://www.airco-tracker.eu/`
- Container App: `airco-tracking-web`
- Azure resource group: `airco-tracker-rg`
- Backend repository: `https://github.com/ProgrammerAsahi/airco-tracking`
- Runtime image: `airco-tracking-web:<full-git-sha>` in the shared private ACR
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
- Interface language (`zh`, `nl`, or `en`) is independent from delivery country and can be switched in the header. The Profile preference is the persisted account default.

### Same-origin API, auth, and billing

- `server/server.ts` serves the Vite build and same-origin APIs. `/api/inventory` reads the private Blob through Managed Identity, validates schema version `1`, caches reads, and rate-limits low-effort abuse.
- Auth codes, sessions, and canonical user profiles are stored in Azure Table Storage. Codes are hashed, expire, have a resend cooldown and attempt limit, and are delivered through Azure Communication Services Email.
- Stripe uses hosted Checkout and Customer Portal; card numbers never touch the Airco Tracker server. Webhooks are signature-verified before subscription state is written.
- `/api/billing/sync-checkout-status` repairs a delayed Checkout webhook after the authenticated user returns. Plan changes are resolved from the actual Stripe Price rather than stale metadata.
- Subscription cancellation preserves entitlement through the paid period. Account deletion is rejected while an active subscription still grants benefits.

## Alert-recipient projection contract

Every Azure-backed user has a stable UUID `userId`. New users receive a random UUID; legacy rows deterministically backfill one with optimistic concurrency. Changing email preserves `userId`, so subscription and preference state remain attached to the same account.

Registration, verified-email/language/country changes, Stripe subscription events, cancellation, and account deletion synchronize the `alertrecipients` Table. The projection:

- uses exactly 32 partitions, `r-00`…`r-1f`;
- computes the shard as the last SHA-256 byte of `userId` modulo 32;
- stores only current email-delivery fields, language, delivery country, entitlement state, and synchronization metadata;
- excludes nickname, Stripe customer/subscription IDs, payment method, and card data;
- is deleted with the account.

The backend daily reconciler repairs partial cross-table failures and legacy rows from canonical `users`; it is not part of the per-event hot path. Changing the shard count or projection schema requires a coordinated, versioned migration in both repositories.

## Azure deployment and sender-domain selection

- The app reuses the backend Container Apps Environment, ACR, Storage Account, shared runtime identity, and ACS resources.
- GitHub Actions uses branch-restricted OIDC and immutable commit-SHA images; no Azure client secret or `AZURE_CREDENTIALS` secret exists.
- `scripts/deploy.sh` selects an ACS Email Domain by exact `ACS_EMAIL_DOMAIN_NAME`, defaulting to `AzureManagedDomain`. `EMAIL_DOMAIN_ID` remains an explicit emergency/administrative override.
- If a customer-managed ACS sender is later verified, link it in the backend foundation first, set the same `ACS_EMAIL_DOMAIN_NAME` GitHub variable in both repositories, and deploy. The Azure-managed domain remains the safe fallback until then.
- Stripe secrets are supplied only by GitHub Actions or an explicitly configured local environment. Do not run a manual production deployment with missing Stripe configuration.

## Current verification state

The detailed subscription/payment matrix is maintained in `docs/SUBSCRIPTION_BILLING_TEST_PLAN.md` and `.en.md`. Production testing has covered initial Checkout, successful and failed cards, 3D Secure success/failure, cancellation at period end, upgrade, scheduled downgrade, switching billing interval, inventory entitlement gating, profile changes, language/country changes, email changes, logout/login persistence, and account-deletion rules.

For this coordinated Service Bus release, complete before marking it released:

```bash
cd ~/airco-tracking-web
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
bash -n scripts/*.sh
az bicep build --file infra/app.bicep --stdout >/dev/null
git diff --check
```

Then deploy the immutable frontend SHA, run `scripts/verify-deployment.mjs` against production, and confirm that registration/profile/subscription writes keep `alertrecipients` synchronized with the same stable user UUID. Record the final frontend SHA and GitHub run here after rollout.

## Known limitations and next work

1. Google, Apple, and Microsoft login buttons are UI placeholders; only email-code login is functional.
2. Billing is still in Stripe test mode and card-first. iDEAL/Wero or other payment methods require a separate product and compliance pass.
3. Several delayed/duplicate webhook and subscription-expiry boundary scenarios remain deferred in the billing test plan.
4. The current Azure-managed ACS sender quota is suitable only for low-volume testing. Customer-managed sender verification and a quota increase are required before broad onboarding.
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
