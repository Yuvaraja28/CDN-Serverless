import { STRIP_RESPONSE_HEADERS } from "../config";
import type { ProxyTarget } from "../types";

/**
 * Rewrites and forwards the incoming request to the upstream origin defined
 * by `target`, then post-processes the response:
 *
 * - Follows 3xx redirects internally; surfaces redirect loops as 404s.
 * - Strips sensitive upstream headers listed in `STRIP_RESPONSE_HEADERS`.
 * - Rewrites `Cache-Control` to the TTL provided.
 * - Forces PDFs to render inline (no download prompt).
 * - Pins `Content-Security-Policy: frame-ancestors 'self'` on every response.
 * - Re-runs `transformHtml` on HTML responses so callers can inject content
 *   rewrites (the default no-op keeps the original behaviour).
 *
 * @param request       The original incoming request.
 * @param target        Resolved upstream hostname + pathname.
 * @param cacheTtl      Cache TTL in seconds.
 * @param transformHtml Optional async transformer applied to HTML bodies.
 */
export async function proxyRequest(
  request: Request,
  target: ProxyTarget,
  cacheTtl: number,
  transformHtml: (html: string) => Promise<string> = async (h) => h
): Promise<Response> {
  const upstreamUrl = new URL(request.url);
  upstreamUrl.hostname = target.hostname;
  upstreamUrl.pathname = target.pathname;
  upstreamUrl.search = ""; // M3 — strip query parameters to prevent cache poisoning/leakage
  upstreamUrl.protocol = "https:"; // Force HTTPS for all upstream requests
  upstreamUrl.port = ""; // Clear port (prevents inheriting :8787 from local dev)

  // Build upstream request headers — mirror the original but fix Host and remove noisy/sensitive ones.
  const upstreamHeaders = new Headers(request.headers);
  upstreamHeaders.set("Host", target.hostname);

  // M4 — strip internal/noisy headers that shouldn't be forwarded to the origin.
  const STRIP_FORWARD_HEADERS = ["cf-ray", "cf-visitor", "cf-connecting-ip", "cf-ipcountry", "x-real-ip", "x-forwarded-for"];
  for (const h of STRIP_FORWARD_HEADERS) {
    upstreamHeaders.delete(h);
  }

  // Remove Origin for GET requests to avoid triggering CORS rejections on some upstreams.
  if (request.method === "GET") {
    upstreamHeaders.delete("Origin");
  }

  const cookies = request.headers.get("Cookie");
  if (cookies) {
    const originalHostname = new URL(request.url).hostname;
    upstreamHeaders.set("Cookie", cookies.replaceAll(originalHostname, target.hostname));
  }

  console.log(`[Proxy] Fetching: ${upstreamUrl.toString()}`);

  const upstreamRequest = new Request(upstreamUrl.toString(), {
    method: request.method,
    headers: upstreamHeaders,
    body: request.body,
    redirect: "follow",
  });

  const upstreamResponse = await fetch(upstreamRequest);

  console.log(`[Proxy] Upstream Response: ${upstreamResponse.status} ${upstreamResponse.headers.get("content-type")}`);

  // Other non-success responses.
  if (upstreamResponse.status >= 400) {
    return new Response("File Not Found", { status: 404 });
  }

  // --- Build the outbound response ------------------------------------------

  // We must not consume the stream here if we might need it for HTML rewriting.
  const contentType = upstreamResponse.headers.get("content-type") ?? "";

  if (contentType.includes("text/html")) {
    const originalText = await upstreamResponse.text();
    const rewrittenText = await transformHtml(originalText);
    const htmlResponse = new Response(rewrittenText, upstreamResponse);
    return finalizeResponse(htmlResponse, cacheTtl);
  }

  // For non-HTML (PDF, images, etc.), stream the body directly.
  return finalizeResponse(new Response(upstreamResponse.body, upstreamResponse), cacheTtl);
}

/**
 * Applies security headers and cache policies to the finalized response.
 */
function finalizeResponse(response: Response, cacheTtl: number): Response {
  // Strip sensitive / infrastructure headers leaked by the upstream.
  for (const header of STRIP_RESPONSE_HEADERS) {
    response.headers.delete(header);
  }

  // Normalise cache policy.
  response.headers.set(
    "Cache-Control",
    `public, max-age=${cacheTtl}, s-maxage=${cacheTtl}, must-revalidate`
  );

  // Security: restrict embedding to same-origin frames.
  response.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
  // L2 — prevent MIME-type sniffing.
  response.headers.set("X-Content-Type-Options", "nosniff");
  // L3 — restrict browser features.
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // Remove any upstream Location header that might trigger unintended browser redirects.
  response.headers.delete("Location");

  const contentType = response.headers.get("content-type") ?? "";

  // Force PDF preview instead of download.
  if (contentType.includes("application/pdf")) {
    response.headers.set("Content-Disposition", "inline");
  }

  return response;
}
