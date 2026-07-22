import type { IncomingMessage } from "node:http";

export const TRUSTED_NON_BROWSER_HEADER = "x-airco-api-client";
export const TRUSTED_NON_BROWSER_VALUE = "trusted-non-browser-v1";

/**
 * Protect cookie-authenticated state changes against cross-site requests.
 *
 * Browsers must send an exact same-origin Origin and, when Fetch Metadata is
 * present, Sec-Fetch-Site must also say same-origin. A browser-shaped request
 * without Origin fails closed. Deliberate non-browser clients have no Fetch
 * Metadata and must opt in with a custom header; browsers cannot add that
 * header cross-origin without a CORS preflight, which this service never
 * permits.
 */
export function unsafeRequestIsTrusted(request: IncomingMessage): boolean {
  const origin = singleHeader(request.headers.origin);
  const fetchSite = singleHeader(request.headers["sec-fetch-site"]);
  const fetchMode = singleHeader(request.headers["sec-fetch-mode"]);
  const fetchDest = singleHeader(request.headers["sec-fetch-dest"]);
  const browserShaped = Boolean(origin || fetchSite || fetchMode || fetchDest);

  if (!browserShaped) {
    return singleHeader(request.headers[TRUSTED_NON_BROWSER_HEADER]) === TRUSTED_NON_BROWSER_VALUE;
  }
  if (!origin || origin === "null") return false;
  if (fetchSite && fetchSite !== "same-origin") return false;

  const expectedHost = firstForwardedValue(request.headers["x-forwarded-host"])
    || firstForwardedValue(request.headers.host);
  if (!expectedHost) return false;
  const forwardedProtocol = firstForwardedValue(request.headers["x-forwarded-proto"]);
  const expectedProtocol = forwardedProtocol
    ? `${forwardedProtocol.toLowerCase()}:`
    : socketIsEncrypted(request) ? "https:" : "http:";
  try {
    const parsed = new URL(origin);
    return parsed.host.toLowerCase() === expectedHost.toLowerCase()
      && parsed.protocol === expectedProtocol;
  } catch {
    return false;
  }
}

function singleHeader(value: string | string[] | undefined): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (Array.isArray(value) && value.length === 1) return value[0]?.trim() || null;
  return null;
}

function firstForwardedValue(value: string | string[] | undefined): string | null {
  const header = singleHeader(value);
  return header?.split(",")[0]?.trim() || null;
}

function socketIsEncrypted(request: IncomingMessage): boolean {
  return (request.socket as typeof request.socket & { encrypted?: boolean }).encrypted === true;
}
