import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import {
  AuthHttpError,
  authServiceFromEnvironment,
  clearSessionCookie,
  setSessionCookie,
  type StoredUserProfile,
} from "./auth.js";
import { parseInventory, type InventorySnapshot } from "./inventory.js";
import { buildI18nDataElement, type TranslationMap } from "../shared/i18n.js";
import { hasRealtimeStockAccess, isLanguagePreference, type UserProfile } from "../shared/auth.js";
import type { Lang } from "../shared/i18n.js";
import { loadI18n } from "./i18n.js";
import { stripeBillingFromEnvironment, type StripeBillingService } from "./billing.js";
import { legalConfigurationFromEnvironment, publicLegalConfiguration } from "./legal.js";
import { isPrivatePagePath } from "../shared/seo.js";
import { unsafeRequestIsTrusted } from "./request-security.js";
import {
  isServerRenderedLegalPath,
  parseLegalContentScript,
  renderLegalDocument,
  renderWithdrawalDocument,
} from "./legal-document.js";
import { BoundedRateLimiter, trustedClientAddress } from "./request-rate-limit.js";
import { logError } from "./safe-logger.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
// Compiled server.js lives at <root>/server-dist/server/server.js, so go up
// two levels to reach the project root that contains dist/.
const projectDirectory = resolve(currentDirectory, "..", "..");
const staticDirectory = join(projectDirectory, "dist");

function parseNonNegativeIntegerEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

const port = parseNonNegativeIntegerEnv("PORT", 3000);
const inventoryFile = process.env.INVENTORY_FILE?.trim();
const cacheMilliseconds = parseNonNegativeIntegerEnv("INVENTORY_CACHE_SECONDS", 30) * 1000;
const rateLimitWindowMilliseconds = parseNonNegativeIntegerEnv("RATE_LIMIT_WINDOW_SECONDS", 60) * 1000;
const rateLimitMaxRequests = parseNonNegativeIntegerEnv("RATE_LIMIT_MAX_REQUESTS", 120);
const rateLimitMaxBuckets = Math.max(1, parseNonNegativeIntegerEnv("RATE_LIMIT_MAX_BUCKETS", 10_000));
const withdrawalRateLimitMaxRequests = parseNonNegativeIntegerEnv("WITHDRAWAL_RATE_LIMIT_MAX_REQUESTS", 10);

const accountUrl = process.env.AZURE_STORAGE_ACCOUNT_URL?.trim();
const containerName = process.env.AZURE_STORAGE_CONTAINER?.trim() || "airco-tracker";
const blobName = process.env.AZURE_INVENTORY_BLOB?.trim() || "inventory.json";

// Construct the Blob client once at startup; DefaultAzureCredential does
// multiple network probes on first use and should not be re-instantiated
// on every cache miss.
let blobClient: BlobServiceClient | undefined;
function getBlobClient(): BlobServiceClient {
  if (!blobClient) {
    const credential = new DefaultAzureCredential({
      managedIdentityClientId: process.env.AZURE_CLIENT_ID?.trim() || undefined,
    });
    blobClient = new BlobServiceClient(accountUrl!, credential);
  }
  return blobClient;
}

let cachedInventory: { expiresAt: number; snapshot: InventorySnapshot } | undefined;
let inFlightRead: Promise<InventorySnapshot> | undefined;
let authService: ReturnType<typeof authServiceFromEnvironment> | undefined;
let billingService: StripeBillingService | undefined;
let legalContent: ReturnType<typeof parseLegalContentScript> | undefined;
const rateLimiter = new BoundedRateLimiter(rateLimitWindowMilliseconds, rateLimitMaxBuckets);

const mimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function securityHeaders(response: ServerResponse): void {
  response.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

function checkRateLimit(
  request: IncomingMessage,
  scope = "global",
  maxRequests = rateLimitMaxRequests,
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  if (maxRequests <= 0 || rateLimitWindowMilliseconds <= 0) return { allowed: true };
  return rateLimiter.check(`${scope}:${trustedClientAddress(request)}`, maxRequests);
}

function shouldTreatRequestAsHttps(request: IncomingMessage): boolean {
  return (request.socket as typeof request.socket & { encrypted?: boolean }).encrypted === true;
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", Buffer.byteLength(body));
  response.end(body);
}

function publicUser(user: StoredUserProfile | null): UserProfile | null {
  if (!user) return null;
  const {
    userId: _userId,
    profileRevision: _profileRevision,
    emailAlertsTokenVersion: _emailAlertsTokenVersion,
    stripeCustomerId: _stripeCustomerId,
    passReceipts: _passReceipts,
    ...safeUser
  } = user;
  return safeUser;
}

function getAuthService(): ReturnType<typeof authServiceFromEnvironment> {
  if (!authService) authService = authServiceFromEnvironment();
  return authService;
}

function getBillingService(): StripeBillingService {
  if (!billingService) billingService = stripeBillingFromEnvironment(getAuthService());
  return billingService;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLang(value: unknown): Lang {
  return isLanguagePreference(value) ? value : "zh";
}

async function readJsonBody(request: IncomingMessage, maxBytes = 4096): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) throw new AuthHttpError(413, "request_too_large");
    chunks.push(buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) throw new Error("JSON body must be an object");
    return parsed;
  } catch {
    throw new AuthHttpError(400, "invalid_json");
  }
}

async function readTextBody(request: IncomingMessage, maxBytes = 4096): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.byteLength;
    if (total > maxBytes) throw new AuthHttpError(413, "request_too_large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function rejectMethod(response: ServerResponse, allowed: string[]): void {
  response.setHeader("Allow", allowed.join(", "));
  sendJson(response, 405, { error: "Method not allowed" });
}

function sendAuthError(response: ServerResponse, error: unknown): void {
  response.setHeader("Cache-Control", "no-store");
  if (error instanceof AuthHttpError) {
    if (error.retryAfterSeconds) response.setHeader("Retry-After", String(error.retryAfterSeconds));
    sendJson(response, error.status, {
      error: error.code,
      retry_after_seconds: error.retryAfterSeconds,
    });
    return;
  }
  logError("auth_api_error", error);
  sendJson(response, 500, { error: "auth_unavailable" });
}

function sendApiError(response: ServerResponse, error: unknown, fallbackCode: string): void {
  response.setHeader("Cache-Control", "no-store");
  if (error instanceof AuthHttpError) {
    if (error.retryAfterSeconds) response.setHeader("Retry-After", String(error.retryAfterSeconds));
    sendJson(response, error.status, {
      error: error.code,
      retry_after_seconds: error.retryAfterSeconds,
    });
    return;
  }
  logError("api_error", error);
  sendJson(response, 500, { error: fallbackCode });
}

async function handleBillingRequest(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  response.setHeader("Cache-Control", "no-store");
  const method = request.method ?? "GET";

  try {
    if (url.pathname === "/api/billing/webhook") {
      if (method !== "POST") {
        rejectMethod(response, ["POST"]);
        return;
      }
      const result = await getBillingService().handleWebhook(request);
      sendJson(response, 200, result);
      return;
    }

    if (method === "POST" && !unsafeRequestIsTrusted(request)) {
      sendJson(response, 403, { error: "cross_origin_request_rejected" });
      return;
    }

    const rateLimit = checkRateLimit(request);
    if (!rateLimit.allowed) {
      response.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      sendJson(response, 429, { error: "too_many_requests", retry_after_seconds: rateLimit.retryAfterSeconds });
      return;
    }
    if (url.pathname.startsWith("/api/billing/withdrawal/")) {
      const withdrawalRateLimit = checkRateLimit(request, "withdrawal", withdrawalRateLimitMaxRequests);
      if (!withdrawalRateLimit.allowed) {
        response.setHeader("Retry-After", String(withdrawalRateLimit.retryAfterSeconds));
        sendJson(response, 429, { error: "too_many_requests", retry_after_seconds: withdrawalRateLimit.retryAfterSeconds });
        return;
      }
    }

    if (url.pathname === "/api/billing/create-checkout-session") {
      if (method !== "POST") {
        rejectMethod(response, ["POST"]);
        return;
      }
      const body = await readJsonBody(request);
      const result = await getBillingService().createCheckoutSession(request, {
        plan: body.plan,
        lang: parseLang(body.lang),
        legal: body.legal,
      });
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === "/api/billing/withdrawal/request-code") {
      if (method !== "POST") {
        rejectMethod(response, ["POST"]);
        return;
      }
      const body = await readJsonBody(request);
      const result = await getBillingService().requestWithdrawalCode({
        email: body.email,
        lang: parseLang(body.lang),
        clientIp: trustedClientAddress(request),
      });
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === "/api/billing/withdrawal/preview") {
      if (method !== "POST") {
        rejectMethod(response, ["POST"]);
        return;
      }
      const body = await readJsonBody(request);
      const result = await getBillingService().previewWithdrawal(request, {
        email: body.email,
        code: body.code,
        orderReference: body.orderReference,
        consumerName: body.consumerName,
        electronicConfirmationAccepted: body.electronicConfirmationAccepted,
      });
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === "/api/billing/withdrawal/confirm") {
      if (method !== "POST") {
        rejectMethod(response, ["POST"]);
        return;
      }
      const body = await readJsonBody(request);
      const result = await getBillingService().confirmWithdrawal({ token: body.token });
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === "/api/billing/sync-checkout-status") {
      if (method !== "POST") {
        rejectMethod(response, ["POST"]);
        return;
      }
      const body = await readJsonBody(request);
      const user = await getBillingService().syncCheckoutStatus(request, {
        sessionId: body.sessionId,
      });
      sendJson(response, 200, { user: publicUser(user), needsOnboarding: !user.nickname });
      return;
    }

    sendJson(response, 404, { error: "Unknown billing endpoint" });
  } catch (error) {
    sendApiError(response, error, "billing_unavailable");
  }
}

async function handleAuthRequest(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  response.setHeader("Cache-Control", "no-store");
  const method = request.method ?? "GET";
  const rateLimit = checkRateLimit(request);
  if (!rateLimit.allowed) {
    response.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
    sendJson(response, 429, { error: "too_many_requests", retry_after_seconds: rateLimit.retryAfterSeconds });
    return;
  }

  const auth = getAuthService();
  try {
    if (method === "POST" && !unsafeRequestIsTrusted(request)) {
      sendJson(response, 403, { error: "cross_origin_request_rejected" });
      return;
    }
    if (url.pathname === "/api/auth/me") {
      if (method !== "GET") {
        rejectMethod(response, ["GET"]);
        return;
      }
      const user = await auth.currentUser(request);
      sendJson(response, 200, { user: publicUser(user), needsOnboarding: Boolean(user && !user.nickname) });
      return;
    }

    if (url.pathname === "/api/auth/request-code") {
      if (method !== "POST") {
        rejectMethod(response, ["POST"]);
        return;
      }
      const body = await readJsonBody(request);
      const result = await auth.requestCode(body.email, parseLang(body.lang), trustedClientAddress(request));
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === "/api/auth/verify-code") {
      if (method !== "POST") {
        rejectMethod(response, ["POST"]);
        return;
      }
      const body = await readJsonBody(request);
      const result = await auth.verifyCode(body.email, body.code, parseLang(body.lang));
      setSessionCookie(response, request, result.sessionToken, result.sessionTtlSeconds, auth.cookieName);
      sendJson(response, 200, {
        user: publicUser(result.user),
        isNewUser: result.isNewUser,
        needsOnboarding: !result.user.nickname,
      });
      return;
    }

    if (url.pathname === "/api/auth/profile") {
      if (method !== "POST") {
        rejectMethod(response, ["POST"]);
        return;
      }
      const body = await readJsonBody(request);
      const user = await auth.updateNickname(request, body.nickname);
      sendJson(response, 200, { user: publicUser(user), needsOnboarding: !user.nickname });
      return;
    }

    if (url.pathname === "/api/auth/email-change/request") {
      if (method !== "POST") {
        rejectMethod(response, ["POST"]);
        return;
      }
      const body = await readJsonBody(request);
      const result = await auth.requestEmailChangeCode(
        request,
        body.email,
        parseLang(body.lang),
        trustedClientAddress(request),
      );
      sendJson(response, 200, result);
      return;
    }

    if (url.pathname === "/api/auth/email-change/verify") {
      if (method !== "POST") {
        rejectMethod(response, ["POST"]);
        return;
      }
      const body = await readJsonBody(request);
      const user = await auth.updateEmail(request, {
        email: body.email,
        code: body.code,
      });
      try {
        await getBillingService().syncCustomerProfile(user);
      } catch {
        logError("stripe_customer_profile_sync_deferred");
      }
      sendJson(response, 200, { user: publicUser(user), needsOnboarding: !user.nickname });
      return;
    }

    if (url.pathname === "/api/auth/preferences") {
      if (method !== "POST") {
        rejectMethod(response, ["POST"]);
        return;
      }
      const body = await readJsonBody(request);
      const user = await auth.updatePreferences(request, {
        languagePreference: body.languagePreference,
        deliveryCountry: body.deliveryCountry,
      });
      try {
        await getBillingService().syncCustomerProfile(user);
      } catch {
        logError("stripe_customer_profile_sync_deferred");
      }
      sendJson(response, 200, { user: publicUser(user), needsOnboarding: !user.nickname });
      return;
    }

    if (url.pathname === "/api/auth/email-alerts") {
      if (method !== "POST") {
        rejectMethod(response, ["POST"]);
        return;
      }
      const body = await readJsonBody(request);
      const user = await auth.updateEmailAlerts(request, body.enabled);
      sendJson(response, 200, { user: publicUser(user), needsOnboarding: !user.nickname });
      return;
    }

    if (url.pathname === "/api/auth/account/delete") {
      if (method !== "POST") {
        rejectMethod(response, ["POST"]);
        return;
      }
      // Remove mutable customer-profile PII from Stripe first. Financial
      // transaction records remain under Stripe's statutory retention rules.
      // The minimal local legal ledger must be durable before the external
      // deletion starts; retries remain safe if Stripe succeeds first.
      await auth.prepareAccountDeletion(request);
      await getBillingService().deleteCustomerForAccount(request);
      await auth.deleteAccount(request);
      clearSessionCookie(response, request, auth.cookieName);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/auth/logout") {
      if (method !== "POST") {
        rejectMethod(response, ["POST"]);
        return;
      }
      await auth.logout(request);
      clearSessionCookie(response, request, auth.cookieName);
      sendJson(response, 200, { ok: true });
      return;
    }

    sendJson(response, 404, { error: "Unknown auth endpoint" });
  } catch (error) {
    sendAuthError(response, error);
  }
}

async function handleAlertUnsubscribeRequest(
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
): Promise<void> {
  response.setHeader("Cache-Control", "no-store");
  if ((request.method ?? "GET") !== "POST") {
    rejectMethod(response, ["POST"]);
    return;
  }
  try {
    const contentType = String(request.headers["content-type"] || "").split(";", 1)[0]?.trim().toLowerCase();
    if (contentType && contentType !== "application/x-www-form-urlencoded") {
      throw new AuthHttpError(415, "unsupported_media_type");
    }
    const form = new URLSearchParams(await readTextBody(request, 1024));
    if (form.get("List-Unsubscribe") !== "One-Click") {
      throw new AuthHttpError(400, "invalid_unsubscribe_request");
    }
    await getAuthService().unsubscribeEmailAlerts(url.searchParams.get("token"));
    sendJson(response, 200, { ok: true });
  } catch (error) {
    sendAuthError(response, error);
  }
}

async function readInventorySource(): Promise<InventorySnapshot> {
  if (inventoryFile) {
    return parseInventory(await readFile(resolve(projectDirectory, inventoryFile), "utf8"));
  }
  if (!accountUrl) {
    throw new Error("AZURE_STORAGE_ACCOUNT_URL is not configured");
  }

  const blob = getBlobClient()
    .getContainerClient(containerName)
    .getBlobClient(blobName);
  const content = await blob.downloadToBuffer();
  return parseInventory(content.toString("utf8"));
}

async function getInventory(): Promise<InventorySnapshot> {
  const now = Date.now();
  if (cachedInventory && cachedInventory.expiresAt > now) return cachedInventory.snapshot;
  if (!inFlightRead) {
    inFlightRead = readInventorySource()
      .then((snapshot) => {
        cachedInventory = { expiresAt: Date.now() + cacheMilliseconds, snapshot };
        return snapshot;
      })
      .finally(() => {
        inFlightRead = undefined;
      });
  }
  return inFlightRead;
}

function safeStaticPath(pathname: string): string | undefined {
  try {
    const decoded = decodeURIComponent(pathname);
    const relative = decoded === "/" ? "index.html" : normalize(decoded.slice(1));
    const candidate = resolve(staticDirectory, relative);
    if (candidate !== staticDirectory && !candidate.startsWith(`${staticDirectory}${sep}`)) return undefined;
    return candidate;
  } catch {
    return undefined;
  }
}

async function sendStatic(url: URL, response: ServerResponse, headOnly: boolean): Promise<void> {
  let filePath = safeStaticPath(url.pathname);
  if (!filePath) {
    sendJson(response, 400, { error: "Invalid path" });
    return;
  }

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("not a file");
  } catch {
    filePath = join(staticDirectory, "index.html");
  }

  try {
    let content = await readFile(filePath);
    const extension = extname(filePath).toLowerCase();
    // Inject i18n translations into the HTML shell so the React app
    // can render in the user's chosen language without a second round-trip.
    if (extension === ".html") {
      if (url.pathname === "/withdrawal.html") {
        const rendered = renderWithdrawalDocument({
          template: content.toString("utf8"),
          requestedLanguage: url.searchParams.get("lang"),
          configuration: publicLegalConfiguration(legalConfigurationFromEnvironment()),
        });
        content = Buffer.from(rendered);
      } else if (isServerRenderedLegalPath(url.pathname)) {
        if (!legalContent) {
          const legalContentScript = await readFile(join(staticDirectory, "legal-content.js"), "utf8");
          legalContent = parseLegalContentScript(legalContentScript);
        }
        const rendered = renderLegalDocument({
          template: content.toString("utf8"),
          content: legalContent,
          pathname: url.pathname,
          requestedLanguage: url.searchParams.get("lang"),
          configuration: publicLegalConfiguration(legalConfigurationFromEnvironment()),
        });
        content = Buffer.from(rendered);
      }
      let i18nData: TranslationMap = {};
      try {
        i18nData = await loadI18n();
      } catch (error) {
        logError("i18n_load_failed", error);
      }
      const dataElement = buildI18nDataElement(i18nData);
      content = Buffer.from(content.toString("utf8").replace('<div id="root">', `${dataElement}<div id="root">`));
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", mimeTypes[extension] ?? "application/octet-stream");
    const mutableLegalAsset = [
      "legal.css",
      "legal-content.js",
      "legal-page.js",
      "legal-seo.js",
      "withdrawal-boot.js",
      "withdrawal.js",
    ].includes(filePath.split(sep).at(-1) ?? "");
    response.setHeader(
      "Cache-Control",
      extension === ".html" || mutableLegalAsset
        ? "no-cache"
        : "public, max-age=31536000, immutable",
    );
    response.setHeader("Content-Length", content.byteLength);
    response.end(headOnly ? undefined : content);
  } catch (error) {
    logError("static_file_error", error);
    sendJson(response, 500, { error: "Unable to serve application" });
  }
}

const server = createServer(async (request, response) => {
  securityHeaders(response);
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");

  if (url.pathname.startsWith("/api/auth/")) {
    await handleAuthRequest(request, response, url);
    return;
  }

  if (url.pathname.startsWith("/api/billing/")) {
    await handleBillingRequest(request, response, url);
    return;
  }

  if (url.pathname === "/api/alerts/unsubscribe") {
    await handleAlertUnsubscribeRequest(request, response, url);
    return;
  }

  if (url.pathname === "/api/legal/config") {
    if (method !== "GET" && method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      sendJson(response, 405, { error: "Method not allowed" });
      return;
    }
    response.setHeader("Cache-Control", "no-store");
    sendJson(response, 200, publicLegalConfiguration(legalConfigurationFromEnvironment()));
    return;
  }

  if (method !== "GET" && method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  if (url.pathname === "/health") {
    response.setHeader("Cache-Control", "no-store");
    sendJson(response, 200, { status: "ok" });
    return;
  }
  if (url.pathname === "/ready") {
    try {
      // Keep liveness shallow, but do not admit a new revision until its
      // managed identity can read and parse the production inventory blob.
      await getInventory();
      response.setHeader("Cache-Control", "no-store");
      sendJson(response, 200, { status: "ready" });
    } catch (error) {
      logError("readiness_check_failed", error);
      response.setHeader("Cache-Control", "no-store");
      sendJson(response, 503, { status: "not_ready" });
    }
    return;
  }
  if (url.pathname === "/api/inventory") {
    const rateLimit = checkRateLimit(request);
    if (!rateLimit.allowed) {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
      sendJson(response, 429, { error: "Too many requests" });
      return;
    }
    try {
      const user = await getAuthService().currentUser(request);
      if (!user) {
        response.setHeader("Cache-Control", "no-store");
        sendJson(response, 401, { error: "not_authenticated" });
        return;
      }
      if (!hasRealtimeStockAccess(user)) {
        response.setHeader("Cache-Control", "no-store");
        sendJson(response, 403, { error: "radar_pass_required" });
        return;
      }
    } catch (error) {
      logError("inventory_auth_check_failed", error);
      response.setHeader("Cache-Control", "no-store");
      sendJson(response, 503, { error: "Inventory is temporarily unavailable" });
      return;
    }
    try {
      const snapshot = await getInventory();
      // Inventory is an authenticated paid resource. Shared/public caches must
      // never retain it, otherwise a later unauthenticated request could be
      // served another user's successful response by an intermediary.
      response.setHeader("Cache-Control", "private, no-store");
      sendJson(response, 200, snapshot);
    } catch (error) {
      logError("inventory_read_error", error);
      response.setHeader("Cache-Control", "no-store");
      sendJson(response, 503, { error: "Inventory is temporarily unavailable" });
    }
    return;
  }

  if (isPrivatePagePath(url.pathname)) {
    response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
  }
  await sendStatic(url, response, method === "HEAD");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Airco Tracking Web listening on port ${port}`);
});

server.on("clientError", (_error, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});
