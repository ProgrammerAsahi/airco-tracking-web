import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("private SPA routes send a crawler-blocking response header", async ({ request }) => {
  const privateResponse = await request.get("/deliver-to/fr?lang=en");
  expect(privateResponse.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive");

  const withdrawalResponse = await request.get("/withdrawal.html?lang=en");
  expect(withdrawalResponse.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive");

  const publicResponse = await request.get("/subscribe?lang=en");
  expect(publicResponse.headers()["x-robots-tag"]).toBeUndefined();
});

test("public legal pages expose localized canonical, hreflang, and social metadata", async ({ page }) => {
  await page.goto("/terms.html?lang=fr");

  await expect(page).toHaveTitle("Conditions d’utilisation · Airco Tracker");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /Pass Canicule de 90 jours/);
  await expect(page.locator('meta[property="og:locale"]')).toHaveAttribute("content", "fr_FR");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://airco-tracker.eu/terms.html?lang=fr");
  await expect(page.locator('link[rel="alternate"][hreflang="zh-CN"]')).toHaveAttribute("href", "https://airco-tracker.eu/terms.html?lang=zh");
  await expect(page.locator('link[rel="alternate"][hreflang="x-default"]')).toHaveAttribute("href", "https://airco-tracker.eu/terms.html?lang=en");

  await page.goto("/withdrawal.html?lang=zh");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test("legal responses contain substantive localized content before JavaScript runs", async ({ request }) => {
  const expectations = {
    en: ["Terms of service", "Operator and scope", "near-real-time inventory page", "normally refreshed about every 10 minutes"],
    nl: ["Gebruiksvoorwaarden", "Exploitant en toepassingsgebied", "bijna-realtime voorraadtoegang", "normaal ongeveer elke 10 minuten ververst"],
    fr: ["Conditions d’utilisation", "Opérateur et champ", "stock en quasi-temps réel", "normalement actualisé toutes les 10 minutes environ"],
    zh: ["服务条款", "经营者和适用范围", "近实时库存访问", "通常约每 10 分钟刷新"],
  } as const;
  for (const [lang, phrases] of Object.entries(expectations)) {
    const response = await request.get(`/terms.html?lang=${lang}`);
    expect(response.ok()).toBeTruthy();
    const html = await response.text();
    for (const phrase of phrases) expect(html).toContain(phrase);
    expect(html).not.toContain('<div class="legal-sections" data-sections></div>');
    expect(html).toContain(`rel="canonical" href="https://airco-tracker.eu/terms.html?lang=${lang}"`);
  }
});

test("localized legal brand links return home without dropping the language", async ({ page }) => {
  await page.goto("/terms.html?lang=fr");
  await expect(page.locator(".legal-brand")).toHaveAttribute("href", "/?lang=fr");

  await page.goto("/withdrawal.html?lang=zh");
  await expect(page.locator(".legal-brand")).toHaveAttribute("href", "/?lang=zh");
});

test("withdrawal remains usable without JavaScript through the localized email fallback", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/withdrawal.html?lang=fr");

  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page.getByRole("heading", { name: "Se rétracter sans JavaScript" })).toBeVisible();
  await expect(page.locator(".withdrawal-noscript-copy[lang=\"fr\"] [data-withdrawal-email]")).toHaveAttribute("href", /^mailto:/);
  await expect(page.locator("#withdrawal-form")).toBeHidden();
  await expect(page.locator(".legal-brand")).toHaveAttribute("href", "/?lang=fr");

  await context.close();
});

test("withdrawal formats dates and refund status in the requested language", async ({ page }) => {
  await page.route("**/api/billing/withdrawal/preview", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        token: "withdrawal-token",
        orderReference: "cs_test_123",
        amountEurCents: 1500,
        purchasedAt: "2026-07-20T12:00:00.000Z",
        withdrawalDeadline: "2026-08-03T12:00:00.000Z",
        confirmationEmail: "reader@example.com",
      }),
    });
  });
  await page.route("**/api/billing/withdrawal/confirm", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ withdrawalReference: "WD-123", refundStatus: "pending" }),
    });
  });
  await page.goto("/withdrawal.html?lang=fr");
  await page.getByLabel("Nom du consommateur").fill("Test Consumer");
  await page.getByLabel(/confirmation électronique/i).check();
  await page.getByRole("button", { name: "Vérifier la rétractation" }).click();
  await expect(page.locator("#withdrawal-summary-text")).toContainText(/20 juil\. 2026/);
  await page.getByRole("button", { name: "Confirmer et demander le remboursement intégral" }).click();
  await expect(page.locator("#withdrawal-message")).toContainText("en attente");
  await expect(page.locator("#withdrawal-message")).not.toContainText("pending");
});

test("public portal exposes localized metadata and a keyboard-safe login dialog", async ({ page }) => {
  await page.goto("/?lang=en");

  await expect(page).toHaveTitle(/European portable AC stock radar/);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /index, follow/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://airco-tracker.eu/?lang=en");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator(".landing-cinema-copy--hero")).toHaveCSS("opacity", "1");
  await expect(page.locator(".landing-cinema-copy--hero")).toHaveAttribute("aria-hidden", "false");

  const loginButton = page.locator(".landing-nav-cta");
  await loginButton.focus();
  await loginButton.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeFocused();
  await expect(page.locator("#root")).toHaveAttribute("aria-hidden", "true");
  expect(await page.locator("#root").evaluate((element) => element.inert)).toBe(true);

  const close = page.getByRole("button", { name: "Close login dialog" });
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("dialog").getByRole("link", { name: "Privacy policy" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(loginButton).toBeFocused();
  expect(await page.locator("#root").evaluate((element) => element.inert)).toBe(false);
});

test("zero-scroll hero copy is visible even before IntersectionObserver reports", async ({ page }) => {
  await page.addInitScript(() => {
    class SilentIntersectionObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds: number[] = [];
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords(): IntersectionObserverEntry[] { return []; }
    }
    Object.defineProperty(window, "IntersectionObserver", { configurable: true, value: SilentIntersectionObserver });
  });
  await page.goto("/?lang=en");
  await expect(page.locator(".landing-cinema-copy--hero")).toHaveCSS("opacity", "1");
  await expect(page.locator(".landing-cinema-copy--hero")).toHaveAttribute("aria-hidden", "false");
});

test("public promise copy describes near-real-time scans without unsupported priority claims", async ({ page }) => {
  await page.goto("/?lang=en");
  const copy = await page.locator(".landing-cinema").textContent();
  expect(copy).toContain("Near-real-time stock preview");
  expect(copy).toContain("normally refreshed about every 10 minutes");
  expect(copy).not.toMatch(/live stock|before everyone else|nobody else had seen/i);
});

test("withdrawal form requires identity and an explicit, initially unchecked electronic confirmation", async ({ page }) => {
  await page.goto("/withdrawal.html?lang=en");
  await expect(page.getByLabel("Consumer name")).toBeVisible();
  const confirmation = page.getByLabel(/explicitly request an electronic confirmation/i);
  await expect(confirmation).not.toBeChecked();
  await expect(confirmation).toHaveAttribute("required", "");
});

test("subscription VAT display fails closed when legal configuration is unknown", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ user: {
      email: "reader@example.com", nickname: "Reader", emailAlertsEnabled: true,
      entitlementTier: "none", entitlementStatus: "none", entitlementExpiresAt: null,
      entitlementPurchasedAt: null, paymentMethod: null, paymentBrand: null, paymentLast4: null,
      languagePreference: "en", deliveryCountry: "fr",
      createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T00:00:00.000Z",
    } }) });
  });
  await page.route("**/api/legal/config", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ readyForLivePayments: false, vatStatus: null, missingFields: ["vatStatus"] }),
    });
  });
  await page.goto("/subscribe?lang=en");
  await expect(page.getByText(/cannot confirm the VAT status/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Choose plan" }).first().click();
  await expect(page.getByRole("button", { name: /Order and pay/ })).toBeDisabled();
});

test("subscription and profile dialogs trap focus, isolate the page, and restore their trigger", async ({ page }) => {
  await page.goto("/subscribe?lang=en");
  const choose = page.getByRole("button", { name: "Choose plan" }).first();
  await choose.click();
  const loginDialog = page.getByRole("dialog", { name: "Log in to continue" });
  await expect(loginDialog).toBeVisible();
  await expect(page.getByLabel("Email")).toBeFocused();
  await expect(page.locator("#root")).toHaveAttribute("aria-hidden", "true");
  expect(await page.locator("#root").evaluate((element) => element.inert)).toBe(true);

  const close = loginDialog.getByRole("button", { name: "Close login dialog" });
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(loginDialog.getByRole("link", { name: "Privacy policy" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(loginDialog).toBeHidden();
  await expect(choose).toBeFocused();
  expect(await page.locator("#root").evaluate((element) => element.inert)).toBe(false);

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          email: "reader@example.com",
          nickname: "Reader",
          emailAlertsEnabled: true,
          entitlementTier: "none",
          entitlementStatus: "none",
          entitlementExpiresAt: null,
          entitlementPurchasedAt: null,
          paymentMethod: null,
          paymentBrand: null,
          paymentLast4: null,
          languagePreference: "en",
          deliveryCountry: "fr",
          createdAt: "2026-07-22T00:00:00.000Z",
          updatedAt: "2026-07-22T00:00:00.000Z",
        },
      }),
    });
  });
  await page.goto("/profile?lang=en");
  const nicknameTrigger = page.getByRole("button", { name: /Reader Edit/ });
  await nicknameTrigger.click();
  const nicknameDialog = page.getByRole("dialog", { name: "What should we call you?" });
  await expect(nicknameDialog.getByLabel("Nickname")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(nicknameDialog).toBeHidden();
  await expect(nicknameTrigger).toBeFocused();
});

test("profile never invents card details when stored payment metadata is incomplete", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          email: "reader@example.com",
          nickname: "Reader",
          emailAlertsEnabled: true,
          entitlementTier: "alerts",
          entitlementStatus: "active",
          entitlementExpiresAt: "2099-01-01T00:00:00.000Z",
          entitlementPurchasedAt: "2026-07-22T00:00:00.000Z",
          paymentMethod: "card",
          paymentBrand: null,
          paymentLast4: null,
          languagePreference: "en",
          deliveryCountry: "fr",
          createdAt: "2026-07-22T00:00:00.000Z",
          updatedAt: "2026-07-22T00:00:00.000Z",
        },
      }),
    });
  });
  await page.goto("/profile?lang=en");
  await expect(page.locator(".profile-payment-line strong")).toHaveText("No payment method yet");
  await expect(page.locator(".profile-payment-line strong")).not.toContainText("4242");
});

test("language menu supports keyboard navigation and synchronizes the URL", async ({ page }) => {
  await page.goto("/?lang=en");

  const trigger = page.locator(".lang-switcher-button");
  await trigger.focus();
  await trigger.press("ArrowDown");
  await expect(page.getByRole("menu")).toBeVisible();

  const french = page.getByRole("menuitemradio", { name: /Français/ });
  await french.click();
  await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  await expect(page).toHaveURL(/\?lang=fr/);
  await expect(page).toHaveTitle(/Radar européen/);
});

test("retained stale inventory is excluded from every customer-facing count", async ({ page }) => {
  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          email: "reader@example.com",
          nickname: "Reader",
          emailAlertsEnabled: true,
          entitlementTier: "radar",
          entitlementStatus: "active",
          entitlementExpiresAt: "2099-01-01T00:00:00.000Z",
          entitlementPurchasedAt: "2026-07-22T00:00:00.000Z",
          paymentMethod: "card",
          paymentBrand: "visa",
          paymentLast4: "4242",
          languagePreference: "en",
          deliveryCountry: "fr",
          createdAt: "2026-07-22T00:00:00.000Z",
          updatedAt: "2026-07-22T00:00:00.000Z",
        },
      }),
    });
  });
  await page.route("**/api/inventory", async (route) => {
    const product = (site: string, url: string) => ({
      site,
      name: `${site} portable AC`,
      url,
      available: true,
      price_eur: 299,
      delivery: "In stock",
      btu: 9000,
      presale: false,
    });
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: 1,
        updated_at: "2026-07-22T12:00:00.000Z",
        refresh_interval_seconds: 600,
        site_count: 2,
        verified_site_count: 1,
        stale_site_count: 1,
        available_product_count: 1,
        immediate_product_count: 1,
        presale_product_count: 0,
        inventory_confidence: "partial",
        sites: {
          "fr:Verified shop": {
            status: "ok",
            stale: false,
            freshness: "verified",
            counts_toward_totals: true,
            country: "fr",
            site: "Verified shop",
            delivery_coverage: ["fr"],
            last_attempt_at: "2026-07-22T12:00:00.000Z",
            last_success_at: "2026-07-22T12:00:00.000Z",
            available_product_count: 1,
            immediate_product_count: 1,
            presale_product_count: 0,
            products: [product("Verified shop", "https://example.com/verified")],
          },
          "fr:Retained stale shop": {
            status: "error",
            stale: true,
            freshness: "stale",
            counts_toward_totals: false,
            country: "fr",
            site: "Retained stale shop",
            delivery_coverage: ["fr"],
            last_attempt_at: "2026-07-22T12:00:00.000Z",
            last_success_at: "2026-07-21T12:00:00.000Z",
            available_product_count: 3,
            immediate_product_count: 3,
            presale_product_count: 0,
            products: [
              product("Retained stale shop", "https://example.com/stale-1"),
              product("Retained stale shop", "https://example.com/stale-2"),
              product("Retained stale shop", "https://example.com/stale-3"),
            ],
          },
        },
      }),
    });
  });

  await page.goto("/deliver-to/fr?lang=en");

  await expect(page.locator(".primary-metric .metric-value")).toHaveText("1");
  await expect(page.locator(".secondary-metrics strong")).toHaveText(["1", "1"]);
  await expect(page.getByText("Verified shop", { exact: true })).toBeVisible();
  await expect(page.getByText("Retained stale shop", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/figures below include verified stock only/i)).toBeVisible();
});

test("public portal has no serious or critical axe violations", async ({ page }) => {
  await page.goto("/?lang=en");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  const blockingViolations = results.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical",
  );
  expect(blockingViolations).toEqual([]);
});
