/**
 * CDN Server — Cloudflare Worker entry point
 *
 * Request lifecycle:
 *  1. Route resolution  – match pathname prefix against ROUTES table.
 *  2. Rate limiting     – per-IP limit via the bound RateLimiter.
 *  3. Referer check     – optional origin-lock per route.
 *  4. Proxy             – forward to upstream, rewrite response headers / body.
 */

import { getRoutes, getCacheTtl } from "./config";
import { applyRateLimit } from "./middleware/rateLimiter";
import { checkReferer } from "./middleware/refererCheck";
import { proxyRequest } from "./handlers/proxy";
import type { ProxyTarget } from "./types";

// ---------------------------------------------------------------------------
// HTML transformer (extend this to inject analytics, replace assets, etc.)
// ---------------------------------------------------------------------------

async function transformHtml(html: string): Promise<string> {
  return html;
}

// ---------------------------------------------------------------------------
// Worker export
// ---------------------------------------------------------------------------

// Only GET and HEAD are valid for a read-only CDN proxy.
const ALLOWED_METHODS = new Set(["GET", "HEAD"]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // M4 — reject any write-method before doing any other work.
    if (!ALLOWED_METHODS.has(request.method)) {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    // ------------------------------------------------------------------
    // Route resolution
    // ------------------------------------------------------------------

    const routes = getRoutes(env);
    const lowerPathname = url.pathname.toLowerCase();
    const matchedPrefix = Object.keys(routes).find((prefix) =>
      lowerPathname.startsWith(prefix)
    );

    if (!matchedPrefix) {
      return new Response("Endpoint not found", { status: 404 });
    }

    const route = routes[matchedPrefix];

    // ------------------------------------------------------------------
    // Rate limiting
    // ------------------------------------------------------------------

    if (route.rateLimiterKey) {
      const limiter = env[route.rateLimiterKey] as any; // Cast for dynamic lookup
      if (limiter && typeof limiter.limit === "function") {
        const rateLimitResult = await applyRateLimit(request, limiter);
        if (!rateLimitResult.success) {
          return new Response(rateLimitResult.message, { status: rateLimitResult.status });
        }
      }
    }

    // ------------------------------------------------------------------
    // Referer / origin check
    // ------------------------------------------------------------------

    const refererResult = checkReferer(request, route.requiredRefererHostname);
    if (refererResult.blocked) {
      return new Response(refererResult.message, { status: refererResult.status });
    }

    // ------------------------------------------------------------------
    // Build upstream proxy target
    // ------------------------------------------------------------------

    // Drop the matched prefix segment from the path and preserve the rest.
    const cleanPath = url.pathname.slice(matchedPrefix.length).replace(/^\/+/, "");

    const upstreamPathname = route.upstreamPathPrefix
      ? `${route.upstreamPathPrefix}/${cleanPath}`
      : cleanPath;

    // M1 — strip any dot-dot / dot-only segments to prevent path traversal.
    const safePathname = upstreamPathname
      .split("/")
      .filter((seg) => seg !== ".." && seg !== ".")
      .join("/");

    const target: ProxyTarget = {
      hostname: route.upstreamHostname,
      pathname: `/${safePathname}`, // Ensure leading slash for URL construction
    };

    // ------------------------------------------------------------------
    // Proxy
    // ------------------------------------------------------------------

    const cacheTtl = getCacheTtl(env);
    return proxyRequest(request, target, cacheTtl, transformHtml);
  },
} satisfies ExportedHandler<Env>;
