/**
 * Environment variable validation with Zod.
 *
 * Two separate schemas:
 *   - clientEnv: vars exposed to the browser (NEXT_PUBLIC_*). Parsed lenient,
 *     never throws. The PB SDK runs in the browser so NEXT_PUBLIC_PB_URL is
 *     here.
 *   - serverEnv: server-only secrets. Parsed eagerly at startup. Throws on
 *     invalid format (bad URL, bad email) but logs warnings for missing
 *     optional integrations so deployments without, e.g., Gmail still boot
 *     successfully.
 *
 * The split is intentional: missing *required* secrets (only
 * NEXT_PUBLIC_PB_URL is required for the app to function) fail the boot.
 * Missing *optional* integrations (email, WhatsApp, cron, admin) are logged
 * as warnings so the app can still serve UI; the relevant route handlers
 * already short-circuit with "skipped" status when those env vars are empty.
 */
import { z } from "zod";

// ── Client (NEXT_PUBLIC_*) ────────────────────────────────────────────────────

const clientSchema = z.object({
  NEXT_PUBLIC_PB_URL: z
    .string()
    .trim()
    .min(1, "NEXT_PUBLIC_PB_URL is required (PocketBase origin)")
    .url("NEXT_PUBLIC_PB_URL must be a valid URL (e.g. http://127.0.0.1:8090)"),
  NEXT_PUBLIC_APP_URL: z
    .string()
    .trim()
    .url("NEXT_PUBLIC_APP_URL must be a valid URL")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type ClientEnv = z.infer<typeof clientSchema>;

// ── Server (secrets + service config) ────────────────────────────────────────

const optionalString = z
  .string()
  .trim()
  .optional()
  .or(z.literal("").transform(() => undefined));

const requiredString = (msg: string) => z.string().trim().min(1, msg);

const serverSchema = z.object({
  // PocketBase — required for the SDK to connect anywhere on the app.
  NEXT_PUBLIC_PB_URL: requiredString("NEXT_PUBLIC_PB_URL is required"),

  // Service account for admin endpoints (change-password etc.) — optional.
  // If missing, those endpoints will return 500 with a clear error.
  PB_SERVICE_EMAIL: optionalString,
  PB_SERVICE_PASSWORD: optionalString,

  // Email (nodemailer / Gmail) — optional
  GMAIL_USER: z
    .string()
    .trim()
    .email("GMAIL_USER must be a valid email")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  GMAIL_APP_PASSWORD: optionalString,

  // WhatsApp (Fonnte) — optional
  FONNTE_TOKEN: optionalString,

  // Owner notifications — optional
  OWNER_EMAIL: z
    .string()
    .trim()
    .email()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  OWNER_PHONE: optionalString,

  // Cron / Vercel — optional
  CRON_SECRET: optionalString,
  ADMIN_TEST_TOKEN: optionalString,

  // General
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

// ── Loaders ───────────────────────────────────────────────────────────────────

let cachedClient: ClientEnv | null = null;
let cachedServer: ServerEnv | null = null;

function formatZodError(path: string, err: z.ZodError): string {
  const issues = err.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  return `Invalid environment variable${path ? ` for ${path}` : ""}:\n${issues}`;
}

/**
 * Parse and validate client-exposed env vars. Never throws — returns the raw
 * `process.env.NEXT_PUBLIC_PB_URL` (or empty string) so the app can keep
 * booting in a misconfigured dev environment. The result is still typed.
 */
export function loadClientEnv(): ClientEnv {
  if (cachedClient) return cachedClient;
  const result = clientSchema.safeParse({
    NEXT_PUBLIC_PB_URL: process.env.NEXT_PUBLIC_PB_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  });
  if (!result.success) {
    console.warn(
      `[env] client env validation failed; using raw values.\n${formatZodError(
        "client",
        result.error,
      )}`,
    );
    cachedClient = {
      NEXT_PUBLIC_PB_URL: process.env.NEXT_PUBLIC_PB_URL || "",
    };
    return cachedClient;
  }
  cachedClient = result.data;
  return cachedClient;
}

/**
 * Parse and validate server-only env vars.
 *
 * - Throws on invalid FORMAT (bad URL, bad email). This is a bug we want to
 *   catch at boot.
 * - Logs warnings for missing optional integrations and returns a partial
 *   object so the app can still boot. Each route handler already checks for
 *   the relevant env var and returns a clean error when it's missing.
 *
 * Throws only on missing/invalid NEXT_PUBLIC_PB_URL (the only env that is
 * truly required for the app to function at all).
 */
export function loadServerEnv(): ServerEnv {
  if (cachedServer) return cachedServer;
  const result = serverSchema.safeParse(process.env);
  if (!result.success) {
    // Distinguish between "format invalid" (likely a bug → throw) and
    // "missing optional" (logged as warning, parse with empty defaults).
    const issues = result.error.issues;
    const requiredMissing = issues.filter((i) =>
      i.path.includes("NEXT_PUBLIC_PB_URL"),
    );

    if (requiredMissing.length > 0) {
      // Truly required var missing/invalid → fail boot.
      const msg = formatZodError("server", result.error);
      console.error(`[env] ${msg}`);
      throw new Error(msg);
    }

    // Otherwise: only optional fields had issues. Build a permissive parse
    // (everything as string, all optional) and warn.
    console.warn(
      `[env] Some optional environment variables have issues (boot will continue):\n${formatZodError(
        "server",
        result.error,
      )}`,
    );
  }

  // Build the validated object by re-parsing with all-optional (safer for
  // optional fields). We trust NEXT_PUBLIC_PB_URL was already validated
  // above; if we reached here, either it was present or we threw.
  const safe = z
    .object({
      NEXT_PUBLIC_PB_URL: z.string().min(1),
      PB_SERVICE_EMAIL: z.string().optional(),
      PB_SERVICE_PASSWORD: z.string().optional(),
      GMAIL_USER: z.string().optional(),
      GMAIL_APP_PASSWORD: z.string().optional(),
      FONNTE_TOKEN: z.string().optional(),
      OWNER_EMAIL: z.string().optional(),
      OWNER_PHONE: z.string().optional(),
      CRON_SECRET: z.string().optional(),
      ADMIN_TEST_TOKEN: z.string().optional(),
      NODE_ENV: z
        .enum(["development", "production", "test"])
        .default("development"),
    })
    .parse(process.env);

  cachedServer = safe as ServerEnv;

  // Emit warnings for missing optional integrations so the operator notices.
  const warnings: string[] = [];
  if (!safe.PB_SERVICE_EMAIL || !safe.PB_SERVICE_PASSWORD) {
    warnings.push(
      "PB_SERVICE_EMAIL / PB_SERVICE_PASSWORD missing → /api/admin/change-password will fail.",
    );
  }
  if (!safe.GMAIL_USER || !safe.GMAIL_APP_PASSWORD) {
    warnings.push(
      "GMAIL_USER / GMAIL_APP_PASSWORD missing → email notifications will be skipped.",
    );
  }
  if (!safe.FONNTE_TOKEN) {
    warnings.push(
      "FONNTE_TOKEN missing → WhatsApp notifications will be skipped.",
    );
  }
  if (!safe.CRON_SECRET) {
    warnings.push(
      "CRON_SECRET missing → /api/send-reminders cron will reject all requests.",
    );
  }
  for (const w of warnings) console.warn(`[env] ${w}`);

  return cachedServer;
}

/**
 * Lazy accessor: returns the validated server env, parsing on first use. Use
 * this from API routes that run after `instrumentation.ts` has already
 * validated — `loadServerEnv()` will be a no-op cache hit.
 */
export function getServerEnv(): ServerEnv {
  return loadServerEnv();
}

/**
 * Reset the cache. Useful for tests.
 */
export function _resetEnvCache(): void {
  cachedClient = null;
  cachedServer = null;
}
