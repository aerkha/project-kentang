/**
 * Normalisasi URL PocketBase dari environment variable.
 *
 * Masalah yang sering muncul: operator menyalin URL dari address-bar
 * UI admin yang mengandung suffix path (mis. `/_/`, `/api`). PocketBase
 * SDK akan request ke `<url>/api/...` sehingga path itu menyebabkan
 * 404 ("The requested resource wasn't found").
 *
 * Helper ini:
 *  - trim whitespace
 *  - strip suffix path apapun setelah host:port (termasuk `/_/`,
 *    `/api`, trailing slash, atau kombinasi)
 *  - validasi minimal: harus berupa http(s) URL
 *
 * Dipakai terpusat oleh `lib/pocketbase.ts` dan semua route API. Tidak
 * punya dependency ke instance PocketBase sehingga aman untuk di-import
 * dari route handler yang meng-mock `pocketbase` (tidak akan trigger
 * module-side-effects dari `lib/pocketbase.ts` yang menjalankan
 * `pb.autoCancellation(false)` saat load).
 */
export function getPbBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_PB_URL || "").trim();

  // Default dev saat env belum diset.
  const fallback = "http://127.0.0.1:8090";
  const candidate = raw || fallback;

  // Ambil hanya "<scheme>://<host>[:<port>]". Buang apapun setelah "/".
  let normalized: string;
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error(`protocol "${u.protocol}" tidak didukung`);
    }
    normalized = u.origin; // <= url.origin selalu host:port tanpa path
  } catch (err) {
    const msg =
      err instanceof Error ? err.message : "tidak dapat di-parse";
    throw new Error(
      `NEXT_PUBLIC_PB_URL tidak valid: "${raw || "(kosong)"}" (${msg}). ` +
        `Harus berupa URL lengkap, mis. http://127.0.0.1:8090 atau https://pb.example.com`,
    );
  }

  // Pastikan tidak ada path terselip (URL.origin harusnya sudah strip,
  // tapi ekstra safety untuk edge case seperti "//host/" yang origin-nya
  // bisa ber-IP aneh).
  return normalized.replace(/\/+$/, "");
}
