import { NextRequest, NextResponse } from "next/server";
import {
  POLICIES,
  classify,
  clientKey,
  memoryStore,
  type PolicyName,
} from "@/lib/rate-limit";

/**
 * Next.js Middleware. 
 * Berjalan di runtime Edge/Node.js untuk menerapkan sliding-window rate limit 
 * ke setiap request /api/* berdasarkan IP pengguna.
 *
 * Header yang ditambahkan ke setiap response:
 *   - X-RateLimit-Limit
 *   - X-RateLimit-Remaining
 *   - X-RateLimit-Reset        (unix seconds)
 *   - X-RateLimit-Policy       (notify|admin|credentials|sendReminders|...)
 */

export const config = {
  // Hanya jalankan middleware ini untuk rute API. 
  // Aset statis dan halaman UI akan dilewati untuk menghemat resource server.
  matcher: ["/api/:path*"],
};

function withRateLimitHeaders(res: NextResponse, opts: {
  policy: PolicyName;
  limit: number;
  remaining: number;
  resetAt: number;
}): NextResponse {
  res.headers.set("X-RateLimit-Limit", String(opts.limit));
  res.headers.set("X-RateLimit-Remaining", String(Math.max(0, opts.remaining)));
  res.headers.set("X-RateLimit-Reset", String(Math.floor(opts.resetAt / 1000)));
  res.headers.set("X-RateLimit-Policy", opts.policy);
  return res;
}

// PERBAIKAN: Nama fungsi WAJIB "middleware"
export function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Lapis pertahanan ekstra: pastikan hanya memproses /api/
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const policy = classify(pathname);
  const limitPolicy = POLICIES[policy];
  const ip = clientKey(req);
  const bucketKey = `${policy}:${ip}`;

  const result = memoryStore.hit(bucketKey, limitPolicy);

  if (!result.ok) {
    const body = JSON.stringify({
      error: "Terlalu banyak permintaan (Too Many Requests)",
      policy,
      retryAfter: result.retryAfter,
    });
    const res = new NextResponse(body, {
      status: 429,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Retry-After": String(result.retryAfter),
      },
    });
    return withRateLimitHeaders(res, {
      policy,
      limit: result.limit,
      remaining: result.remaining,
      resetAt: result.resetAt,
    });
  }

  const res = NextResponse.next();
  return withRateLimitHeaders(res, {
    policy,
    limit: result.limit,
    remaining: result.remaining,
    resetAt: result.resetAt,
  });
}