import assert from "node:assert/strict";
import test from "node:test";
import { parseInventory } from "./inventory.js";

const validProduct = {
  site: "Shop",
  name: "Airco 9000 BTU",
  url: "https://shop.test/airco",
  available: true,
  price_eur: 399.0,
  delivery: "Morgen in huis",
  btu: 9000,
  presale: false,
};

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

test("rejects non-integer refresh_interval_seconds", () => {
  const malformed = structuredClone(validSnapshot);
  Reflect.set(malformed, "refresh_interval_seconds", 10.5);
  assert.throws(() => parseInventory(JSON.stringify(malformed)), /Invalid inventory top-level/);
});

test("rejects an invalid updated_at timestamp", () => {
  const malformed = structuredClone(validSnapshot);
  Reflect.set(malformed, "updated_at", "not-a-date");
  assert.throws(() => parseInventory(JSON.stringify(malformed)), /Invalid inventory top-level/);
});

test("accepts null updated_at and null timestamps", () => {
  const nullable = structuredClone(validSnapshot);
  Reflect.set(nullable, "updated_at", null);
  Reflect.set(nullable.sites.Shop, "last_attempt_at", null);
  Reflect.set(nullable.sites.Shop, "last_success_at", null);
  const snapshot = parseInventory(JSON.stringify(nullable));
  assert.equal(snapshot.updated_at, null);
  assert.equal(snapshot.sites.Shop.last_attempt_at, null);
});

test("rejects site_count that does not match actual site entries", () => {
  const mismatched = structuredClone(validSnapshot);
  Reflect.set(mismatched, "site_count", 99);
  assert.throws(() => parseInventory(JSON.stringify(mismatched)), /site_count mismatch/);
});

test("rejects a site with non-boolean stale", () => {
  const malformed = structuredClone(validSnapshot);
  Reflect.set(malformed.sites.Shop, "stale", "yes");
  assert.throws(() => parseInventory(JSON.stringify(malformed)), /Invalid inventory site/);
});

test("rejects a site with an invalid status", () => {
  const malformed = structuredClone(validSnapshot);
  Reflect.set(malformed.sites.Shop, "status", "unknown");
  assert.throws(() => parseInventory(JSON.stringify(malformed)), /Invalid inventory site/);
});

test("accepts valid products in the products array", () => {
  const withProducts = structuredClone(validSnapshot);
  Reflect.set(withProducts.sites.Shop, "products", [validProduct]);
  const snapshot = parseInventory(JSON.stringify(withProducts));
  assert.equal(snapshot.sites.Shop.products.length, 1);
  assert.equal(snapshot.sites.Shop.products[0].btu, 9000);
});

test("rejects a product with a non-integer btu", () => {
  const withBadProduct = structuredClone(validSnapshot);
  const badProduct = { ...validProduct, btu: 9000.5 };
  Reflect.set(withBadProduct.sites.Shop, "products", [badProduct]);
  assert.throws(() => parseInventory(JSON.stringify(withBadProduct)), /Invalid inventory site/);
});

test("rejects a product missing a required url", () => {
  const withBadProduct = structuredClone(validSnapshot);
  const badProduct = { ...validProduct, url: "" };
  Reflect.set(withBadProduct.sites.Shop, "products", [badProduct]);
  assert.throws(() => parseInventory(JSON.stringify(withBadProduct)), /Invalid inventory site/);
});

test("rejects malformed JSON", () => {
  assert.throws(() => parseInventory("{not json"), SyntaxError);
});

test("rejects an array as the top-level value", () => {
  assert.throws(() => parseInventory("[]"), /Unsupported inventory snapshot/);
});
