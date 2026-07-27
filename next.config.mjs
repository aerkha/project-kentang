import { withSentryConfig } from "@sentry/nextjs";
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

// We deliberately DO NOT use `'strict-dynamic'` because in CSP Level 3 it
// overrides `'unsafe-inline'` and `'self'` for script-src — meaning any
// inline script injected by Next.js (RSC payloads, hydration bootstrap,
// `__NEXT_DATA__`, dev-mode devtools, etc.) would be blocked unless we
// start emitting per-request nonces (which requires a custom server or
// middleware that signs every request). For an app hosted on Vercel and
// served as a static SPA-style bundle, `unsafe-inline` + `unsafe-eval` is
// the pragmatic and well-supported baseline. Tighten this with nonces
// later if a security audit requires it.
//
// The `https://vercel.live` and `https://*.vercel.com` entries are only
// needed when the Vercel Toolbar / dev overlay is active. They are harmless
// in production.
const csp = [
  `default-src 'self'`,
  // Scripts: Next.js needs 'unsafe-inline' for inline bootstrap scripts
  // (RSC, hydration, __NEXT_DATA__) and 'unsafe-eval' in dev (webpack HMR).
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live https://*.vercel.com`,
  // Styles: Next.js injects inline styles for CSS-in-JS and font fallbacks.
  `style-src 'self' 'unsafe-inline'`,
  // Images: allow data: (inline previews), blob: (object URLs for uploads),
  // and PocketBase file URLs.
  `img-src 'self' data: blob: ${PB_ORIGIN} https://vercel.live https://*.vercel.com`,
  // Fonts: Google Fonts (next/font/google) is self-hosted at build time, but
  // we still allow gstatic as a safety net + data: for inline font data.
  `font-src 'self' data: https://fonts.gstatic.com`,
  // XHR/fetch: same-origin + PocketBase (REST + realtime WebSocket) +
  // Vercel toolbar telemetry.
  `connect-src 'self' ${PB_ORIGIN} ${PB_WS} ws: wss: https://vercel.live https://*.vercel.com`,
  // Frames/embeds: only self. If you embed PocketBase Admin in an iframe,
  // add ${PB_ORIGIN} here. Vercel toolbar mounts an iframe in dev preview.
  `frame-src 'self' https://vercel.live https://*.vercel.com`,
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

export default withSentryConfig(nextConfig, {
 // For all available options, see:
 // https://www.npmjs.com/package/@sentry/webpack-plugin#options

 org: "personal-zhj",

 project: "javascript-nextjs",

 // Only print logs for uploading source maps in CI
 silent: !process.env.CI,

 // For all available options, see:
 // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

 // Upload a larger set of source maps for prettier stack traces (increases build time)
 widenClientFileUpload: true,

 // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
 // This can increase your server load as well as your hosting bill.
 // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
 // side errors will fail.
 tunnelRoute: "/monitoring",

 webpack: {
   // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
   // See the following for more information:
   // https://docs.sentry.io/product/crons/
   // https://vercel.com/docs/cron-jobs
   automaticVercelMonitors: true,

   // Tree-shaking options for reducing bundle size
   treeshake: {
     // Automatically tree-shake Sentry logger statements to reduce bundle size
     removeDebugLogging: true,
   },
 },
});
