export const SUPPORTED_LANGS = ["zh", "nl", "en", "fr"] as const;
export type Lang = (typeof SUPPORTED_LANGS)[number];

export type TranslationBundle = Record<Lang, string>;
export type TranslationMap = Record<string, TranslationBundle>;

export function buildI18nDataElement(data: TranslationMap): string {
  // Script raw-text elements terminate at a literal </script sequence even
  // when their type is application/json. Escaping HTML-significant characters
  // keeps translation content inert while preserving valid JSON.
  const json = JSON.stringify(data)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
  return `<script id="i18n-data" type="application/json">${json}</script>`;
}

export function parseTranslationData(raw: string | null | undefined): TranslationMap {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const translations: TranslationMap = {};
    for (const [key, bundle] of Object.entries(value)) {
      if (
        bundle
        && typeof bundle === "object"
        && !Array.isArray(bundle)
        && SUPPORTED_LANGS.every((lang) => typeof (bundle as Record<string, unknown>)[lang] === "string")
      ) {
        translations[key] = bundle as TranslationBundle;
      }
    }
    return translations;
  } catch {
    return {};
  }
}
