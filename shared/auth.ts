import type { Lang } from "./i18n.js";

export const PAID_SUBSCRIPTION_PLANS = [
  "weekly_basic",
  "weekly_priority",
  "monthly_basic",
  "monthly_priority",
] as const;

export const SUBSCRIPTION_PLAN_DETAILS = {
  weekly_basic: {
    billingCycle: "weekly",
    tier: "alerts",
    priceEur: 5,
    intervalDays: 7,
    realtimeStock: false,
    emailAlerts: true,
  },
  weekly_priority: {
    billingCycle: "weekly",
    tier: "stock",
    priceEur: 15,
    intervalDays: 7,
    realtimeStock: true,
    emailAlerts: true,
  },
  monthly_basic: {
    billingCycle: "monthly",
    tier: "alerts",
    priceEur: 10,
    intervalDays: 30,
    realtimeStock: false,
    emailAlerts: true,
  },
  monthly_priority: {
    billingCycle: "monthly",
    tier: "stock",
    priceEur: 30,
    intervalDays: 30,
    realtimeStock: true,
    emailAlerts: true,
  },
} as const;

export const SUPPORTED_LANGUAGE_PREFERENCES = ["zh", "nl", "en"] as const satisfies readonly Lang[];
export const SUPPORTED_DELIVERY_COUNTRIES = ["fr", "nl"] as const;
export const SUPPORTED_PAYMENT_METHODS = ["card", "ideal"] as const;
export const SUBSCRIPTION_STATUSES = ["none", "active", "canceled"] as const;

export type PaidSubscriptionPlan = (typeof PAID_SUBSCRIPTION_PLANS)[number];
export type SubscriptionPlan = "none" | PaidSubscriptionPlan;
export type DeliveryCountry = (typeof SUPPORTED_DELIVERY_COUNTRIES)[number];
export type PaymentMethod = (typeof SUPPORTED_PAYMENT_METHODS)[number];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export type BillingCycle = (typeof SUBSCRIPTION_PLAN_DETAILS)[PaidSubscriptionPlan]["billingCycle"];
export type SubscriptionTier = (typeof SUBSCRIPTION_PLAN_DETAILS)[PaidSubscriptionPlan]["tier"];

export type UserProfile = {
  email: string;
  nickname: string | null;
  subscriptionPlan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionCurrentPeriodEnd: string | null;
  subscriptionCancelAtPeriodEnd: boolean;
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

export function subscriptionIsActive(user: Pick<UserProfile, "subscriptionPlan" | "subscriptionStatus" | "subscriptionCurrentPeriodEnd">, now = Date.now()): boolean {
  if (!isPaidSubscriptionPlan(user.subscriptionPlan)) return false;
  if (user.subscriptionStatus !== "active" && user.subscriptionStatus !== "canceled") return false;
  if (!user.subscriptionCurrentPeriodEnd) return false;
  const periodEnd = Date.parse(user.subscriptionCurrentPeriodEnd);
  return Number.isFinite(periodEnd) && periodEnd > now;
}

export function planIncludesRealtimeStock(plan: SubscriptionPlan): boolean {
  return isPaidSubscriptionPlan(plan) && SUBSCRIPTION_PLAN_DETAILS[plan].realtimeStock;
}

export function hasRealtimeStockAccess(user: Pick<UserProfile, "subscriptionPlan" | "subscriptionStatus" | "subscriptionCurrentPeriodEnd">, now = Date.now()): boolean {
  return subscriptionIsActive(user, now) && planIncludesRealtimeStock(user.subscriptionPlan);
}

export function hasEmailAlertAccess(user: Pick<UserProfile, "subscriptionPlan" | "subscriptionStatus" | "subscriptionCurrentPeriodEnd">, now = Date.now()): boolean {
  return subscriptionIsActive(user, now) && isPaidSubscriptionPlan(user.subscriptionPlan) && SUBSCRIPTION_PLAN_DETAILS[user.subscriptionPlan].emailAlerts;
}

export function isLanguagePreference(value: unknown): value is Lang {
  return SUPPORTED_LANGUAGE_PREFERENCES.includes(value as Lang);
}

export function isDeliveryCountry(value: unknown): value is DeliveryCountry {
  return SUPPORTED_DELIVERY_COUNTRIES.includes(value as DeliveryCountry);
}
