import { NextRequest, NextResponse } from "next/server";
import {
  POLICIES,
  classify,
  clientKey,
  memoryStore,
  type PolicyName,
} from "@/lib/rate-limit";

/**
 * Next.js 16 "proxy" file (formerly `middleware.ts`). Runs on the Node.js
 * runtime and applies a per-IP sliding-window rate limit to every
 * /api/* request, with policy buckets defined in lib/rate-limit.ts.
 *
 * Headers added to every response (limited or allowed):
 *   - X-RateLimit-Limit
 *   - X-RateLimit-Remaining
 *   - X-RateLimit-Reset        (unix seconds)
 *   - X-RateLimit-Policy       (notify|admin|credentials|sendReminders|...)
 *
 * On rejection: 429 Too Many Requests with `Retry-After` (seconds) and a
 * small JSON body.
 *
 * Notes:
 *  - The bucket key is `<policy>:<clientKey>` so the same IP cannot exhaust
 *    one policy and be denied in another.
 *  - For Vercel: this proxy runs per-region, so this is best-effort global
 *    limiting. Swap to Upstash if you need strict cross-region accuracy
 *    (see lib/rate-limit.ts bottom).
 *  - We intentionally do NOT skip non-mutating methods, because notify/*
 *    etc. are POST and we want a uniform layer; GET routes are cheap to
 *    count anyway.
 *
 * Migration note (from `middleware.ts` to `proxy.ts`):
 *   - File renamed: middleware.ts -> proxy.ts
 *   - Exported function renamed: middleware -> proxy
 *   - Same `config = { matcher }` syntax
 *   - See: https://nextjs.org/docs/messages/middleware-to-proxy
 */

export const config = {
  // Run only for /api/*. Static assets and pages are excluded because
  // Next.js applies the matcher before invoking the function.
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

export function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;

  // Belt-and-braces: matcher already restricts this, but be defensive.
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
      error: "Too Many Requests",
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
