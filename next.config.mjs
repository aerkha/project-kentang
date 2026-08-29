import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
// CATATAN: Logika normalisasi URL PocketBase (strip `/_/`, `/api`,
// trailing slash) ada di `lib/pocketbase.ts → getPbBaseUrl()`. next.config
// tidak bisa import dari TypeScript langsung, jadi kita duplikasi
// logika minimal di sini: url.origin selalu host:port tanpa path.
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

const SELF = process.env.NEXT_PUBLIC_APP_URL || PB_ORIGIN;

const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' 'unsafe-eval'`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob: ${PB_ORIGIN}`,
  `font-src 'self' data: https://fonts.gstatic.com`,
  // Menambahkan *.sentry.io jika tunnel monitoring gagal
  `connect-src 'self' ${PB_ORIGIN} ${PB_WS} ws: wss: https://*.sentry.io`,
  // Preview PDF PKS memakai URL.createObjectURL(file), sehingga iframe perlu
  // diizinkan memuat URL blob yang dibuat lokal oleh browser.
  `frame-src 'self' blob:`,
  `frame-ancestors 'none'`,
  `form-action 'self'`,
  `object-src 'none'`,
  `base-uri 'self'`,
].join("; ");

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
  // CRUCIAL UNTUK VPS: Mengemas aplikasi beserta node_modules yang dibutuhkan
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

void SELF;

export default withSentryConfig(nextConfig, {
  org: "personal-zhj",
  project: "javascript-nextjs",
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: "/monitoring",
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});