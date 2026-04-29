import type { RefererCheckResult } from "../types";

/**
 * Validates that the request's `Referer` header originates from the expected
 * hostname for the matched route.
 *
 * - If `requiredHostname` is `null` the check is **skipped** (route is open).
 * - Localhost origins are always allowed (useful for local development).
 *
 * **Security:** Uses `new URL().hostname` for an exact-match comparison so that
 * substring-based bypass attempts such as
 *   `Referer: https://evil.com/?x=mitilence.1he.dev`
 *   `Referer: https://mitilence.1he.dev.evil.com/`
 * are rejected.  A malformed Referer header is also denied.
 *
 * @param request           The incoming request.
 * @param requiredHostname  Expected referer hostname, or `null` to skip.
 */
export function checkReferer(
  request: Request,
  requiredHostname: string | null
): RefererCheckResult {
  if (requiredHostname === null) {
    return { blocked: false };
  }

  const refererHeader = request.headers.get("referer") ?? "";

  let refererHostname: string;
  try {
    refererHostname = new URL(refererHeader).hostname;
  } catch {
    // Malformed or missing Referer → deny.
    return {
      blocked: true,
      status: 403,
      message: `Forbidden: Access it from https://${requiredHostname}`,
    };
  }

  const isAllowed =
    refererHostname === requiredHostname || refererHostname === "localhost";

  if (!isAllowed) {
    return {
      blocked: true,
      status: 403,
      message: `Forbidden: Access it from https://${requiredHostname}`,
    };
  }

  return { blocked: false };
}
