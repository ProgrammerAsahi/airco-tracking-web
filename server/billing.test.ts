import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import test from "node:test";
import type Stripe from "stripe";
import {
  AuthHttpError,
  AuthService,
  activePassBaseReceiptId,
  type StoredUserProfile,
  type StripePassPurchase,
} from "./auth.js";
import {
  StripeBillingService,
  passExpirationForCheckout,
  selectPassCheckout,
  stripeLocale,
} from "./billing.js";

const USER_ID = "95bc3d32-8f2e-4cf0-a924-731efb4ebcf2";
const ALERTS_PRICE = "price_alerts";
const RADAR_PRICE = "price_radar";
const UPGRADE_PRICE = "price_radar_upgrade";
const PURCHASED_AT = "2099-01-01T00:00:00.000Z";
const EXPIRES_AT = "2099-04-01T00:00:00.000Z";

function testUser(overrides: Partial<StoredUserProfile> = {}): StoredUserProfile {
  return {
    userId: USER_ID,
    profileRevision: 1,
    email: "pass-user@example.test",
    nickname: "Pass User",
    emailAlertsEnabled: true,
    emailAlertsTokenVersion: 1,
    entitlementTier: "none",
    entitlementStatus: "none",
    entitlementExpiresAt: null,
    entitlementPurchasedAt: null,
    paymentMethod: null,
    paymentBrand: null,
    paymentLast4: null,
    stripeCustomerId: null,
    passReceipts: [],
    languagePreference: "en",
    deliveryCountry: "fr",
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    ...overrides,
  };
}

function alertsReceipt(overrides: Partial<StoredUserProfile["passReceipts"][number]> = {}) {
  return {
    id: "pi_alerts",
    kind: "purchase" as const,
    tier: "alerts" as const,
    baseReceiptId: null,
    purchasedAt: PURCHASED_AT,
    expiresAt: EXPIRES_AT,
    status: "active" as const,
    paymentBrand: "VISA",
    paymentLast4: "4242",
    ...overrides,
  };
}

function activeAlertsUser(overrides: Partial<StoredUserProfile> = {}): StoredUserProfile {
  return testUser({
    entitlementTier: "alerts",
    entitlementStatus: "active",
    entitlementExpiresAt: EXPIRES_AT,
    entitlementPurchasedAt: PURCHASED_AT,
    paymentMethod: "card",
    paymentBrand: "VISA",
    paymentLast4: "4242",
    passReceipts: [alertsReceipt()],
    ...overrides,
  });
}

const prices = {
  priceIds: { alerts: ALERTS_PRICE, radar: RADAR_PRICE },
  radarUpgradePriceId: UPGRADE_PRICE,
};

function assertAuthError(code: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof AuthHttpError && error.code === code;
}

async function createPassAuthContext() {
  const context = await createAuthenticatedUser();
  const user = await context.auth.attachStripeCustomer(context.request, "cus_ledger");
  return { ...context, user };
}

async function createAuthenticatedUser() {
  const auth = new AuthService({ exposeDevCode: true });
  const issued = await auth.requestCode("ledger@example.test", "en");
  assert.ok(issued.devCode);
  const verified = await auth.verifyCode("ledger@example.test", issued.devCode, "en");
  const request = {
    headers: { cookie: `${auth.cookieName}=${verified.sessionToken}` },
  } as IncomingMessage;
  return { auth, request, user: verified.user };
}

function passPurchase(
  user: StoredUserProfile,
  overrides: Partial<StripePassPurchase> = {},
): StripePassPurchase {
  return {
    userId: user.userId,
    stripeCustomerId: "cus_ledger",
    stripePaymentIntentId: "pi_alerts",
    kind: "purchase",
    baseReceiptId: null,
    tier: "alerts",
    purchasedAt: PURCHASED_AT,
    expiresAt: EXPIRES_AT,
    paymentBrand: "VISA",
    paymentLast4: "4242",
    ...overrides,
  };
}

type FakeStripeCalls = {
  checkoutCreates: Array<{
    params: Stripe.Checkout.SessionCreateParams;
    options?: Stripe.RequestOptions;
  }>;
  customerCreates: Array<{
    params: Stripe.CustomerCreateParams;
    options?: Stripe.RequestOptions;
  }>;
  refunds: Array<{
    params: Stripe.RefundCreateParams;
    options?: Stripe.RequestOptions;
  }>;
};

type FakeStripeState = {
  charges: Map<string, Stripe.Charge>;
  checkoutSessions: Stripe.Checkout.Session[];
  disputes: Map<string, Stripe.Dispute>;
  paymentIntents: Map<string, Stripe.PaymentIntent>;
  refundCreateResults: Stripe.Refund[];
  webhookEvent: Stripe.Event | null;
};

function paidPassSession(options: {
  amount?: number;
  baseReceiptId?: string | null;
  chargeId?: string;
  customerId?: string | null;
  disputed?: boolean;
  expiresAt?: string;
  kind?: "purchase" | "upgrade";
  paymentIntentId?: string;
  priceId?: string;
  purchasedAt?: string;
  refunded?: boolean;
  sessionId?: string;
  tier?: "alerts" | "radar" | "invalid";
  userId?: string;
} = {}): { lineItems: Stripe.LineItem[]; session: Stripe.Checkout.Session } {
  const amount = options.amount ?? 500;
  const customerId = options.customerId === undefined ? "cus_ledger" : options.customerId;
  const kind = options.kind ?? "purchase";
  const paymentIntentId = options.paymentIntentId ?? "pi_paid";
  const tier = options.tier ?? "alerts";
  const userId = options.userId ?? USER_ID;
  const created = Math.floor(Date.parse(options.purchasedAt ?? PURCHASED_AT) / 1000);
  const charge = {
    id: options.chargeId ?? "ch_paid",
    amount,
    amount_captured: amount,
    created,
    currency: "eur",
    customer: customerId,
    disputed: options.disputed ?? false,
    object: "charge",
    paid: true,
    payment_intent: paymentIntentId,
    refunded: options.refunded ?? false,
  } as unknown as Stripe.Charge;
  const paymentIntent = {
    id: paymentIntentId,
    amount_received: amount,
    created,
    latest_charge: charge,
    object: "payment_intent",
    payment_method: {
      id: "pm_card",
      card: { brand: "visa", last4: "4242" },
      object: "payment_method",
      type: "card",
    },
    status: "succeeded",
  } as unknown as Stripe.PaymentIntent;
  const metadata: Record<string, string> = {
    airco_user_id: userId,
    airco_entitlement_tier: tier,
    airco_purchase_kind: kind,
    airco_entitlement_expires_at: options.expiresAt ?? (kind === "upgrade" ? EXPIRES_AT : ""),
    airco_base_receipt_id: options.baseReceiptId ?? (kind === "upgrade" ? "pi_alerts" : ""),
  };
  const session = {
    id: options.sessionId ?? "cs_test_paid",
    amount_total: amount,
    client_reference_id: userId,
    currency: "eur",
    customer: customerId,
    metadata,
    mode: "payment",
    object: "checkout.session",
    payment_intent: paymentIntent,
    payment_status: "paid",
    status: "complete",
  } as unknown as Stripe.Checkout.Session;
  const lineItems = [{
    id: "li_pass",
    amount_total: amount,
    currency: "eur",
    object: "item",
    price: { id: options.priceId ?? (kind === "upgrade" ? UPGRADE_PRICE : ALERTS_PRICE) },
    quantity: 1,
  }] as unknown as Stripe.LineItem[];
  return { lineItems, session };
}

function billingServiceWithFakeStripe(
  auth: AuthService,
  lineItems: Stripe.LineItem[] = paidPassSession().lineItems,
  initialState: Partial<Omit<FakeStripeState, "charges" | "disputes" | "paymentIntents">> & {
    charges?: Iterable<[string, Stripe.Charge]>;
    disputes?: Iterable<[string, Stripe.Dispute]>;
    paymentIntents?: Iterable<[string, Stripe.PaymentIntent]>;
  } = {},
): { calls: FakeStripeCalls; service: StripeBillingService; state: FakeStripeState } {
  const calls: FakeStripeCalls = {
    checkoutCreates: [],
    customerCreates: [],
    refunds: [],
  };
  const state: FakeStripeState = {
    charges: new Map(initialState.charges),
    checkoutSessions: initialState.checkoutSessions ?? [],
    disputes: new Map(initialState.disputes),
    paymentIntents: new Map(initialState.paymentIntents),
    refundCreateResults: initialState.refundCreateResults ?? [],
    webhookEvent: initialState.webhookEvent ?? null,
  };
  const fakeStripe = {
    checkout: {
      sessions: {
        async create(params: Stripe.Checkout.SessionCreateParams, options?: Stripe.RequestOptions) {
          calls.checkoutCreates.push({ params, options });
          return { id: "cs_test_created", url: "https://checkout.stripe.test/session" };
        },
        async expire() {
          return {};
        },
        async retrieve(sessionId: string) {
          const session = state.checkoutSessions.find((candidate) => candidate.id === sessionId);
          if (!session) throw new Error(`Missing fake Checkout Session ${sessionId}`);
          return session;
        },
        async list(params?: Stripe.Checkout.SessionListParams) {
          if (params?.payment_intent) {
            return {
              data: state.checkoutSessions.filter((candidate) => (
                stripeTestObjectId(candidate.payment_intent) === params.payment_intent
              )),
              has_more: false,
            };
          }
          if (params?.status === "complete") {
            return {
              data: state.checkoutSessions.filter((candidate) => candidate.status === "complete"),
              has_more: false,
            };
          }
          return { data: [], has_more: false };
        },
        async listLineItems() {
          return { data: lineItems };
        },
      },
    },
    customers: {
      async create(params: Stripe.CustomerCreateParams, options?: Stripe.RequestOptions) {
        calls.customerCreates.push({ params, options });
        return { id: "cus_ledger" };
      },
      async update() {
        return {};
      },
    },
    refunds: {
      async create(params: Stripe.RefundCreateParams, options?: Stripe.RequestOptions) {
        calls.refunds.push({ params, options });
        return state.refundCreateResults.shift() ?? { id: "re_test", status: "succeeded" };
      },
    },
    charges: {
      async retrieve(chargeId: string) {
        const charge = state.charges.get(chargeId);
        if (!charge) throw new Error(`Missing fake Charge ${chargeId}`);
        return charge;
      },
    },
    paymentIntents: {
      async retrieve(paymentIntentId: string) {
        const paymentIntent = state.paymentIntents.get(paymentIntentId);
        if (!paymentIntent) throw new Error(`Missing fake PaymentIntent ${paymentIntentId}`);
        return paymentIntent;
      },
    },
    disputes: {
      async retrieve(disputeId: string) {
        const dispute = state.disputes.get(disputeId);
        if (!dispute) throw new Error(`Missing fake Dispute ${disputeId}`);
        return dispute;
      },
      async list(params: Stripe.DisputeListParams) {
        return {
          data: [...state.disputes.values()].filter((dispute) => (
            stripeTestObjectId(dispute.charge) === params.charge
          )),
        };
      },
    },
    webhooks: {
      constructEvent() {
        if (!state.webhookEvent) throw new Error("Missing fake webhook event");
        return state.webhookEvent;
      },
    },
  } as unknown as Stripe;
  const service = new StripeBillingService(auth, {
    appBaseUrl: "https://airco-tracker.example.test",
    priceIds: prices.priceIds,
    radarUpgradePriceId: UPGRADE_PRICE,
    webhookSecret: "whsec_test",
  });
  Object.defineProperty(service, "stripe", { value: fakeStripe });
  return { calls, service, state };
}

function stripeTestObjectId(value: string | { id?: string } | null | undefined): string {
  return typeof value === "string" ? value : value?.id ?? "";
}

function chargeFromSession(session: Stripe.Checkout.Session): Stripe.Charge {
  return paymentIntentFromSession(session).latest_charge as Stripe.Charge;
}

function paymentIntentFromSession(session: Stripe.Checkout.Session): Stripe.PaymentIntent {
  return session.payment_intent as Stripe.PaymentIntent;
}

function fakeDispute(options: {
  chargeId: string;
  id?: string;
  status: Stripe.Dispute.Status;
}): Stripe.Dispute {
  return {
    id: options.id ?? "dp_test",
    charge: options.chargeId,
    object: "dispute",
    status: options.status,
  } as Stripe.Dispute;
}

function fakeWebhookEvent(type: Stripe.Event.Type, object: Stripe.Event.Data.Object): Stripe.Event {
  return {
    id: `evt_${type.replaceAll(".", "_")}`,
    data: { object },
    object: "event",
    type,
  } as Stripe.Event;
}

async function deliverWebhook(
  service: StripeBillingService,
  state: FakeStripeState,
  event: Stripe.Event,
): Promise<void> {
  state.webhookEvent = event;
  assert.deepEqual(await service.handleWebhook(fakeWebhookRequest()), { received: true });
}

function fakeWebhookRequest(): IncomingMessage {
  const request = Object.assign(Readable.from(["{}"]), {
    headers: { "stripe-signature": "sig_test" },
  }) as unknown as IncomingMessage;
  return request;
}

async function syncPaidSession(
  service: StripeBillingService,
  session: Stripe.Checkout.Session,
): Promise<StoredUserProfile | null> {
  return (service as unknown as {
    syncCheckoutSession(value: Stripe.Checkout.Session): Promise<StoredUserProfile | null>;
  }).syncCheckoutSession(session);
}

test("maps every supported site language to a Stripe locale", () => {
  assert.equal(stripeLocale("zh"), "zh");
  assert.equal(stripeLocale("nl"), "nl");
  assert.equal(stripeLocale("en"), "en");
  assert.equal(stripeLocale("fr"), "fr");
});

test("creates a new Alerts or Radar pass checkout with its configured one-time price", () => {
  const user = testUser();
  assert.deepEqual(selectPassCheckout(user, "alerts", prices), {
    baseReceiptId: null,
    expiresAt: null,
    kind: "purchase",
    priceId: ALERTS_PRICE,
  });
  assert.deepEqual(selectPassCheckout(user, "radar", prices), {
    baseReceiptId: null,
    expiresAt: null,
    kind: "purchase",
    priceId: RADAR_PRICE,
  });
});

test("rejects a pass checkout when its Stripe price is not configured", () => {
  assert.throws(
    () => selectPassCheckout(testUser(), "alerts", { priceIds: {} }),
    assertAuthError("stripe_price_not_configured"),
  );
});

test("uses the upgrade price and preserves the active Alerts expiry and root receipt", () => {
  const now = Date.parse("2099-01-10T00:00:00.000Z");
  assert.deepEqual(selectPassCheckout(activeAlertsUser(), "radar", prices, now), {
    baseReceiptId: "pi_alerts",
    expiresAt: EXPIRES_AT,
    kind: "upgrade",
    priceId: UPGRADE_PRICE,
  });
});

test("can attach an upgrade to a migrated legacy Alerts entitlement", () => {
  const user = activeAlertsUser({ passReceipts: [] });
  const now = Date.parse("2099-01-10T00:00:00.000Z");
  const selection = selectPassCheckout(user, "radar", prices, now);
  assert.equal(selection.kind, "upgrade");
  assert.equal(selection.expiresAt, EXPIRES_AT);
  assert.equal(selection.baseReceiptId, `legacy:${USER_ID}:${Date.parse(EXPIRES_AT)}`);
});

test("rejects duplicate active passes and requires the dedicated upgrade price", () => {
  const now = Date.parse("2099-01-10T00:00:00.000Z");
  assert.throws(
    () => selectPassCheckout(activeAlertsUser(), "alerts", prices, now),
    assertAuthError("alerts_pass_already_active"),
  );
  assert.throws(
    () => selectPassCheckout(activeAlertsUser(), "radar", { priceIds: prices.priceIds }, now),
    assertAuthError("stripe_upgrade_price_not_configured"),
  );

  const radar = activeAlertsUser({ entitlementTier: "radar" });
  assert.throws(
    () => selectPassCheckout(radar, "alerts", prices, now),
    assertAuthError("radar_pass_already_active"),
  );
  assert.throws(
    () => selectPassCheckout(radar, "radar", prices, now),
    assertAuthError("radar_pass_already_active"),
  );
});

test("sells a fresh 90-day Radar pass instead of an upgrade in the final hour", () => {
  const now = Date.parse("2099-01-10T00:00:00.000Z");
  const nearlyExpired = activeAlertsUser({
    entitlementExpiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
    passReceipts: [alertsReceipt({ expiresAt: new Date(now + 60 * 60 * 1000).toISOString() })],
  });
  assert.deepEqual(selectPassCheckout(nearlyExpired, "radar", prices, now), {
    baseReceiptId: null,
    expiresAt: null,
    kind: "purchase",
    priceId: RADAR_PRICE,
  });
});

test("sets a new pass expiry to exactly 90 days after successful payment", () => {
  const purchasedAt = "2026-07-16T12:34:56.000Z";
  assert.equal(
    passExpirationForCheckout({ kind: "purchase", purchasedAt }),
    "2026-10-14T12:34:56.000Z",
  );
});

test("keeps the original expiry for an Alerts-to-Radar upgrade", () => {
  assert.equal(passExpirationForCheckout({
    kind: "upgrade",
    purchasedAt: "2026-07-16T12:34:56.000Z",
    metadataExpiresAt: "2026-09-01T09:30:00+02:00",
  }), "2026-09-01T07:30:00.000Z");
});

test("rejects invalid purchase timestamps and expired upgrade metadata", () => {
  assert.throws(
    () => passExpirationForCheckout({ kind: "purchase", purchasedAt: "not-a-date" }),
    assertAuthError("invalid_pass_purchase_time"),
  );
  assert.throws(
    () => passExpirationForCheckout({
      kind: "upgrade",
      purchasedAt: "2026-07-16T12:34:56.000Z",
      metadataExpiresAt: "2026-07-16T12:34:56.000Z",
    }),
    assertAuthError("expired_pass_upgrade"),
  );
});

test("replaying one paid Checkout receipt is idempotent", async () => {
  const { auth, user } = await createPassAuthContext();
  const purchase = passPurchase(user);
  const first = await auth.applyStripePassPurchase(purchase);
  assert.ok(first);
  const replay = await auth.applyStripePassPurchase(purchase);
  assert.ok(replay);
  assert.equal(replay.profileRevision, first.profileRevision);
  assert.equal(replay.passReceipts.length, 1);
  assert.equal(replay.entitlementTier, "alerts");
});

test("a late second root receipt is rejected after a paid Radar root pass", async () => {
  const { auth, user } = await createPassAuthContext();
  const radar = await auth.applyStripePassPurchase(passPurchase(user, {
    stripePaymentIntentId: "pi_radar",
    tier: "radar",
  }));
  assert.ok(radar);
  await assert.rejects(
    auth.applyStripePassPurchase(passPurchase(user, {
      stripePaymentIntentId: "pi_alerts_late",
      purchasedAt: "2099-01-02T00:00:00.000Z",
    })),
    assertAuthError("pass_already_active_after_payment"),
  );
  const unchanged = await auth.findUserByStripeCustomerId("cus_ledger");
  assert.ok(unchanged);
  assert.equal(unchanged.entitlementTier, "radar");
  assert.equal(unchanged.passReceipts.length, 1);
});

test("refunding an upgrade restores the still-paid Alerts entitlement", async () => {
  const { auth, user } = await createPassAuthContext();
  const alerts = await auth.applyStripePassPurchase(passPurchase(user));
  assert.ok(alerts);
  const radar = await auth.applyStripePassPurchase(passPurchase(user, {
    stripePaymentIntentId: "pi_upgrade",
    kind: "upgrade",
    baseReceiptId: "pi_alerts",
    tier: "radar",
    purchasedAt: "2099-01-02T00:00:00.000Z",
  }));
  assert.ok(radar);
  assert.equal(radar.entitlementTier, "radar");

  const refunded = await auth.revokeStripePassEntitlement("cus_ledger", "pi_upgrade", "refunded");
  assert.ok(refunded);
  assert.equal(refunded.entitlementTier, "alerts");
  assert.equal(refunded.entitlementStatus, "active");
  assert.equal(refunded.paymentLast4, "4242");
});

test("refunding the upgrade base revokes the dependent Radar entitlement", async () => {
  const { auth, user } = await createPassAuthContext();
  await auth.applyStripePassPurchase(passPurchase(user));
  await auth.applyStripePassPurchase(passPurchase(user, {
    stripePaymentIntentId: "pi_upgrade",
    kind: "upgrade",
    baseReceiptId: "pi_alerts",
    tier: "radar",
    purchasedAt: "2099-01-02T00:00:00.000Z",
  }));

  const refunded = await auth.revokeStripePassEntitlement("cus_ledger", "pi_alerts", "refunded");
  assert.ok(refunded);
  assert.equal(refunded.entitlementTier, "none");
  assert.equal(refunded.entitlementStatus, "refunded");
  assert.equal(refunded.paymentMethod, null);
});

test("a won dispute restores a revoked upgrade without duplicating its receipt", async () => {
  const { auth, user } = await createPassAuthContext();
  await auth.applyStripePassPurchase(passPurchase(user));
  await auth.applyStripePassPurchase(passPurchase(user, {
    stripePaymentIntentId: "pi_upgrade",
    kind: "upgrade",
    baseReceiptId: "pi_alerts",
    tier: "radar",
    purchasedAt: "2099-01-02T00:00:00.000Z",
  }));
  const revoked = await auth.revokeStripePassEntitlement("cus_ledger", "pi_upgrade", "revoked");
  assert.ok(revoked);
  assert.equal(revoked.entitlementTier, "alerts");

  const restored = await auth.restoreStripePassEntitlement("cus_ledger", "pi_upgrade");
  assert.ok(restored);
  assert.equal(restored.entitlementTier, "radar");
  assert.equal(restored.passReceipts.length, 2);
});

test("a refunded receipt stays refunded when its Checkout completion is replayed", async () => {
  const { auth, user } = await createPassAuthContext();
  const purchase = passPurchase(user);
  await auth.applyStripePassPurchase(purchase);
  const refunded = await auth.revokeStripePassEntitlement("cus_ledger", "pi_alerts", "refunded");
  assert.ok(refunded);
  const replay = await auth.applyStripePassPurchase(purchase);
  assert.ok(replay);
  assert.equal(replay.entitlementTier, "none");
  assert.equal(replay.entitlementStatus, "refunded");
  assert.equal(replay.passReceipts[0]?.status, "refunded");
});

test("activePassBaseReceiptId chooses the strongest active root, not an upgrade", () => {
  const user = activeAlertsUser({
    passReceipts: [
      alertsReceipt(),
      alertsReceipt({
        id: "pi_upgrade",
        kind: "upgrade",
        tier: "radar",
        baseReceiptId: "pi_alerts",
        purchasedAt: "2099-01-02T00:00:00.000Z",
      }),
      alertsReceipt({
        id: "pi_radar_root",
        tier: "radar",
        purchasedAt: "2099-01-03T00:00:00.000Z",
      }),
    ],
  });
  assert.equal(activePassBaseReceiptId(user, Date.parse("2099-01-10T00:00:00.000Z")), "pi_radar_root");
});

test("creates a Stripe Customer with a stable user-scoped idempotency key", async () => {
  const { auth, request, user } = await createAuthenticatedUser();
  const { calls, service } = billingServiceWithFakeStripe(auth);

  const result = await service.createCheckoutSession(request, { plan: "alerts", lang: "en" });

  assert.equal(result.url, "https://checkout.stripe.test/session");
  assert.equal(calls.customerCreates.length, 1);
  const metadata = calls.customerCreates[0]?.params.metadata;
  assert.equal(metadata && typeof metadata === "object" ? metadata.airco_user_id : undefined, user.userId);
  assert.equal(
    calls.customerCreates[0]?.options?.idempotencyKey,
    `airco-customer-${user.userId}-new`,
  );
  assert.equal(calls.checkoutCreates[0]?.params.customer, "cus_ledger");
});

test("keeps Stripe Customer create parameters and idempotency key stable across concurrent retries", async () => {
  const { auth, request, user } = await createAuthenticatedUser();
  const { calls, service } = billingServiceWithFakeStripe(auth);
  const ensureCustomer = (service as unknown as {
    ensureStripeCustomer(
      value: IncomingMessage,
      profile: StoredUserProfile,
      lang: "en",
    ): Promise<string>;
  }).ensureStripeCustomer.bind(service);

  const customerIds = await Promise.all([
    ensureCustomer(request, user, "en"),
    ensureCustomer(request, user, "en"),
  ]);

  assert.deepEqual(customerIds, ["cus_ledger", "cus_ledger"]);
  assert.equal(calls.customerCreates.length, 2);
  assert.deepEqual(calls.customerCreates[1]?.params, calls.customerCreates[0]?.params);
  assert.equal(
    calls.customerCreates[0]?.options?.idempotencyKey,
    `airco-customer-${user.userId}-new`,
  );
  assert.equal(
    calls.customerCreates[1]?.options?.idempotencyKey,
    calls.customerCreates[0]?.options?.idempotencyKey,
  );
});

test("a late dispute.created webhook cannot revoke a receipt after the dispute was won", async () => {
  const { auth, user } = await createPassAuthContext();
  await auth.applyStripePassPurchase(passPurchase(user));
  const { session } = paidPassSession({
    chargeId: "ch_alerts_disputed",
    customerId: "cus_ledger",
    disputed: true,
    paymentIntentId: "pi_alerts",
    userId: user.userId,
  });
  const charge = chargeFromSession(session);
  const pending = fakeDispute({
    chargeId: charge.id,
    id: "dp_alerts",
    status: "needs_response",
  });
  const { service, state } = billingServiceWithFakeStripe(auth, undefined, {
    charges: [[charge.id, charge]],
    disputes: [[pending.id, pending]],
  });

  await deliverWebhook(service, state, fakeWebhookEvent("charge.dispute.created", pending));
  const revoked = await auth.findUserByStripeCustomerId("cus_ledger");
  assert.equal(revoked?.passReceipts[0]?.status, "revoked");

  const won = fakeDispute({ chargeId: charge.id, id: pending.id, status: "won" });
  state.disputes.set(won.id, won);
  await deliverWebhook(service, state, fakeWebhookEvent("charge.dispute.closed", won));
  const restored = await auth.findUserByStripeCustomerId("cus_ledger");
  assert.equal(restored?.entitlementTier, "alerts");
  assert.equal(restored?.passReceipts[0]?.status, "active");

  await deliverWebhook(service, state, fakeWebhookEvent("charge.dispute.created", pending));
  const afterLateCreated = await auth.findUserByStripeCustomerId("cus_ledger");
  assert.equal(afterLateCreated?.entitlementTier, "alerts");
  assert.equal(afterLateCreated?.passReceipts[0]?.status, "active");
});

test("a won dispute received before Checkout completion can still grant the paid pass", async () => {
  const { auth, user } = await createPassAuthContext();
  const { lineItems, session } = paidPassSession({
    chargeId: "ch_won_before_checkout",
    customerId: "cus_ledger",
    disputed: true,
    paymentIntentId: "pi_won_before_checkout",
    sessionId: "cs_test_won_before_checkout",
    userId: user.userId,
  });
  const charge = chargeFromSession(session);
  const won = fakeDispute({ chargeId: charge.id, id: "dp_won_early", status: "won" });
  const { calls, service, state } = billingServiceWithFakeStripe(auth, lineItems, {
    charges: [[charge.id, charge]],
    checkoutSessions: [session],
    disputes: [[won.id, won]],
  });

  await deliverWebhook(service, state, fakeWebhookEvent("charge.dispute.closed", won));

  const granted = await auth.findUserByStripeCustomerId("cus_ledger");
  assert.equal(granted?.entitlementTier, "alerts");
  assert.equal(granted?.entitlementStatus, "active");
  assert.equal(granted?.passReceipts[0]?.id, "pi_won_before_checkout");
  assert.equal(granted?.passReceipts[0]?.status, "active");
  assert.equal(calls.refunds.length, 0);
});

test("refunds an upgrade whose preserved expiry has elapsed before its webhook settles", async () => {
  const realDateNow = Date.now;
  const webhookSettledAt = realDateNow();
  const upgradePurchasedAt = webhookSettledAt - 2 * 60 * 60 * 1000;
  const baseExpiresAt = webhookSettledAt - 60 * 60 * 1000;
  Date.now = () => upgradePurchasedAt - 60 * 60 * 1000;
  try {
    const { auth, user } = await createPassAuthContext();
    await auth.applyStripePassPurchase(passPurchase(user, {
      expiresAt: new Date(baseExpiresAt).toISOString(),
      purchasedAt: new Date(upgradePurchasedAt - 30 * 24 * 60 * 60 * 1000).toISOString(),
    }));
    const { lineItems, session } = paidPassSession({
      baseReceiptId: "pi_alerts",
      customerId: "cus_ledger",
      expiresAt: new Date(baseExpiresAt).toISOString(),
      kind: "upgrade",
      paymentIntentId: "pi_expired_upgrade",
      purchasedAt: new Date(upgradePurchasedAt).toISOString(),
      sessionId: "cs_test_expired_upgrade",
      tier: "radar",
      userId: user.userId,
    });
    const { calls, service, state } = billingServiceWithFakeStripe(auth, lineItems, {
      checkoutSessions: [session],
    });

    Date.now = () => webhookSettledAt;
    await deliverWebhook(service, state, fakeWebhookEvent("checkout.session.completed", session));

    assert.equal(calls.refunds.length, 1);
    assert.equal(calls.refunds[0]?.params.payment_intent, "pi_expired_upgrade");
    assert.equal(
      calls.refunds[0]?.options?.idempotencyKey,
      "airco-pass-refund-expired-on-arrival-pi_expired_upgrade",
    );
    const retained = await auth.findUserByStripeCustomerId("cus_ledger");
    assert.deepEqual(retained?.passReceipts.map((receipt) => receipt.id), ["pi_alerts"]);
  } finally {
    Date.now = realDateNow;
  }
});

test("refunds the second of two paid upgrades racing for the same Alerts base", async () => {
  const { auth, user } = await createPassAuthContext();
  await auth.applyStripePassPurchase(passPurchase(user));
  const first = paidPassSession({
    baseReceiptId: "pi_alerts",
    customerId: "cus_ledger",
    kind: "upgrade",
    paymentIntentId: "pi_upgrade_first",
    sessionId: "cs_test_upgrade_first",
    tier: "radar",
    userId: user.userId,
  });
  const second = paidPassSession({
    baseReceiptId: "pi_alerts",
    customerId: "cus_ledger",
    kind: "upgrade",
    paymentIntentId: "pi_upgrade_second",
    sessionId: "cs_test_upgrade_second",
    tier: "radar",
    userId: user.userId,
  });
  const { calls, service } = billingServiceWithFakeStripe(auth, first.lineItems);

  const granted = await syncPaidSession(service, first.session);
  assert.equal(granted?.entitlementTier, "radar");
  assert.equal(await syncPaidSession(service, second.session), null);

  const retained = await auth.findUserByStripeCustomerId("cus_ledger");
  assert.equal(retained?.entitlementTier, "radar");
  assert.deepEqual(
    retained?.passReceipts.map((receipt) => receipt.id),
    ["pi_alerts", "pi_upgrade_first"],
  );
  assert.equal(calls.refunds.length, 1);
  assert.equal(calls.refunds[0]?.params.payment_intent, "pi_upgrade_second");
  assert.equal(
    calls.refunds[0]?.options?.idempotencyKey,
    "airco-pass-refund-pass_upgrade_already_applied-pi_upgrade_second",
  );
});

test("a full base refund also refunds and revokes its dependent upgrade", async () => {
  const { auth, user } = await createPassAuthContext();
  await auth.applyStripePassPurchase(passPurchase(user));
  await auth.applyStripePassPurchase(passPurchase(user, {
    baseReceiptId: "pi_alerts",
    kind: "upgrade",
    purchasedAt: "2099-01-02T00:00:00.000Z",
    stripePaymentIntentId: "pi_upgrade",
    tier: "radar",
  }));
  const { session } = paidPassSession({
    chargeId: "ch_alerts_refunded",
    customerId: "cus_ledger",
    paymentIntentId: "pi_alerts",
    refunded: true,
    userId: user.userId,
  });
  const charge = chargeFromSession(session);
  const { session: upgradeSession } = paidPassSession({
    chargeId: "ch_upgrade",
    customerId: "cus_ledger",
    kind: "upgrade",
    paymentIntentId: "pi_upgrade",
    tier: "radar",
    userId: user.userId,
  });
  const upgradePaymentIntent = paymentIntentFromSession(upgradeSession);
  const { calls, service, state } = billingServiceWithFakeStripe(auth, undefined, {
    paymentIntents: [[upgradePaymentIntent.id, upgradePaymentIntent]],
  });

  await deliverWebhook(service, state, fakeWebhookEvent("charge.refunded", charge));

  const updated = await auth.findUserByStripeCustomerId("cus_ledger");
  assert.equal(updated?.entitlementTier, "none");
  assert.equal(updated?.passReceipts.find((receipt) => receipt.id === "pi_alerts")?.status, "refunded");
  assert.notEqual(updated?.passReceipts.find((receipt) => receipt.id === "pi_upgrade")?.status, "active");
  assert.equal(calls.refunds.length, 1);
  assert.equal(calls.refunds[0]?.params.payment_intent, "pi_upgrade");
  assert.equal(
    calls.refunds[0]?.options?.idempotencyKey,
    "airco-linked-upgrade-refund-pi_alerts-pi_upgrade",
  );
});

test("a final lost dispute on the base also refunds and revokes its dependent upgrade", async () => {
  const { auth, user } = await createPassAuthContext();
  await auth.applyStripePassPurchase(passPurchase(user));
  await auth.applyStripePassPurchase(passPurchase(user, {
    baseReceiptId: "pi_alerts",
    kind: "upgrade",
    purchasedAt: "2099-01-02T00:00:00.000Z",
    stripePaymentIntentId: "pi_upgrade",
    tier: "radar",
  }));
  const { session } = paidPassSession({
    chargeId: "ch_alerts_lost",
    customerId: "cus_ledger",
    disputed: true,
    paymentIntentId: "pi_alerts",
    userId: user.userId,
  });
  const charge = chargeFromSession(session);
  const lost = fakeDispute({ chargeId: charge.id, id: "dp_alerts_lost", status: "lost" });
  const { session: upgradeSession } = paidPassSession({
    chargeId: "ch_upgrade",
    customerId: "cus_ledger",
    kind: "upgrade",
    paymentIntentId: "pi_upgrade",
    tier: "radar",
    userId: user.userId,
  });
  const upgradePaymentIntent = paymentIntentFromSession(upgradeSession);
  const { calls, service, state } = billingServiceWithFakeStripe(auth, undefined, {
    charges: [[charge.id, charge]],
    disputes: [[lost.id, lost]],
    paymentIntents: [[upgradePaymentIntent.id, upgradePaymentIntent]],
  });

  await deliverWebhook(service, state, fakeWebhookEvent("charge.dispute.closed", lost));

  const updated = await auth.findUserByStripeCustomerId("cus_ledger");
  assert.equal(updated?.entitlementTier, "none");
  assert.equal(updated?.passReceipts.find((receipt) => receipt.id === "pi_alerts")?.status, "revoked");
  assert.notEqual(updated?.passReceipts.find((receipt) => receipt.id === "pi_upgrade")?.status, "active");
  assert.equal(calls.refunds.length, 1);
  assert.equal(calls.refunds[0]?.params.payment_intent, "pi_upgrade");
  assert.equal(
    calls.refunds[0]?.options?.idempotencyKey,
    "airco-linked-upgrade-refund-pi_alerts-pi_upgrade",
  );
});

test("an upgrade dispute win after its base refund returns the now-orphaned upgrade", async () => {
  const { auth, user } = await createPassAuthContext();
  await auth.applyStripePassPurchase(passPurchase(user));
  await auth.applyStripePassPurchase(passPurchase(user, {
    baseReceiptId: "pi_alerts",
    kind: "upgrade",
    purchasedAt: "2099-01-02T00:00:00.000Z",
    stripePaymentIntentId: "pi_upgrade",
    tier: "radar",
  }));
  const { session: upgradeSession } = paidPassSession({
    chargeId: "ch_upgrade_disputed",
    customerId: "cus_ledger",
    disputed: true,
    kind: "upgrade",
    paymentIntentId: "pi_upgrade",
    tier: "radar",
    userId: user.userId,
  });
  const upgradeCharge = chargeFromSession(upgradeSession);
  const pending = fakeDispute({
    chargeId: upgradeCharge.id,
    id: "dp_upgrade",
    status: "needs_response",
  });
  const { session: baseSession } = paidPassSession({
    chargeId: "ch_base_refunded_during_upgrade_dispute",
    customerId: "cus_ledger",
    paymentIntentId: "pi_alerts",
    refunded: true,
    userId: user.userId,
  });
  const baseCharge = chargeFromSession(baseSession);
  const { calls, service, state } = billingServiceWithFakeStripe(auth, undefined, {
    charges: [
      [upgradeCharge.id, upgradeCharge],
      [baseCharge.id, baseCharge],
    ],
    disputes: [[pending.id, pending]],
    // Model the Checkout search lagging this webhook sequence. The terminal
    // dispute handler must still use the durable local receipt linkage.
    checkoutSessions: [],
  });

  await deliverWebhook(service, state, fakeWebhookEvent("charge.dispute.created", pending));
  const afterDispute = await auth.findUserByStripeCustomerId("cus_ledger");
  assert.equal(afterDispute?.entitlementTier, "alerts");
  assert.equal(afterDispute?.passReceipts.find((receipt) => receipt.id === "pi_upgrade")?.status, "revoked");

  await deliverWebhook(service, state, fakeWebhookEvent("charge.refunded", baseCharge));
  const afterBaseRefund = await auth.findUserByStripeCustomerId("cus_ledger");
  assert.equal(afterBaseRefund?.entitlementTier, "none");
  assert.equal(afterBaseRefund?.passReceipts.find((receipt) => receipt.id === "pi_alerts")?.status, "refunded");
  assert.equal(calls.refunds.length, 0);

  const won = fakeDispute({ chargeId: upgradeCharge.id, id: pending.id, status: "won" });
  state.disputes.set(won.id, won);
  await deliverWebhook(service, state, fakeWebhookEvent("charge.dispute.closed", won));

  const final = await auth.findUserByStripeCustomerId("cus_ledger");
  assert.equal(final?.entitlementTier, "none");
  assert.equal(final?.passReceipts.find((receipt) => receipt.id === "pi_upgrade")?.status, "refunded");
  assert.equal(calls.refunds.length, 1);
  assert.equal(calls.refunds[0]?.params.payment_intent, "pi_upgrade");
  assert.equal(
    calls.refunds[0]?.options?.idempotencyKey,
    "airco-pass-refund-upgrade-base-reversed-pi_upgrade",
  );
});

test("a pending automatic linked refund stays revoked until refund.updated confirms success", async () => {
  const { auth, user } = await createPassAuthContext();
  await auth.applyStripePassPurchase(passPurchase(user));
  await auth.applyStripePassPurchase(passPurchase(user, {
    baseReceiptId: "pi_alerts",
    kind: "upgrade",
    purchasedAt: "2099-01-02T00:00:00.000Z",
    stripePaymentIntentId: "pi_upgrade_pending_refund",
    tier: "radar",
  }));
  const { session: upgradeSession } = paidPassSession({
    chargeId: "ch_upgrade_pending_refund",
    customerId: "cus_ledger",
    kind: "upgrade",
    paymentIntentId: "pi_upgrade_pending_refund",
    tier: "radar",
    userId: user.userId,
  });
  const upgradePaymentIntent = paymentIntentFromSession(upgradeSession);
  const upgradeCharge = chargeFromSession(upgradeSession);
  const { session: baseSession } = paidPassSession({
    chargeId: "ch_base_full_refund",
    customerId: "cus_ledger",
    paymentIntentId: "pi_alerts",
    refunded: true,
    userId: user.userId,
  });
  const baseCharge = chargeFromSession(baseSession);
  const { calls, service, state } = billingServiceWithFakeStripe(auth, undefined, {
    charges: [[upgradeCharge.id, upgradeCharge]],
    paymentIntents: [[upgradePaymentIntent.id, upgradePaymentIntent]],
    refundCreateResults: [{
      id: "re_upgrade_pending",
      charge: upgradeCharge.id,
      object: "refund",
      payment_intent: upgradePaymentIntent.id,
      status: "pending",
    } as Stripe.Refund],
  });

  await deliverWebhook(service, state, fakeWebhookEvent("charge.refunded", baseCharge));

  const pending = await auth.findUserByStripeCustomerId("cus_ledger");
  assert.equal(pending?.entitlementTier, "none");
  assert.equal(pending?.passReceipts.find((receipt) => receipt.id === "pi_alerts")?.status, "refunded");
  assert.equal(
    pending?.passReceipts.find((receipt) => receipt.id === "pi_upgrade_pending_refund")?.status,
    "revoked",
  );
  assert.equal(calls.refunds.length, 1);

  const completedCharge = { ...upgradeCharge, refunded: true } as Stripe.Charge;
  state.charges.set(completedCharge.id, completedCharge);
  const succeededRefund = {
    id: "re_upgrade_pending",
    charge: completedCharge.id,
    object: "refund",
    payment_intent: upgradePaymentIntent.id,
    status: "succeeded",
  } as Stripe.Refund;
  await deliverWebhook(service, state, fakeWebhookEvent("refund.updated", succeededRefund));

  const completed = await auth.findUserByStripeCustomerId("cus_ledger");
  assert.equal(completed?.entitlementTier, "none");
  assert.equal(
    completed?.passReceipts.find((receipt) => receipt.id === "pi_upgrade_pending_refund")?.status,
    "refunded",
  );
});

for (const refundStatus of ["failed", "canceled", "requires_action", null] as const) {
  test(`rejects an automatic refund create result with status ${refundStatus ?? "null"}`, async () => {
    const { auth, user } = await createPassAuthContext();
    const { lineItems, session } = paidPassSession({
      priceId: "price_wrong",
      userId: user.userId,
    });
    const { calls, service } = billingServiceWithFakeStripe(auth, lineItems, {
      refundCreateResults: [{
        id: `re_${refundStatus ?? "null"}`,
        object: "refund",
        status: refundStatus,
      } as unknown as Stripe.Refund],
    });

    await assert.rejects(
      syncPaidSession(service, session),
      assertAuthError("automatic_refund_failed"),
    );
    assert.equal(calls.refunds.length, 1);
    const unchanged = await auth.findUserByStripeCustomerId("cus_ledger");
    assert.equal(unchanged?.entitlementTier, "none");
    assert.equal(unchanged?.passReceipts.length, 0);
  });
}

test("refund.failed surfaces automatic_refund_failed and never grants an entitlement", async () => {
  const { auth } = await createPassAuthContext();
  const { service, state } = billingServiceWithFakeStripe(auth);
  const failedRefund = {
    id: "re_failed_webhook",
    failure_reason: "declined",
    object: "refund",
    payment_intent: "pi_failed_refund",
    status: "failed",
  } as Stripe.Refund;
  state.webhookEvent = fakeWebhookEvent("refund.failed", failedRefund);

  await assert.rejects(
    service.handleWebhook(fakeWebhookRequest()),
    assertAuthError("automatic_refund_failed"),
  );

  const unchanged = await auth.findUserByStripeCustomerId("cus_ledger");
  assert.equal(unchanged?.entitlementTier, "none");
  assert.equal(unchanged?.passReceipts.length, 0);
});

test("refunds a paid pass Checkout idempotently when its owner no longer exists", async () => {
  const auth = new AuthService({ exposeDevCode: true });
  const { lineItems, session } = paidPassSession({ customerId: "cus_missing" });
  const { calls, service } = billingServiceWithFakeStripe(auth, lineItems);

  assert.equal(await syncPaidSession(service, session), null);
  assert.deepEqual(calls.refunds[0]?.params, {
    payment_intent: "pi_paid",
    reason: "requested_by_customer",
  });
  assert.equal(
    calls.refunds[0]?.options?.idempotencyKey,
    "airco-pass-refund-missing-owner-pi_paid",
  );
  assert.equal(await auth.findUserByStripeCustomerId("cus_missing"), null);
});

test("refunds paid Checkout sessions with invalid entitlement metadata", async () => {
  const auth = new AuthService({ exposeDevCode: true });
  const { lineItems, session } = paidPassSession({ tier: "invalid" });
  const { calls, service } = billingServiceWithFakeStripe(auth, lineItems);

  assert.equal(await syncPaidSession(service, session), null);
  assert.equal(calls.refunds.length, 1);
  assert.equal(
    calls.refunds[0]?.options?.idempotencyKey,
    "airco-pass-refund-invalid-metadata-pi_paid",
  );
});

test("refunds a paid Checkout when the Stripe Price does not match the selected pass", async () => {
  const auth = new AuthService({ exposeDevCode: true });
  const { lineItems, session } = paidPassSession({ priceId: "price_wrong" });
  const { calls, service } = billingServiceWithFakeStripe(auth, lineItems);

  assert.equal(await syncPaidSession(service, session), null);
  assert.equal(calls.refunds.length, 1);
  assert.equal(
    calls.refunds[0]?.options?.idempotencyKey,
    "airco-pass-refund-invalid-price-pi_paid",
  );
});

test("refunds a paid Checkout when its exact EUR amount is wrong", async () => {
  const auth = new AuthService({ exposeDevCode: true });
  const { lineItems, session } = paidPassSession({ amount: 499 });
  const { calls, service } = billingServiceWithFakeStripe(auth, lineItems);

  assert.equal(await syncPaidSession(service, session), null);
  assert.equal(calls.refunds.length, 1);
  assert.equal(
    calls.refunds[0]?.options?.idempotencyKey,
    "airco-pass-refund-invalid-price-pi_paid",
  );
});

test("refunds a paid upgrade when its base receipt is permanently unavailable", async () => {
  const { auth, user } = await createPassAuthContext();
  const { lineItems, session } = paidPassSession({
    baseReceiptId: "pi_missing",
    customerId: "cus_ledger",
    kind: "upgrade",
    paymentIntentId: "pi_orphan_upgrade",
    tier: "radar",
    userId: user.userId,
  });
  const { calls, service } = billingServiceWithFakeStripe(auth, lineItems);

  assert.equal(await syncPaidSession(service, session), null);
  assert.equal(calls.refunds.length, 1);
  assert.equal(
    calls.refunds[0]?.options?.idempotencyKey,
    "airco-pass-refund-pass_upgrade_base_unavailable-pi_orphan_upgrade",
  );
  const unchanged = await auth.findUserByStripeCustomerId("cus_ledger");
  assert.ok(unchanged);
  assert.equal(unchanged.entitlementTier, "none");
  assert.equal(unchanged.passReceipts.length, 0);
});

test("refunds a concurrently paid second root while retaining the first pass", async () => {
  const { auth, user } = await createPassAuthContext();
  const first = await auth.applyStripePassPurchase(passPurchase(user));
  assert.ok(first);
  const { lineItems, session } = paidPassSession({
    customerId: "cus_ledger",
    paymentIntentId: "pi_second_root",
    userId: user.userId,
  });
  const { calls, service } = billingServiceWithFakeStripe(auth, lineItems);

  assert.equal(await syncPaidSession(service, session), null);
  assert.equal(calls.refunds.length, 1);
  assert.equal(
    calls.refunds[0]?.options?.idempotencyKey,
    "airco-pass-refund-pass_already_active_after_payment-pi_second_root",
  );
  const retained = await auth.findUserByStripeCustomerId("cus_ledger");
  assert.ok(retained);
  assert.equal(retained.entitlementTier, "alerts");
  assert.equal(retained.passReceipts.length, 1);
  assert.equal(retained.passReceipts[0]?.id, "pi_alerts");
});

test("an exact-price paid Checkout grants the requested 90-day pass without a refund", async () => {
  const { auth, user } = await createPassAuthContext();
  const { lineItems, session } = paidPassSession({ userId: user.userId });
  const { calls, service } = billingServiceWithFakeStripe(auth, lineItems);

  const granted = await syncPaidSession(service, session);
  assert.ok(granted);
  assert.equal(granted.entitlementTier, "alerts");
  assert.equal(granted.entitlementStatus, "active");
  assert.equal(granted.entitlementPurchasedAt, PURCHASED_AT);
  assert.equal(granted.entitlementExpiresAt, EXPIRES_AT);
  assert.equal(granted.passReceipts[0]?.id, "pi_paid");
  assert.equal(calls.refunds.length, 0);
});
