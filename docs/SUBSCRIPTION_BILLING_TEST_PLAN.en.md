# Subscription and Stripe Payment Test Scenarios

<p align="center">
  <a href="./SUBSCRIPTION_BILLING_TEST_PLAN.md"><img alt="简体中文" src="https://img.shields.io/badge/docs-简体中文-d73a49"></a>
  <a href="./SUBSCRIPTION_BILLING_TEST_PLAN.en.md"><img alt="English" src="https://img.shields.io/badge/docs-English-0969da"></a>
</p>

Last updated: 2026-07-08

## Maintenance rule

This document tracks end-to-end tests for the portal, login, subscriptions, Stripe payments, and inventory access controls. Whenever a scenario, status, or test note is added or changed, update both language versions together:

- `docs/SUBSCRIPTION_BILLING_TEST_PLAN.md`
- `docs/SUBSCRIPTION_BILLING_TEST_PLAN.en.md`

Status markers:

- ✅ Completed and verified
- ⬜ Not tested yet
- 🚧 Requires implementation or functional confirmation before testing

## Current test environment

- Production site: [https://airco-tracker.eu](https://airco-tracker.eu)
- Stripe mode: Sandbox / test mode
- Stripe webhook: `https://airco-tracker.eu/api/billing/webhook`
- Subscription plans:

| Internal plan | Display name | Price | Stripe Price ID |
| --- | --- | --- | --- |
| `weekly_basic` | Weekly · Inventory Alerts | €10 / week | `price_1Tqti10XRx7WeBOsbaTiCY5v` |
| `weekly_priority` | Weekly · Realtime Radar | €20 / week | `price_1TqtlM0XRx7WeBOsaBF2uQSo` |
| `monthly_basic` | Monthly · Inventory Alerts | €15 / month | `price_1Tqtj20XRx7WeBOsdnuL3Hwb` |
| `monthly_priority` | Monthly · Realtime Radar | €30 / month | `price_1Tqtm80XRx7WeBOsvTwtW4nM` |

## P0: Purchase, return flow, and entitlements

| Status | Scenario | Expected result | Notes |
| --- | --- | --- | --- |
| ⬜ | Anonymous user clicks “Select plan” on `/subscribe` | The login card opens first; after login, the selected plan continues to payment | The old “Log in before choosing a plan / Back to homepage” banner should not appear |
| ⬜ | Logged-in user clicks “Select plan” on `/subscribe` | The user goes directly to Stripe Checkout or the payment card, without another login prompt | Test all four plans |
| ✅ | Buy `monthly_priority` with a test card | Stripe Checkout succeeds; after returning to the site, the user receives `monthly_priority` entitlements | Completed on 2026-07-08 with a test card; subscription status appeared correctly after refresh |
| ⬜ | Buy `weekly_priority` with a test card | The user receives realtime inventory access for one week | Not tested yet |
| ⬜ | Buy `weekly_basic` with a test card | The user receives inventory alert emails only and cannot access realtime inventory pages | Not tested yet |
| ⬜ | Buy `monthly_basic` with a test card | The user receives inventory alert emails only and cannot access realtime inventory pages | Not tested yet |
| ✅ | Cancel or go back during Checkout | The user returns to the subscription page; the database still shows no active subscription; no entitlement is granted accidentally | Verified in production on 2026-07-09: returning from Checkout lands on the subscription page; Profile shows no subscription and no entitlement is granted |
| ⬜ | After successful payment, wait for the return sync without refreshing | The page automatically syncs the Stripe checkout session and shows the correct entitlement | Fix is deployed; needs a new payment to verify |
| ✅ | Refresh after successful payment | Subscription status still appears correctly | Verified in production on 2026-07-08 |
| ⬜ | Existing active subscriber selects an equivalent plan again | The system should not create duplicate active subscriptions; it should show the existing subscription or enter a change-plan flow | Not tested yet |

## P0: Cancellation, renewal, and plan changes

| Status | Scenario | Expected result | Notes |
| --- | --- | --- | --- |
| ✅ | User cancels the current subscription | Stripe is set to cancel at period end; entitlement remains active until the end of the current period | Verified in production on 2026-07-08: user table shows `subscriptionCancelAtPeriodEnd=true`, with `monthly_priority` valid until 2026-08-08T13:31:16Z |
| ✅ | Open Profile after cancellation | Profile shows cancellation state and entitlement end date; payment summary remains visible | Verified in production on 2026-07-08: Profile blocks account deletion during the valid period; user table keeps VISA ending 4242 and the period end |
| ✅ | Access entitled pages after cancellation | The purchased entitlement remains usable before the period ends | Verified in production on 2026-07-08: Ready page still shows the inventory entry point and `/deliver-to/fr` realtime inventory remains accessible |
| ⬜ | Access entitled pages after the period ends | Subscription expires; realtime inventory entry is closed; user can subscribe again | Not tested yet; can use Stripe Test Clock |
| ✅ | Upgrade from Inventory Alerts to Realtime Radar | Upgrade should take effect immediately | Verified in production on 2026-07-08: `weekly_basic` → `monthly_priority` updated the existing Stripe subscription, and the user table synced to `monthly_priority active` without creating a duplicate subscription |
| ✅ | Downgrade from Realtime Radar to Inventory Alerts | Downgrade should apply at period end while the current entitlement remains active | Verified in production on 2026-07-09: downgrading from `monthly_priority` to a basic plan completes in one click; Ready still allows inventory access; the subscription card shows the switch to basic scheduled for the current period end |
| ✅ | Switch between weekly and monthly billing | Apply the chosen product policy without creating duplicate subscriptions | Verified in production on 2026-07-09: switching to `weekly_priority` while a pending downgrade exists takes effect immediately and Profile no longer shows the future downgrade note |

## P0: Inventory access, country, and language

| Status | Scenario | Expected result | Notes |
| --- | --- | --- | --- |
| ✅ | Anonymous user opens `/deliver-to/nl` or `/deliver-to/fr` | Inventory data is hidden; user is guided to log in or subscribe | Verified in production on 2026-07-08: after logout, direct inventory-page access redirects to the subscription page |
| ✅ | User without a subscription opens `/deliver-to/nl` or `/deliver-to/fr` | Inventory data is hidden; user is guided to subscribe | Verified in production on 2026-07-08: after re-registering without a subscription, direct inventory-page access redirects to the subscription page |
| ✅ | `basic` user opens a realtime inventory page | Inventory data is hidden; page explains the plan only includes email alerts | Verified in production on 2026-07-08: after subscribing to a basic plan, direct inventory-page access is blocked and realtime inventory remains hidden |
| ✅ | `priority` user opens a realtime inventory page | User lands on `/deliver-to/nl` or `/deliver-to/fr` based on the saved country and sees deliverable retailers | Verified in production on 2026-07-08: after switching to priority, realtime inventory is accessible and deliverable retailers are visible |
| ✅ | Switch language on the Ready page | Chinese, English, and Dutch switch immediately without changing delivery country | Verified in production on 2026-07-09: the Ready page language switcher works |
| ✅ | Switch language on `/deliver-to/*` | Chinese, English, and Dutch switch immediately without changing delivery country | Verified in production on 2026-07-09: the inventory page language switcher works |
| ✅ | Switch language from the Profile page header | Only the current Profile page display language changes; the account default language preference is not overwritten automatically; the dropdown is not hidden behind the card | Verified in production on 2026-07-09: the Profile header language switcher works and the dropdown is no longer hidden behind the card |
| ✅ | Change country in Profile | After confirmation, saved country changes and future inventory entry points use that country | Verified in production on 2026-07-09: switching between France and the Netherlands works both ways, including confirmation and future entry points |

## P0: Stripe webhook and sync safety

| Status | Scenario | Expected result | Notes |
| --- | --- | --- | --- |
| ✅ | Call webhook without a Stripe signature | Returns 400 and does not process any state change | Verified in production on 2026-07-08 |
| ⬜ | `checkout.session.completed` webhook | Correctly links the current user, Stripe customer, and subscription | Needs a new checkout to verify |
| ⬜ | `customer.subscription.updated` webhook | Correctly updates plan, status, cancel flag, period end, and payment method summary | Not tested yet |
| ⬜ | `customer.subscription.deleted` webhook | Correctly removes entitlement while preserving necessary historical data | Not tested yet |
| ⬜ | Webhook is delayed or missed and the user returns from Checkout | `/api/billing/sync-checkout-status` pulls the state from Stripe and repairs the database | Fix is deployed; needs a new checkout to verify |
| 🚧 | Duplicate webhook events | Duplicate events should not cause dangerous repeated writes or duplicate subscriptions | Need to confirm whether an event de-duplication table is required |
| ⬜ | Logged-in user tries to sync another user’s checkout session | Backend rejects the request and does not leak subscription data | Not tested yet |
| ✅ | Anonymous user calls checkout sync API | Returns 401 | Verified in production on 2026-07-08 |

## P1: Profile, email, and account lifecycle

| Status | Scenario | Expected result | Notes |
| --- | --- | --- | --- |
| ⬜ | New user registers with email code | User is created/logged in only with a valid code; first login opens the nickname card | Not tested yet |
| ✅ | Send-code button countdown | After clicking, the button is disabled for 60 seconds; it can be used again after the countdown | Verified in production on 2026-07-09: countdown behavior works |
| ✅ | Change nickname | The “What should we call you?” card opens; after saving, avatar initials update | Verified in production on 2026-07-09: avatar initials update after nickname changes |
| ⬜ | Change email | After verifying the new email code, stable user ID remains unchanged and email field updates | Not tested yet |
| ⬜ | Delete account with an active subscription | Backend rejects deletion and explains cancellation plus expiry is required first | Not tested yet |
| ⬜ | Delete account with no subscription or after expiry | User profile and sessions are cleared; paid entitlements are no longer accessible | Not tested yet |
| ✅ | Log out and log back in | Subscription, country, language, nickname, and payment summary remain correct | Verified in production on 2026-07-09: profile and subscription data persist after logout/login |

## P1: Payment failures and edge cases

| Status | Scenario | Expected result | Notes |
| --- | --- | --- | --- |
| ✅ | Stripe test card payment fails | User still has no subscription; page shows an understandable failure/retry state | Verified in production on 2026-07-09: both `4000 0000 0000 0341` and `4000 0000 0000 0002` are declined by Stripe; after returning to the site, the user has no entitlement and no inventory access |
| ⬜ | Test card requires 3D Secure | Successful authentication grants entitlement; failed authentication does not | Not tested yet |
| ⬜ | Checkout session expires | Returning user sees a state that allows choosing a plan again | Not tested yet |
| ⬜ | Temporary Stripe API failure | Frontend shows retry/error state; database does not write a partially active subscription | Not tested yet |
| ⬜ | User starts payments in multiple tabs | Final state keeps only one valid subscription and does not overwrite data incorrectly | Not tested yet |

## P2: Production release regression

| Status | Scenario | Expected result | Notes |
| --- | --- | --- | --- |
| ✅ | `/health` | Returns 200 | Verified in production on 2026-07-08 |
| ✅ | `/ready?lang=zh` | Returns 200 | Verified in production on 2026-07-08 |
| ✅ | Latest frontend bundle is loaded by production | Browser loads the new build artifact | New bundle observed on 2026-07-08 |
| ⬜ | `/subscribe?lang=zh/en/nl` | All three language pages load and plan buttons behave consistently | Not tested yet |
| ⬜ | `/profile?lang=zh/en/nl` | All three language pages load with consistent profile and subscription cards | Not tested yet |
| ⬜ | `/deliver-to/nl?lang=zh/en/nl` | All three language inventory pages load and language switching works | Not tested yet |
| ⬜ | `/deliver-to/fr?lang=zh/en/nl` | All three language inventory pages load and language switching works | Not tested yet |

## Recommended test order

1. Test cancellation for the current `monthly_priority` subscription first.
2. Run one fresh end-to-end purchase with a new user to verify automatic sync without refresh.
3. Purchase `weekly_basic`, `monthly_basic`, and `weekly_priority` separately to confirm entitlement differences.
4. Use Stripe Test Clock to verify period end, cancellation-after-period, and renewal.
5. After the plan-change flow is implemented/confirmed, test upgrades, downgrades, and weekly/monthly switches.
