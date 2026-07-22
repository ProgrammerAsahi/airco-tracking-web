export type RetailerHashSelection<TTab extends string> = {
  key: string;
  tab: TTab;
};

const MAX_RETAILER_HASH_LENGTH = 512;

/**
 * Parse the optional retailer detail hash without allowing malformed percent
 * escapes to crash the whole React tree.
 */
export function parseRetailerHash<TTab extends string>(
  hash: string,
  defaultTab: TTab,
  alternateTab: TTab,
): RetailerHashSelection<TTab> | null {
  if (!hash.startsWith("#/") || hash === "#/" || hash.length > MAX_RETAILER_HASH_LENGTH) {
    return null;
  }

  const [encodedKey, tab] = hash.slice(2).split("/", 2);
  if (!encodedKey) return null;

  try {
    const key = decodeURIComponent(encodedKey);
    if (!key || /[\u0000-\u001f\u007f]/u.test(key)) return null;
    return {
      key,
      tab: tab === alternateTab ? alternateTab : defaultTab,
    };
  } catch {
    return null;
  }
}
