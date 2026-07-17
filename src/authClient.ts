import { userInitials, type DeliveryCountry, type PaidSubscriptionPlan, type UserProfile } from "../shared/auth";
import type { Lang } from "./i18n";

export type { DeliveryCountry, PaidSubscriptionPlan, UserProfile } from "../shared/auth";
export { userInitials };

export class AuthApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

type AuthErrorBody = {
  error?: string;
  retry_after_seconds?: number;
};

type MeResponse = {
  user: UserProfile | null;
  needsOnboarding?: boolean;
};

type RequestCodeResponse = {
  ok: true;
  retryAfterSeconds: number;
  devCode?: string;
};

type AuthSessionResponse = {
  user: UserProfile;
  isNewUser?: boolean;
  needsOnboarding?: boolean;
};

type CheckoutSessionResponse = {
  url: string;
};

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) {
    const errorBody = body as AuthErrorBody;
    throw new AuthApiError(
      response.status,
      errorBody.error || "auth_request_failed",
      errorBody.retry_after_seconds,
    );
  }
  return body as T;
}

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return parseJsonResponse<T>(response);
}

export async function getCurrentUser(): Promise<UserProfile | null> {
  const response = await fetch("/api/auth/me", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  const data = await parseJsonResponse<MeResponse>(response);
  return data.user;
}

export async function requestAuthCode(email: string, lang: Lang): Promise<RequestCodeResponse> {
  return postJson<RequestCodeResponse>("/api/auth/request-code", { email, lang });
}

export async function verifyAuthCode(email: string, code: string, lang: Lang): Promise<AuthSessionResponse> {
  return postJson<AuthSessionResponse>("/api/auth/verify-code", { email, code, lang });
}

export async function updateNickname(nickname: string): Promise<UserProfile> {
  const response = await postJson<AuthSessionResponse>("/api/auth/profile", { nickname });
  return response.user;
}

export async function requestEmailChangeCode(email: string, lang: Lang): Promise<RequestCodeResponse> {
  return postJson<RequestCodeResponse>("/api/auth/email-change/request", { email, lang });
}

export async function verifyEmailChange(email: string, code: string): Promise<UserProfile> {
  const response = await postJson<AuthSessionResponse>("/api/auth/email-change/verify", { email, code });
  return response.user;
}

export async function updatePreferences(values: { languagePreference?: Lang; deliveryCountry?: DeliveryCountry }): Promise<UserProfile> {
  const response = await postJson<AuthSessionResponse>("/api/auth/preferences", values);
  return response.user;
}

export async function updateEmailAlerts(enabled: boolean): Promise<UserProfile> {
  const response = await postJson<AuthSessionResponse>("/api/auth/email-alerts", { enabled });
  return response.user;
}

export async function unsubscribeEmailAlerts(token: string): Promise<void> {
  const response = await fetch(`/api/alerts/unsubscribe?token=${encodeURIComponent(token)}`, {
    method: "POST",
    credentials: "omit",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "List-Unsubscribe=One-Click",
  });
  await parseJsonResponse<{ ok: true }>(response);
}

export async function createCheckoutSession(plan: PaidSubscriptionPlan, lang: Lang): Promise<CheckoutSessionResponse> {
  return postJson<CheckoutSessionResponse>("/api/billing/create-checkout-session", { plan, lang });
}

export async function syncCheckoutStatus(sessionId?: string | null): Promise<UserProfile> {
  const response = await postJson<AuthSessionResponse>("/api/billing/sync-checkout-status", { sessionId: sessionId || "" });
  return response.user;
}

export async function deleteAccount(): Promise<void> {
  await postJson<{ ok: true }>("/api/auth/account/delete", {});
}

export async function logout(): Promise<void> {
  await postJson<{ ok: true }>("/api/auth/logout", {});
}
