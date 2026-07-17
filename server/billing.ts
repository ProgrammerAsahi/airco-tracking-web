import type { IncomingMessage } from "node:http";
import Stripe from "stripe";
import {
  SUBSCRIPTION_PLAN_DETAILS,
  entitlementIsActive,
  isPaidSubscriptionPlan,
  type PaidSubscriptionPlan,
} from "../shared/auth.js";
import type { Lang } from "../shared/i18n.js";
import {
  AuthHttpError,
  activePassBaseReceiptId,
  type AuthService,
  type StoredUserProfile,
  type StripePassPurchase,
} from "./auth.js";

type StripeBillingOptions = {
  appBaseUrl?: string;
  secretKey?: string;
  webhookSecret?: string;
  priceIds: Partial<Record<PaidSubscriptionPlan, string>>;
  radarUpgradePriceId?: string;
};

type CheckoutSessionResult = { url: string };
type PassPurchaseKind = "purchase" | "upgrade";

const PRICE_ENV_BY_PLAN: Record<PaidSubscriptionPlan, string> = {
  alerts: "STRIPE_PRICE_ALERTS_PASS",
  radar: "STRIPE_PRICE_RADAR_PASS",
};
const RADAR_UPGRADE_PRICE_ENV = "STRIPE_PRICE_RADAR_UPGRADE";
const PASS_DURATION_MILLISECONDS = 90 * 24 * 60 * 60 * 1000;
const MINIMUM_UPGRADE_REMAINING_MILLISECONDS = 60 * 60 * 1000;
const CHECKOUT_SESSION_TTL_SECONDS = 31 * 60;

export class StripeBillingService {
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string | undefined;
  private readonly appBaseUrl: string | undefined;
  private readonly priceIds: Partial<Record<PaidSubscriptionPlan, string>>;
  private readonly radarUpgradePriceId: string | undefined;

  constructor(
    private readonly auth: AuthService,
    options: StripeBillingOptions,
  ) {
    this.stripe = options.secretKey ? new Stripe(options.secretKey) : null;
    this.webhookSecret = options.webhookSecret;
    this.appBaseUrl = options.appBaseUrl;
    this.priceIds = options.priceIds;
    this.radarUpgradePriceId = options.radarUpgradePriceId;
  }

  async createCheckoutSession(
    request: IncomingMessage,
    values: { plan?: unknown; lang: Lang },
  ): Promise<CheckoutSessionResult> {
    const user = await this.auth.requireUser(request);
    if (!isPaidSubscriptionPlan(values.plan)) throw new AuthHttpError(400, "invalid_pass");
    const stripe = this.requireStripe();
    const selection = selectPassCheckout(user, values.plan, {
      priceIds: this.priceIds,
      radarUpgradePriceId: this.radarUpgradePriceId,
    });
    const customerId = await this.ensureStripeCustomer(request, user, values.lang);
    const baseUrl = this.publicBaseUrl(request);
    const checkoutNow = Date.now();
    const metadata: Stripe.MetadataParam = {
      airco_user_id: user.userId,
      airco_entitlement_tier: values.plan,
      airco_purchase_kind: selection.kind,
      airco_entitlement_expires_at: selection.expiresAt ?? "",
      airco_base_receipt_id: selection.baseReceiptId ?? "",
    };

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer: customerId,
      client_reference_id: user.userId,
      line_items: [{ price: selection.priceId, quantity: 1 }],
      locale: stripeLocale(values.lang),
      // Keep every create parameter deterministic inside the idempotency
      // window so a network retry returns the original Checkout Session.
      expires_at: checkoutSessionExpiresAt(checkoutNow),
      success_url: `${baseUrl}/ready?lang=${values.lang}&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/subscribe?lang=${values.lang}&checkout=cancelled`,
      payment_intent_data: { metadata },
      metadata,
    }, {
      idempotencyKey: checkoutIdempotencyKey(user, values.plan, selection.kind, values.lang, checkoutNow),
    });

    if (!session.url) throw new AuthHttpError(502, "stripe_checkout_unavailable");
    return { url: session.url };
  }

  async syncCheckoutStatus(request: IncomingMessage, values: { sessionId?: unknown }): Promise<StoredUserProfile> {
    const user = await this.auth.requireUser(request);
    const sessionId = typeof values.sessionId === "string" ? values.sessionId.trim() : "";
    if (!/^cs_(test|live)_/.test(sessionId)) throw new AuthHttpError(400, "invalid_checkout_session");

    const session = await this.requireStripe().checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent.payment_method", "payment_intent.latest_charge"],
    });
    this.assertCheckoutSessionBelongsToUser(session, user);
    const updated = await this.syncCheckoutSession(session);
    if (!updated) throw new AuthHttpError(400, "stripe_payment_not_complete");
    return updated;
  }

  async syncCustomerProfile(user: StoredUserProfile): Promise<void> {
    if (!this.stripe || !user.stripeCustomerId) return;
    await this.stripe.customers.update(user.stripeCustomerId, {
      email: user.email,
      metadata: { airco_user_email: "", airco_user_id: user.userId },
      preferred_locales: [stripeLocale(user.languagePreference)],
    });
  }

  async deleteCustomerForAccount(request: IncomingMessage): Promise<void> {
    const user = await this.auth.requireUser(request);
    if (entitlementIsActive(user)) throw new AuthHttpError(409, "active_entitlement");
    if (!user.stripeCustomerId) return;
    try {
      await this.requireStripe().customers.del(user.stripeCustomerId);
    } catch (error) {
      if (!isStripeResourceMissing(error)) throw error;
    }
  }

  async handleWebhook(request: IncomingMessage): Promise<{ received: true }> {
    const stripe = this.requireStripe();
    if (!this.webhookSecret) throw new AuthHttpError(503, "stripe_webhook_not_configured");
    const signature = request.headers["stripe-signature"];
    if (typeof signature !== "string" || !signature.trim()) {
      throw new AuthHttpError(400, "missing_stripe_signature");
    }

    const rawBody = await readRawBody(request);
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (error) {
      console.error("Stripe webhook signature verification failed", error);
      throw new AuthHttpError(400, "invalid_stripe_signature");
    }

    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = await stripe.checkout.sessions.retrieve((event.data.object as Stripe.Checkout.Session).id, {
        expand: ["payment_intent.payment_method", "payment_intent.latest_charge"],
      });
      await this.syncCheckoutSession(session);
      return { received: true };
    }

    if (event.type === "charge.refunded") {
      const charge = event.data.object as Stripe.Charge;
      if (charge.refunded) {
        await this.revokeFromCharge(charge, "refunded");
        await this.refundLinkedUpgrades(charge);
      }
      return { received: true };
    }

    if (event.type === "refund.created" || event.type === "refund.updated" || event.type === "refund.failed") {
      const refund = event.data.object as Stripe.Refund;
      if (refund.status === "failed" || event.type === "refund.failed") {
        console.error("automatic_refund_failed", {
          refundId: refund.id,
          paymentIntentId: stripeObjectId(refund.payment_intent),
          failureReason: refund.failure_reason ?? "unknown",
        });
        // Keep retrying and surface a durable operational signal. Never report
        // a failed refund as successfully compensated.
        throw new AuthHttpError(502, "automatic_refund_failed");
      }
      if (refund.status === "succeeded") {
        const chargeId = stripeObjectId(refund.charge);
        if (chargeId) {
          const charge = await stripe.charges.retrieve(chargeId);
          if (charge.refunded) {
            await this.revokeFromCharge(charge, "refunded");
            await this.refundLinkedUpgrades(charge);
          }
        }
      }
      return { received: true };
    }

    if (event.type === "charge.dispute.created" || event.type === "charge.dispute.closed") {
      // Stripe does not guarantee webhook order. Reload the Dispute so a late
      // `created` event cannot overwrite a newer terminal `won` decision.
      const eventDispute = event.data.object as Stripe.Dispute;
      const dispute = await stripe.disputes.retrieve(eventDispute.id);
      const chargeId = stripeObjectId(dispute.charge);
      if (chargeId) {
        const charge = await stripe.charges.retrieve(chargeId);
        if (disputeStatusAllowsEntitlement(dispute.status)) {
          await this.restoreFromCharge(charge);
        } else {
          await this.revokeFromCharge(charge, "revoked");
          if (dispute.status === "lost") await this.refundLinkedUpgrades(charge);
        }
      }
      return { received: true };
    }

    return { received: true };
  }

  private requireStripe(): Stripe {
    if (!this.stripe) throw new AuthHttpError(503, "stripe_not_configured");
    return this.stripe;
  }

  private async ensureStripeCustomer(request: IncomingMessage, user: StoredUserProfile, lang: Lang): Promise<string> {
    const stripe = this.requireStripe();
    if (user.stripeCustomerId) {
      try {
        await stripe.customers.update(user.stripeCustomerId, {
          email: user.email,
          metadata: { airco_user_email: "", airco_user_id: user.userId },
          preferred_locales: [stripeLocale(lang)],
        });
        return user.stripeCustomerId;
      } catch (error) {
        if (!isStripeResourceMissing(error)) throw error;
        console.warn("Stored Stripe customer no longer exists; creating a replacement");
      }
    }

    const customer = await stripe.customers.create({
      // Keep every parameter behind this idempotency key immutable. Email and
      // locale can change concurrently and are synchronized after attachment.
      metadata: { airco_user_id: user.userId },
    }, {
      // The initial "new" key collapses concurrent first-checkout requests.
      // If a previously stored Customer was deleted in Stripe, include that
      // missing ID so Stripe cannot replay the original create response.
      idempotencyKey: `airco-customer-${user.userId}-${user.stripeCustomerId ?? "new"}`,
    });
    await this.auth.attachStripeCustomer(request, customer.id);
    const latestUser = await this.auth.requireUser(request);
    await stripe.customers.update(customer.id, {
      email: latestUser.email,
      metadata: { airco_user_email: "", airco_user_id: latestUser.userId },
      preferred_locales: [stripeLocale(lang)],
    });
    return customer.id;
  }

  private async syncCheckoutSession(session: Stripe.Checkout.Session): Promise<StoredUserProfile | null> {
    if (session.mode !== "payment" || session.payment_status !== "paid") return null;
    const customerId = stripeObjectId(session.customer);
    const paymentIntentId = stripeObjectId(session.payment_intent);
    const userId = session.metadata?.airco_user_id?.trim().toLowerCase() || "";
    const tier = session.metadata?.airco_entitlement_tier;
    const kind = session.metadata?.airco_purchase_kind;
    const baseReceiptId = session.metadata?.airco_base_receipt_id?.trim() || null;
    const expectedPriceId = kind === "upgrade" ? this.radarUpgradePriceId : (
      isPaidSubscriptionPlan(tier) ? this.priceIds[tier] : undefined
    );
    if (
      !paymentIntentId
      || !userId
      || !isPaidSubscriptionPlan(tier)
      || !isPassPurchaseKind(kind)
      || !expectedPriceId
      || (kind === "upgrade" && (!baseReceiptId || tier !== "radar"))
    ) {
      if (paymentIntentId) {
        await this.refundInvalidPassPayment(paymentIntentId, "invalid-metadata");
        return null;
      }
      throw new AuthHttpError(400, "invalid_pass_checkout_metadata");
    }
    if (!customerId) {
      await this.refundInvalidPassPayment(paymentIntentId, "missing-customer");
      return null;
    }

    const lineItems = await this.requireStripe().checkout.sessions.listLineItems(session.id, { limit: 2 });
    const onlyLine = lineItems.data.length === 1 ? lineItems.data[0] : null;
    const expectedAmount = expectedPassAmount(kind, tier);
    if (
      !onlyLine
      || stripeObjectId(onlyLine.price) !== expectedPriceId
      || onlyLine.quantity !== 1
      || onlyLine.currency !== "eur"
      || onlyLine.amount_total !== expectedAmount
      || session.currency !== "eur"
      || session.amount_total !== expectedAmount
    ) {
      await this.refundInvalidPassPayment(paymentIntentId, "invalid-price");
      return null;
    }

    const paymentIntent = typeof session.payment_intent === "object" && session.payment_intent
      ? session.payment_intent as Stripe.PaymentIntent
      : await this.requireStripe().paymentIntents.retrieve(paymentIntentId, {
          expand: ["payment_method", "latest_charge"],
        });
    const charge = typeof paymentIntent.latest_charge === "object" && paymentIntent.latest_charge
      ? paymentIntent.latest_charge as Stripe.Charge
      : paymentIntent.latest_charge
        ? await this.requireStripe().charges.retrieve(paymentIntent.latest_charge)
        : null;
    if (paymentIntent.status !== "succeeded" || !charge) return null;
    const disputeAllowsEntitlement = !charge.disputed
      || await this.chargeHasNoAdverseDisputes(charge.id);
    if (
      !charge.paid
      || charge.refunded
      || !disputeAllowsEntitlement
      || charge.currency !== "eur"
      || paymentIntent.amount_received !== expectedAmount
      || charge.amount !== expectedAmount
      || charge.amount_captured !== expectedAmount
    ) return null;
    const purchasedAt = stripeTimestampToIso(charge.created)
      ?? stripeTimestampToIso(paymentIntent.created)
      ?? new Date().toISOString();
    let expiresAt: string;
    try {
      expiresAt = passExpirationForCheckout({
        kind,
        metadataExpiresAt: session.metadata?.airco_entitlement_expires_at,
        purchasedAt,
      });
    } catch (error) {
      if (error instanceof AuthHttpError && error.code === "expired_pass_upgrade") {
        await this.refundInvalidPassPayment(paymentIntentId, "expired-upgrade");
        return null;
      }
      throw error;
    }
    const existingOwner = await this.auth.findUserByStripeCustomerId(customerId);
    const isReceiptReplay = existingOwner?.userId === userId
      && existingOwner.passReceipts.some((receipt) => receipt.id === paymentIntentId);
    if (!isReceiptReplay && Date.parse(expiresAt) <= Date.now()) {
      await this.refundInvalidPassPayment(paymentIntentId, "expired-on-arrival");
      return null;
    }
    const paymentDetails = await this.cardDetailsFromPaymentIntent(paymentIntent);
    const purchase: StripePassPurchase = {
      userId,
      stripeCustomerId: customerId,
      stripePaymentIntentId: paymentIntentId,
      kind,
      baseReceiptId,
      tier,
      expiresAt,
      purchasedAt,
      paymentBrand: paymentDetails.paymentBrand,
      paymentLast4: paymentDetails.paymentLast4,
    };
    try {
      const updated = await this.auth.applyStripePassPurchase(purchase);
      if (!updated) {
        await this.refundInvalidPassPayment(paymentIntentId, "missing-owner");
        return null;
      }
      await this.expireOtherOpenCheckoutSessions(customerId, session.id);
      return updated;
    } catch (error) {
      if (error instanceof AuthHttpError && [
        "invalid_stripe_pass_purchase",
        "invalid_pass_expiration",
        "pass_already_active_after_payment",
        "pass_upgrade_already_applied",
        "pass_upgrade_base_unavailable",
        "profile_conflict",
      ].includes(error.code)) {
        await this.refundInvalidPassPayment(paymentIntentId, error.code);
        return null;
      }
      throw error;
    }
  }

  private async refundInvalidPassPayment(paymentIntentId: string, reason: string): Promise<Stripe.Refund> {
    return this.createAutomaticRefund(
      paymentIntentId,
      reason,
      `airco-pass-refund-${reason}-${paymentIntentId}`,
    );
  }

  private async createAutomaticRefund(
    paymentIntentId: string,
    reason: string,
    idempotencyKey: string,
  ): Promise<Stripe.Refund> {
    const refund = await this.requireStripe().refunds.create(
      { payment_intent: paymentIntentId, reason: "requested_by_customer" },
      { idempotencyKey },
    );
    if (refund.status === "succeeded") return refund;
    if (refund.status === "pending") {
      console.warn("automatic_refund_pending", { refundId: refund.id, paymentIntentId, reason });
      return refund;
    }
    console.error("automatic_refund_not_accepted", {
      refundId: refund.id,
      paymentIntentId,
      reason,
      status: refund.status ?? "unknown",
    });
    throw new AuthHttpError(502, "automatic_refund_failed");
  }

  private async cardDetailsFromPaymentIntent(paymentIntent: Stripe.PaymentIntent): Promise<{ paymentBrand: string | null; paymentLast4: string | null }> {
    const paymentMethod = typeof paymentIntent.payment_method === "string"
      ? await this.requireStripe().paymentMethods.retrieve(paymentIntent.payment_method)
      : paymentIntent.payment_method;
    if (!paymentMethod || paymentMethod.type !== "card" || !paymentMethod.card) {
      return { paymentBrand: null, paymentLast4: null };
    }
    return {
      paymentBrand: paymentMethod.card.brand.toUpperCase(),
      paymentLast4: paymentMethod.card.last4,
    };
  }

  private async revokeFromCharge(charge: Stripe.Charge, status: "refunded" | "revoked"): Promise<void> {
    const customerId = stripeObjectId(charge.customer);
    const paymentIntentId = stripeObjectId(charge.payment_intent);
    if (!customerId || !paymentIntentId) return;
    await this.auth.revokeStripePassEntitlement(customerId, paymentIntentId, status);
  }

  private async restoreFromCharge(charge: Stripe.Charge): Promise<void> {
    const customerId = stripeObjectId(charge.customer);
    const paymentIntentId = stripeObjectId(charge.payment_intent);
    if (!customerId || !paymentIntentId || charge.refunded) return;
    const restored = await this.auth.restoreStripePassEntitlement(customerId, paymentIntentId);
    const restoredReceipt = restored?.passReceipts.find((receipt) => receipt.id === paymentIntentId);
    if (restored && restoredReceipt?.kind === "upgrade") {
      const base = restored.passReceipts.find((receipt) => receipt.id === restoredReceipt.baseReceiptId);
      if (!base || base.status !== "active" || Date.parse(base.expiresAt) <= Date.now()) {
        // The upgrade dispute can be won after its base payment was refunded,
        // lost, or expired. Return the now-orphaned upgrade payment instead of
        // restoring a paid receipt that cannot grant any entitlement.
        const refund = await this.refundInvalidPassPayment(paymentIntentId, "upgrade-base-reversed");
        await this.auth.revokeStripePassEntitlement(
          customerId,
          paymentIntentId,
          refund.status === "succeeded" ? "refunded" : "revoked",
        );
        return;
      }
    }
    // A dispute may close before Checkout completion reaches us. Replaying the
    // verified paid session after a win grants the missing receipt; when the
    // receipt already exists the same PaymentIntent ID keeps this idempotent.
    const sessions = await this.requireStripe().checkout.sessions.list({
      payment_intent: paymentIntentId,
      limit: 1,
    });
    const sessionId = sessions.data[0]?.id;
    if (!sessionId) return;
    const session = await this.requireStripe().checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent.payment_method", "payment_intent.latest_charge"],
    });
    await this.syncCheckoutSession(session);
  }

  private async chargeHasNoAdverseDisputes(chargeId: string): Promise<boolean> {
    const disputes = await this.requireStripe().disputes.list({ charge: chargeId, limit: 10 });
    return disputes.data.length > 0
      && disputes.data.every((dispute) => disputeStatusAllowsEntitlement(dispute.status));
  }

  private async refundLinkedUpgrades(baseCharge: Stripe.Charge): Promise<void> {
    const customerId = stripeObjectId(baseCharge.customer);
    const basePaymentIntentId = stripeObjectId(baseCharge.payment_intent);
    if (!customerId || !basePaymentIntentId) return;
    const owner = await this.auth.findUserByStripeCustomerId(customerId);
    const upgradePaymentIntentIds = new Set(owner
      ? await this.auth.linkedActiveUpgradePaymentIntentIds(customerId, basePaymentIntentId)
      : []);
    // The user may exercise account deletion while a dispute is open. Stripe
    // remains the financial system of record, so recover linked upgrades from
    // verified Checkout metadata even after the local receipt ledger is gone.
    if (!owner) {
      let startingAfter: string | undefined;
      do {
        const sessions = await this.requireStripe().checkout.sessions.list({
          customer: customerId,
          status: "complete",
          limit: 100,
          ...(startingAfter ? { starting_after: startingAfter } : {}),
        });
        for (const session of sessions.data) {
          if (
            session.mode !== "payment"
            || session.payment_status !== "paid"
            || session.metadata?.airco_purchase_kind !== "upgrade"
            || session.metadata?.airco_base_receipt_id !== basePaymentIntentId
          ) continue;
          const linkedPaymentIntentId = stripeObjectId(session.payment_intent);
          if (linkedPaymentIntentId) upgradePaymentIntentIds.add(linkedPaymentIntentId);
        }
        startingAfter = sessions.has_more ? sessions.data.at(-1)?.id : undefined;
      } while (startingAfter);
    }
    for (const upgradePaymentIntentId of upgradePaymentIntentIds) {
      const paymentIntent = await this.requireStripe().paymentIntents.retrieve(upgradePaymentIntentId, {
        expand: ["latest_charge"],
      });
      const charge = typeof paymentIntent.latest_charge === "object" && paymentIntent.latest_charge
        ? paymentIntent.latest_charge as Stripe.Charge
        : paymentIntent.latest_charge
          ? await this.requireStripe().charges.retrieve(paymentIntent.latest_charge)
          : null;
      if (charge?.disputed && !await this.chargeHasNoAdverseDisputes(charge.id)) {
        // An open dispute cannot be refunded safely, while a lost dispute has
        // already returned the money through the card network. A later win is
        // handled by restoreFromCharge, which refunds an orphaned upgrade.
        continue;
      }
      if (!charge?.refunded) {
        const refund = await this.createAutomaticRefund(
          upgradePaymentIntentId,
          "base-payment-reversed",
          `airco-linked-upgrade-refund-${basePaymentIntentId}-${upgradePaymentIntentId}`,
        );
        await this.auth.revokeStripePassEntitlement(
          customerId,
          upgradePaymentIntentId,
          refund.status === "succeeded" ? "refunded" : "revoked",
        );
        continue;
      }
      await this.auth.revokeStripePassEntitlement(customerId, upgradePaymentIntentId, "refunded");
    }
  }

  private async expireOtherOpenCheckoutSessions(customerId: string, completedSessionId: string): Promise<void> {
    try {
      const sessions = await this.requireStripe().checkout.sessions.list({
        customer: customerId,
        status: "open",
        limit: 100,
      });
      await Promise.all(sessions.data
        .filter((candidate) => candidate.id !== completedSessionId)
        .map((candidate) => this.requireStripe().checkout.sessions.expire(candidate.id)));
    } catch (error) {
      console.warn("Unable to expire superseded Stripe Checkout sessions", error);
    }
  }

  private publicBaseUrl(request: IncomingMessage): string {
    if (this.appBaseUrl) return this.appBaseUrl.replace(/\/+$/, "");
    const forwardedProto = request.headers["x-forwarded-proto"];
    const proto = typeof forwardedProto === "string" && forwardedProto.split(",")[0]?.trim()
      ? forwardedProto.split(",")[0]!.trim()
      : "https";
    const host = request.headers["x-forwarded-host"] || request.headers.host || "localhost:3000";
    const hostname = Array.isArray(host) ? host[0] : host;
    return `${proto}://${hostname}`;
  }

  private assertCheckoutSessionBelongsToUser(session: Stripe.Checkout.Session, user: StoredUserProfile): void {
    const customerId = stripeObjectId(session.customer);
    if (user.stripeCustomerId && customerId && user.stripeCustomerId !== customerId) {
      throw new AuthHttpError(403, "checkout_session_mismatch");
    }
    const metadataUserId = session.metadata?.airco_user_id?.trim().toLowerCase() || "";
    if (!metadataUserId || metadataUserId !== user.userId) {
      throw new AuthHttpError(403, "checkout_session_mismatch");
    }
    if (session.client_reference_id !== user.userId) {
      throw new AuthHttpError(403, "checkout_session_mismatch");
    }
  }
}

export function stripeBillingFromEnvironment(auth: AuthService): StripeBillingService {
  return new StripeBillingService(auth, {
    appBaseUrl: process.env.APP_BASE_URL?.trim() || process.env.PUBLIC_APP_URL?.trim() || undefined,
    secretKey: process.env.STRIPE_SECRET_KEY?.trim() || undefined,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined,
    priceIds: {
      alerts: process.env[PRICE_ENV_BY_PLAN.alerts]?.trim() || undefined,
      radar: process.env[PRICE_ENV_BY_PLAN.radar]?.trim() || undefined,
    },
    radarUpgradePriceId: process.env[RADAR_UPGRADE_PRICE_ENV]?.trim() || undefined,
  });
}

export async function readRawBody(request: IncomingMessage, maxBytes = 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) throw new AuthHttpError(413, "request_too_large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function stripeObjectId(value: string | { id?: string } | null | undefined): string {
  if (typeof value === "string") return value;
  return typeof value?.id === "string" ? value.id : "";
}

function stripeTimestampToIso(value: number | null | undefined): string | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? new Date(value * 1000).toISOString()
    : null;
}

export function stripeLocale(lang: Lang): "zh" | "nl" | "en" | "fr" {
  return lang;
}

export function passExpirationForCheckout(input: {
  kind: PassPurchaseKind;
  metadataExpiresAt?: unknown;
  purchasedAt: string;
}): string {
  const purchasedAt = Date.parse(input.purchasedAt);
  if (!Number.isFinite(purchasedAt)) throw new AuthHttpError(400, "invalid_pass_purchase_time");
  if (input.kind === "upgrade") {
    const existingExpiry = typeof input.metadataExpiresAt === "string" ? Date.parse(input.metadataExpiresAt) : NaN;
    if (!Number.isFinite(existingExpiry) || existingExpiry <= purchasedAt) {
      throw new AuthHttpError(400, "expired_pass_upgrade");
    }
    return new Date(existingExpiry).toISOString();
  }
  return new Date(purchasedAt + PASS_DURATION_MILLISECONDS).toISOString();
}

export function selectPassCheckout(
  user: StoredUserProfile,
  plan: PaidSubscriptionPlan,
  prices: { priceIds: Partial<Record<PaidSubscriptionPlan, string>>; radarUpgradePriceId?: string },
  now = Date.now(),
): { baseReceiptId: string | null; expiresAt: string | null; kind: PassPurchaseKind; priceId: string } {
  const active = entitlementIsActive(user, now);
  if (active && user.entitlementTier === "radar") throw new AuthHttpError(409, "radar_pass_already_active");
  if (active && user.entitlementTier === "alerts") {
    if (plan === "alerts") throw new AuthHttpError(409, "alerts_pass_already_active");
    const expiresAt = user.entitlementExpiresAt ? Date.parse(user.entitlementExpiresAt) : NaN;
    if (Number.isFinite(expiresAt) && expiresAt - now > MINIMUM_UPGRADE_REMAINING_MILLISECONDS) {
      if (!prices.radarUpgradePriceId) throw new AuthHttpError(503, "stripe_upgrade_price_not_configured");
      return {
        baseReceiptId: activePassBaseReceiptId(user, now),
        expiresAt: new Date(expiresAt).toISOString(),
        kind: "upgrade",
        priceId: prices.radarUpgradePriceId,
      };
    }
  }

  const priceId = prices.priceIds[plan];
  if (!priceId) throw new AuthHttpError(503, "stripe_price_not_configured");
  return { baseReceiptId: null, expiresAt: null, kind: "purchase", priceId };
}

function isPassPurchaseKind(value: unknown): value is PassPurchaseKind {
  return value === "purchase" || value === "upgrade";
}

function expectedPassAmount(kind: PassPurchaseKind, tier: PaidSubscriptionPlan): number {
  if (kind === "upgrade") return 500;
  return SUBSCRIPTION_PLAN_DETAILS[tier].priceEur * 100;
}

function disputeStatusAllowsEntitlement(status: Stripe.Dispute.Status): boolean {
  return status === "won" || status === "warning_closed" || status === "prevented";
}

function checkoutIdempotencyKey(
  user: StoredUserProfile,
  plan: PaidSubscriptionPlan,
  kind: PassPurchaseKind,
  lang: Lang,
  now = Date.now(),
): string {
  const bucket = Math.floor(now / CHECKOUT_SESSION_TTL_SECONDS / 1000);
  const entitlementVersion = user.entitlementPurchasedAt
    ? Buffer.from(user.entitlementPurchasedAt).toString("base64url")
    : "new";
  return `airco-pass-${user.userId}-${plan}-${kind}-${lang}-${entitlementVersion}-${bucket}`;
}

function checkoutSessionExpiresAt(now = Date.now()): number {
  const bucket = Math.floor(now / CHECKOUT_SESSION_TTL_SECONDS / 1000);
  return (bucket + 2) * CHECKOUT_SESSION_TTL_SECONDS;
}

function isStripeResourceMissing(error: unknown): boolean {
  return error instanceof Stripe.errors.StripeInvalidRequestError
    && error.code === "resource_missing";
}
