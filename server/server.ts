import { readFile, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { parseInventory, type InventorySnapshot } from "./inventory.js";
import { buildI18nDataElement, type TranslationMap } from "../shared/i18n.js";
import { loadI18n } from "./i18n.js";

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
let lastRateLimitCleanup = 0;
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

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

function clientAddress(request: IncomingMessage): string {
  const forwardedFor = request.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0 && forwardedFor[0].trim()) {
    return forwardedFor[0].split(",")[0]?.trim() || "unknown";
  }
  return request.socket.remoteAddress || "unknown";
}

function rateLimitRetryAfterSeconds(resetAt: number): number {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}

function checkRateLimit(request: IncomingMessage): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  if (rateLimitMaxRequests <= 0 || rateLimitWindowMilliseconds <= 0) return { allowed: true };

  const now = Date.now();
  if (now - lastRateLimitCleanup > rateLimitWindowMilliseconds) {
    for (const [key, bucket] of rateLimitBuckets.entries()) {
      if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
    }
    lastRateLimitCleanup = now;
  }

  const key = clientAddress(request);
  const existing = rateLimitBuckets.get(key);
  if (!existing || existing.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + rateLimitWindowMilliseconds });
    return { allowed: true };
  }
  if (existing.count >= rateLimitMaxRequests) {
    return { allowed: false, retryAfterSeconds: rateLimitRetryAfterSeconds(existing.resetAt) };
  }
  existing.count += 1;
  return { allowed: true };
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", Buffer.byteLength(body));
  response.end(body);
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

async function sendStatic(pathname: string, response: ServerResponse, headOnly: boolean): Promise<void> {
  let filePath = safeStaticPath(pathname);
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
      let i18nData: TranslationMap = {};
      try {
        i18nData = await loadI18n();
      } catch (error) {
        console.error("i18n load failed:", error);
      }
      const dataElement = buildI18nDataElement(i18nData);
      content = Buffer.from(content.toString("utf8").replace('<div id="root">', `${dataElement}<div id="root">`));
    }
    response.statusCode = 200;
    response.setHeader("Content-Type", mimeTypes[extension] ?? "application/octet-stream");
    response.setHeader(
      "Cache-Control",
      extension === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    );
    response.setHeader("Content-Length", content.byteLength);
    response.end(headOnly ? undefined : content);
  } catch (error) {
    console.error("Static file error", error);
    sendJson(response, 500, { error: "Unable to serve application" });
  }
}

const server = createServer(async (request, response) => {
  securityHeaders(response);
  const method = request.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendJson(response, 405, { error: "Method not allowed" });
    return;
  }

  const url = new URL(request.url ?? "/", "http://localhost");
  if (url.pathname === "/health") {
    response.setHeader("Cache-Control", "no-store");
    sendJson(response, 200, { status: "ok" });
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
      const snapshot = await getInventory();
      response.setHeader("Cache-Control", "public, max-age=30, stale-while-revalidate=30");
      sendJson(response, 200, snapshot);
    } catch (error) {
      console.error("Inventory read error", error);
      response.setHeader("Cache-Control", "no-store");
      sendJson(response, 503, { error: "Inventory is temporarily unavailable" });
    }
    return;
  }

  await sendStatic(url.pathname, response, method === "HEAD");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Airco Tracking Web listening on port ${port}`);
});

server.on("clientError", (_error, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});
