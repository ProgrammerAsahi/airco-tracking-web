import assert from "node:assert/strict";
import test from "node:test";
import { parseRetailerHash } from "./navigation.js";

test("parseRetailerHash accepts encoded retailer names and a known tab", () => {
  assert.deepEqual(parseRetailerHash("#/fr%3ATrotec/presale", "immediate", "presale"), {
    key: "fr:Trotec",
    tab: "presale",
  });
});

test("parseRetailerHash falls back for unknown tabs", () => {
  assert.deepEqual(parseRetailerHash("#/nl%3AHubo/not-a-tab", "immediate", "presale"), {
    key: "nl:Hubo",
    tab: "immediate",
  });
});

test("parseRetailerHash fails closed for malformed and oversized hashes", () => {
  assert.equal(parseRetailerHash("#/%E0%A4%A", "immediate", "presale"), null);
  assert.equal(parseRetailerHash("#not-a-route", "immediate", "presale"), null);
  assert.equal(parseRetailerHash(`#/${"a".repeat(600)}`, "immediate", "presale"), null);
  assert.equal(parseRetailerHash("#/bad%00key", "immediate", "presale"), null);
});
