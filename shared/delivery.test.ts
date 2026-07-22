import assert from "node:assert/strict";
import test from "node:test";

import { destinationInventoryConfidence } from "./delivery.js";
import type { SiteInventory } from "./inventory.js";

function site(coverage: string[], stale = false): SiteInventory {
  return {
    status: stale ? "error" : "ok",
    stale,
    freshness: stale ? "stale" : "verified",
    counts_toward_totals: !stale,
    delivery_coverage: coverage,
    last_attempt_at: "2026-07-22T12:00:00.000Z",
    last_success_at: stale ? "2026-07-21T12:00:00.000Z" : "2026-07-22T12:00:00.000Z",
    available_product_count: 0,
    products: [],
  };
}

test("destination confidence ignores outages that cannot serve that country", () => {
  const sites = {
    "fr:French": site(["fr"]),
    "nl:Dutch stale": site(["nl"], true),
  };
  assert.equal(destinationInventoryConfidence(sites, "fr"), "verified");
  assert.equal(destinationInventoryConfidence(sites, "nl"), "unavailable");
});

test("destination confidence includes shared delivery groups", () => {
  const sites = {
    "nl:EU fresh": site(["eu"]),
    "fr:France stale": site(["fr"], true),
  };
  assert.equal(destinationInventoryConfidence(sites, "fr"), "partial");
  assert.equal(destinationInventoryConfidence(sites, "nl"), "verified");
});
