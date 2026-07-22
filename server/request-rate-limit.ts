import { isIP } from "node:net";
import type { IncomingMessage } from "node:http";

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

function normalizeIp(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;
  const unwrapped = candidate.startsWith("[") && candidate.endsWith("]")
    ? candidate.slice(1, -1)
    : candidate;
  const normalized = unwrapped.startsWith("::ffff:") && isIP(unwrapped.slice(7)) === 4
    ? unwrapped.slice(7)
    : unwrapped;
  return isIP(normalized) > 0 ? normalized.toLowerCase() : null;
}

function forwardedHeader(request: IncomingMessage): string | null {
  const header = request.headers["x-forwarded-for"];
  if (typeof header === "string") return header;
  if (Array.isArray(header)) return header.join(",");
  return null;
}

/**
 * Azure Container Apps ingress appends the address it observed to the right
 * side of X-Forwarded-For. Only that final, syntactically valid address is
 * trusted; attacker-controlled values to its left are ignored. Outside the
 * explicitly trusted ingress environment, the socket address is authoritative.
 */
export function trustedClientAddress(
  request: IncomingMessage,
  trustPlatformForwardedFor = process.env.TRUST_PLATFORM_X_FORWARDED_FOR?.trim().toLowerCase() === "true",
): string {
  const socketAddress = normalizeIp(request.socket.remoteAddress) ?? "unknown";
  if (!trustPlatformForwardedFor) return socketAddress;

  const header = forwardedHeader(request);
  if (!header) return socketAddress;
  const rightmost = header.split(",").at(-1);
  return normalizeIp(rightmost) ?? socketAddress;
}

export class BoundedRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();
  private lastCleanup = 0;

  constructor(
    private readonly windowMilliseconds: number,
    private readonly maximumBuckets: number,
  ) {
    if (!Number.isSafeInteger(maximumBuckets) || maximumBuckets < 1) {
      throw new Error("maximumBuckets must be a positive integer");
    }
  }

  get size(): number {
    return this.buckets.size;
  }

  check(key: string, maximumRequests: number, now = Date.now()): RateLimitDecision {
    if (maximumRequests <= 0 || this.windowMilliseconds <= 0) return { allowed: true };

    if (now - this.lastCleanup >= this.windowMilliseconds || this.buckets.size >= this.maximumBuckets) {
      for (const [bucketKey, bucket] of this.buckets) {
        if (bucket.resetAt <= now) this.buckets.delete(bucketKey);
      }
      this.lastCleanup = now;
    }

    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      while (this.buckets.size >= this.maximumBuckets) {
        const oldest = this.buckets.keys().next().value as string | undefined;
        if (!oldest) break;
        this.buckets.delete(oldest);
      }
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMilliseconds });
      return { allowed: true };
    }
    if (existing.count >= maximumRequests) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1_000)),
      };
    }
    existing.count += 1;
    return { allowed: true };
  }
}
