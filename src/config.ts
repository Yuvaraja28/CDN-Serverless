/**
 * Route table structure.
 */
export interface RouteConfig {
  /** Upstream origin hostname (without protocol) */
  upstreamHostname: string;
  /** Path prefix to prepend when building the upstream URL */
  upstreamPathPrefix: string;
  /**
   * Required referer hostname. When set, requests whose `Referer` header
   * does not contain this value (and does not contain "localhost") are
   * rejected with HTTP 403. Set to `null` to skip the referer check.
   */
  requiredRefererHostname: string | null;
  /**
   * Name of the `env` binding key for the rate-limiter associated with
   * this route. Must match a key in the `Env` interface / wrangler.jsonc.
   */
  rateLimiterKey: keyof Env | null;
}

/**
 * Parses the ROUTES_JSON environment variable.
 * Expected format: Record<string, RouteConfig>
 */
export function getRoutes(env: Env): Record<string, RouteConfig> {
  try {
    if (!env.ROUTES_JSON) {
      console.error("ROUTES_JSON is not defined in environment variables.");
      return {};
    }
    return JSON.parse(env.ROUTES_JSON);
  } catch (e) {
    console.error("Failed to parse ROUTES_JSON:", e);
    return {};
  }
}

/**
 * Gets the Cache TTL from the environment variable or returns the default.
 */
export function getCacheTtl(env: Env): number {
  const ttl = parseInt(env.CACHE_TTL || "7200", 10);
  return isNaN(ttl) ? 7200 : ttl;
}

/**
 * Response headers from upstream origins that must never be forwarded
 * to clients.
 */
export const STRIP_RESPONSE_HEADERS: readonly string[] = [
  // AWS CloudFront / S3 leakage
  "via",
  "x-amz-cf-id",
  "x-amz-cf-pop",
  "x-cache",
  // ImageKit / upstream server identity
  "x-server",
  "x-request-id",
  // CDN edge metadata
  "age",
  "alt-svc",
  "timing-allow-origin",
  // CORS — the Worker sets its own policy
  "access-control-allow-origin",
  "access-control-allow-methods",
  "access-control-allow-headers",
] as const;
