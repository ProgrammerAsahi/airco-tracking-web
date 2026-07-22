import type { SiteInventory } from "./inventory.js";

export const DEFAULT_DESTINATION_COUNTRY = "nl";

const ISO2_RE = /^[a-z]{2}$/;

const EU_COUNTRIES = new Set([
  "at", "be", "bg", "hr", "cy", "cz", "dk", "ee", "fi", "fr", "de", "gr", "hu",
  "ie", "it", "lv", "lt", "lu", "mt", "nl", "pl", "pt", "ro", "sk", "si", "es", "se",
]);
const EEA_COUNTRIES = new Set([...EU_COUNTRIES, "is", "li", "no"]);
const NORDIC_COUNTRIES = new Set(["dk", "fi", "is", "no", "se"]);
const BENELUX_COUNTRIES = new Set(["be", "nl", "lu"]);
const DACH_COUNTRIES = new Set(["de", "at", "ch"]);

export function normaliseDestinationCountry(value: string | null | undefined): string {
  const country = value?.trim().toLowerCase();
  return country && ISO2_RE.test(country) ? country : DEFAULT_DESTINATION_COUNTRY;
}

export function destinationCountryFromPath(pathname: string): string {
  const match = pathname.match(/^\/deliver-to\/([a-z]{2})\/?$/i);
  return normaliseDestinationCountry(match?.[1]);
}

export function canonicalDeliveryPath(country: string): string {
  return `/deliver-to/${normaliseDestinationCountry(country)}`;
}

export function siteMatchesDestination(
  siteKey: string,
  site: SiteInventory,
  destinationCountry: string,
): boolean {
  const destination = normaliseDestinationCountry(destinationCountry);
  const coverage = site.delivery_coverage?.length
    ? site.delivery_coverage.map((token) => token.toLowerCase())
    : [site.country ?? siteKey.match(/^([a-z]{2}):/i)?.[1] ?? DEFAULT_DESTINATION_COUNTRY];

  return coverage.some((token) => deliveryTokenMatchesDestination(token, destination));
}

export function visibleSiteEntries(
  sites: Record<string, SiteInventory>,
  destinationCountry: string,
): [string, SiteInventory][] {
  return Object.entries(sites).filter(([siteKey, site]) =>
    siteMatchesDestination(siteKey, site, destinationCountry),
  );
}

export type DestinationInventoryConfidence = "verified" | "partial" | "unavailable";

/**
 * Derive confidence from only the retailers that can serve the requested
 * destination. The producer's top-level confidence is intentionally global;
 * using it on a country page lets an unrelated outage in another country
 * produce a false warning (or hide a real one).
 */
export function destinationInventoryConfidence(
  sites: Record<string, SiteInventory>,
  destinationCountry: string,
): DestinationInventoryConfidence {
  const relevant = visibleSiteEntries(sites, destinationCountry);
  const verified = relevant.filter(([, site]) => !site.stale && site.counts_toward_totals !== false);
  if (verified.length === 0) return "unavailable";
  return relevant.some(([, site]) => site.stale || site.counts_toward_totals === false)
    ? "partial"
    : "verified";
}

function deliveryTokenMatchesDestination(token: string, destination: string): boolean {
  const normalised = token.trim().toLowerCase();
  if (normalised === destination) return true;
  if (normalised === "eu") return EU_COUNTRIES.has(destination);
  if (normalised === "eea") return EEA_COUNTRIES.has(destination);
  if (normalised === "nordics") return NORDIC_COUNTRIES.has(destination);
  if (normalised === "benelux") return BENELUX_COUNTRIES.has(destination);
  if (normalised === "dach") return DACH_COUNTRIES.has(destination);
  return false;
}
