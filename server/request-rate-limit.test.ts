import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import test from "node:test";
import { BoundedRateLimiter, trustedClientAddress } from "./request-rate-limit.js";

function request(forwardedFor: string | undefined, remoteAddress = "::ffff:127.0.0.1"): IncomingMessage {
  return {
    headers: forwardedFor === undefined ? {} : { "x-forwarded-for": forwardedFor },
    socket: { remoteAddress },
  } as unknown as IncomingMessage;
}

test("uses only the rightmost ACA-appended forwarded address", () => {
  assert.equal(trustedClientAddress(request("203.0.113.7, 198.51.100.2"), true), "198.51.100.2");
  assert.equal(trustedClientAddress(request("forged, 2001:db8::7"), true), "2001:db8::7");
});

test("ignores forwarded headers locally and rejects an invalid trusted suffix", () => {
  assert.equal(trustedClientAddress(request("203.0.113.7"), false), "127.0.0.1");
  assert.equal(trustedClientAddress(request("203.0.113.7, forged"), true), "127.0.0.1");
});

test("bounded limiter enforces limits, retry time, expiry, and a hard map cap", () => {
  const limiter = new BoundedRateLimiter(60_000, 2);
  assert.deepEqual(limiter.check("a", 1, 1_000), { allowed: true });
  assert.deepEqual(limiter.check("a", 1, 2_000), { allowed: false, retryAfterSeconds: 59 });
  assert.deepEqual(limiter.check("b", 1, 2_000), { allowed: true });
  assert.equal(limiter.size, 2);
  assert.deepEqual(limiter.check("c", 1, 2_000), { allowed: true });
  assert.equal(limiter.size, 2);
  assert.deepEqual(limiter.check("a", 1, 61_001), { allowed: true });
});
