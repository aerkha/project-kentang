/** @type {import('next').NextConfig} */

// PocketBase origin used by the client SDK (NEXT_PUBLIC_PB_URL, e.g.
// http://127.0.0.1:8090 in dev or https://pb.your-domain.com in prod).
// Used to build a sane Content-Security-Policy without locking the app to a
// single host. We add both http+ws and https+wss so realtime subscriptions
// work in dev and prod.
const PB_ORIGIN = (() => {
  const raw = process.env.NEXT_PUBLIC_PB_URL || "http://127.0.0.1:8090";
  try {
    const u = new URL(raw);
    return u.origin;
  } catch {
    return "http://127.0.0.1:8090";
  }
})();

const PB_WS = PB_ORIGIN.replace(/^http/, "ws");

// Base URL of this Next.js app (used for form-action / frame-ancestors /
// connect-src 'self'). Inferred from VERCEL_PROJECT_PRODUCTION_URL in prod,
// otherwise falls back to the request host via x-forwarded-proto/host in
// middleware; for static config we just use a wildcard for self-allowed
// values where the protocol isn't critical.
const SELF = process.env.NEXT_PUBLIC_APP_URL || PB_ORIGIN;

const csp = [
  `default-src 'self'`,
  // Scripts: Next.js needs 'unsafe-inline' for some inline bootstrap scripts
  // and 'unsafe-eval' in dev (webpack HMR). 'strict-dynamic' allows
  // nonce-loaded scripts to load further scripts.
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'strict-dynamic'`,
  // Styles: Next.js injects inline styles for CSS-in-JS and font fallbacks.
  `style-src 'self' 'unsafe-inline'`,
  // Images: allow data: (inline previews), blob: (object URLs for uploads),
  // and PocketBase file URLs.
  `img-src 'self' data: blob: ${PB_ORIGIN}`,
  // Fonts: Google Fonts (next/font/google) is self-hosted at build time, but
  // we still allow gstatic as a safety net + data: for inline font data.
  `font-src 'self' data: https://fonts.gstatic.com`,
  // XHR/fetch: same-origin + PocketBase (REST + realtime WebSocket).
  `connect-src 'self' ${PB_ORIGIN} ${PB_WS} ws: wss:`,
  // Frames/embeds: only self. If you embed PocketBase Admin in an iframe,
  // add ${PB_ORIGIN} here.
  `frame-src 'self'`,
  `frame-ancestors 'none'`,
  // Forms: only submit to ourselves (login, API routes, etc.).
  `form-action 'self'`,
  // Restrict legacy / dangerous sources.
  `object-src 'none'`,
  `base-uri 'self'`,
].join("; ");

/**
 * Security headers applied to every response.
 *
 * - Strict-Transport-Security: forces HTTPS for 1y, including subdomains,
 *   eligible for HSTS preload. Safe to set even in dev (browsers ignore it
 *   on localhost).
 * - X-Content-Type-Options: nosniff to block MIME-type sniffing.
 * - X-Frame-Options: DENY (defence in depth alongside CSP frame-ancestors).
 * - Referrer-Policy: strict-origin-when-cross-origin to limit referrer leak.
 * - Permissions-Policy: disable powerful APIs the app doesn't use.
 * - X-DNS-Prefetch-Control: off (no third-party prefetch).
 * - Cross-Origin-Opener-Policy / Cross-Origin-Resource-Policy: same-origin.
 * - Content-Security-Policy: see comment above.
 */
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

// Silence the unused warning while keeping the value documented above.
void SELF;

export default nextConfig;
