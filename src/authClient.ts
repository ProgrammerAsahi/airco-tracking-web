import { userInitials, type DeliveryCountry, type UserProfile } from "../shared/auth";
import type { Lang } from "./i18n";

export type { DeliveryCountry, UserProfile } from "../shared/auth";
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

export async function updatePreferences(values: { languagePreference?: Lang; deliveryCountry?: DeliveryCountry }): Promise<UserProfile> {
  const response = await postJson<AuthSessionResponse>("/api/auth/preferences", values);
  return response.user;
}

export async function logout(): Promise<void> {
  await postJson<{ ok: true }>("/api/auth/logout", {});
}
