import type { IncomingMessage } from "node:http";
import Stripe from "stripe";
import {
  isPaidSubscriptionPlan,
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
    if (subscriptionIsActive(user)) throw new AuthHttpError(409, "active_subscription");
    const stripe = this.requireStripe();

    const price = this.priceIds[values.plan];
    if (!price) throw new AuthHttpError(503, "stripe_price_not_configured");

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

  private async syncCheckoutSession(session: Stripe.Checkout.Session): Promise<void> {
    const subscriptionId = stripeObjectId(session.subscription);
    if (!subscriptionId) return;
    const subscription = await this.requireStripe().subscriptions.retrieve(subscriptionId, {
      expand: ["default_payment_method"],
    });
    await this.syncSubscription(subscription, session.metadata?.airco_plan);
  }

  private async syncSubscription(subscription: Stripe.Subscription, fallbackPlan?: unknown): Promise<void> {
    const snapshot = await this.snapshotFromSubscription(subscription, fallbackPlan);
    await this.auth.applyStripeSubscriptionSnapshot(snapshot);
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

function stripeObjectId(value: string | { id?: string } | null): string {
  if (typeof value === "string") return value;
  return typeof value?.id === "string" ? value.id : "";
}

function stripeTimestampToIso(value: number | null): string | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? new Date(value * 1000).toISOString()
    : null;
}

function subscriptionCurrentPeriodEnd(subscription: Stripe.Subscription): number | null {
  const value = (subscription as Stripe.Subscription & { current_period_end?: unknown }).current_period_end;
  return typeof value === "number" ? value : null;
}
