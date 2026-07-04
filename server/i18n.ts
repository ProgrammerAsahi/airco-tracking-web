import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TableClient } from "@azure/data-tables";
import { DefaultAzureCredential } from "@azure/identity";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(currentDirectory, "..", "..");

export type Lang = "zh" | "nl" | "en";
export type TranslationMap = Record<string, Record<Lang, string>>;

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
  if (localFile && !accountUrl) {
    // Local development: read from JSON file.
    const raw = await readFile(resolve(projectDirectory, localFile), "utf8");
    return JSON.parse(raw) as TranslationMap;
  }
  if (!accountUrl) {
    return {};
  }
  try {
    return await readFromTable(accountUrl);
  } catch (error) {
    console.error("i18n table read failed, falling back to local file:", error);
    const raw = await readFile(resolve(projectDirectory, localFile), "utf8");
    return JSON.parse(raw) as TranslationMap;
  }
}

async function readFromTable(url: string): Promise<TranslationMap> {
  const credential = new DefaultAzureCredential({
    managedIdentityClientId: process.env.AZURE_CLIENT_ID?.trim() || undefined,
  });
  const table = new TableClient(url, tableName, credential);
  const translations: TranslationMap = {};
  for await (const entity of table.listEntities({
    queryOptions: { filter: `PartitionKey eq '${scope}'` },
  })) {
    const key = entity.rowKey as string;
    if (!key) continue;
    translations[key] = {
      zh: String(entity.zh ?? ""),
      nl: String(entity.nl ?? ""),
      en: String(entity.en ?? ""),
    };
  }
  if (Object.keys(translations).length === 0) {
    console.warn("i18n table returned no entities; falling back to local file");
    const raw = await readFile(resolve(projectDirectory, localFile), "utf8");
    return JSON.parse(raw) as TranslationMap;
  }
  return translations;
}
