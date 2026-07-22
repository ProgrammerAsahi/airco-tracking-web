import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import test from "node:test";
import {
  TRUSTED_NON_BROWSER_HEADER,
  TRUSTED_NON_BROWSER_VALUE,
  unsafeRequestIsTrusted,
} from "./request-security.js";

function request(headers: Record<string, string> = {}, encrypted = false): IncomingMessage {
  return { headers, socket: { encrypted } } as unknown as IncomingMessage;
}

test("accepts an exact same-origin browser mutation", () => {
  assert.equal(unsafeRequestIsTrusted(request({
    host: "airco-tracker.eu",
    origin: "https://airco-tracker.eu",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
  }, true)), true);
});

test("uses forwarded origin components behind the Azure ingress proxy", () => {
  assert.equal(unsafeRequestIsTrusted(request({
    host: "internal.local",
    origin: "https://airco-tracker.eu",
    "sec-fetch-site": "same-origin",
    "x-forwarded-host": "airco-tracker.eu, internal.local",
    "x-forwarded-proto": "https, http",
  })), true);
});

test("rejects cross-origin, same-site and null origins", () => {
  for (const [origin, site] of [
    ["https://evil.example", "cross-site"],
    ["https://www.airco-tracker.eu", "same-site"],
    ["null", "same-origin"],
  ]) {
    assert.equal(unsafeRequestIsTrusted(request({
      host: "airco-tracker.eu",
      origin,
      "sec-fetch-site": site,
    }, true)), false);
  }
});

test("fails closed for browser-shaped mutations without Origin", () => {
  assert.equal(unsafeRequestIsTrusted(request({
    host: "airco-tracker.eu",
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
  }, true)), false);
});

test("requires an explicit custom-header mechanism for non-browser clients", () => {
  assert.equal(unsafeRequestIsTrusted(request({ host: "airco-tracker.eu" }, true)), false);
  assert.equal(unsafeRequestIsTrusted(request({
    host: "airco-tracker.eu",
    [TRUSTED_NON_BROWSER_HEADER]: TRUSTED_NON_BROWSER_VALUE,
  }, true)), true);
  assert.equal(unsafeRequestIsTrusted(request({
    host: "airco-tracker.eu",
    origin: "https://evil.example",
    "sec-fetch-site": "cross-site",
    [TRUSTED_NON_BROWSER_HEADER]: TRUSTED_NON_BROWSER_VALUE,
  }, true)), false);
});
