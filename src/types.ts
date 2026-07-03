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

export interface BrandDefinition {
  name: string;
  shortMark: string;
  url: string;
  color: string;
  tint: string;
}
