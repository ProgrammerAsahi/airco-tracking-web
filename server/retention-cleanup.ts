import { pathToFileURL } from "node:url";
import { TableClient, type TableEntityResult } from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";
import { logError } from "./safe-logger.js";

type ExpiringEntity = {
  partitionKey: string;
  rowKey: string;
  expiresAt?: string;
  retentionUntil?: string;
};

export type CleanupTable = {
  listEntities<T extends object>(options?: { queryOptions?: { filter?: string } }): AsyncIterableIterator<TableEntityResult<T>>;
  deleteEntity(partitionKey: string, rowKey: string, options?: { etag?: string }): Promise<unknown>;
};

export type CleanupResult = {
  scanned: number;
  deleted: number;
  invalid: number;
  limitReached: boolean;
};

function statusCode(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  return typeof error.statusCode === "number" ? error.statusCode : null;
}

export async function cleanupExpiredPartition(options: {
  table: CleanupTable;
  partitionKey: string;
  expiryField: "expiresAt" | "retentionUntil";
  now: number;
  maxDeletes: number;
  deleteInvalidExpiry: boolean;
}): Promise<CleanupResult> {
  const result: CleanupResult = { scanned: 0, deleted: 0, invalid: 0, limitReached: false };
  const escapedPartition = options.partitionKey.replaceAll("'", "''");
  const entities = options.table.listEntities<ExpiringEntity>({
    queryOptions: { filter: `PartitionKey eq '${escapedPartition}'` },
  });
  for await (const entity of entities) {
    result.scanned += 1;
    const value = entity[options.expiryField];
    const expiresAt = typeof value === "string" ? Date.parse(value) : Number.NaN;
    if (!Number.isFinite(expiresAt)) {
      result.invalid += 1;
      if (!options.deleteInvalidExpiry) continue;
    } else if (expiresAt > options.now) {
      continue;
    }
    if (result.deleted >= options.maxDeletes) {
      result.limitReached = true;
      break;
    }
    try {
      await options.table.deleteEntity(String(entity.partitionKey), String(entity.rowKey), entity.etag ? { etag: entity.etag } : undefined);
      result.deleted += 1;
    } catch (error) {
      if (statusCode(error) !== 404 && statusCode(error) !== 412) throw error;
    }
  }
  return result;
}

function tableUrlFromStorageAccountUrl(value: string): string {
  return value.includes(".table.") ? value : value.replace(".blob.", ".table.");
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value?.trim() || "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function runRetentionCleanup(now = Date.now()): Promise<Record<string, CleanupResult>> {
  const accountUrl = process.env.AZURE_STORAGE_ACCOUNT_URL?.trim();
  if (!accountUrl) throw new Error("AZURE_STORAGE_ACCOUNT_URL is required");
  const credential = new DefaultAzureCredential({ managedIdentityClientId: process.env.AZURE_CLIENT_ID?.trim() || undefined });
  const tableUrl = tableUrlFromStorageAccountUrl(accountUrl);
  const maximum = positiveInteger(process.env.RETENTION_CLEANUP_MAX_DELETES, 10_000);
  const codes = new TableClient(tableUrl, process.env.AUTH_CODES_TABLE?.trim() || "authcodes", credential);
  const sessions = new TableClient(tableUrl, process.env.AUTH_SESSIONS_TABLE?.trim() || "authsessions", credential);
  const users = new TableClient(tableUrl, process.env.AUTH_USERS_TABLE?.trim() || "users", credential);
  const results = {
    authCodes: await cleanupExpiredPartition({ table: codes, partitionKey: "auth-code", expiryField: "expiresAt", now, maxDeletes: maximum, deleteInvalidExpiry: true }),
    codeBudgets: await cleanupExpiredPartition({ table: codes, partitionKey: "auth-budget", expiryField: "expiresAt", now, maxDeletes: maximum, deleteInvalidExpiry: true }),
    sessions: await cleanupExpiredPartition({ table: sessions, partitionKey: "auth-session", expiryField: "expiresAt", now, maxDeletes: maximum, deleteInvalidExpiry: true }),
    legalRetention: await cleanupExpiredPartition({ table: users, partitionKey: "legal-retention", expiryField: "retentionUntil", now, maxDeletes: maximum, deleteInvalidExpiry: false }),
  };
  if (results.legalRetention.invalid > 0) {
    throw new Error(`Refusing to delete ${results.legalRetention.invalid} legal-retention row(s) with invalid deadlines`);
  }
  return results;
}

async function main(): Promise<void> {
  const results = await runRetentionCleanup();
  console.info(JSON.stringify({ event: "web_retention_cleanup_completed", results }));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error: unknown) => {
    logError("web_retention_cleanup_failed", error);
    process.exitCode = 1;
  });
}
