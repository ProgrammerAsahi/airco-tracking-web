export interface InventorySite {
  status: "ok" | "error";
  stale: boolean;
  last_attempt_at: string | null;
  last_success_at: string | null;
  available_product_count: number;
  products: unknown[];
}

export interface InventorySnapshot {
  version: number;
  updated_at: string | null;
  refresh_interval_seconds: number;
  site_count: number;
  stale_site_count: number;
  available_product_count: number;
  sites: Record<string, InventorySite>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
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
  ) {
    throw new Error("Invalid inventory totals");
  }

  for (const [name, candidate] of Object.entries(value.sites)) {
    if (
      !name
      || !isRecord(candidate)
      || !isNonNegativeInteger(candidate.available_product_count)
      || !Array.isArray(candidate.products)
      || typeof candidate.stale !== "boolean"
      || (candidate.status !== "ok" && candidate.status !== "error")
    ) {
      throw new Error(`Invalid inventory site: ${name || "<empty>"}`);
    }
  }

  return value as unknown as InventorySnapshot;
}
