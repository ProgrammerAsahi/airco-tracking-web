const PRIVATE_PAGE_PATHS = new Set(["/profile", "/ready", "/unsubscribe", "/withdrawal.html"]);

/** Pages that contain account state or paid inventory must never enter search results. */
export function isPrivatePagePath(pathname: string): boolean {
  return PRIVATE_PAGE_PATHS.has(pathname)
    || pathname === "/deliver-to"
    || pathname.startsWith("/deliver-to/");
}
