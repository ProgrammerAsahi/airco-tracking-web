import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getBrand } from "./brands";
import type { InventoryProduct, InventorySnapshot, SiteInventory } from "./types";
import { useTranslation } from "./i18n";
import type { Lang } from "./i18n";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { LandingPage } from "./LandingPage";
import { ProfilePage } from "./ProfilePage";
import { canonicalDeliveryPath, destinationCountryFromPath, visibleSiteEntries } from "../shared/delivery";
import "./styles.css";

const inventoryUrl = import.meta.env.VITE_INVENTORY_URL ?? "/api/inventory";

type Translator = (key: string, params?: Record<string, string | number>) => string;
type InventoryTab = "immediate" | "presale";
type SelectedRetailer = { key: string; tab: InventoryTab };
type AppLocaleProps = {
  lang: Lang;
  setLang: (next: Lang) => void;
  t: Translator;
};

const LOCALES: Record<Lang, string> = {
  zh: "zh-CN",
  nl: "nl-NL",
  en: "en-GB",
};

class InventoryResponseError extends Error {
  constructor(readonly status: number) {
    super(`inventory returned ${status}`);
  }
}

function formatUpdatedAt(value: string | null, t: Translator, lang: Lang): string {
  if (!value) return t("waiting_first_update");
  return new Intl.DateTimeFormat(LOCALES[lang], {
    timeZone: "Europe/Amsterdam",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatPrice(value: number | null, t: Translator, lang: Lang): string {
  if (value === null) return t("price_unknown");
  return new Intl.NumberFormat(LOCALES[lang], {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatBtu(value: number | null, lang: Lang): string {
  if (value === null) return "";
  return `${value.toLocaleString(LOCALES[lang])} BTU`;
}

function destinationCountryName(country: string, lang: Lang): string {
  try {
    return new Intl.DisplayNames([LOCALES[lang]], { type: "region" }).of(country.toUpperCase()) ?? country.toUpperCase();
  } catch {
    return country.toUpperCase();
  }
}

function destinationEyebrow(country: string, lang: Lang): string {
  const name = destinationCountryName(country, lang);
  if (lang === "zh") return `${name} · 实时库存`;
  if (lang === "nl") return `${name} · realtime voorraad`;
  return `${name} · live stock`;
}

function TranslatedHeading({ text }: { text: string }) {
  const lines = text.split(/<br\s*\/?>/i);
  return (
    <>
      {lines.map((line, index) => (
        <Fragment key={`${index}-${line}`}>
          {index > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </>
  );
}

function siteHasImmediate(site: SiteInventory): boolean {
  return immediateProductCount(site) > 0;
}

function siteHasPresale(site: SiteInventory): boolean {
  return presaleProductCount(site) > 0;
}

function immediateProductCount(site: SiteInventory): number {
  return site.immediate_product_count ?? site.products.filter((p) => !p.presale).length;
}

function presaleProductCount(site: SiteInventory): number {
  return site.presale_product_count ?? site.products.filter((p) => p.presale).length;
}

function siteDisplayName(siteKey: string, site: SiteInventory): string {
  return site.site ?? siteKey.replace(/^[a-z]{2}:/i, "");
}

function selectedRetailFromHash(): SelectedRetailer | null {
  const hash = window.location.hash;
  if (!hash || hash === "#/") return null;
  const [encodedKey, tab] = hash.slice(2).split("/");
  if (!encodedKey) return null;
  return {
    key: decodeURIComponent(encodedKey),
    tab: tab === "presale" ? "presale" : "immediate",
  };
}

function StoreCard({ siteKey, inventory, onSelect, presaleView, t }: { siteKey: string; inventory: SiteInventory; onSelect: (key: string, tab: InventoryTab) => void; presaleView: boolean; t: Translator }) {
  const displayName = siteDisplayName(siteKey, inventory);
  const brand = getBrand(displayName);
  const count = presaleView ? presaleProductCount(inventory) : immediateProductCount(inventory);
  const hasStock = count > 0;
  const tab = presaleView ? "presale" : "immediate";

  const handleClick = (event: React.MouseEvent) => {
    if (hasStock) {
      event.preventDefault();
      onSelect(siteKey, tab);
    }
  };

  return (
    <a
      className={`store-card brand-theme ${brand.themeClass}${hasStock ? " store-card--stocked" : ""}${inventory.stale ? " store-card--stale" : ""}${presaleView && hasStock ? " store-card--presale" : ""}`}
      href={hasStock ? `#/${encodeURIComponent(siteKey)}${presaleView ? "/presale" : ""}` : brand.url}
      target={hasStock ? undefined : "_blank"}
      rel={hasStock ? undefined : "noopener noreferrer"}
      onClick={handleClick}
      aria-label={`${brand.name}, ${count} ${t(presaleView ? "units_presale" : "units_in_stock")}`}
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

function ProductCard({ product, t, lang }: { product: InventoryProduct; t: Translator; lang: Lang }) {
  return (
    <a
      className="product-card"
      href={product.url}
      target="_blank"
      rel="noopener noreferrer"
    >
      <div className="product-card-name">{product.name}</div>
      <div className="product-card-specs">
        <span className="product-price">{formatPrice(product.price_eur, t, lang)}</span>
        {product.btu !== null && <span className="product-btu">{formatBtu(product.btu, lang)}</span>}
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

function RetailerDetail({ siteKey, inventory, initialTab, onBack, t, lang }: { siteKey: string; inventory: SiteInventory; initialTab: InventoryTab; onBack: () => void; t: Translator; lang: Lang }) {
  const displayName = siteDisplayName(siteKey, inventory);
  const brand = getBrand(displayName);
  const [activeTab, setActiveTab] = useState<InventoryTab>(initialTab);

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
    if (initialTab === "presale" && presale.length > 0) {
      setActiveTab("presale");
    } else if (initialTab === "immediate" && immediate.length > 0) {
      setActiveTab("immediate");
    } else if (immediate.length === 0 && presale.length > 0) {
      setActiveTab("presale");
    } else {
      setActiveTab("immediate");
    }
  }, [immediate.length, initialTab, presale.length]);

  const displayed = activeTab === "immediate" ? immediate : presale;
  const detailCount = activeTab === "immediate" ? immediate.length : presale.length;

  return (
    <div className={`detail-overlay brand-theme ${brand.themeClass}`}>
      <div className="detail-header">
        <button className="detail-back" onClick={onBack} aria-label={t("detail_back")}>
          <span aria-hidden="true">←</span> {t("detail_back")}
        </button>
        <div className="detail-brand-lockup">
          <span className="brand-mark" aria-hidden="true">{brand.shortMark}</span>
          <span className="detail-brand-name">{brand.name}</span>
        </div>
        <div className="detail-count">
          <strong>{detailCount}</strong>
          <span>{t(activeTab === "presale" ? "units_presale" : "detail_units_in_stock")}</span>
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
          <ProductCard key={product.url} product={product} t={t} lang={lang} />
        ))}
      </div>
      <div className="detail-footer">
        <span>{t("detail_footer_disclaimer")}</span>
        <a href={brand.url} target="_blank" rel="noopener noreferrer">{t("detail_visit_store", { name: brand.name })} ↗</a>
      </div>
    </div>
  );
}

function InventoryApp({ lang, setLang, t }: AppLocaleProps) {
  const [destinationCountry, setDestinationCountry] = useState(() => destinationCountryFromPath(window.location.pathname));
  const [snapshot, setSnapshot] = useState<InventorySnapshot | null>(null);
  const [error, setError] = useState<{ kind: "http"; status: number } | { kind: "generic" } | null>(null);
  const [selectedRetailer, setSelectedRetailer] = useState<SelectedRetailer | null>(selectedRetailFromHash);
  const [overviewTab, setOverviewTab] = useState<InventoryTab>("immediate");
  const abortRef = useRef<AbortController | null>(null);

  const fetchInventory = useCallback(() => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    fetch(inventoryUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new InventoryResponseError(response.status);
        return response.json() as Promise<InventorySnapshot>;
      })
      .then((data) => {
        setSnapshot(data);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(
          reason instanceof InventoryResponseError
            ? { kind: "http", status: reason.status }
            : { kind: "generic" },
        );
      });
  }, []);

  useEffect(() => {
    const siteCount = snapshot ? visibleSiteEntries(snapshot.sites, destinationCountry).length : "…";
    document.title = `Airco Watch · ${t("section_title")}`;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", t("hero_description", { site_count: siteCount }).replace(/<br\s*\/?>/gi, " "));
  }, [destinationCountry, snapshot, t]);

  useEffect(() => {
    const syncDestinationFromPath = () => {
      const next = destinationCountryFromPath(window.location.pathname);
      setDestinationCountry(next);
      const canonicalPath = canonicalDeliveryPath(next);
      if (window.location.pathname !== canonicalPath) {
        window.history.replaceState(
          window.history.state,
          "",
          `${canonicalPath}${window.location.search}${window.location.hash}`,
        );
      }
    };

    syncDestinationFromPath();
    window.addEventListener("popstate", syncDestinationFromPath);
    return () => window.removeEventListener("popstate", syncDestinationFromPath);
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

  const selectRetailer = useCallback((key: string, tab: InventoryTab) => {
    window.location.hash = `/${encodeURIComponent(key)}${tab === "presale" ? "/presale" : ""}`;
    setSelectedRetailer({ key, tab });
  }, []);

  const goBack = useCallback(() => {
    window.location.hash = "";
    setSelectedRetailer(null);
  }, []);

  const sites = useMemo(() => {
    if (!snapshot) return [];
    return visibleSiteEntries(snapshot.sites, destinationCountry).sort(([keyA, siteA], [keyB, siteB]) => {
      const stockDifference = (immediateProductCount(siteB) + presaleProductCount(siteB)) - (immediateProductCount(siteA) + presaleProductCount(siteA));
      return stockDifference || siteDisplayName(keyA, siteA).localeCompare(siteDisplayName(keyB, siteB), "nl");
    });
  }, [destinationCountry, snapshot]);

  const immediateSites = useMemo(
    () => sites
      .filter(([, site]) => siteHasImmediate(site))
      .sort(([keyA, siteA], [keyB, siteB]) => {
        const stockDifference = immediateProductCount(siteB) - immediateProductCount(siteA);
        return stockDifference || siteDisplayName(keyA, siteA).localeCompare(siteDisplayName(keyB, siteB), "nl");
      }),
    [sites],
  );
  const presaleSites = useMemo(
    () => sites
      .filter(([, site]) => siteHasPresale(site))
      .sort(([keyA, siteA], [keyB, siteB]) => {
        const stockDifference = presaleProductCount(siteB) - presaleProductCount(siteA);
        return stockDifference || siteDisplayName(keyA, siteA).localeCompare(siteDisplayName(keyB, siteB), "nl");
      }),
    [sites],
  );

  const displayedSites = overviewTab === "immediate" ? immediateSites : presaleSites;
  const immediateCount = immediateSites.length;
  const presaleCount = presaleSites.length;

  const immediateProductTotal = snapshot
    ? sites.reduce((total, [, site]) => total + immediateProductCount(site), 0)
    : null;
  const storesWithStock = immediateSites.length;
  const selectedEntry = useMemo(() => {
    if (!selectedRetailer || !snapshot) return undefined;
    const visibleSiteMap = new Map(sites);
    const direct = visibleSiteMap.get(selectedRetailer.key);
    if (direct) return [selectedRetailer.key, direct] as const;
    return sites.find(([siteKey, site]) => siteDisplayName(siteKey, site) === selectedRetailer.key);
  }, [selectedRetailer, sites, snapshot]);

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
          <p className="eyebrow">{destinationEyebrow(destinationCountry, lang)}</p>
          <h1><TranslatedHeading text={t("hero_title")} /></h1>
          <p className="hero-description">{t("hero_description", { site_count: snapshot ? sites.length : "…" })}</p>
        </div>
        <div className="hero-metrics" aria-live="polite">
          <div className="primary-metric">
            <span className="metric-value">{immediateProductTotal ?? "—"}</span>
            <span className="metric-label">{t("metric_in_stock")}</span>
          </div>
          <div className="secondary-metrics">
            <span><strong>{snapshot ? storesWithStock : "—"}</strong> {t("metric_stores_stocked", { count: snapshot ? storesWithStock : 0 }).replace(/^0\s*/, "")}</span>
            <span><strong>{snapshot ? sites.length : "—"}</strong> {t("metric_stores_tracked", { count: snapshot ? sites.length : 0 }).replace(/^0\s*/, "")}</span>
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
            {t("updated_at", { time: formatUpdatedAt(snapshot?.updated_at ?? null, t, lang) })}
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

        {error && (
          <div className="notice notice--error">
            {error.kind === "http" ? t("error_fetch", { status: error.status }) : t("error_generic")}
          </div>
        )}
        {!snapshot && !error && <div className="notice">{t("loading")}</div>}
        {snapshot && displayedSites.length === 0 && (
          <div className="notice">{overviewTab === "immediate" ? t("empty_immediate") : t("empty_presale")}</div>
        )}
        {snapshot && displayedSites.length > 0 && (
          <div className="store-grid">
            {displayedSites.map(([siteKey, inventory]) => (
              <StoreCard key={siteKey} siteKey={siteKey} inventory={inventory} onSelect={selectRetailer} presaleView={overviewTab === "presale"} t={t} />
            ))}
          </div>
        )}
      </section>

      <footer className="page-footer">
        <span>{t("page_footer_disclaimer")}</span>
        <span>Airco Watch · {destinationCountry.toUpperCase()}</span>
      </footer>

      {selectedRetailer && selectedEntry && (
        <RetailerDetail siteKey={selectedEntry[0]} inventory={selectedEntry[1]} initialTab={selectedRetailer.tab} onBack={goBack} t={t} lang={lang} />
      )}
    </main>
  );
}

function isInventoryRoute(pathname: string): boolean {
  return pathname === "/deliver-to" || pathname.startsWith("/deliver-to/");
}

function isProfileRoute(pathname: string): boolean {
  return pathname === "/profile";
}

export default function App() {
  const { lang, setLang, t } = useTranslation();
  const [pathname, setPathname] = useState(() => window.location.pathname);

  useEffect(() => {
    const syncPathname = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", syncPathname);
    return () => window.removeEventListener("popstate", syncPathname);
  }, []);

  if (isInventoryRoute(pathname)) {
    return <InventoryApp lang={lang} setLang={setLang} t={t} />;
  }

  if (isProfileRoute(pathname)) {
    return <ProfilePage lang={lang} setLang={setLang} />;
  }

  return <LandingPage lang={lang} setLang={setLang} />;
}
