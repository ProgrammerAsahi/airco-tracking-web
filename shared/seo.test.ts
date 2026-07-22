import assert from "node:assert/strict";
import test from "node:test";
import { isPrivatePagePath } from "./seo.js";

test("marks account and paid inventory routes as private", () => {
  for (const pathname of [
    "/profile",
    "/ready",
    "/unsubscribe",
    "/withdrawal.html",
    "/deliver-to",
    "/deliver-to/fr",
    "/deliver-to/nl",
  ]) {
    assert.equal(isPrivatePagePath(pathname), true, pathname);
  }
});

test("keeps public and static routes outside the private route set", () => {
  for (const pathname of ["/", "/subscribe", "/privacy.html", "/terms.html", "/robots.txt", "/assets/app.js"]) {
    assert.equal(isPrivatePagePath(pathname), false, pathname);
  }
});
