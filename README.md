# CDN Proxy Server

A high-performance, secure, and production-ready CDN Proxy built on Cloudflare Workers. This server acts as a protective layer between your clients and upstream storage/CDN origins (like R2, S3, or ImageKit).

## Features

### 🛡️ Security & Hardening
- **Defense-in-Depth Header Sanitization**:
    - Strips internal infrastructure headers (AWS, CloudFront, ImageKit metadata) on the way out.
    - Strips sensitive Cloudflare headers (`cf-*`) on the way in.
- **Referer Lock**: Restricts access to specific hostnames to prevent hotlinking.
- **Path Traversal Protection**: Sanitizes URL paths to prevent `../` attacks.
- **Method Allowlisting**: Only `GET` and `HEAD` requests are permitted.
- **Exact Hostname Matching**: Uses robust hostname validation for referer checks.
- **PDF Hardening**: Forces PDF files to render `inline` in the browser to prevent auto-downloads.
- **Security Headers**: Injects `Content-Security-Policy`, `X-Content-Type-Options`, and `Permissions-Policy`.

### 🚀 Performance
- **Global Edge Caching**: Configurable Cache-TTL enforced at the edge.
- **Stream-Based Proxy**: Proxies large assets efficiently without buffering the entire body.
- **Query Param Stripping**: Removes query parameters from upstream requests to improve cache hit ratios and prevent leakage.

### 🚦 Traffic Control
- **IP-Based Rate Limiting**: Built-in support for Cloudflare's Rate Limiting API per route.

---

## Configuration

The server is entirely configuration-driven via environment variables.

### Environment Variables (`.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `ROUTES_JSON` | A JSON object defining the route table. | `{}` |
| `CACHE_TTL` | Edge cache duration in seconds. | `7200` |

### Route Table Structure (`ROUTES_JSON`)

The `ROUTES_JSON` is a map where keys are the path prefixes (e.g., `/images`).

```json
{
  "/my-folder": {
    "upstreamHostname": "origin.com",
    "upstreamPathPrefix": "storage/path",
    "requiredRefererHostname": "mysite.com",
    "rateLimiterKey": "MY_LIMITER"
  }
}
```

- `upstreamHostname`: The origin hostname (no protocol).
- `upstreamPathPrefix`: Path to prepend to the incoming request path.
- `requiredRefererHostname`: Exact hostname required in the `Referer` header (optional).
- `rateLimiterKey`: The name of the rate-limiter binding in `wrangler.jsonc`.

---

## Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-upgrading/)

### 2. Local Setup
1. Clone the repository.
2. Copy `env.sample.txt` to `.env`:
   ```bash
   cp env.sample.txt .env
   ```
3. Update `.env` with your routes.
4. Install dependencies:
   ```bash
   npm install
   ```
5. Run the development server:
   ```bash
   npx wrangler dev
   ```

### 3. Deployment
1. Update `wrangler.jsonc` with your production rate limiter `namespace_id`s.
2. Set your `ROUTES_JSON` as a secret or var:
   ```bash
   npx wrangler secret put ROUTES_JSON
   ```
3. Deploy:
   ```bash
   npx wrangler deploy
   ```

## Development

### Adding a New Route
1. Add a new entry to `ROUTES_JSON` in your `.env`.
2. If you need rate limiting, add a new `ratelimit` binding to `wrangler.jsonc` and run `npx wrangler types`.
3. Restart the dev server.

---

## License
MIT
