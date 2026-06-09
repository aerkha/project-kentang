/**
 * cashflow-auto.ts
 *
 * Helper untuk mencatat entri cash flow (koleksi "pengeluarans") secara otomatis
 * tanpa melalui React context — aman dipanggil dari context lain.
 *
 * Tag catatan yang digunakan (bisa difilter / dicari di UI):
 *   [Modal-Investor:INV-XXXX]          → modal investor masuk (debet)
 *   [Modal-PKS:INV-XXXX:MOU-XXXXXX]   → modal digunakan untuk PKS aktif (kredit)
 */

import pb from "./pocketbase";

const currentUserId = () => (pb.authStore.record?.id as string | undefined) ?? "";

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

async function createCashflowEntry(opts: {
  date:      string;
  deskripsi: string;
  debet:     number;
  kredit:    number;
  catatan:   string;
}): Promise<void> {
  let customId = await generatePglId(opts.date);

  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await pb.collection("pengeluarans").create({
        customId,
        createdBy: currentUserId(),
        updatedBy: currentUserId(),
        date:      opts.date,
        deskripsi: opts.deskripsi,
        debet:     opts.debet,
        kredit:    opts.kredit,
        catatan:   opts.catatan,
      });
      return;
    } catch (err) {
      if (isCustomIdConflict(err) && attempt < 4) {
        customId = await generatePglId(opts.date);
        continue;
      }
      throw err;
    }
  }
}

/** Cek apakah entri dengan tag tertentu sudah ada (mencegah duplikasi). */
async function cashflowTagExists(tag: string): Promise<boolean> {
  try {
    const res = await pb.collection("pengeluarans").getList(1, 1, {
      filter: `catatan ~ "${tag}"`,
      fields: "id",
    });
    return res.totalItems > 0;
  } catch {
    return false;
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
  const today   = date ?? new Date().toISOString().slice(0, 10);

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
 * Catat modal digunakan untuk PKS aktif sebagai **pengeluaran (kredit)**.
 * Dipanggil saat PKS pertama kali menjadi aktif (addMou backdate, atau uploadSignedDoc).
 *
 * @param investorId       customId investor
 * @param investorName     nama investor
 * @param mouId            customId MoU, mis. "MOU-202505-001"
 * @param investmentAmount jumlah modal yang digunakan di PKS ini
 * @param date             tanggal PKS (YYYY-MM-DD)
 */
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
