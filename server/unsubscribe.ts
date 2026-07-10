import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_VERSION = "v1";
const TOKEN_PURPOSE = "alerts-unsubscribe";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type AlertUnsubscribeClaims = {
  userId: string;
  tokenVersion: number;
};

export function createAlertUnsubscribeToken(
  signingKey: string,
  userId: string,
  tokenVersion: number,
): string {
  const normalizedKey = validateSigningKey(signingKey);
  const normalizedUserId = userId.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalizedUserId)) throw new Error("Invalid unsubscribe user ID");
  if (!Number.isSafeInteger(tokenVersion) || tokenVersion < 1) {
    throw new Error("Invalid unsubscribe token version");
  }
  const payload = `${TOKEN_VERSION}\n${TOKEN_PURPOSE}\n${normalizedUserId}\n${tokenVersion}`;
  const encodedPayload = Buffer.from(payload, "utf8").toString("base64url");
  return `${encodedPayload}.${signature(normalizedKey, payload).toString("base64url")}`;
}

export function verifyAlertUnsubscribeToken(
  signingKey: string,
  token: unknown,
): AlertUnsubscribeClaims | null {
  const normalizedKey = validateSigningKey(signingKey);
  if (typeof token !== "string" || token.length < 40 || token.length > 512) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) return null;

  let payload: string;
  let receivedSignature: Buffer;
  try {
    const payloadBytes = Buffer.from(parts[0], "base64url");
    receivedSignature = Buffer.from(parts[1], "base64url");
    if (
      payloadBytes.toString("base64url") !== parts[0]
      || receivedSignature.toString("base64url") !== parts[1]
    ) return null;
    payload = payloadBytes.toString("utf8");
  } catch {
    return null;
  }
  const expectedSignature = signature(normalizedKey, payload);
  if (receivedSignature.length !== expectedSignature.length) return null;
  if (!timingSafeEqual(receivedSignature, expectedSignature)) return null;

  const [version, purpose, userId, rawTokenVersion, ...rest] = payload.split("\n");
  if (rest.length || version !== TOKEN_VERSION || purpose !== TOKEN_PURPOSE) return null;
  if (!userId || !UUID_PATTERN.test(userId) || userId !== userId.toLowerCase()) return null;
  if (!rawTokenVersion || !/^[1-9]\d{0,14}$/.test(rawTokenVersion)) return null;
  const tokenVersion = Number(rawTokenVersion);
  if (!Number.isSafeInteger(tokenVersion)) return null;
  return { userId, tokenVersion };
}

function signature(signingKey: string, payload: string): Buffer {
  return createHmac("sha256", signingKey).update(payload, "utf8").digest();
}

function validateSigningKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 32) throw new Error("Email unsubscribe signing key must be at least 32 characters");
  return normalized;
}
