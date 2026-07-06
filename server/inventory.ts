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
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isOptionalNonEmptyString(value: unknown): value is string | undefined {
  return value === undefined || (typeof value === "string" && value.length > 0);
}

function isOptionalNonNegativeInteger(value: unknown): value is number | undefined {
  return value === undefined || isNonNegativeInteger(value);
}

function isValidProduct(value: unknown): value is InventoryProduct {
  if (!isRecord(value)) return false;
  return (
    typeof value.site === "string" && value.site.length > 0
    && isOptionalNonEmptyString(value.country)
    && isOptionalNonEmptyString(value.site_id)
    && typeof value.name === "string" && value.name.length > 0
    && isHttpUrl(value.url)
    && value.available === true
    && (value.price_eur === null || (typeof value.price_eur === "number" && Number.isFinite(value.price_eur) && value.price_eur >= 0))
    && isNullableString(value.delivery)
    && (value.btu === null || (typeof value.btu === "number" && Number.isInteger(value.btu) && value.btu > 0))
    && typeof value.presale === "boolean"
  );
}

function isValidSite(name: string, candidate: unknown): candidate is SiteInventory {
  if (!name || !isRecord(candidate)) return false;
  if (!isNonNegativeInteger(candidate.available_product_count)) return false;
  if (!isOptionalNonNegativeInteger(candidate.immediate_product_count)) return false;
  if (!isOptionalNonNegativeInteger(candidate.presale_product_count)) return false;
  if (!isOptionalNonEmptyString(candidate.country)) return false;
  if (!isOptionalNonEmptyString(candidate.site)) return false;
  if (!isOptionalNonEmptyString(candidate.site_id)) return false;
  if (typeof candidate.stale !== "boolean") return false;
  if (candidate.status !== "ok" && candidate.status !== "error") return false;
  if (!isIsoTimestamp(candidate.last_attempt_at)) return false;
  if (!isIsoTimestamp(candidate.last_success_at)) return false;
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
    || !isOptionalNonNegativeInteger(value.immediate_product_count)
    || !isOptionalNonNegativeInteger(value.presale_product_count)
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
  const staleSiteCount = siteEntries.filter(([, site]) => (site as SiteInventory).stale).length;
  if (value.stale_site_count !== staleSiteCount) {
    throw new Error(`stale_site_count mismatch: expected ${staleSiteCount}, got ${value.stale_site_count}`);
  }

  let availableProductCount = 0;
  let immediateProductCount = 0;
  let presaleProductCount = 0;
  for (const [siteKey, site] of siteEntries as [string, SiteInventory][]) {
    const displayName = site.site ?? siteKey.replace(/^[a-z]{2}:/i, "");
    const siteId = site.site_id ?? siteKey;
    const country = site.country ?? siteKey.match(/^([a-z]{2}):/i)?.[1];
    const siteImmediateCount = site.products.filter((product) => !product.presale).length;
    const sitePresaleCount = site.products.filter((product) => product.presale).length;
    if (site.available_product_count !== site.products.length) {
      throw new Error(`available_product_count mismatch for ${siteKey}`);
    }
    if (site.immediate_product_count !== undefined && site.immediate_product_count !== siteImmediateCount) {
      throw new Error(`immediate_product_count mismatch for ${siteKey}`);
    }
    if (site.presale_product_count !== undefined && site.presale_product_count !== sitePresaleCount) {
      throw new Error(`presale_product_count mismatch for ${siteKey}`);
    }
    for (const product of site.products) {
      if (product.site !== displayName) {
        throw new Error(`product site mismatch for ${siteKey}`);
      }
      if (product.site_id !== undefined && product.site_id !== siteId) {
        throw new Error(`product site_id mismatch for ${siteKey}`);
      }
      if (country !== undefined && product.country !== undefined && product.country !== country) {
        throw new Error(`product country mismatch for ${siteKey}`);
      }
    }
    availableProductCount += site.products.length;
    immediateProductCount += siteImmediateCount;
    presaleProductCount += sitePresaleCount;
  }
  if (value.available_product_count !== availableProductCount) {
    throw new Error(`available_product_count mismatch: expected ${availableProductCount}, got ${value.available_product_count}`);
  }
  if (value.immediate_product_count !== undefined && value.immediate_product_count !== immediateProductCount) {
    throw new Error(`immediate_product_count mismatch: expected ${immediateProductCount}, got ${value.immediate_product_count}`);
  }
  if (value.presale_product_count !== undefined && value.presale_product_count !== presaleProductCount) {
    throw new Error(`presale_product_count mismatch: expected ${presaleProductCount}, got ${value.presale_product_count}`);
  }

  return value as unknown as InventorySnapshot;
}
