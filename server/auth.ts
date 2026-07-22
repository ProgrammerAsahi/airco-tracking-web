import { createHash, createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  TableClient,
  type TableEntityResult,
  type TransactionAction,
} from "@azure/data-tables";
import { EmailClient, type EmailMessage } from "@azure/communication-email";
import { DefaultAzureCredential } from "@azure/identity";
import {
  isDeliveryCountry,
  entitlementIsActive,
  isEntitlementStatus,
  isEntitlementTier,
  isLanguagePreference,
  isPaymentMethod,
  isValidEmail,
  hasEmailAlertAccess,
  normalizeEmail,
  validateNickname,
  type DeliveryCountry,
  type EntitlementStatus,
  type EntitlementTier,
  type PaymentMethod,
  type UserProfile,
} from "../shared/auth.js";
import type { Lang } from "../shared/i18n.js";
import { verifyAlertUnsubscribeToken } from "./unsubscribe.js";

type AuthCodeRecord = {
  email: string;
  codeHash: string;
  hashVersion: string;
  salt: string;
  expiresAt: string;
  attempts: number;
  lastSentAt: string;
  createdAt: string;
};

type StoredAuthCodeRecord = AuthCodeRecord & {
  etag: string;
};

type CodeSendBudgetScope = "email" | "ip" | "global";

type CodeSendBudgetEntity = {
  partitionKey: "auth-budget";
  rowKey: string;
  scope: CodeSendBudgetScope;
  count: number;
  windowStartedAt: string;
  expiresAt: string;
};

type SessionRecord = {
  sessionHash: string;
  userId: string | null;
  email: string;
  expiresAt: string;
  createdAt: string;
  lastSeenAt: string;
};

type AuthStore = {
  getUser(email: string): Promise<StoredUserProfile | null>;
  getUserById(userId: string): Promise<StoredUserProfile | null>;
  getUserByStripeCustomerId(stripeCustomerId: string): Promise<StoredUserProfile | null>;
  upsertUser(user: StoredUserProfile): Promise<StoredUserProfile>;
  mutateUser(userId: string, mutation: (current: StoredUserProfile) => StoredUserProfile): Promise<StoredUserProfile>;
  changeUserEmail(user: StoredUserProfile, newEmail: string): Promise<StoredUserProfile>;
  retainLegalRecords(user: StoredUserProfile, retentionUntil: string): Promise<void>;
  deleteUser(email: string, options?: { userId?: string; deleteProjection?: boolean }): Promise<void>;
  getCode(email: string): Promise<StoredAuthCodeRecord | null>;
  putCode(record: AuthCodeRecord, expectedEtag: string | null): Promise<StoredAuthCodeRecord>;
  deleteCode(email: string, expectedEtag?: string): Promise<void>;
  consumeCodeSendBudget(scope: CodeSendBudgetScope, identifier: string, now: number, windowSeconds: number, maximum: number): Promise<void>;
  getSession(sessionHash: string): Promise<SessionRecord | null>;
  upsertSession(record: SessionRecord): Promise<void>;
  deleteSession(sessionHash: string): Promise<void>;
  deleteSessionsForUser(userId: string, email: string): Promise<void>;
  updateSessionsEmail(oldEmail: string, newEmail: string): Promise<void>;
};

type SendCodeResult = {
  devCode?: string;
};

type AuthServiceOptions = {
  storageAccountUrl?: string;
  managedIdentityClientId?: string;
  usersTableName?: string;
  codesTableName?: string;
  sessionsTableName?: string;
  alertRecipientsTableName?: string;
  emailEndpoint?: string;
  emailFrom?: string;
  emailReplyTo?: string;
  unsubscribeSigningKey?: string;
  exposeDevCode?: boolean;
  codeTtlSeconds?: number;
  codeResendSeconds?: number;
  codeMaxAttempts?: number;
  verificationCodePepper?: string;
  verificationCodePepperVersion?: string;
  emailCodeBudgetPerHour?: number;
  ipCodeBudgetPerHour?: number;
  globalCodeBudgetPerHour?: number;
  sessionTtlSeconds?: number;
  legalRecordRetentionYears?: 7 | 10;
  cookieName?: string;
};

export class AuthHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

export type VerifyCodeResult = {
  user: StoredUserProfile;
  isNewUser: boolean;
  sessionToken: string;
  sessionTtlSeconds: number;
};

export type StoredUserProfile = UserProfile & {
  userId: string;
  profileRevision: number;
  emailAlertsTokenVersion: number;
  stripeCustomerId: string | null;
  passReceipts: PassReceipt[];
};

export type RequestCodeResult = {
  ok: true;
  retryAfterSeconds: number;
  devCode?: string;
};

export type PassReceiptKind = "legacy" | "purchase" | "upgrade";
export type PassReceiptStatus = "active" | "refunded" | "revoked";

export type PassReceipt = {
  id: string;
  checkoutSessionId: string | null;
  kind: PassReceiptKind;
  tier: Exclude<EntitlementTier, "none">;
  baseReceiptId: string | null;
  purchasedAt: string;
  expiresAt: string;
  amountEurCents: number | null;
  checkoutLocale: Lang | null;
  termsVersion: string | null;
  privacyVersion: string | null;
  acceptedAt: string | null;
  immediatePerformanceRequested: boolean | null;
  purchaseConfirmationSentAt: string | null;
  withdrawalConfirmationSentAt: string | null;
  withdrawalRequestedAt: string | null;
  withdrawalReference: string | null;
  withdrawalConsumerName: string | null;
  withdrawalElectronicConfirmationAcceptedAt: string | null;
  stripeRefundId: string | null;
  stripeRefundStatus: string | null;
  status: PassReceiptStatus;
  paymentBrand: string | null;
  paymentLast4: string | null;
};

export type StripePassPurchase = {
  userId: string;
  stripeCustomerId: string;
  stripePaymentIntentId: string;
  checkoutSessionId: string;
  kind: Exclude<PassReceiptKind, "legacy">;
  baseReceiptId: string | null;
  tier: Exclude<EntitlementTier, "none">;
  expiresAt: string;
  purchasedAt: string;
  amountEurCents: number;
  checkoutLocale: Lang;
  termsVersion: string;
  privacyVersion: string;
  acceptedAt: string;
  immediatePerformanceRequested: true;
  paymentBrand: string | null;
  paymentLast4: string | null;
};

export type WithdrawalAudit = {
  requestedAt: string;
  reference: string;
  stripeRefundId: string;
  stripeRefundStatus: string;
  receiptStatus: PassReceiptStatus;
};

export type WithdrawalInitiation = {
  requestedAt: string;
  reference: string;
  consumerName: string;
  electronicConfirmationAcceptedAt: string;
};

export type PassConfirmationDetails = {
  orderReference: string;
  tier: Exclude<EntitlementTier, "none">;
  amountEurCents: number;
  purchasedAt: string;
  expiresAt: string;
  termsVersion: string;
  privacyVersion: string;
  immediatePerformanceRequested: boolean;
  withdrawalDeadline: string;
  withdrawalUrl: string;
  termsUrl: string;
  privacyUrl: string;
  operatorName: string;
  operatorAddress: string;
  contactEmail: string;
  withdrawalEmail: string;
  vatStatus: "registered" | "not_registered";
  vatId: string | null;
};

export type WithdrawalRefundedItem = {
  orderReference: string;
  kind: Exclude<PassReceiptKind, "legacy">;
  amountEurCents: number;
};

export type WithdrawalConfirmationDetails = {
  orderReference: string;
  refundReference: string;
  requestedAt: string;
  consumerName: string;
  confirmationEmail: string;
  amountEurCents: number;
  refundedItems: WithdrawalRefundedItem[];
  status: string;
  operatorName: string;
  contactEmail: string;
};

const USER_PARTITION = "user";
const CODE_PARTITION = "auth-code";
const SESSION_PARTITION = "auth-session";
const DEFAULT_CODE_TTL_SECONDS = 10 * 60;
const DEFAULT_RESEND_SECONDS = 60;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_EMAIL_CODE_BUDGET_PER_HOUR = 5;
const DEFAULT_IP_CODE_BUDGET_PER_HOUR = 20;
const DEFAULT_GLOBAL_CODE_BUDGET_PER_HOUR = 1_000;
const GLOBAL_CODE_BUDGET_WINDOW_SECONDS = 60 * 60;
const MINIMUM_VERIFICATION_CODE_PEPPER_LENGTH = 32;
const VERIFICATION_CODE_HASH_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;
const DEFAULT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_COOKIE_NAME = "airco_session";
const MINIMUM_REPURCHASE_REMAINING_MILLISECONDS = 60 * 60 * 1000;
const ALERT_RECIPIENT_SHARD_COUNT = 32;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_ROW_PREFIX = "id:";
const EMAIL_INDEX_PREFIX = "email:";
const STRIPE_INDEX_PREFIX = "stripe:";
const LEGAL_RETENTION_ROW_PREFIX = "legal-retention:";
const DEFAULT_LEGAL_RECORD_RETENTION_YEARS = 7 as const;

export const AUTH_ENTITLEMENT_TIER_DEFAULT: EntitlementTier = "none";
export const AUTH_ENTITLEMENT_STATUS_DEFAULT: EntitlementStatus = "none";
export const AUTH_LANGUAGE_DEFAULT: Lang = "zh";
export const AUTH_DELIVERY_COUNTRY_DEFAULT: DeliveryCountry = "fr";

function nowIso(now = Date.now()): string {
  return new Date(now).toISOString();
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value?.trim() || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function createUserId(): string {
  return randomUUID();
}

export function legacyUserId(email: string): string {
  const bytes = Buffer.from(sha256(`airco-tracker-user\n${normalizeEmail(email)}`).slice(0, 32), "hex");
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeUserId(value: unknown, email: string): string {
  return typeof value === "string" && UUID_PATTERN.test(value.trim())
    ? value.trim().toLowerCase()
    : legacyUserId(email);
}

function normalizeProfileRevision(value: unknown, fallback = 1): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : fallback;
}

function canonicalUserRowKey(userId: string): string {
  const normalized = userId.trim().toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new Error("Invalid canonical user ID");
  return `${USER_ROW_PREFIX}${normalized}`;
}

function emailIndexRowKey(email: string): string {
  return `${EMAIL_INDEX_PREFIX}${base64Url(normalizeEmail(email))}`;
}

function stripeIndexRowKey(stripeCustomerId: string): string {
  return `${STRIPE_INDEX_PREFIX}${base64Url(stripeCustomerId.trim())}`;
}

function legalRetentionRowKey(userId: string): string {
  return `${LEGAL_RETENTION_ROW_PREFIX}${sha256(`airco-legal-retention\n${userId.trim().toLowerCase()}`)}`;
}

function legacyEmailRowKey(email: string): string {
  return base64Url(normalizeEmail(email));
}

export function alertRecipientPartitionKey(userId: string): string {
  const digest = createHash("sha256").update(userId).digest();
  const shard = digest[digest.length - 1]! % ALERT_RECIPIENT_SHARD_COUNT;
  return `r-${shard.toString(16).padStart(2, "0")}`;
}

function randomSalt(): string {
  return randomBytes(16).toString("base64url");
}

function randomSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function createVerificationHash(
  email: string,
  code: string,
  salt: string,
  pepper: string,
  version: string,
): string {
  return createHmac("sha256", pepper)
    .update(`airco-auth-code\n${version}\n${normalizeEmail(email)}\n${code}\n${salt}`, "utf8")
    .digest("hex");
}

export function verifyVerificationHash(
  email: string,
  code: string,
  salt: string,
  expectedHash: string,
  pepper: string,
  version: string,
): boolean {
  const actual = Buffer.from(createVerificationHash(email, code, salt, pepper, version), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function verificationBudgetIdentifier(
  pepper: string,
  version: string,
  scope: Exclude<CodeSendBudgetScope, "global">,
  value: string,
): string {
  return createHmac("sha256", pepper)
    .update(`airco-auth-budget\n${version}\n${scope}\n${value}`, "utf8")
    .digest("hex");
}

function sessionHash(token: string): string {
  return sha256(token);
}

function isExpired(value: string, now = Date.now()): boolean {
  const time = Date.parse(value);
  return !Number.isFinite(time) || time <= now;
}

function sanitizeCode(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, "") : "";
}

function serializeCookieValue(value: string): string {
  return encodeURIComponent(value);
}

function shouldUseSecureCookie(request: IncomingMessage): boolean {
  const configured = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (configured === "true") return true;
  if (configured === "false") return false;

  const forwardedProto = request.headers["x-forwarded-proto"];
  if (typeof forwardedProto === "string" && forwardedProto.split(",")[0]?.trim() === "https") return true;
  const host = request.headers.host ?? "";
  return Boolean(host && !host.startsWith("localhost") && !host.startsWith("127.0.0.1") && !host.startsWith("[::1]"));
}

export function parseCookies(request: IncomingMessage): Record<string, string> {
  const header = request.headers.cookie;
  if (!header) return {};
  const result: Record<string, string> = {};
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name) continue;
    try {
      result[name] = decodeURIComponent(value);
    } catch {
      result[name] = value;
    }
  }
  return result;
}

export function setSessionCookie(response: ServerResponse, request: IncomingMessage, token: string, maxAgeSeconds: number, cookieName = DEFAULT_COOKIE_NAME): void {
  const secure = shouldUseSecureCookie(request) ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${cookieName}=${serializeCookieValue(token)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax${secure}`,
  );
}

export function clearSessionCookie(response: ServerResponse, request: IncomingMessage, cookieName = DEFAULT_COOKIE_NAME): void {
  const secure = shouldUseSecureCookie(request) ? "; Secure" : "";
  response.setHeader(
    "Set-Cookie",
    `${cookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`,
  );
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "statusCode" in error
    && (error as { statusCode?: unknown }).statusCode === 404;
}

function isPreconditionError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "statusCode" in error
    && (error as { statusCode?: unknown }).statusCode === 412;
}

function isConflictError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "statusCode" in error
    && (error as { statusCode?: unknown }).statusCode === 409;
}

function tableUrlFromStorageAccountUrl(value: string): string {
  return value.includes(".table.") ? value : value.replace(".blob.", ".table.");
}

export type AlertRecipientEntity = {
  partitionKey: string;
  rowKey: string;
  email: string;
  language: Lang;
  deliveryCountry: DeliveryCountry;
  entitlementTier: EntitlementTier;
  entitlementStatus: EntitlementStatus;
  entitlementExpiresAt: string;
  /** Legacy projection columns, accepted only for an in-place schema migration. */
  subscriptionPlan?: string;
  status?: string;
  currentPeriodEnd?: string;
  enabled: boolean;
  unsubscribeTokenVersion: number;
  updatedAt: string;
  sourceRevision: number;
};

export function alertRecipientEntity(user: StoredUserProfile, now = Date.now()): AlertRecipientEntity {
  return {
    partitionKey: alertRecipientPartitionKey(user.userId),
    rowKey: user.userId,
    email: normalizeEmail(user.email),
    language: user.languagePreference,
    deliveryCountry: user.deliveryCountry,
    entitlementTier: user.entitlementTier,
    entitlementStatus: user.entitlementStatus,
    entitlementExpiresAt: user.entitlementExpiresAt ?? "",
    enabled: hasEmailAlertAccess(user, now),
    unsubscribeTokenVersion: user.emailAlertsTokenVersion,
    updatedAt: user.updatedAt,
    sourceRevision: user.profileRevision,
  };
}

export type AlertRecipientTableAdapter = {
  /** Test/local hook only. Production tables are provisioned by IaC. */
  createTable?(): Promise<unknown>;
  getEntity(partitionKey: string, rowKey: string): Promise<AlertRecipientEntity & { etag?: string }>;
  createEntity(entity: AlertRecipientEntity): Promise<unknown>;
  updateEntity(entity: AlertRecipientEntity, etag: string): Promise<unknown>;
  deleteEntity(partitionKey: string, rowKey: string, etag?: string): Promise<unknown>;
};

export class AlertRecipientProjectionStore {
  private ensurePromise: Promise<void> | undefined;

  constructor(private readonly table: AlertRecipientTableAdapter) {}

  ensureTable(): Promise<void> {
    if (!this.ensurePromise) {
      this.ensurePromise = this.table.createTable
        ? this.table.createTable().then(() => undefined)
        : Promise.resolve();
    }
    return this.ensurePromise;
  }

  async upsert(user: StoredUserProfile): Promise<void> {
    await this.ensureTable();
    await this.apply(alertRecipientEntity(user));
  }

  async suppress(userId: string, sourceRevision: number): Promise<void> {
    await this.ensureTable();
    await this.apply({
      partitionKey: alertRecipientPartitionKey(userId),
      rowKey: userId,
      email: "",
      language: AUTH_LANGUAGE_DEFAULT,
      deliveryCountry: AUTH_DELIVERY_COUNTRY_DEFAULT,
      entitlementTier: "none",
      entitlementStatus: "none",
      entitlementExpiresAt: "",
      enabled: false,
      unsubscribeTokenVersion: 1,
      updatedAt: nowIso(),
      sourceRevision,
    });
  }

  private async apply(desired: AlertRecipientEntity): Promise<void> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let current: (AlertRecipientEntity & { etag?: string }) | null = null;
      try {
        current = await this.table.getEntity(desired.partitionKey, desired.rowKey);
      } catch (error) {
        if (!isNotFoundError(error)) throw error;
      }

      if (!current) {
        try {
          await this.table.createEntity(desired);
          return;
        } catch (error) {
          if (isConflictError(error)) continue;
          throw error;
        }
      }

      const currentRevision = normalizeProfileRevision(current.sourceRevision, 0);
      if (currentRevision > desired.sourceRevision) return;
      if (currentRevision === desired.sourceRevision) {
        if (sameAlertRecipientPayload(current, desired)) return;
        if (legacyAlertRecipientPayloadMatches(current, desired)) {
          if (!current.etag) throw new Error("Alert recipient projection is missing its ETag");
          try {
            await this.table.updateEntity(desired, current.etag);
            return;
          } catch (error) {
            if (isPreconditionError(error)) continue;
            throw error;
          }
        }
        throw new Error("Alert recipient projection has conflicting payloads at one revision");
      }
      if (!current.etag) throw new Error("Alert recipient projection is missing its ETag");
      try {
        await this.table.updateEntity(desired, current.etag);
        return;
      } catch (error) {
        if (isPreconditionError(error)) continue;
        throw error;
      }
    }
    throw new Error("Alert recipient projection changed repeatedly");
  }

  async delete(userId: string): Promise<void> {
    await this.ensureTable();
    try {
      const partitionKey = alertRecipientPartitionKey(userId);
      const current = await this.table.getEntity(partitionKey, userId);
      await this.table.deleteEntity(partitionKey, userId, current.etag);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }
}

function legacyAlertRecipientPayloadMatches(
  current: AlertRecipientEntity,
  desired: AlertRecipientEntity,
): boolean {
  if (typeof current.subscriptionPlan !== "string" || typeof current.currentPeriodEnd !== "string") {
    return false;
  }
  const legacyTier = legacyEntitlementTier(current.subscriptionPlan);
  const legacyStatus = current.status === "active" || current.status === "canceled" ? "active" : "none";
  return current.partitionKey === desired.partitionKey
    && current.rowKey === desired.rowKey
    && current.email === desired.email
    && current.language === desired.language
    && current.deliveryCountry === desired.deliveryCountry
    && legacyTier === desired.entitlementTier
    && legacyStatus === desired.entitlementStatus
    && current.currentPeriodEnd === desired.entitlementExpiresAt
    && Boolean(current.enabled) === Boolean(desired.enabled)
    && normalizeProfileRevision(current.unsubscribeTokenVersion) === desired.unsubscribeTokenVersion
    && current.updatedAt === desired.updatedAt
    && normalizeProfileRevision(current.sourceRevision, 0) === desired.sourceRevision;
}

function sameAlertRecipientPayload(
  left: AlertRecipientEntity,
  right: AlertRecipientEntity,
): boolean {
  return left.partitionKey === right.partitionKey
    && left.rowKey === right.rowKey
    && left.email === right.email
    && left.language === right.language
    && left.deliveryCountry === right.deliveryCountry
    && left.entitlementTier === right.entitlementTier
    && left.entitlementStatus === right.entitlementStatus
    && left.entitlementExpiresAt === right.entitlementExpiresAt
    && Boolean(left.enabled) === Boolean(right.enabled)
    // A legacy projection has no token version; version 1 is its compatible
    // default until the next canonical profile mutation rewrites the row.
    && normalizeProfileRevision(left.unsubscribeTokenVersion) === right.unsubscribeTokenVersion
    && left.updatedAt === right.updatedAt
    && normalizeProfileRevision(left.sourceRevision, 0) === right.sourceRevision;
}

export class TableAuthStore implements AuthStore {
  private readonly users: TableClient;
  private readonly codes: TableClient;
  private readonly sessions: TableClient;
  private readonly recipients: AlertRecipientProjectionStore;

  constructor(accountUrl: string, managedIdentityClientId: string | undefined, tableNames: { users: string; codes: string; sessions: string; recipients: string }) {
    const credential = new DefaultAzureCredential({ managedIdentityClientId });
    const tableUrl = tableUrlFromStorageAccountUrl(accountUrl);
    this.users = new TableClient(tableUrl, tableNames.users, credential);
    this.codes = new TableClient(tableUrl, tableNames.codes, credential);
    this.sessions = new TableClient(tableUrl, tableNames.sessions, credential);
    const recipients = new TableClient(tableUrl, tableNames.recipients, credential);
    this.recipients = new AlertRecipientProjectionStore({
      getEntity: (partitionKey, rowKey) => recipients.getEntity<AlertRecipientEntity>(partitionKey, rowKey),
      createEntity: (entity) => recipients.createEntity(entity),
      updateEntity: (entity, etag) => recipients.updateEntity(entity, "Replace", { etag }),
      deleteEntity: (partitionKey, rowKey, etag) => recipients.deleteEntity(partitionKey, rowKey, { etag }),
    });
  }

  private async canonicalEntity(userId: string): Promise<TableEntityResult<UserEntity> | null> {
    try {
      const entity = await this.users.getEntity<UserEntity>(USER_PARTITION, canonicalUserRowKey(userId));
      if (entity.recordType !== "profile" || entity.recordState !== "active") return null;
      return entity;
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  private async indexEntity(rowKey: string): Promise<TableEntityResult<UserIndexEntity> | null> {
    try {
      return await this.users.getEntity<UserIndexEntity>(USER_PARTITION, rowKey);
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  private async cleanupRow(rowKey: string, etag?: string): Promise<void> {
    try {
      await this.users.deleteEntity(USER_PARTITION, rowKey, etag ? { etag } : undefined);
    } catch (error) {
      if (!isNotFoundError(error) && !isPreconditionError(error)) throw error;
    }
  }

  private async cleanupInactiveIndex(rowKey: string): Promise<void> {
    const current = await this.indexEntity(rowKey);
    if (current && current.recordState !== "active") {
      await this.cleanupRow(rowKey, current.etag);
    }
  }

  private async cleanupLegacyTombstone(rowKey: string): Promise<void> {
    try {
      const current = await this.users.getEntity<UserEntity>(USER_PARTITION, rowKey);
      if (current.recordState === "superseded" || current.recordState === "deleted") {
        await this.cleanupRow(rowKey, current.etag);
      }
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  private async cleanupDeletedCanonical(userId: string): Promise<void> {
    try {
      const rowKey = canonicalUserRowKey(userId);
      const current = await this.users.getEntity<UserEntity>(USER_PARTITION, rowKey);
      if (current.recordType === "profile" && current.recordState === "deleted") {
        await this.cleanupRow(rowKey, current.etag);
      }
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  private async userFromActiveIndex(
    index: TableEntityResult<UserIndexEntity>,
    cleanupInactive = true,
  ): Promise<StoredUserProfile | null> {
    if (index.recordState !== "active") {
      if (cleanupInactive) await this.cleanupRow(String(index.rowKey), index.etag);
      return null;
    }
    if (!UUID_PATTERN.test(index.userId)) throw new AuthHttpError(409, "profile_conflict");
    const userId = index.userId.toLowerCase();
    const canonical = await this.canonicalEntity(userId);
    if (!canonical) throw new AuthHttpError(409, "profile_conflict");
    const user = userFromEntity(canonical);
    if (user.userId !== userId) throw new AuthHttpError(409, "profile_conflict");
    return user;
  }

  private async migrateLegacyEntity(entity: TableEntityResult<UserEntity>): Promise<StoredUserProfile> {
    if (entity.recordType || entity.recordState === "superseded" || entity.recordState === "deleted") {
      throw new AuthHttpError(409, "profile_conflict");
    }
    const user = userFromEntity(entity);
    const actions: TransactionAction[] = [
      ["create", userToEntity(user)],
      ["create", emailIndexEntity(user)],
      ...(user.stripeCustomerId ? [["create", stripeIndexEntity(user)] as TransactionAction] : []),
      ["update", legacyTombstoneEntity(entity, user), "Replace", { etag: entity.etag }],
    ];
    try {
      await this.users.submitTransaction(actions);
    } catch (error) {
      if (!isConflictError(error) && !isPreconditionError(error)) throw error;
      const canonical = await this.canonicalEntity(user.userId);
      const emailIndex = await this.indexEntity(emailIndexRowKey(user.email));
      if (!canonical || !emailIndex || emailIndex.recordState !== "active" || emailIndex.userId !== user.userId) {
        throw new AuthHttpError(409, "profile_conflict");
      }
      const migrated = userFromEntity(canonical);
      await this.recipients.upsert(migrated);
      return migrated;
    }
    await this.cleanupLegacyTombstone(String(entity.rowKey));
    await this.recipients.upsert(user);
    return user;
  }

  private async activeEntityByUserId(userId: string): Promise<TableEntityResult<UserEntity> | null> {
    const canonical = await this.canonicalEntity(userId);
    if (canonical) return canonical;

    // One-time compatibility path for rows created before UUID canonical keys.
    const safeUserId = userId.replaceAll("'", "''");
    const entities = this.users.listEntities<UserEntity>({
      queryOptions: { filter: `PartitionKey eq '${USER_PARTITION}' and userId eq '${safeUserId}'` },
    });
    for await (const entity of entities) {
      if (entity.recordType || entity.recordState === "superseded" || entity.recordState === "deleted") continue;
      await this.migrateLegacyEntity(entity);
      return this.canonicalEntity(userId);
    }
    return null;
  }

  async getUser(email: string): Promise<StoredUserProfile | null> {
    const normalizedEmail = normalizeEmail(email);
    const index = await this.indexEntity(emailIndexRowKey(normalizedEmail));
    if (index) {
      if (index.recordType !== "email-index") throw new AuthHttpError(409, "profile_conflict");
      const user = await this.userFromActiveIndex(index);
      if (user && user.email !== normalizedEmail) throw new AuthHttpError(409, "profile_conflict");
      return user;
    }

    try {
      const legacy = await this.users.getEntity<UserEntity>(USER_PARTITION, legacyEmailRowKey(normalizedEmail));
      if (legacy.recordState === "superseded" || legacy.recordState === "deleted") {
        await this.cleanupRow(String(legacy.rowKey), legacy.etag);
        return null;
      }
      return this.migrateLegacyEntity(legacy);
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async getUserById(userId: string): Promise<StoredUserProfile | null> {
    const normalized = userId.trim().toLowerCase();
    if (!UUID_PATTERN.test(normalized)) return null;
    const entity = await this.activeEntityByUserId(normalized);
    return entity ? userFromEntity(entity) : null;
  }

  async getUserByStripeCustomerId(stripeCustomerId: string): Promise<StoredUserProfile | null> {
    const normalizedCustomerId = stripeCustomerId.trim();
    const index = await this.indexEntity(stripeIndexRowKey(normalizedCustomerId));
    if (index) {
      if (index.recordType !== "stripe-index") throw new AuthHttpError(409, "profile_conflict");
      const user = await this.userFromActiveIndex(index, false);
      if (user && user.stripeCustomerId !== normalizedCustomerId) throw new AuthHttpError(409, "profile_conflict");
      return user;
    }

    // One-time compatibility lookup. New and migrated users always have a point-read index.
    const safeCustomerId = stripeCustomerId.replaceAll("'", "''");
    const entities = this.users.listEntities<UserEntity>({
      queryOptions: { filter: `PartitionKey eq '${USER_PARTITION}' and stripeCustomerId eq '${safeCustomerId}'` },
    });
    for await (const entity of entities) {
      if (entity.recordType && entity.recordType !== "profile") continue;
      if (entity.recordState === "superseded" || entity.recordState === "deleted") continue;
      const user = entity.recordType === "profile" ? userFromEntity(entity) : await this.migrateLegacyEntity(entity);
      const existing = await this.indexEntity(stripeIndexRowKey(normalizedCustomerId));
      if (!existing) {
        try {
          await this.users.createEntity(stripeIndexEntity(user));
        } catch (error) {
          if (!isConflictError(error)) throw error;
          const winner = await this.indexEntity(stripeIndexRowKey(normalizedCustomerId));
          if (!winner || winner.recordState !== "active" || winner.userId !== user.userId) {
            throw new AuthHttpError(409, "profile_conflict");
          }
        }
      }
      return user;
    }
    return null;
  }

  async upsertUser(user: StoredUserProfile): Promise<StoredUserProfile> {
    const normalized: StoredUserProfile = {
      ...user,
      userId: normalizeUserId(user.userId, user.email),
      profileRevision: normalizeProfileRevision(user.profileRevision),
    };
    // A brand-new UUID cannot have a legacy row. Avoid an O(N) compatibility scan
    // on the registration hot path; email uniqueness is enforced by the batch index create.
    const currentEntity = await this.canonicalEntity(normalized.userId);
    if (currentEntity) {
      const current = userFromEntity(currentEntity);
      if (sameStoredUserData(current, normalized)) {
        await this.recipients.upsert(current);
        return current;
      }
      throw new AuthHttpError(409, "profile_conflict");
    }

    if (normalized.profileRevision !== 1) throw new AuthHttpError(409, "profile_conflict");
    const actions: TransactionAction[] = [
      ["create", userToEntity(normalized)],
      ["create", emailIndexEntity(normalized)],
      ...(normalized.stripeCustomerId ? [["create", stripeIndexEntity(normalized)] as TransactionAction] : []),
    ];
    try {
      await this.users.submitTransaction(actions);
    } catch (error) {
      if (!isConflictError(error)) throw error;
      const owner = await this.getUser(normalized.email);
      if (owner?.userId === normalized.userId) return owner;
      throw new AuthHttpError(409, "email_taken");
    }
    await this.recipients.upsert(normalized);
    return normalized;
  }

  async mutateUser(userId: string, mutation: (current: StoredUserProfile) => StoredUserProfile): Promise<StoredUserProfile> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const currentEntity = await this.activeEntityByUserId(userId);
      if (!currentEntity) throw new AuthHttpError(409, "profile_conflict");
      const current = userFromEntity(currentEntity);
      const desired = mutation({ ...current });
      if (desired.userId !== current.userId || normalizeEmail(desired.email) !== current.email) {
        throw new Error("Profile mutations cannot change identity fields");
      }
      if (sameStoredUserData(current, desired)) {
        await this.recipients.upsert(current);
        return current;
      }
      if (desired.profileRevision !== current.profileRevision + 1) {
        throw new Error("Profile mutation must increment profileRevision exactly once");
      }

      const actions: TransactionAction[] = [
        ["update", userToEntity(desired), "Replace", { etag: currentEntity.etag }],
      ];
      let oldStripeIndex: TableEntityResult<UserIndexEntity> | null = null;
      if (current.stripeCustomerId !== desired.stripeCustomerId) {
        if (desired.stripeCustomerId) actions.push(["create", stripeIndexEntity(desired)]);
        if (current.stripeCustomerId) {
          oldStripeIndex = await this.indexEntity(stripeIndexRowKey(current.stripeCustomerId));
          if (oldStripeIndex?.recordState === "active") {
            actions.push(["update", indexTombstoneEntity(oldStripeIndex, desired.profileRevision), "Replace", { etag: oldStripeIndex.etag }]);
          }
        }
      }

      try {
        await this.users.submitTransaction(actions);
      } catch (error) {
        if (isPreconditionError(error)) continue;
        if (isConflictError(error)) throw new AuthHttpError(409, "stripe_customer_taken");
        throw error;
      }
      const sideEffects = await Promise.allSettled([
        this.recipients.upsert(desired),
        ...(oldStripeIndex ? [this.cleanupInactiveIndex(String(oldStripeIndex.rowKey))] : []),
      ]);
      if (sideEffects[0]?.status === "rejected") throw sideEffects[0].reason;
      if (sideEffects.some((result, index) => index > 0 && result.status === "rejected")) {
        console.error("post_commit_stripe_index_cleanup_deferred");
      }
      return desired;
    }
    throw new AuthHttpError(409, "profile_conflict");
  }

  async changeUserEmail(user: StoredUserProfile, newEmail: string): Promise<StoredUserProfile> {
    const normalizedEmail = normalizeEmail(newEmail);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const currentEntity = await this.activeEntityByUserId(user.userId);
      if (!currentEntity) throw new AuthHttpError(409, "profile_conflict");
      const current = userFromEntity(currentEntity);
      if (current.email === normalizedEmail) return current;
      const oldIndex = await this.indexEntity(emailIndexRowKey(current.email));
      if (!oldIndex || oldIndex.recordState !== "active" || oldIndex.userId !== current.userId) {
        throw new AuthHttpError(409, "profile_conflict");
      }
      const updated: StoredUserProfile = {
        ...current,
        email: normalizedEmail,
        emailAlertsTokenVersion: current.emailAlertsTokenVersion + 1,
        profileRevision: current.profileRevision + 1,
        updatedAt: nowIso(),
      };
      const actions: TransactionAction[] = [
        ["update", userToEntity(updated), "Replace", { etag: currentEntity.etag }],
        ["create", emailIndexEntity(updated)],
        ["update", indexTombstoneEntity(oldIndex, updated.profileRevision, normalizedEmail), "Replace", { etag: oldIndex.etag }],
      ];
      try {
        await this.users.submitTransaction(actions);
      } catch (error) {
        if (isPreconditionError(error)) continue;
        if (isConflictError(error)) throw new AuthHttpError(409, "email_taken");
        throw error;
      }

      const sideEffects = await Promise.allSettled([
        this.recipients.upsert(updated),
        this.updateSessionsEmail(current.email, normalizedEmail),
        this.cleanupInactiveIndex(String(oldIndex.rowKey)),
      ]);
      for (const result of sideEffects) {
        if (result.status === "rejected") console.error("post_commit_email_change_repair_deferred");
      }
      return updated;
    }
    throw new AuthHttpError(409, "profile_conflict");
  }

  async retainLegalRecords(user: StoredUserProfile, retentionUntil: string): Promise<void> {
    if (user.passReceipts.length === 0) return;
    const desired = legalRetentionEntity(user, retentionUntil);
    try {
      await this.users.createEntity(desired);
      return;
    } catch (error) {
      if (!isConflictError(error)) throw error;
    }
    const current = await this.users.getEntity<LegalRetentionEntity>(desired.partitionKey, desired.rowKey);
    if (
      current.recordType !== "legal-retention"
      || current.schemaVersion !== 1
      || current.stripeCustomerId !== desired.stripeCustomerId
      || current.receiptsJson !== desired.receiptsJson
    ) {
      throw new AuthHttpError(409, "legal_retention_conflict");
    }
    const currentUntil = Date.parse(current.retentionUntil);
    const desiredUntil = Date.parse(desired.retentionUntil);
    if (!Number.isFinite(currentUntil) || !Number.isFinite(desiredUntil)) {
      throw new AuthHttpError(409, "legal_retention_conflict");
    }
    if (currentUntil < desiredUntil) {
      await this.users.updateEntity({
        ...desired,
        retainedAt: current.retainedAt || desired.retainedAt,
      }, "Replace", { etag: current.etag });
    }
  }

  private async hasLegalRetention(user: StoredUserProfile): Promise<boolean> {
    if (user.passReceipts.length === 0) return true;
    const expected = legalRetentionEntity(user, nowIso());
    try {
      const current = await this.users.getEntity<LegalRetentionEntity>(expected.partitionKey, expected.rowKey);
      return current.recordType === "legal-retention"
        && current.schemaVersion === 1
        && current.stripeCustomerId === expected.stripeCustomerId
        && current.receiptsJson === expected.receiptsJson;
    } catch (error) {
      if (isNotFoundError(error)) return false;
      throw error;
    }
  }

  async deleteUser(email: string, options: { userId?: string; deleteProjection?: boolean } = {}): Promise<void> {
    const userId = options.userId || (await this.getUser(email))?.userId;
    if (!userId) return;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const activeEntity = await this.activeEntityByUserId(userId);
      if (!activeEntity) return;
      const current = userFromEntity(activeEntity);
      if (entitlementIsActive(settleEntitlement(current))) {
        throw new AuthHttpError(409, "active_entitlement");
      }
      if (!(await this.hasLegalRetention(current))) {
        throw new AuthHttpError(409, "legal_retention_required");
      }
      const emailIndex = await this.indexEntity(emailIndexRowKey(current.email));
      const stripeIndex = current.stripeCustomerId
        ? await this.indexEntity(stripeIndexRowKey(current.stripeCustomerId))
        : null;
      const deletionRevision = current.profileRevision + 1;
      const actions: TransactionAction[] = [
        ["update", deletedProfileEntity(current, activeEntity.etag, deletionRevision), "Replace", { etag: activeEntity.etag }],
      ];
      if (emailIndex?.recordState === "active") {
        actions.push(["update", indexTombstoneEntity(emailIndex, deletionRevision), "Replace", { etag: emailIndex.etag }]);
      }
      if (stripeIndex?.recordState === "active") {
        actions.push(["update", indexTombstoneEntity(stripeIndex, deletionRevision), "Replace", { etag: stripeIndex.etag }]);
      }
      try {
        await this.users.submitTransaction(actions);
      } catch (error) {
        if (isPreconditionError(error)) continue;
        throw error;
      }

      const sideEffects = await Promise.allSettled([
        ...(options.deleteProjection !== false ? [this.recipients.suppress(userId, deletionRevision)] : []),
        this.cleanupDeletedCanonical(userId),
        ...(emailIndex ? [this.cleanupInactiveIndex(String(emailIndex.rowKey))] : []),
        ...(stripeIndex ? [this.cleanupInactiveIndex(String(stripeIndex.rowKey))] : []),
      ]);
      for (const result of sideEffects) {
        if (result.status === "rejected") console.error("post_commit_account_deletion_repair_deferred");
      }
      return;
    }
    throw new AuthHttpError(409, "profile_conflict");
  }

  async getCode(email: string): Promise<StoredAuthCodeRecord | null> {
    try {
      const entity = await this.codes.getEntity<CodeEntity>(CODE_PARTITION, base64Url(email));
      return { ...codeFromEntity(entity), etag: entity.etag };
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async putCode(record: AuthCodeRecord, expectedEtag: string | null): Promise<StoredAuthCodeRecord> {
    if (expectedEtag === null) {
      const result = await this.codes.createEntity(codeToEntity(record));
      if (result.etag) return { ...record, etag: result.etag };
    } else {
      const result = await this.codes.updateEntity(codeToEntity(record), "Replace", { etag: expectedEtag });
      if (result.etag) return { ...record, etag: result.etag };
    }
    const fresh = await this.getCode(record.email);
    if (!fresh || fresh.codeHash !== record.codeHash || fresh.salt !== record.salt) {
      throw new AuthHttpError(409, "code_conflict");
    }
    return fresh;
  }

  async deleteCode(email: string, expectedEtag?: string): Promise<void> {
    try {
      await this.codes.deleteEntity(CODE_PARTITION, base64Url(email), expectedEtag ? { etag: expectedEtag } : undefined);
    } catch (error) {
      if (!expectedEtag && isNotFoundError(error)) return;
      throw error;
    }
  }

  async consumeCodeSendBudget(
    scope: CodeSendBudgetScope,
    identifier: string,
    now: number,
    windowSeconds: number,
    maximum: number,
  ): Promise<void> {
    const windowMilliseconds = windowSeconds * 1000;
    const windowStart = Math.floor(now / windowMilliseconds) * windowMilliseconds;
    const windowEnd = windowStart + windowMilliseconds;
    const rowKey = `${scope}:${identifier}:${Math.floor(windowStart / 1000)}`;
    for (let attempt = 0; attempt < 32; attempt += 1) {
      let current: TableEntityResult<CodeSendBudgetEntity> | null = null;
      try {
        current = await this.codes.getEntity<CodeSendBudgetEntity>("auth-budget", rowKey);
      } catch (error) {
        if (!isNotFoundError(error)) throw error;
      }
      if (!current) {
        try {
          await this.codes.createEntity({
            partitionKey: "auth-budget",
            rowKey,
            scope,
            count: 1,
            windowStartedAt: nowIso(windowStart),
            expiresAt: nowIso(windowEnd),
          });
          return;
        } catch (error) {
          if (isConflictError(error)) continue;
          throw error;
        }
      }
      const count = Number(current.count);
      if (!Number.isSafeInteger(count) || count < 0 || current.scope !== scope) {
        throw new Error("Verification-code budget is corrupt");
      }
      if (count >= maximum) {
        throw new AuthHttpError(429, `${scope}_code_budget_exhausted`, Math.max(1, Math.ceil((windowEnd - now) / 1000)));
      }
      try {
        await this.codes.updateEntity({
          partitionKey: "auth-budget",
          rowKey,
          scope,
          count: count + 1,
          windowStartedAt: String(current.windowStartedAt),
          expiresAt: String(current.expiresAt),
        }, "Replace", { etag: current.etag });
        return;
      } catch (error) {
        if (isPreconditionError(error)) continue;
        throw error;
      }
    }
    throw new AuthHttpError(409, "code_budget_conflict");
  }

  async getSession(hash: string): Promise<SessionRecord | null> {
    try {
      const entity = await this.sessions.getEntity<SessionEntity>(SESSION_PARTITION, hash);
      return sessionFromEntity(entity);
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async upsertSession(record: SessionRecord): Promise<void> {
    await this.sessions.upsertEntity(sessionToEntity(record), "Replace");
  }

  async deleteSession(hash: string): Promise<void> {
    try {
      await this.sessions.deleteEntity(SESSION_PARTITION, hash);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  async deleteSessionsForUser(userId: string, email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    const entities = this.sessions.listEntities<SessionEntity>({
      queryOptions: { filter: `PartitionKey eq '${SESSION_PARTITION}'` },
    });
    for await (const entity of entities) {
      if (entity.userId !== userId && normalizeEmail(entity.email) !== normalized) continue;
      await this.deleteSession(String(entity.sessionHash));
    }
  }

  async updateSessionsEmail(oldEmail: string, newEmail: string): Promise<void> {
    const oldNormalized = normalizeEmail(oldEmail);
    const newNormalized = normalizeEmail(newEmail);
    const entities = this.sessions.listEntities<SessionEntity>({
      queryOptions: { filter: `PartitionKey eq '${SESSION_PARTITION}'` },
    });
    for await (const entity of entities) {
      if (normalizeEmail(entity.email) !== oldNormalized) continue;
      try {
        await this.sessions.updateEntity(sessionToEntity({
          sessionHash: String(entity.sessionHash),
          userId: typeof entity.userId === "string" ? entity.userId : null,
          email: newNormalized,
          expiresAt: String(entity.expiresAt),
          createdAt: String(entity.createdAt),
          lastSeenAt: nowIso(),
        }), "Replace", { etag: entity.etag });
      } catch (error) {
        if (!isNotFoundError(error) && !isPreconditionError(error)) throw error;
      }
    }
  }
}

class MemoryAuthStore implements AuthStore {
  private readonly users = new Map<string, StoredUserProfile>();
  private readonly legalRetentions = new Map<string, LegalRetentionEntity>();
  private readonly codes = new Map<string, StoredAuthCodeRecord>();
  private readonly sessions = new Map<string, SessionRecord>();
  private codeVersion = 0;
  private readonly codeBudgets = new Map<string, { count: number; expiresAt: number }>();
  private static readonly MAX_CODE_BUDGETS = 4_096;

  async getUser(email: string): Promise<StoredUserProfile | null> {
    const user = this.users.get(email);
    return user ? { ...user } : null;
  }

  async getUserById(userId: string): Promise<StoredUserProfile | null> {
    const user = [...this.users.values()].find((candidate) => candidate.userId === userId);
    return user ? { ...user } : null;
  }

  async getUserByStripeCustomerId(stripeCustomerId: string): Promise<StoredUserProfile | null> {
    for (const user of this.users.values()) {
      if (user.stripeCustomerId === stripeCustomerId) return { ...user };
    }
    return null;
  }

  async upsertUser(user: StoredUserProfile): Promise<StoredUserProfile> {
    const normalized: StoredUserProfile = {
      ...user,
      userId: normalizeUserId(user.userId, user.email),
      profileRevision: normalizeProfileRevision(user.profileRevision),
    };
    const current = [...this.users.values()].find((candidate) => candidate.userId === normalized.userId);
    if (!current) {
      if (normalized.profileRevision !== 1) throw new AuthHttpError(409, "profile_conflict");
      const emailOwner = this.users.get(normalized.email);
      if (emailOwner && emailOwner.userId !== normalized.userId) throw new AuthHttpError(409, "email_taken");
      this.users.set(normalized.email, normalized);
      return { ...normalized };
    }
    if (sameStoredUserData(current, normalized)) return { ...current };
    throw new AuthHttpError(409, "profile_conflict");
  }

  async mutateUser(userId: string, mutation: (current: StoredUserProfile) => StoredUserProfile): Promise<StoredUserProfile> {
    const current = [...this.users.values()].find((candidate) => candidate.userId === userId);
    if (!current) throw new AuthHttpError(409, "profile_conflict");
    const desired = mutation({ ...current });
    if (desired.userId !== current.userId || desired.email !== current.email) {
      throw new Error("Profile mutations cannot change identity fields");
    }
    if (sameStoredUserData(current, desired)) return { ...current };
    if (desired.profileRevision !== current.profileRevision + 1) {
      throw new Error("Profile mutation must increment profileRevision exactly once");
    }
    this.users.set(current.email, desired);
    return { ...desired };
  }

  async changeUserEmail(user: StoredUserProfile, newEmail: string): Promise<StoredUserProfile> {
    const normalizedEmail = normalizeEmail(newEmail);
    const current = [...this.users.values()].find((candidate) => candidate.userId === user.userId);
    if (!current) throw new AuthHttpError(409, "profile_conflict");
    if (this.users.has(normalizedEmail)) throw new AuthHttpError(409, "email_taken");
    const updated: StoredUserProfile = {
      ...current,
      email: normalizedEmail,
      emailAlertsTokenVersion: current.emailAlertsTokenVersion + 1,
      profileRevision: current.profileRevision + 1,
      updatedAt: nowIso(),
    };
    this.users.delete(current.email);
    this.users.set(normalizedEmail, updated);
    await this.updateSessionsEmail(current.email, normalizedEmail);
    return { ...updated };
  }

  async retainLegalRecords(user: StoredUserProfile, retentionUntil: string): Promise<void> {
    if (user.passReceipts.length === 0) return;
    const desired = legalRetentionEntity(user, retentionUntil);
    const current = this.legalRetentions.get(desired.rowKey);
    if (current) {
      if (
        current.stripeCustomerId !== desired.stripeCustomerId
        || current.receiptsJson !== desired.receiptsJson
      ) throw new AuthHttpError(409, "legal_retention_conflict");
      const currentUntil = Date.parse(current.retentionUntil);
      const desiredUntil = Date.parse(desired.retentionUntil);
      if (!Number.isFinite(currentUntil) || !Number.isFinite(desiredUntil)) {
        throw new AuthHttpError(409, "legal_retention_conflict");
      }
      if (currentUntil < desiredUntil) {
        this.legalRetentions.set(desired.rowKey, { ...desired, retainedAt: current.retainedAt });
      }
      return;
    }
    this.legalRetentions.set(desired.rowKey, desired);
  }

  async deleteUser(email: string, options: { userId?: string; deleteProjection?: boolean } = {}): Promise<void> {
    const current = options.userId
      ? [...this.users.values()].find((user) => user.userId === options.userId)
      : this.users.get(email);
    if (current && entitlementIsActive(settleEntitlement(current))) {
      throw new AuthHttpError(409, "active_entitlement");
    }
    if (current?.passReceipts.length) {
      const expected = legalRetentionEntity(current, nowIso());
      const retained = this.legalRetentions.get(expected.rowKey);
      if (!retained || retained.receiptsJson !== expected.receiptsJson || retained.stripeCustomerId !== expected.stripeCustomerId) {
        throw new AuthHttpError(409, "legal_retention_required");
      }
    }
    this.users.delete(email);
    if (options.userId) {
      for (const [key, user] of this.users) {
        if (user.userId === options.userId) this.users.delete(key);
      }
    }
  }

  async getCode(email: string): Promise<StoredAuthCodeRecord | null> {
    const code = this.codes.get(email);
    return code ? { ...code } : null;
  }

  async putCode(record: AuthCodeRecord, expectedEtag: string | null): Promise<StoredAuthCodeRecord> {
    const current = this.codes.get(record.email);
    if (expectedEtag === null) {
      if (current) throw Object.assign(new Error("conflict"), { statusCode: 409 });
    } else if (!current || current.etag !== expectedEtag) {
      throw Object.assign(new Error("precondition"), { statusCode: 412 });
    }
    const stored = { ...record, etag: `memory-${++this.codeVersion}` };
    this.codes.set(record.email, stored);
    return { ...stored };
  }

  async deleteCode(email: string, expectedEtag?: string): Promise<void> {
    const current = this.codes.get(email);
    if (expectedEtag && (!current || current.etag !== expectedEtag)) {
      throw Object.assign(new Error("precondition"), { statusCode: 412 });
    }
    this.codes.delete(email);
  }

  async consumeCodeSendBudget(
    scope: CodeSendBudgetScope,
    identifier: string,
    now: number,
    windowSeconds: number,
    maximum: number,
  ): Promise<void> {
    const windowMilliseconds = windowSeconds * 1000;
    const windowStart = Math.floor(now / windowMilliseconds) * windowMilliseconds;
    const expiresAt = windowStart + windowMilliseconds;
    const key = `${scope}:${identifier}:${windowStart}`;
    const current = this.codeBudgets.get(key)?.count ?? 0;
    if (current >= maximum) {
      throw new AuthHttpError(429, `${scope}_code_budget_exhausted`, Math.max(1, Math.ceil((expiresAt - now) / 1000)));
    }
    for (const [budgetKey, budget] of this.codeBudgets) {
      if (budget.expiresAt <= now) this.codeBudgets.delete(budgetKey);
    }
    while (!this.codeBudgets.has(key) && this.codeBudgets.size >= MemoryAuthStore.MAX_CODE_BUDGETS) {
      const oldest = this.codeBudgets.keys().next().value as string | undefined;
      if (!oldest) break;
      this.codeBudgets.delete(oldest);
    }
    this.codeBudgets.set(key, { count: current + 1, expiresAt });
  }

  async getSession(hash: string): Promise<SessionRecord | null> {
    const session = this.sessions.get(hash);
    return session ? { ...session } : null;
  }

  async upsertSession(record: SessionRecord): Promise<void> {
    this.sessions.set(record.sessionHash, { ...record });
  }

  async deleteSession(hash: string): Promise<void> {
    this.sessions.delete(hash);
  }

  async deleteSessionsForUser(userId: string, email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    for (const [hash, session] of this.sessions) {
      if (session.userId === userId || normalizeEmail(session.email) === normalized) this.sessions.delete(hash);
    }
  }

  async updateSessionsEmail(oldEmail: string, newEmail: string): Promise<void> {
    const oldNormalized = normalizeEmail(oldEmail);
    const newNormalized = normalizeEmail(newEmail);
    for (const [hash, session] of this.sessions) {
      if (normalizeEmail(session.email) === oldNormalized) {
        this.sessions.set(hash, { ...session, email: newNormalized, lastSeenAt: nowIso() });
      }
    }
  }
}

type UserEntity = {
  userId?: string;
  profileRevision?: number;
  recordType?: "profile";
  recordState?: "active" | "superseded" | "deleted";
  supersededByEmail?: string;
  email: string;
  nickname?: string;
  emailAlertsEnabled?: boolean;
  emailAlertsTokenVersion?: number;
  entitlementTier?: string;
  entitlementStatus?: string;
  entitlementExpiresAt?: string;
  entitlementPurchasedAt?: string;
  passReceiptsJson?: string;
  // Legacy recurring-subscription columns are read during migration only.
  subscriptionPlan?: string;
  subscriptionStatus?: string;
  subscriptionCurrentPeriodEnd?: string;
  subscriptionCancelAtPeriodEnd?: boolean;
  pendingSubscriptionPlan?: string;
  pendingSubscriptionEffectiveAt?: string;
  paymentMethod?: string;
  paymentBrand?: string;
  paymentLast4?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  languagePreference?: string;
  deliveryCountry?: string;
  createdAt: string;
  updatedAt: string;
};

type UserIndexEntity = {
  userId: string;
  recordType: "email-index" | "stripe-index";
  recordState: "active" | "superseded" | "deleted";
  email?: string;
  stripeCustomerId?: string;
  sourceRevision: number;
  supersededByEmail?: string;
  updatedAt: string;
};

export type RetainedLegalReceipt = {
  paymentIntentId: string;
  checkoutSessionId: string | null;
  kind: PassReceiptKind;
  tier: Exclude<EntitlementTier, "none">;
  basePaymentIntentId: string | null;
  purchasedAt: string;
  expiresAt: string;
  amountEurCents: number | null;
  checkoutLocale: Lang | null;
  termsVersion: string | null;
  privacyVersion: string | null;
  acceptedAt: string | null;
  immediatePerformanceRequested: boolean | null;
  purchaseConfirmationSentAt: string | null;
  withdrawalConfirmationSentAt: string | null;
  withdrawalRequestedAt: string | null;
  withdrawalReference: string | null;
  withdrawalElectronicConfirmationAcceptedAt: string | null;
  stripeRefundId: string | null;
  stripeRefundStatus: string | null;
  status: PassReceiptStatus;
};

export type LegalRetentionEntity = {
  partitionKey: "legal-retention";
  rowKey: string;
  recordType: "legal-retention";
  schemaVersion: 1;
  stripeCustomerId: string | null;
  receiptsJson: string;
  retainedAt: string;
  retentionUntil: string;
};

type CodeEntity = AuthCodeRecord;
type SessionEntity = Omit<SessionRecord, "userId"> & { userId?: string };

function userToEntity(user: StoredUserProfile): UserEntity & { partitionKey: string; rowKey: string } {
  return {
    partitionKey: USER_PARTITION,
    rowKey: canonicalUserRowKey(user.userId),
    userId: user.userId,
    profileRevision: user.profileRevision,
    recordType: "profile",
    recordState: "active",
    email: user.email,
    nickname: user.nickname ?? "",
    emailAlertsEnabled: user.emailAlertsEnabled,
    emailAlertsTokenVersion: user.emailAlertsTokenVersion,
    entitlementTier: user.entitlementTier,
    entitlementStatus: user.entitlementStatus,
    entitlementExpiresAt: user.entitlementExpiresAt ?? "",
    entitlementPurchasedAt: user.entitlementPurchasedAt ?? "",
    passReceiptsJson: JSON.stringify(user.passReceipts),
    paymentMethod: user.paymentMethod ?? "",
    paymentBrand: user.paymentBrand ?? "",
    paymentLast4: user.paymentLast4 ?? "",
    stripeCustomerId: user.stripeCustomerId ?? "",
    languagePreference: user.languagePreference,
    deliveryCountry: user.deliveryCountry,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export function legalRetentionEntity(
  user: StoredUserProfile,
  retentionUntil: string,
  retainedAt = nowIso(),
): LegalRetentionEntity {
  const receipts: RetainedLegalReceipt[] = user.passReceipts.map((receipt) => ({
    paymentIntentId: receipt.id,
    checkoutSessionId: receipt.checkoutSessionId,
    kind: receipt.kind,
    tier: receipt.tier,
    basePaymentIntentId: receipt.baseReceiptId,
    purchasedAt: receipt.purchasedAt,
    expiresAt: receipt.expiresAt,
    amountEurCents: receipt.amountEurCents,
    checkoutLocale: receipt.checkoutLocale,
    termsVersion: receipt.termsVersion,
    privacyVersion: receipt.privacyVersion,
    acceptedAt: receipt.acceptedAt,
    immediatePerformanceRequested: receipt.immediatePerformanceRequested,
    purchaseConfirmationSentAt: receipt.purchaseConfirmationSentAt,
    withdrawalConfirmationSentAt: receipt.withdrawalConfirmationSentAt,
    withdrawalRequestedAt: receipt.withdrawalRequestedAt,
    withdrawalReference: receipt.withdrawalReference,
    withdrawalElectronicConfirmationAcceptedAt: receipt.withdrawalElectronicConfirmationAcceptedAt,
    stripeRefundId: receipt.stripeRefundId,
    stripeRefundStatus: receipt.stripeRefundStatus,
    status: receipt.status,
  }));
  return {
    partitionKey: "legal-retention",
    rowKey: legalRetentionRowKey(user.userId),
    recordType: "legal-retention",
    schemaVersion: 1,
    stripeCustomerId: user.stripeCustomerId,
    receiptsJson: JSON.stringify(receipts),
    retainedAt,
    retentionUntil,
  };
}

function emailIndexEntity(user: StoredUserProfile): UserIndexEntity & { partitionKey: string; rowKey: string } {
  return {
    partitionKey: USER_PARTITION,
    rowKey: emailIndexRowKey(user.email),
    userId: user.userId,
    recordType: "email-index",
    recordState: "active",
    email: normalizeEmail(user.email),
    sourceRevision: user.profileRevision,
    updatedAt: user.updatedAt,
  };
}

function stripeIndexEntity(user: StoredUserProfile): UserIndexEntity & { partitionKey: string; rowKey: string } {
  if (!user.stripeCustomerId) throw new Error("Stripe index requires a customer ID");
  return {
    partitionKey: USER_PARTITION,
    rowKey: stripeIndexRowKey(user.stripeCustomerId),
    userId: user.userId,
    recordType: "stripe-index",
    recordState: "active",
    stripeCustomerId: user.stripeCustomerId,
    sourceRevision: user.profileRevision,
    updatedAt: user.updatedAt,
  };
}

function indexTombstoneEntity(
  entity: TableEntityResult<UserIndexEntity>,
  sourceRevision: number,
  supersededByEmail?: string,
): UserIndexEntity & { partitionKey: string; rowKey: string } {
  return {
    partitionKey: USER_PARTITION,
    rowKey: String(entity.rowKey),
    userId: entity.userId,
    recordType: entity.recordType,
    recordState: "superseded",
    sourceRevision,
    supersededByEmail,
    updatedAt: nowIso(),
  };
}

function legacyTombstoneEntity(
  entity: TableEntityResult<UserEntity>,
  user: StoredUserProfile,
): UserEntity & { partitionKey: string; rowKey: string } {
  return {
    partitionKey: USER_PARTITION,
    rowKey: String(entity.rowKey),
    userId: user.userId,
    profileRevision: user.profileRevision,
    recordState: "superseded",
    supersededByEmail: user.email,
    email: "",
    createdAt: user.createdAt,
    updatedAt: nowIso(),
  };
}

function deletedProfileEntity(
  user: StoredUserProfile,
  _etag: string,
  profileRevision: number,
): UserEntity & { partitionKey: string; rowKey: string } {
  return {
    partitionKey: USER_PARTITION,
    rowKey: canonicalUserRowKey(user.userId),
    userId: user.userId,
    profileRevision,
    recordType: "profile",
    recordState: "deleted",
    email: "",
    createdAt: user.createdAt,
    updatedAt: nowIso(),
  };
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function parsePassReceipts(value: unknown): PassReceipt[] {
  if (typeof value !== "string" || !value.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return corruptPassReceiptLedger();
  }
  if (!Array.isArray(parsed)) return corruptPassReceiptLedger();
  const receipts: PassReceipt[] = [];
  const seen = new Set<string>();
  for (const candidate of parsed) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      return corruptPassReceiptLedger();
    }
    const record = candidate as Record<string, unknown>;
    const id = sanitizeReceiptId(record.id);
    const kind = record.kind;
    const tier = record.tier;
    const status = record.status;
    const purchasedAt = nonEmptyString(record.purchasedAt);
    const expiresAt = nonEmptyString(record.expiresAt);
    const baseReceiptId = sanitizeReceiptId(record.baseReceiptId) || null;
    if (
      !id
      || seen.has(id)
      || (kind !== "legacy" && kind !== "purchase" && kind !== "upgrade")
      || (tier !== "alerts" && tier !== "radar")
      || (status !== "active" && status !== "refunded" && status !== "revoked")
      || !purchasedAt
      || !expiresAt
      || !Number.isFinite(Date.parse(purchasedAt))
      || !Number.isFinite(Date.parse(expiresAt))
      || Date.parse(expiresAt) <= Date.parse(purchasedAt)
      || (kind === "upgrade" ? !baseReceiptId : Boolean(baseReceiptId))
    ) return corruptPassReceiptLedger();
    seen.add(id);
    receipts.push({
      id,
      checkoutSessionId: sanitizeStripeId(record.checkoutSessionId) || null,
      kind,
      tier,
      status,
      purchasedAt: new Date(Date.parse(purchasedAt)).toISOString(),
      expiresAt: new Date(Date.parse(expiresAt)).toISOString(),
      baseReceiptId,
      amountEurCents: typeof record.amountEurCents === "number"
        && Number.isSafeInteger(record.amountEurCents)
        && record.amountEurCents > 0
        ? record.amountEurCents
        : null,
      checkoutLocale: isLanguagePreference(record.checkoutLocale) ? record.checkoutLocale : null,
      termsVersion: nonEmptyString(record.termsVersion),
      privacyVersion: nonEmptyString(record.privacyVersion),
      acceptedAt: normalizeOptionalTimestamp(record.acceptedAt),
      immediatePerformanceRequested: typeof record.immediatePerformanceRequested === "boolean"
        ? record.immediatePerformanceRequested
        : null,
      purchaseConfirmationSentAt: normalizeOptionalTimestamp(record.purchaseConfirmationSentAt),
      withdrawalConfirmationSentAt: normalizeOptionalTimestamp(record.withdrawalConfirmationSentAt),
      withdrawalRequestedAt: normalizeOptionalTimestamp(record.withdrawalRequestedAt),
      withdrawalReference: nonEmptyString(record.withdrawalReference),
      withdrawalConsumerName: nonEmptyString(record.withdrawalConsumerName),
      withdrawalElectronicConfirmationAcceptedAt: normalizeOptionalTimestamp(record.withdrawalElectronicConfirmationAcceptedAt),
      stripeRefundId: sanitizeStripeId(record.stripeRefundId) || null,
      stripeRefundStatus: nonEmptyString(record.stripeRefundStatus),
      paymentBrand: nonEmptyString(record.paymentBrand),
      paymentLast4: typeof record.paymentLast4 === "string" && /^\d{4}$/.test(record.paymentLast4)
        ? record.paymentLast4
        : null,
    });
  }
  return receipts;
}

function normalizeOptionalTimestamp(value: unknown): string | null {
  const candidate = nonEmptyString(value);
  if (!candidate) return null;
  const parsed = Date.parse(candidate);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function corruptPassReceiptLedger(): never {
  // Never fall back to the cached entitlement columns when the financial
  // receipt ledger is present but unreadable. Throwing makes inventory access
  // fail closed and causes Stripe to retry a webhook until operators repair
  // the canonical row, without logging user or payment identifiers.
  console.error("pass_receipt_ledger_corrupt");
  throw new Error("Pass receipt ledger is corrupt");
}

function legacyEntitlementTier(value: unknown): EntitlementTier {
  if (value === "weekly_basic" || value === "monthly_basic" || value === "heatwave_alerts") return "alerts";
  if (value === "weekly_priority" || value === "monthly_priority" || value === "heatwave_radar") return "radar";
  return AUTH_ENTITLEMENT_TIER_DEFAULT;
}

function legacyEntitlementStatus(
  tier: EntitlementTier,
  legacyStatus: unknown,
  expiresAt: string | null,
  now = Date.now(),
): EntitlementStatus {
  if (tier === "none") return AUTH_ENTITLEMENT_STATUS_DEFAULT;
  const expiry = expiresAt ? Date.parse(expiresAt) : NaN;
  if ((legacyStatus === "active" || legacyStatus === "canceled") && Number.isFinite(expiry) && expiry > now) {
    return "active";
  }
  return "expired";
}

function userFromEntity(entity: TableEntityResult<UserEntity>): StoredUserProfile {
  const legacyTier = legacyEntitlementTier(entity.subscriptionPlan);
  const entitlementTier = isEntitlementTier(entity.entitlementTier) ? entity.entitlementTier : legacyTier;
  const legacyExpiresAt = nonEmptyString(entity.subscriptionCurrentPeriodEnd);
  const entitlementExpiresAt = nonEmptyString(entity.entitlementExpiresAt) ?? legacyExpiresAt;
  const entitlementStatus = isEntitlementStatus(entity.entitlementStatus)
    ? entity.entitlementStatus
    : legacyEntitlementStatus(entitlementTier, entity.subscriptionStatus, entitlementExpiresAt);
  const paymentMethod = isPaymentMethod(entity.paymentMethod) ? entity.paymentMethod : null;
  const languagePreference = isLanguagePreference(entity.languagePreference) ? entity.languagePreference : AUTH_LANGUAGE_DEFAULT;
  const deliveryCountry = isDeliveryCountry(entity.deliveryCountry) ? entity.deliveryCountry : AUTH_DELIVERY_COUNTRY_DEFAULT;
  return {
    userId: normalizeUserId(entity.userId, entity.email),
    profileRevision: normalizeProfileRevision(entity.profileRevision),
    email: normalizeEmail(entity.email),
    nickname: typeof entity.nickname === "string" && entity.nickname.trim() ? entity.nickname.trim() : null,
    emailAlertsEnabled: entity.emailAlertsEnabled !== false,
    emailAlertsTokenVersion: normalizeProfileRevision(entity.emailAlertsTokenVersion),
    entitlementTier,
    entitlementStatus,
    entitlementExpiresAt,
    entitlementPurchasedAt: nonEmptyString(entity.entitlementPurchasedAt)
      ?? (entitlementTier === "none" ? null : nonEmptyString(entity.createdAt)),
    passReceipts: parsePassReceipts(entity.passReceiptsJson),
    paymentMethod,
    paymentBrand: typeof entity.paymentBrand === "string" && entity.paymentBrand.trim() ? entity.paymentBrand.trim() : null,
    paymentLast4: typeof entity.paymentLast4 === "string" && /^\d{4}$/.test(entity.paymentLast4) ? entity.paymentLast4 : null,
    stripeCustomerId: typeof entity.stripeCustomerId === "string" && entity.stripeCustomerId.trim() ? entity.stripeCustomerId.trim() : null,
    languagePreference,
    deliveryCountry,
    createdAt: String(entity.createdAt),
    updatedAt: String(entity.updatedAt),
  };
}

function sameStoredUserData(left: StoredUserProfile, right: StoredUserProfile): boolean {
  return left.userId === right.userId
    && left.email === right.email
    && left.nickname === right.nickname
    && left.emailAlertsEnabled === right.emailAlertsEnabled
    && left.emailAlertsTokenVersion === right.emailAlertsTokenVersion
    && left.entitlementTier === right.entitlementTier
    && left.entitlementStatus === right.entitlementStatus
    && left.entitlementExpiresAt === right.entitlementExpiresAt
    && left.entitlementPurchasedAt === right.entitlementPurchasedAt
    && left.paymentMethod === right.paymentMethod
    && left.paymentBrand === right.paymentBrand
    && left.paymentLast4 === right.paymentLast4
    && left.stripeCustomerId === right.stripeCustomerId
    && JSON.stringify(left.passReceipts) === JSON.stringify(right.passReceipts)
    && left.languagePreference === right.languagePreference
    && left.deliveryCountry === right.deliveryCountry
    && left.createdAt === right.createdAt;
}

function codeToEntity(record: AuthCodeRecord): CodeEntity & { partitionKey: string; rowKey: string } {
  return {
    partitionKey: CODE_PARTITION,
    rowKey: base64Url(record.email),
    ...record,
  };
}

function codeFromEntity(entity: TableEntityResult<CodeEntity>): AuthCodeRecord {
  return {
    email: normalizeEmail(entity.email),
    codeHash: String(entity.codeHash),
    // A missing version identifies the retired, unpeppered SHA-256 format.
    // It is deliberately not interpreted as the current version.
    hashVersion: typeof entity.hashVersion === "string" ? entity.hashVersion : "",
    salt: String(entity.salt),
    expiresAt: String(entity.expiresAt),
    attempts: Number(entity.attempts ?? 0),
    lastSentAt: String(entity.lastSentAt),
    createdAt: String(entity.createdAt),
  };
}

function sessionToEntity(record: SessionRecord): SessionEntity & { partitionKey: string; rowKey: string } {
  return {
    partitionKey: SESSION_PARTITION,
    rowKey: record.sessionHash,
    sessionHash: record.sessionHash,
    ...(record.userId ? { userId: record.userId } : {}),
    email: record.email,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    lastSeenAt: record.lastSeenAt,
  };
}

function sessionFromEntity(entity: TableEntityResult<SessionEntity>): SessionRecord {
  return {
    sessionHash: String(entity.sessionHash),
    userId: typeof entity.userId === "string" && UUID_PATTERN.test(entity.userId)
      ? entity.userId.toLowerCase()
      : null,
    email: normalizeEmail(entity.email),
    expiresAt: String(entity.expiresAt),
    createdAt: String(entity.createdAt),
    lastSeenAt: String(entity.lastSeenAt),
  };
}

class AuthMailer {
  private client: EmailClient | undefined;

  constructor(
    private readonly endpoint: string | undefined,
    private readonly senderAddress: string | undefined,
    private readonly replyToAddress: string | undefined,
    private readonly managedIdentityClientId: string | undefined,
    private readonly exposeDevCode: boolean,
  ) {}

  async sendVerificationCode(email: string, code: string, lang: Lang): Promise<SendCodeResult> {
    if (!this.endpoint || !this.senderAddress) {
      if (!this.exposeDevCode) throw new Error("Auth email is not configured");
      console.info(`Auth verification code for ${maskEmail(email)}: ${code}`);
      return { devCode: code };
    }

    const client = this.getClient();
    const message = verificationEmailMessage(this.senderAddress, email, code, lang, this.replyToAddress);
    const poller = await client.beginSend(message, { updateIntervalInMs: 1_000 });
    const result = await poller.pollUntilDone();
    if (result.status === "Failed") {
      throw new Error(result.error?.message || "ACS email send failed");
    }
    return {};
  }

  async sendPassPurchaseConfirmation(
    email: string,
    lang: Lang,
    details: PassConfirmationDetails,
  ): Promise<void> {
    await this.sendTransactionalMessage(
      email,
      purchaseConfirmationEmailMessage(
        this.senderAddress ?? "Airco Tracker",
        email,
        lang,
        details,
        this.replyToAddress,
      ),
      `Pass purchase confirmation ${details.orderReference}`,
    );
  }

  async sendWithdrawalConfirmation(
    email: string,
    lang: Lang,
    details: WithdrawalConfirmationDetails,
  ): Promise<void> {
    await this.sendTransactionalMessage(
      email,
      withdrawalConfirmationEmailMessage(
        this.senderAddress ?? "Airco Tracker",
        email,
        lang,
        details,
        this.replyToAddress,
      ),
      `Withdrawal confirmation ${details.refundReference}`,
    );
  }

  private async sendTransactionalMessage(
    email: string,
    message: EmailMessage,
    localDescription: string,
  ): Promise<void> {
    if (!this.endpoint || !this.senderAddress) {
      if (!this.exposeDevCode) throw new Error("Transactional email is not configured");
      console.info(`${localDescription} for ${maskEmail(email)}`);
      return;
    }
    const poller = await this.getClient().beginSend(message, { updateIntervalInMs: 1_000 });
    const result = await poller.pollUntilDone();
    if (result.status === "Failed") {
      throw new Error(result.error?.message || "ACS email send failed");
    }
  }

  private getClient(): EmailClient {
    if (!this.client) {
      const credential = new DefaultAzureCredential({
        managedIdentityClientId: this.managedIdentityClientId,
      });
      this.client = new EmailClient(this.endpoint!, credential);
    }
    return this.client;
  }
}

export class AuthService {
  readonly cookieName: string;
  private readonly store: AuthStore;
  private readonly mailer: AuthMailer;
  private readonly codeTtlSeconds: number;
  private readonly codeResendSeconds: number;
  private readonly codeMaxAttempts: number;
  private readonly verificationCodePepper: string;
  private readonly verificationCodePepperVersion: string;
  private readonly emailCodeBudgetPerHour: number;
  private readonly ipCodeBudgetPerHour: number;
  private readonly globalCodeBudgetPerHour: number;
  private readonly sessionTtlSeconds: number;
  private readonly legalRecordRetentionYears: 7 | 10;
  private readonly unsubscribeSigningKey: string | undefined;

  constructor(options: AuthServiceOptions = {}) {
    this.cookieName = options.cookieName || DEFAULT_COOKIE_NAME;
    this.codeTtlSeconds = options.codeTtlSeconds ?? DEFAULT_CODE_TTL_SECONDS;
    this.codeResendSeconds = options.codeResendSeconds ?? DEFAULT_RESEND_SECONDS;
    this.codeMaxAttempts = options.codeMaxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.verificationCodePepper = options.verificationCodePepper?.trim() || "";
    this.verificationCodePepperVersion = options.verificationCodePepperVersion?.trim() || "";
    if (this.verificationCodePepper.length < MINIMUM_VERIFICATION_CODE_PEPPER_LENGTH) {
      throw new Error(`Verification-code HMAC pepper must be at least ${MINIMUM_VERIFICATION_CODE_PEPPER_LENGTH} characters`);
    }
    if (!VERIFICATION_CODE_HASH_VERSION_PATTERN.test(this.verificationCodePepperVersion)) {
      throw new Error("Verification-code HMAC pepper version is invalid");
    }
    this.emailCodeBudgetPerHour = options.emailCodeBudgetPerHour ?? DEFAULT_EMAIL_CODE_BUDGET_PER_HOUR;
    this.ipCodeBudgetPerHour = options.ipCodeBudgetPerHour ?? DEFAULT_IP_CODE_BUDGET_PER_HOUR;
    this.globalCodeBudgetPerHour = options.globalCodeBudgetPerHour ?? DEFAULT_GLOBAL_CODE_BUDGET_PER_HOUR;
    for (const [name, value] of [
      ["Per-email", this.emailCodeBudgetPerHour],
      ["Per-IP", this.ipCodeBudgetPerHour],
      ["Global", this.globalCodeBudgetPerHour],
    ] as const) {
      if (!Number.isSafeInteger(value) || value < 1) {
        throw new Error(`${name} verification-code budget must be a positive integer`);
      }
    }
    this.sessionTtlSeconds = options.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
    this.legalRecordRetentionYears = options.legalRecordRetentionYears ?? DEFAULT_LEGAL_RECORD_RETENTION_YEARS;
    if (this.legalRecordRetentionYears !== 7 && this.legalRecordRetentionYears !== 10) {
      throw new Error("Legal record retention must be exactly 7 or 10 years");
    }
    this.unsubscribeSigningKey = options.unsubscribeSigningKey?.trim() || undefined;
    if (this.unsubscribeSigningKey && this.unsubscribeSigningKey.length < 32) {
      throw new Error("Email unsubscribe signing key must be at least 32 characters");
    }

    const tableNames = {
      users: options.usersTableName || "users",
      codes: options.codesTableName || "authcodes",
      sessions: options.sessionsTableName || "authsessions",
      recipients: options.alertRecipientsTableName || "alertrecipients",
    };
    this.store = options.storageAccountUrl
      ? new TableAuthStore(options.storageAccountUrl, options.managedIdentityClientId, tableNames)
      : new MemoryAuthStore();
    this.mailer = new AuthMailer(
      options.emailEndpoint,
      options.emailFrom,
      options.emailReplyTo,
      options.managedIdentityClientId,
      Boolean(options.exposeDevCode),
    );
  }

  async requestCode(rawEmail: unknown, lang: Lang, clientIp = "unknown"): Promise<RequestCodeResult> {
    const email = normalizeAndValidateEmail(rawEmail);
    return this.issueCode(email, lang, clientIp);
  }

  async requestEmailChangeCode(
    request: IncomingMessage,
    rawEmail: unknown,
    lang: Lang,
    clientIp = "unknown",
  ): Promise<RequestCodeResult> {
    const user = await this.requireUser(request);
    const email = normalizeAndValidateEmail(rawEmail);
    if (email === user.email) throw new AuthHttpError(400, "email_unchanged");
    const existing = await this.store.getUser(email);
    if (existing) throw new AuthHttpError(409, "email_taken");
    return this.issueCode(email, lang, clientIp);
  }

  private async issueCode(email: string, lang: Lang, clientIp: string): Promise<RequestCodeResult> {
    let budgetConsumed = false;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const existing = await this.store.getCode(email);
      if (existing && !isExpired(existing.expiresAt)) {
        const nextAllowedAt = Date.parse(existing.lastSentAt) + this.codeResendSeconds * 1000;
        const waitMs = nextAllowedAt - Date.now();
        if (waitMs > 0) {
          throw new AuthHttpError(429, "code_recently_sent", Math.ceil(waitMs / 1000));
        }
      }

      if (!budgetConsumed) {
        const budgetNow = Date.now();
        await this.store.consumeCodeSendBudget(
          "email",
          verificationBudgetIdentifier(
            this.verificationCodePepper,
            this.verificationCodePepperVersion,
            "email",
            email,
          ),
          budgetNow,
          GLOBAL_CODE_BUDGET_WINDOW_SECONDS,
          this.emailCodeBudgetPerHour,
        );
        await this.store.consumeCodeSendBudget(
          "ip",
          verificationBudgetIdentifier(
            this.verificationCodePepper,
            this.verificationCodePepperVersion,
            "ip",
            clientIp.trim().toLowerCase() || "unknown",
          ),
          budgetNow,
          GLOBAL_CODE_BUDGET_WINDOW_SECONDS,
          this.ipCodeBudgetPerHour,
        );
        await this.store.consumeCodeSendBudget(
          "global",
          "all",
          budgetNow,
          GLOBAL_CODE_BUDGET_WINDOW_SECONDS,
          this.globalCodeBudgetPerHour,
        );
        budgetConsumed = true;
      }

      const code = generateVerificationCode();
      const salt = randomSalt();
      const sentAt = nowIso();
      const record: AuthCodeRecord = {
        email,
        codeHash: createVerificationHash(
          email,
          code,
          salt,
          this.verificationCodePepper,
          this.verificationCodePepperVersion,
        ),
        hashVersion: this.verificationCodePepperVersion,
        salt,
        expiresAt: nowIso(Date.now() + this.codeTtlSeconds * 1000),
        attempts: 0,
        lastSentAt: sentAt,
        createdAt: sentAt,
      };
      let stored: StoredAuthCodeRecord;
      try {
        stored = await this.store.putCode(record, existing?.etag ?? null);
      } catch (error) {
        if (isConflictError(error) || isPreconditionError(error)) continue;
        throw error;
      }
      try {
        const sent = await this.mailer.sendVerificationCode(email, code, lang);
        return {
          ok: true,
          retryAfterSeconds: this.codeResendSeconds,
          devCode: sent.devCode,
        };
      } catch {
        try {
          await this.store.deleteCode(email, stored.etag);
        } catch (deleteError) {
          if (!isNotFoundError(deleteError) && !isPreconditionError(deleteError)) throw deleteError;
        }
        console.error("verification_email_send_failed");
        throw new AuthHttpError(502, "email_send_failed");
      }
    }
    throw new AuthHttpError(409, "code_conflict");
  }

  async verifyCode(rawEmail: unknown, rawCode: unknown, lang: Lang = AUTH_LANGUAGE_DEFAULT): Promise<VerifyCodeResult> {
    const email = normalizeAndValidateEmail(rawEmail);
    await this.consumeCode(email, rawCode);
    const existingUser = await this.store.getUser(email);
    const timestamp = nowIso();
    let user: StoredUserProfile = existingUser ?? {
      userId: createUserId(),
      profileRevision: 1,
      email,
      nickname: null,
      emailAlertsEnabled: true,
      emailAlertsTokenVersion: 1,
      entitlementTier: AUTH_ENTITLEMENT_TIER_DEFAULT,
      entitlementStatus: AUTH_ENTITLEMENT_STATUS_DEFAULT,
      entitlementExpiresAt: null,
      entitlementPurchasedAt: null,
      paymentMethod: null,
      paymentBrand: null,
      paymentLast4: null,
      stripeCustomerId: null,
      passReceipts: [],
      languagePreference: isLanguagePreference(lang) ? lang : AUTH_LANGUAGE_DEFAULT,
      deliveryCountry: AUTH_DELIVERY_COUNTRY_DEFAULT,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (!existingUser) user = await this.store.upsertUser(user);

    const sessionToken = randomSessionToken();
    const session: SessionRecord = {
      sessionHash: sessionHash(sessionToken),
      userId: user.userId,
      email,
      expiresAt: nowIso(Date.now() + this.sessionTtlSeconds * 1000),
      createdAt: timestamp,
      lastSeenAt: timestamp,
    };
    await this.store.upsertSession(session);
    return {
      user,
      isNewUser: !existingUser,
      sessionToken,
      sessionTtlSeconds: this.sessionTtlSeconds,
    };
  }

  private async consumeCode(email: string, rawCode: unknown): Promise<void> {
    const code = sanitizeCode(rawCode);
    if (!/^\d{6}$/.test(code)) throw new AuthHttpError(400, "invalid_code");

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const stored = await this.store.getCode(email);
      if (!stored) throw new AuthHttpError(400, "invalid_or_expired_code");
      if (isExpired(stored.expiresAt)) {
        try {
          await this.store.deleteCode(email, stored.etag);
          throw new AuthHttpError(400, "invalid_or_expired_code");
        } catch (error) {
          if (error instanceof AuthHttpError) throw error;
          if (isNotFoundError(error) || isPreconditionError(error)) continue;
          throw error;
        }
      }
      if (stored.attempts >= this.codeMaxAttempts) {
        try {
          await this.store.deleteCode(email, stored.etag);
          throw new AuthHttpError(400, "too_many_code_attempts");
        } catch (error) {
          if (error instanceof AuthHttpError) throw error;
          if (isNotFoundError(error) || isPreconditionError(error)) continue;
          throw error;
        }
      }
      if (stored.hashVersion !== this.verificationCodePepperVersion) {
        try {
          await this.store.deleteCode(email, stored.etag);
          throw new AuthHttpError(400, "invalid_or_expired_code");
        } catch (error) {
          if (error instanceof AuthHttpError) throw error;
          if (isNotFoundError(error) || isPreconditionError(error)) continue;
          throw error;
        }
      }
      if (!verifyVerificationHash(
        email,
        code,
        stored.salt,
        stored.codeHash,
        this.verificationCodePepper,
        this.verificationCodePepperVersion,
      )) {
        const { etag: _etag, ...next } = stored;
        try {
          await this.store.putCode({ ...next, attempts: stored.attempts + 1 }, stored.etag);
          throw new AuthHttpError(400, "invalid_or_expired_code");
        } catch (error) {
          if (error instanceof AuthHttpError) throw error;
          if (isNotFoundError(error) || isPreconditionError(error)) continue;
          throw error;
        }
      }

      try {
        await this.store.deleteCode(email, stored.etag);
        return;
      } catch (error) {
        if (isNotFoundError(error) || isPreconditionError(error)) continue;
        throw error;
      }
    }
    throw new AuthHttpError(409, "code_conflict");
  }

  async currentUser(request: IncomingMessage): Promise<StoredUserProfile | null> {
    const token = parseCookies(request)[this.cookieName];
    if (!token) return null;

    const hash = sessionHash(token);
    const session = await this.store.getSession(hash);
    if (!session || isExpired(session.expiresAt)) {
      if (session) await this.store.deleteSession(hash);
      return null;
    }
    // Sessions created before immutable UUID binding are deliberately
    // invalidated once. Re-associating them by mutable email could log an old
    // cookie into a different account after an address change and re-use.
    if (!session.userId) {
      await this.store.deleteSession(hash);
      return null;
    }
    const user = await this.store.getUserById(session.userId);
    if (!user) {
      await this.store.deleteSession(hash);
      return null;
    }
    const settled = settleEntitlement(user);
    const current = settled !== user
      ? await this.store.mutateUser(user.userId, (fresh) => {
          const next = settleEntitlement(fresh);
          return next === fresh ? fresh : { ...next, profileRevision: fresh.profileRevision + 1 };
        })
      : user;
    await this.store.upsertSession({ ...session, email: user.email, lastSeenAt: nowIso() });
    return current;
  }

  async requireUser(request: IncomingMessage): Promise<StoredUserProfile> {
    const user = await this.currentUser(request);
    if (!user) throw new AuthHttpError(401, "not_authenticated");
    return user;
  }

  async findUserById(userId: string): Promise<StoredUserProfile | null> {
    return UUID_PATTERN.test(userId) ? this.store.getUserById(userId.toLowerCase()) : null;
  }

  async verifyExistingEmailCode(rawEmail: unknown, rawCode: unknown): Promise<StoredUserProfile> {
    const email = normalizeAndValidateEmail(rawEmail);
    await this.consumeCode(email, rawCode);
    const user = await this.store.getUser(email);
    if (!user) throw new AuthHttpError(400, "invalid_or_expired_code");
    return user;
  }

  async updateNickname(request: IncomingMessage, rawNickname: unknown): Promise<StoredUserProfile> {
    const user = await this.requireUser(request);
    const validation = validateNickname(rawNickname);
    if (!validation.ok) throw new AuthHttpError(400, `nickname_${validation.error}`);
    return this.store.mutateUser(user.userId, (current) => reviseProfile(current, {
      nickname: validation.nickname,
    }));
  }

  async updateEmail(request: IncomingMessage, values: { email?: unknown; code?: unknown }): Promise<StoredUserProfile> {
    const user = await this.requireUser(request);
    const email = normalizeAndValidateEmail(values.email);
    if (email === user.email) throw new AuthHttpError(400, "email_unchanged");
    const existing = await this.store.getUser(email);
    if (existing) throw new AuthHttpError(409, "email_taken");
    await this.consumeCode(email, values.code);
    return this.store.changeUserEmail(user, email);
  }

  async attachStripeCustomer(request: IncomingMessage, stripeCustomerId: string): Promise<StoredUserProfile> {
    const user = await this.requireUser(request);
    const normalizedCustomerId = sanitizeStripeId(stripeCustomerId);
    if (!normalizedCustomerId) throw new AuthHttpError(400, "invalid_stripe_customer");
    return this.store.mutateUser(user.userId, (current) => reviseProfile(current, {
      stripeCustomerId: normalizedCustomerId,
    }));
  }

  async findUserByStripeCustomerId(stripeCustomerId: string): Promise<StoredUserProfile | null> {
    const normalizedCustomerId = sanitizeStripeId(stripeCustomerId);
    if (!normalizedCustomerId) return null;
    return this.store.getUserByStripeCustomerId(normalizedCustomerId);
  }

  async applyStripePassPurchase(purchase: StripePassPurchase): Promise<StoredUserProfile | null> {
    const user = await this.findUserByStripeCustomerId(purchase.stripeCustomerId);
    if (!user) return null;

    const stripeCustomerId = sanitizeStripeId(purchase.stripeCustomerId);
    const stripePaymentIntentId = sanitizeStripeId(purchase.stripePaymentIntentId);
    const baseReceiptId = sanitizeReceiptId(purchase.baseReceiptId) || null;
    if (
      !stripeCustomerId
      || !stripePaymentIntentId
      || purchase.userId !== user.userId
      || (purchase.kind === "upgrade" && !baseReceiptId)
    ) {
      throw new AuthHttpError(400, "invalid_stripe_pass_purchase");
    }
    return this.store.mutateUser(user.userId, (current) => {
      if (current.passReceipts.some((receipt) => receipt.id === stripePaymentIntentId)) {
        const recomputed = recomputePassEntitlement(current);
        return sameStoredUserData(current, recomputed)
          ? current
          : { ...recomputed, profileRevision: current.profileRevision + 1, updatedAt: nowIso() };
      }
      const expiresAt = Date.parse(purchase.expiresAt);
      const purchasedAt = Date.parse(purchase.purchasedAt);
      if (
        !Number.isFinite(expiresAt)
        || !Number.isFinite(purchasedAt)
        || expiresAt <= purchasedAt
        || expiresAt <= Date.now()
      ) {
        throw new AuthHttpError(400, "invalid_pass_expiration");
      }
      const receipts = seedLegacyPassReceipt(current);
      if (purchase.kind === "purchase") {
        const existingRoot = activePassRoot({ ...current, passReceipts: receipts }, purchasedAt);
        if (
          existingRoot
          && Date.parse(existingRoot.expiresAt) - purchasedAt > MINIMUM_REPURCHASE_REMAINING_MILLISECONDS
        ) {
          // A second Checkout can have been opened before the first payment's
          // webhook committed. First committed root wins; the billing layer
          // refunds this later settlement instead of charging twice for one
          // entitlement window.
          throw new AuthHttpError(409, "pass_already_active_after_payment");
        }
      }
      if (purchase.kind === "upgrade") {
        const base = receipts.find((receipt) => receipt.id === baseReceiptId);
        if (!base || base.status !== "active" || base.tier !== "alerts" || Date.parse(base.expiresAt) <= purchasedAt) {
          throw new AuthHttpError(409, "pass_upgrade_base_unavailable");
        }
        if (receipts.some((receipt) => (
          receipt.kind === "upgrade"
          && receipt.baseReceiptId === baseReceiptId
          && receipt.status === "active"
        ))) {
          // Multiple Checkout Sessions can settle concurrently. One paid
          // upgrade per base receipt is sufficient; the billing layer refunds
          // every later settlement.
          throw new AuthHttpError(409, "pass_upgrade_already_applied");
        }
      }
      receipts.push({
        id: stripePaymentIntentId,
        checkoutSessionId: purchase.checkoutSessionId,
        kind: purchase.kind,
        tier: purchase.tier,
        baseReceiptId,
        purchasedAt: new Date(purchasedAt).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
        amountEurCents: purchase.amountEurCents,
        checkoutLocale: purchase.checkoutLocale,
        termsVersion: purchase.termsVersion,
        privacyVersion: purchase.privacyVersion,
        acceptedAt: purchase.acceptedAt,
        immediatePerformanceRequested: purchase.immediatePerformanceRequested,
        purchaseConfirmationSentAt: null,
        withdrawalConfirmationSentAt: null,
        withdrawalRequestedAt: null,
        withdrawalReference: null,
        withdrawalConsumerName: null,
        withdrawalElectronicConfirmationAcceptedAt: null,
        stripeRefundId: null,
        stripeRefundStatus: null,
        status: "active",
        paymentBrand: purchase.paymentBrand,
        paymentLast4: purchase.paymentLast4,
      });
      return recomputePassEntitlement(reviseProfile(current, {
        stripeCustomerId,
        passReceipts: receipts,
      }));
    });
  }

  async revokeStripePassEntitlement(
    stripeCustomerId: string,
    stripePaymentIntentId: string,
    status: Extract<EntitlementStatus, "refunded" | "revoked">,
  ): Promise<StoredUserProfile | null> {
    const user = await this.findUserByStripeCustomerId(stripeCustomerId);
    if (!user) return null;
    const paymentIntentId = sanitizeStripeId(stripePaymentIntentId);
    if (!paymentIntentId) throw new AuthHttpError(400, "invalid_stripe_payment_intent");
    return this.store.mutateUser(user.userId, (current) => {
      const receiptIndex = current.passReceipts.findIndex((receipt) => receipt.id === paymentIntentId);
      if (receiptIndex < 0 || current.passReceipts[receiptIndex]!.status === status) return current;
      const passReceipts = current.passReceipts.map((receipt, index) => (
        index === receiptIndex ? { ...receipt, status } : receipt
      ));
      return recomputePassEntitlement(reviseProfile(current, { passReceipts }));
    });
  }

  async recordPassWithdrawal(
    stripeCustomerId: string,
    stripePaymentIntentId: string,
    audit: WithdrawalAudit,
  ): Promise<StoredUserProfile | null> {
    const user = await this.findUserByStripeCustomerId(stripeCustomerId);
    if (!user) return null;
    const paymentIntentId = sanitizeStripeId(stripePaymentIntentId);
    if (!paymentIntentId) throw new AuthHttpError(400, "invalid_stripe_payment_intent");
    if (
      audit.receiptStatus === "active"
      && audit.stripeRefundStatus !== "failed"
      && audit.stripeRefundStatus !== "canceled"
    ) throw new AuthHttpError(400, "invalid_withdrawal_audit");
    return this.store.mutateUser(user.userId, (current) => {
      const index = current.passReceipts.findIndex((receipt) => receipt.id === paymentIntentId);
      if (index < 0) throw new AuthHttpError(404, "withdrawal_order_not_found");
      const existing = current.passReceipts[index]!;
      if (existing.withdrawalReference && existing.withdrawalReference !== audit.reference) {
        throw new AuthHttpError(409, "withdrawal_already_requested");
      }
      const existingRefundFailed = existing.stripeRefundStatus === "failed"
        || existing.stripeRefundStatus === "canceled";
      if (
        existing.stripeRefundId
        && existing.stripeRefundId !== audit.stripeRefundId
        && !existingRefundFailed
      ) {
        throw new AuthHttpError(409, "withdrawal_already_requested");
      }
      // Stripe webhook delivery races the request that created the refund. A
      // late local `pending` write must never roll a terminal webhook result
      // back to a non-terminal state for the same refund.
      const existingRefundTerminal = existing.stripeRefundStatus === "succeeded"
        || existingRefundFailed;
      if (
        existing.stripeRefundId === audit.stripeRefundId
        && existingRefundTerminal
        && existing.stripeRefundStatus !== audit.stripeRefundStatus
      ) return current;
      if (
        existing.status === audit.receiptStatus
        && existing.withdrawalRequestedAt === audit.requestedAt
        && existing.withdrawalReference === audit.reference
        && existing.stripeRefundId === audit.stripeRefundId
        && existing.stripeRefundStatus === audit.stripeRefundStatus
      ) return current;
      const passReceipts = current.passReceipts.map((receipt, receiptIndex) => (
        receiptIndex === index
          ? {
              ...receipt,
              status: audit.receiptStatus,
              withdrawalRequestedAt: audit.requestedAt,
              withdrawalReference: audit.reference,
              stripeRefundId: audit.stripeRefundId,
              stripeRefundStatus: audit.stripeRefundStatus,
            }
          : receipt
      ));
      return recomputePassEntitlement(reviseProfile(current, { passReceipts }));
    });
  }

  async initiatePassWithdrawal(
    userId: string,
    stripePaymentIntentId: string,
    initiation: WithdrawalInitiation,
  ): Promise<StoredUserProfile | null> {
    const user = await this.findUserById(userId);
    if (!user) return null;
    const paymentIntentId = sanitizeStripeId(stripePaymentIntentId);
    const reference = nonEmptyString(initiation.reference);
    const requestedAt = normalizeOptionalTimestamp(initiation.requestedAt);
    const consumerName = nonEmptyString(initiation.consumerName);
    const electronicConfirmationAcceptedAt = normalizeOptionalTimestamp(initiation.electronicConfirmationAcceptedAt);
    if (!paymentIntentId || !reference || !requestedAt || !consumerName || consumerName.length > 200 || !electronicConfirmationAcceptedAt) {
      throw new AuthHttpError(400, "invalid_withdrawal_request");
    }
    return this.store.mutateUser(user.userId, (current) => {
      const index = current.passReceipts.findIndex((receipt) => receipt.id === paymentIntentId);
      if (index < 0) throw new AuthHttpError(404, "withdrawal_order_not_found");
      const existing = current.passReceipts[index]!;
      // The first committed request owns the stable reference. Concurrent or
      // retried requests reuse it, which in turn keeps the Stripe idempotency
      // key and the customer-facing audit trail stable.
      if (existing.withdrawalReference) return current;
      if (existing.status !== "active") {
        throw new AuthHttpError(409, "withdrawal_order_not_eligible");
      }
      const passReceipts = current.passReceipts.map((receipt, receiptIndex) => (
        receiptIndex === index
          ? {
              ...receipt,
              withdrawalRequestedAt: requestedAt,
              withdrawalReference: reference,
              withdrawalConsumerName: consumerName,
              withdrawalElectronicConfirmationAcceptedAt: electronicConfirmationAcceptedAt,
              stripeRefundStatus: "requested",
            }
          : receipt
      ));
      return reviseProfile(current, { passReceipts });
    });
  }

  async markPassPurchaseConfirmationSent(
    stripeCustomerId: string,
    stripePaymentIntentId: string,
    sentAt = nowIso(),
  ): Promise<StoredUserProfile | null> {
    const user = await this.findUserByStripeCustomerId(stripeCustomerId);
    if (!user) return null;
    const paymentIntentId = sanitizeStripeId(stripePaymentIntentId);
    if (!paymentIntentId) throw new AuthHttpError(400, "invalid_stripe_payment_intent");
    return this.store.mutateUser(user.userId, (current) => {
      const index = current.passReceipts.findIndex((receipt) => receipt.id === paymentIntentId);
      if (index < 0 || current.passReceipts[index]!.purchaseConfirmationSentAt) return current;
      const passReceipts = current.passReceipts.map((receipt, receiptIndex) => (
        receiptIndex === index ? { ...receipt, purchaseConfirmationSentAt: sentAt } : receipt
      ));
      return reviseProfile(current, { passReceipts });
    });
  }

  async markWithdrawalConfirmationSent(
    stripeCustomerId: string,
    stripePaymentIntentId: string,
    sentAt = nowIso(),
  ): Promise<StoredUserProfile | null> {
    const user = await this.findUserByStripeCustomerId(stripeCustomerId);
    if (!user) return null;
    const paymentIntentId = sanitizeStripeId(stripePaymentIntentId);
    if (!paymentIntentId) throw new AuthHttpError(400, "invalid_stripe_payment_intent");
    return this.store.mutateUser(user.userId, (current) => {
      const index = current.passReceipts.findIndex((receipt) => receipt.id === paymentIntentId);
      if (index < 0 || current.passReceipts[index]!.withdrawalConfirmationSentAt) return current;
      const passReceipts = current.passReceipts.map((receipt, receiptIndex) => (
        receiptIndex === index ? { ...receipt, withdrawalConfirmationSentAt: sentAt } : receipt
      ));
      return reviseProfile(current, { passReceipts });
    });
  }

  async sendPassPurchaseConfirmation(
    user: StoredUserProfile,
    details: PassConfirmationDetails,
  ): Promise<void> {
    await this.mailer.sendPassPurchaseConfirmation(user.email, user.languagePreference, details);
  }

  async sendWithdrawalConfirmation(
    user: StoredUserProfile,
    details: WithdrawalConfirmationDetails,
  ): Promise<void> {
    await this.mailer.sendWithdrawalConfirmation(user.email, user.languagePreference, details);
  }

  async restoreStripePassEntitlement(
    stripeCustomerId: string,
    stripePaymentIntentId: string,
  ): Promise<StoredUserProfile | null> {
    const user = await this.findUserByStripeCustomerId(stripeCustomerId);
    if (!user) return null;
    const paymentIntentId = sanitizeStripeId(stripePaymentIntentId);
    if (!paymentIntentId) throw new AuthHttpError(400, "invalid_stripe_payment_intent");
    return this.store.mutateUser(user.userId, (current) => {
      const receiptIndex = current.passReceipts.findIndex((receipt) => receipt.id === paymentIntentId);
      if (receiptIndex < 0 || current.passReceipts[receiptIndex]!.status !== "revoked") return current;
      const passReceipts = current.passReceipts.map((receipt, index) => (
        index === receiptIndex ? { ...receipt, status: "active" as const } : receipt
      ));
      return recomputePassEntitlement(reviseProfile(current, { passReceipts }));
    });
  }

  async linkedActiveUpgradePaymentIntentIds(
    stripeCustomerId: string,
    baseStripePaymentIntentId: string,
  ): Promise<string[]> {
    const user = await this.findUserByStripeCustomerId(stripeCustomerId);
    if (!user) return [];
    const baseReceiptId = sanitizeStripeId(baseStripePaymentIntentId);
    if (!baseReceiptId) throw new AuthHttpError(400, "invalid_stripe_payment_intent");
    return user.passReceipts
      .filter((receipt) => (
        receipt.kind === "upgrade"
        && receipt.baseReceiptId === baseReceiptId
        && receipt.status === "active"
      ))
      .map((receipt) => sanitizeStripeId(receipt.id))
      .filter((receiptId): receiptId is string => Boolean(receiptId));
  }

  async deleteAccount(request: IncomingMessage): Promise<void> {
    const user = await this.prepareAccountDeletion(request);
    await this.store.deleteUser(user.email, { userId: user.userId });
    // Once the canonical profile and indexes are gone, orphaned sessions can
    // no longer authenticate. Cleanup remains best-effort so a transient
    // secondary-table outage cannot report a failed deletion after the
    // irreversible account delete has already committed.
    const cleanup = await Promise.allSettled([
      this.store.deleteCode(user.email),
      this.store.deleteSessionsForUser(user.userId, user.email),
    ]);
    if (cleanup.some((result) => result.status === "rejected")) {
      console.error("post_commit_auth_artifact_cleanup_deferred");
    }
  }

  async prepareAccountDeletion(request: IncomingMessage): Promise<StoredUserProfile> {
    const user = await this.requireUser(request);
    const settled = settleEntitlement(user);
    if (entitlementIsActive(settled)) throw new AuthHttpError(409, "active_entitlement");
    if (settled.passReceipts.length > 0) {
      await this.store.retainLegalRecords(settled, legalRetentionUntil(settled, this.legalRecordRetentionYears));
    }
    return settled;
  }

  async updatePreferences(request: IncomingMessage, values: { languagePreference?: unknown; deliveryCountry?: unknown }): Promise<StoredUserProfile> {
    const user = await this.requireUser(request);
    if (values.languagePreference !== undefined && !isLanguagePreference(values.languagePreference)) {
      throw new AuthHttpError(400, "invalid_language_preference");
    }
    if (values.deliveryCountry !== undefined && !isDeliveryCountry(values.deliveryCountry)) {
      throw new AuthHttpError(400, "invalid_delivery_country");
    }

    return this.store.mutateUser(user.userId, (current) => reviseProfile(current, {
      languagePreference: values.languagePreference === undefined
        ? current.languagePreference
        : values.languagePreference as Lang,
      deliveryCountry: values.deliveryCountry === undefined
        ? current.deliveryCountry
        : values.deliveryCountry as DeliveryCountry,
    }));
  }

  async updateEmailAlerts(request: IncomingMessage, rawEnabled: unknown): Promise<StoredUserProfile> {
    const user = await this.requireUser(request);
    if (typeof rawEnabled !== "boolean") throw new AuthHttpError(400, "invalid_email_alert_preference");
    return this.store.mutateUser(user.userId, (current) => {
      if (current.emailAlertsEnabled === rawEnabled) return current;
      return reviseProfile(current, {
        emailAlertsEnabled: rawEnabled,
        emailAlertsTokenVersion: current.emailAlertsTokenVersion + 1,
      });
    });
  }

  async unsubscribeEmailAlerts(rawToken: unknown): Promise<void> {
    if (!this.unsubscribeSigningKey) throw new AuthHttpError(503, "unsubscribe_unavailable");
    const claims = verifyAlertUnsubscribeToken(this.unsubscribeSigningKey, rawToken);
    if (!claims) throw new AuthHttpError(400, "invalid_unsubscribe_token");
    const user = await this.store.getUserById(claims.userId);
    if (!user) return;
    try {
      await this.store.mutateUser(user.userId, (current) => {
        if (
          current.emailAlertsTokenVersion !== claims.tokenVersion
          || !current.emailAlertsEnabled
        ) return current;
        return reviseProfile(current, {
          emailAlertsEnabled: false,
          emailAlertsTokenVersion: current.emailAlertsTokenVersion + 1,
        });
      });
    } catch (error) {
      // Deletion can win the race after the point read. Treat an already-gone
      // account exactly like an already-consumed link to keep the endpoint
      // idempotent and avoid disclosing account state.
      if (error instanceof AuthHttpError && error.code === "profile_conflict") return;
      throw error;
    }
  }

  async logout(request: IncomingMessage): Promise<void> {
    const token = parseCookies(request)[this.cookieName];
    if (!token) return;
    await this.store.deleteSession(sessionHash(token));
  }
}

export function legalRetentionUntil(user: StoredUserProfile, years: 7 | 10): string {
  if (years !== 7 && years !== 10) throw new Error("Legal record retention must be exactly 7 or 10 years");
  const anchors = user.passReceipts.flatMap((receipt) => [
    receipt.purchasedAt,
    receipt.expiresAt,
    receipt.acceptedAt,
    receipt.purchaseConfirmationSentAt,
    receipt.withdrawalRequestedAt,
    receipt.withdrawalElectronicConfirmationAcceptedAt,
    receipt.withdrawalConfirmationSentAt,
  ]).filter((value): value is string => Boolean(value));
  const latestAnchor = anchors.reduce((latest, value) => {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) throw new Error("Legal record retention anchor is invalid");
    return Math.max(latest, timestamp);
  }, Number.NEGATIVE_INFINITY);
  if (!Number.isFinite(latestAnchor)) throw new Error("Legal record retention anchor is missing");
  const date = new Date(latestAnchor);
  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString();
}

function parseLegalRecordRetentionYears(value: string | undefined): 7 | 10 {
  const configured = value?.trim();
  if (!configured) return DEFAULT_LEGAL_RECORD_RETENTION_YEARS;
  if (configured === "7") return 7;
  if (configured === "10") return 10;
  throw new Error("LEGAL_RECORD_RETENTION_YEARS must be exactly 7 or 10");
}

export function authServiceFromEnvironment(): AuthService {
  return new AuthService({
    storageAccountUrl: process.env.AZURE_STORAGE_ACCOUNT_URL?.trim() || undefined,
    managedIdentityClientId: process.env.AZURE_CLIENT_ID?.trim() || undefined,
    usersTableName: process.env.AUTH_USERS_TABLE?.trim() || undefined,
    codesTableName: process.env.AUTH_CODES_TABLE?.trim() || undefined,
    sessionsTableName: process.env.AUTH_SESSIONS_TABLE?.trim() || undefined,
    alertRecipientsTableName: process.env.AUTH_ALERT_RECIPIENTS_TABLE?.trim() || undefined,
    emailEndpoint: process.env.AUTH_EMAIL_ENDPOINT?.trim() || process.env.ACS_ENDPOINT?.trim() || undefined,
    emailFrom: process.env.AUTH_EMAIL_FROM?.trim() || process.env.EMAIL_FROM?.trim() || undefined,
    emailReplyTo: process.env.AUTH_EMAIL_REPLY_TO?.trim() || undefined,
    unsubscribeSigningKey: process.env.EMAIL_UNSUBSCRIBE_SIGNING_KEY?.trim()
      || process.env.AUTH_EMAIL_UNSUBSCRIBE_SIGNING_KEY?.trim()
      || undefined,
    exposeDevCode: process.env.AUTH_EXPOSE_DEV_CODE?.trim().toLowerCase() === "true",
    codeTtlSeconds: parsePositiveInteger(process.env.AUTH_CODE_TTL_SECONDS, DEFAULT_CODE_TTL_SECONDS),
    codeResendSeconds: parsePositiveInteger(process.env.AUTH_CODE_RESEND_SECONDS, DEFAULT_RESEND_SECONDS),
    codeMaxAttempts: parsePositiveInteger(process.env.AUTH_CODE_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS),
    verificationCodePepper: process.env.AUTH_CODE_HMAC_PEPPER?.trim() || undefined,
    verificationCodePepperVersion: process.env.AUTH_CODE_HMAC_PEPPER_VERSION?.trim() || undefined,
    emailCodeBudgetPerHour: parsePositiveInteger(process.env.AUTH_EMAIL_CODE_BUDGET_PER_HOUR, DEFAULT_EMAIL_CODE_BUDGET_PER_HOUR),
    ipCodeBudgetPerHour: parsePositiveInteger(process.env.AUTH_IP_CODE_BUDGET_PER_HOUR, DEFAULT_IP_CODE_BUDGET_PER_HOUR),
    globalCodeBudgetPerHour: parsePositiveInteger(process.env.AUTH_GLOBAL_CODE_BUDGET_PER_HOUR, DEFAULT_GLOBAL_CODE_BUDGET_PER_HOUR),
    sessionTtlSeconds: parsePositiveInteger(process.env.AUTH_SESSION_TTL_SECONDS, DEFAULT_SESSION_TTL_SECONDS),
    legalRecordRetentionYears: parseLegalRecordRetentionYears(process.env.LEGAL_RECORD_RETENTION_YEARS),
    cookieName: process.env.AUTH_COOKIE_NAME?.trim() || DEFAULT_COOKIE_NAME,
  });
}

function reviseProfile(
  user: StoredUserProfile,
  changes: Partial<Omit<StoredUserProfile, "userId" | "profileRevision">>,
  updatedAt = nowIso(),
): StoredUserProfile {
  return {
    ...user,
    ...changes,
    profileRevision: user.profileRevision + 1,
    updatedAt,
  };
}

function settleEntitlement(user: StoredUserProfile, now = Date.now()): StoredUserProfile {
  if (user.passReceipts.length > 0) return recomputePassEntitlement(user, now);
  const expiresAt = user.entitlementExpiresAt ? Date.parse(user.entitlementExpiresAt) : NaN;
  if (
    user.entitlementStatus === "active"
    && Number.isFinite(expiresAt)
    && expiresAt <= now
  ) {
    return { ...user, entitlementStatus: "expired", updatedAt: nowIso(now) };
  }
  return user;
}

function seedLegacyPassReceipt(user: StoredUserProfile): PassReceipt[] {
  if (user.passReceipts.length > 0 || !entitlementIsActive(user)) return [...user.passReceipts];
  if (user.entitlementTier !== "alerts" && user.entitlementTier !== "radar") return [];
  const expiresAt = user.entitlementExpiresAt;
  if (!expiresAt) return [];
  return [{
    id: `legacy:${user.userId}:${Date.parse(expiresAt)}`,
    checkoutSessionId: null,
    kind: "legacy",
    tier: user.entitlementTier,
    baseReceiptId: null,
    purchasedAt: user.entitlementPurchasedAt ?? user.createdAt,
    expiresAt,
    amountEurCents: null,
    checkoutLocale: null,
    termsVersion: null,
    privacyVersion: null,
    acceptedAt: null,
    immediatePerformanceRequested: null,
    purchaseConfirmationSentAt: null,
    withdrawalConfirmationSentAt: null,
    withdrawalRequestedAt: null,
    withdrawalReference: null,
    withdrawalConsumerName: null,
    withdrawalElectronicConfirmationAcceptedAt: null,
    stripeRefundId: null,
    stripeRefundStatus: null,
    status: "active",
    paymentBrand: user.paymentBrand,
    paymentLast4: user.paymentLast4,
  }];
}

function activePassRoot(user: StoredUserProfile, now = Date.now()): PassReceipt | null {
  return user.passReceipts
    .filter((receipt) => (
      receipt.kind !== "upgrade"
      && receipt.status === "active"
      && Date.parse(receipt.expiresAt) > now
    ))
    .sort((left, right) => {
      const tierDifference = Number(right.tier === "radar") - Number(left.tier === "radar");
      if (tierDifference !== 0) return tierDifference;
      const expiryDifference = Date.parse(right.expiresAt) - Date.parse(left.expiresAt);
      if (expiryDifference !== 0) return expiryDifference;
      return Date.parse(right.purchasedAt) - Date.parse(left.purchasedAt);
    })[0] ?? null;
}

export function activePassBaseReceiptId(user: StoredUserProfile, now = Date.now()): string | null {
  const seeded = user.passReceipts.length > 0 ? user : { ...user, passReceipts: seedLegacyPassReceipt(user) };
  return activePassRoot(seeded, now)?.id ?? null;
}

function recomputePassEntitlement(user: StoredUserProfile, now = Date.now()): StoredUserProfile {
  const root = activePassRoot(user, now);
  if (!root) {
    const latest = [...user.passReceipts].sort(
      (left, right) => Date.parse(right.purchasedAt) - Date.parse(left.purchasedAt),
    )[0];
    const latestRoot = user.passReceipts
      .filter((receipt) => receipt.kind !== "upgrade")
      .sort((left, right) => Date.parse(right.purchasedAt) - Date.parse(left.purchasedAt))[0];
    const next: StoredUserProfile = {
      ...user,
      entitlementTier: "none",
      entitlementStatus: latestRoot?.status === "refunded" || latestRoot?.status === "revoked"
        ? latestRoot.status
        : "expired",
      entitlementExpiresAt: null,
      entitlementPurchasedAt: latest?.purchasedAt ?? user.entitlementPurchasedAt,
      paymentMethod: null,
      paymentBrand: null,
      paymentLast4: null,
    };
    return sameEntitlementSnapshot(user, next) ? user : next;
  }
  const upgrade = user.passReceipts
    .filter((receipt) => (
      receipt.kind === "upgrade"
      && receipt.baseReceiptId === root.id
      && receipt.status === "active"
      && Date.parse(receipt.expiresAt) > now
    ))
    .sort((left, right) => Date.parse(right.purchasedAt) - Date.parse(left.purchasedAt))[0] ?? null;
  const paymentReceipt = upgrade ?? root;
  const next: StoredUserProfile = {
    ...user,
    entitlementTier: root.tier === "radar" || upgrade ? "radar" : "alerts",
    entitlementStatus: "active",
    entitlementExpiresAt: root.expiresAt,
    entitlementPurchasedAt: paymentReceipt.purchasedAt,
    paymentMethod: paymentReceipt.paymentLast4 ? "card" : null,
    paymentBrand: paymentReceipt.paymentBrand,
    paymentLast4: paymentReceipt.paymentLast4,
  };
  return sameEntitlementSnapshot(user, next) ? user : next;
}

function sameEntitlementSnapshot(left: StoredUserProfile, right: StoredUserProfile): boolean {
  return left.entitlementTier === right.entitlementTier
    && left.entitlementStatus === right.entitlementStatus
    && left.entitlementExpiresAt === right.entitlementExpiresAt
    && left.entitlementPurchasedAt === right.entitlementPurchasedAt
    && left.paymentMethod === right.paymentMethod
    && left.paymentBrand === right.paymentBrand
    && left.paymentLast4 === right.paymentLast4;
}

function sanitizeStripeId(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9_]+$/.test(value.trim()) ? value.trim() : "";
}

function sanitizeReceiptId(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9:_-]{1,160}$/.test(value.trim())
    ? value.trim()
    : "";
}

function normalizeAndValidateEmail(value: unknown): string {
  const email = normalizeEmail(value);
  if (!isValidEmail(email)) throw new AuthHttpError(400, "invalid_email");
  return email;
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "unknown";
  const visibleLocal = local.length <= 2 ? `${local[0] ?? "*"}*` : `${local.slice(0, 2)}***`;
  return `${visibleLocal}@${domain}`;
}

export function verificationEmailMessage(
  senderAddress: string,
  recipientAddress: string,
  code: string,
  lang: Lang,
  replyToAddress?: string,
): EmailMessage {
  const localized = verificationCopy(lang, code);
  return {
    senderAddress,
    recipients: {
      to: [{ address: recipientAddress }],
    },
    content: {
      subject: localized.subject,
      plainText: localized.plainText,
      html: localized.html,
    },
    ...(replyToAddress ? { replyTo: [{ address: normalizeAndValidateEmail(replyToAddress) }] } : {}),
    disableUserEngagementTracking: true,
  };
}

export function purchaseConfirmationEmailMessage(
  senderAddress: string,
  recipientAddress: string,
  lang: Lang,
  details: PassConfirmationDetails,
  replyToAddress?: string,
): EmailMessage {
  const amount = formatEuro(details.amountEurCents, lang);
  const purchaseDate = formatEmailDate(details.purchasedAt, lang);
  const expiryDate = formatEmailDate(details.expiresAt, lang);
  const withdrawalDate = formatEmailDate(details.withdrawalDeadline, lang);
  const copy = purchaseConfirmationCopy(lang, {
    ...details,
    amount,
    purchaseDate,
    expiryDate,
    withdrawalDate,
  });
  const message = transactionalEmailMessage(
    senderAddress,
    recipientAddress,
    copy.subject,
    copy.plainText,
    transactionalHtml(lang, copy.title, copy.intro, copy.rows, copy.footer, details.withdrawalUrl),
    replyToAddress,
  );
  return {
    ...message,
    headers: {
      ...message.headers,
      "X-Airco-Delivery-Key": `purchase-${details.orderReference}`,
    },
  };
}

export function withdrawalConfirmationEmailMessage(
  senderAddress: string,
  recipientAddress: string,
  lang: Lang,
  details: WithdrawalConfirmationDetails,
  replyToAddress?: string,
): EmailMessage {
  const copy = withdrawalConfirmationCopy(lang, {
    ...details,
    amount: formatEuro(details.amountEurCents, lang),
    requestedDate: formatEmailDate(details.requestedAt, lang),
    refundedItemSummary: details.refundedItems.map((item) => {
      const label = lang === "nl"
        ? (item.kind === "upgrade" ? "Radar-upgrade" : "Pass")
        : lang === "fr"
          ? (item.kind === "upgrade" ? "Mise à niveau Radar" : "Pass")
          : lang === "zh"
            ? (item.kind === "upgrade" ? "近实时雷达升级" : "通行证")
            : (item.kind === "upgrade" ? "Radar upgrade" : "Pass");
      return `${label} ${item.orderReference}: ${formatEuro(item.amountEurCents, lang)}`;
    }).join("; "),
  });
  const message = transactionalEmailMessage(
    senderAddress,
    recipientAddress,
    copy.subject,
    copy.plainText,
    transactionalHtml(lang, copy.title, copy.intro, copy.rows, copy.footer),
    replyToAddress,
  );
  return {
    ...message,
    headers: {
      ...message.headers,
      "X-Airco-Delivery-Key": `withdrawal-${details.refundReference}`,
    },
  };
}

function transactionalEmailMessage(
  senderAddress: string,
  recipientAddress: string,
  subject: string,
  plainText: string,
  html: string,
  replyToAddress?: string,
): EmailMessage {
  return {
    senderAddress,
    recipients: { to: [{ address: recipientAddress }] },
    content: { subject, plainText, html },
    ...(replyToAddress ? { replyTo: [{ address: normalizeAndValidateEmail(replyToAddress) }] } : {}),
    disableUserEngagementTracking: true,
  };
}

type ConfirmationEmailCopy = {
  subject: string;
  title: string;
  intro: string;
  rows: Array<[string, string]>;
  footer: string;
  plainText: string;
};

function purchaseConfirmationCopy(
  lang: Lang,
  details: PassConfirmationDetails & {
    amount: string;
    purchaseDate: string;
    expiryDate: string;
    withdrawalDate: string;
  },
): ConfirmationEmailCopy {
  const immediate = details.immediatePerformanceRequested;
  const passName = localizedPassName(lang, details.tier);
  const service = localizedPassService(lang, details.tier);
  const vat = localizedVatStatement(lang, details.vatStatus, details.vatId);
  const appendix = purchaseLegalAppendix(lang, details, passName, service);
  if (lang === "nl") return {
    subject: "Bevestiging van je Airco Tracker-pass",
    title: "Je eenmalige pass is actief",
    intro: `Bedankt voor je aankoop bij ${details.operatorName}. Dit is een eenmalige betaling; er is geen automatische verlenging.`,
    rows: [["Bestelreferentie", details.orderReference], ["Product en dienst", `${passName} · 90 dagen · ${service}`], ["Totaalprijs", details.amount], ["Btw", vat], ["Aangekocht", details.purchaseDate], ["Toegang tot", details.expiryDate], ["Voorwaarden", `versie ${details.termsVersion} · ${details.termsUrl}`], ["Privacyverklaring", `versie ${details.privacyVersion} · ${details.privacyUrl}`], ["Directe uitvoering", immediate ? "Uitdrukkelijk verzocht" : "Niet verzocht"]],
    footer: appendix,
    plainText: `Je ${passName} is actief. Eenmalige betaling ${details.amount}; ${vat}; 90 dagen; geen automatische verlenging. Bestelreferentie: ${details.orderReference}. Dienst: ${service}. Geldig tot ${details.expiryDate}. Voorwaarden ${details.termsVersion}: ${details.termsUrl}. Privacy ${details.privacyVersion}: ${details.privacyUrl}. Je hebt ${immediate ? "wel" : "niet"} om directe uitvoering gevraagd.\n\n${appendix}`,
  };
  if (lang === "fr") return {
    subject: "Confirmation de votre pass Airco Tracker",
    title: "Votre pass à paiement unique est actif",
    intro: `Merci pour votre achat auprès de ${details.operatorName}. Il s’agit d’un paiement unique, sans renouvellement automatique.`,
    rows: [["Référence de commande", details.orderReference], ["Produit et service", `${passName} · 90 jours · ${service}`], ["Prix total", details.amount], ["TVA", vat], ["Acheté le", details.purchaseDate], ["Accès jusqu’au", details.expiryDate], ["Conditions", `version ${details.termsVersion} · ${details.termsUrl}`], ["Confidentialité", `version ${details.privacyVersion} · ${details.privacyUrl}`], ["Exécution immédiate", immediate ? "Expressément demandée" : "Non demandée"]],
    footer: appendix,
    plainText: `Votre ${passName} est actif. Paiement unique de ${details.amount}; ${vat}; 90 jours; aucun renouvellement automatique. Référence : ${details.orderReference}. Service : ${service}. Valable jusqu’au ${details.expiryDate}. Conditions ${details.termsVersion} : ${details.termsUrl}. Confidentialité ${details.privacyVersion} : ${details.privacyUrl}. Exécution immédiate ${immediate ? "demandée" : "non demandée"}.\n\n${appendix}`,
  };
  if (lang === "zh") return {
    subject: "Airco Tracker 通行证购买确认",
    title: "你的一次性通行证已生效",
    intro: `感谢向 ${details.operatorName} 购买。本次为一次性付款，不会自动续费。`,
    rows: [["订单编号", details.orderReference], ["产品与服务", `${passName} · 90 天 · ${service}`], ["总价", details.amount], ["增值税", vat], ["购买时间", details.purchaseDate], ["权益有效至", details.expiryDate], ["服务条款", `${details.termsVersion} 版 · ${details.termsUrl}`], ["隐私政策", `${details.privacyVersion} 版 · ${details.privacyUrl}`], ["立即履行", immediate ? "已明确请求" : "未请求"]],
    footer: appendix,
    plainText: `你的${passName}已生效。一次性付款 ${details.amount}；${vat}；有效 90 天；不自动续费。订单编号：${details.orderReference}。服务：${service}。有效至 ${details.expiryDate}。条款 ${details.termsVersion}：${details.termsUrl}。隐私 ${details.privacyVersion}：${details.privacyUrl}。${immediate ? "已" : "未"}请求立即履行。\n\n${appendix}`,
  };
  return {
    subject: "Your Airco Tracker pass confirmation",
    title: "Your one-time pass is active",
    intro: `Thank you for your purchase from ${details.operatorName}. This is a one-time payment with no automatic renewal.`,
    rows: [["Order reference", details.orderReference], ["Product and service", `${passName} · 90 days · ${service}`], ["Total price", details.amount], ["VAT", vat], ["Purchased", details.purchaseDate], ["Access until", details.expiryDate], ["Terms", `version ${details.termsVersion} · ${details.termsUrl}`], ["Privacy notice", `version ${details.privacyVersion} · ${details.privacyUrl}`], ["Immediate performance", immediate ? "Expressly requested" : "Not requested"]],
    footer: appendix,
    plainText: `Your ${passName} is active. One-time payment ${details.amount}; ${vat}; 90 days; no automatic renewal. Order reference: ${details.orderReference}. Service: ${service}. Access until ${details.expiryDate}. Terms ${details.termsVersion}: ${details.termsUrl}. Privacy ${details.privacyVersion}: ${details.privacyUrl}. Immediate performance ${immediate ? "requested" : "not requested"}.\n\n${appendix}`,
  };
}

function localizedPassName(lang: Lang, tier: Exclude<EntitlementTier, "none">): string {
  if (lang === "nl") return tier === "radar" ? "Hittegolf-radarpass" : "Hittegolf-meldingenpass";
  if (lang === "fr") return tier === "radar" ? "Pass Radar Canicule" : "Pass Alertes Canicule";
  if (lang === "zh") return tier === "radar" ? "热浪近实时雷达通行证" : "热浪库存提醒通行证";
  return tier === "radar" ? "Heatwave Radar Pass" : "Heatwave Alerts Pass";
}

function localizedPassService(lang: Lang, tier: Exclude<EntitlementTier, "none">): string {
  if (lang === "nl") return tier === "radar" ? "voorraadmeldingen per e-mail en bijna-realtime voorraadtoegang, normaal ongeveer elke 10 minuten ververst" : "voorraadmeldingen per e-mail";
  if (lang === "fr") return tier === "radar" ? "alertes de stock par e-mail et accès au stock en quasi-temps réel, normalement actualisé toutes les 10 minutes environ" : "alertes de stock par e-mail";
  if (lang === "zh") return tier === "radar" ? "库存上架邮件提醒及近实时库存访问，通常约每 10 分钟刷新" : "库存上架邮件提醒";
  return tier === "radar" ? "in-stock email alerts and near-real-time inventory access, normally refreshed about every 10 minutes" : "in-stock email alerts";
}

function localizedVatStatement(
  lang: Lang,
  status: "registered" | "not_registered",
  vatId: string | null,
): string {
  if (status === "not_registered") {
    if (lang === "nl") return "Geen btw in rekening gebracht; de exploitant is niet btw-geregistreerd.";
    if (lang === "fr") return "Aucune TVA facturée ; l’exploitant n’est pas immatriculé à la TVA.";
    if (lang === "zh") return "未收取增值税；运营者尚未登记增值税。";
    return "No VAT charged; the operator is not VAT-registered.";
  }
  const identifier = vatId ? ` (${vatId})` : "";
  if (lang === "nl") return `Btw inbegrepen in de totale prijs; btw-nummer${identifier}.`;
  if (lang === "fr") return `TVA comprise dans le prix total ; numéro de TVA${identifier}.`;
  if (lang === "zh") return `总价已包含增值税；增值税号${identifier}。`;
  return `VAT included in the total price; VAT ID${identifier}.`;
}

function purchaseLegalAppendix(
  lang: Lang,
  details: PassConfirmationDetails & { withdrawalDate: string; purchaseDate: string },
  passName: string,
  service: string,
): string {
  if (lang === "nl") return `Dienst en beperkingen: ${service}. Airco Tracker is geen verkoper en kan voorraad, prijs of levering door onafhankelijke winkels niet garanderen.\n\nHerroeping en vrijwillige terugbetaling: je kunt deze overeenkomst binnen 14 dagen volledig herroepen, ook als je om onmiddellijke uitvoering hebt gevraagd. Dien het verzoek uiterlijk ${details.withdrawalDate} in via ${details.withdrawalUrl} of ${details.withdrawalEmail}. Toegang wordt ingetrokken en het volledige bedrag wordt zonder onnodige vertraging en uiterlijk binnen 14 dagen via de oorspronkelijke betaalmethode terugbetaald.\n\nEU-modelformulier voor herroeping:\nAan: ${details.operatorName}, ${details.operatorAddress}, ${details.withdrawalEmail}\nHierbij deel ik mee dat ik mijn overeenkomst betreffende ${passName} (${details.orderReference}) herroep. Besteld op: ${details.purchaseDate}. Naam consument: _____. Adres consument: _____. Datum: _____. Handtekening (alleen op papier): _____.\n\nKlachten: ${details.contactEmail}. Nederlands recht is van toepassing zonder afbreuk te doen aan dwingende consumentenrechten in jouw woonland.`;
  if (lang === "fr") return `Service et limites : ${service}. Airco Tracker n’est pas vendeur et ne garantit ni le stock, ni le prix, ni la livraison proposés par les commerçants indépendants.\n\nRétractation et remboursement volontaire : vous pouvez vous rétracter intégralement dans les 14 jours, même après avoir demandé l’exécution immédiate. Envoyez votre demande avant le ${details.withdrawalDate} via ${details.withdrawalUrl} ou ${details.withdrawalEmail}. L’accès sera retiré et le montant intégral sera remboursé sans retard injustifié, au plus tard sous 14 jours, sur le moyen de paiement initial.\n\nFormulaire type UE de rétractation :\nÀ : ${details.operatorName}, ${details.operatorAddress}, ${details.withdrawalEmail}\nJe vous notifie par la présente ma rétractation du contrat portant sur ${passName} (${details.orderReference}). Commandé le : ${details.purchaseDate}. Nom du consommateur : _____. Adresse du consommateur : _____. Date : _____. Signature (uniquement sur papier) : _____.\n\nRéclamations : ${details.contactEmail}. Le droit néerlandais s’applique sans priver le consommateur des protections impératives de son pays de résidence.`;
  if (lang === "zh") return `服务与限制：${service}。Airco Tracker 并非商品卖家，无法保证独立零售商的库存、价格或配送。\n\n撤回与自愿退款：即使你已请求立即履行，仍可在 14 天内全额撤回。请在 ${details.withdrawalDate} 前通过 ${details.withdrawalUrl} 或 ${details.withdrawalEmail} 提交。权益会被撤销，全部款项将在不无故拖延且最迟 14 天内原路退回。\n\n欧盟示范撤回表：\n致：${details.operatorName}，${details.operatorAddress}，${details.withdrawalEmail}\n本人特此通知撤回关于${passName}（${details.orderReference}）的合同。订购日期：${details.purchaseDate}。消费者姓名：_____。消费者地址：_____。日期：_____。签名（仅纸质表格需要）：_____。\n\n投诉：${details.contactEmail}。适用荷兰法律，但不影响消费者居住国的强制性保护。`;
  return `Service and limitations: ${service}. Airco Tracker is not the retailer and cannot guarantee stock, price or delivery offered by independent merchants.\n\nWithdrawal and voluntary refund: you may withdraw in full within 14 days, even after requesting immediate performance. Submit by ${details.withdrawalDate} at ${details.withdrawalUrl} or ${details.withdrawalEmail}. Access will be revoked and the full amount returned without undue delay and no later than 14 days, using the original payment method.\n\nEU model withdrawal form:\nTo: ${details.operatorName}, ${details.operatorAddress}, ${details.withdrawalEmail}\nI hereby give notice that I withdraw from my contract for ${passName} (${details.orderReference}). Ordered on: ${details.purchaseDate}. Consumer name: _____. Consumer address: _____. Date: _____. Signature (paper form only): _____.\n\nComplaints: ${details.contactEmail}. Dutch law applies without depriving consumers of mandatory protections in their country of residence.`;
}

function withdrawalConfirmationCopy(
  lang: Lang,
  details: WithdrawalConfirmationDetails & { amount: string; requestedDate: string; refundedItemSummary: string },
): ConfirmationEmailCopy {
  if (lang === "nl") return confirmation(lang, "Je herroepingsverzoek is ontvangen", "Terugbetaling aangevraagd", `We hebben je online herroepingsverzoek ontvangen op ${details.requestedDate}.`, details, "Het recht op toegang is direct ingetrokken. Stripe verwerkt de terugbetaling naar je oorspronkelijke betaalmethode. Neem bij vragen contact op met");
  if (lang === "fr") return confirmation(lang, "Votre demande de rétractation est reçue", "Remboursement demandé", `Nous avons reçu votre demande de rétractation en ligne le ${details.requestedDate}.`, details, "Votre accès a été retiré immédiatement. Stripe renverra le remboursement vers le moyen de paiement initial. Pour toute question, contactez");
  if (lang === "zh") return confirmation(lang, "已收到你的撤回申请", "退款已申请", `我们已于 ${details.requestedDate} 收到你的在线撤回申请。`, details, "相关权益已立即撤销。Stripe 会把款项退回原支付方式。如有问题请联系");
  return confirmation(lang, "We received your withdrawal request", "Refund requested", `We received your online withdrawal request on ${details.requestedDate}.`, details, "Access was revoked immediately. Stripe will return the refund to the original payment method. Questions can be sent to");
}

function confirmation(
  lang: Lang,
  subject: string,
  title: string,
  intro: string,
  details: WithdrawalConfirmationDetails & { amount: string; refundedItemSummary: string },
  footerPrefix: string,
): ConfirmationEmailCopy {
  const labels = lang === "nl"
    ? ["Bestelling", "Herroeping", "Naam consument", "Bevestiging verzonden aan", "Terugbetaalde onderdelen", "Totale terugbetaling", "Stripe-status"]
    : lang === "fr"
      ? ["Commande", "Rétractation", "Nom du consommateur", "Confirmation envoyée à", "Éléments remboursés", "Remboursement total", "Statut Stripe"]
      : lang === "zh"
        ? ["订单", "撤回编号", "消费者姓名", "确认邮件收件地址", "退款项目", "退款总额", "Stripe 状态"]
        : ["Order", "Withdrawal", "Consumer name", "Confirmation sent to", "Refunded items", "Total refund", "Stripe status"];
  const rows: Array<[string, string]> = [
    [labels[0]!, details.orderReference],
    [labels[1]!, details.refundReference],
    [labels[2]!, details.consumerName],
    [labels[3]!, details.confirmationEmail],
    [labels[4]!, details.refundedItemSummary],
    [labels[5]!, details.amount],
    [labels[6]!, localizedRefundStatus(lang, details.status)],
  ];
  return {
    subject,
    title,
    intro,
    rows,
    footer: `${footerPrefix} ${details.contactEmail}. ${details.operatorName}.`,
    plainText: `${intro} ${rows.map(([label, value]) => `${label}: ${value}`).join(". ")}. ${footerPrefix} ${details.contactEmail}.`,
  };
}

function localizedRefundStatus(lang: Lang, status: string): string {
  const labels: Record<string, Record<Lang, string>> = {
    succeeded: { en: "Completed", nl: "Voltooid", fr: "Effectué", zh: "已完成" },
    pending: { en: "Pending", nl: "In behandeling", fr: "En attente", zh: "处理中" },
    failed: { en: "Failed", nl: "Mislukt", fr: "Échec", zh: "失败" },
    canceled: { en: "Cancelled", nl: "Geannuleerd", fr: "Annulé", zh: "已取消" },
    requires_action: { en: "Action required", nl: "Actie vereist", fr: "Action requise", zh: "需要操作" },
  };
  return labels[status]?.[lang]
    ?? ({ en: "Status unavailable", nl: "Status niet beschikbaar", fr: "Statut indisponible", zh: "状态暂不可用" } as const)[lang];
}

function transactionalHtml(
  lang: Lang,
  title: string,
  intro: string,
  rows: Array<[string, string]>,
  footer: string,
  actionUrl?: string,
): string {
  const rowsHtml = rows.map(([label, value]) => `<tr><th style="padding:8px 12px;text-align:left;color:#567080;font-size:13px;">${escapeHtml(label)}</th><td style="padding:8px 12px;color:#10293f;font-weight:650;word-break:break-word;">${escapeHtml(value)}</td></tr>`).join("");
  const actionLabel = lang === "nl"
    ? "Herroepen / terugbetaling"
    : lang === "fr"
      ? "Rétractation / remboursement"
      : lang === "zh"
        ? "撤回 / 退款"
        : "Withdrawal / refund";
  const action = actionUrl ? `<p style="margin:22px 0 0;"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:12px 18px;border-radius:14px;color:#fff;background:#075b8d;text-decoration:none;font-weight:750;">${escapeHtml(actionLabel)}</a></p>` : "";
  return `<!doctype html><html lang="${escapeHtml(lang)}"><head><meta charset="utf-8"></head><body style="margin:0;padding:24px;background:#eef8fb;font-family:Inter,Segoe UI,Arial,sans-serif;color:#12283a;"><div style="max-width:620px;margin:0 auto;padding:28px;border-radius:24px;background:#fff;box-shadow:0 18px 60px rgba(31,79,105,.12);"><p style="margin:0 0 10px;color:#0d83bd;font-weight:700;">Airco Tracker</p><h1 style="margin:0 0 12px;font-size:26px;letter-spacing:-.04em;">${escapeHtml(title)}</h1><p style="line-height:1.6;color:#526475;">${escapeHtml(intro)}</p><table style="width:100%;margin-top:18px;border-collapse:collapse;background:#f5fbfd;border-radius:16px;">${rowsHtml}</table>${action}<p style="margin:22px 0 0;color:#6f8796;font-size:13px;line-height:1.6;white-space:pre-line;">${escapeHtml(footer)}</p></div></body></html>`;
}

function formatEuro(cents: number, lang: Lang): string {
  return new Intl.NumberFormat(lang === "zh" ? "zh-CN" : lang === "nl" ? "nl-NL" : lang === "fr" ? "fr-FR" : "en-GB", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function formatEmailDate(value: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : lang === "nl" ? "nl-NL" : lang === "fr" ? "fr-FR" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Amsterdam" }).format(new Date(value));
}

function verificationCopy(lang: Lang, code: string): { subject: string; plainText: string; html: string } {
  if (lang === "nl") {
    return {
      subject: "Je Airco Tracker verificatiecode",
      plainText: `Je Airco Tracker verificatiecode is ${code}. Deze code verloopt over 10 minuten.\n\nHeb je deze code niet aangevraagd? Dan kun je deze e-mail negeren.`,
      html: verificationHtml(
        "nl",
        "Je verificatiecode",
        "Gebruik deze code om in te loggen bij Airco Tracker. De code verloopt over 10 minuten.",
        code,
        "Heb je deze code niet aangevraagd? Dan kun je deze e-mail negeren.",
      ),
    };
  }
  if (lang === "en") {
    return {
      subject: "Your Airco Tracker verification code",
      plainText: `Your Airco Tracker verification code is ${code}. This code expires in 10 minutes.\n\nIf you did not request this code, you can ignore this email.`,
      html: verificationHtml(
        "en",
        "Your verification code",
        "Use this code to sign in to Airco Tracker. It expires in 10 minutes.",
        code,
        "If you did not request this code, you can ignore this email.",
      ),
    };
  }
  if (lang === "fr") {
    return {
      subject: "Votre code de vérification Airco Tracker",
      plainText: `Votre code de vérification Airco Tracker est ${code}. Ce code expire dans 10 minutes.\n\nSi vous n’avez pas demandé ce code, vous pouvez ignorer cet e-mail.`,
      html: verificationHtml(
        "fr",
        "Votre code de vérification",
        "Utilisez ce code pour vous connecter à Airco Tracker. Il expire dans 10 minutes.",
        code,
        "Si vous n’avez pas demandé ce code, vous pouvez ignorer cet e-mail.",
      ),
    };
  }
  return {
    subject: "你的 Airco Tracker 验证码",
    plainText: `你的 Airco Tracker 验证码是 ${code}。验证码 10 分钟内有效。\n\n如果你没有请求此验证码，可以忽略这封邮件。`,
    html: verificationHtml(
      "zh-CN",
      "你的验证码",
      "请使用下方验证码登录 Airco Tracker。验证码 10 分钟内有效。",
      code,
      "如果你没有请求此验证码，可以忽略这封邮件。",
    ),
  };
}

function verificationHtml(lang: string, title: string, body: string, code: string, footer: string): string {
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
  <head><meta charset="utf-8"></head>
  <body style="margin:0;padding:24px;background:#eef8fb;font-family:Inter,Segoe UI,Arial,sans-serif;color:#12283a;">
    <div style="max-width:520px;margin:0 auto;padding:28px;border-radius:24px;background:#ffffff;box-shadow:0 18px 60px rgba(31,79,105,.12);">
      <p style="margin:0 0 10px;color:#0d83bd;font-weight:700;">Airco Tracker</p>
      <h1 style="margin:0 0 12px;font-size:26px;letter-spacing:-.04em;">${escapeHtml(title)}</h1>
      <p style="margin:0 0 22px;line-height:1.6;color:#526475;">${escapeHtml(body)}</p>
      <div style="padding:18px 22px;border-radius:18px;background:#e7f9fd;color:#10293f;font-size:32px;font-weight:800;letter-spacing:.18em;text-align:center;">${escapeHtml(code)}</div>
      <p style="margin:22px 0 0;color:#7b93a2;font-size:13px;line-height:1.5;">${escapeHtml(footer)}</p>
    </div>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
