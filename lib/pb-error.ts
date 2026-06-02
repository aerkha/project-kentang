/**
 * Utility untuk mem-parse error dari PocketBase SDK
 * dan menghasilkan format yang konsisten untuk ditampilkan di UI.
 */

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
