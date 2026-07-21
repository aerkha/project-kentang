/**
 * Environment variable validation with Zod.
 *
 * Two separate schemas:
 *   - clientEnv: vars exposed to the browser (NEXT_PUBLIC_*). Parsed lenient,
 *     never throws. The PB SDK runs in the browser so NEXT_PUBLIC_PB_URL is
 *     here.
 *   - serverEnv: server-only secrets. Parsed eagerly at startup and throws
 *     with a helpful message if anything is missing or malformed. Loaded by
 *     `instrumentation.ts` so misconfiguration fails the boot, not the first
 *     request.
 *
 * All individual getters (`getEnv(...)`) are safe to call from API routes —
 * they reuse the validated value if available, and re-validate otherwise.
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
    .optional(),
});

export type ClientEnv = z.infer<typeof clientSchema>;

// ── Server (secrets + service config) ────────────────────────────────────────
//
// Each field is documented with who uses it. We keep the schema permissive
// enough that optional integrations (email, WhatsApp) can be disabled by
// leaving the env empty; required integrations (PocketBase, cron) must be
// present for the app to function.

const optionalUrl = z
  .string()
  .trim()
  .url()
  .optional()
  .or(z.literal("").transform(() => undefined));

const nonEmpty = (msg: string) => z.string().trim().min(1, msg);

const serverSchema = z.object({
  // PocketBase
  NEXT_PUBLIC_PB_URL: nonEmpty("NEXT_PUBLIC_PB_URL is required"),
  PB_SERVICE_EMAIL: nonEmpty(
    "PB_SERVICE_EMAIL is required (used by /api/admin/change-password)",
  ),
  PB_SERVICE_PASSWORD: nonEmpty(
    "PB_SERVICE_PASSWORD is required (used by /api/admin/change-password)",
  ),

  // Email (nodemailer / Gmail) — optional but recommended
  GMAIL_USER: z
    .string()
    .trim()
    .email("GMAIL_USER must be a valid email")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  GMAIL_APP_PASSWORD: z
    .string()
    .trim()
    .min(1)
    .optional()
    .or(z.literal("").transform(() => undefined)),

  // WhatsApp (Fonnte) — optional
  FONNTE_TOKEN: z
    .string()
    .trim()
    .min(1)
    .optional()
    .or(z.literal("").transform(() => undefined)),

  // Owner notifications — optional
  OWNER_EMAIL: z
    .string()
    .trim()
    .email()
    .optional()
    .or(z.literal("").transform(() => undefined)),
  OWNER_PHONE: z
    .string()
    .trim()
    .min(1)
    .optional()
    .or(z.literal("").transform(() => undefined)),

  // Cron / Vercel
  CRON_SECRET: nonEmpty(
    "CRON_SECRET is required (used to authenticate the daily /api/send-reminders cron)",
  ),
  ADMIN_TEST_TOKEN: z
    .string()
    .trim()
    .min(1)
    .optional()
    .or(z.literal("").transform(() => undefined)),

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
 * Parse and validate server-only env vars. Throws with a clear, multi-line
 * error if anything is missing or malformed. Call once at startup.
 */
export function loadServerEnv(): ServerEnv {
  if (cachedServer) return cachedServer;
  const result = serverSchema.safeParse(process.env);
  if (!result.success) {
    const msg = formatZodError("server", result.error);
    // Print first, then throw. We deliberately include the full Zod issues so
    // the operator can fix all problems in one pass.
    console.error(`[env] ${msg}`);
    throw new Error(msg);
  }
  cachedServer = result.data;
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
