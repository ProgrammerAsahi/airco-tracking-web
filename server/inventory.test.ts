import assert from "node:assert/strict";
import test from "node:test";
import { parseInventory } from "./inventory.js";

const validSnapshot = {
  version: 1,
  updated_at: "2026-07-03T15:51:05+00:00",
  refresh_interval_seconds: 600,
  site_count: 1,
  stale_site_count: 0,
  available_product_count: 2,
  sites: {
    Shop: {
      status: "ok",
      stale: false,
      last_attempt_at: "2026-07-03T15:51:05+00:00",
      last_success_at: "2026-07-03T15:51:05+00:00",
      available_product_count: 2,
      products: [],
    },
  },
};

test("accepts the backend inventory v1 contract", () => {
  const snapshot = parseInventory(JSON.stringify(validSnapshot));
  assert.equal(snapshot.available_product_count, 2);
  assert.equal(snapshot.sites.Shop.status, "ok");
});

test("rejects malformed site inventory", () => {
  const malformed = structuredClone(validSnapshot);
  Reflect.set(malformed.sites.Shop, "available_product_count", -1);
  assert.throws(() => parseInventory(JSON.stringify(malformed)), /Invalid inventory site/);
});

test("rejects an unsupported schema version", () => {
  assert.throws(
    () => parseInventory(JSON.stringify({ ...validSnapshot, version: 2 })),
    /Unsupported inventory snapshot/,
  );
});
