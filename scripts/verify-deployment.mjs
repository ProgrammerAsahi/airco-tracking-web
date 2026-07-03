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
