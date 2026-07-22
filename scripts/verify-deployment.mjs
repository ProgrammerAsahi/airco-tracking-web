const appUrl = process.argv[2]?.replace(/\/$/, "");
if (!appUrl) {
  console.error("Usage: node scripts/verify-deployment.mjs <app-url>");
  process.exit(2);
}
const appOrigin = new URL(appUrl).origin;

const deadline = Date.now() + 8 * 60 * 1000;
let lastError;

while (Date.now() < deadline) {
  try {
    const health = await fetch(`${appUrl}/health`, { signal: AbortSignal.timeout(15_000) });
    if (!health.ok) throw new Error(`health returned ${health.status}`);

    const readiness = await fetch(`${appUrl}/ready`, { signal: AbortSignal.timeout(15_000) });
    if (!readiness.ok) throw new Error(`readiness returned ${readiness.status}`);
    const readinessBody = await readiness.json();
    if (readinessBody?.status !== "ready") throw new Error("readiness did not confirm the inventory dependency");

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
    for (const key of [
      "hero_title",
      "section_title",
      "updated_at",
      "metric_in_stock_one",
      "metric_stores_stocked_one",
      "metric_stores_tracked_one",
    ]) {
      if (!["zh", "nl", "en", "fr"].every((lang) => typeof i18n[key]?.[lang] === "string" && i18n[key][lang])) {
        throw new Error(`homepage has an incomplete i18n key: ${key}`);
      }
    }
    const deepLink = await fetch(`${appUrl}/deliver-to/nl?lang=en`, { signal: AbortSignal.timeout(15_000) });
    if (!deepLink.ok) throw new Error(`delivery-country route returned ${deepLink.status}`);
    const deepLinkHtml = await deepLink.text();
    if (!deepLinkHtml.includes('<div id="root">') || !deepLinkHtml.includes('id="i18n-data"')) {
      throw new Error("delivery-country route did not return the React application shell");
    }

    const response = await fetch(`${appUrl}/api/inventory`, { signal: AbortSignal.timeout(15_000) });
    if (response.status !== 401) throw new Error(`anonymous inventory should be protected; returned ${response.status}`);
    const inventoryError = await response.json();
    if (inventoryError?.error !== "not_authenticated") {
      throw new Error("anonymous inventory did not return the expected auth error");
    }

    for (const retiredEndpoint of [
      { path: "/api/auth/subscription/preview-payment", expectedError: "Unknown auth endpoint" },
      { path: "/api/auth/subscription/cancel", expectedError: "Unknown auth endpoint" },
      { path: "/api/billing/cancel-subscription", expectedError: "Unknown billing endpoint" },
    ]) {
      const retiredResponse = await fetch(`${appUrl}${retiredEndpoint.path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: appOrigin },
        body: "{}",
        signal: AbortSignal.timeout(15_000),
      });
      if (retiredResponse.status !== 404) {
        throw new Error(`retired endpoint ${retiredEndpoint.path} should return 404; returned ${retiredResponse.status}`);
      }
      const retiredError = await retiredResponse.json();
      if (retiredError?.error !== retiredEndpoint.expectedError) {
        throw new Error(`retired endpoint ${retiredEndpoint.path} did not fail closed`);
      }
    }

    const unsignedWebhookResponse = await fetch(`${appUrl}/api/billing/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(15_000),
    });
    if (unsignedWebhookResponse.status !== 400) {
      throw new Error(`unsigned Stripe webhook should return 400; returned ${unsignedWebhookResponse.status}`);
    }
    const unsignedWebhookError = await unsignedWebhookResponse.json();
    if (unsignedWebhookError?.error !== "missing_stripe_signature") {
      throw new Error("Stripe secret or webhook signing secret is not available to the deployed app");
    }

    console.log(`Verified ${appUrl}: app shell healthy, inventory protected, Stripe webhook configured, and legacy recurring-billing endpoints retired`);
    process.exit(0);
  } catch (error) {
    lastError = error;
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}

console.error(`Deployment verification timed out: ${String(lastError)}`);
process.exit(1);
