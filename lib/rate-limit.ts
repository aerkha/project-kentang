/**
 * In-memory sliding-window rate limiter for Next.js middleware (edge runtime).
 *
 * IMPORTANT (Vercel deployments):
 *   On Vercel, middleware runs in the edge region closest to the user, so the
 *   Map below is NOT shared across regions. This is acceptable as a coarse
 *   anti-spam / anti-abuse layer. For strict global limits, swap the
 *   `RateLimitStore` interface for Upstash Redis (see comment at the bottom).
 *
 * Single-instance self-host: works exactly as a normal in-memory limiter.
 *
 * Algorithm: sliding window with a coarse bucket per (key, windowSeconds).
 * We keep an array of timestamps for each key and count those within the
 * active window on every check. Cheap and accurate enough for ≤ a few
 * thousand active keys.
 */

export interface RateLimitResult {
  /** Whether the request is allowed. */
  ok: boolean;
  /** Limit configured for this policy. */
  limit: number;
  /** Remaining requests in the current window. */
  remaining: number;
  /** Unix-ms timestamp when the window resets (oldest hit + window). */
  resetAt: number;
  /** Seconds the caller should wait before retrying. */
  retryAfter: number;
}

export interface RateLimitPolicy {
  /** Max requests allowed in the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitStore {
  hit(key: string, policy: RateLimitPolicy): RateLimitResult;
}

// ── In-memory implementation ──────────────────────────────────────────────────

interface Bucket {
  /** Sorted ascending timestamps (ms) inside the active window. */
  hits: number[];
}

const BUCKETS = new Map<string, Bucket>();
const MAX_BUCKETS = 50_000; // cap memory usage

function gc(now: number, windowMs: number) {
  // Cheap GC: when we exceed MAX_BUCKETS, drop the oldest 25%.
  if (BUCKETS.size <= MAX_BUCKETS) return;
  const toDelete = Math.floor(MAX_BUCKETS * 0.25);
  let removed = 0;
  for (const key of BUCKETS.keys()) {
    const b = BUCKETS.get(key);
    if (!b || b.hits.length === 0 || now - b.hits[b.hits.length - 1] > windowMs) {
      BUCKETS.delete(key);
      if (++removed >= toDelete) break;
    }
  }
}

export const memoryStore: RateLimitStore = {
  hit(key, policy) {
    const now = Date.now();
    const windowMs = policy.windowSeconds * 1000;
    const cutoff = now - windowMs;

    let bucket = BUCKETS.get(key);
    if (!bucket) {
      bucket = { hits: [] };
      BUCKETS.set(key, bucket);
    }

    // Drop hits outside the window. hits is sorted ascending, so we can
    // binary-search for the first index >= cutoff.
    let lo = 0;
    let hi = bucket.hits.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (bucket.hits[mid] < cutoff) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0) bucket.hits.splice(0, lo);

    if (bucket.hits.length >= policy.limit) {
      const oldest = bucket.hits[0];
      const resetAt = oldest + windowMs;
      const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000));
      return { ok: false, limit: policy.limit, remaining: 0, resetAt, retryAfter };
    }

    bucket.hits.push(now);
    gc(now, windowMs);

    const remaining = policy.limit - bucket.hits.length;
    const resetAt = bucket.hits[0] + windowMs;
    return { ok: true, limit: policy.limit, remaining, resetAt, retryAfter: 0 };
  },
};

// ── Policies ──────────────────────────────────────────────────────────────────
//
// Tuned per route group. Tighter limits for expensive/sensitive routes,
// looser limits for routine calls. Adjust via env if needed:
//
//   RL_NOTIFY_LIMIT, RL_NOTIFY_WINDOW
//   RL_ADMIN_LIMIT,  RL_ADMIN_WINDOW
//   RL_CRED_LIMIT,   RL_CRED_WINDOW
//   RL_REMD_LIMIT,   RL_REMD_WINDOW
//   RL_TRIG_LIMIT,   RL_TRIG_WINDOW
//   RL_DEFAULT_LIMIT, RL_DEFAULT_WINDOW

function readPolicy(
  limitEnv: string,
  windowEnv: string,
  fallback: RateLimitPolicy,
): RateLimitPolicy {
  const limit = Number.parseInt(process.env[limitEnv] ?? "", 10);
  const window = Number.parseInt(process.env[windowEnv] ?? "", 10);
  return {
    limit: Number.isFinite(limit) && limit > 0 ? limit : fallback.limit,
    windowSeconds:
      Number.isFinite(window) && window > 0 ? window : fallback.windowSeconds,
  };
}

export const POLICIES = {
  /**
   * Notify-investor / notify-broker / notify-owner — each call sends email/wa
   * and is the most expensive + abuse-prone. Strict per-IP limit.
   */
  notify: readPolicy("RL_NOTIFY_LIMIT", "RL_NOTIFY_WINDOW", {
    limit: 10,
    windowSeconds: 60,
  }),
  /**
   * Admin actions (change-password etc.). Tighter.
   */
  admin: readPolicy("RL_ADMIN_LIMIT", "RL_ADMIN_WINDOW", {
    limit: 5,
    windowSeconds: 60,
  }),
  /**
   * Send-credentials is called per investor creation, can be bursty in
   * bulk-import flows. Looser.
   */
  credentials: readPolicy("RL_CRED_LIMIT", "RL_CRED_WINDOW", {
    limit: 30,
    windowSeconds: 60,
  }),
  /**
   * Cron-driven send-reminders. Very low limit because external callers
   * should never hit this.
   */
  sendReminders: readPolicy("RL_REMD_LIMIT", "RL_REMD_WINDOW", {
    limit: 2,
    windowSeconds: 60,
  }),
  /**
   * trigger-reminder — manual button click. Low limit per user/IP.
   */
  triggerReminder: readPolicy("RL_TRIG_LIMIT", "RL_TRIG_WINDOW", {
    limit: 5,
    windowSeconds: 60,
  }),
  /** Default fallback for any /api/* route we forget to classify. */
  default: readPolicy("RL_DEFAULT_LIMIT", "RL_DEFAULT_WINDOW", {
    limit: 30,
    windowSeconds: 60,
  }),
} as const;

export type PolicyName = keyof typeof POLICIES;

export function classify(pathname: string): PolicyName {
  if (pathname.startsWith("/api/notify-")) return "notify";
  if (pathname.startsWith("/api/admin/")) return "admin";
  if (pathname.startsWith("/api/send-credentials")) return "credentials";
  if (pathname.startsWith("/api/send-reminders")) return "sendReminders";
  if (pathname.startsWith("/api/trigger-reminder")) return "triggerReminder";
  return "default";
}

// ── Client key extraction ─────────────────────────────────────────────────────

/**
 * Extracts the best identifier we have for a request, in order:
 *   1. Authenticated user id (from PB token) — best, since it survives
 *      NAT/CGNAT and identifies the real actor.
 *   2. x-forwarded-for (first hop).
 *   3. x-real-ip.
 *   4. cf-connecting-ip (Cloudflare).
 *   5. req.ip (Vercel/Next exposes this).
 *   6. "unknown" — last-resort bucket shared by all unidentified callers.
 *
 * NOTE: parsing the PB token here is intentionally NOT done; it would
 * require JWT/JOSE which isn't in deps. The token-based bucketing is left
 * to the route handlers' own auth check; the middleware layers a
 * per-IP/per-header cap on top of that.
 */
export function clientKey(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;
  return "unknown";
}

// ── Upstash swap (commented for future use) ──────────────────────────────────
//
// To switch to a globally-consistent store (Vercel multi-region), install
// @upstash/ratelimit + @upstash/redis, then add:
//
//   import { Ratelimit } from "@upstash/ratelimit";
//   import { Redis } from "@upstash/redis";
//
//   export const upstashStore: RateLimitStore = {
//     hit(key, policy) {
//       // build the limiter per-policy (cache them outside this fn) and
//       // translate the .limit/.success/.remaining/.reset result back to
//       // RateLimitResult. Use slidingWindow(policy.windowSeconds, "s").
//     },
//   };
//
// Then in middleware.ts, pick the store based on env:
//   const store = process.env.UPSTASH_REDIS_REST_URL ? upstashStore : memoryStore;
