import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { TableClient, type TableEntityResult } from "@azure/data-tables";
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

type SessionRecord = {
  sessionHash: string;
  email: string;
  expiresAt: string;
  createdAt: string;
  lastSeenAt: string;
};

type AuthStore = {
  getUser(email: string): Promise<UserProfile | null>;
  upsertUser(user: UserProfile): Promise<void>;
  deleteUser(email: string): Promise<void>;
  getCode(email: string): Promise<AuthCodeRecord | null>;
  upsertCode(record: AuthCodeRecord): Promise<void>;
  deleteCode(email: string): Promise<void>;
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
  user: UserProfile;
  isNewUser: boolean;
  sessionToken: string;
  sessionTtlSeconds: number;
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

const USER_PARTITION = "user";
const CODE_PARTITION = "auth-code";
const SESSION_PARTITION = "auth-session";
const DEFAULT_CODE_TTL_SECONDS = 10 * 60;
const DEFAULT_RESEND_SECONDS = 60;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const DEFAULT_COOKIE_NAME = "airco_session";

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

function tableUrlFromStorageAccountUrl(value: string): string {
  return value.includes(".table.") ? value : value.replace(".blob.", ".table.");
}

class TableAuthStore implements AuthStore {
  private readonly users: TableClient;
  private readonly codes: TableClient;
  private readonly sessions: TableClient;
  private ensurePromise: Promise<void> | undefined;

  constructor(accountUrl: string, managedIdentityClientId: string | undefined, tableNames: { users: string; codes: string; sessions: string }) {
    const credential = new DefaultAzureCredential({ managedIdentityClientId });
    const tableUrl = tableUrlFromStorageAccountUrl(accountUrl);
    this.users = new TableClient(tableUrl, tableNames.users, credential);
    this.codes = new TableClient(tableUrl, tableNames.codes, credential);
    this.sessions = new TableClient(tableUrl, tableNames.sessions, credential);
  }

  private async ensureTables(): Promise<void> {
    if (!this.ensurePromise) {
      this.ensurePromise = Promise.all([
        this.users.createTable(),
        this.codes.createTable(),
        this.sessions.createTable(),
      ]).then(() => undefined);
    }
    return this.ensurePromise;
  }

  async getUser(email: string): Promise<UserProfile | null> {
    await this.ensureTables();
    try {
      const entity = await this.users.getEntity<UserEntity>(USER_PARTITION, base64Url(email));
      return userFromEntity(entity);
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async upsertUser(user: UserProfile): Promise<void> {
    await this.ensureTables();
    await this.users.upsertEntity(userToEntity(user), "Replace");
  }

  async deleteUser(email: string): Promise<void> {
    await this.ensureTables();
    try {
      await this.users.deleteEntity(USER_PARTITION, base64Url(email));
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  async getCode(email: string): Promise<AuthCodeRecord | null> {
    await this.ensureTables();
    try {
      const entity = await this.codes.getEntity<CodeEntity>(CODE_PARTITION, base64Url(email));
      return codeFromEntity(entity);
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async upsertCode(record: AuthCodeRecord): Promise<void> {
    await this.ensureTables();
    await this.codes.upsertEntity(codeToEntity(record), "Replace");
  }

  async deleteCode(email: string): Promise<void> {
    await this.ensureTables();
    try {
      await this.codes.deleteEntity(CODE_PARTITION, base64Url(email));
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  async getSession(hash: string): Promise<SessionRecord | null> {
    await this.ensureTables();
    try {
      const entity = await this.sessions.getEntity<SessionEntity>(SESSION_PARTITION, hash);
      return sessionFromEntity(entity);
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  async upsertSession(record: SessionRecord): Promise<void> {
    await this.ensureTables();
    await this.sessions.upsertEntity(sessionToEntity(record), "Replace");
  }

  async deleteSession(hash: string): Promise<void> {
    await this.ensureTables();
    try {
      await this.sessions.deleteEntity(SESSION_PARTITION, hash);
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }
  }

  async deleteSessionsForEmail(email: string): Promise<void> {
    await this.ensureTables();
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
    await this.ensureTables();
    const oldNormalized = normalizeEmail(oldEmail);
    const newNormalized = normalizeEmail(newEmail);
    const entities = this.sessions.listEntities<SessionEntity>({
      queryOptions: { filter: `PartitionKey eq '${SESSION_PARTITION}'` },
    });
    for await (const entity of entities) {
      if (normalizeEmail(entity.email) !== oldNormalized) continue;
      await this.sessions.upsertEntity(sessionToEntity({
        sessionHash: String(entity.sessionHash),
        email: newNormalized,
        expiresAt: String(entity.expiresAt),
        createdAt: String(entity.createdAt),
        lastSeenAt: nowIso(),
      }), "Replace");
    }
  }
}

class MemoryAuthStore implements AuthStore {
  private readonly users = new Map<string, UserProfile>();
  private readonly codes = new Map<string, AuthCodeRecord>();
  private readonly sessions = new Map<string, SessionRecord>();

  async getUser(email: string): Promise<UserProfile | null> {
    const user = this.users.get(email);
    return user ? { ...user } : null;
  }

  async upsertUser(user: UserProfile): Promise<void> {
    this.users.set(user.email, { ...user });
  }

  async deleteUser(email: string): Promise<void> {
    this.users.delete(email);
  }

  async getCode(email: string): Promise<AuthCodeRecord | null> {
    const code = this.codes.get(email);
    return code ? { ...code } : null;
  }

  async upsertCode(record: AuthCodeRecord): Promise<void> {
    this.codes.set(record.email, { ...record });
  }

  async deleteCode(email: string): Promise<void> {
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
  languagePreference?: string;
  deliveryCountry?: string;
  createdAt: string;
  updatedAt: string;
};

type CodeEntity = AuthCodeRecord;
type SessionEntity = SessionRecord;

function userToEntity(user: UserProfile): UserEntity & { partitionKey: string; rowKey: string } {
  return {
    partitionKey: USER_PARTITION,
    rowKey: base64Url(user.email),
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
    languagePreference: user.languagePreference,
    deliveryCountry: user.deliveryCountry,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function userFromEntity(entity: TableEntityResult<UserEntity>): UserProfile {
  const subscriptionPlan = isSubscriptionPlan(entity.subscriptionPlan) ? entity.subscriptionPlan : AUTH_SUBSCRIPTION_PLAN_DEFAULT;
  const subscriptionStatus = isSubscriptionStatus(entity.subscriptionStatus) ? entity.subscriptionStatus : AUTH_SUBSCRIPTION_STATUS_DEFAULT;
  const pendingSubscriptionPlan = isPaidSubscriptionPlan(entity.pendingSubscriptionPlan) ? entity.pendingSubscriptionPlan : null;
  const paymentMethod = isPaymentMethod(entity.paymentMethod) ? entity.paymentMethod : null;
  const languagePreference = isLanguagePreference(entity.languagePreference) ? entity.languagePreference : AUTH_LANGUAGE_DEFAULT;
  const deliveryCountry = isDeliveryCountry(entity.deliveryCountry) ? entity.deliveryCountry : AUTH_DELIVERY_COUNTRY_DEFAULT;
  return {
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
    languagePreference,
    deliveryCountry,
    createdAt: String(entity.createdAt),
    updatedAt: String(entity.updatedAt),
  };
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
      console.info(`Auth verification code for ${maskEmail(email)}: ${code}`);
      return this.exposeDevCode ? { devCode: code } : {};
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
    await this.store.upsertCode(record);
    try {
      const sent = await this.mailer.sendVerificationCode(email, code, lang);
      return {
        ok: true,
        retryAfterSeconds: this.codeResendSeconds,
        devCode: sent.devCode,
      };
    } catch (error) {
      await this.store.deleteCode(email);
      console.error("verification email send failed:", error);
      throw new AuthHttpError(502, "email_send_failed");
    }
  }

  async verifyCode(rawEmail: unknown, rawCode: unknown, lang: Lang = AUTH_LANGUAGE_DEFAULT): Promise<VerifyCodeResult> {
    const email = normalizeAndValidateEmail(rawEmail);
    await this.consumeCode(email, rawCode);
    const existingUser = await this.store.getUser(email);
    const timestamp = nowIso();
    const user: UserProfile = existingUser ?? {
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
      languagePreference: isLanguagePreference(lang) ? lang : AUTH_LANGUAGE_DEFAULT,
      deliveryCountry: AUTH_DELIVERY_COUNTRY_DEFAULT,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    if (!existingUser) await this.store.upsertUser(user);

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

    const stored = await this.store.getCode(email);
    if (!stored || isExpired(stored.expiresAt)) {
      if (stored) await this.store.deleteCode(email);
      throw new AuthHttpError(400, "invalid_or_expired_code");
    }
    if (stored.attempts >= this.codeMaxAttempts) {
      await this.store.deleteCode(email);
      throw new AuthHttpError(400, "too_many_code_attempts");
    }
    if (!verifyVerificationHash(email, code, stored.salt, stored.codeHash)) {
      await this.store.upsertCode({ ...stored, attempts: stored.attempts + 1 });
      throw new AuthHttpError(400, "invalid_or_expired_code");
    }

    await this.store.deleteCode(email);
  }

  async currentUser(request: IncomingMessage): Promise<UserProfile | null> {
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
    if (settled !== user) await this.store.upsertUser(settled);
    await this.store.upsertSession({ ...session, lastSeenAt: nowIso() });
    return settled;
  }

  async requireUser(request: IncomingMessage): Promise<UserProfile> {
    const user = await this.currentUser(request);
    if (!user) throw new AuthHttpError(401, "not_authenticated");
    return user;
  }

  async updateNickname(request: IncomingMessage, rawNickname: unknown): Promise<UserProfile> {
    const user = await this.requireUser(request);
    const validation = validateNickname(rawNickname);
    if (!validation.ok) throw new AuthHttpError(400, `nickname_${validation.error}`);
    const updated: UserProfile = {
      ...user,
      nickname: validation.nickname,
      updatedAt: nowIso(),
    };
    await this.store.upsertUser(updated);
    return updated;
  }

  async updateEmail(request: IncomingMessage, values: { email?: unknown; code?: unknown }): Promise<UserProfile> {
    const user = await this.requireUser(request);
    const email = normalizeAndValidateEmail(values.email);
    if (email === user.email) throw new AuthHttpError(400, "email_unchanged");
    const existing = await this.store.getUser(email);
    if (existing) throw new AuthHttpError(409, "email_taken");
    await this.consumeCode(email, values.code);
    const updated: UserProfile = {
      ...user,
      email,
      updatedAt: nowIso(),
    };
    await this.store.upsertUser(updated);
    await this.store.updateSessionsEmail(user.email, email);
    await this.store.deleteUser(user.email);
    return updated;
  }

  async completePreviewSubscriptionPayment(request: IncomingMessage, values: { plan?: unknown; paymentMethod?: unknown; paymentBrand?: unknown; paymentLast4?: unknown; idealBank?: unknown }): Promise<UserProfile> {
    const user = await this.requireUser(request);
    if (!isPaidSubscriptionPlan(values.plan)) throw new AuthHttpError(400, "invalid_subscription_plan");
    if (!isPaymentMethod(values.paymentMethod)) throw new AuthHttpError(400, "invalid_payment_method");

    const updated = changeSubscription(user, values.plan, values.paymentMethod, sanitizePaymentDetails(values.paymentMethod, values));
    await this.store.upsertUser(updated);
    return updated;
  }

  async cancelSubscription(request: IncomingMessage): Promise<UserProfile> {
    const user = await this.requireUser(request);
    if (!isPaidSubscriptionPlan(user.subscriptionPlan) || !user.subscriptionCurrentPeriodEnd) {
      throw new AuthHttpError(400, "no_active_subscription");
    }
    const updated: UserProfile = {
      ...user,
      subscriptionStatus: "canceled",
      subscriptionCancelAtPeriodEnd: true,
      pendingSubscriptionPlan: null,
      pendingSubscriptionEffectiveAt: null,
      updatedAt: nowIso(),
    };
    await this.store.upsertUser(updated);
    return updated;
  }

  async deleteAccount(request: IncomingMessage): Promise<void> {
    const user = await this.requireUser(request);
    const settled = settleSubscription(user);
    if (subscriptionIsActive(settled)) throw new AuthHttpError(409, "active_subscription");
    await this.store.deleteCode(user.email);
    await this.store.deleteSessionsForEmail(user.email);
    await this.store.deleteUser(user.email);
  }

  async updatePreferences(request: IncomingMessage, values: { languagePreference?: unknown; deliveryCountry?: unknown }): Promise<UserProfile> {
    const user = await this.requireUser(request);
    const nextLanguage = values.languagePreference === undefined
      ? user.languagePreference
      : values.languagePreference;
    const nextCountry = values.deliveryCountry === undefined
      ? user.deliveryCountry
      : values.deliveryCountry;

    if (!isLanguagePreference(nextLanguage)) throw new AuthHttpError(400, "invalid_language_preference");
    if (!isDeliveryCountry(nextCountry)) throw new AuthHttpError(400, "invalid_delivery_country");

    const updated: UserProfile = {
      ...user,
      languagePreference: nextLanguage,
      deliveryCountry: nextCountry,
      updatedAt: nowIso(),
    };
    await this.store.upsertUser(updated);
    return updated;
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

function changeSubscription(user: UserProfile, plan: PaidSubscriptionPlan, paymentMethod: PaymentMethod, paymentDetails: PreviewPaymentDetails): UserProfile {
  const settled = settleSubscription(user);
  if (subscriptionIsActive(settled)) {
    const direction = subscriptionChangeDirection(settled.subscriptionPlan, plan);
    if (direction === "downgrade") {
      return {
        ...settled,
        pendingSubscriptionPlan: plan,
        pendingSubscriptionEffectiveAt: settled.subscriptionCurrentPeriodEnd,
        subscriptionCancelAtPeriodEnd: false,
        paymentMethod,
        paymentBrand: paymentDetails.paymentBrand,
        paymentLast4: paymentDetails.paymentLast4,
        updatedAt: nowIso(),
      };
    }
  }
  return activateSubscription(settled, plan, Date.now(), paymentMethod, paymentDetails);
}

function activateSubscription(
  user: UserProfile,
  plan: PaidSubscriptionPlan,
  startsAt = Date.now(),
  paymentMethod: PaymentMethod | null = user.paymentMethod,
  paymentDetails: PreviewPaymentDetails = { paymentBrand: user.paymentBrand, paymentLast4: user.paymentLast4 },
): UserProfile {
  const details = SUBSCRIPTION_PLAN_DETAILS[plan];
  return {
    ...user,
    subscriptionPlan: plan,
    subscriptionStatus: "active",
    subscriptionCurrentPeriodEnd: nowIso(startsAt + details.intervalDays * 24 * 60 * 60 * 1000),
    subscriptionCancelAtPeriodEnd: false,
    pendingSubscriptionPlan: null,
    pendingSubscriptionEffectiveAt: null,
    paymentMethod,
    paymentBrand: paymentDetails.paymentBrand,
    paymentLast4: paymentDetails.paymentLast4,
    updatedAt: nowIso(),
  };
}

function settleSubscription(user: UserProfile, now = Date.now()): UserProfile {
  const periodEnd = user.subscriptionCurrentPeriodEnd ? Date.parse(user.subscriptionCurrentPeriodEnd) : NaN;
  if (Number.isFinite(periodEnd) && periodEnd <= now) {
    if (user.pendingSubscriptionPlan) {
      return activateSubscription(user, user.pendingSubscriptionPlan, Math.max(now, periodEnd));
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
