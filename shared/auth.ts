import { SUPPORTED_LANGS, type Lang } from "./i18n.js";

export const PAID_SUBSCRIPTION_PLANS = ["alerts", "radar"] as const;

export const SUBSCRIPTION_PLAN_DETAILS = {
  alerts: {
    billingCycle: "one_time",
    tier: "alerts",
    priceEur: 5,
    intervalDays: 90,
    realtimeStock: false,
    emailAlerts: true,
  },
  radar: {
    billingCycle: "one_time",
    tier: "radar",
    priceEur: 10,
    intervalDays: 90,
    realtimeStock: true,
    emailAlerts: true,
  },
} as const;

export const SUPPORTED_LANGUAGE_PREFERENCES = SUPPORTED_LANGS satisfies readonly Lang[];
export const SUPPORTED_DELIVERY_COUNTRIES = ["fr", "nl"] as const;
export const SUPPORTED_PAYMENT_METHODS = ["card", "ideal"] as const;
export const ENTITLEMENT_TIERS = ["none", "alerts", "radar"] as const;
export const ENTITLEMENT_STATUSES = ["none", "active", "expired", "refunded", "revoked"] as const;
export const SUBSCRIPTION_STATUSES = ["none", "active", "canceled"] as const;

export type PaidSubscriptionPlan = (typeof PAID_SUBSCRIPTION_PLANS)[number];
export type SubscriptionPlan = "none" | PaidSubscriptionPlan;
export type EntitlementTier = (typeof ENTITLEMENT_TIERS)[number];
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];
export type DeliveryCountry = (typeof SUPPORTED_DELIVERY_COUNTRIES)[number];
export type PaymentMethod = (typeof SUPPORTED_PAYMENT_METHODS)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type BillingCycle = (typeof SUBSCRIPTION_PLAN_DETAILS)[PaidSubscriptionPlan]["billingCycle"];
export type SubscriptionTier = (typeof SUBSCRIPTION_PLAN_DETAILS)[PaidSubscriptionPlan]["tier"];

export type UserProfile = {
  email: string;
  nickname: string | null;
  emailAlertsEnabled: boolean;
  entitlementTier: EntitlementTier;
  entitlementStatus: EntitlementStatus;
  entitlementExpiresAt: string | null;
  entitlementPurchasedAt: string | null;
  paymentMethod: PaymentMethod | null;
  paymentBrand: string | null;
  paymentLast4: string | null;
  languagePreference: Lang;
  deliveryCountry: DeliveryCountry;
  createdAt: string;
  updatedAt: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CJK_PATTERN = /[\p{Script=Han}]/u;
const LETTER_OR_NUMBER_PATTERN = /[\p{L}\p{N}]/u;

export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isValidEmail(value: string): boolean {
  return value.length >= 3 && value.length <= 254 && EMAIL_PATTERN.test(value);
}

export function normalizeNickname(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function validateNickname(value: unknown): { ok: true; nickname: string } | { ok: false; error: "empty" | "too_long" | "invalid" } {
  const nickname = normalizeNickname(value);
  if (!nickname) return { ok: false, error: "empty" };
  if ([...nickname].length > 40) return { ok: false, error: "too_long" };
  if (![...nickname].some((character) => LETTER_OR_NUMBER_PATTERN.test(character))) {
    return { ok: false, error: "invalid" };
  }
  return { ok: true, nickname };
}

export function userInitials(nickname: string | null | undefined, email = ""): string {
  const source = normalizeNickname(nickname) || normalizeEmail(email).split("@")[0] || "?";
  const cjk = source.match(CJK_PATTERN)?.[0];
  if (cjk) return cjk;

  const words = source
    .split(/[\s._-]+/)
    .map((word) => [...word].find((character) => LETTER_OR_NUMBER_PATTERN.test(character)) ?? "")
    .filter(Boolean);

  const initials = (words.length >= 2 ? words.slice(0, 2) : words.slice(0, 1))
    .join("")
    .toUpperCase();
  return initials || "?";
}

export function isSubscriptionPlan(value: unknown): value is SubscriptionPlan {
  return value === "none" || PAID_SUBSCRIPTION_PLANS.includes(value as PaidSubscriptionPlan);
}

export function isPaidSubscriptionPlan(value: unknown): value is PaidSubscriptionPlan {
  return PAID_SUBSCRIPTION_PLANS.includes(value as PaidSubscriptionPlan);
}

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return SUPPORTED_PAYMENT_METHODS.includes(value as PaymentMethod);
}

export function isSubscriptionStatus(value: unknown): value is SubscriptionStatus {
  return SUBSCRIPTION_STATUSES.includes(value as SubscriptionStatus);
}

export function isEntitlementTier(value: unknown): value is EntitlementTier {
  return ENTITLEMENT_TIERS.includes(value as EntitlementTier);
}

export function isEntitlementStatus(value: unknown): value is EntitlementStatus {
  return ENTITLEMENT_STATUSES.includes(value as EntitlementStatus);
}

export function entitlementIsActive(user: Pick<UserProfile, "entitlementTier" | "entitlementStatus" | "entitlementExpiresAt">, now = Date.now()): boolean {
  if (user.entitlementTier === "none" || user.entitlementStatus !== "active" || !user.entitlementExpiresAt) return false;
  const periodEnd = Date.parse(user.entitlementExpiresAt);
  return Number.isFinite(periodEnd) && periodEnd > now;
}

/** @deprecated Prefer entitlementIsActive. Kept while callers migrate from subscription naming. */
export const subscriptionIsActive = entitlementIsActive;

export function planIncludesRealtimeStock(plan: SubscriptionPlan): boolean {
  return isPaidSubscriptionPlan(plan) && SUBSCRIPTION_PLAN_DETAILS[plan].realtimeStock;
}

export function entitlementIncludesRealtimeStock(tier: EntitlementTier): boolean {
  return tier === "radar";
}

export function subscriptionTierRank(plan: SubscriptionPlan): number {
  return planIncludesRealtimeStock(plan) ? 2 : isPaidSubscriptionPlan(plan) ? 1 : 0;
}

export function subscriptionChangeDirection(currentPlan: SubscriptionPlan, nextPlan: PaidSubscriptionPlan): "upgrade" | "downgrade" | "lateral" {
  const currentRank = subscriptionTierRank(currentPlan);
  const nextRank = subscriptionTierRank(nextPlan);
  if (nextRank > currentRank) return "upgrade";
  if (nextRank < currentRank) return "downgrade";
  return "lateral";
}

export function hasRealtimeStockAccess(user: Pick<UserProfile, "entitlementTier" | "entitlementStatus" | "entitlementExpiresAt">, now = Date.now()): boolean {
  return entitlementIsActive(user, now) && entitlementIncludesRealtimeStock(user.entitlementTier);
}

export function hasEmailAlertAccess(user: Pick<UserProfile, "entitlementTier" | "entitlementStatus" | "entitlementExpiresAt" | "emailAlertsEnabled">, now = Date.now()): boolean {
  return user.emailAlertsEnabled
    && entitlementIsActive(user, now)
    && user.entitlementTier !== "none";
}

export function isLanguagePreference(value: unknown): value is Lang {
  return SUPPORTED_LANGUAGE_PREFERENCES.includes(value as Lang);
}

export function isDeliveryCountry(value: unknown): value is DeliveryCountry {
  return SUPPORTED_DELIVERY_COUNTRIES.includes(value as DeliveryCountry);
}
