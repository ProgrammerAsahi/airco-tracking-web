/**
 * Shared inventory data contract — the single source of truth for the
 * inventory snapshot shape, used by both the browser UI and the Node API.
 *
 * The backend producer (`airco_tracker/inventory.py` in airco-tracking)
 * generates the Blob; this module mirrors its schema. A schema change must
 * be coordinated across both repositories.
 */

export interface InventoryProduct {
  site: string;
  country?: string;
  site_id?: string;
  name: string;
  url: string;
  available: boolean;
  price_eur: number | null;
  delivery: string | null;
  btu: number | null;
  presale: boolean;
}

export interface SiteInventory {
  status: "ok" | "error";
  stale: boolean;
  country?: string;
  site?: string;
  site_id?: string;
  last_attempt_at: string | null;
  last_success_at: string | null;
  available_product_count: number;
  immediate_product_count?: number;
  presale_product_count?: number;
  products: InventoryProduct[];
}

export interface InventorySnapshot {
  version: number;
  updated_at: string | null;
  refresh_interval_seconds: number;
  site_count: number;
  stale_site_count: number;
  available_product_count: number;
  immediate_product_count?: number;
  presale_product_count?: number;
  sites: Record<string, SiteInventory>;
}
