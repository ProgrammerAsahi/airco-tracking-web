import { readFile, stat } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient } from "@azure/storage-blob";
import { parseInventory, type InventorySnapshot } from "./inventory.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
// Compiled server.js lives at <root>/server-dist/server/server.js, so go up
// two levels to reach the project root that contains dist/.
const projectDirectory = resolve(currentDirectory, "..", "..");
const staticDirectory = join(projectDirectory, "dist");
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const inventoryFile = process.env.INVENTORY_FILE?.trim();
const cacheMilliseconds = Number.parseInt(process.env.INVENTORY_CACHE_SECONDS ?? "30", 10) * 1000;

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
  response.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
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
    const content = await readFile(filePath);
    const extension = extname(filePath).toLowerCase();
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
