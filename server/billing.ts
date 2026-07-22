import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
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
  PASS_WITHDRAWAL_DAYS,
  isCurrentCheckoutLegalAcceptance,
  type CheckoutLegalAcceptance,
} from "../shared/legal.js";
import {
  AuthHttpError,
  activePassBaseReceiptId,
  type AuthService,
  type StoredUserProfile,
  type StripePassPurchase,
} from "./auth.js";
import {
  legalConfigurationFromEnvironment,
  type LegalRuntimeConfiguration,
} from "./legal.js";
import {
  hashProviderIdentifier,
  logError,
  logWarn,
} from "./safe-logger.js";

type StripeBillingOptions = {
  appBaseUrl?: string;
  secretKey?: string;
  webhookSecret?: string;
  priceIds: Partial<Record<PaidSubscriptionPlan, string>>;
  radarUpgradePriceId?: string;
  legalConfiguration?: LegalRuntimeConfiguration;
  withdrawalSigningKey?: string;
};

type CheckoutSessionResult = { url: string };
type PassPurchaseKind = "purchase" | "upgrade";
export type WithdrawalPreviewResult = {
  token: string;
  confirmationEmail: string;
  orderReference: string;
  tier: PaidSubscriptionPlan;
  amountEurCents: number;
  purchasedAt: string;
  withdrawalDeadline: string;
};
type WithdrawalClaims = {
  expiresAt: number;
  paymentIntentId: string;
  userId: string;
  consumerName: string;
  electronicConfirmationAcceptedAt: string;
};

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
  private readonly legalConfiguration: LegalRuntimeConfiguration;
  private readonly withdrawalSigningKey: string | undefined;
  private readonly liveMode: boolean;

  constructor(
    private readonly auth: AuthService,
    options: StripeBillingOptions,
  ) {
    this.stripe = options.secretKey ? new Stripe(options.secretKey) : null;
    this.webhookSecret = options.webhookSecret;
    this.appBaseUrl = options.appBaseUrl;
    this.priceIds = options.priceIds;
    this.radarUpgradePriceId = options.radarUpgradePriceId;
    this.legalConfiguration = options.legalConfiguration ?? legalConfigurationFromEnvironment();
    this.withdrawalSigningKey = options.withdrawalSigningKey?.trim() || undefined;
    // Restricted keys can use rk_live_. Treat every configured key that is
    // not explicitly a Stripe test key as live/unknown and therefore require
    // complete production compliance configuration (fail closed).
    this.liveMode = Boolean(options.secretKey && !/^(?:sk|rk)_test_/.test(options.secretKey));
    if (this.withdrawalSigningKey && this.withdrawalSigningKey.length < 32) {
      throw new Error("Withdrawal signing key must be at least 32 characters");
    }
  }

  async createCheckoutSession(
    request: IncomingMessage,
    values: { plan?: unknown; lang: Lang; legal?: unknown },
  ): Promise<CheckoutSessionResult> {
    const user = await this.auth.requireUser(request);
    if (!isPaidSubscriptionPlan(values.plan)) throw new AuthHttpError(400, "invalid_pass");
    if (!isCurrentCheckoutLegalAcceptance(values.legal)) {
      throw new AuthHttpError(400, "legal_acceptance_required");
    }
    const stripe = this.requireStripe();
    if (this.liveMode && (!this.legalConfiguration.readyForLivePayments || !this.withdrawalSigningKey)) {
      throw new AuthHttpError(503, "live_checkout_legal_configuration_incomplete");
    }
    const selection = selectPassCheckout(user, values.plan, {
      priceIds: this.priceIds,
      radarUpgradePriceId: this.radarUpgradePriceId,
    });
    const customerId = await this.ensureStripeCustomer(request, user, values.lang);
    const baseUrl = this.publicBaseUrl(request);
    const checkoutNow = Date.now();
    const acceptedAt = new Date(checkoutNow).toISOString();
    const expectedAmount = expectedPassAmount(selection.kind, values.plan);
    const metadata: Stripe.MetadataParam = {
      airco_user_id: user.userId,
      airco_entitlement_tier: values.plan,
      airco_purchase_kind: selection.kind,
      airco_entitlement_expires_at: selection.expiresAt ?? "",
      airco_base_receipt_id: selection.baseReceiptId ?? "",
      airco_terms_version: values.legal.termsVersion,
      airco_privacy_version: values.legal.privacyVersion,
      airco_checkout_locale: values.lang,
      airco_accepted_at: acceptedAt,
      airco_immediate_performance: "true",
      airco_amount_eur_cents: String(expectedAmount),
      airco_duration_days: selection.kind === "purchase" ? String(SUBSCRIPTION_PLAN_DETAILS[values.plan].intervalDays) : "upgrade",
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
      idempotencyKey: checkoutIdempotencyKey(
        user,
        values.plan,
        selection.kind,
        values.lang,
        values.legal,
        checkoutNow,
      ),
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

  async requestWithdrawalCode(values: { email?: unknown; lang: Lang; clientIp?: string }): Promise<{
    ok: true;
    retryAfterSeconds: number;
    devCode?: string;
  }> {
    return this.auth.requestCode(values.email, values.lang, values.clientIp);
  }

  async previewWithdrawal(
    request: IncomingMessage,
    values: {
      email?: unknown;
      code?: unknown;
      orderReference?: unknown;
      consumerName?: unknown;
      electronicConfirmationAccepted?: unknown;
    },
  ): Promise<WithdrawalPreviewResult> {
    const consumerName = normalizeConsumerName(values.consumerName);
    if (!consumerName || values.electronicConfirmationAccepted !== true) {
      throw new AuthHttpError(400, "withdrawal_confirmation_required");
    }
    const user = await this.withdrawalUser(request, values);
    const requestedReference = normalizeOrderReference(values.orderReference);
    const candidates = user.passReceipts
      .filter((receipt) => receipt.kind !== "legacy" && receipt.amountEurCents !== null)
      .sort((left, right) => Date.parse(right.purchasedAt) - Date.parse(left.purchasedAt));
    const receipt = requestedReference
      ? candidates.find((candidate) => (
          candidate.id === requestedReference || candidate.checkoutSessionId === requestedReference
        ))
      : candidates.find((candidate) => candidate.status === "active");
    if (!receipt) throw new AuthHttpError(404, "withdrawal_order_not_found");
    assertWithdrawalEligible(receipt);
    const token = this.createWithdrawalToken({
      userId: user.userId,
      paymentIntentId: receipt.id,
      expiresAt: Date.now() + 10 * 60 * 1000,
      consumerName,
      electronicConfirmationAcceptedAt: new Date().toISOString(),
    });
    const linkedUpgradeAmount = receipt.kind === "purchase"
      ? user.passReceipts
          .filter((candidate) => (
            candidate.kind === "upgrade"
            && candidate.baseReceiptId === receipt.id
            && candidate.status === "active"
            && candidate.amountEurCents !== null
          ))
          .reduce((total, candidate) => total + candidate.amountEurCents!, 0)
      : 0;
    return {
      token,
      confirmationEmail: user.email,
      orderReference: receipt.checkoutSessionId ?? receipt.id,
      tier: receipt.tier,
      amountEurCents: receipt.amountEurCents! + linkedUpgradeAmount,
      purchasedAt: receipt.purchasedAt,
      withdrawalDeadline: withdrawalDeadline(receipt.purchasedAt),
    };
  }

  async confirmWithdrawal(values: { token?: unknown }): Promise<{
    ok: true;
    refundStatus: string;
    withdrawalReference: string;
  }> {
    const claims = this.verifyWithdrawalToken(values.token);
    let user = await this.auth.findUserById(claims.userId);
    let receipt = user?.passReceipts.find((candidate) => candidate.id === claims.paymentIntentId);
    if (!user || !receipt) throw new AuthHttpError(404, "withdrawal_order_not_found");
    if (
      receipt.withdrawalReference
      && receipt.stripeRefundId
      && receipt.stripeRefundStatus
      && !refundStatusAllowsRetry(receipt.stripeRefundStatus)
    ) {
      if (receipt.stripeRefundStatus === "pending" || receipt.stripeRefundStatus === "requested") {
        const refreshed = await this.refreshPersistedConsumerWithdrawal(
          user.stripeCustomerId,
          receipt.id,
          receipt.stripeRefundId,
        );
        user = refreshed.user;
        receipt = user.passReceipts.find((candidate) => candidate.id === claims.paymentIntentId);
        if (!receipt?.withdrawalReference) throw new AuthHttpError(404, "withdrawal_order_not_found");
        if (refundStatusAllowsRetry(refreshed.refundStatus)) {
          // The original attempt failed after its pending result was stored.
          // Continue below with a fresh Stripe idempotency key.
        } else {
          if (!refundStatusIsAccepted(refreshed.refundStatus)) {
            throw new AuthHttpError(502, "automatic_refund_failed");
          }
          await this.completeWithdrawalSideEffects(user.userId, receipt.id);
          return {
            ok: true,
            refundStatus: refreshed.refundStatus,
            withdrawalReference: receipt.withdrawalReference,
          };
        }
      } else {
        if (!refundStatusIsAccepted(receipt.stripeRefundStatus)) {
          throw new AuthHttpError(502, "automatic_refund_failed");
        }
        await this.completeWithdrawalSideEffects(user.userId, receipt.id);
        return {
          ok: true,
          refundStatus: receipt.stripeRefundStatus,
          withdrawalReference: receipt.withdrawalReference,
        };
      }
    }
    if (!user.stripeCustomerId) throw new AuthHttpError(409, "withdrawal_order_not_refundable");
    if (!receipt.withdrawalReference) {
      assertWithdrawalEligible(receipt);
      const initiated = await this.auth.initiatePassWithdrawal(user.userId, receipt.id, {
        requestedAt: new Date().toISOString(),
        reference: `WD-${randomUUID().slice(0, 8).toUpperCase()}`,
        consumerName: claims.consumerName,
        electronicConfirmationAcceptedAt: claims.electronicConfirmationAcceptedAt,
      });
      receipt = initiated?.passReceipts.find((candidate) => candidate.id === claims.paymentIntentId);
      user = initiated;
      if (!user || !receipt?.withdrawalReference || !receipt.withdrawalRequestedAt) {
        throw new AuthHttpError(404, "withdrawal_order_not_found");
      }
    }
    const withdrawalReference = receipt.withdrawalReference;
    const requestedAt = receipt.withdrawalRequestedAt;
    if (!withdrawalReference || !requestedAt) {
      throw new AuthHttpError(409, "withdrawal_order_not_refundable");
    }
    const stripeCustomerId = user.stripeCustomerId;
    if (!stripeCustomerId) throw new AuthHttpError(409, "withdrawal_order_not_refundable");
    const retryAfterRefundId = receipt.stripeRefundId
      && refundStatusAllowsRetry(receipt.stripeRefundStatus)
      ? receipt.stripeRefundId
      : null;
    const refund = await this.createAutomaticRefund(
      receipt.id,
      retryAfterRefundId
        ? `airco-consumer-withdrawal-retry-${retryAfterRefundId}`
        : `airco-consumer-withdrawal-${receipt.id}`,
    );
    const status = refund.status === "succeeded" ? "refunded" : "revoked";
    const updated = await this.auth.recordPassWithdrawal(stripeCustomerId, receipt.id, {
      requestedAt,
      reference: withdrawalReference,
      stripeRefundId: refund.id,
      stripeRefundStatus: refund.status ?? "pending",
      receiptStatus: status,
    });
    if (!updated) throw new AuthHttpError(404, "withdrawal_order_not_found");
    const refreshed = await this.refreshPersistedConsumerWithdrawal(
      stripeCustomerId,
      receipt.id,
      refund.id,
    );
    if (refundStatusAllowsRetry(refreshed.refundStatus)) {
      // A terminal refund webhook won the race with this request. Preserve
      // the restored entitlement and surface the failure instead of reporting
      // the stale create response as successful.
      throw new AuthHttpError(502, "automatic_refund_failed");
    }
    if (!refundStatusIsAccepted(refreshed.refundStatus)) {
      throw new AuthHttpError(502, "automatic_refund_failed");
    }
    await this.completeWithdrawalSideEffects(refreshed.user.userId, receipt.id);
    return {
      ok: true,
      refundStatus: refreshed.refundStatus,
      withdrawalReference,
    };
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
      logWarn("stripe_webhook_signature_verification_failed", error);
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
      if (refundStatusAllowsRetry(refund.status) || event.type === "refund.failed") {
        let charge: Stripe.Charge | null = null;
        try {
          charge = await this.chargeForRefund(refund);
        } catch (error) {
          logError("automatic_refund_reconciliation_lookup_failed", error, {
            refundHash: hashProviderIdentifier(refund.id),
            paymentIntentHash: hashProviderIdentifier(stripeObjectId(refund.payment_intent)),
          });
        }
        const reconciliation = charge
          ? await this.reconcileRetryableConsumerWithdrawal(refund, charge)
          : "unrelated";
        logError("automatic_refund_failed", undefined, {
          refundHash: hashProviderIdentifier(refund.id),
          paymentIntentHash: hashProviderIdentifier(stripeObjectId(refund.payment_intent)),
          status: refund.status ?? "unknown",
        });
        // A delayed failure for an older refund can arrive after a retry has
        // already compensated the customer. Acknowledge that stale event so
        // it cannot overwrite the newer attempt or retry forever.
        if (reconciliation === "stale") return { received: true };
        // Keep retrying and surface a durable operational signal. Never report
        // a failed refund as successfully compensated.
        throw new AuthHttpError(502, "automatic_refund_failed");
      }
      const chargeId = stripeObjectId(refund.charge);
      if (chargeId) {
        const charge = await stripe.charges.retrieve(chargeId);
        if (refund.status === "succeeded" && charge.refunded) {
          await this.revokeFromCharge(charge, "refunded");
          await this.refundLinkedUpgrades(charge);
        }
        await this.reconcileConsumerWithdrawal(refund, charge);
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

  private async withdrawalUser(
    request: IncomingMessage,
    values: { email?: unknown; code?: unknown },
  ): Promise<StoredUserProfile> {
    const current = await this.auth.currentUser(request);
    if (current) return current;
    return this.auth.verifyExistingEmailCode(values.email, values.code);
  }

  private createWithdrawalToken(claims: WithdrawalClaims): string {
    if (!this.withdrawalSigningKey) throw new AuthHttpError(503, "withdrawal_unavailable");
    const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const signature = createHmac("sha256", this.withdrawalSigningKey).update(body).digest("base64url");
    return `${body}.${signature}`;
  }

  private verifyWithdrawalToken(rawToken: unknown): WithdrawalClaims {
    if (!this.withdrawalSigningKey) throw new AuthHttpError(503, "withdrawal_unavailable");
    const token = typeof rawToken === "string" ? rawToken.trim() : "";
    const [body, signature, extra] = token.split(".");
    if (!body || !signature || extra) throw new AuthHttpError(400, "invalid_withdrawal_token");
    const expected = createHmac("sha256", this.withdrawalSigningKey).update(body).digest();
    let actual: Buffer;
    try {
      actual = Buffer.from(signature, "base64url");
    } catch {
      throw new AuthHttpError(400, "invalid_withdrawal_token");
    }
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
      throw new AuthHttpError(400, "invalid_withdrawal_token");
    }
    try {
      const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<WithdrawalClaims>;
      if (
        typeof claims.userId !== "string"
        || typeof claims.paymentIntentId !== "string"
        || typeof claims.expiresAt !== "number"
        || claims.expiresAt <= Date.now()
        || !normalizeConsumerName(claims.consumerName)
        || typeof claims.electronicConfirmationAcceptedAt !== "string"
        || !Number.isFinite(Date.parse(claims.electronicConfirmationAcceptedAt))
      ) throw new Error("invalid claims");
      return claims as WithdrawalClaims;
    } catch {
      throw new AuthHttpError(400, "invalid_withdrawal_token");
    }
  }

  private async sendPurchaseConfirmationIfNeeded(
    user: StoredUserProfile,
    paymentIntentId: string,
  ): Promise<void> {
    const receipt = user.passReceipts.find((candidate) => candidate.id === paymentIntentId);
    if (!receipt || receipt.purchaseConfirmationSentAt || receipt.amountEurCents === null) return;
    const baseUrl = (this.appBaseUrl ?? "https://airco-tracker.eu").replace(/\/+$/, "");
    await this.auth.sendPassPurchaseConfirmation(user, {
      orderReference: receipt.checkoutSessionId ?? receipt.id,
      tier: receipt.tier,
      amountEurCents: receipt.amountEurCents,
      purchasedAt: receipt.purchasedAt,
      expiresAt: receipt.expiresAt,
      termsVersion: receipt.termsVersion ?? this.legalConfiguration.termsVersion,
      privacyVersion: receipt.privacyVersion ?? this.legalConfiguration.privacyVersion,
      immediatePerformanceRequested: receipt.immediatePerformanceRequested === true,
      withdrawalDeadline: withdrawalDeadline(receipt.purchasedAt),
      withdrawalUrl: `${baseUrl}/withdrawal.html?lang=${receipt.checkoutLocale ?? user.languagePreference}`,
      termsUrl: `${baseUrl}/terms.html?lang=${receipt.checkoutLocale ?? user.languagePreference}`,
      privacyUrl: `${baseUrl}/privacy.html?lang=${receipt.checkoutLocale ?? user.languagePreference}`,
      operatorName: this.legalConfiguration.operatorName ?? "Airco Tracker",
      operatorAddress: this.legalConfiguration.operatorAddress ?? "Address available on the website imprint",
      contactEmail: this.legalConfiguration.contactEmail ?? "support@airco-tracker.eu",
      withdrawalEmail: this.legalConfiguration.withdrawalEmail
        ?? this.legalConfiguration.contactEmail
        ?? "support@airco-tracker.eu",
      vatStatus: this.legalConfiguration.vatStatus ?? "not_registered",
      vatId: this.legalConfiguration.vatId,
    });
    await this.auth.markPassPurchaseConfirmationSent(user.stripeCustomerId!, receipt.id);
  }

  private async completeWithdrawalSideEffects(userId: string, basePaymentIntentId: string): Promise<void> {
    let user = await this.auth.findUserById(userId);
    let receipt = user?.passReceipts.find((candidate) => candidate.id === basePaymentIntentId);
    if (!user || !receipt || !receipt.withdrawalReference || !receipt.withdrawalRequestedAt) return;
    if (receipt.kind === "purchase") {
      const paymentIntent = await this.requireStripe().paymentIntents.retrieve(receipt.id, { expand: ["latest_charge"] });
      const charge = typeof paymentIntent.latest_charge === "object" && paymentIntent.latest_charge
        ? paymentIntent.latest_charge as Stripe.Charge
        : paymentIntent.latest_charge
          ? await this.requireStripe().charges.retrieve(paymentIntent.latest_charge)
          : null;
      if (charge) await this.refundLinkedUpgrades(charge);
      user = await this.auth.findUserById(userId);
      receipt = user?.passReceipts.find((candidate) => candidate.id === basePaymentIntentId);
      if (!user || !receipt) return;
    }
    if (!receipt.withdrawalReference || !receipt.withdrawalRequestedAt) return;
    if (receipt.withdrawalConfirmationSentAt) return;
    if (!receipt.withdrawalConsumerName) return;
    const refundedReceipts = [
      receipt,
      ...user.passReceipts.filter((candidate) => (
        receipt.kind === "purchase"
        && candidate.kind === "upgrade"
        && candidate.baseReceiptId === receipt.id
        && (candidate.status === "refunded" || candidate.status === "revoked")
      )),
    ].filter((candidate) => candidate.amountEurCents !== null);
    const refundedItems = refundedReceipts.map((candidate) => ({
      orderReference: candidate.checkoutSessionId ?? candidate.id,
      kind: candidate.kind as "purchase" | "upgrade",
      amountEurCents: candidate.amountEurCents!,
    }));
    const amountEurCents = refundedItems.reduce((sum, item) => sum + item.amountEurCents, 0);
    await this.auth.sendWithdrawalConfirmation(user, {
      orderReference: receipt.checkoutSessionId ?? receipt.id,
      refundReference: receipt.withdrawalReference,
      requestedAt: receipt.withdrawalRequestedAt,
      amountEurCents,
      refundedItems,
      status: receipt.stripeRefundStatus ?? "pending",
      operatorName: this.legalConfiguration.operatorName ?? "Airco Tracker",
      consumerName: receipt.withdrawalConsumerName,
      confirmationEmail: user.email,
      contactEmail: this.legalConfiguration.withdrawalEmail
        ?? this.legalConfiguration.contactEmail
        ?? "support@airco-tracker.eu",
    });
    if (user.stripeCustomerId) {
      await this.auth.markWithdrawalConfirmationSent(user.stripeCustomerId, receipt.id);
    }
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
        logWarn("stored_stripe_customer_missing_replacement_created", error);
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
    const checkoutLocale = session.metadata?.airco_checkout_locale;
    const termsVersion = session.metadata?.airco_terms_version;
    const privacyVersion = session.metadata?.airco_privacy_version;
    const acceptedAt = session.metadata?.airco_accepted_at;
    const acceptedAtMillis = typeof acceptedAt === "string" ? Date.parse(acceptedAt) : NaN;
    const metadataAmount = Number.parseInt(session.metadata?.airco_amount_eur_cents ?? "", 10);
    const immediatePerformanceRequested = session.metadata?.airco_immediate_performance === "true";
    const expectedPriceId = kind === "upgrade" ? this.radarUpgradePriceId : (
      isPaidSubscriptionPlan(tier) ? this.priceIds[tier] : undefined
    );
    if (
      !paymentIntentId
      || !userId
      || !isPaidSubscriptionPlan(tier)
      || !isPassPurchaseKind(kind)
      || !expectedPriceId
      || !isCheckoutLocale(checkoutLocale)
      || termsVersion !== this.legalConfiguration.termsVersion
      || privacyVersion !== this.legalConfiguration.privacyVersion
      || !Number.isFinite(acceptedAtMillis)
      || acceptedAtMillis > Date.now() + 5 * 60 * 1000
      || !immediatePerformanceRequested
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
      || metadataAmount !== expectedAmount
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
      checkoutSessionId: session.id,
      kind,
      baseReceiptId,
      tier,
      expiresAt,
      purchasedAt,
      amountEurCents: expectedAmount,
      checkoutLocale,
      termsVersion,
      privacyVersion,
      acceptedAt: new Date(acceptedAtMillis).toISOString(),
      immediatePerformanceRequested: true,
      paymentBrand: paymentDetails.paymentBrand,
      paymentLast4: paymentDetails.paymentLast4,
    };
    try {
      const updated = await this.auth.applyStripePassPurchase(purchase);
      if (!updated) {
        await this.refundInvalidPassPayment(paymentIntentId, "missing-owner");
        return null;
      }
      await this.sendPurchaseConfirmationIfNeeded(updated, paymentIntentId);
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
      `airco-pass-refund-${reason}-${paymentIntentId}`,
    );
  }

  private async createAutomaticRefund(
    paymentIntentId: string,
    idempotencyKey: string,
  ): Promise<Stripe.Refund> {
    const refund = await this.requireStripe().refunds.create(
      { payment_intent: paymentIntentId, reason: "requested_by_customer" },
      { idempotencyKey },
    );
    if (refund.status === "succeeded") return refund;
    if (refund.status === "pending") {
      logWarn("automatic_refund_pending", undefined, {
        refundHash: hashProviderIdentifier(refund.id),
        paymentIntentHash: hashProviderIdentifier(paymentIntentId),
        status: refund.status ?? "pending",
      });
      return refund;
    }
    logError("automatic_refund_not_accepted", undefined, {
      refundHash: hashProviderIdentifier(refund.id),
      paymentIntentHash: hashProviderIdentifier(paymentIntentId),
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

  private async reconcileConsumerWithdrawal(refund: Stripe.Refund, charge: Stripe.Charge): Promise<void> {
    const customerId = stripeObjectId(charge.customer);
    const paymentIntentId = stripeObjectId(refund.payment_intent) || stripeObjectId(charge.payment_intent);
    if (!customerId || !paymentIntentId) return;
    const user = await this.auth.findUserByStripeCustomerId(customerId);
    const receipt = user?.passReceipts.find((candidate) => candidate.id === paymentIntentId);
    if (!user || !receipt?.withdrawalReference || !receipt.withdrawalRequestedAt) return;
    const updated = await this.auth.recordPassWithdrawal(customerId, paymentIntentId, {
      requestedAt: receipt.withdrawalRequestedAt,
      reference: receipt.withdrawalReference,
      stripeRefundId: refund.id,
      stripeRefundStatus: refund.status ?? "pending",
      receiptStatus: refund.status === "succeeded" ? "refunded" : "revoked",
    });
    if (updated) await this.completeWithdrawalSideEffects(updated.userId, paymentIntentId);
  }

  private async refreshPersistedConsumerWithdrawal(
    customerId: string | null,
    paymentIntentId: string,
    refundId: string,
  ): Promise<{ refundStatus: string; user: StoredUserProfile }> {
    if (!customerId) throw new AuthHttpError(409, "withdrawal_order_not_refundable");
    const refund = await this.requireStripe().refunds.retrieve(refundId);
    const current = await this.auth.findUserByStripeCustomerId(customerId);
    const receipt = current?.passReceipts.find((candidate) => candidate.id === paymentIntentId);
    if (!current || !receipt?.withdrawalReference || !receipt.withdrawalRequestedAt) {
      throw new AuthHttpError(404, "withdrawal_order_not_found");
    }
    const refundStatus = refund.status ?? "pending";
    const receiptStatus = refundStatus === "succeeded"
      ? "refunded"
      : refundStatusAllowsRetry(refundStatus)
        ? "active"
        : "revoked";
    const updated = await this.auth.recordPassWithdrawal(customerId, paymentIntentId, {
      requestedAt: receipt.withdrawalRequestedAt,
      reference: receipt.withdrawalReference,
      stripeRefundId: refund.id,
      stripeRefundStatus: refundStatus,
      receiptStatus,
    });
    if (!updated) throw new AuthHttpError(404, "withdrawal_order_not_found");
    return { refundStatus, user: updated };
  }

  private async chargeForRefund(refund: Stripe.Refund): Promise<Stripe.Charge | null> {
    const chargeId = stripeObjectId(refund.charge);
    if (chargeId) return this.requireStripe().charges.retrieve(chargeId);
    const paymentIntentId = stripeObjectId(refund.payment_intent);
    if (!paymentIntentId) return null;
    const paymentIntent = await this.requireStripe().paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge"],
    });
    if (typeof paymentIntent.latest_charge === "object" && paymentIntent.latest_charge) {
      return paymentIntent.latest_charge as Stripe.Charge;
    }
    return paymentIntent.latest_charge
      ? this.requireStripe().charges.retrieve(paymentIntent.latest_charge)
      : null;
  }

  private async reconcileRetryableConsumerWithdrawal(
    refund: Stripe.Refund,
    charge: Stripe.Charge,
  ): Promise<"reconciled" | "stale" | "unrelated"> {
    const customerId = stripeObjectId(charge.customer);
    const paymentIntentId = stripeObjectId(refund.payment_intent) || stripeObjectId(charge.payment_intent);
    if (!customerId || !paymentIntentId) return "unrelated";
    const user = await this.auth.findUserByStripeCustomerId(customerId);
    const receipt = user?.passReceipts.find((candidate) => candidate.id === paymentIntentId);
    if (!user || !receipt?.withdrawalReference || !receipt.withdrawalRequestedAt) return "unrelated";
    if (receipt.stripeRefundId && receipt.stripeRefundId !== refund.id) return "stale";
    await this.auth.recordPassWithdrawal(customerId, paymentIntentId, {
      requestedAt: receipt.withdrawalRequestedAt,
      reference: receipt.withdrawalReference,
      stripeRefundId: refund.id,
      stripeRefundStatus: refund.status ?? "failed",
      receiptStatus: "active",
    });
    return "reconciled";
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
      logWarn("superseded_checkout_expiry_failed", error);
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
    legalConfiguration: legalConfigurationFromEnvironment(),
    withdrawalSigningKey: process.env.WITHDRAWAL_SIGNING_KEY?.trim() || undefined,
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
  legal: CheckoutLegalAcceptance,
  now = Date.now(),
): string {
  const bucket = Math.floor(now / CHECKOUT_SESSION_TTL_SECONDS / 1000);
  const entitlementVersion = user.entitlementPurchasedAt
    ? Buffer.from(user.entitlementPurchasedAt).toString("base64url")
    : "new";
  return `airco-pass-${user.userId}-${plan}-${kind}-${lang}-${legal.termsVersion}-${legal.privacyVersion}-${entitlementVersion}-${bucket}`;
}

function checkoutSessionExpiresAt(now = Date.now()): number {
  const bucket = Math.floor(now / CHECKOUT_SESSION_TTL_SECONDS / 1000);
  return (bucket + 2) * CHECKOUT_SESSION_TTL_SECONDS;
}

function isStripeResourceMissing(error: unknown): boolean {
  return error instanceof Stripe.errors.StripeInvalidRequestError
    && error.code === "resource_missing";
}

function isCheckoutLocale(value: unknown): value is Lang {
  return value === "zh" || value === "nl" || value === "en" || value === "fr";
}

function normalizeOrderReference(value: unknown): string {
  const reference = typeof value === "string" ? value.trim() : "";
  if (!reference) return "";
  if (!/^(?:cs_(?:test|live)_|pi_)[A-Za-z0-9_]+$/.test(reference) || reference.length > 255) {
    throw new AuthHttpError(400, "invalid_order_reference");
  }
  return reference;
}

function normalizeConsumerName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || normalized.length > 200 || !/[\p{L}\p{N}]/u.test(normalized)) return null;
  return normalized;
}

function withdrawalDeadline(purchasedAt: string): string {
  const purchasedAtMillis = Date.parse(purchasedAt);
  if (!Number.isFinite(purchasedAtMillis)) throw new AuthHttpError(409, "withdrawal_order_not_eligible");
  return new Date(purchasedAtMillis + PASS_WITHDRAWAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

function assertWithdrawalEligible(receipt: StoredUserProfile["passReceipts"][number]): void {
  if (
    receipt.kind === "legacy"
    || receipt.amountEurCents === null
    || receipt.status !== "active"
    || (receipt.stripeRefundId && !refundStatusAllowsRetry(receipt.stripeRefundStatus))
    || Date.parse(withdrawalDeadline(receipt.purchasedAt)) <= Date.now()
  ) {
    throw new AuthHttpError(409, "withdrawal_order_not_eligible");
  }
}

function refundStatusAllowsRetry(status: string | null): boolean {
  return status === "failed" || status === "canceled";
}

function refundStatusIsAccepted(status: string | null): boolean {
  return status === "pending" || status === "succeeded";
}
