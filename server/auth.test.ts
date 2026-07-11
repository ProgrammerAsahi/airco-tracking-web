import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import test from "node:test";
import {
  AuthService,
  AlertRecipientProjectionStore,
  TableAuthStore,
  alertRecipientEntity,
  alertRecipientPartitionKey,
  createUserId,
  createVerificationHash,
  generateVerificationCode,
  legacyUserId,
  verifyVerificationHash,
  verificationEmailMessage,
  type StoredUserProfile,
} from "./auth.js";
import {
  isValidEmail,
  isDeliveryCountry,
  isLanguagePreference,
  hasEmailAlertAccess,
  hasRealtimeStockAccess,
  normalizeEmail,
  subscriptionChangeDirection,
  subscriptionIsActive,
  userInitials,
  validateNickname,
} from "../shared/auth.js";
import { createAlertUnsubscribeToken } from "./unsubscribe.js";

function testUser(overrides: Partial<StoredUserProfile> = {}): StoredUserProfile {
  return {
    userId: "95bc3d32-8f2e-4cf0-a924-731efb4ebcf2",
    profileRevision: 1,
    email: "user@example.test",
    nickname: "Test User",
    emailAlertsEnabled: true,
    emailAlertsTokenVersion: 1,
    subscriptionPlan: "monthly_priority",
    subscriptionStatus: "active",
    subscriptionCurrentPeriodEnd: "2099-01-01T00:00:00.000Z",
    subscriptionCancelAtPeriodEnd: false,
    pendingSubscriptionPlan: null,
    pendingSubscriptionEffectiveAt: null,
    paymentMethod: "card",
    paymentBrand: "VISA",
    paymentLast4: "4242",
    stripeCustomerId: "cus_secret",
    stripeSubscriptionId: "sub_secret",
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
    subscriptionCurrentPeriodEnd: user.subscriptionCurrentPeriodEnd ?? "",
    pendingSubscriptionPlan: user.pendingSubscriptionPlan ?? "",
    pendingSubscriptionEffectiveAt: user.pendingSubscriptionEffectiveAt ?? "",
    paymentMethod: user.paymentMethod ?? "",
    paymentBrand: user.paymentBrand ?? "",
    paymentLast4: user.paymentLast4 ?? "",
    stripeCustomerId: user.stripeCustomerId ?? "",
    stripeSubscriptionId: user.stripeSubscriptionId ?? "",
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

test("evaluates subscription entitlements through the current period", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();
  const emailOnly = {
    subscriptionPlan: "weekly_basic" as const,
    subscriptionStatus: "active" as const,
    subscriptionCurrentPeriodEnd: future,
    emailAlertsEnabled: true,
  };
  const stock = {
    subscriptionPlan: "monthly_priority" as const,
    subscriptionStatus: "active" as const,
    subscriptionCurrentPeriodEnd: future,
  };
  const canceledButValid = {
    subscriptionPlan: "monthly_priority" as const,
    subscriptionStatus: "canceled" as const,
    subscriptionCurrentPeriodEnd: future,
  };
  const expired = {
    subscriptionPlan: "monthly_priority" as const,
    subscriptionStatus: "active" as const,
    subscriptionCurrentPeriodEnd: past,
  };

  assert.equal(subscriptionIsActive(emailOnly), true);
  assert.equal(hasEmailAlertAccess(emailOnly), true);
  assert.equal(hasEmailAlertAccess({ ...emailOnly, emailAlertsEnabled: false }), false);
  assert.equal(hasRealtimeStockAccess(emailOnly), false);
  assert.equal(hasRealtimeStockAccess(stock), true);
  assert.equal(hasRealtimeStockAccess(canceledButValid), true);
  assert.equal(subscriptionIsActive(expired), false);
  assert.equal(hasRealtimeStockAccess(expired), false);
  assert.equal(subscriptionChangeDirection("weekly_basic", "weekly_priority"), "upgrade");
  assert.equal(subscriptionChangeDirection("monthly_priority", "monthly_basic"), "downgrade");
  assert.equal(subscriptionChangeDirection("weekly_basic", "monthly_basic"), "lateral");
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
  const hash = createVerificationHash("User@Example.com", "123456", salt);
  assert.equal(hash, createVerificationHash("user@example.com", "123456", salt));
  assert.equal(verifyVerificationHash("user@example.com", "123456", salt, hash), true);
  assert.equal(verifyVerificationHash("user@example.com", "000000", salt, hash), false);
});

test("fails closed without logging an auth code when ACS is not configured", async () => {
  const auth = new AuthService();
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
    "currentPeriodEnd",
    "deliveryCountry",
    "email",
    "enabled",
    "language",
    "partitionKey",
    "rowKey",
    "status",
    "subscriptionPlan",
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
    subscriptionCurrentPeriodEnd: "2026-07-08T00:00:00.000Z",
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

test("commits account deletion before suppressing the alert projection", async () => {
  const original = testUser({
    subscriptionPlan: "none",
    subscriptionStatus: "none",
    subscriptionCurrentPeriodEnd: null,
  });
  const users = new FakeUsersTable([original]);
  const projectionError = new Error("projection unavailable");
  const { store, projectionSuppressions } = tableStoreForTest(users, { projectionError });

  await assert.rejects(
    store.deleteUser(original.email, { userId: original.userId }),
    projectionError,
  );

  assert.equal(users.entities.get(`id:${original.userId}`)?.recordState, "deleted");
  assert.equal(users.entities.get(`email:${encodedEmail(original.email)}`)?.recordState, "superseded");
  assert.deepEqual(projectionSuppressions, [{ userId: original.userId, sourceRevision: 2 }]);
  assert.equal(await store.getUser(original.email), null);
});

test("rechecks subscription entitlement after a concurrent deletion race", async () => {
  const original = testUser({
    subscriptionPlan: "none",
    subscriptionStatus: "none",
    subscriptionCurrentPeriodEnd: null,
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
      subscriptionPlan: "monthly_priority",
      subscriptionStatus: "active",
      subscriptionCurrentPeriodEnd: "2099-01-01T00:00:00.000Z",
      profileRevision: 2,
      etag: "etag-2",
    });
    throw Object.assign(new Error("precondition"), { statusCode: 412 });
  };

  await assert.rejects(
    store.deleteUser(original.email, { userId: original.userId }),
    (error: unknown) => error instanceof Error && error.message === "active_subscription",
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
  const auth = new AuthService({ exposeDevCode: true });
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

test("toggles stock alert emails without changing subscription access", async () => {
  const auth = new AuthService({ exposeDevCode: true });
  const code = await auth.requestCode("alerts@example.test", "en");
  const verified = await auth.verifyCode("alerts@example.test", code.devCode, "en");
  const request = {
    headers: { cookie: `${auth.cookieName}=${verified.sessionToken}` },
  } as IncomingMessage;

  const disabled = await auth.updateEmailAlerts(request, false);
  assert.equal(disabled.emailAlertsEnabled, false);
  assert.equal(disabled.emailAlertsTokenVersion, 2);
  assert.equal(disabled.subscriptionPlan, "none");

  const enabled = await auth.updateEmailAlerts(request, true);
  assert.equal(enabled.emailAlertsEnabled, true);
  assert.equal(enabled.emailAlertsTokenVersion, 3);

  const unchanged = await auth.updateEmailAlerts(request, true);
  assert.equal(unchanged.profileRevision, enabled.profileRevision);
  assert.equal(unchanged.emailAlertsTokenVersion, 3);
});

test("one-click unsubscribe is idempotent and re-enabling invalidates the old link", async () => {
  const signingKey = "0123456789abcdef0123456789abcdef";
  const auth = new AuthService({ exposeDevCode: true, unsubscribeSigningKey: signingKey });
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
  const auth = new AuthService({ exposeDevCode: true, unsubscribeSigningKey: signingKey });
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
  const auth = new AuthService({ exposeDevCode: true, codeMaxAttempts: 3 });
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
  const auth = new AuthService({ exposeDevCode: true });
  const issued = await auth.requestCode("one-time@example.test", "en");
  assert.ok(issued.devCode);

  const results = await Promise.allSettled([
    auth.verifyCode("one-time@example.test", issued.devCode, "en"),
    auth.verifyCode("one-time@example.test", issued.devCode, "en"),
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
});
