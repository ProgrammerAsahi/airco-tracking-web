import assert from "node:assert/strict";
import test from "node:test";
import { isSubscriptionPaymentActionRequired } from "./billing.js";

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
