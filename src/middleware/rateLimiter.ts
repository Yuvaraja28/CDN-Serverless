import type { RateLimitResult } from "../types";

/**
 * Applies rate limiting for the given request using the provided limiter
 * binding.  Returns a result object; the caller is responsible for returning
 * the HTTP 429 response when `success` is `false`.
 *
 * The rate-limit key is the client's IP address (`cf-connecting-ip` header).
 */
export async function applyRateLimit(
  request: Request,
  rateLimiter: RateLimit
): Promise<RateLimitResult> {
  const ipAddress = request.headers.get("cf-connecting-ip") ?? "";
  const { success } = await rateLimiter.limit({ key: ipAddress });

  return {
    success,
    status: 429,
    message: "Too Many Requests", // H2 — never echo the client IP back
  };
}
