# Heatwave Pass payment and entitlement test plan

<p align="center">
  <a href="./SUBSCRIPTION_BILLING_TEST_PLAN.md"><img alt="简体中文" src="https://img.shields.io/badge/TEST_PLAN-简体中文-d73a49"></a>
  <a href="./SUBSCRIPTION_BILLING_TEST_PLAN.en.md"><img alt="English" src="https://img.shields.io/badge/TEST_PLAN-English-0969da"></a>
</p>

Last updated: 2026-07-17

This document tracks end-to-end tests for the portal, login, one-time Stripe payments, 90-day entitlements, and realtime-inventory access control. Update the Chinese and English versions together whenever a scenario, status, or test note changes.

> Weekly/monthly subscription tests completed before 2026-07-09 remain available as historical evidence in Git, but they do not prove the new one-time Heatwave Pass implementation. The matrix below has therefore been reset for the new products.

Status: ✅ passed · ❌ failed · 🚧 partial/fix pending · ⬜ not tested · ⏸️ deferred

## Test configuration

- Site: `https://airco-tracker.eu`
- Stripe: Sandbox / test mode
- Webhook: Stripe destination `airco-tracker-pass-webhook` → `https://airco-tracker.eu/api/billing/webhook`
- The webhook subscribes to exactly eight events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `charge.refunded`, `refund.created`, `refund.updated`, `refund.failed`, `charge.dispute.created`, and `charge.dispute.closed`
- Payment method: phase one enables cards only. Stripe Checkout hosts card entry; Airco Tracker never reads or stores full card numbers.
- This remains Sandbox/test mode. Before accepting real payments, complete the compliance decisions and disclosures for VAT/tax, consumer withdrawal rights, refunds, terms/privacy, and checkout.

| Product | Entitlement | Price | Validity | Stripe test Price ID |
| --- | --- | ---: | ---: | --- |
| Heatwave Alerts Pass (`alerts`) | In-stock email alerts | €5 one time | 90 days | `price_1TtoNS0XRx7WeBOsNN5xPzlf` |
| Heatwave Radar Pass (`radar`) | Email + realtime inventory | €10 one time | 90 days | `price_1TtoCl0XRx7WeBOs3ATeEv0Y` |
| Alerts → Radar upgrade | Adds realtime inventory; retains the original expiry | €5 one time | Original Alerts expiry | `price_1TtoG10XRx7WeBOsvsvaarrD` |

Canonical entitlement state is expressed through `tier`, `status`, `purchasedAt`, `expiresAt`, and a minimal payment-receipt ledger. Stripe Customer, Checkout Session, and PaymentIntent identifiers must remain private server-side data and must not appear in the public profile or `alertrecipients` projection.

## P0: initial purchase and return

| Status | Scenario | Expected result | Record |
| --- | --- | --- | --- |
| ⬜ | Anonymous user selects either Pass | Complete login/new-user nickname first, then continue the originally selected payment flow | Not tested |
| ⬜ | Buy Alerts Pass | Stripe charges €5; 90 days of email entitlement starts immediately; realtime inventory remains blocked | Not tested |
| ⬜ | Buy Radar Pass | Stripe charges €10; 90 days of email and realtime-inventory entitlement starts immediately | Not tested |
| ⬜ | Cancel or return from Checkout | No entitlement or receipt is created; the user can retry safely | Not tested |
| ⬜ | Successful payment redirects back | Correct entitlement appears without a manual refresh through `sync-checkout-status` or webhook delivery | Not tested |
| ⬜ | Refresh, log out, and log back in | Tier, expiry, country, and language persist for the same user | Not tested |
| ⬜ | Active Alerts user selects Alerts again | Button is disabled and the server rejects a duplicate purchase | Not tested |
| ⬜ | Active Radar user selects either Pass | Radar is shown as owned and Alerts as included; the server rejects duplicate purchase/downgrade | Not tested |
| ⬜ | Inspect Stripe objects | Only one-time Checkout/PaymentIntent objects exist; no Subscription, renewal Invoice, or automatic charge is created | Not tested |

## P0: upgrade, expiry, and repurchase

| Status | Scenario | Expected result | Record |
| --- | --- | --- | --- |
| ⬜ | Active Alerts → Radar | Stripe charges €5; Radar starts immediately; `expiresAt` remains the original Alerts expiry | Not tested |
| ⬜ | Upgrade payment fails/is canceled | Existing Alerts entitlement remains; no Radar receipt is created | Not tested |
| ⬜ | Active Radar tries to downgrade or repurchase | UI offers no actionable button; API returns a conflict without creating Checkout | Not tested |
| ⬜ | Buy Radar during the final hour of Alerts | Product policy sells a fresh 90-day Radar pass instead of a nearly expired upgrade | Not tested |
| ⬜ | Exact expiry boundary | Access remains through the last instant before `expiresAt`; email projection and realtime access close at expiry | Not tested |
| ⬜ | Repurchase after expiry | Either Pass can be purchased and receives a fresh 90-day window from the new payment time | Not tested |
| ⬜ | Delete account with an active Pass | Server rejects deletion and clearly shows the expiry date | Not tested |
| ⬜ | Delete with no Pass or after expiry | Account, session, and alert projection are removed; Stripe payment records are not falsely erased | Not tested |

## P0: access control and preferences

| Status | Scenario | Expected result | Record |
| --- | --- | --- | --- |
| ⬜ | Anonymous user opens `/deliver-to/nl` or `/deliver-to/fr` | Inventory data stays hidden; user is guided to log in/buy | Not tested |
| ⬜ | Logged-in user has no active Pass | Inventory data stays hidden; user is guided to buy | Not tested |
| ⬜ | Active Alerts Pass | Ready confirms email alerts, but realtime inventory cannot be read | Not tested |
| ⬜ | Active Radar Pass | User enters the saved-country inventory page and sees only deliverable retailers | Not tested |
| ⬜ | Radar user changes country | Entitlement remains; route and retailer list change with delivery country | Not tested |
| ⬜ | Temporary header language switch | Current UI changes immediately without overwriting the saved Profile preference | Not tested |
| ⬜ | Save language in Profile | Profile, Ready, inventory, OTP/alert email, and Stripe locale agree | Not tested |

## P0: webhooks, refunds, and disputes

| Status | Scenario | Expected result | Record |
| --- | --- | --- | --- |
| ✅ | Missing/invalid Stripe signature | Webhook returns 400 and writes no user or entitlement data | 2026-07-17 production smoke: unsigned request returned 400 |
| ✅ | Webhook destination event allowlist | Listen only to the eight payment-completion, refund-lifecycle, and dispute-lifecycle events required | Exact `airco-tracker-pass-webhook` event set verified on 2026-07-17 |
| ⬜ | `checkout.session.completed` | Correct user, tier, amount, and PaymentIntent are resolved from server metadata and the actual Price | Not tested |
| ⬜ | `checkout.session.async_payment_succeeded` | Delayed payment grants access only after success; duplicate delivery remains idempotent | Not tested |
| ⬜ | Replay the event/repeat return sync | Receipt is written once and does not extend 90 days or duplicate entitlement | Not tested |
| ⬜ | Logged-in user syncs another user's Session | Request is rejected without leaking or changing the other user's entitlement | Not tested |
| ⬜ | Full refund of Alerts or Radar | Corresponding receipt becomes refunded and immediately stops contributing entitlement | Not tested |
| ⬜ | Refund Radar upgrade | Radar is revoked; the unrefunded, unexpired base Alerts entitlement is restored | Not tested |
| ⬜ | Refund the base Alerts behind an upgrade | Base and dependent upgrade stop granting access; no orphaned Radar remains | Not tested |
| ⬜ | Partial refund | Follow a documented support/refund policy; implementation and copy agree and never leave ambiguous entitlement | Policy pending final approval |
| ⬜ | `charge.dispute.created` | Revoke the related receipt immediately and record dispute state | Not tested |
| ⬜ | Won `charge.dispute.closed` | Restore only the still-valid, correctly owned receipt without extending expiry | Not tested |
| ⬜ | Failure/success/refund events arrive out of order | Receipt ledger converges to the final state and stale events cannot overwrite it | Not tested |
| ⏸️ | Concurrent purchases in multiple tabs | Final state keeps only legitimate receipts; duplicate purchase is refunded or rejected | Boundary test deferred |

## P1: payment failures and 3D Secure

| Status | Scenario | Expected result | Record |
| --- | --- | --- | --- |
| ⬜ | Generic decline `4000 0000 0000 0002` | Payment fails, no entitlement/receipt is created, and retry is safe | Not tested |
| ⬜ | Insufficient funds `4000 0000 0000 9995` | Stripe shows an understandable failure and no entitlement is granted | Not tested |
| ⬜ | 3D Secure `4000 0025 0000 3155` succeeds | Authentication completes, returns to the site, and grants the correct Pass | Not tested |
| ⬜ | 3D Secure fails/is canceled | No entitlement; an upgrade attempt preserves the existing Alerts Pass | Not tested |
| ⏸️ | Temporary Stripe API outage | UI shows retry state and the database contains no half-completed entitlement | Boundary test deferred |

## P1: legacy subscription migration and configuration cleanup

| Status | Scenario | Expected result | Record |
| --- | --- | --- | --- |
| ✅ | Existing test-mode weekly/monthly subscriptions | Set them to cancel at period end and prove no further automatic charge will occur | All three scheduled: two end 2026-08-09 and one ends 2026-08-08 |
| ✅ | Four old recurring Prices | Archive in Stripe and make them unreachable from the new UI/API | Archived on 2026-07-17 |
| 🚧 | GitHub/Azure configuration | Runtime uses only three one-time Price variables and legacy weekly/monthly/Portal configuration is ultimately removed | Azure has only the three new variables and GitHub has the three new variables; the account holder must complete GitHub sudo/2FA verification before deleting five legacy variables |
| ⬜ | Legacy user entitlement migration | Preserve only the previously paid legacy period; old subscription webhooks cannot overwrite new Pass receipts | Not tested |
| ✅ | Retired APIs | `/api/auth/subscription/preview-payment`, `/api/auth/subscription/cancel`, and `/api/billing/cancel-subscription` all return 404 | 2026-07-17 apex production smoke passed |

## P2: pre-release/production smoke

| Status | Scenario | Expected result | Record |
| --- | --- | --- | --- |
| ✅ | `/health` and `www` health | Return 200 and preserve the strict CSP | 2026-07-17 apex + www production smoke passed |
| ✅ | Anonymous `/api/inventory` | Returns 401 `not_authenticated` | 2026-07-17 production smoke passed |
| ⬜ | Amount/copy for both products and upgrade | Chinese, Dutch, English, and French show €5/€10/€5 and 90 days with no weekly/monthly/renewal/cancel-subscription copy | Pending visual QA |
| 🚧 | GitHub Actions + Azure environment | Three Price IDs match Stripe test mode; no secret appears in logs/frontend bundle; old variables are cleaned up | Azure retains only the three new variables and deployment passed; five old GitHub variables await account-holder sudo/2FA verification and deletion |
| ✅ | Automated test baseline | Web-server and targeted backend suites all pass | 2026-07-17: 113/113 server tests and 62/62 backend target tests |
| ⬜ | Production test-mode Alerts purchase | Payment, return, Profile, Ready, and alert projection are correct | Not tested |
| ⬜ | Production test-mode Radar purchase | Payment, return, Profile, Ready, and inventory access are correct | Not tested |
| ⬜ | Production test-mode upgrade | €5, immediate Radar, unchanged original expiry | Not tested |
| ✅ | Post-deploy automated verification | `scripts/verify-deployment.mjs` passes, including strict CSP, anonymous 401, and all three retired APIs returning 404 | Frontend workflow `29582313469` and backend `29567315723` passed; revision `airco-tracking-web--0000057` is Healthy/100% |

## Recommended execution order

1. Have the account holder complete GitHub sudo/2FA verification and delete the five obsolete variables without changing the three correctly deployed new variables.
2. With a fresh test user, buy Alerts, upgrade to Radar, then test refund/dispute fallback.
3. Clear or expire that test user, buy Radar directly, and verify the 90-day entitlement and realtime inventory.
4. Test 3D Secure, declined cards, exact expiry, out-of-order webhooks, and concurrency.
5. Separately verify legacy-entitlement migration when the three old subscriptions expire and prove stale events cannot overwrite Pass receipts.
6. Complete VAT/tax, withdrawal, refund, terms/privacy, and checkout-disclosure work before evaluating Stripe live mode.
