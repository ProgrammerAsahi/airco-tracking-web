import assert from "node:assert/strict";
import test from "node:test";
import { productExternalUrl } from "../shared/inventory.js";
import { parseInventory } from "./inventory.js";

const validProduct = {
  site: "Shop",
  country: "nl",
  site_id: "nl:Shop",
  name: "Airco 9000 BTU",
  url: "https://shop.test/airco",
  available: true,
  price_eur: 399.0,
  delivery: "Morgen in huis",
  btu: 9000,
  presale: false,
};

const validPresaleProduct = {
  ...validProduct,
  name: "Airco 12000 BTU presale",
  url: "https://shop.test/airco-presale",
  presale: true,
};

const validSnapshot = {
  version: 1,
  updated_at: "2026-07-03T15:51:05+00:00",
  refresh_interval_seconds: 600,
  site_count: 1,
  verified_site_count: 1,
  stale_site_count: 0,
  available_product_count: 2,
  immediate_product_count: 1,
  presale_product_count: 1,
  inventory_confidence: "verified",
  stale_diagnostic_max_age_seconds: 86400,
  sites: {
    "nl:Shop": {
      status: "ok",
      stale: false,
      freshness: "verified",
      counts_toward_totals: true,
      stale_age_seconds: 0,
      stale_too_old: false,
      country: "nl",
      site: "Shop",
      site_id: "nl:Shop",
      delivery_coverage: ["eu", "ch"],
      last_attempt_at: "2026-07-03T15:51:05+00:00",
      last_success_at: "2026-07-03T15:51:05+00:00",
      available_product_count: 2,
      immediate_product_count: 1,
      presale_product_count: 1,
      products: [validProduct, validPresaleProduct],
    },
  },
};

test("accepts the backend inventory v1 contract", () => {
  const snapshot = parseInventory(JSON.stringify(validSnapshot));
  assert.equal(snapshot.available_product_count, 2);
  assert.equal(snapshot.immediate_product_count, 1);
  assert.equal(snapshot.presale_product_count, 1);
  assert.equal(snapshot.sites["nl:Shop"].status, "ok");
  assert.deepEqual(snapshot.sites["nl:Shop"].delivery_coverage, ["eu", "ch"]);
});

test("rejects malformed site inventory", () => {
  const malformed = structuredClone(validSnapshot);
  Reflect.set(malformed.sites["nl:Shop"], "available_product_count", -1);
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
  Reflect.set(nullable.sites["nl:Shop"], "last_attempt_at", null);
  Reflect.set(nullable.sites["nl:Shop"], "last_success_at", null);
  const snapshot = parseInventory(JSON.stringify(nullable));
  assert.equal(snapshot.updated_at, null);
  assert.equal(snapshot.sites["nl:Shop"].last_attempt_at, null);
});

test("rejects site_count that does not match actual site entries", () => {
  const mismatched = structuredClone(validSnapshot);
  Reflect.set(mismatched, "site_count", 99);
  assert.throws(() => parseInventory(JSON.stringify(mismatched)), /site_count mismatch/);
});

test("rejects a site with non-boolean stale", () => {
  const malformed = structuredClone(validSnapshot);
  Reflect.set(malformed.sites["nl:Shop"], "stale", "yes");
  assert.throws(() => parseInventory(JSON.stringify(malformed)), /Invalid inventory site/);
});

test("rejects a site with an invalid status", () => {
  const malformed = structuredClone(validSnapshot);
  Reflect.set(malformed.sites["nl:Shop"], "status", "unknown");
  assert.throws(() => parseInventory(JSON.stringify(malformed)), /Invalid inventory site/);
});

test("rejects invalid delivery coverage tokens", () => {
  const malformed = structuredClone(validSnapshot);
  Reflect.set(malformed.sites["nl:Shop"], "delivery_coverage", ["europe"]);
  assert.throws(() => parseInventory(JSON.stringify(malformed)), /Invalid inventory site/);
});

test("accepts valid products in the products array", () => {
  const withProducts = structuredClone(validSnapshot);
  const snapshot = parseInventory(JSON.stringify(withProducts));
  assert.equal(snapshot.sites["nl:Shop"].products.length, 2);
  assert.equal(snapshot.sites["nl:Shop"].products[0].btu, 9000);
});

test("accepts an optional HTTPS affiliate URL without replacing the canonical URL", () => {
  const withAffiliateUrl = structuredClone(validSnapshot);
  const canonicalUrl = withAffiliateUrl.sites["nl:Shop"].products[0].url;
  Reflect.set(
    withAffiliateUrl.sites["nl:Shop"].products[0],
    "affiliate_url",
    "https://affiliate.test/click?product=airco",
  );

  const snapshot = parseInventory(JSON.stringify(withAffiliateUrl));
  const product = snapshot.sites["nl:Shop"].products[0];
  assert.equal(product.url, canonicalUrl);
  assert.equal(product.affiliate_url, "https://affiliate.test/click?product=airco");
  assert.equal(productExternalUrl(product), product.affiliate_url);
});

test("falls back to the canonical URL when no affiliate URL is present", () => {
  assert.equal(productExternalUrl(validProduct), validProduct.url);
});

test("rejects a non-HTTPS affiliate URL", () => {
  const withBadAffiliateUrl = structuredClone(validSnapshot);
  Reflect.set(
    withBadAffiliateUrl.sites["nl:Shop"].products[0],
    "affiliate_url",
    "http://affiliate.test/click?product=airco",
  );
  assert.throws(() => parseInventory(JSON.stringify(withBadAffiliateUrl)), /Invalid inventory site/);
});

test("rejects credentials embedded in an affiliate URL", () => {
  const withBadAffiliateUrl = structuredClone(validSnapshot);
  Reflect.set(
    withBadAffiliateUrl.sites["nl:Shop"].products[0],
    "affiliate_url",
    "https://user:password@affiliate.test/click?product=airco",
  );
  assert.throws(() => parseInventory(JSON.stringify(withBadAffiliateUrl)), /Invalid inventory site/);
});

test("rejects control characters embedded in an affiliate URL", () => {
  const withBadAffiliateUrl = structuredClone(validSnapshot);
  Reflect.set(
    withBadAffiliateUrl.sites["nl:Shop"].products[0],
    "affiliate_url",
    "https://affiliate.test/click\nForged: value",
  );
  assert.throws(() => parseInventory(JSON.stringify(withBadAffiliateUrl)), /Invalid inventory site/);
});

test("rejects a product with a non-integer btu", () => {
  const withBadProduct = structuredClone(validSnapshot);
  const badProduct = { ...validProduct, btu: 9000.5 };
  Reflect.set(withBadProduct.sites["nl:Shop"], "products", [badProduct, validPresaleProduct]);
  assert.throws(() => parseInventory(JSON.stringify(withBadProduct)), /Invalid inventory site/);
});

test("rejects a product missing a required url", () => {
  const withBadProduct = structuredClone(validSnapshot);
  const badProduct = { ...validProduct, url: "" };
  Reflect.set(withBadProduct.sites["nl:Shop"], "products", [badProduct, validPresaleProduct]);
  assert.throws(() => parseInventory(JSON.stringify(withBadProduct)), /Invalid inventory site/);
});

test("rejects non-HTTPS product urls", () => {
  const withBadProduct = structuredClone(validSnapshot);
  const badProduct = { ...validProduct, url: "http://shop.test/airco" };
  Reflect.set(withBadProduct.sites["nl:Shop"], "products", [badProduct, validPresaleProduct]);
  assert.throws(() => parseInventory(JSON.stringify(withBadProduct)), /Invalid inventory site/);
});

test("rejects available product count mismatches", () => {
  const mismatched = structuredClone(validSnapshot);
  Reflect.set(mismatched.sites["nl:Shop"], "available_product_count", 99);
  Reflect.set(mismatched, "available_product_count", 99);
  assert.throws(() => parseInventory(JSON.stringify(mismatched)), /available_product_count mismatch/);
});

test("rejects stale site count mismatches", () => {
  const mismatched = structuredClone(validSnapshot);
  Reflect.set(mismatched, "stale_site_count", 1);
  assert.throws(() => parseInventory(JSON.stringify(mismatched)), /stale_site_count mismatch/);
});

test("accepts retained stale diagnostics while excluding them from verified totals", () => {
  const withStale = structuredClone(validSnapshot);
  Reflect.set(withStale, "site_count", 2);
  Reflect.set(withStale, "stale_site_count", 1);
  Reflect.set(withStale, "inventory_confidence", "partial");
  Reflect.set(withStale.sites, "nl:Stale shop", {
    ...structuredClone(validSnapshot.sites["nl:Shop"]),
    status: "error",
    stale: true,
    freshness: "stale",
    counts_toward_totals: false,
    stale_age_seconds: 1200,
    stale_too_old: false,
    site: "Stale shop",
    site_id: "nl:Stale shop",
    products: [
      { ...validProduct, site: "Stale shop", site_id: "nl:Stale shop", url: "https://stale-shop.test/airco" },
    ],
    available_product_count: 1,
    immediate_product_count: 1,
    presale_product_count: 0,
  });

  const snapshot = parseInventory(JSON.stringify(withStale));
  assert.equal(snapshot.available_product_count, 2);
  assert.equal(snapshot.verified_site_count, 1);
  assert.equal(snapshot.sites["nl:Stale shop"].counts_toward_totals, false);
});

test("rejects totals that include stale diagnostic products", () => {
  const malformed = structuredClone(validSnapshot);
  Reflect.set(malformed.sites["nl:Shop"], "stale", true);
  Reflect.set(malformed.sites["nl:Shop"], "status", "error");
  Reflect.set(malformed.sites["nl:Shop"], "freshness", "stale");
  Reflect.set(malformed.sites["nl:Shop"], "counts_toward_totals", false);
  Reflect.set(malformed, "verified_site_count", 0);
  Reflect.set(malformed, "stale_site_count", 1);
  Reflect.set(malformed, "inventory_confidence", "unavailable");
  assert.throws(() => parseInventory(JSON.stringify(malformed)), /available_product_count mismatch/);
});

test("rejects product site mismatches", () => {
  const mismatched = structuredClone(validSnapshot);
  Reflect.set(mismatched.sites["nl:Shop"].products[0], "site", "Other shop");
  assert.throws(() => parseInventory(JSON.stringify(mismatched)), /product site mismatch/);
});

test("rejects malformed JSON", () => {
  assert.throws(() => parseInventory("{not json"), SyntaxError);
});

test("rejects an array as the top-level value", () => {
  assert.throws(() => parseInventory("[]"), /Unsupported inventory snapshot/);
});
