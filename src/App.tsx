import { useEffect, useMemo, useState } from "react";
import { getBrand } from "./brands";
import type { InventorySnapshot, SiteInventory } from "./types";
import "./styles.css";

const inventoryUrl = import.meta.env.VITE_INVENTORY_URL
  ?? (import.meta.env.DEV ? "/inventory.sample.json" : "/api/inventory");

function formatUpdatedAt(value: string | null): string {
  if (!value) return "等待第一次更新";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Europe/Amsterdam",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function StoreCard({ name, inventory }: { name: string; inventory: SiteInventory }) {
  const brand = getBrand(name);
  const count = inventory.available_product_count;
  const hasStock = count > 0;

  return (
    <a
      className={`store-card${hasStock ? " store-card--stocked" : ""}${inventory.stale ? " store-card--stale" : ""}`}
      href={brand.url}
      target="_blank"
      rel="noreferrer"
      style={{ "--brand": brand.color, "--brand-tint": brand.tint } as React.CSSProperties}
      aria-label={`${brand.name}，${count} 台有货`}
    >
      <div className="brand-lockup">
        <span className="brand-mark" aria-hidden="true">{brand.shortMark}</span>
        <span className="brand-name">{brand.name}</span>
      </div>
      <div className="stock-block">
        <strong className="stock-number">{count}</strong>
        <span className="stock-label">台有货</span>
      </div>
      <div className="card-footer">
        <span className={`status-dot${hasStock ? " status-dot--live" : ""}`} />
        {inventory.stale ? "数据暂时过期" : hasStock ? "现在可购买" : "暂时无货"}
        <span className="card-arrow" aria-hidden="true">↗</span>
      </div>
    </a>
  );
}

export default function App() {
  const [snapshot, setSnapshot] = useState<InventorySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(inventoryUrl, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`库存数据请求失败（${response.status}）`);
        return response.json() as Promise<InventorySnapshot>;
      })
      .then(setSnapshot)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "无法读取库存数据");
      });
    return () => controller.abort();
  }, []);

  const sites = useMemo(() => {
    if (!snapshot) return [];
    return Object.entries(snapshot.sites).sort(([nameA, siteA], [nameB, siteB]) => {
      const stockDifference = siteB.available_product_count - siteA.available_product_count;
      return stockDifference || nameA.localeCompare(nameB, "nl");
    });
  }, [snapshot]);

  const storesWithStock = sites.filter(([, site]) => site.available_product_count > 0).length;

  return (
    <main className="page-shell">
      <header className="hero">
        <div className="product-name" aria-label="Airco Watch">
          <span className="product-symbol" aria-hidden="true"><i /><i /><i /></span>
          <span>Airco Watch</span>
        </div>
        <div className="hero-copy">
          <p className="eyebrow">荷兰 · 实时库存</p>
          <h1>哪里还有空调，<br />一眼就知道。</h1>
          <p className="hero-description">每 10 分钟查看 27 家商店，聚合当前可以在线购买的便携空调。</p>
        </div>
        <div className="hero-metrics" aria-live="polite">
          <div className="primary-metric">
            <span className="metric-value">{snapshot?.available_product_count ?? "—"}</span>
            <span className="metric-label">台空调有货</span>
          </div>
          <div className="secondary-metrics">
            <span><strong>{snapshot ? storesWithStock : "—"}</strong> 家商店有货</span>
            <span><strong>{snapshot?.site_count ?? "—"}</strong> 家正在追踪</span>
          </div>
        </div>
      </header>

      <section className="inventory-section" aria-labelledby="inventory-title">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Live overview</p>
            <h2 id="inventory-title">各网站库存</h2>
          </div>
          <div className="updated-at">
            <span className="pulse" aria-hidden="true" />
            更新于 {formatUpdatedAt(snapshot?.updated_at ?? null)}
          </div>
        </div>

        {error && <div className="notice notice--error">{error}</div>}
        {!snapshot && !error && <div className="notice">正在读取最新库存…</div>}
        {snapshot && (
          <div className="store-grid">
            {sites.map(([name, inventory]) => (
              <StoreCard key={name} name={name} inventory={inventory} />
            ))}
          </div>
        )}
      </section>

      <footer className="page-footer">
        <span>库存变化很快，请在购买前确认配送日期和最终价格。</span>
        <span>Airco Watch · NL</span>
      </footer>
    </main>
  );
}
