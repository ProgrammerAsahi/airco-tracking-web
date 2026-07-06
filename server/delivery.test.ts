import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_DESTINATION_COUNTRY,
  canonicalDeliveryPath,
  destinationCountryFromPath,
  siteMatchesDestination,
  visibleSiteEntries,
} from "../shared/delivery.js";
import type { SiteInventory } from "../shared/inventory.js";

function site(coverage?: string[], country = "nl"): SiteInventory {
  return {
    stale: false,
    status: "ok",
    country,
    site: "Shop",
    site_id: `${country}:Shop`,
    delivery_coverage: coverage,
    last_attempt_at: "2026-07-06T12:00:00+00:00",
    last_success_at: "2026-07-06T12:00:00+00:00",
    available_product_count: 0,
    immediate_product_count: 0,
    presale_product_count: 0,
    products: [],
  };
}

test("reads destination country from /deliver-to path", () => {
  assert.equal(destinationCountryFromPath("/deliver-to/fr"), "fr");
  assert.equal(destinationCountryFromPath("/deliver-to/NL/"), "nl");
  assert.equal(destinationCountryFromPath("/"), DEFAULT_DESTINATION_COUNTRY);
  assert.equal(destinationCountryFromPath("/fr"), DEFAULT_DESTINATION_COUNTRY);
  assert.equal(canonicalDeliveryPath("FR"), "/deliver-to/fr");
});

test("matches explicit and regional delivery coverage", () => {
  assert.equal(siteMatchesDestination("nl:Shop", site(["nl"]), "nl"), true);
  assert.equal(siteMatchesDestination("nl:Shop", site(["nl"]), "fr"), false);
  assert.equal(siteMatchesDestination("nl:Shop", site(["eu"]), "fr"), true);
  assert.equal(siteMatchesDestination("nl:Shop", site(["eea"]), "no"), true);
  assert.equal(siteMatchesDestination("nl:Shop", site(["benelux"]), "be"), true);
  assert.equal(siteMatchesDestination("nl:Shop", site(["dach"]), "ch"), true);
  assert.equal(siteMatchesDestination("nl:Shop", site(["nordics"]), "se"), true);
});

test("falls back to site country when coverage is absent", () => {
  assert.equal(siteMatchesDestination("nl:Shop", site(undefined, "nl"), "nl"), true);
  assert.equal(siteMatchesDestination("nl:Shop", site(undefined, "nl"), "be"), false);
  assert.equal(siteMatchesDestination("be:Shop", { ...site(undefined, "be"), country: undefined }, "be"), true);
});

test("filters visible sites for the selected delivery country", () => {
  const entries = visibleSiteEntries({
    "nl:NL": site(["nl"]),
    "nl:Benelux": site(["benelux"]),
    "nl:France": site(["fr"]),
  }, "be").map(([key]) => key);

  assert.deepEqual(entries, ["nl:Benelux"]);
});
