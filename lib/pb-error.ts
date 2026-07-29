/**
 * Utility untuk mem-parse error dari PocketBase SDK
 * dan menghasilkan format yang konsisten untuk ditampilkan di UI.
 */

/**
 * m-23: Validasi Origin / Referer untuk semua POST API route.
 * Cegah request dari cross-origin tanpa consent. Izinkan jika:
 * - Header Origin / Referer cocok dengan host request
 * - Atau tidak ada Origin/Referer (cURL, server-to-server, VPS cron)
 *   — tapi tetap tolak jika env mismatch (konfigurasi deployment).
 */
export function isSameOriginRequest(req: Request): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const source = origin || referer;
  if (!source) return true; // server-side atau CLI request — izinkan

  try {
    const sourceUrl = new URL(source);
    // Ambil host dari request URL sebagai acuan.
    // Next otomatis mengisi host header; reverse-proxy Nginx/Cloudflare
    // akan meneruskan host asli melalui x-forwarded-host.
    const host = req.headers.get("host") || req.headers.get("x-forwarded-host");
    if (!host) return true;
    return sourceUrl.host === host;
  } catch {
    return false;
  }
}

export interface PbFieldError {
  field: string;
  code: string;
  message: string;
}

export interface PbErrorInfo {
  /** Pesan utama error */
  title: string;
  /** Detail per-field jika ada validasi error */
  fields: PbFieldError[];
  /** Raw error string untuk logging */
  raw: string;
}

export function formatPbError(err: unknown, fallbackTitle = "Terjadi kesalahan"): PbErrorInfo {
  // Log ke konsol dengan detail lengkap
  console.error("[PocketBase Error]", err);

  if (!err || typeof err !== "object") {
    const raw = String(err);
    return { title: raw || fallbackTitle, fields: [], raw };
  }

  const e = err as Record<string, unknown>;
  const status  = e.status  as number | undefined;
  const message = e.message as string | undefined;
  const data    = e.data    as Record<string, unknown> | undefined;

  const title = message
    ? `${message}${status ? ` (HTTP ${status})` : ""}`
    : fallbackTitle;

  const fields: PbFieldError[] = [];

  // PocketBase mengembalikan { data: { fieldName: { code, message } } }
  if (data && typeof data === "object") {
    for (const [field, val] of Object.entries(data)) {
      if (val && typeof val === "object") {
        const v = val as Record<string, string>;
        fields.push({
          field,
          code:    v.code    || "unknown",
          message: v.message || "Nilai tidak valid",
        });
      }
    }
  }

  const raw = JSON.stringify(err, null, 2);
  console.error("[PocketBase Error Detail]", raw);

  return { title, fields, raw };
}
