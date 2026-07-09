import type { IncomingMessage } from "node:http";
import Stripe from "stripe";
import {
  isPaidSubscriptionPlan,
  subscriptionChangeDirection,
  subscriptionIsActive,
  type PaidSubscriptionPlan,
  type SubscriptionStatus,
  type UserProfile,
} from "../shared/auth.js";
import type { Lang } from "../shared/i18n.js";
import { AuthHttpError, type AuthService, type StripeSubscriptionSnapshot } from "./auth.js";

type StripeBillingOptions = {
  appBaseUrl?: string;
  secretKey?: string;
  webhookSecret?: string;
  priceIds: Partial<Record<PaidSubscriptionPlan, string>>;
};

type CheckoutSessionResult = {
  url: string;
};

const PRICE_ENV_BY_PLAN: Record<PaidSubscriptionPlan, string> = {
  weekly_basic: "STRIPE_PRICE_WEEKLY_BASIC",
  weekly_priority: "STRIPE_PRICE_WEEKLY_PRIORITY",
  monthly_basic: "STRIPE_PRICE_MONTHLY_BASIC",
  monthly_priority: "STRIPE_PRICE_MONTHLY_PRIORITY",
};

const ACTIVE_STRIPE_STATUSES = new Set(["active", "trialing"]);
const STRIPE_ACTION_REQUIRED_CODES = new Set([
  "subscription_payment_intent_requires_action",
  "invoice_payment_intent_requires_action",
  "payment_intent_action_required",
  "authentication_required",
]);

export class StripeBillingService {
  private readonly stripe: Stripe | null;
  private readonly webhookSecret: string | undefined;
  private readonly appBaseUrl: string | undefined;
  private readonly priceIds: Partial<Record<PaidSubscriptionPlan, string>>;

  constructor(
    private readonly auth: AuthService,
    options: StripeBillingOptions,
  ) {
    this.stripe = options.secretKey ? new Stripe(options.secretKey) : null;
    this.webhookSecret = options.webhookSecret;
    this.appBaseUrl = options.appBaseUrl;
    this.priceIds = options.priceIds;
  }

  async createCheckoutSession(request: IncomingMessage, values: { plan?: unknown; lang: Lang }): Promise<CheckoutSessionResult> {
    const user = await this.auth.requireUser(request);
    if (!isPaidSubscriptionPlan(values.plan)) throw new AuthHttpError(400, "invalid_subscription_plan");
    const stripe = this.requireStripe();

    const price = this.priceIds[values.plan];
    if (!price) throw new AuthHttpError(503, "stripe_price_not_configured");

    if (subscriptionIsActive(user)) {
      return this.changeActiveSubscription(request, user, values.plan, price, values.lang);
    }

    const customerId = await this.ensureStripeCustomer(request, user);
    const baseUrl = this.publicBaseUrl(request);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer: customerId,
      client_reference_id: user.email,
      line_items: [{ price, quantity: 1 }],
      success_url: `${baseUrl}/ready?lang=${values.lang}&checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/subscribe?lang=${values.lang}&checkout=cancelled`,
      subscription_data: {
        metadata: {
          airco_user_email: user.email,
          airco_plan: values.plan,
        },
      },
      metadata: {
        airco_user_email: user.email,
        airco_plan: values.plan,
      },
    });

    if (!session.url) throw new AuthHttpError(502, "stripe_checkout_unavailable");
    return { url: session.url };
  }

  private async changeActiveSubscription(
    request: IncomingMessage,
    user: UserProfile,
    plan: PaidSubscriptionPlan,
    price: string,
    lang: Lang,
  ): Promise<CheckoutSessionResult> {
    const baseUrl = this.publicBaseUrl(request);
    if (user.subscriptionPlan === plan) {
      return { url: `${baseUrl}/ready?lang=${lang}` };
    }
    if (!user.stripeSubscriptionId) throw new AuthHttpError(409, "active_subscription_without_stripe_id");

    const stripe = this.requireStripe();
    const subscription = await this.retrieveSubscription(user.stripeSubscriptionId);
    this.assertSubscriptionBelongsToUser(subscription, user);
    const direction = subscriptionChangeDirection(user.subscriptionPlan, plan);
    if (direction === "downgrade") {
      return this.scheduleSubscriptionDowngrade(request, user, subscription, plan, price, lang);
    }

    const scheduleId = subscriptionScheduleId(subscription.schedule);
    if (scheduleId) await stripe.subscriptionSchedules.release(scheduleId);

    const item = subscription.items.data[0];
    if (!item?.id) throw new AuthHttpError(502, "stripe_subscription_item_missing");

    const updated = await stripe.subscriptions.update(subscription.id, {
      billing_cycle_anchor: "now",
      cancel_at_period_end: false,
      expand: ["default_payment_method"],
      items: [{
        id: item.id,
        price,
        quantity: item.quantity || 1,
      }],
      metadata: {
        ...subscription.metadata,
        airco_user_email: user.email,
        airco_plan: plan,
      },
      payment_behavior: "error_if_incomplete",
      proration_behavior: "always_invoice",
    }).catch((error: unknown) => {
      if (isSubscriptionPaymentActionRequired(error)) {
        console.warn("Stripe subscription update requires customer action; redirecting to Billing Portal", {
          code: stripeErrorCode(error),
          subscription: subscription.id,
        });
        return null;
      }
      throw error;
    });

    if (!updated) {
      return this.createSubscriptionUpdatePortalSession(request, user, subscription, item, price, lang);
    }

    const synced = await this.syncSubscription(updated, plan);
    if (!synced) throw new AuthHttpError(502, "stripe_subscription_sync_failed");
    return { url: `${baseUrl}/ready?lang=${lang}&subscription=updated` };
  }

  private async createSubscriptionUpdatePortalSession(
    request: IncomingMessage,
    user: UserProfile,
    subscription: Stripe.Subscription,
    item: Stripe.SubscriptionItem,
    price: string,
    lang: Lang,
  ): Promise<CheckoutSessionResult> {
    const stripe = this.requireStripe();
    const baseUrl = this.publicBaseUrl(request);
    const customerId = stripeObjectId(subscription.customer) || user.stripeCustomerId;
    if (!customerId) throw new AuthHttpError(400, "stripe_subscription_missing_customer");
    if (!item.id) throw new AuthHttpError(502, "stripe_subscription_item_missing");

    const returnUrl = `${baseUrl}/ready?lang=${lang}&subscription=updated`;
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl,
      flow_data: {
        type: "subscription_update_confirm",
        subscription_update_confirm: {
          subscription: subscription.id,
          items: [{
            id: item.id,
            price,
            quantity: item.quantity || 1,
          }],
        },
        after_completion: {
          type: "redirect",
          redirect: {
            return_url: returnUrl,
          },
        },
      },
    });
    if (!session.url) throw new AuthHttpError(502, "stripe_portal_unavailable");
    return { url: session.url };
  }

  private async scheduleSubscriptionDowngrade(
    request: IncomingMessage,
    user: UserProfile,
    subscription: Stripe.Subscription,
    plan: PaidSubscriptionPlan,
    price: string,
    lang: Lang,
  ): Promise<CheckoutSessionResult> {
    const stripe = this.requireStripe();
    const baseUrl = this.publicBaseUrl(request);
    const item = subscription.items.data[0];
    const currentPrice = item?.price?.id;
    const currentPeriodEnd = subscriptionCurrentPeriodEnd(subscription);
    const currentPeriodStart = subscriptionCurrentPeriodStart(subscription);
    if (!item?.id || !currentPrice || !currentPeriodEnd || !currentPeriodStart) {
      throw new AuthHttpError(502, "stripe_subscription_schedule_unavailable");
    }

    const scheduleId = subscriptionScheduleId(subscription.schedule)
      || (await stripe.subscriptionSchedules.create({ from_subscription: subscription.id })).id;

    const currentPhase = {
      items: [{ price: currentPrice, quantity: item.quantity || 1 }],
      metadata: {
        ...subscription.metadata,
        airco_user_email: user.email,
        airco_plan: user.subscriptionPlan,
      },
      start_date: currentPeriodStart,
      end_date: currentPeriodEnd,
      proration_behavior: "none",
    };
    const nextPhase = {
      items: [{ price, quantity: item.quantity || 1 }],
      metadata: {
        ...subscription.metadata,
        airco_user_email: user.email,
        airco_plan: plan,
      },
      start_date: currentPeriodEnd,
      proration_behavior: "none",
    };

    await stripe.subscriptionSchedules.update(scheduleId, {
      end_behavior: "release",
      phases: [currentPhase, nextPhase],
      proration_behavior: "none",
    } as Stripe.SubscriptionScheduleUpdateParams);

    const effectiveAt = stripeTimestampToIso(currentPeriodEnd);
    if (!effectiveAt) throw new AuthHttpError(502, "stripe_subscription_schedule_unavailable");
    await this.auth.schedulePendingSubscriptionChange(request, plan, effectiveAt);
    return { url: `${baseUrl}/ready?lang=${lang}&subscription=scheduled` };
  }

  async syncCheckoutStatus(request: IncomingMessage, values: { sessionId?: unknown }): Promise<UserProfile> {
    const user = await this.auth.requireUser(request);
    const stripe = this.requireStripe();
    const sessionId = typeof values.sessionId === "string" ? values.sessionId.trim() : "";

    if (sessionId) {
      if (!/^cs_(test|live)_/.test(sessionId)) throw new AuthHttpError(400, "invalid_checkout_session");
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      this.assertCheckoutSessionBelongsToUser(session, user);
      const updated = await this.syncCheckoutSession(session);
      if (updated) return updated;
    }

    const freshUser = await this.auth.currentUser(request) ?? user;
    if (freshUser.stripeSubscriptionId) {
      const subscription = await this.retrieveSubscription(freshUser.stripeSubscriptionId);
      this.assertSubscriptionBelongsToUser(subscription, freshUser);
      const updated = await this.syncSubscription(subscription);
      if (updated) return updated;
    }

    throw new AuthHttpError(400, "stripe_subscription_not_found");
  }

  async cancelSubscription(request: IncomingMessage): Promise<UserProfile> {
    const stripe = this.stripe;
    const user = await this.auth.requireUser(request);
    if (!user.stripeSubscriptionId) return this.auth.cancelSubscription(request);
    if (!stripe) throw new AuthHttpError(503, "stripe_not_configured");

    const subscription = await stripe.subscriptions.update(user.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    const snapshot = await this.snapshotFromSubscription(subscription);
    const updated = await this.auth.applyStripeSubscriptionSnapshot(snapshot);
    return updated ?? this.auth.cancelSubscription(request);
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

    if (event.type === "checkout.session.completed") {
      await this.syncCheckoutSession(event.data.object as Stripe.Checkout.Session);
      return { received: true };
    }

    if (
      event.type === "customer.subscription.created"
      || event.type === "customer.subscription.updated"
      || event.type === "customer.subscription.deleted"
    ) {
      await this.syncSubscription(event.data.object as Stripe.Subscription);
      return { received: true };
    }

    return { received: true };
  }

  private requireStripe(): Stripe {
    if (!this.stripe) throw new AuthHttpError(503, "stripe_not_configured");
    return this.stripe;
  }

  private async ensureStripeCustomer(request: IncomingMessage, user: UserProfile): Promise<string> {
    const stripe = this.requireStripe();
    if (user.stripeCustomerId) {
      try {
        await stripe.customers.update(user.stripeCustomerId, {
          email: user.email,
          metadata: { airco_user_email: user.email },
        });
        return user.stripeCustomerId;
      } catch (error) {
        console.warn("Unable to update stored Stripe customer; creating a new one", error);
      }
    }

    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { airco_user_email: user.email },
    });
    await this.auth.attachStripeCustomer(request, customer.id);
    return customer.id;
  }

  private async syncCheckoutSession(session: Stripe.Checkout.Session): Promise<UserProfile | null> {
    const subscriptionId = stripeObjectId(session.subscription);
    if (!subscriptionId) return null;
    const subscription = await this.retrieveSubscription(subscriptionId);
    return this.syncSubscription(subscription, session.metadata?.airco_plan);
  }

  private async syncSubscription(subscription: Stripe.Subscription, fallbackPlan?: unknown): Promise<UserProfile | null> {
    const snapshot = await this.snapshotFromSubscription(subscription, fallbackPlan);
    return this.auth.applyStripeSubscriptionSnapshot(snapshot);
  }

  private async retrieveSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    return this.requireStripe().subscriptions.retrieve(subscriptionId, {
      expand: ["default_payment_method"],
    });
  }

  private async snapshotFromSubscription(subscription: Stripe.Subscription, fallbackPlan?: unknown): Promise<StripeSubscriptionSnapshot> {
    const customerId = stripeObjectId(subscription.customer);
    if (!customerId) throw new AuthHttpError(400, "stripe_subscription_missing_customer");

    const rawStatus = String(subscription.status || "");
    const status: SubscriptionStatus = ACTIVE_STRIPE_STATUSES.has(rawStatus) ? "active" : "none";
    const plan = this.planFromSubscription(subscription, fallbackPlan);
    const paymentDetails = await this.cardDetailsFromSubscription(subscription);

    return {
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscription.id,
      plan: status === "active" ? plan : null,
      status,
      currentPeriodEnd: status === "active" ? stripeTimestampToIso(subscriptionCurrentPeriodEnd(subscription)) : null,
      cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
      paymentBrand: paymentDetails.paymentBrand,
      paymentLast4: paymentDetails.paymentLast4,
    };
  }

  private planFromSubscription(subscription: Stripe.Subscription, fallbackPlan?: unknown): PaidSubscriptionPlan | null {
    const metadataPlan = subscription.metadata?.airco_plan;
    if (isPaidSubscriptionPlan(metadataPlan)) return metadataPlan;
    if (isPaidSubscriptionPlan(fallbackPlan)) return fallbackPlan;

    const priceId = subscription.items.data[0]?.price?.id;
    if (!priceId) return null;
    for (const [plan, configuredPriceId] of Object.entries(this.priceIds) as Array<[PaidSubscriptionPlan, string | undefined]>) {
      if (configuredPriceId === priceId) return plan;
    }
    return null;
  }

  private async cardDetailsFromSubscription(subscription: Stripe.Subscription): Promise<{ paymentBrand: string | null; paymentLast4: string | null }> {
    const stripe = this.requireStripe();
    const defaultPaymentMethod = subscription.default_payment_method;
    const paymentMethod = typeof defaultPaymentMethod === "string"
      ? await stripe.paymentMethods.retrieve(defaultPaymentMethod)
      : defaultPaymentMethod;

    if (!paymentMethod || paymentMethod.type !== "card" || !paymentMethod.card) {
      return { paymentBrand: null, paymentLast4: null };
    }

    return {
      paymentBrand: paymentMethod.card.brand.toUpperCase(),
      paymentLast4: paymentMethod.card.last4,
    };
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

  private assertCheckoutSessionBelongsToUser(session: Stripe.Checkout.Session, user: UserProfile): void {
    const customerId = stripeObjectId(session.customer);
    if (user.stripeCustomerId && customerId && user.stripeCustomerId !== customerId) {
      throw new AuthHttpError(403, "checkout_session_mismatch");
    }
    const metadataEmail = typeof session.metadata?.airco_user_email === "string"
      ? session.metadata.airco_user_email.trim().toLowerCase()
      : "";
    if (metadataEmail && metadataEmail !== user.email) {
      throw new AuthHttpError(403, "checkout_session_mismatch");
    }
  }

  private assertSubscriptionBelongsToUser(subscription: Stripe.Subscription, user: UserProfile): void {
    const customerId = stripeObjectId(subscription.customer);
    if (user.stripeCustomerId && customerId && user.stripeCustomerId !== customerId) {
      throw new AuthHttpError(403, "stripe_subscription_mismatch");
    }
  }
}

export function stripeBillingFromEnvironment(auth: AuthService): StripeBillingService {
  return new StripeBillingService(auth, {
    appBaseUrl: process.env.APP_BASE_URL?.trim() || process.env.PUBLIC_APP_URL?.trim() || undefined,
    secretKey: process.env.STRIPE_SECRET_KEY?.trim() || undefined,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined,
    priceIds: {
      weekly_basic: process.env[PRICE_ENV_BY_PLAN.weekly_basic]?.trim() || undefined,
      weekly_priority: process.env[PRICE_ENV_BY_PLAN.weekly_priority]?.trim() || undefined,
      monthly_basic: process.env[PRICE_ENV_BY_PLAN.monthly_basic]?.trim() || undefined,
      monthly_priority: process.env[PRICE_ENV_BY_PLAN.monthly_priority]?.trim() || undefined,
    },
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

function subscriptionScheduleId(value: string | { id?: string } | null | undefined): string {
  if (typeof value === "string") return value;
  return typeof value?.id === "string" ? value.id : "";
}

function stripeTimestampToIso(value: number | null): string | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? new Date(value * 1000).toISOString()
    : null;
}

function subscriptionCurrentPeriodStart(subscription: Stripe.Subscription): number | null {
  const value = (subscription as Stripe.Subscription & { current_period_start?: unknown }).current_period_start;
  if (typeof value === "number") return value;
  const itemValue = (subscription.items?.data?.[0] as { current_period_start?: unknown } | undefined)?.current_period_start;
  return typeof itemValue === "number" ? itemValue : null;
}

function subscriptionCurrentPeriodEnd(subscription: Stripe.Subscription): number | null {
  const value = (subscription as Stripe.Subscription & { current_period_end?: unknown }).current_period_end;
  if (typeof value === "number") return value;
  const itemValue = (subscription.items?.data?.[0] as { current_period_end?: unknown } | undefined)?.current_period_end;
  return typeof itemValue === "number" ? itemValue : null;
}

export function isSubscriptionPaymentActionRequired(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = stripeErrorCode(error);
  if (STRIPE_ACTION_REQUIRED_CODES.has(code)) return true;

  const candidate = error as {
    statusCode?: unknown;
    payment_intent?: unknown;
    raw?: {
      payment_intent?: unknown;
    };
  };
  const paymentIntent = paymentIntentRecord(candidate.payment_intent)
    ?? paymentIntentRecord(candidate.raw?.payment_intent);
  return candidate.statusCode === 402 && paymentIntent?.status === "requires_action";
}

function stripeErrorCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const candidate = error as {
    code?: unknown;
    raw?: {
      code?: unknown;
    };
  };
  if (typeof candidate.code === "string") return candidate.code;
  if (typeof candidate.raw?.code === "string") return candidate.raw.code;
  return "";
}

function paymentIntentRecord(value: unknown): { status?: unknown } | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as { status?: unknown }
    : null;
}
