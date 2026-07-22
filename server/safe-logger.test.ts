import assert from "node:assert/strict";
import { test } from "node:test";
import { hashProviderIdentifier, logError, logWarn } from "./safe-logger.js";

test("sanitized logger never emits error messages, stacks, PII, RowKeys, tokens or full provider IDs", () => {
  const email = "private.person@example.com";
  const rowKey = Buffer.from(email, "utf8").toString("base64url");
  const token = "eyJhbGciOiJIUzI1NiJ9.private-token.signature";
  const paymentIntentId = "pi_1234567890abcdefghijklmnopqrstuvwxyz";
  const refundId = "re_1234567890abcdefghijklmnopqrstuvwxyz";
  const error = Object.assign(
    new Error(`request failed email=${email} rowKey=${rowKey} token=${token} payment=${paymentIntentId}`),
    {
      code: "AuthorizationFailure",
      statusCode: 403,
      requestId: "req-7b2ce4dd",
      traceId: "trace-92ed1780",
      paymentIntentId,
      response: { request: { url: `https://table.example/${rowKey}?token=${token}` } },
    },
  );

  const calls: unknown[][] = [];
  const original = console.error;
  console.error = (...values: unknown[]) => calls.push(values);
  try {
    logError("storage_request_failed", error, {
      paymentIntentHash: hashProviderIdentifier(paymentIntentId),
      refundHash: hashProviderIdentifier(refundId),
    });
  } finally {
    console.error = original;
  }

  assert.equal(calls.length, 1);
  const output = JSON.stringify(calls);
  for (const secret of [email, rowKey, token, paymentIntentId, refundId, error.message, error.stack!]) {
    assert.equal(output.includes(secret), false, `log leaked ${secret}`);
  }
  const record = JSON.parse(String(calls[0]![0])) as Record<string, unknown>;
  assert.deepEqual(record, {
    level: "error",
    event: "storage_request_failed",
    error_class: "Error",
    error_code: "AuthorizationFailure",
    request_id: "req-7b2ce4dd",
    status: 403,
    trace_id: "trace-92ed1780",
    payment_intent_hash: hashProviderIdentifier(paymentIntentId),
    refund_hash: hashProviderIdentifier(refundId),
  });
});

test("sanitized logger drops unsafe metadata and survives hostile getters", () => {
  const token = ["sk", "live", "not-a-real-key"].join("_");
  const hostile = new Proxy({}, {
    get(_target, property) {
      if (property === "code") return `bad code ${token}`;
      if (property === "status") return 200;
      if (property === "requestId") return `request id ${token}`;
      if (property === "traceId") throw new Error(`getter leaked ${token}`);
      return undefined;
    },
    getPrototypeOf() {
      throw new Error(`prototype leaked ${token}`);
    },
  });
  const calls: unknown[][] = [];
  const original = console.warn;
  console.warn = (...values: unknown[]) => calls.push(values);
  try {
    logWarn("unsafe_metadata_dropped", hostile, { paymentIntentHash: token });
  } finally {
    console.warn = original;
  }

  const output = JSON.stringify(calls);
  assert.equal(output.includes(token), false);
  assert.deepEqual(JSON.parse(String(calls[0]![0])), {
    level: "warn",
    event: "unsafe_metadata_dropped",
    status: 200,
  });
});

test("Stripe IDs and bearer tokens are rejected even when placed in allow-listed error fields", () => {
  const secrets = [
    "pi_1234567890abcdefghijklmnopqrstuvwxyz",
    ["sk", "live", "not-a-real-key"].join("_"),
    "eyJhbGciOiJIUzI1NiJ9.private-token.signature",
  ];
  const calls: unknown[][] = [];
  const original = console.error;
  console.error = (...values: unknown[]) => calls.push(values);
  try {
    for (const secret of secrets) {
      logError("sensitive_metadata_dropped", {
        code: secret,
        requestId: secret,
        traceId: secret,
        status: 500,
      });
    }
  } finally {
    console.error = original;
  }
  const output = JSON.stringify(calls);
  for (const secret of secrets) assert.equal(output.includes(secret), false);
  for (const [serialized] of calls) {
    assert.deepEqual(JSON.parse(String(serialized)), {
      level: "error",
      event: "sensitive_metadata_dropped",
      error_class: "Object",
      status: 500,
    });
  }
});

test("provider identifier hashes are deterministic, short and do not contain the source ID", () => {
  const id = "pi_1234567890abcdefghijklmnopqrstuvwxyz";
  const first = hashProviderIdentifier(id);
  assert.equal(first, hashProviderIdentifier(id));
  assert.match(first!, /^[a-f0-9]{16}$/);
  assert.equal(first!.includes(id), false);
  assert.notEqual(first, hashProviderIdentifier(`${id}x`));
  assert.equal(hashProviderIdentifier(""), undefined);
});
