import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSubscriptionUpdatePortalSessionParams,
  isSubscriptionPaymentActionRequired,
  portalConfigurationSupportsSubscriptionUpdates,
  resolveSubscriptionPlan,
} from "./billing.js";

test("treats Stripe subscription update action-required errors as recoverable", () => {
  for (const code of [
    "subscription_payment_intent_requires_action",
    "invoice_payment_intent_requires_action",
    "payment_intent_action_required",
    "authentication_required",
  ]) {
    assert.equal(
      isSubscriptionPaymentActionRequired({ code, statusCode: 402 }),
      true,
      code,
    );
  }
});

test("detects action-required payment intents nested in Stripe errors", () => {
  assert.equal(
    isSubscriptionPaymentActionRequired({
      statusCode: 402,
      raw: {
        code: "some_future_stripe_code",
        payment_intent: {
          status: "requires_action",
        },
      },
    }),
    true,
  );
});

test("detects Stripe authentication-required soft declines", () => {
  assert.equal(
    isSubscriptionPaymentActionRequired({
      code: "card_declined",
      decline_code: "authentication_required",
      statusCode: 402,
    }),
    true,
  );
  assert.equal(
    isSubscriptionPaymentActionRequired({
      code: "card_declined",
      raw: { decline_code: "authentication_required" },
      statusCode: 402,
    }),
    true,
  );
});

test("does not treat ordinary card declines as subscription action-required errors", () => {
  assert.equal(
    isSubscriptionPaymentActionRequired({
      code: "card_declined",
      statusCode: 402,
      raw: {
        payment_intent: {
          status: "requires_payment_method",
        },
      },
    }),
    false,
  );
});

test("builds a subscription update portal session with an explicit configuration", () => {
  assert.deepEqual(
    buildSubscriptionUpdatePortalSessionParams({
      configurationId: "bpc_test",
      customer: "cus_test",
      itemId: "si_test",
      price: "price_target",
      quantity: 1,
      returnUrl: "https://example.test/ready",
      subscriptionId: "sub_test",
    }),
    {
      configuration: "bpc_test",
      customer: "cus_test",
      return_url: "https://example.test/ready",
      flow_data: {
        type: "subscription_update_confirm",
        subscription_update_confirm: {
          subscription: "sub_test",
          items: [{ id: "si_test", price: "price_target", quantity: 1 }],
        },
        after_completion: {
          type: "redirect",
          redirect: { return_url: "https://example.test/ready" },
        },
      },
    },
  );
});

test("only accepts active portal configurations with immediate price updates", () => {
  const configuration = {
    active: true,
    features: {
      subscription_update: {
        default_allowed_updates: ["price"],
        enabled: true,
        proration_behavior: "always_invoice",
      },
    },
  };

  assert.equal(portalConfigurationSupportsSubscriptionUpdates(configuration), true);
  assert.equal(portalConfigurationSupportsSubscriptionUpdates({ ...configuration, active: false }), false);
  assert.equal(
    portalConfigurationSupportsSubscriptionUpdates({
      ...configuration,
      features: { subscription_update: { ...configuration.features.subscription_update, enabled: false } },
    }),
    false,
  );
  assert.equal(
    portalConfigurationSupportsSubscriptionUpdates({
      ...configuration,
      features: { subscription_update: { ...configuration.features.subscription_update, proration_behavior: "none" } },
    }),
    false,
  );
});

test("resolves the actual Stripe price before stale subscription metadata", () => {
  const priceIds = {
    weekly_basic: "price_weekly_basic",
    monthly_priority: "price_monthly_priority",
  } as const;

  assert.equal(
    resolveSubscriptionPlan({
      fallbackPlan: "weekly_basic",
      metadataPlan: "weekly_basic",
      priceId: "price_monthly_priority",
      priceIds,
    }),
    "monthly_priority",
  );
  assert.equal(
    resolveSubscriptionPlan({
      metadataPlan: "weekly_basic",
      priceId: "price_unknown",
      priceIds,
    }),
    "weekly_basic",
  );
});
