/**
 * Result returned by the rate-limiter middleware.
 */
export interface RateLimitResult {
  success: boolean;
  status: 429;
  message: string;
}

/**
 * Result returned by the referer-check middleware.
 */
export type RefererCheckResult =
  | { blocked: true; status: 403; message: string }
  | { blocked: false };

/**
 * Resolved proxy target produced by the routing logic.
 */
export interface ProxyTarget {
  /** Hostname of the upstream origin (e.g. "ik.imagekit.io") */
  hostname: string;
  /** Full pathname to request from the upstream origin */
  pathname: string;
}
