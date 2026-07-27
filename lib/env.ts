/**
 * Environment variable validation with Zod.
 * Disesuaikan untuk environment VPS dan Sentry.
 */
import { z } from "zod";

// ── 1. Client Variables (NEXT_PUBLIC_*) ──────────────────────────────────────
// Variabel ini aman terekspos ke browser (Frontend)

const clientSchema = z.object({
  NEXT_PUBLIC_PB_URL: z
    .string()
    .trim()
    .min(1, "NEXT_PUBLIC_PB_URL wajib diisi (URL PocketBase)")
    .url("NEXT_PUBLIC_PB_URL harus berupa URL valid"),
  
  NEXT_PUBLIC_APP_URL: z
    .string()
    .trim()
    .url("NEXT_PUBLIC_APP_URL harus berupa URL valid")
    .optional()
    .or(z.literal("").transform(() => undefined)),

  // Variabel Sentry yang baru ditambahkan
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
});

export type ClientEnv = z.infer<typeof clientSchema>;

// ── 2. Server Variables (Rahasia Backend) ────────────────────────────────────
// Variabel ini HARAM terekspos ke browser.

const optionalString = z
  .string()
  .trim()
  .optional()
  .or(z.literal("").transform(() => undefined));

const serverSchema = z.object({
  // Kredensial Admin PocketBase
  PB_SERVICE_EMAIL: optionalString,
  PB_SERVICE_PASSWORD: optionalString,

  // Integrasi Email (Nodemailer)
  GMAIL_USER: z
    .string()
    .trim()
    .email("GMAIL_USER harus format email")
    .optional()
    .or(z.literal("").transform(() => undefined)),
  GMAIL_APP_PASSWORD: optionalString,

  // Integrasi WhatsApp & Kontak Admin
  FONNTE_TOKEN: optionalString,
  ADMIN_PHONE: optionalString,
  ADMIN_EMAIL: optionalString,

  // Data Owner
  OWNER_EMAIL: optionalString,
  OWNER_PHONE: optionalString,

  // Keamanan Endpoint Cron
  CRON_SECRET: optionalString,

  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});

export type ServerEnv = z.infer<typeof serverSchema>;

// ── 3. Loaders & Validators ──────────────────────────────────────────────────

let cachedClient: ClientEnv | null = null;
let cachedServer: ServerEnv | null = null;

function formatZodError(path: string, err: z.ZodError): string {
  const issues = err.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
  return `Variabel ${path} tidak valid:\n${issues}`;
}

export function loadClientEnv(): ClientEnv {
  if (cachedClient) return cachedClient;
  
  const result = clientSchema.safeParse({
    NEXT_PUBLIC_PB_URL: process.env.NEXT_PUBLIC_PB_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  });

  if (!result.success) {
    console.warn(`[env] Peringatan Client Env (menggunakan fallback):\n${formatZodError("client", result.error)}`);
    cachedClient = { NEXT_PUBLIC_PB_URL: process.env.NEXT_PUBLIC_PB_URL || "" };
    return cachedClient;
  }
  
  cachedClient = result.data;
  return cachedClient;
}

export function loadServerEnv(): ServerEnv {
  if (cachedServer) return cachedServer;
  
  const result = serverSchema.safeParse(process.env);
  
  if (!result.success) {
    console.warn(`[env] Beberapa variabel server opsional kosong atau bermasalah:\n${formatZodError("server", result.error)}`);
  }

  // Fallback aman untuk parse variabel server
  const safe = z.object({
    PB_SERVICE_EMAIL: z.string().optional(),
    PB_SERVICE_PASSWORD: z.string().optional(),
    GMAIL_USER: z.string().optional(),
    GMAIL_APP_PASSWORD: z.string().optional(),
    FONNTE_TOKEN: z.string().optional(),
    ADMIN_PHONE: z.string().optional(),
    ADMIN_EMAIL: z.string().optional(),
    OWNER_EMAIL: z.string().optional(),
    OWNER_PHONE: z.string().optional(),
    CRON_SECRET: z.string().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  }).parse(process.env);

  cachedServer = safe as ServerEnv;

  // Log peringatan jika ada fitur yang mati karena env kosong
  const warnings: string[] = [];
  if (!safe.GMAIL_USER || !safe.GMAIL_APP_PASSWORD) warnings.push("Email notifikasi dinonaktifkan (GMAIL env kosong).");
  if (!safe.FONNTE_TOKEN) warnings.push("WhatsApp notifikasi dinonaktifkan (FONNTE env kosong).");
  if (!safe.CRON_SECRET) warnings.push("Cron Job tidak terlindungi (CRON_SECRET kosong).");
  
  for (const w of warnings) console.warn(`[env] ⚠️ ${w}`);

  return cachedServer;
}

export function getServerEnv(): ServerEnv {
  return loadServerEnv();
}