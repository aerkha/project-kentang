/**
 * cashflow-auto.ts
 *
 * Helper untuk mencatat entri cash flow (koleksi "pengeluarans") secara otomatis
 * tanpa melalui React context — aman dipanggil dari context lain.
 *
 * Tag catatan yang digunakan (bisa difilter / dicari di UI):
 *   [Modal-Investor:INV-XXXX]                  → modal investor masuk (debet)
 *   [Modal-PKS:INV-XXXX:MOU-XXXXXX]           → modal digunakan untuk PKS aktif (kredit)
 *   [Modal-Kembali:INV-XXXX:MOU-XXXXXX]       → modal dikembalikan saat PKS expired (debet)
 */

import pb from "./pocketbase";
import { todayWibStr } from "./utils";

const currentUserId = () => (pb.authStore.record?.id as string | undefined) ?? "";

function pbEsc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ── ID generator (sama pola dengan pengeluaran-context) ─────────────────────

async function generatePglId(date: string): Promise<string> {
  const ym     = date.slice(0, 7).replace("-", "");
  const prefix = `PGL-${ym}-`;
  try {
    const res = await pb.collection("pengeluarans").getFullList({
      filter: `customId ~ "${prefix}"`,
      fields: "customId",
    });
    const max = res.reduce((m, r) => {
      const n = parseInt((r.customId as string).slice(prefix.length)) || 0;
      return n > m ? n : m;
    }, 0);
    return `${prefix}${String(max + 1).padStart(3, "0")}`;
  } catch {
    return `${prefix}001`;
  }
}

function isCustomIdConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const data = (err as { data?: { data?: { customId?: { code?: string } } } }).data;
  return data?.data?.customId?.code === "validation_not_unique";
}

/**
 * Buat entri cash flow.
 * customId race condition: jika pengeluaran-context.tsx dan cashflow-auto.ts
 * sama-sama generate ID pada saat bersamaan, keduanya mungkin menghasilkan ID yang sama.
 * Ini ditangani oleh retry loop + unique constraint `customId` di PocketBase.
 * Pastikan koleksi `pengeluarans` memiliki unique rule pada field `customId`.
 */
async function createCashflowEntry(opts: {
  date:      string;
  deskripsi: string;
  debet:     number;
  kredit:    number;
  catatan:   string;
}): Promise<void> {
  // Normalisasi ke "YYYY-MM-DD" — PocketBase kadang mengembalikan datetime
  // "YYYY-MM-DD HH:mm:ss.000Z" yang ditolak oleh field date tipe "date".
  const dateStr = opts.date.slice(0, 10);
  let customId = await generatePglId(dateStr);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await pb.collection("pengeluarans").create({
        customId,
        createdBy: currentUserId(),
        updatedBy: currentUserId(),
        date:      dateStr,
        deskripsi: opts.deskripsi,
        debet:     opts.debet,
        kredit:    opts.kredit,
        catatan:   opts.catatan,
      });
      return;
    } catch (err) {
      if (isCustomIdConflict(err) && attempt < 4) {
        // ID konflik dengan insert concurrent dari pengeluaran-context — generate ulang
        customId = await generatePglId(dateStr);
        continue;
      }
      throw err;
    }
  }
}

/**
 * Cek apakah entri dengan tag tertentu sudah ada (mencegah duplikasi).
 * Rethrow error selain 404 agar caller bisa log/skip dengan sadar.
 */
async function cashflowTagExists(tag: string): Promise<boolean> {
  try {
    const res = await pb.collection("pengeluarans").getList(1, 1, {
      filter: `catatan ~ "${pbEsc(tag)}"`,
      fields: "id",
    });
    return res.totalItems > 0;
  } catch (err) {
    // Jika PB mengembalikan 404 (koleksi belum ada), anggap belum ada entri
    const status = (err as { status?: number }).status;
    if (status === 404) return false;
    // Error lain (network, auth) — lempar agar caller bisa log
    throw err;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Catat modal investor masuk sebagai **pemasukan (debet)**.
 * Dipanggil dari `addInvestor` saat investor baru ditambahkan.
 *
 * @param investorId       customId investor, mis. "INV-0003"
 * @param investorName     nama investor
 * @param investmentAmount jumlah modal
 * @param date             tanggal (YYYY-MM-DD), default hari ini
 */
export async function recordModalInvestorMasuk(
  investorId:       string,
  investorName:     string,
  investmentAmount: number,
  date?:            string,
): Promise<void> {
  const tag     = `[Modal-Investor:${investorId}]`;
  const today   = date ?? todayWibStr();

  // Jangan duplikasi jika sudah pernah dicatat
  if (await cashflowTagExists(tag)) return;

  await createCashflowEntry({
    date:      today,
    deskripsi: `Modal Investor — ${investorName} (${investorId})`,
    debet:     investmentAmount,
    kredit:    0,
    catatan:   tag,
  });
}

/**
 * Perbarui entri modal investor masuk agar tetap sinkron saat
 * nama atau nilai investasi investor diubah. No-op jika entri tidak ada.
 */
export async function updateModalInvestorMasuk(
  investorId:       string,
  investorName:     string,
  investmentAmount: number,
): Promise<void> {
  const tag = `[Modal-Investor:${investorId}]`;
  try {
    const res = await pb.collection("pengeluarans").getList(1, 1, {
      filter: `catatan ~ "${pbEsc(tag)}"`,
      fields: "id,debet,deskripsi",
    });
    if (res.totalItems === 0) return;
    const rec       = res.items[0];
    const deskripsi = `Modal Investor — ${investorName} (${investorId})`;
    if (rec.debet === investmentAmount && rec.deskripsi === deskripsi) return;
    await pb.collection("pengeluarans").update(rec.id, {
      deskripsi,
      debet:     investmentAmount,
      updatedBy: currentUserId(),
    });
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return;
    throw err;
  }
}

/**
 * Hapus entri modal investor masuk — dipanggil saat investor dihapus
 * agar arus kas tidak menyimpan pemasukan dari investor yang sudah tidak ada.
 */
export async function removeModalInvestorMasuk(investorId: string): Promise<void> {
  const tag = `[Modal-Investor:${investorId}]`;
  try {
    const res = await pb.collection("pengeluarans").getFullList({
      filter: `catatan ~ "${pbEsc(tag)}"`,
      fields: "id",
    });
    await Promise.all(res.map((r) => pb.collection("pengeluarans").delete(r.id)));
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return;
    throw err;
  }
}

/**
 * Catat modal digunakan untuk PKS aktif sebagai **pengeluaran (kredit)**.
 * Dipanggil saat PKS pertama kali menjadi aktif (addMou backdate, atau uploadSignedDoc).
 *
 * @param investorId       customId investor
 * @param investorName     nama investor
 * @param mouId            customId MoU, mis. "MOU-202505-001"
 * @param investmentAmount jumlah modal yang digunakan di PKS ini
 * @param date             tanggal PKS (YYYY-MM-DD)
 */
/**
 * Catat modal dikembalikan sebagai **pemasukan (debet)**.
 * Dipanggil saat PKS dinonaktifkan (isTerminated = true) secara manual.
 *
 * @param investorId       customId investor
 * @param investorName     nama investor
 * @param mouId            customId MoU
 * @param investmentAmount jumlah modal yang dikembalikan
 * @param date             tanggal pencatatan (YYYY-MM-DD), default hari ini
 */
export async function recordModalPksDiKembalikan(
  investorId:       string,
  investorName:     string,
  mouId:            string,
  investmentAmount: number,
  date?:            string,
): Promise<void> {
  const tag   = `[Modal-Kembali:${investorId}:${mouId}]`;
  const today = date ?? todayWibStr();

  // Hanya catat pengembalian jika modal PKS ini pernah dicatat digunakan.
  // PKS pending yang expired tanpa pernah aktif tidak boleh menghasilkan pemasukan.
  const usedTag = `[Modal-PKS:${investorId}:${mouId}]`;
  if (!(await cashflowTagExists(usedTag))) return;

  if (await cashflowTagExists(tag)) return;

  await createCashflowEntry({
    date:      today,
    deskripsi: `Modal Dikembalikan — ${mouId} (${investorName})`,
    debet:     investmentAmount,
    kredit:    0,
    catatan:   tag,
  });
}

/**
 * Hapus entri modal dikembalikan untuk satu PKS — dipanggil saat PKS yang
 * di-nonaktifkan manual diaktifkan kembali (modal dipakai lagi), agar arus kas
 * tidak menyimpan pengembalian yang sudah tidak berlaku.
 */
export async function removeModalPksDigunakan(
  investorId: string,
  mouId:      string,
): Promise<void> {
  const tag = `[Modal-PKS:${investorId}:${mouId}]`;
  try {
    const res = await pb.collection("pengeluarans").getFullList({
      filter: `catatan ~ "${pbEsc(tag)}"`,
      fields: "id",
    });
    await Promise.all(res.map((r) => pb.collection("pengeluarans").delete(r.id)));
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return;
    throw err;
  }
}

export async function removeModalPksDiKembalikan(
  investorId: string,
  mouId:      string,
): Promise<void> {
  const tag = `[Modal-Kembali:${investorId}:${mouId}]`;
  try {
    const res = await pb.collection("pengeluarans").getFullList({
      filter: `catatan ~ "${pbEsc(tag)}"`,
      fields: "id",
    });
    await Promise.all(res.map((r) => pb.collection("pengeluarans").delete(r.id)));
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return;
    throw err;
  }
}

export async function recordModalPksDigunakan(
  investorId:       string,
  investorName:     string,
  mouId:            string,
  investmentAmount: number,
  date:             string,
): Promise<void> {
  const tag = `[Modal-PKS:${investorId}:${mouId}]`;

  // Jangan duplikasi jika sudah pernah dicatat
  if (await cashflowTagExists(tag)) return;

  await createCashflowEntry({
    date,
    deskripsi: `Modal Digunakan — ${mouId} (${investorName})`,
    debet:     0,
    kredit:    investmentAmount,
    catatan:   tag,
  });
}
