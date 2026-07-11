import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TableClient } from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";
import {
  parseTranslationData,
  SUPPORTED_LANGS,
  type TranslationBundle,
  type TranslationMap,
} from "../shared/i18n.js";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(currentDirectory, "..", "..");

const accountUrl = process.env.AZURE_STORAGE_ACCOUNT_URL?.trim();
const localFile = process.env.I18N_FILE?.trim() || "test-fixtures/i18n.local.json";
const tableName = "i18n";
const scope = "web";

let cached: { expiresAt: number; data: TranslationMap } | undefined;
let inFlight: Promise<TranslationMap> | undefined;
const cacheMs = 5 * 60 * 1000; // 5 minutes

export async function loadI18n(): Promise<TranslationMap> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.data;
  if (!inFlight) {
    inFlight = readI18nSource()
      .then((data) => {
        cached = { expiresAt: Date.now() + cacheMs, data };
        return data;
      })
      .finally(() => {
        inFlight = undefined;
      });
  }
  return inFlight;
}

async function readI18nSource(): Promise<TranslationMap> {
  const localTranslations = await readLocalI18n();
  if (localFile && !accountUrl) {
    // Local development: read from JSON file.
    return localTranslations;
  }
  if (!accountUrl) {
    return localTranslations;
  }
  try {
    return await readFromTable(accountUrl, localTranslations);
  } catch (error) {
    console.error("i18n table read failed, falling back to local file:", error);
    return localTranslations;
  }
}

async function readLocalI18n(): Promise<TranslationMap> {
  const raw = await readFile(resolve(projectDirectory, localFile), "utf8");
  return parseTranslationData(raw);
}

async function readFromTable(url: string, localTranslations: TranslationMap): Promise<TranslationMap> {
  // The AZURE_STORAGE_ACCOUNT_URL env var points to the blob endpoint;
  // derive the table endpoint from it.
  const tableUrl = url.includes(".table.") ? url : url.replace(".blob.", ".table.");
  const credential = new DefaultAzureCredential({
    managedIdentityClientId: process.env.AZURE_CLIENT_ID?.trim() || undefined,
  });
  const table = new TableClient(tableUrl, tableName, credential);
  const translations: TranslationMap = { ...localTranslations };
  let tableEntityCount = 0;
  for await (const entity of table.listEntities({
    queryOptions: { filter: `PartitionKey eq '${scope}'` },
  })) {
    const key = entity.rowKey as string;
    if (!key) continue;
    const merged = mergeTranslationBundle(localTranslations[key], entity as Record<string, unknown>);
    if (!merged) continue;
    translations[key] = merged;
    tableEntityCount += 1;
  }
  if (tableEntityCount === 0) {
    console.warn("i18n table returned no entities; falling back to local file");
  }
  return translations;
}

export function mergeTranslationBundle(
  fallback: TranslationBundle | undefined,
  values: Record<string, unknown>,
): TranslationBundle | null {
  const merged = {} as Record<(typeof SUPPORTED_LANGS)[number], string>;
  for (const lang of SUPPORTED_LANGS) {
    const candidate = typeof values[lang] === "string" ? values[lang].trim() : "";
    const value = candidate || fallback?.[lang] || "";
    if (!value) return null;
    merged[lang] = value;
  }
  return merged;
}
