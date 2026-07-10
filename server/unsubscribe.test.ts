import assert from "node:assert/strict";
import test from "node:test";
import {
  createAlertUnsubscribeToken,
  verifyAlertUnsubscribeToken,
} from "./unsubscribe.js";

const SECRET = "0123456789abcdef0123456789abcdef";
const USER_ID = "123e4567-e89b-12d3-a456-426614174000";
const EXPECTED = "djEKYWxlcnRzLXVuc3Vic2NyaWJlCjEyM2U0NTY3LWU4OWItMTJkMy1hNDU2LTQyNjYxNDE3NDAwMAo3.XqzD43DQ_6O4EoMUrW4BYdm3bNtM-Y5v1RFLAKE0FYQ";

test("matches the shared Python/TypeScript unsubscribe token vector", () => {
  assert.equal(createAlertUnsubscribeToken(SECRET, USER_ID, 7), EXPECTED);
  assert.deepEqual(verifyAlertUnsubscribeToken(SECRET, EXPECTED), {
    userId: USER_ID,
    tokenVersion: 7,
  });
});

test("rejects tampered or malformed unsubscribe tokens", () => {
  assert.equal(verifyAlertUnsubscribeToken(SECRET, `${EXPECTED.slice(0, -1)}A`), null);
  assert.equal(verifyAlertUnsubscribeToken(SECRET, "not-a-token"), null);
  assert.equal(verifyAlertUnsubscribeToken(`${SECRET}x`, EXPECTED), null);
  assert.throws(() => createAlertUnsubscribeToken("short", USER_ID, 1));
  assert.throws(() => createAlertUnsubscribeToken(SECRET, "not-a-uuid", 1));
  assert.throws(() => createAlertUnsubscribeToken(SECRET, USER_ID, 0));
});
