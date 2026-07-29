import { NextResponse } from "next/server";
import PocketBase from "pocketbase";

/**
 * GET /api/health
 *
 * Endpoint health check untuk monitoring eksternal (UptimeRobot, BetterStack,
 * Healthchecks.io, dll) dan PM2/Nginx upstream probes.
 *
 * Response shape (always JSON):
 *   {
 *     status: "ok" | "degraded",
 *     timestamp: ISO 8601 string,
 *     uptime: seconds since process start,
 *     version: package.json version,
 *     checks: {
 *       server:    "ok",
 *       pocketbase: "ok" | "error" | "skipped",
 *       env:       "ok" | "warning" (jika ada env kritikal kosong)
 *     },
 *     latency: { pocketbase: ms },
 *   }
 *
 * HTTP status:
 *   - 200: semua check OK
 *   - 503: salah satu check ERROR (PocketBase unreachable) — anggap DOWN
 *
 * Endpoint ini TIDAK memerlukan auth (akan di-skip oleh middleware karena
 * matcher "/api/:path*" — middleware hanya rate-limit, tidak block).
 * Bisa di-bypass dengan allowlist IP jika ingin dilindungi.
 *
 * NOTE: Hindari logging detail env (jangan print GMAIL_PASSWORD dsb.) —
 * logger bisa di-aggregate ke Sentry dan bocor ke third-party.
 */

export const dynamic = "force-dynamic"; // selalu hit, jangan cache
export const runtime = "nodejs";        // butuh Node.js untuk fetch ke PB

interface HealthResponse {
  status: "ok" | "degraded";
  timestamp: string;
  uptime: number;
  version: string;
  checks: {
    server: "ok";
    pocketbase: "ok" | "error" | "skipped";
    env: "ok" | "warning";
  };
  latency: {
    pocketbase: number | null;
  };
}

export async function GET(): Promise<NextResponse<HealthResponse>> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  // ── 1. Server self-check (selalu OK jika kode ini berjalan) ──────────────
  const checks = {
    server: "ok" as const,
    pocketbase: "skipped" as "ok" | "error" | "skipped",
    env: "ok" as "ok" | "warning",
  };

  // ── 2. Env validation: pastikan env kritikal ter-set ─────────────────────
  // Server-side env (lihat lib/env.ts). Cek ini tanpa throw — kalau kosong,
  // tandai "warning" tapi jangan fail health check (server masih bisa serve UI).
  const criticalServerEnv = [
    "PB_SERVICE_EMAIL",     // untuk admin change-password
    "GMAIL_USER",           // untuk kirim reminder email
    "CRON_SECRET",          // untuk proteksi endpoint cron
  ];
  const missingCritical = criticalServerEnv.filter(
    (k) => !process.env[k] || process.env[k]?.trim() === "",
  );
  if (missingCritical.length > 0) {
    checks.env = "warning";
  }

  // ── 3. PocketBase connectivity check ─────────────────────────────────────
  let pbLatency: number | null = null;
  const pbUrl = process.env.NEXT_PUBLIC_PB_URL;
  if (pbUrl && pbUrl.trim() !== "") {
    const pbStart = Date.now();
    try {
      const pb = new PocketBase(pbUrl);
      // health.check() mengembalikan 200 OK jika PB hidup (tanpa perlu auth)
      await pb.health.check();
      checks.pocketbase = "ok";
      pbLatency = Date.now() - pbStart;
    } catch (err) {
      checks.pocketbase = "error";
      // Log ke console (Sentry tangkap via instrumentation.ts). JANGAN
      // include error message di response karena bisa bocor info PB URL.
      console.error("[health] PocketBase unreachable:", err instanceof Error ? err.message : err);
    }
  } else {
    checks.pocketbase = "skipped";
  }

  // ── 4. Tentukan status akhir ─────────────────────────────────────────────
  const status: "ok" | "degraded" = checks.pocketbase === "error" ? "degraded" : "ok";
  const httpStatus = status === "ok" ? 200 : 503;

  const body: HealthResponse = {
    status,
    timestamp,
    uptime: Math.round(process.uptime()),
    version: process.env.npm_package_version ?? "0.0.0",
    checks,
    latency: { pocketbase: pbLatency },
  };

  // Avoid Sentry grouping on /api/health — set header khusus.
  const res = NextResponse.json(body, { status: httpStatus });
  res.headers.set("Cache-Control", "no-store, max-age=0");
  res.headers.set("X-Health-Total-Ms", String(Date.now() - startTime));
  return res;
}
