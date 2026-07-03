/**
 * Shared inventory data contract — the single source of truth for the
 * inventory snapshot shape, used by both the browser UI and the Node API.
 *
 * The backend producer (`airco_tracker/inventory.py` in airco-tracking-nl)
 * generates the Blob; this module mirrors its schema. A schema change must
 * be coordinated across both repositories.
 */

export interface InventoryProduct {
  site: string;
  name: string;
  url: string;
  available: boolean;
  price_eur: number | null;
  delivery: string | null;
  btu: number | null;
}

export interface SiteInventory {
  status: "ok" | "error";
  stale: boolean;
  last_attempt_at: string | null;
  last_success_at: string | null;
  available_product_count: number;
  products: InventoryProduct[];
}

export interface InventorySnapshot {
  version: number;
  updated_at: string | null;
  refresh_interval_seconds: number;
  site_count: number;
  stale_site_count: number;
  available_product_count: number;
  sites: Record<string, SiteInventory>;
}
