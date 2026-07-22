import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import test from "node:test";
import {
  AuthService,
  AuthHttpError,
  AlertRecipientProjectionStore,
  TableAuthStore,
  alertRecipientEntity,
  alertRecipientPartitionKey,
  createUserId,
  createVerificationHash,
  generateVerificationCode,
  legacyUserId,
  legalRetentionEntity,
  legalRetentionUntil,
  purchaseConfirmationEmailMessage,
  verifyVerificationHash,
  verificationEmailMessage,
  withdrawalConfirmationEmailMessage,
  type StoredUserProfile,
} from "./auth.js";
import {
  isValidEmail,
  isDeliveryCountry,
  isLanguagePreference,
  hasEmailAlertAccess,
  hasRealtimeStockAccess,
  normalizeEmail,
  entitlementIsActive,
  userInitials,
  validateNickname,
} from "../shared/auth.js";
import { createAlertUnsubscribeToken } from "./unsubscribe.js";

const TEST_CODE_PEPPER = "test-only-auth-code-pepper-at-least-32-characters";
const TEST_CODE_PEPPER_VERSION = "test-v1";

function authOptions<T extends Record<string, unknown>>(options: T = {} as T): T & {
  verificationCodePepper: string;
  verificationCodePepperVersion: string;
} {
  return {
    verificationCodePepper: TEST_CODE_PEPPER,
    verificationCodePepperVersion: TEST_CODE_PEPPER_VERSION,
    ...options,
  };
}

function testUser(overrides: Partial<StoredUserProfile> = {}): StoredUserProfile {
  return {
    userId: "95bc3d32-8f2e-4cf0-a924-731efb4ebcf2",
    profileRevision: 1,
    email: "user@example.test",
    nickname: "Test User",
    emailAlertsEnabled: true,
    emailAlertsTokenVersion: 1,
    entitlementTier: "radar",
    entitlementStatus: "active",
    entitlementExpiresAt: "2099-01-01T00:00:00.000Z",
    entitlementPurchasedAt: "2026-07-09T00:00:00.000Z",
    passReceipts: [{
      id: "pi_existing",
      checkoutSessionId: "cs_test_existing",
      kind: "purchase",
      tier: "radar",
      baseReceiptId: null,
      purchasedAt: "2026-07-09T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
      amountEurCents: 1000,
      checkoutLocale: "en",
      termsVersion: "2026-07-22",
      privacyVersion: "2026-07-22",
      acceptedAt: "2026-07-09T00:00:00.000Z",
      immediatePerformanceRequested: true,
      purchaseConfirmationSentAt: null,
      withdrawalConfirmationSentAt: null,
      withdrawalRequestedAt: null,
      withdrawalReference: null,
      withdrawalConsumerName: null,
      withdrawalElectronicConfirmationAcceptedAt: null,
      stripeRefundId: null,
      stripeRefundStatus: null,
      status: "active",
      paymentBrand: "VISA",
      paymentLast4: "4242",
    }],
    paymentMethod: "card",
    paymentBrand: "VISA",
    paymentLast4: "4242",
    stripeCustomerId: "cus_secret",
    languagePreference: "en",
    deliveryCountry: "fr",
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:01.000Z",
    ...overrides,
  };
}

function encodedEmail(email: string): string {
  return Buffer.from(email, "utf8").toString("base64url");
}

function storedUserEntity(user: StoredUserProfile) {
  return {
    partitionKey: "user",
    rowKey: `id:${user.userId}`,
    ...user,
    nickname: user.nickname ?? "",
    entitlementExpiresAt: user.entitlementExpiresAt ?? "",
    entitlementPurchasedAt: user.entitlementPurchasedAt ?? "",
    passReceiptsJson: JSON.stringify(user.passReceipts),
    paymentMethod: user.paymentMethod ?? "",
    paymentBrand: user.paymentBrand ?? "",
    paymentLast4: user.paymentLast4 ?? "",
    stripeCustomerId: user.stripeCustomerId ?? "",
    recordType: "profile",
    recordState: "active",
    etag: `etag-${user.profileRevision}`,
  };
}

function emailIndexEntityForTest(user: StoredUserProfile) {
  return {
    partitionKey: "user",
    rowKey: `email:${encodedEmail(user.email)}`,
    userId: user.userId,
    recordType: "email-index",
    recordState: "active",
    email: user.email,
    sourceRevision: user.profileRevision,
    updatedAt: user.updatedAt,
    etag: `etag-email-${user.profileRevision}`,
  };
}

function stripeIndexEntityForTest(user: StoredUserProfile) {
  return {
    partitionKey: "user",
    rowKey: `stripe:${encodedEmail(user.stripeCustomerId || "")}`,
    userId: user.userId,
    recordType: "stripe-index",
    recordState: "active",
    stripeCustomerId: user.stripeCustomerId,
    sourceRevision: user.profileRevision,
    updatedAt: user.updatedAt,
    etag: `etag-stripe-${user.profileRevision}`,
  };
}

class FakeUsersTable {
  readonly entities = new Map<string, Record<string, any>>();
  transactionActions: unknown[] = [];
  transactionError: unknown;
  transactionHook: ((actions: Array<[string, Record<string, unknown>, ...unknown[]]>) => void) | undefined;
  listEntitiesCalls = 0;

  constructor(users: StoredUserProfile[], options: { legacy?: boolean } = {}) {
    for (const user of users) {
      if (options.legacy) {
        this.entities.set(encodedEmail(user.email), {
          ...storedUserEntity(user),
          rowKey: encodedEmail(user.email),
          recordType: undefined,
          userId: undefined,
          profileRevision: undefined,
        });
        continue;
      }
      this.entities.set(`id:${user.userId}`, storedUserEntity(user));
      this.entities.set(`email:${encodedEmail(user.email)}`, emailIndexEntityForTest(user));
      if (user.stripeCustomerId) {
        this.entities.set(`stripe:${encodedEmail(user.stripeCustomerId)}`, stripeIndexEntityForTest(user));
      }
    }
  }

  async createTable() {}

  async getEntity(_partitionKey: string, rowKey: string) {
    const entity = this.entities.get(rowKey);
    if (!entity) throw Object.assign(new Error("not found"), { statusCode: 404 });
    return { ...entity };
  }

  listEntities() {
    this.listEntitiesCalls += 1;
    const values = [...this.entities.values()].map((entity) => ({ ...entity }));
    return (async function* () {
      for (const entity of values) yield entity;
    })();
  }

  async createEntity(entity: Record<string, any>) {
    if (this.entities.has(entity.rowKey)) throw Object.assign(new Error("conflict"), { statusCode: 409 });
    this.entities.set(entity.rowKey, { ...entity, etag: `etag-${String(entity.profileRevision ?? entity.sourceRevision ?? "new")}` });
  }

  async updateEntity(entity: Record<string, any>, _mode: string, options: { etag?: string } = {}) {
    const current = this.entities.get(entity.rowKey);
    if (!current || options.etag !== current.etag) {
      throw Object.assign(new Error("precondition"), { statusCode: 412 });
    }
    this.entities.set(entity.rowKey, { ...entity, etag: `etag-${String(entity.profileRevision ?? entity.sourceRevision ?? "updated")}` });
  }

  async submitTransaction(actions: Array<[string, Record<string, unknown>, ...unknown[]]>) {
    this.transactionActions = actions;
    if (this.transactionError) throw this.transactionError;
    this.transactionHook?.(actions);
    const next = new Map(this.entities);
    for (const action of actions) {
      const [kind, entity, _mode, options] = action;
      const rowKey = String(entity.rowKey);
      if (kind === "create") {
        if (next.has(rowKey)) throw Object.assign(new Error("conflict"), { statusCode: 409 });
        next.set(rowKey, { ...entity, etag: `etag-${String(entity.profileRevision ?? entity.sourceRevision ?? "new")}` });
      } else if (kind === "update") {
        const current = next.get(rowKey);
        if (!current || (options as { etag?: string } | undefined)?.etag !== current.etag) {
          throw Object.assign(new Error("precondition"), { statusCode: 412 });
        }
        next.set(rowKey, { ...entity, etag: `etag-${String(entity.profileRevision ?? entity.sourceRevision ?? "updated")}` });
      }
    }
    this.entities.clear();
    for (const [key, entity] of next) this.entities.set(key, entity);
  }

  async deleteEntity(_partitionKey: string, rowKey: string) {
    this.entities.delete(rowKey);
  }
}

function tableStoreForTest(users: FakeUsersTable, options: { projectionError?: Error; projectionUpsertError?: Error } = {}) {
  const store = Object.create(TableAuthStore.prototype) as TableAuthStore;
  const sessionUpdates: Array<{ oldEmail: string; newEmail: string }> = [];
  const projectionUpdates: StoredUserProfile[] = [];
  const projectionSuppressions: Array<{ userId: string; sourceRevision: number }> = [];
  const emptyTable = {
    async createTable() {},
    listEntities() {
      return (async function* () {})();
    },
  };
  Object.assign(store as object, {
    users,
    codes: emptyTable,
    sessions: emptyTable,
    ensurePromise: Promise.resolve(),
    recipients: {
      async ensureTable() {},
      async upsert(user: StoredUserProfile) {
        if (options.projectionUpsertError) throw options.projectionUpsertError;
        projectionUpdates.push({ ...user });
      },
      async suppress(userId: string, sourceRevision: number) {
        projectionSuppressions.push({ userId, sourceRevision });
        if (options.projectionError) throw options.projectionError;
      },
      async delete() {},
    },
    async updateSessionsEmail(oldEmail: string, newEmail: string) {
      sessionUpdates.push({ oldEmail, newEmail });
    },
  });
  return { store, sessionUpdates, projectionUpdates, projectionSuppressions };
}

test("normalizes and validates email identifiers", () => {
  assert.equal(normalizeEmail("  Test.User+tag@Outlook.COM "), "test.user+tag@outlook.com");
  assert.equal(isValidEmail("test.user+tag@outlook.com"), true);
  assert.equal(isValidEmail("not an email"), false);
  assert.equal(isValidEmail("a@b"), false);
});

test("adds Reply-To but no unsubscribe headers to verification emails", () => {
  const message = verificationEmailMessage(
    "DoNotReply@airco-tracker.eu",
    "user@example.test",
    "123456",
    "en",
    "support@airco-tracker.eu",
  );
  assert.deepEqual(message.replyTo, [{ address: "support@airco-tracker.eu" }]);
  assert.equal(message.headers, undefined);
  assert.equal(message.content.plainText?.includes("123456"), true);
});

test("localizes every verification-email text field and HTML language", () => {
  const expectations = {
    zh: { lang: "zh-CN", subject: "验证码", footer: "可以忽略这封邮件" },
    nl: { lang: "nl", subject: "verificatiecode", footer: "e-mail negeren" },
    en: { lang: "en", subject: "verification code", footer: "ignore this email" },
    fr: { lang: "fr", subject: "code de vérification", footer: "ignorer cet e-mail" },
  } as const;
  for (const [lang, expected] of Object.entries(expectations)) {
    const message = verificationEmailMessage(
      "DoNotReply@airco-tracker.eu",
      "user@example.test",
      "123456",
      lang as keyof typeof expectations,
    );
    assert.equal(message.content.subject.includes(expected.subject), true, lang);
    assert.equal(message.content.plainText?.includes("123456"), true, lang);
    assert.equal(message.content.plainText?.includes(expected.footer), true, lang);
    assert.equal(message.content.html?.includes(`<html lang="${expected.lang}">`), true, lang);
    assert.equal(message.content.html?.includes(expected.footer), true, lang);
  }
});

test("purchase confirmations preserve exact VAT status, legal versions, and the EU withdrawal form", () => {
  const common = {
    orderReference: "cs_test_order",
    tier: "radar" as const,
    amountEurCents: 3000,
    purchasedAt: "2026-07-16T12:00:00.000Z",
    expiresAt: "2026-10-14T12:00:00.000Z",
    termsVersion: "2026-07-22",
    privacyVersion: "2026-07-22",
    immediatePerformanceRequested: true,
    withdrawalDeadline: "2026-07-30T12:00:00.000Z",
    withdrawalUrl: "https://airco-tracker.eu/withdrawal.html?lang=en",
    termsUrl: "https://airco-tracker.eu/terms.html?lang=en",
    privacyUrl: "https://airco-tracker.eu/privacy.html?lang=en",
    operatorName: "Airco Tracker Operator",
    operatorAddress: "Example Street 1, Amsterdam",
    contactEmail: "support@airco-tracker.eu",
    withdrawalEmail: "withdrawal@airco-tracker.eu",
    vatStatus: "not_registered" as const,
    vatId: null,
  };
  const expected = {
    en: [/No VAT charged/, /EU model withdrawal form/, /no automatic renewal/i, /near-real-time inventory access, normally refreshed about every 10 minutes/i],
    nl: [/Geen btw in rekening gebracht/, /EU-modelformulier voor herroeping/, /geen automatische verlenging/i, /bijna-realtime voorraadtoegang, normaal ongeveer elke 10 minuten ververst/i],
    fr: [/Aucune TVA facturée/, /Formulaire type UE de rétractation/, /sans renouvellement automatique/i, /stock en quasi-temps réel, normalement actualisé toutes les 10 minutes environ/i],
    zh: [/未收取增值税/, /欧盟示范撤回表/, /不会自动续费/, /近实时库存访问，通常约每 10 分钟刷新/],
  } as const;
  for (const lang of ["en", "nl", "fr", "zh"] as const) {
    const message = purchaseConfirmationEmailMessage("sender@example.test", "buyer@example.test", lang, common);
    const durable = `${message.content.plainText}\n${message.content.html}`;
    for (const pattern of expected[lang]) assert.match(durable, pattern);
    assert.match(durable, /2026-07-22/);
    assert.match(durable, /withdrawal@airco-tracker\.eu/);
    assert.equal(message.headers?.["X-Airco-Delivery-Key"], "purchase-cs_test_order");
  }
});

test("withdrawal confirmations itemize a base pass and linked upgrade with the combined total", () => {
  const message = withdrawalConfirmationEmailMessage("sender@example.test", "buyer@example.test", "en", {
    orderReference: "cs_base",
    refundReference: "WD-ABC12345",
    requestedAt: "2026-07-20T12:00:00.000Z",
    consumerName: "Test Consumer",
    confirmationEmail: "buyer@example.test",
    amountEurCents: 3000,
    refundedItems: [
      { orderReference: "cs_base", kind: "purchase", amountEurCents: 1500 },
      { orderReference: "cs_upgrade", kind: "upgrade", amountEurCents: 1500 },
    ],
    status: "succeeded",
    operatorName: "Airco Tracker Operator",
    contactEmail: "support@airco-tracker.eu",
  });
  const durable = `${message.content.plainText}\n${message.content.html}`;
  assert.match(durable, /Pass cs_base: €15\.00/);
  assert.match(durable, /Radar upgrade cs_upgrade: €15\.00/);
  assert.match(durable, /Consumer name: Test Consumer/);
  assert.match(durable, /Confirmation sent to: buyer@example\.test/);
  assert.match(durable, /Total refund: €30\.00/);
  assert.match(durable, /Stripe status: Completed/);
  assert.doesNotMatch(durable, /Stripe status: succeeded/);
  assert.equal(message.headers?.["X-Airco-Delivery-Key"], "withdrawal-WD-ABC12345");
});

test("withdrawal confirmations localize a pending Stripe refund status", () => {
  const expected = { en: "Pending", nl: "In behandeling", fr: "En attente", zh: "处理中" } as const;
  for (const lang of ["en", "nl", "fr", "zh"] as const) {
    const message = withdrawalConfirmationEmailMessage("sender@example.test", "buyer@example.test", lang, {
      orderReference: "cs_base",
      refundReference: "WD-PENDING",
      requestedAt: "2026-07-20T12:00:00.000Z",
      consumerName: "Test Consumer",
      confirmationEmail: "buyer@example.test",
      amountEurCents: 1500,
      refundedItems: [{ orderReference: "cs_base", kind: "purchase", amountEurCents: 1500 }],
      status: "pending",
      operatorName: "Airco Tracker Operator",
      contactEmail: "support@airco-tracker.eu",
    });
    assert.match(`${message.content.plainText}\n${message.content.html}`, new RegExp(expected[lang]));
  }
});

test("validates nicknames with minimal stored profile data", () => {
  assert.deepEqual(validateNickname("  Asahi   Lee  "), { ok: true, nickname: "Asahi Lee" });
  assert.deepEqual(validateNickname("李开复"), { ok: true, nickname: "李开复" });
  assert.equal(validateNickname("").ok, false);
  assert.equal(validateNickname("   ").ok, false);
  assert.equal(validateNickname("🙂🙂").ok, false);
});

test("validates stored language and delivery country preferences", () => {
  assert.equal(isLanguagePreference("zh"), true);
  assert.equal(isLanguagePreference("nl"), true);
  assert.equal(isLanguagePreference("fr"), true);
  assert.equal(isLanguagePreference("en"), true);
  assert.equal(isLanguagePreference("de"), false);
  assert.equal(isDeliveryCountry("fr"), true);
  assert.equal(isDeliveryCountry("nl"), true);
  assert.equal(isDeliveryCountry("de"), false);
});

test("evaluates one-time pass entitlements through their expiry", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  const emailOnly = {
    entitlementTier: "alerts" as const,
    entitlementStatus: "active" as const,
    entitlementExpiresAt: future,
    emailAlertsEnabled: true,
  };
  const stock = {
    entitlementTier: "radar" as const,
    entitlementStatus: "active" as const,
    entitlementExpiresAt: future,
  };
  const expired = {
    entitlementTier: "radar" as const,
    entitlementStatus: "active" as const,
    entitlementExpiresAt: past,
  };

  assert.equal(entitlementIsActive(emailOnly), true);
  assert.equal(hasEmailAlertAccess(emailOnly), true);
  assert.equal(hasEmailAlertAccess({ ...emailOnly, emailAlertsEnabled: false }), false);
  assert.equal(hasRealtimeStockAccess(emailOnly), false);
  assert.equal(hasRealtimeStockAccess(stock), true);
  assert.equal(entitlementIsActive(expired), false);
  assert.equal(hasRealtimeStockAccess(expired), false);
});

test("derives compact avatar initials", () => {
  assert.equal(userInitials("Asahi Lee"), "AL");
  assert.equal(userInitials("Mike"), "M");
  assert.equal(userInitials("李开复"), "李");
  assert.equal(userInitials(null, "cool.person@example.com"), "CP");
});

test("generates and verifies six-digit verification codes without storing plaintext", () => {
  const code = generateVerificationCode();
  assert.match(code, /^\d{6}$/);
  const salt = "test-salt";
  const hash = createVerificationHash("User@Example.com", "123456", salt, TEST_CODE_PEPPER, TEST_CODE_PEPPER_VERSION);
  assert.equal(hash, createVerificationHash("user@example.com", "123456", salt, TEST_CODE_PEPPER, TEST_CODE_PEPPER_VERSION));
  assert.equal(verifyVerificationHash("user@example.com", "123456", salt, hash, TEST_CODE_PEPPER, TEST_CODE_PEPPER_VERSION), true);
  assert.equal(verifyVerificationHash("user@example.com", "000000", salt, hash, TEST_CODE_PEPPER, TEST_CODE_PEPPER_VERSION), false);
  assert.notEqual(
    hash,
    createVerificationHash("user@example.com", "123456", salt, `${TEST_CODE_PEPPER}-rotated`, "test-v2"),
  );
});

test("fails closed when the verification-code HMAC pepper or version is absent", () => {
  assert.throws(() => new AuthService(), /HMAC pepper/);
  assert.throws(
    () => new AuthService({ verificationCodePepper: TEST_CODE_PEPPER }),
    /pepper version/,
  );
});

test("safely invalidates verification rows from the retired unpeppered SHA-256 format", async () => {
  const auth = new AuthService(authOptions({ exposeDevCode: true }));
  const store = (auth as unknown as {
    store: {
      putCode(record: Record<string, unknown>, expectedEtag: null): Promise<unknown>;
      getCode(email: string): Promise<unknown>;
    };
  }).store;
  await store.putCode({
    email: "legacy-code@example.test",
    codeHash: "0".repeat(64),
    salt: "legacy-salt",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    attempts: 0,
    lastSentAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  }, null);

  await assert.rejects(
    auth.verifyCode("legacy-code@example.test", "123456", "en"),
    (error: unknown) => error instanceof AuthHttpError && error.code === "invalid_or_expired_code",
  );
  assert.equal(await store.getCode("legacy-code@example.test"), null);
});

test("fails closed without logging an auth code when ACS is not configured", async () => {
  const auth = new AuthService(authOptions());
  const infoMessages: unknown[][] = [];
  const errorMessages: unknown[][] = [];
  const originalInfo = console.info;
  const originalError = console.error;
  console.info = (...values: unknown[]) => infoMessages.push(values);
  console.error = (...values: unknown[]) => errorMessages.push(values);
  try {
    await assert.rejects(
      auth.requestCode("secure@example.test", "en"),
      (error: unknown) => typeof error === "object"
        && error !== null
        && "code" in error
        && error.code === "email_send_failed",
    );
  } finally {
    console.info = originalInfo;
    console.error = originalError;
  }

  assert.deepEqual(infoMessages, []);
  assert.equal(errorMessages.length, 1);
  assert.equal(JSON.stringify(errorMessages).includes("secure@example.test"), false);
  assert.equal(JSON.stringify(errorMessages).match(/\b\d{6}\b/), null);
});

test("counts failed verification sends against every hourly budget", async () => {
  const auth = new AuthService(authOptions({
    emailCodeBudgetPerHour: 10,
    ipCodeBudgetPerHour: 10,
    globalCodeBudgetPerHour: 1,
  }));
  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(auth.requestCode("first-failure@example.test", "en"), (error: unknown) => (
      error instanceof AuthHttpError && error.code === "email_send_failed"
    ));
    await assert.rejects(auth.requestCode("second-failure@example.test", "en"), (error: unknown) => (
      error instanceof AuthHttpError
      && error.code === "global_code_budget_exhausted"
      && error.status === 429
      && Boolean(error.retryAfterSeconds)
    ));
  } finally {
    console.error = originalError;
  }
});

test("enforces distinct per-email and per-IP budgets before attempting email delivery", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const emailLimited = new AuthService(authOptions({
      emailCodeBudgetPerHour: 2,
      ipCodeBudgetPerHour: 20,
      globalCodeBudgetPerHour: 20,
    }));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await assert.rejects(emailLimited.requestCode("email-limit@example.test", "en", `198.51.100.${attempt + 1}`));
    }
    await assert.rejects(
      emailLimited.requestCode("email-limit@example.test", "en", "198.51.100.3"),
      (error: unknown) => error instanceof AuthHttpError && error.code === "email_code_budget_exhausted",
    );

    const ipLimited = new AuthService(authOptions({
      emailCodeBudgetPerHour: 20,
      ipCodeBudgetPerHour: 2,
      globalCodeBudgetPerHour: 20,
    }));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await assert.rejects(ipLimited.requestCode(`ip-limit-${attempt}@example.test`, "en", "203.0.113.8"));
    }
    await assert.rejects(
      ipLimited.requestCode("ip-limit-final@example.test", "en", "203.0.113.8"),
      (error: unknown) => error instanceof AuthHttpError && error.code === "ip_code_budget_exhausted",
    );
  } finally {
    console.error = originalError;
  }
});

test("uses HMAC identifiers rather than plaintext email or IP in durable budget keys", async () => {
  const auth = new AuthService(authOptions());
  const observed: Array<[string, string]> = [];
  const store = (auth as unknown as {
    store: { consumeCodeSendBudget(scope: string, identifier: string): Promise<void> };
  }).store;
  store.consumeCodeSendBudget = async (scope, identifier) => {
    observed.push([scope, identifier]);
  };
  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(auth.requestCode("Private.User@Example.test", "en", "198.51.100.42"));
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(observed.map(([scope]) => scope), ["email", "ip", "global"]);
  assert.match(observed[0]![1], /^[0-9a-f]{64}$/);
  assert.match(observed[1]![1], /^[0-9a-f]{64}$/);
  assert.equal(observed[2]![1], "all");
  assert.equal(JSON.stringify(observed).includes("private.user@example.test"), false);
  assert.equal(JSON.stringify(observed).includes("198.51.100.42"), false);
});

test("table-backed code budgets use ETag CAS across concurrent service replicas", async () => {
  class FakeBudgetTable {
    private readonly entities = new Map<string, Record<string, any>>();
    private version = 0;

    async getEntity(partitionKey: string, rowKey: string) {
      await Promise.resolve();
      const entity = this.entities.get(`${partitionKey}|${rowKey}`);
      if (!entity) throw Object.assign(new Error("not found"), { statusCode: 404 });
      return { ...entity };
    }

    async createEntity(entity: Record<string, any>) {
      await Promise.resolve();
      const key = `${entity.partitionKey}|${entity.rowKey}`;
      if (this.entities.has(key)) throw Object.assign(new Error("conflict"), { statusCode: 409 });
      this.entities.set(key, { ...entity, etag: `budget-${++this.version}` });
      return {};
    }

    async updateEntity(entity: Record<string, any>, _mode: string, options: { etag: string }) {
      await Promise.resolve();
      const key = `${entity.partitionKey}|${entity.rowKey}`;
      const current = this.entities.get(key);
      if (!current || current.etag !== options.etag) {
        throw Object.assign(new Error("precondition"), { statusCode: 412 });
      }
      this.entities.set(key, { ...entity, etag: `budget-${++this.version}` });
      return {};
    }

    currentCount(): number {
      return Number([...this.entities.values()][0]?.count ?? 0);
    }
  }

  const codes = new FakeBudgetTable();
  const replicas = [Object.create(TableAuthStore.prototype), Object.create(TableAuthStore.prototype)] as TableAuthStore[];
  for (const replica of replicas) Object.assign(replica as object, { codes });
  const attempts = Array.from({ length: 12 }, (_, index) => (
    replicas[index % replicas.length]!.consumeCodeSendBudget("global", "all", 1_750_000_000_000, 3600, 7)
  ));
  const settled = await Promise.allSettled(attempts);

  assert.equal(settled.filter((result) => result.status === "fulfilled").length, 7);
  assert.equal(settled.filter((result) => (
    result.status === "rejected"
    && result.reason instanceof AuthHttpError
    && result.reason.code === "global_code_budget_exhausted"
  )).length, 5);
  assert.equal(codes.currentCount(), 7);
});

test("creates stable UUID identifiers and deterministic legacy backfills", () => {
  assert.match(createUserId(), /^[0-9a-f-]{36}$/);
  const first = legacyUserId(" Legacy.User@Example.test ");
  const second = legacyUserId("legacy.user@example.test");
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

  const changedEmail = { ...testUser(), email: "new-address@example.test" };
  assert.equal(changedEmail.userId, testUser().userId);
});

test("shards alert recipients deterministically across 32 partitions", () => {
  const userId = "95bc3d32-8f2e-4cf0-a924-731efb4ebcf2";
  const partition = alertRecipientPartitionKey(userId);
  assert.equal(alertRecipientPartitionKey(userId), partition);
  assert.match(partition, /^r-(0[0-9a-f]|1[0-9a-f])$/);
  assert.equal(alertRecipientPartitionKey("user-a"), "r-0a");
  assert.equal(alertRecipientPartitionKey("user-b"), "r-19");
});

test("projects only the fields needed for alert delivery", () => {
  const entity = alertRecipientEntity(testUser(), Date.parse("2026-07-09T00:00:00.000Z"));
  assert.deepEqual(Object.keys(entity).sort(), [
    "deliveryCountry",
    "email",
    "enabled",
    "entitlementExpiresAt",
    "entitlementStatus",
    "entitlementTier",
    "language",
    "partitionKey",
    "rowKey",
    "sourceRevision",
    "unsubscribeTokenVersion",
    "updatedAt",
  ].sort());
  assert.equal(entity.rowKey, testUser().userId);
  assert.equal(entity.enabled, true);
  assert.equal(entity.sourceRevision, 1);
  assert.equal(entity.unsubscribeTokenVersion, 1);
  assert.equal("paymentLast4" in entity, false);
  assert.equal("stripeCustomerId" in entity, false);
  assert.equal("nickname" in entity, false);

  const french = alertRecipientEntity(testUser({ languagePreference: "fr" }));
  assert.equal(french.language, "fr");

  const expired = alertRecipientEntity(testUser({
    entitlementExpiresAt: "2026-07-08T00:00:00.000Z",
  }), Date.parse("2026-07-09T00:00:00.000Z"));
  assert.equal(expired.enabled, false);

  const optedOut = alertRecipientEntity(testUser({ emailAlertsEnabled: false }));
  assert.equal(optedOut.enabled, false);
});

test("upserts and deletes the same sharded alert-recipient row", async () => {
  const calls: Array<{ type: string; partitionKey?: string; rowKey?: string }> = [];
  const entities = new Map<string, ReturnType<typeof alertRecipientEntity> & { etag?: string }>();
  const key = (partitionKey: string, rowKey: string) => `${partitionKey}/${rowKey}`;
  const store = new AlertRecipientProjectionStore({
    async createTable() {
      calls.push({ type: "create" });
    },
    async getEntity(partitionKey, rowKey) {
      const entity = entities.get(key(partitionKey, rowKey));
      if (!entity) throw Object.assign(new Error("not found"), { statusCode: 404 });
      return { ...entity };
    },
    async createEntity(entity) {
      entities.set(key(entity.partitionKey, entity.rowKey), { ...entity, etag: "etag-1" });
      calls.push({ type: "create-entity", partitionKey: entity.partitionKey, rowKey: entity.rowKey });
    },
    async updateEntity(entity) {
      entities.set(key(entity.partitionKey, entity.rowKey), { ...entity, etag: "etag-2" });
      calls.push({ type: "update", partitionKey: entity.partitionKey, rowKey: entity.rowKey });
    },
    async deleteEntity(partitionKey, rowKey) {
      entities.delete(key(partitionKey, rowKey));
      calls.push({ type: "delete", partitionKey, rowKey });
    },
  });
  const user = testUser();

  await store.upsert(user);
  await store.delete(user.userId);

  assert.deepEqual(calls, [
    { type: "create" },
    { type: "create-entity", partitionKey: alertRecipientPartitionKey(user.userId), rowKey: user.userId },
    { type: "delete", partitionKey: alertRecipientPartitionKey(user.userId), rowKey: user.userId },
  ]);
});

test("uses an existing alert-recipient table without attempting control-plane creation", async () => {
  let creates = 0;
  const store = new AlertRecipientProjectionStore({
    async getEntity() {
      throw Object.assign(new Error("not found"), { statusCode: 404 });
    },
    async createEntity() {
      creates += 1;
    },
    async updateEntity() {},
    async deleteEntity() {},
  });

  await store.upsert(testUser());

  assert.equal(creates, 1);
});

test("does not let an older profile revision overwrite a newer projection", async () => {
  let current = { ...alertRecipientEntity(testUser({ profileRevision: 3, email: "new@example.test" })), etag: "etag-3" };
  let updates = 0;
  const store = new AlertRecipientProjectionStore({
    async createTable() {},
    async getEntity() {
      return { ...current };
    },
    async createEntity(entity) {
      current = { ...entity, etag: "etag-created" };
    },
    async updateEntity(entity) {
      updates += 1;
      current = { ...entity, etag: `etag-${updates + 3}` };
    },
    async deleteEntity() {},
  });

  await store.upsert(testUser({ profileRevision: 2, email: "old@example.test" }));

  assert.equal(updates, 0);
  assert.equal(current.email, "new@example.test");
  assert.equal(current.sourceRevision, 3);
});

test("accepts a legacy same-revision projection without a token version", async () => {
  const desired = alertRecipientEntity(testUser());
  const legacy = { ...desired, unsubscribeTokenVersion: undefined, etag: "etag-1" };
  let updates = 0;
  const store = new AlertRecipientProjectionStore({
    async createTable() {},
    async getEntity() {
      return legacy as unknown as typeof desired & { etag: string };
    },
    async createEntity() {},
    async updateEntity() {
      updates += 1;
    },
    async deleteEntity() {},
  });

  await store.upsert(testUser());
  assert.equal(updates, 0);
});

test("migrates a legacy subscription projection at the same source revision", async () => {
  const desired = alertRecipientEntity(testUser());
  const {
    entitlementTier: _entitlementTier,
    entitlementStatus: _entitlementStatus,
    entitlementExpiresAt: _entitlementExpiresAt,
    ...common
  } = desired;
  const legacy = {
    ...common,
    subscriptionPlan: "monthly_priority",
    status: "active",
    currentPeriodEnd: desired.entitlementExpiresAt,
    etag: "etag-legacy",
  };
  let migrated: typeof desired | null = null;
  let updateEtag: string | null = null;
  const store = new AlertRecipientProjectionStore({
    async createTable() {},
    async getEntity() {
      return legacy as unknown as typeof desired & { etag: string };
    },
    async createEntity() {},
    async updateEntity(entity, etag) {
      migrated = entity;
      updateEtag = etag;
    },
    async deleteEntity() {},
  });

  await store.upsert(testUser());

  assert.equal(updateEtag, "etag-legacy");
  assert.deepEqual(migrated, desired);
  assert.equal("subscriptionPlan" in (migrated ?? {}), false);
});

test("rechecks projection revision after an ETag race", async () => {
  let current = { ...alertRecipientEntity(testUser({ profileRevision: 1 })), etag: "etag-1" };
  let updateAttempts = 0;
  const winner = { ...alertRecipientEntity(testUser({ profileRevision: 3, email: "winner@example.test" })), etag: "etag-3" };
  const store = new AlertRecipientProjectionStore({
    async createTable() {},
    async getEntity() {
      return { ...current };
    },
    async createEntity() {},
    async updateEntity() {
      updateAttempts += 1;
      current = winner;
      throw Object.assign(new Error("precondition"), { statusCode: 412 });
    },
    async deleteEntity() {},
  });

  await store.upsert(testUser({ profileRevision: 2, email: "loser@example.test" }));

  assert.equal(updateAttempts, 1);
  assert.equal(current.email, "winner@example.test");
  assert.equal(current.sourceRevision, 3);
});

test("changes a table-backed email with one canonical-plus-index transaction", async () => {
  const original = testUser();
  const users = new FakeUsersTable([original]);
  const { store, sessionUpdates, projectionUpdates } = tableStoreForTest(users);

  const changed = await store.changeUserEmail(original, "new-address@example.test");

  assert.equal(changed.email, "new-address@example.test");
  assert.equal(changed.userId, original.userId);
  assert.equal(changed.profileRevision, 2);
  assert.equal(changed.emailAlertsTokenVersion, 2);
  assert.equal(users.transactionActions.length, 3);
  const [canonical, createIndex, tombstone] = users.transactionActions as Array<[string, Record<string, unknown>, string?, { etag?: string }?]>;
  assert.equal(canonical[0], "update");
  assert.equal(canonical[1].rowKey, `id:${original.userId}`);
  assert.equal(canonical[3]?.etag, "etag-1");
  assert.equal(createIndex[0], "create");
  assert.equal(createIndex[1].rowKey, `email:${encodedEmail("new-address@example.test")}`);
  assert.equal(tombstone[0], "update");
  assert.equal(tombstone[1].recordState, "superseded");
  assert.equal(tombstone[1].supersededByEmail, "new-address@example.test");
  assert.equal(tombstone[3]?.etag, "etag-email-1");
  assert.equal(users.entities.has(`email:${encodedEmail(original.email)}`), false);
  assert.equal(users.entities.has(`email:${encodedEmail("new-address@example.test")}`), true);
  assert.equal(users.entities.get(`id:${original.userId}`)?.email, "new-address@example.test");
  assert.deepEqual(sessionUpdates, [{ oldEmail: original.email, newEmail: "new-address@example.test" }]);
  assert.equal(projectionUpdates.at(-1)?.email, "new-address@example.test");
  assert.equal(projectionUpdates.at(-1)?.profileRevision, 2);
  assert.equal(projectionUpdates.at(-1)?.emailAlertsTokenVersion, 2);
});

test("a failed table email transaction leaves sessions and projection untouched", async () => {
  const original = testUser();
  const users = new FakeUsersTable([original]);
  users.transactionError = Object.assign(new Error("conflict"), { statusCode: 409 });
  const { store, sessionUpdates, projectionUpdates } = tableStoreForTest(users);

  await assert.rejects(
    store.changeUserEmail(original, "taken@example.test"),
    (error: unknown) => error instanceof Error && error.message === "email_taken",
  );

  assert.equal(users.entities.get(`id:${original.userId}`)?.email, original.email);
  assert.equal(users.entities.has(`email:${encodedEmail(original.email)}`), true);
  assert.equal(users.entities.has(`email:${encodedEmail("taken@example.test")}`), false);
  assert.deepEqual(sessionUpdates, []);
  assert.deepEqual(projectionUpdates, []);
});

test("rejects a stale table-backed profile replacement instead of silently losing it", async () => {
  const original = testUser();
  const users = new FakeUsersTable([original]);
  const { store } = tableStoreForTest(users);
  const changed = await store.changeUserEmail(original, "new-address@example.test");

  await assert.rejects(
    store.upsertUser({
      ...original,
      nickname: "Stale writer",
      profileRevision: changed.profileRevision,
    }),
    (error: unknown) => error instanceof Error && error.message === "profile_conflict",
  );

  assert.equal(users.entities.get(`id:${original.userId}`)?.email, "new-address@example.test");
  assert.equal(users.entities.get(`id:${original.userId}`)?.nickname, original.nickname);
  assert.equal(users.entities.has(`email:${encodedEmail(original.email)}`), false);
});

test("rebases a concurrent profile mutation after an ETag race", async () => {
  const original = testUser({ languagePreference: "en", nickname: "Original" });
  const users = new FakeUsersTable([original]);
  const { store } = tableStoreForTest(users);
  let injectRace = true;
  users.transactionHook = () => {
    if (!injectRace) return;
    injectRace = false;
    const key = `id:${original.userId}`;
    const current = users.entities.get(key)!;
    users.entities.set(key, {
      ...current,
      nickname: "Concurrent winner",
      profileRevision: 2,
      updatedAt: "2026-07-09T00:00:02.000Z",
      etag: "etag-2",
    });
    throw Object.assign(new Error("precondition"), { statusCode: 412 });
  };

  const changed = await store.mutateUser(original.userId, (current) => ({
    ...current,
    languagePreference: "nl",
    profileRevision: current.profileRevision + 1,
    updatedAt: "2026-07-09T00:00:03.000Z",
  }));

  assert.equal(changed.nickname, "Concurrent winner");
  assert.equal(changed.languagePreference, "nl");
  assert.equal(changed.profileRevision, 3);
});

test("uses point reads for canonical UUID, email, and Stripe indexes", async () => {
  const original = testUser();
  const users = new FakeUsersTable([original]);
  const { store } = tableStoreForTest(users);

  assert.equal((await store.getUser(original.email))?.userId, original.userId);
  assert.equal((await store.getUserByStripeCustomerId(original.stripeCustomerId!))?.userId, original.userId);
  await store.mutateUser(original.userId, (current) => ({
    ...current,
    nickname: "Point read",
    profileRevision: current.profileRevision + 1,
    updatedAt: "2026-07-09T00:00:04.000Z",
  }));

  assert.equal(users.listEntitiesCalls, 0);
});

test("cleans the superseded Stripe customer index after a replacement", async () => {
  const original = testUser();
  const users = new FakeUsersTable([original]);
  const { store } = tableStoreForTest(users);

  const changed = await store.mutateUser(original.userId, (current) => ({
    ...current,
    stripeCustomerId: "cus_replacement",
    profileRevision: current.profileRevision + 1,
    updatedAt: "2026-07-09T00:00:05.000Z",
  }));

  assert.equal(changed.stripeCustomerId, "cus_replacement");
  assert.equal(users.entities.has(`stripe:${encodedEmail(original.stripeCustomerId ?? "")}`), false);
  assert.equal(users.entities.has(`stripe:${encodedEmail("cus_replacement")}`), true);
  assert.equal((await store.getUserByStripeCustomerId("cus_replacement"))?.userId, original.userId);
});

test("fails closed when a non-empty pass receipt ledger is corrupt", async () => {
  const original = testUser();
  const users = new FakeUsersTable([original]);
  users.entities.get(`id:${original.userId}`)!.passReceiptsJson = "{not-json";
  const { store } = tableStoreForTest(users);
  const originalError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      store.getUser(original.email),
      (error: unknown) => error instanceof Error && error.message === "Pass receipt ledger is corrupt",
    );
    await assert.rejects(
      store.getUserByStripeCustomerId(original.stripeCustomerId!),
      (error: unknown) => error instanceof Error && error.message === "Pass receipt ledger is corrupt",
    );
  } finally {
    console.error = originalError;
  }
});

test("migrates a legacy email-keyed profile to canonical UUID and indexes once", async () => {
  const original = testUser();
  const users = new FakeUsersTable([original], { legacy: true });
  const { store } = tableStoreForTest(users);

  const migrated = await store.getUser(original.email);
  const expectedUserId = legacyUserId(original.email);

  assert.equal(migrated?.userId, expectedUserId);
  assert.equal(users.entities.has(`id:${expectedUserId}`), true);
  assert.equal(users.entities.has(`email:${encodedEmail(original.email)}`), true);
  assert.equal(users.entities.has(encodedEmail(original.email)), false);
  assert.equal((await store.getUser(original.email))?.userId, expectedUserId);
  assert.equal(users.listEntitiesCalls, 0);
});

test("commits account deletion even when projection cleanup is deferred", async () => {
  const original = testUser({
    entitlementTier: "none",
    entitlementStatus: "none",
    entitlementExpiresAt: null,
    entitlementPurchasedAt: null,
    passReceipts: [],
    paymentMethod: null,
    paymentBrand: null,
    paymentLast4: null,
  });
  const users = new FakeUsersTable([original]);
  const projectionError = new Error("projection unavailable");
  const { store, projectionSuppressions } = tableStoreForTest(users, { projectionError });

  await store.deleteUser(original.email, { userId: original.userId });

  assert.equal(users.entities.has(`id:${original.userId}`), false);
  assert.equal(users.entities.has(`email:${encodedEmail(original.email)}`), false);
  assert.equal(users.entities.has(`stripe:${encodedEmail(original.stripeCustomerId ?? "")}`), false);
  assert.deepEqual(projectionSuppressions, [{ userId: original.userId, sourceRevision: 2 }]);
  assert.equal(await store.getUser(original.email), null);
});

test("retains only a pseudonymous minimum legal ledger before deleting a paid account", async () => {
  const original = testUser({
    entitlementTier: "radar",
    entitlementStatus: "active",
    entitlementExpiresAt: "2026-07-10T00:00:00.000Z",
    passReceipts: testUser().passReceipts.map((receipt) => ({ ...receipt, expiresAt: "2026-07-10T00:00:00.000Z" })),
  });
  const users = new FakeUsersTable([original]);
  const { store } = tableStoreForTest(users);
  const retentionUntil = "2033-07-22T00:00:00.000Z";

  await store.retainLegalRecords(original, retentionUntil);
  await store.deleteUser(original.email, { userId: original.userId });

  const retained = [...users.entities.values()].find((entity) => entity.recordType === "legal-retention");
  assert.ok(retained);
  assert.equal(retained.retentionUntil, retentionUntil);
  assert.equal(retained.stripeCustomerId, original.stripeCustomerId);
  assert.equal(retained.receiptsJson.includes("pi_existing"), true);
  assert.equal(JSON.stringify(retained).includes(original.email), false);
  assert.equal(JSON.stringify(retained).includes(original.nickname ?? "Test User"), false);
  assert.equal(JSON.stringify(retained).includes(original.paymentLast4 ?? "4242"), false);
  assert.equal("userId" in retained, false);
  assert.equal(users.entities.has(`id:${original.userId}`), false);
  assert.equal(users.entities.has(`email:${encodedEmail(original.email)}`), false);
});

test("legal retention retries are idempotent, extend a deadline, and never shorten it", async () => {
  const original = testUser();
  const users = new FakeUsersTable([original]);
  const { store } = tableStoreForTest(users);

  await store.retainLegalRecords(original, "2033-01-01T00:00:00.000Z");
  const first = [...users.entities.values()].find((entity) => entity.recordType === "legal-retention");
  assert.ok(first);
  const retainedAt = first.retainedAt;

  await store.retainLegalRecords(original, "2033-01-01T00:00:00.000Z");
  await store.retainLegalRecords(original, "2036-01-01T00:00:00.000Z");
  await store.retainLegalRecords(original, "2034-01-01T00:00:00.000Z");

  const retained = [...users.entities.values()].find((entity) => entity.recordType === "legal-retention");
  assert.ok(retained);
  assert.equal(retained.retentionUntil, "2036-01-01T00:00:00.000Z");
  assert.equal(retained.retainedAt, retainedAt);
});

test("refuses to discard paid legal evidence unless the retention write succeeded", async () => {
  const original = testUser({
    entitlementExpiresAt: "2026-07-10T00:00:00.000Z",
    passReceipts: testUser().passReceipts.map((receipt) => ({ ...receipt, expiresAt: "2026-07-10T00:00:00.000Z" })),
  });
  const users = new FakeUsersTable([original]);
  const { store } = tableStoreForTest(users);

  await assert.rejects(
    store.deleteUser(original.email, { userId: original.userId }),
    (error: unknown) => error instanceof Error && error.message === "legal_retention_required",
  );
  assert.equal(users.entities.has(`id:${original.userId}`), true);
});

test("legal retention projection excludes direct login and unnecessary profile data", () => {
  const entity = legalRetentionEntity(testUser(), "2033-07-22T00:00:00.000Z", "2026-07-22T00:00:00.000Z");
  const serialized = JSON.stringify(entity);
  assert.equal(serialized.includes("user@example.test"), false);
  assert.equal(serialized.includes("Test User"), false);
  assert.equal(serialized.includes("4242"), false);
  assert.equal(serialized.includes("deliveryCountry"), false);
  assert.equal(serialized.includes("emailAlerts"), false);
  assert.equal(entity.rowKey.includes(testUser().userId), false);
});

test("anchors seven- and ten-year legal retention to the latest retained evidence timestamp", () => {
  const user = testUser({
    passReceipts: testUser().passReceipts.map((receipt) => ({
      ...receipt,
      purchasedAt: "2026-01-01T00:00:00.000Z",
      acceptedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-04-01T00:00:00.000Z",
      withdrawalRequestedAt: "2026-04-03T12:00:00.000Z",
      withdrawalElectronicConfirmationAcceptedAt: "2026-04-03T12:00:01.000Z",
      withdrawalConfirmationSentAt: "2026-04-04T09:30:00.000Z",
    })),
  });

  assert.equal(legalRetentionUntil(user, 7), "2033-04-04T09:30:00.000Z");
  assert.equal(legalRetentionUntil(user, 10), "2036-04-04T09:30:00.000Z");
});

test("legal retention preserves past and future evidence boundaries without using deletion time", () => {
  const past = testUser({
    passReceipts: testUser().passReceipts.map((receipt) => ({
      ...receipt,
      purchasedAt: "2010-01-01T00:00:00.000Z",
      acceptedAt: "2010-01-01T00:00:00.000Z",
      expiresAt: "2010-04-01T00:00:00.000Z",
    })),
  });
  const future = testUser({
    passReceipts: testUser().passReceipts.map((receipt) => ({
      ...receipt,
      purchasedAt: "2026-01-01T00:00:00.000Z",
      acceptedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2027-01-01T00:00:00.000Z",
    })),
  });

  assert.equal(legalRetentionUntil(past, 7), "2017-04-01T00:00:00.000Z");
  assert.equal(legalRetentionUntil(future, 7), "2034-01-01T00:00:00.000Z");
  assert.throws(() => legalRetentionUntil({ ...future, passReceipts: [] }, 7), /anchor is missing/);
  assert.throws(() => legalRetentionUntil(future, 8 as 7), /exactly 7 or 10/);
});

test("rechecks pass entitlement after a concurrent deletion race", async () => {
  const original = testUser({
    entitlementTier: "none",
    entitlementStatus: "none",
    entitlementExpiresAt: null,
    entitlementPurchasedAt: null,
    passReceipts: [],
    paymentMethod: null,
    paymentBrand: null,
    paymentLast4: null,
  });
  const users = new FakeUsersTable([original]);
  const { store, projectionSuppressions } = tableStoreForTest(users);
  let injectRace = true;
  users.transactionHook = () => {
    if (!injectRace) return;
    injectRace = false;
    const key = `id:${original.userId}`;
    const current = users.entities.get(key)!;
    users.entities.set(key, {
      ...current,
      entitlementTier: "radar",
      entitlementStatus: "active",
      entitlementExpiresAt: "2099-01-01T00:00:00.000Z",
      profileRevision: 2,
      etag: "etag-2",
    });
    throw Object.assign(new Error("precondition"), { statusCode: 412 });
  };

  await assert.rejects(
    store.deleteUser(original.email, { userId: original.userId }),
    (error: unknown) => error instanceof Error && error.message === "active_entitlement",
  );

  assert.equal(users.entities.get(`id:${original.userId}`)?.recordState, "active");
  assert.deepEqual(projectionSuppressions, []);
});

test("returns the committed email change when a derived projection write is temporarily unavailable", async () => {
  const original = testUser();
  const users = new FakeUsersTable([original]);
  const { store } = tableStoreForTest(users, { projectionUpsertError: new Error("projection unavailable") });
  const originalError = console.error;
  console.error = () => {};
  try {
    const changed = await store.changeUserEmail(original, "new-address@example.test");
    assert.equal(changed.email, "new-address@example.test");
    assert.equal(users.entities.get(`id:${original.userId}`)?.email, "new-address@example.test");
  } finally {
    console.error = originalError;
  }
});

test("keeps the same userId through an email change in local memory auth", async () => {
  const auth = new AuthService(authOptions({ exposeDevCode: true }));
  const firstCode = await auth.requestCode("first@example.test", "en");
  assert.ok(firstCode.devCode);
  const verified = await auth.verifyCode("first@example.test", firstCode.devCode, "en");
  const request = {
    headers: { cookie: `${auth.cookieName}=${verified.sessionToken}` },
  } as IncomingMessage;

  const changeCode = await auth.requestEmailChangeCode(request, "second@example.test", "en");
  assert.ok(changeCode.devCode);
  const changed = await auth.updateEmail(request, {
    email: "second@example.test",
    code: changeCode.devCode,
  });

  assert.equal(changed.userId, verified.user.userId);
  assert.equal(changed.emailAlertsTokenVersion, verified.user.emailAlertsTokenVersion + 1);
  assert.equal((await auth.currentUser(request))?.email, "second@example.test");
});

test("account deletion is recoverable when external deletion succeeds before a local failure", async () => {
  const auth = new AuthService(authOptions({ exposeDevCode: true, legalRecordRetentionYears: 7 as const }));
  const code = await auth.requestCode("delete-retry@example.test", "en");
  const verified = await auth.verifyCode("delete-retry@example.test", code.devCode, "en");
  const request = {
    headers: { cookie: `${auth.cookieName}=${verified.sessionToken}` },
  } as IncomingMessage;
  const user = await auth.attachStripeCustomer(request, "cus_delete_retry");
  const purchasedAt = new Date(Date.now() - 60_000).toISOString();
  await auth.applyStripePassPurchase({
    userId: user.userId,
    stripeCustomerId: "cus_delete_retry",
    stripePaymentIntentId: "pi_delete_retry",
    checkoutSessionId: "cs_delete_retry",
    kind: "purchase",
    baseReceiptId: null,
    tier: "alerts",
    purchasedAt,
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    amountEurCents: 500,
    checkoutLocale: "en",
    termsVersion: "2026-07-22",
    privacyVersion: "2026-07-22",
    acceptedAt: purchasedAt,
    immediatePerformanceRequested: true,
    paymentBrand: "visa",
    paymentLast4: "4242",
  });
  await auth.revokeStripePassEntitlement("cus_delete_retry", "pi_delete_retry", "refunded");

  const store = (auth as unknown as {
    store: {
      deleteUser: (email: string, options?: { userId?: string }) => Promise<void>;
      legalRetentions: Map<string, unknown>;
    };
  }).store;
  const originalDelete = store.deleteUser.bind(store);
  let failOnce = true;
  store.deleteUser = async (email, options) => {
    if (failOnce) {
      failOnce = false;
      throw new Error("local table temporarily unavailable");
    }
    await originalDelete(email, options);
  };

  // This happens before the external Stripe customer deletion. A failure here
  // would therefore prevent the external side effect.
  await auth.prepareAccountDeletion(request);
  assert.equal(store.legalRetentions.size, 1);

  // Simulate Stripe succeeding followed by a transient local-table failure.
  await assert.rejects(auth.deleteAccount(request), /temporarily unavailable/);
  assert.equal((await auth.currentUser(request))?.email, "delete-retry@example.test");

  // Replaying the workflow reuses the same legal ledger and completes safely;
  // Stripe customer deletion itself treats an already-missing customer as OK.
  await auth.prepareAccountDeletion(request);
  await auth.deleteAccount(request);
  assert.equal(await auth.currentUser(request), null);
  assert.equal(store.legalRetentions.size, 1);
});

test("binds sessions to immutable userId even if a stale session keeps a reused email", async () => {
  const auth = new AuthService(authOptions({ exposeDevCode: true }));
  const firstCode = await auth.requestCode("reused@example.test", "en");
  const first = await auth.verifyCode("reused@example.test", firstCode.devCode, "en");
  const firstRequest = {
    headers: { cookie: `${auth.cookieName}=${first.sessionToken}` },
  } as IncomingMessage;

  const changeCode = await auth.requestEmailChangeCode(firstRequest, "owner@example.test", "en");
  await auth.updateEmail(firstRequest, { email: "owner@example.test", code: changeCode.devCode });

  // Simulate a post-commit session-email repair failure. Authentication must
  // still follow the immutable userId rather than this stale mutable address.
  const memoryStore = (auth as unknown as {
    store: { sessions: Map<string, { userId: string | null; email: string }> };
  }).store;
  const staleSession = [...memoryStore.sessions.values()].find((session) => session.userId === first.user.userId);
  assert.ok(staleSession);
  staleSession.email = "reused@example.test";

  const secondCode = await auth.requestCode("reused@example.test", "en");
  const second = await auth.verifyCode("reused@example.test", secondCode.devCode, "en");
  assert.notEqual(second.user.userId, first.user.userId);

  const resolved = await auth.currentUser(firstRequest);
  assert.equal(resolved?.userId, first.user.userId);
  assert.equal(resolved?.email, "owner@example.test");
});

test("deduplicates pass receipts and falls back safely when an upgrade is refunded", async () => {
  const auth = new AuthService(authOptions({ exposeDevCode: true }));
  const code = await auth.requestCode("passes@example.test", "en");
  const verified = await auth.verifyCode("passes@example.test", code.devCode, "en");
  const request = {
    headers: { cookie: `${auth.cookieName}=${verified.sessionToken}` },
  } as IncomingMessage;
  const customer = await auth.attachStripeCustomer(request, "cus_passes");
  const purchasedAt = new Date(Date.now() - 60_000).toISOString();
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const basePurchase = {
    userId: customer.userId,
    stripeCustomerId: "cus_passes",
    stripePaymentIntentId: "pi_alerts",
    checkoutSessionId: "cs_test_alerts",
    kind: "purchase" as const,
    baseReceiptId: null,
    tier: "alerts" as const,
    purchasedAt,
    expiresAt,
    amountEurCents: 500,
    checkoutLocale: "en" as const,
    termsVersion: "2026-07-22",
    privacyVersion: "2026-07-22",
    acceptedAt: purchasedAt,
    immediatePerformanceRequested: true as const,
    paymentBrand: "visa",
    paymentLast4: "4242",
  };

  const purchased = await auth.applyStripePassPurchase(basePurchase);
  assert.equal(purchased?.entitlementTier, "alerts");
  assert.equal(purchased?.passReceipts.length, 1);
  const revisionAfterPurchase = purchased!.profileRevision;

  const replayed = await auth.applyStripePassPurchase({
    ...basePurchase,
    purchasedAt: new Date(Date.now() + 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
  });
  assert.equal(replayed?.profileRevision, revisionAfterPurchase);
  assert.equal(replayed?.passReceipts.length, 1);
  assert.equal(replayed?.entitlementExpiresAt, expiresAt);

  const upgraded = await auth.applyStripePassPurchase({
    ...basePurchase,
    stripePaymentIntentId: "pi_upgrade",
    kind: "upgrade",
    baseReceiptId: "pi_alerts",
    tier: "radar",
    purchasedAt: new Date(Date.now() - 30_000).toISOString(),
    paymentLast4: "4444",
  });
  assert.equal(upgraded?.entitlementTier, "radar");
  assert.equal(upgraded?.passReceipts.length, 2);

  const fallback = await auth.revokeStripePassEntitlement("cus_passes", "pi_upgrade", "refunded");
  assert.equal(fallback?.entitlementTier, "alerts");
  assert.equal(fallback?.entitlementStatus, "active");
  assert.equal(fallback?.entitlementExpiresAt, expiresAt);
  assert.equal(fallback?.paymentLast4, "4242");

  const refundedReplay = await auth.applyStripePassPurchase({
    ...basePurchase,
    stripePaymentIntentId: "pi_upgrade",
    kind: "upgrade",
    baseReceiptId: "pi_alerts",
    tier: "radar",
    purchasedAt: new Date(Date.now() - 30_000).toISOString(),
  });
  assert.equal(refundedReplay?.entitlementTier, "alerts");
  assert.equal(refundedReplay?.passReceipts.find((receipt) => receipt.id === "pi_upgrade")?.status, "refunded");

  const fullyRefunded = await auth.revokeStripePassEntitlement("cus_passes", "pi_alerts", "refunded");
  assert.equal(fullyRefunded?.entitlementTier, "none");
  assert.equal(fullyRefunded?.entitlementStatus, "refunded");
  assert.equal(hasEmailAlertAccess(fullyRefunded!), false);
  assert.equal(hasRealtimeStockAccess(fullyRefunded!), false);
});

test("toggles stock alert emails without changing pass access", async () => {
  const auth = new AuthService(authOptions({ exposeDevCode: true }));
  const code = await auth.requestCode("alerts@example.test", "en");
  const verified = await auth.verifyCode("alerts@example.test", code.devCode, "en");
  const request = {
    headers: { cookie: `${auth.cookieName}=${verified.sessionToken}` },
  } as IncomingMessage;

  const disabled = await auth.updateEmailAlerts(request, false);
  assert.equal(disabled.emailAlertsEnabled, false);
  assert.equal(disabled.emailAlertsTokenVersion, 2);
  assert.equal(disabled.entitlementTier, "none");

  const enabled = await auth.updateEmailAlerts(request, true);
  assert.equal(enabled.emailAlertsEnabled, true);
  assert.equal(enabled.emailAlertsTokenVersion, 3);

  const unchanged = await auth.updateEmailAlerts(request, true);
  assert.equal(unchanged.profileRevision, enabled.profileRevision);
  assert.equal(unchanged.emailAlertsTokenVersion, 3);
});

test("one-click unsubscribe is idempotent and re-enabling invalidates the old link", async () => {
  const signingKey = "0123456789abcdef0123456789abcdef";
  const auth = new AuthService(authOptions({ exposeDevCode: true, unsubscribeSigningKey: signingKey }));
  const code = await auth.requestCode("one-click@example.test", "en");
  const verified = await auth.verifyCode("one-click@example.test", code.devCode, "en");
  const request = {
    headers: { cookie: `${auth.cookieName}=${verified.sessionToken}` },
  } as IncomingMessage;
  const token = createAlertUnsubscribeToken(
    signingKey,
    verified.user.userId,
    verified.user.emailAlertsTokenVersion,
  );

  await auth.unsubscribeEmailAlerts(token);
  const disabled = await auth.currentUser(request);
  assert.equal(disabled?.emailAlertsEnabled, false);
  assert.equal(disabled?.emailAlertsTokenVersion, 2);

  await auth.unsubscribeEmailAlerts(token);
  const replayed = await auth.currentUser(request);
  assert.equal(replayed?.profileRevision, disabled?.profileRevision);

  const enabled = await auth.updateEmailAlerts(request, true);
  assert.equal(enabled.emailAlertsTokenVersion, 3);
  await auth.unsubscribeEmailAlerts(token);
  assert.equal((await auth.currentUser(request))?.emailAlertsEnabled, true);
});

test("changing email invalidates unsubscribe links sent to the previous address", async () => {
  const signingKey = "0123456789abcdef0123456789abcdef";
  const auth = new AuthService(authOptions({ exposeDevCode: true, unsubscribeSigningKey: signingKey }));
  const firstCode = await auth.requestCode("old-link@example.test", "en");
  const verified = await auth.verifyCode("old-link@example.test", firstCode.devCode, "en");
  const request = {
    headers: { cookie: `${auth.cookieName}=${verified.sessionToken}` },
  } as IncomingMessage;
  const oldToken = createAlertUnsubscribeToken(
    signingKey,
    verified.user.userId,
    verified.user.emailAlertsTokenVersion,
  );

  const changeCode = await auth.requestEmailChangeCode(request, "new-link@example.test", "en");
  await auth.updateEmail(request, { email: "new-link@example.test", code: changeCode.devCode });
  await auth.unsubscribeEmailAlerts(oldToken);

  const current = await auth.currentUser(request);
  assert.equal(current?.email, "new-link@example.test");
  assert.equal(current?.emailAlertsEnabled, true);
  assert.equal(current?.emailAlertsTokenVersion, 2);
});

test("serializes concurrent invalid OTP attempts with CAS", async () => {
  const auth = new AuthService(authOptions({ exposeDevCode: true, codeMaxAttempts: 3 }));
  const issued = await auth.requestCode("attempts@example.test", "en");
  assert.ok(issued.devCode);

  const results = await Promise.allSettled([
    auth.verifyCode("attempts@example.test", "000001", "en"),
    auth.verifyCode("attempts@example.test", "000002", "en"),
    auth.verifyCode("attempts@example.test", "000003", "en"),
  ]);
  assert.equal(results.every((result) => result.status === "rejected"), true);
  await assert.rejects(
    auth.verifyCode("attempts@example.test", issued.devCode, "en"),
    (error: unknown) => error instanceof Error && error.message === "too_many_code_attempts",
  );
});

test("allows a verification code to create only one session under concurrent use", async () => {
  const auth = new AuthService(authOptions({ exposeDevCode: true }));
  const issued = await auth.requestCode("one-time@example.test", "en");
  assert.ok(issued.devCode);

  const results = await Promise.allSettled([
    auth.verifyCode("one-time@example.test", issued.devCode, "en"),
    auth.verifyCode("one-time@example.test", issued.devCode, "en"),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
});
