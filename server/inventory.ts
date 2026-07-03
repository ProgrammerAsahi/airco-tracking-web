import type { InventoryProduct, InventorySnapshot, SiteInventory } from "../shared/inventory.js";

export type { InventorySnapshot };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isIsoTimestamp(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  return !Number.isNaN(Date.parse(value));
}

function isValidProduct(value: unknown): value is InventoryProduct {
  if (!isRecord(value)) return false;
  return (
    typeof value.site === "string" && value.site.length > 0
    && typeof value.name === "string" && value.name.length > 0
    && typeof value.url === "string" && value.url.length > 0
    && typeof value.available === "boolean"
    && (value.price_eur === null || typeof value.price_eur === "number")
    && isNullableString(value.delivery)
    && (value.btu === null || (typeof value.btu === "number" && Number.isInteger(value.btu)))
  );
}

function isValidSite(name: string, candidate: unknown): candidate is SiteInventory {
  if (!name || !isRecord(candidate)) return false;
  if (!isNonNegativeInteger(candidate.available_product_count)) return false;
  if (typeof candidate.stale !== "boolean") return false;
  if (candidate.status !== "ok" && candidate.status !== "error") return false;
  if (!isNullableString(candidate.last_attempt_at)) return false;
  if (!isNullableString(candidate.last_success_at)) return false;
  if (!Array.isArray(candidate.products)) return false;
  if (!candidate.products.every(isValidProduct)) return false;
  return true;
}

export function parseInventory(raw: string): InventorySnapshot {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.sites)) {
    throw new Error("Unsupported inventory snapshot");
  }
  if (
    !isNonNegativeInteger(value.site_count)
    || !isNonNegativeInteger(value.stale_site_count)
    || !isNonNegativeInteger(value.available_product_count)
    || !isNonNegativeInteger(value.refresh_interval_seconds)
    || !isIsoTimestamp(value.updated_at)
  ) {
    throw new Error("Invalid inventory top-level fields");
  }

  const siteEntries = Object.entries(value.sites);
  for (const [name, candidate] of siteEntries) {
    if (!isValidSite(name, candidate)) {
      throw new Error(`Invalid inventory site: ${name || "<empty>"}`);
    }
  }

  // Cross-check: site_count must match the actual number of site entries.
  if (value.site_count !== siteEntries.length) {
    throw new Error(`site_count mismatch: expected ${siteEntries.length}, got ${value.site_count}`);
  }

  return value as unknown as InventorySnapshot;
}
