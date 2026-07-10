import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  TableClient,
  type TableEntityResult,
  type TransactionAction,
} from "@azure/data-tables";
import { EmailClient, type EmailMessage } from "@azure/communication-email";
import { DefaultAzureCredential } from "@azure/identity";
import {
  isSubscriptionPlan,
  isDeliveryCountry,
  isLanguagePreference,
  isPaidSubscriptionPlan,
  isPaymentMethod,
  isSubscriptionStatus,
  isValidEmail,
  hasEmailAlertAccess,
  normalizeEmail,
  SUBSCRIPTION_PLAN_DETAILS,
  subscriptionChangeDirection,
  subscriptionIsActive,
  validateNickname,
  type DeliveryCountry,
  type PaidSubscriptionPlan,
  type PaymentMethod,
  type SubscriptionPlan,
  type SubscriptionStatus,
  type UserProfile,
} from "../shared/auth.js";
import type { Lang } from "../shared/i18n.js";

type AuthCodeRecord = {
  email: string;
  codeHash: string;
  salt: string;
  expiresAt: string;
  attempts: number;
  lastSentAt: string;
  createdAt: string;
};

type StoredAuthCodeRecord = AuthCodeRecord & {
  etag: string;
};

type SessionRecord = {
  sessionHash: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  lastSeenAt: string;
};

type AuthStore = {
  getUser(email: string): Promise<StoredUserProfile | null>;
  getUserByStripeCustomerId(stripeCustomerId: string): Promise<StoredUserProfile | null>;
  upsertUser(user: StoredUserProfile): Promise<StoredUserProfile>;
  mutateUser(userId: string, mutation: (current: StoredUserProfile) => StoredUserProfile): Promise<StoredUserProfile>;
  changeUserEmail(user: StoredUserProfile, newEmail: string): Promise<StoredUserProfile>;
  deleteUser(email: string, options?: { userId?: string; deleteProjection?: boolean }): Promise<void>;
  getCode(email: string): Promise<StoredAuthCodeRecord | null>;
  putCode(record: AuthCodeRecord, expectedEtag: string | null): Promise<StoredAuthCodeRecord>;
  deleteCode(email: string, expectedEtag?: string): Promise<void>;
  getSession(sessionHash: string): Promise<SessionRecord | null>;
  upsertSession(record: SessionRecord): Promise<void>;
  deleteSession(sessionHash: string): Promise<void>;
  deleteSessionsForEmail(email: string): Promise<void>;
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
  exposeDevCode?: boolean;
  codeTtlSeconds?: number;
  codeResendSeconds?: number;
  codeMaxAttempts?: number;
  sessionTtlSeconds?: number;
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
};

export type RequestCodeResult = {
  ok: true;
  retryAfterSeconds: number;
  devCode?: string;
};

type PreviewPaymentDetails = {
  paymentBrand: string | null;
  paymentLast4: string | null;
};

export type StripeSubscriptionSnapshot = {
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  plan: PaidSubscriptionPlan | null;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  paymentBrand: string | null;
  paymentLast4: string | null;
};

const USER_PARTITION = "user";
const CODE_PARTITION = "auth-code";
const SESSION_PARTITION = "auth-session";
const DEFAULT_CODE_TTL_SECONDS = 10 * 60;
const DEFAULT_RESEND_SECONDS = 60;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_COOKIE_NAME = "airco_session";
const ALERT_RECIPIENT_SHARD_COUNT = 32;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_ROW_PREFIX = "id:";
const EMAIL_INDEX_PREFIX = "email:";
const STRIPE_INDEX_PREFIX = "stripe:";

export const AUTH_SUBSCRIPTION_PLAN_DEFAULT: SubscriptionPlan = "none";
export const AUTH_SUBSCRIPTION_STATUS_DEFAULT: SubscriptionStatus = "none";
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

export function createVerificationHash(email: string, code: string, salt: string): string {
  return sha256(`${normalizeEmail(email)}\n${code}\n${salt}`);
}

export function verifyVerificationHash(email: string, code: string, salt: string, expectedHash: string): boolean {
  const actual = Buffer.from(createVerificationHash(email, code, salt), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
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
  subscriptionPlan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodEnd: string;
  enabled: boolean;
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
    subscriptionPlan: user.subscriptionPlan,
    status: user.subscriptionStatus,
    currentPeriodEnd: user.subscriptionCurrentPeriodEnd ?? "",
    enabled: hasEmailAlertAccess(user, now),
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
      subscriptionPlan: "none",
      status: "none",
      currentPeriodEnd: "",
      enabled: false,
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

function sameAlertRecipientPayload(
  left: AlertRecipientEntity,
  right: AlertRecipientEntity,
): boolean {
  return left.partitionKey === right.partitionKey
    && left.rowKey === right.rowKey
    && left.email === right.email
    && left.language === right.language
    && left.deliveryCountry === right.deliveryCountry
    && left.subscriptionPlan === right.subscriptionPlan
    && left.status === right.status
    && left.currentPeriodEnd === right.currentPeriodEnd
    && Boolean(left.enabled) === Boolean(right.enabled)
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
      await this.recipients.upsert(desired);
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

  async deleteUser(email: string, options: { userId?: string; deleteProjection?: boolean } = {}): Promise<void> {
    const userId = options.userId || (await this.getUser(email))?.userId;
    if (!userId) return;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const activeEntity = await this.activeEntityByUserId(userId);
      if (!activeEntity) return;
      const current = userFromEntity(activeEntity);
      if (subscriptionIsActive(settleSubscription(current))) {
        throw new AuthHttpError(409, "active_subscription");
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

      if (options.deleteProjection !== false) await this.recipients.suppress(userId, deletionRevision);
      await Promise.all([
        this.cleanupDeletedCanonical(userId),
        ...(emailIndex ? [this.cleanupInactiveIndex(String(emailIndex.rowKey))] : []),
        // Keep the non-PII Stripe tombstone so delayed signed webhooks remain O(1)
        // and cannot accidentally bind the retired customer ID to another user.
      ]);
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

  async deleteSessionsForEmail(email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    const entities = this.sessions.listEntities<SessionEntity>({
      queryOptions: { filter: `PartitionKey eq '${SESSION_PARTITION}'` },
    });
    for await (const entity of entities) {
      if (normalizeEmail(entity.email) !== normalized) continue;
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
  private readonly codes = new Map<string, StoredAuthCodeRecord>();
  private readonly sessions = new Map<string, SessionRecord>();
  private codeVersion = 0;

  async getUser(email: string): Promise<StoredUserProfile | null> {
    const user = this.users.get(email);
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
      profileRevision: current.profileRevision + 1,
      updatedAt: nowIso(),
    };
    this.users.delete(current.email);
    this.users.set(normalizedEmail, updated);
    await this.updateSessionsEmail(current.email, normalizedEmail);
    return { ...updated };
  }

  async deleteUser(email: string, options: { userId?: string; deleteProjection?: boolean } = {}): Promise<void> {
    const current = options.userId
      ? [...this.users.values()].find((user) => user.userId === options.userId)
      : this.users.get(email);
    if (current && subscriptionIsActive(settleSubscription(current))) {
      throw new AuthHttpError(409, "active_subscription");
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

  async deleteSessionsForEmail(email: string): Promise<void> {
    const normalized = normalizeEmail(email);
    for (const [hash, session] of this.sessions) {
      if (normalizeEmail(session.email) === normalized) this.sessions.delete(hash);
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

type CodeEntity = AuthCodeRecord;
type SessionEntity = SessionRecord;

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
    subscriptionPlan: user.subscriptionPlan,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd ?? "",
    subscriptionCancelAtPeriodEnd: user.subscriptionCancelAtPeriodEnd,
    pendingSubscriptionPlan: user.pendingSubscriptionPlan ?? "",
    pendingSubscriptionEffectiveAt: user.pendingSubscriptionEffectiveAt ?? "",
    paymentMethod: user.paymentMethod ?? "",
    paymentBrand: user.paymentBrand ?? "",
    paymentLast4: user.paymentLast4 ?? "",
    stripeCustomerId: user.stripeCustomerId ?? "",
    stripeSubscriptionId: user.stripeSubscriptionId ?? "",
    languagePreference: user.languagePreference,
    deliveryCountry: user.deliveryCountry,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
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

function userFromEntity(entity: TableEntityResult<UserEntity>): StoredUserProfile {
  const subscriptionPlan = isSubscriptionPlan(entity.subscriptionPlan) ? entity.subscriptionPlan : AUTH_SUBSCRIPTION_PLAN_DEFAULT;
  const subscriptionStatus = isSubscriptionStatus(entity.subscriptionStatus) ? entity.subscriptionStatus : AUTH_SUBSCRIPTION_STATUS_DEFAULT;
  const pendingSubscriptionPlan = isPaidSubscriptionPlan(entity.pendingSubscriptionPlan) ? entity.pendingSubscriptionPlan : null;
  const paymentMethod = isPaymentMethod(entity.paymentMethod) ? entity.paymentMethod : null;
  const languagePreference = isLanguagePreference(entity.languagePreference) ? entity.languagePreference : AUTH_LANGUAGE_DEFAULT;
  const deliveryCountry = isDeliveryCountry(entity.deliveryCountry) ? entity.deliveryCountry : AUTH_DELIVERY_COUNTRY_DEFAULT;
  return {
    userId: normalizeUserId(entity.userId, entity.email),
    profileRevision: normalizeProfileRevision(entity.profileRevision),
    email: normalizeEmail(entity.email),
    nickname: typeof entity.nickname === "string" && entity.nickname.trim() ? entity.nickname.trim() : null,
    subscriptionPlan,
    subscriptionStatus,
    subscriptionCurrentPeriodEnd: typeof entity.subscriptionCurrentPeriodEnd === "string" && entity.subscriptionCurrentPeriodEnd.trim()
      ? entity.subscriptionCurrentPeriodEnd.trim()
      : null,
    subscriptionCancelAtPeriodEnd: Boolean(entity.subscriptionCancelAtPeriodEnd),
    pendingSubscriptionPlan,
    pendingSubscriptionEffectiveAt: typeof entity.pendingSubscriptionEffectiveAt === "string" && entity.pendingSubscriptionEffectiveAt.trim()
      ? entity.pendingSubscriptionEffectiveAt.trim()
      : null,
    paymentMethod,
    paymentBrand: typeof entity.paymentBrand === "string" && entity.paymentBrand.trim() ? entity.paymentBrand.trim() : null,
    paymentLast4: typeof entity.paymentLast4 === "string" && /^\d{4}$/.test(entity.paymentLast4) ? entity.paymentLast4 : null,
    stripeCustomerId: typeof entity.stripeCustomerId === "string" && entity.stripeCustomerId.trim() ? entity.stripeCustomerId.trim() : null,
    stripeSubscriptionId: typeof entity.stripeSubscriptionId === "string" && entity.stripeSubscriptionId.trim() ? entity.stripeSubscriptionId.trim() : null,
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
    && left.subscriptionPlan === right.subscriptionPlan
    && left.subscriptionStatus === right.subscriptionStatus
    && left.subscriptionCurrentPeriodEnd === right.subscriptionCurrentPeriodEnd
    && left.subscriptionCancelAtPeriodEnd === right.subscriptionCancelAtPeriodEnd
    && left.pendingSubscriptionPlan === right.pendingSubscriptionPlan
    && left.pendingSubscriptionEffectiveAt === right.pendingSubscriptionEffectiveAt
    && left.paymentMethod === right.paymentMethod
    && left.paymentBrand === right.paymentBrand
    && left.paymentLast4 === right.paymentLast4
    && left.stripeCustomerId === right.stripeCustomerId
    && left.stripeSubscriptionId === right.stripeSubscriptionId
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
    ...record,
  };
}

function sessionFromEntity(entity: TableEntityResult<SessionEntity>): SessionRecord {
  return {
    sessionHash: String(entity.sessionHash),
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
    const message = verificationEmailMessage(this.senderAddress, email, code, lang);
    const poller = await client.beginSend(message, { updateIntervalInMs: 1_000 });
    const result = await poller.pollUntilDone();
    if (result.status === "Failed") {
      throw new Error(result.error?.message || "ACS email send failed");
    }
    return {};
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
  private readonly sessionTtlSeconds: number;

  constructor(options: AuthServiceOptions = {}) {
    this.cookieName = options.cookieName || DEFAULT_COOKIE_NAME;
    this.codeTtlSeconds = options.codeTtlSeconds ?? DEFAULT_CODE_TTL_SECONDS;
    this.codeResendSeconds = options.codeResendSeconds ?? DEFAULT_RESEND_SECONDS;
    this.codeMaxAttempts = options.codeMaxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.sessionTtlSeconds = options.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS;

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
      options.managedIdentityClientId,
      Boolean(options.exposeDevCode),
    );
  }

  async requestCode(rawEmail: unknown, lang: Lang): Promise<RequestCodeResult> {
    const email = normalizeAndValidateEmail(rawEmail);
    return this.issueCode(email, lang);
  }

  async requestEmailChangeCode(request: IncomingMessage, rawEmail: unknown, lang: Lang): Promise<RequestCodeResult> {
    const user = await this.requireUser(request);
    const email = normalizeAndValidateEmail(rawEmail);
    if (email === user.email) throw new AuthHttpError(400, "email_unchanged");
    const existing = await this.store.getUser(email);
    if (existing) throw new AuthHttpError(409, "email_taken");
    return this.issueCode(email, lang);
  }

  private async issueCode(email: string, lang: Lang): Promise<RequestCodeResult> {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const existing = await this.store.getCode(email);
      if (existing && !isExpired(existing.expiresAt)) {
        const nextAllowedAt = Date.parse(existing.lastSentAt) + this.codeResendSeconds * 1000;
        const waitMs = nextAllowedAt - Date.now();
        if (waitMs > 0) {
          throw new AuthHttpError(429, "code_recently_sent", Math.ceil(waitMs / 1000));
        }
      }

      const code = generateVerificationCode();
      const salt = randomSalt();
      const sentAt = nowIso();
      const record: AuthCodeRecord = {
        email,
        codeHash: createVerificationHash(email, code, salt),
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
      subscriptionPlan: AUTH_SUBSCRIPTION_PLAN_DEFAULT,
      subscriptionStatus: AUTH_SUBSCRIPTION_STATUS_DEFAULT,
      subscriptionCurrentPeriodEnd: null,
      subscriptionCancelAtPeriodEnd: false,
      pendingSubscriptionPlan: null,
      pendingSubscriptionEffectiveAt: null,
      paymentMethod: null,
      paymentBrand: null,
      paymentLast4: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      languagePreference: isLanguagePreference(lang) ? lang : AUTH_LANGUAGE_DEFAULT,
      deliveryCountry: AUTH_DELIVERY_COUNTRY_DEFAULT,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (!existingUser) user = await this.store.upsertUser(user);

    const sessionToken = randomSessionToken();
    const session: SessionRecord = {
      sessionHash: sessionHash(sessionToken),
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
      if (!verifyVerificationHash(email, code, stored.salt, stored.codeHash)) {
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
    const user = await this.store.getUser(session.email);
    if (!user) {
      await this.store.deleteSession(hash);
      return null;
    }
    const settled = settleSubscription(user);
    const current = settled !== user
      ? await this.store.mutateUser(user.userId, (fresh) => {
          const next = settleSubscription(fresh);
          return next === fresh ? fresh : { ...next, profileRevision: fresh.profileRevision + 1 };
        })
      : user;
    await this.store.upsertSession({ ...session, lastSeenAt: nowIso() });
    return current;
  }

  async requireUser(request: IncomingMessage): Promise<StoredUserProfile> {
    const user = await this.currentUser(request);
    if (!user) throw new AuthHttpError(401, "not_authenticated");
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

  async applyStripeSubscriptionSnapshot(snapshot: StripeSubscriptionSnapshot): Promise<StoredUserProfile | null> {
    const user = await this.findUserByStripeCustomerId(snapshot.stripeCustomerId);
    if (!user) return null;

    const stripeCustomerId = sanitizeStripeId(snapshot.stripeCustomerId);
    const stripeSubscriptionId = snapshot.stripeSubscriptionId ? sanitizeStripeId(snapshot.stripeSubscriptionId) : null;
    return this.store.mutateUser(user.userId, (current) => {
      const timestamp = nowIso();
      const hasActiveEntitlement = Boolean(
        snapshot.plan
        && (snapshot.status === "active" || snapshot.status === "canceled")
        && snapshot.currentPeriodEnd
        && Date.parse(snapshot.currentPeriodEnd) > Date.now(),
      );
      const preservePendingSubscription = Boolean(
        hasActiveEntitlement
        && current.pendingSubscriptionPlan
        && current.pendingSubscriptionEffectiveAt
        && snapshot.plan === current.subscriptionPlan
        && snapshot.currentPeriodEnd
        && Date.parse(current.pendingSubscriptionEffectiveAt) === Date.parse(snapshot.currentPeriodEnd),
      );
      return hasActiveEntitlement && snapshot.plan
        ? reviseProfile(current, {
            subscriptionPlan: snapshot.plan,
            subscriptionStatus: snapshot.cancelAtPeriodEnd ? "canceled" : "active",
            subscriptionCurrentPeriodEnd: snapshot.currentPeriodEnd,
            subscriptionCancelAtPeriodEnd: snapshot.cancelAtPeriodEnd,
            pendingSubscriptionPlan: preservePendingSubscription ? current.pendingSubscriptionPlan : null,
            pendingSubscriptionEffectiveAt: preservePendingSubscription ? current.pendingSubscriptionEffectiveAt : null,
            paymentMethod: "card",
            paymentBrand: snapshot.paymentBrand,
            paymentLast4: snapshot.paymentLast4,
            stripeCustomerId,
            stripeSubscriptionId,
          }, timestamp)
        : reviseProfile(current, {
            subscriptionPlan: "none",
            subscriptionStatus: "none",
            subscriptionCurrentPeriodEnd: null,
            subscriptionCancelAtPeriodEnd: false,
            pendingSubscriptionPlan: null,
            pendingSubscriptionEffectiveAt: null,
            stripeCustomerId,
            stripeSubscriptionId,
          }, timestamp);
    });
  }

  async schedulePendingSubscriptionChange(request: IncomingMessage, plan: PaidSubscriptionPlan, effectiveAt: string): Promise<StoredUserProfile> {
    const user = await this.requireUser(request);
    if (!subscriptionIsActive(user)) throw new AuthHttpError(400, "no_active_subscription");
    return this.store.mutateUser(user.userId, (current) => {
      if (!subscriptionIsActive(current)) throw new AuthHttpError(400, "no_active_subscription");
      return reviseProfile(current, {
        pendingSubscriptionPlan: plan,
        pendingSubscriptionEffectiveAt: effectiveAt,
        subscriptionCancelAtPeriodEnd: false,
      });
    });
  }

  async completePreviewSubscriptionPayment(request: IncomingMessage, values: { plan?: unknown; paymentMethod?: unknown; paymentBrand?: unknown; paymentLast4?: unknown; idealBank?: unknown }): Promise<StoredUserProfile> {
    const user = await this.requireUser(request);
    if (!isPaidSubscriptionPlan(values.plan)) throw new AuthHttpError(400, "invalid_subscription_plan");
    if (!isPaymentMethod(values.paymentMethod)) throw new AuthHttpError(400, "invalid_payment_method");

    return this.store.mutateUser(user.userId, (current) => changeSubscription(
      current,
      values.plan as PaidSubscriptionPlan,
      values.paymentMethod as PaymentMethod,
      sanitizePaymentDetails(values.paymentMethod as PaymentMethod, values),
    ));
  }

  async cancelSubscription(request: IncomingMessage): Promise<StoredUserProfile> {
    const user = await this.requireUser(request);
    if (!isPaidSubscriptionPlan(user.subscriptionPlan) || !user.subscriptionCurrentPeriodEnd) {
      throw new AuthHttpError(400, "no_active_subscription");
    }
    return this.store.mutateUser(user.userId, (current) => {
      if (!isPaidSubscriptionPlan(current.subscriptionPlan) || !current.subscriptionCurrentPeriodEnd) {
        throw new AuthHttpError(400, "no_active_subscription");
      }
      return reviseProfile(current, {
        subscriptionStatus: "canceled",
        subscriptionCancelAtPeriodEnd: true,
        pendingSubscriptionPlan: null,
        pendingSubscriptionEffectiveAt: null,
      });
    });
  }

  async deleteAccount(request: IncomingMessage): Promise<void> {
    const user = await this.requireUser(request);
    const settled = settleSubscription(user);
    if (subscriptionIsActive(settled)) throw new AuthHttpError(409, "active_subscription");
    await this.store.deleteUser(user.email, { userId: user.userId });
    await this.store.deleteCode(user.email);
    await this.store.deleteSessionsForEmail(user.email);
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

  async logout(request: IncomingMessage): Promise<void> {
    const token = parseCookies(request)[this.cookieName];
    if (!token) return;
    await this.store.deleteSession(sessionHash(token));
  }
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
    exposeDevCode: process.env.AUTH_EXPOSE_DEV_CODE?.trim().toLowerCase() === "true",
    codeTtlSeconds: parsePositiveInteger(process.env.AUTH_CODE_TTL_SECONDS, DEFAULT_CODE_TTL_SECONDS),
    codeResendSeconds: parsePositiveInteger(process.env.AUTH_CODE_RESEND_SECONDS, DEFAULT_RESEND_SECONDS),
    codeMaxAttempts: parsePositiveInteger(process.env.AUTH_CODE_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS),
    sessionTtlSeconds: parsePositiveInteger(process.env.AUTH_SESSION_TTL_SECONDS, DEFAULT_SESSION_TTL_SECONDS),
    cookieName: process.env.AUTH_COOKIE_NAME?.trim() || DEFAULT_COOKIE_NAME,
  });
}

function reviseProfile(
  user: StoredUserProfile,
  changes: Partial<UserProfile>,
  updatedAt = nowIso(),
): StoredUserProfile {
  return {
    ...user,
    ...changes,
    profileRevision: user.profileRevision + 1,
    updatedAt,
  };
}

function changeSubscription(user: StoredUserProfile, plan: PaidSubscriptionPlan, paymentMethod: PaymentMethod, paymentDetails: PreviewPaymentDetails): StoredUserProfile {
  const settled = settleSubscription(user);
  if (subscriptionIsActive(settled)) {
    const direction = subscriptionChangeDirection(settled.subscriptionPlan, plan);
    if (direction === "downgrade") {
      return reviseProfile(user, {
        ...settled,
        pendingSubscriptionPlan: plan,
        pendingSubscriptionEffectiveAt: settled.subscriptionCurrentPeriodEnd,
        subscriptionCancelAtPeriodEnd: false,
        paymentMethod,
        paymentBrand: paymentDetails.paymentBrand,
        paymentLast4: paymentDetails.paymentLast4,
      });
    }
  }
  return activateSubscription(user, plan, Date.now(), paymentMethod, paymentDetails);
}

function activateSubscription(
  user: StoredUserProfile,
  plan: PaidSubscriptionPlan,
  startsAt = Date.now(),
  paymentMethod: PaymentMethod | null = user.paymentMethod,
  paymentDetails: PreviewPaymentDetails = { paymentBrand: user.paymentBrand, paymentLast4: user.paymentLast4 },
): StoredUserProfile {
  const details = SUBSCRIPTION_PLAN_DETAILS[plan];
  return reviseProfile(user, {
    subscriptionPlan: plan,
    subscriptionStatus: "active",
    subscriptionCurrentPeriodEnd: nowIso(startsAt + details.intervalDays * 24 * 60 * 60 * 1000),
    subscriptionCancelAtPeriodEnd: false,
    pendingSubscriptionPlan: null,
    pendingSubscriptionEffectiveAt: null,
    paymentMethod,
    paymentBrand: paymentDetails.paymentBrand,
    paymentLast4: paymentDetails.paymentLast4,
  });
}

function settleSubscription(user: StoredUserProfile, now = Date.now()): StoredUserProfile {
  const periodEnd = user.subscriptionCurrentPeriodEnd ? Date.parse(user.subscriptionCurrentPeriodEnd) : NaN;
  if (Number.isFinite(periodEnd) && periodEnd <= now) {
    if (user.pendingSubscriptionPlan) {
      return {
        ...activateSubscription(user, user.pendingSubscriptionPlan, Math.max(now, periodEnd)),
        profileRevision: user.profileRevision,
      };
    }
    if (user.subscriptionPlan !== "none" || user.subscriptionStatus !== "none") {
      return {
        ...user,
        subscriptionPlan: "none",
        subscriptionStatus: "none",
        subscriptionCurrentPeriodEnd: null,
        subscriptionCancelAtPeriodEnd: false,
        pendingSubscriptionPlan: null,
        pendingSubscriptionEffectiveAt: null,
        updatedAt: nowIso(now),
      };
    }
  }
  return user;
}

function sanitizePaymentDetails(method: PaymentMethod, values: { paymentBrand?: unknown; paymentLast4?: unknown; idealBank?: unknown }): PreviewPaymentDetails {
  if (method === "ideal") {
    const bank = typeof values.idealBank === "string" && values.idealBank.trim()
      ? values.idealBank.trim().slice(0, 40)
      : "iDEAL";
    return { paymentBrand: bank, paymentLast4: null };
  }

  const brand = typeof values.paymentBrand === "string" && values.paymentBrand.trim()
    ? values.paymentBrand.trim().slice(0, 24).toUpperCase()
    : "VISA";
  const last4 = typeof values.paymentLast4 === "string" && /^\d{4}$/.test(values.paymentLast4)
    ? values.paymentLast4
    : "4242";
  return { paymentBrand: brand, paymentLast4: last4 };
}

function sanitizeStripeId(value: unknown): string {
  return typeof value === "string" && /^[A-Za-z0-9_]+$/.test(value.trim()) ? value.trim() : "";
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

function verificationEmailMessage(senderAddress: string, recipientAddress: string, code: string, lang: Lang): EmailMessage {
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
    disableUserEngagementTracking: true,
  };
}

function verificationCopy(lang: Lang, code: string): { subject: string; plainText: string; html: string } {
  if (lang === "nl") {
    return {
      subject: "Je Airco Tracker verificatiecode",
      plainText: `Je Airco Tracker verificatiecode is ${code}. Deze code verloopt over 10 minuten.`,
      html: verificationHtml("Je verificatiecode", "Gebruik deze code om in te loggen bij Airco Tracker. De code verloopt over 10 minuten.", code),
    };
  }
  if (lang === "en") {
    return {
      subject: "Your Airco Tracker verification code",
      plainText: `Your Airco Tracker verification code is ${code}. This code expires in 10 minutes.`,
      html: verificationHtml("Your verification code", "Use this code to sign in to Airco Tracker. It expires in 10 minutes.", code),
    };
  }
  return {
    subject: "你的 Airco Tracker 验证码",
    plainText: `你的 Airco Tracker 验证码是 ${code}。验证码 10 分钟内有效。`,
    html: verificationHtml("你的验证码", "请使用下方验证码登录 Airco Tracker。验证码 10 分钟内有效。", code),
  };
}

function verificationHtml(title: string, body: string, code: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#eef8fb;font-family:Inter,Segoe UI,Arial,sans-serif;color:#12283a;">
    <div style="max-width:520px;margin:0 auto;padding:28px;border-radius:24px;background:#ffffff;box-shadow:0 18px 60px rgba(31,79,105,.12);">
      <p style="margin:0 0 10px;color:#0d83bd;font-weight:700;">Airco Tracker</p>
      <h1 style="margin:0 0 12px;font-size:26px;letter-spacing:-.04em;">${escapeHtml(title)}</h1>
      <p style="margin:0 0 22px;line-height:1.6;color:#526475;">${escapeHtml(body)}</p>
      <div style="padding:18px 22px;border-radius:18px;background:#e7f9fd;color:#10293f;font-size:32px;font-weight:800;letter-spacing:.18em;text-align:center;">${escapeHtml(code)}</div>
      <p style="margin:22px 0 0;color:#7b93a2;font-size:13px;line-height:1.5;">If you did not request this code, you can ignore this email.</p>
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
