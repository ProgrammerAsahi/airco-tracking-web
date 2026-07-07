export const PAID_SUBSCRIPTION_PLANS = [
  "weekly_basic",
  "weekly_priority",
  "monthly_basic",
  "monthly_priority",
] as const;

export type PaidSubscriptionPlan = (typeof PAID_SUBSCRIPTION_PLANS)[number];
export type SubscriptionPlan = "none" | PaidSubscriptionPlan;

export type UserProfile = {
  email: string;
  nickname: string | null;
  subscriptionPlan: SubscriptionPlan;
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
