const appUrl = process.argv[2]?.replace(/\/$/, "");
if (!appUrl) {
  console.error("Usage: node scripts/verify-deployment.mjs <app-url>");
  process.exit(2);
}

const deadline = Date.now() + 8 * 60 * 1000;
let lastError;

while (Date.now() < deadline) {
  try {
    const health = await fetch(`${appUrl}/health`);
    if (!health.ok) throw new Error(`health returned ${health.status}`);

    const homepage = await fetch(`${appUrl}/`, { signal: AbortSignal.timeout(15_000) });
    if (!homepage.ok) throw new Error(`homepage returned ${homepage.status}`);
    const csp = homepage.headers.get("content-security-policy") ?? "";
    const scriptPolicy = csp.split(";").map((directive) => directive.trim()).find((directive) => directive.startsWith("script-src"));
    if (!scriptPolicy?.includes("'self'") || scriptPolicy.includes("'unsafe-inline'")) {
      throw new Error("homepage CSP does not preserve the strict script policy");
    }
    const html = await homepage.text();
    if (html.includes("window.__I18N__=")) {
      throw new Error("homepage still contains executable inline i18n data");
    }
    const i18nRaw = html.match(/<script id="i18n-data" type="application\/json">([\s\S]*?)<\/script>/)?.[1];
    if (!i18nRaw) throw new Error("homepage is missing the i18n JSON data element");
    const i18n = JSON.parse(i18nRaw);
    for (const key of ["hero_title", "section_title", "updated_at"]) {
      if (!["zh", "nl", "en"].every((lang) => typeof i18n[key]?.[lang] === "string" && i18n[key][lang])) {
        throw new Error(`homepage has an incomplete i18n key: ${key}`);
      }
    }

    const response = await fetch(`${appUrl}/api/inventory`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`inventory returned ${response.status}`);
    const inventory = await response.json();
    if (
      inventory.version !== 1
      || typeof inventory.sites !== "object"
      || inventory.sites === null
      || Array.isArray(inventory.sites)
      || !Number.isInteger(inventory.site_count)
      || inventory.site_count < 1
      || inventory.site_count !== Object.keys(inventory.sites).length
      || !Number.isInteger(inventory.available_product_count)
    ) {
      throw new Error("inventory response failed schema checks");
    }

    console.log(
      `Verified ${appUrl}: ${inventory.site_count} sites, ${inventory.available_product_count} available products`,
    );
    process.exit(0);
  } catch (error) {
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}

console.error(`Deployment verification timed out: ${String(lastError)}`);
process.exit(1);
