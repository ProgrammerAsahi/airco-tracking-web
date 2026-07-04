import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBrand } from "./brands";
import type { InventoryProduct, InventorySnapshot, SiteInventory } from "./types";
import { useTranslation } from "./i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";
import "./styles.css";

const inventoryUrl = import.meta.env.VITE_INVENTORY_URL ?? "/api/inventory";

function formatUpdatedAt(value: string | null, t: (k: string) => string): string {
  if (!value) return t("waiting_first_update");
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Europe/Amsterdam",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatPrice(value: number | null, t: (k: string) => string): string {
  if (value === null) return t("price_unknown");
  return `€${value.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatBtu(value: number | null): string {
  if (value === null) return "";
  return `${value.toLocaleString("nl-NL")} BTU`;
}

function siteHasImmediate(site: SiteInventory): boolean {
  return site.products.some((p) => !p.presale);
}

function siteHasPresale(site: SiteInventory): boolean {
  return site.products.some((p) => p.presale);
}

function selectedRetailFromHash(): string | null {
  const hash = window.location.hash;
  if (!hash || hash === "#/") return null;
  return decodeURIComponent(hash.slice(2));
}

function StoreCard({ name, inventory, onSelect, presaleView, t }: { name: string; inventory: SiteInventory; onSelect: (name: string) => void; presaleView: boolean; t: (k: string, p?: Record<string, string | number>) => string }) {
  const brand = getBrand(name);
  const count = inventory.available_product_count;
  const hasStock = count > 0;

  const handleClick = (event: React.MouseEvent) => {
    if (hasStock) {
      event.preventDefault();
      onSelect(name);
    }
  };

  return (
    <a
      className={`store-card${hasStock ? " store-card--stocked" : ""}${inventory.stale ? " store-card--stale" : ""}${presaleView && hasStock ? " store-card--presale" : ""}`}
      href={hasStock ? `#/${encodeURIComponent(name)}` : brand.url}
      target={hasStock ? undefined : "_blank"}
      rel={hasStock ? undefined : "noopener noreferrer"}
      onClick={handleClick}
      style={{ "--brand": brand.color, "--brand-tint": brand.tint } as React.CSSProperties}
      aria-label={`${brand.name}，${count} ${t(presaleView ? "units_presale" : "units_in_stock")}`}
    >
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">{brand.shortMark}</span>
        <span className="brand-name">{brand.name}</span>
      </div>
      <div className="stock-block">
        <strong className="stock-number">{count}</strong>
        <span className="stock-label">{t(presaleView ? "units_presale" : "units_in_stock")}</span>
      </div>
      <div className="card-footer">
        <span className={`status-dot${hasStock ? (presaleView ? " status-dot--presale" : " status-dot--live") : ""}`} />
        {inventory.stale ? t("card_stale") : hasStock ? t("card_click_to_view") : t("card_out_of_stock")}
        <span className="card-arrow" aria-hidden="true">{hasStock ? "→" : ""}</span>
      </div>
    </a>
  );
}

function ProductCard({ product, t }: { product: InventoryProduct; t: (k: string, p?: Record<string, string | number>) => string }) {
  return (
    <a
      className="product-card"
      href={product.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <div className="product-card-name">{product.name}</div>
      <div className="product-card-specs">
        <span className="product-price">{formatPrice(product.price_eur, t)}</span>
        {product.btu !== null && <span className="product-btu">{formatBtu(product.btu)}</span>}
      </div>
      {product.delivery && (
        <div className="product-delivery">
          <span className={`product-delivery-dot${product.presale ? " product-delivery-dot--presale" : ""}`} />
          {product.delivery}
        </div>
      )}
      <div className="product-card-footer">
        <span>{t("product_order_cta")}</span>
        <span className="product-card-arrow" aria-hidden="true">↗</span>
      </div>
    </a>
  );
}

function RetailerDetail({ name, inventory, onBack, t }: { name: string; inventory: SiteInventory; onBack: () => void; t: (k: string, p?: Record<string, string | number>) => string }) {
  const brand = getBrand(name);
  const [activeTab, setActiveTab] = useState<"immediate" | "presale">("immediate");

  const { immediate, presale } = useMemo(() => {
    const sorted = [...inventory.products].sort((a, b) => {
      const priceA = a.price_eur ?? Number.MAX_SAFE_INTEGER;
      const priceB = b.price_eur ?? Number.MAX_SAFE_INTEGER;
      return priceA - priceB;
    });
    return {
      immediate: sorted.filter((p) => !p.presale),
      presale: sorted.filter((p) => p.presale),
    };
  }, [inventory.products]);

  useEffect(() => {
    if (immediate.length === 0 && presale.length > 0) {
      setActiveTab("presale");
    } else {
      setActiveTab("immediate");
    }
  }, [immediate.length, presale.length]);

  const displayed = activeTab === "immediate" ? immediate : presale;

  return (
    <div className="detail-overlay" style={{ "--brand": brand.color, "--brand-tint": brand.tint } as React.CSSProperties}>
      <div className="detail-header">
        <button className="detail-back" onClick={onBack} aria-label={t("detail_back")}>
          <span aria-hidden="true">←</span> {t("detail_back")}
        </button>
        <div className="detail-brand-lockup">
          <span className="brand-mark" aria-hidden="true">{brand.shortMark}</span>
          <span className="detail-brand-name">{brand.name}</span>
        </div>
        <div className="detail-count">
          <strong>{inventory.available_product_count}</strong>
          <span>{t("detail_units_in_stock")}</span>
        </div>
      </div>
      {inventory.stale && (
        <div className="detail-stale-notice">{t("detail_stale_notice")}</div>
      )}
      {immediate.length > 0 && presale.length > 0 && (
        <div className="detail-tabs">
          <button
            className={`detail-tab${activeTab === "immediate" ? " detail-tab--active" : ""}`}
            onClick={() => setActiveTab("immediate")}
          >
            <span className="detail-tab-dot detail-tab-dot--immediate" />
            {t("tab_immediate")} {immediate.length}
          </button>
          <button
            className={`detail-tab detail-tab--presale${activeTab === "presale" ? " detail-tab--active" : ""}`}
            onClick={() => setActiveTab("presale")}
          >
            <span className="detail-tab-dot detail-tab-dot--presale" />
            {t("tab_presale")} {presale.length}
          </button>
        </div>
      )}
      <div className="product-grid">
        {displayed.map((product) => (
          <ProductCard key={product.url} product={product} t={t} />
        ))}
      </div>
      <div className="detail-footer">
        <span>{t("detail_footer_disclaimer")}</span>
        <a href={brand.url} target="_blank" rel="noopener noreferrer">{t("detail_visit_store", { name: brand.name })} ↗</a>
      </div>
    </div>
  );
}

export default function App() {
  const { lang, setLang, t } = useTranslation();
  const tRef = useRef(t);
  tRef.current = t;
  const [snapshot, setSnapshot] = useState<InventorySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRetailer, setSelectedRetailer] = useState<string | null>(selectedRetailFromHash);
  const [overviewTab, setOverviewTab] = useState<"immediate" | "presale">("immediate");
  const abortRef = useRef<AbortController | null>(null);

  const fetchInventory = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const tr = tRef.current;
    fetch(inventoryUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(tr("error_fetch", { status: response.status }));
        return response.json() as Promise<InventorySnapshot>;
      })
      .then((data) => {
        setSnapshot(data);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : tr("error_generic"));
      });
  }, []);

  useEffect(() => {
    fetchInventory();
    const intervalMs = Math.max(60, (snapshot?.refresh_interval_seconds ?? 600)) * 1000;
    const timer = setInterval(fetchInventory, intervalMs);
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchInventory();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchInventory, snapshot?.refresh_interval_seconds]);

  useEffect(() => {
    const onHashChange = () => setSelectedRetailer(selectedRetailFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const selectRetailer = useCallback((name: string) => {
    window.location.hash = `/${encodeURIComponent(name)}`;
    setSelectedRetailer(name);
  }, []);

  const goBack = useCallback(() => {
    window.location.hash = "";
    setSelectedRetailer(null);
  }, []);

  const sites = useMemo(() => {
    if (!snapshot) return [];
    return Object.entries(snapshot.sites).sort(([nameA, siteA], [nameB, siteB]) => {
      const stockDifference = siteB.available_product_count - siteA.available_product_count;
      return stockDifference || nameA.localeCompare(nameB, "nl");
    });
  }, [snapshot]);

  const immediateSites = useMemo(
    () => sites.filter(([, site]) => siteHasImmediate(site)),
    [sites],
  );
  const presaleSites = useMemo(
    () => sites.filter(([, site]) => siteHasPresale(site) && !siteHasImmediate(site)),
    [sites],
  );

  const displayedSites = overviewTab === "immediate" ? immediateSites : presaleSites;
  const immediateCount = immediateSites.length;
  const presaleCount = presaleSites.length;

  const storesWithStock = sites.filter(([, site]) => site.available_product_count > 0).length;
  const selectedSite = selectedRetailer && snapshot ? snapshot.sites[selectedRetailer] : undefined;

  return (
    <main className="page-shell">
      <div className="lang-switcher-container">
        <LanguageSwitcher lang={lang} setLang={setLang} />
      </div>
      <header className="hero">
        <div className="product-name" aria-label="Airco Watch">
          <span className="product-symbol" aria-hidden="true"><i /><i /><i /></span>
          <span>Airco Watch</span>
        </div>
        <div className="hero-copy">
          <p className="eyebrow">{t("hero_eyebrow")}</p>
          <h1 dangerouslySetInnerHTML={{ __html: t("hero_title") }} />
          <p className="hero-description">{t("hero_description", { site_count: snapshot?.site_count ?? 27 })}</p>
        </div>
        <div className="hero-metrics" aria-live="polite">
          <div className="primary-metric">
            <span className="metric-value">{snapshot?.available_product_count ?? "—"}</span>
            <span className="metric-label">{t("metric_in_stock")}</span>
          </div>
          <div className="secondary-metrics">
            <span><strong>{snapshot ? storesWithStock : "—"}</strong> {t("metric_stores_stocked", { count: snapshot ? storesWithStock : 0 }).replace(/^0\s*/, "")}</span>
            <span><strong>{snapshot?.site_count ?? "—"}</strong> {t("metric_stores_tracked", { count: snapshot?.site_count ?? 0 }).replace(/^0\s*/, "")}</span>
          </div>
        </div>
      </header>

      <section className="inventory-section" aria-labelledby="inventory-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">{t("section_kicker")}</p>
            <h2 id="inventory-title">{t("section_title")}</h2>
          </div>
          <div className="updated-at">
            <span className="pulse" aria-hidden="true" />
            {t("updated_at", { time: formatUpdatedAt(snapshot?.updated_at ?? null, t) })}
          </div>
        </div>

        <div className="overview-tabs">
          <button
            className={`overview-tab${overviewTab === "immediate" ? " overview-tab--active" : ""}`}
            onClick={() => setOverviewTab("immediate")}
          >
            <span className="overview-tab-dot overview-tab-dot--immediate" />
            {t("tab_immediate")} {immediateCount > 0 ? immediateCount : ""}
          </button>
          <button
            className={`overview-tab overview-tab--presale${overviewTab === "presale" ? " overview-tab--active" : ""}`}
            onClick={() => setOverviewTab("presale")}
          >
            <span className="overview-tab-dot overview-tab-dot--presale" />
            {t("tab_presale")} {presaleCount > 0 ? presaleCount : ""}
          </button>
        </div>

        {error && <div className="notice notice--error">{error}</div>}
        {!snapshot && !error && <div className="notice">{t("loading")}</div>}
        {snapshot && displayedSites.length === 0 && (
          <div className="notice">{overviewTab === "immediate" ? t("empty_immediate") : t("empty_presale")}</div>
        )}
        {snapshot && displayedSites.length > 0 && (
          <div className="store-grid">
            {displayedSites.map(([name, inventory]) => (
              <StoreCard key={name} name={name} inventory={inventory} onSelect={selectRetailer} presaleView={overviewTab === "presale"} t={t} />
            ))}
          </div>
        )}
      </section>

      <footer className="page-footer">
        <span>{t("page_footer_disclaimer")}</span>
        <span>Airco Watch · NL</span>
      </footer>

      {selectedRetailer && selectedSite && (
        <RetailerDetail name={selectedRetailer} inventory={selectedSite} onBack={goBack} t={t} />
      )}
    </main>
  );
}
