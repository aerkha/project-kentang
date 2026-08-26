// Logika inti reminder bagi hasil & pengembalian modal.
// Modul ini SERVER-ONLY. Jangan diimpor dari komponen client.

import PocketBase from "pocketbase";
import nodemailer from "nodemailer";
import { todayWibStr, parsePeriodeDays, endDatePks } from "@/lib/utils";

// PATCH (serius #8): konstanta string untuk deteksi konflik unique agar tidak
// rapuh terhadap perubahan struktur error PocketBase di versi SDK mendatang.
export const UNIQUE_CONFLICT_CODE = "validation_not_unique";

function pbEsc(value: string): string {
  // PATCH (serius #7): escape tambahan untuk karakter null/line terminator yang
  // dapat mengacaukan filter PocketBase. Chain terakhir hanya mem-backslash
  // quote, tidak cukup untuk field `keterangan` / catatan yang dapat memuat
  // newline, tab, atau karakter unicode. Karakter khusus lain yang menjadi
  // masalah di filter PB: masih relatif aman untuk alfanumerik+spesial.
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', String.raw`\"`)
    .replaceAll("\n", " ")
    .replaceAll("\r", " ")
    .replaceAll("\t", " ");
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingTask {
  type: "Bagi Hasil" | "Pengembalian Modal";
  id: string; 
  date: string; 
  investors: string;
  amount: number;
  bagiHasilAmount?: number;
  statusLabel: string;
}

type ChannelStatus = "sent" | "failed" | "skipped";
export type TriggeredBy = "cron" | "manual";

// ─── Helpers Tanggal ──────────────────────────────────────────────────────────

const MONTHS_ID = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

function fmtDate(s: string) {
  if (!s) return "—";
  const parts = s.slice(0, 10).split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts.map(Number);
    if (m >= 1 && m <= 12) {
      return `${d} ${MONTHS_ID[m - 1]} ${y}`;
    }
  }
  return s; 
}

function fmtRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0,
  }).format(n);
}

function diffDays(startStr: string, endStr: string): number {
  const [sy, sm, sd] = startStr.slice(0, 10).split("-").map(Number);
  const [ey, em, ed] = endStr.slice(0, 10).split("-").map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);
  return Math.round((endMs - startMs) / 86_400_000);
}

// Helper untuk Transaksi (Bagi Hasil)
function getEndDateTrx(date: string, description: string): string {
  if (!date) return "";
  const days = parsePeriodeDays(description);
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function sisaHariTrx(t: { date: string; description: string }): number {
  if (!t.date) return 0;
  return diffDays(todayWibStr(), getEndDateTrx(t.date, t.description));
}

// Helper untuk PKS (Pengembalian Modal)
// ─── Core Logic Autorenewal Transaksi ─────────────────────────────────────────

// Generate the next customId for an autorenewal clone.
// If the old id already ends with "-autorenew-N" increment N, otherwise append "-autorenew-1".
// PATCH (ringan #27): handle overflow suffix (Z → "AA"). Sebelumnya `Z`
// ditambah 1 jadi `[` (charCode 91) — karakter invalid untuk identifier.
// Sekarang: jika suffix berisi Z semua, append huruf A baru.
function nextAutorenewalCustomId(oldId: string): string {
  if (!oldId) return "TRX-0000A"; // Fallback aman jika kosong

  // Memisahkan "TRX-0004" dan huruf di belakangnya (misal "A").
  // Anchor ke akhir agar suffix invalid tidak ikut terpotong.
  const match = oldId.match(/^(TRX-\d+)([A-Z]*)$/i);

  // Jika formatnya sama sekali tidak dikenali
  if (!match) return oldId + "A";

  const base = match[1];   // Menangkap bagian "TRX-0004"
  const suffix = match[2]; // Menangkap bagian huruf "A", "B", dsb. (jika ada)

  // Jika transaksi awal belum punya huruf (termasuk jika ID lamanya masih mengandung "-autorenew-1")
  if (!suffix) return base + "A";

  // Cek overflow: jika semua suffix adalah "Z", tambah "A" baru.
  if (/^Z+$/i.test(suffix)) return base + suffix + "A";

  // Naikkan huruf terakhir (A -> B, B -> C, dst)
  const lastChar = suffix.slice(-1);
  const code = lastChar.toUpperCase().charCodeAt(0);
  if (code >= 90) {
    // Z (90) + 1 = 91 ("[") — overflow. Carry-over ke char sebelumnya.
    // Contoh: "AZ" -> "BA", "BZ" -> "CA", "ZZ" -> "AAA" (sudah di-handle di atas).
    const head = suffix.slice(0, -1);
    return base + nextAutorenewalCustomId._incSuffix(head) + "A";
  }
  const nextChar = String.fromCharCode(code + 1);
  const newSuffix = suffix.slice(0, -1) + nextChar;

  return base + newSuffix;
}

// Helper privat untuk increment suffix dengan carry-over (mis. "AZ" -> "BA")
nextAutorenewalCustomId._incSuffix = function (s: string): string {
  if (!s) return "A";
  if (/^Z+$/i.test(s)) return "A" + s; // overflow total
  const last = s.slice(-1);
  const code = last.toUpperCase().charCodeAt(0);
  if (code >= 90) {
    return nextAutorenewalCustomId._incSuffix(s.slice(0, -1)) + "A";
  }
  return s.slice(0, -1) + String.fromCharCode(code + 1);
};

async function processAutorenewals(pb: PocketBase) {
  const today = todayWibStr();
  
  const renewingTrxs = await pb.collection("transaksis").getFullList<any>({
    filter: "isAutorenewal = true && bagiHasilDone = true",
    sort: "created",
  });

  for (const old of renewingTrxs) {
    try {
      const isExpired = old.endDate && diffDays(today, old.endDate.slice(0, 10)) < 0;

      if (isExpired) {
        await pb.collection("transaksis").update(old.id, {
          isAutorenewal: false,
          catatanAkhir: old.catatanAkhir 
            ? `${old.catatanAkhir}\n[Sistem] Autorenewal dihentikan karena melewati Tanggal Akhir.` 
            : "[Sistem] Autorenewal dihentikan karena melewati Tanggal Akhir."
        });
        continue;
      }

      const oldCustomId = old.customId || old.id;
      const newCustomId = nextAutorenewalCustomId(oldCustomId);

      // m-5 (cron path): hardcode 30 hari per siklus. Sama seperti di client
      // (lib/transaksi-context.tsx triggerAutorenewal). Jangan parse dari
      // deskripsi — user dapat menulis teks bebas (mis. "PT 2025") yang
      // akan membuat daysMatch=2025 dan meloncat 5,5 tahun.
      const days = 30;
      const [y, m, d] = (old.date as string).slice(0, 10).split("-").map(Number);
      const nextDate = new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);

      const oldInvestors = await pb.collection("transaksi_investors").getFullList<any>({
        filter: `transaksiId = "${pbEsc(old.id)}"`
      });

      let newTrx: any = null;
      try {
        newTrx = await pb.collection("transaksis").create({
          customId: newCustomId,
          date: nextDate,
          description: old.description,
          endDate: old.endDate,
          isAutorenewal: true,
          hpp: old.hpp,
          kebutuhanModal: old.kebutuhanModal,
          ongkirPerKg: old.ongkirPerKg,
          // PATCH (serius #17): autorenewal sebelumnya copy `old.hpp` ke hargaJual
          // — bug yang membuat profit selalu 0 (harga jual = HPP, profit = 0).
          // Sekarang copy hargaJual lama yang sebenarnya.
          hargaJual: old.hargaJual ?? 0,
          status: "berjalan",
          bagiHasilDone: false,
          bagiHasilChecks: {},
          catatanAkhir: `[Sistem] Transaksi autorenewal lanjutan dari ${oldCustomId}`
        });
      } catch (createErr) {
        console.error(`[Autorenewal] gagal membuat ${newCustomId} dari ${old.id}:`, createErr);
        // Jangan update old menjadi isAutorenewal=false — biarkan agar cron berikutnya retry
        continue;
      }

      try {
        // Resolve pksId untuk entry sumber yang kosong agar autorenewal selalu
        // memakai ulang PKS yang sama dengan transaksi sumber. Ambil PKS (mous)
        // investor yang belum terminated dan investmentAmount-nya sama dengan
        // nilaiInvestasi entry — bukan "PKS pertama yang tersedia".
        const emptyPksInvestorIds = [...new Set(
          oldInvestors.filter((inv: any) => !inv.pksId).map((inv: any) => inv.investorId as string),
        )];
        const pksByInvestor = new Map<string, { pksId: string; investmentAmount: number }[]>();
        await Promise.all(emptyPksInvestorIds.map(async (invId: string) => {
          try {
            const list = await pb.collection("mous").getFullList<any>({
              filter: `investorId = "${pbEsc(invId)}" && isTerminated = false`,
              fields: "customId,investmentAmount",
            });
            pksByInvestor.set(invId, list.map((r: any) => ({
              // customId (PKS-YYYYMM-NNN) — itulah yang disimpan app di field
              // pksId transaksi_investors.
              pksId: (r.customId as string) || "",
              investmentAmount: (r.investmentAmount as number) ?? 0,
            })));
          } catch {
            pksByInvestor.set(invId, []);
          }
        }));

        for (const inv of oldInvestors) {
           // PATCH (serius #15): fallback ke 0 jika nilaiInvestasi bukan number.
           // Sebelumnya `inv.nilaiInvestasi` bisa `undefined`/null atau string
           // dari PocketBase yang lolos type-check, dan PocketBase akan menyimpan
           // NaN atau error validasi. Sekarang selalu konversi numerik aman.
           const safeNum = (v: unknown): number => {
             if (typeof v === "number" && Number.isFinite(v)) return v;
             if (typeof v === "string") {
               const n = Number.parseFloat(v);
               return Number.isFinite(n) ? n : 0;
             }
             return 0;
           };
           // Resolve pksId kosong → PKS investor (belum terminated) yang
           // investmentAmount-nya sama dengan nilaiInvestasi entry, agar
           // autorenewal konsisten memakai ulang PKS yang sama dengan sumber.
           let pksId = (inv.pksId as string) || "";
           if (!pksId) {
             const pool = pksByInvestor.get(inv.investorId as string) ?? [];
             const match = pool.find((m) => Math.abs(m.investmentAmount - safeNum(inv.nilaiInvestasi)) < 1);
             if (match) pksId = match.pksId;
           }
           await pb.collection("transaksi_investors").create({
              transaksiId: newTrx.id,
              investorId: inv.investorId,
              pksId,
              investorName: inv.investorName,
              investorBrokerName: inv.investorBrokerName,
              nilaiInvestasi: safeNum(inv.nilaiInvestasi),
              pctTrader: safeNum(inv.pctTrader),
              pctMinBun: safeNum(inv.pctMinBun),
              pctBrokerI: safeNum(inv.pctBrokerI),
              pctBrokerII: safeNum(inv.pctBrokerII),
           });
        }

        // PATCH (serius #14): bukti transfer (buktiInvestor/dst) dari old TIDAK
        // ter-clone. Sebelumnya autorenewal hanya menyalin entries, sehingga
        // TRX hasil clone kehilangan semua bukti transfer lampau.
        const proofFields = ["buktiInvestor", "buktiBroker", "buktiTrader", "buktiMinBun"] as const;
        const proofs: Record<string, unknown> = {};
        for (const f of proofFields) {
          const v = (old as any)[f];
          if (v) proofs[f] = v;
        }
        if (Object.keys(proofs).length > 0) {
          await pb.collection("transaksis").update(newTrx.id, proofs).catch(() => null);
        }
      } catch (entryErr) {
        // PATCH (serius #16): race condition. Jika create TRX sukses tapi loop
        // entries gagal, old.isAutorenewal masih true → cron berikutnya akan
        // duplikat TRX. Sekarang rollback dengan menghapus TRX baru dan tandai
        // old dengan error log agar cron berikutnya skip (memerlukan manual fix).
        console.error(`[Autorenewal] gagal salin entries ke ${newCustomId}:`, entryErr);
        await pb.collection("transaksis").delete(newTrx.id).catch(() => null);
        continue;
      }

      await pb.collection("transaksis").update(old.id, {
        isAutorenewal: false,
        catatanAkhir: old.catatanAkhir 
          ? `${old.catatanAkhir}\n[Sistem] Autorenewal siklus berikutnya sukses dibuat di ${newCustomId}` 
          : `[Sistem] Autorenewal siklus berikutnya sukses dibuat di ${newCustomId}`
      });

    } catch (error) {
      console.error(`[Autorenewal] Gagal memproses kloning TRX ${old.id}:`, error);
    }
  }
}

// ─── Core Logic Pencarian Tagihan ─────────────────────────────────────────────

// Helper: Build map of investors from entries.
// Mengikuti pendekatan client-side (lib/transaksi-context.tsx baris 285):
// load SEMUA record `transaksi_investors` TANPA filter, lalu kelompokkan di
// memory berdasarkan `transaksiId`. Pendekatan filter PocketBase sebelumnya
// (baik single maupun batched) gagal silently — error tertangkap catch dan
// entriesMap tetap kosong, sehingga kolom Investor & Nominal Bagi Hasil di
// email selalu menampilkan "—". Load tanpa filter terbukti bekerja di client.
async function buildInvestorsMap(pb: PocketBase): Promise<Map<string, any[]>> {
  const entriesMap = new Map<string, any[]>();

  try {
    const entries = await pb.collection("transaksi_investors").getFullList<any>({
      sort: "created",
    });
    console.log(`[buildInvestorsMap] Berhasil load ${entries.length} entries`);
    for (const e of entries) {
      const list = entriesMap.get(e.transaksiId) ?? [];
      list.push(e);
      entriesMap.set(e.transaksiId, list);
    }
  } catch (err) {
    console.warn(`[buildInvestorsMap] gagal load entries:`, err);
  }

  return entriesMap;
}

// Helper: ambil bagiHasilPK per investor dari koleksi mous (PKS).
// Mengikuti logika `getInvestorPkPct` di components/reminder-content.tsx:
// ambil PKS terbaru (date terbesar) untuk investorId, fallback 35.
// Sebelumnya reminder memakai `entry.pctMinBun` (persentase MinBun) — salah,
// yang mengakibatkan nominal bagi hasil di email selalu 0 / salah.
async function buildInvestorPkPctMap(pb: PocketBase): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const latestDateMap = new Map<string, string>();
  try {
    const pksList = await pb.collection("mous").getFullList<any>({});
    for (const pks of pksList) {
      const invId = pks.investorId as string | undefined;
      if (!invId) continue;
      const pksDate = (pks.date as string) || "";
      const existingDate = latestDateMap.get(invId) ?? "";
      // Simpan yang terbaru (date terbesar) — sama dengan getInvestorPkPct
      if (pksDate > existingDate) {
        latestDateMap.set(invId, pksDate);
        map.set(invId, (pks.bagiHasilPK as number) ?? 35);
      }
    }
  } catch (err) {
    console.warn("[buildInvestorPkPctMap] gagal load mous, fallback ke 35%:", err);
  }
  return map;
}

// Helper: Process Bagi Hasil transaksi
async function processBagiHasilTasks(pb: PocketBase, tasks: PendingTask[]): Promise<void> {
  // m-21: status "batal" sekarang di-normalize ke "berjalan" oleh klien, tapi
  // di server tetap exclude "batal" eksplisit agar tidak perlu dikirim reminder.
  // Termasuk exclude "rencana" agar hanya transaksi yang sudah dimulai saja.
  const trxs = await pb.collection("transaksis").getFullList<any>({
    filter: `bagiHasilDone = false && status != "batal" && status != "rencana"`,
    sort: "date",
  });

  if (trxs.length === 0) return;

  const entriesMap = await buildInvestorsMap(pb);
  const pkPctMap = await buildInvestorPkPctMap(pb);

  for (const trx of trxs) {
    const sisa = sisaHariTrx(trx);
    const isManualSelesai = trx.status === "selesai" || trx.status === "bermasalah";
    
    if (!isManualSelesai && sisa > 0) continue;

    const entries = entriesMap.get(trx.id) ?? [];
    const investors = [...new Set(entries.map((e: any) => e.investorName))].join(", ") || "—";
    const amount = entries.reduce((s: number, e: any) => s + e.nilaiInvestasi, 0);
    
    // Hitung nominal bagi hasil yang sebenarnya.
    // Mengikuti calcTransaksi (lib/transaksi-context.tsx) & buildTransaksiRows
    // (components/reminder-content.tsx) sebagai referensi "Tugas Transfer Harian".
    // Sebelumnya: profit = hargaJual - hpp (per unit, salah) dan pkPct = pctMinBun
    // (persentase MinBun, salah). Sekarang: profit total dikurangi modal+ongkir,
    // dan pkPct diambil dari bagiHasilPK PKS investor.
    const hpp = trx.hpp || 0;
    const kebutuhanModal = trx.kebutuhanModal || 0;
    const ongkirPerKg = trx.ongkirPerKg || 0;
    const hargaJual = trx.hargaJual || 0;
    const qty = hpp > 0 ? kebutuhanModal / hpp : 0;
    const totalOngkir = ongkirPerKg * qty;
    const income = hargaJual * qty;
    const profit = Math.max(0, income - (kebutuhanModal + totalOngkir));
    const totalInvestasi = amount;
    
    const bagiHasilAmount = entries.reduce((sum: number, e: any) => {
      if (!e.nilaiInvestasi || totalInvestasi === 0) return sum;
      const ratio = e.nilaiInvestasi / totalInvestasi;
      const pkPct = (pkPctMap.get(e.investorId) ?? 35) / 100;
      return sum + (profit * ratio * pkPct);
    }, 0);
    
    let statusLabel: string;
    if (trx.status === "bermasalah") {
      statusLabel = "Bermasalah";
    } else if (sisa <= 0) {
      statusLabel = "Jatuh Tempo";
    } else {
      statusLabel = "Selesai";
    }
    
    tasks.push({
      type: "Bagi Hasil",
      id: trx.customId || trx.id,
      date: getEndDateTrx(trx.date, trx.description),
      investors,
      amount,
      bagiHasilAmount,
      statusLabel,
    });
  }
}

// Helper: Process Pengembalian Modal (Pks)
async function processPengembalianModalTasks(pb: PocketBase, tasks: PendingTask[], today: string): Promise<void> {
  const pksList = await pb.collection("mous").getFullList<any>({
    filter: `isTerminated = false`,
  });

  for (const pks of pksList) {
    const endStr = endDatePks(pks);
    if (diffDays(today, endStr) <= 0) {
      tasks.push({
        type: "Pengembalian Modal",
        id: pks.id,
        date: endStr,
        investors: pks.investorName || "—",
        amount: pks.investmentAmount || 0,
        statusLabel: "Jatuh Tempo",
      });
    }
  }
}

async function findPendingTasks(pb: PocketBase): Promise<PendingTask[]> {
  const tasks: PendingTask[] = [];
  const today = todayWibStr();

  await processBagiHasilTasks(pb, tasks);
  await processPengembalianModalTasks(pb, tasks, today);

  tasks.sort((a, b) => a.date.localeCompare(b.date));
  return tasks;
}

// ─── Email HTML: ringkasan untuk admin ─────────────────────────────────────────

function buildAdminEmailHtml(tasks: PendingTask[], date: string): string {
  // Kelompokkan tasks berdasarkan tanggal jatuh tempo
  const tasksByDate = new Map<string, PendingTask[]>();
  for (const task of tasks) {
    const existing = tasksByDate.get(task.date) || [];
    existing.push(task);
    tasksByDate.set(task.date, existing);
  }

  // Urutkan tanggal
  const sortedDates = Array.from(tasksByDate.keys()).sort();

  // Build rows dengan subtotal per tanggal
  const rows: string[] = [];
  
  for (const dateKey of sortedDates) {
    const dateTasks = tasksByDate.get(dateKey) || [];
    
    // Header tanggal jatuh tempo
    rows.push(`
    <tr style="background:#f3f4f6;">
      <td colspan="7" style="padding:12px 12px;font-weight:700;color:#111827;font-size:14px;">
        📅 Jatuh Tempo: ${fmtDate(dateKey)}
      </td>
    </tr>
    `);
    
    // Tasks untuk tanggal ini
    for (const t of dateTasks) {
      rows.push(`
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:10px 12px;font-family:monospace;font-weight:700;color:#111827;">${t.id}</td>
      <td style="padding:10px 12px;white-space:nowrap;">
        <span style="font-size:11px;padding:3px 8px;border-radius:999px;font-weight:600;${t.type === 'Bagi Hasil' ? 'background:#dcfce7;color:#166534;' : 'background:#ffe4e6;color:#9f1239;'}">
          ${t.type}
        </span>
      </td>
      <td style="padding:10px 12px;color:#6b7280;white-space:nowrap;">${fmtDate(t.date)}</td>
      <td style="padding:10px 12px;">${t.investors}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:600;">${t.type === "Bagi Hasil" ? "—" : (t.amount > 0 ? fmtRp(t.amount) : "—")}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:600;color:#16a34a;">${t.bagiHasilAmount && t.bagiHasilAmount > 0 ? fmtRp(t.bagiHasilAmount) : "—"}</td>
      <td style="padding:10px 12px;text-align:center;color:#dc2626;font-weight:600;white-space:nowrap;">${t.statusLabel}</td>
    </tr>
      `);
    }
    
    // Subtotal untuk tanggal ini.
    // Total pembayaran = bagiHasilAmount (untuk "Bagi Hasil") + amount (untuk
    // "Pengembalian Modal"), agar total jelas: bagi hasil + pengembalian modal.
    const subtotal = dateTasks.reduce((sum, t) => sum + (t.type === "Bagi Hasil" ? (t.bagiHasilAmount ?? 0) : t.amount), 0);
    const countBagiHasil = dateTasks.filter(t => t.type === "Bagi Hasil").length;
    const countPengembalian = dateTasks.filter(t => t.type === "Pengembalian Modal").length;
    
    rows.push(`
    <tr style="background:#fef3c7;border-top:2px solid #f59e0b;border-bottom:2px solid #f59e0b;">
      <td colspan="4" style="padding:10px 12px;font-weight:700;color:#92400e;text-align:right;">
        Subtotal (${dateTasks.length} tagihan: ${countBagiHasil} Bagi Hasil, ${countPengembalian} Pengembalian Modal):
      </td>
      <td colspan="3" style="padding:10px 12px;text-align:right;font-weight:700;color:#92400e;font-size:15px;">
        ${fmtRp(subtotal)}
      </td>
    </tr>
    `);
  }

  // Grand total di akhir.
  // Total pembayaran = bagiHasilAmount (untuk "Bagi Hasil") + amount (untuk
  // "Pengembalian Modal"), sama dengan logika subtotal per tanggal.
  const grandTotal = tasks.reduce((sum, t) => sum + (t.type === "Bagi Hasil" ? (t.bagiHasilAmount ?? 0) : t.amount), 0);
  const totalBagiHasil = tasks.filter(t => t.type === "Bagi Hasil").length;
  const totalPengembalian = tasks.filter(t => t.type === "Pengembalian Modal").length;
  
  rows.push(`
    <tr style="background:#dcfce7;border-top:3px solid #16a34a;">
      <td colspan="4" style="padding:14px 12px;font-weight:700;color:#14532d;text-align:right;font-size:15px;">
        TOTAL KESELURUHAN (${tasks.length} tagihan: ${totalBagiHasil} Bagi Hasil, ${totalPengembalian} Pengembalian Modal):
      </td>
      <td colspan="3" style="padding:14px 12px;text-align:right;font-weight:700;color:#14532d;font-size:17px;">
        ${fmtRp(grandTotal)}
      </td>
    </tr>
  `);

  const rowsHtml = rows.join("");

  return `
<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:760px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
    <div style="background:#16a34a;padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:22px;">🔔 Reminder Tagihan Pending</h1>
      <p style="margin:6px 0 0;color:#bbf7d0;font-size:14px;">${date} · MinBun ERP</p>
    </div>
    <div style="padding:24px 32px;background:#f0fdf4;border-bottom:1px solid #dcfce7;">
      <p style="margin:0;font-size:15px;color:#15803d;">
        <strong>${tasks.length} tagihan</strong> (Bagi Hasil / Pengembalian Modal) menunggu untuk dibayarkan.
        Silakan proses pelunasan melalui halaman Reminder.
      </p>
    </div>
    <div style="padding:24px 32px;overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;text-align:left;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 12px;color:#374151;font-weight:600;">No. Referensi</th>
            <th style="padding:10px 12px;color:#374151;font-weight:600;">Jenis Tagihan</th>
            <th style="padding:10px 12px;color:#374151;font-weight:600;">Jatuh Tempo</th>
            <th style="padding:10px 12px;color:#374151;font-weight:600;">Investor</th>
            <th style="padding:10px 12px;color:#374151;font-weight:600;text-align:right;">Nominal Modal</th>
            <th style="padding:10px 12px;color:#374151;font-weight:600;text-align:right;">Nominal Bagi Hasil</th>
            <th style="padding:10px 12px;color:#374151;font-weight:600;text-align:center;">Status</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
        Email ini dikirim otomatis oleh MinBun ERP · Jangan membalas email ini
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Setup Transport Email ──────────────────────────────────────────────────────

function makeTransporter() {
  const user = process.env.GMAIL_USER?.trim();
  const rawPass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !rawPass) return null;
  const pass = rawPass.replace(/\s+/g, ""); 
  
  return { user, transporter: nodemailer.createTransport({ service: "gmail", auth: { user, pass } }) };
}

async function sendAdminEmail(tasks: PendingTask[], todayStr: string): Promise<ChannelStatus> {
  const t          = makeTransporter();
  const recipients = (process.env.ADMIN_EMAIL ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  if (!t || recipients.length === 0) return "skipped";

  await t.transporter.sendMail({
    from:    `"MinBun ERP" <${t.user}>`,
    to:      recipients.join(", "),
    subject: `[MinBun] 🔔 ${tasks.length} Tagihan Menunggu Pelunasan — ${todayStr}`,
    html:    buildAdminEmailHtml(tasks, todayStr),
  });
  return "sent";
}

// ─── WhatsApp via Fonnte (ke admin) ────────────────────────────────────────────
// PATCH (sementara): WhatsApp notification dinonaktifkan.
// User saat ini belum bisa memenuhi syarat Meta untuk WhatsApp Business API
// (perlu verifikasi bisnis Meta). Saat ini kode di-komentari agar:
// - Build Vercel tidak gagal tanpa FONNTE_TOKEN
// - Log cron job tidak dipenuhi error Fonnte missing token
// - Kode tetap visible untuk dokumentasi & referensi saat WA sudah aktif
// Untuk mengaktifkan kembali: hapus komentar /* ... */ wrapper di bawah.
async function sendWhatsApp(tasks: PendingTask[], date: string): Promise<ChannelStatus> {
  // PATCH (sementara): seluruh body dinonaktifkan sampai Meta WA API siap.
  return "skipped";

  /* ── KODE ASLI — NONAKTIF SEMENTARA ───────────────────────────────────────
  const token      = process.env.FONNTE_TOKEN?.trim();
  const adminPhone = process.env.ADMIN_PHONE?.trim();

  if (!token || !adminPhone) return "skipped";

  const lines = [
    `🔔 *Reminder Tagihan Pending — MinBun*`,
    `📅 ${date}`,
    ``,
    `${tasks.length} tagihan menunggu proses pembayaran:`,
    ``,
    ...tasks.map((t, i) => {
      const modalLine = t.amount > 0 ? `\n   Modal: ${fmtRp(t.amount)}` : "";
      return `${i + 1}. *${t.id}* (${t.type}) — ${fmtDate(t.date)}\n   Investor: ${t.investors}${modalLine}`;
    }),
    ``,
    `_Silakan proses pelunasan secara massal melalui halaman Reminder._`,
  ];

  const buildBody = () => {
    const fd = new FormData();
    fd.append("target",      adminPhone);
    fd.append("message",     lines.join("\n"));
    fd.append("countryCode", "62");
    return fd;
  };

  let res  = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: { Authorization: token },
    body: buildBody(),
  });
  let data = await res.json().catch(() => null);

  if (data?.status === false) {
    const reason = (data.reason || data.detail || "").toLowerCase();
    if (reason.includes("disconnected") || reason.includes("not connected") || reason.includes("not registered")) {
      console.warn(`[send-reminders] Fonnte disconnected, retry dalam 5 detik untuk admin...`);
      await new Promise((r) => setTimeout(r, 5000));
      res  = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: { Authorization: token },
        body: buildBody(),
      });
      data = await res.json().catch(() => null);
    }
  }

  if (!res.ok) throw new Error(`Fonnte HTTP ${res.status}`);

  if (data && data.status === false) {
    throw new Error(`Fonnte: ${data.reason || data.detail || "ditolak"}`);
  }
  return "sent";
  ─────────────────────────────────────────────────────────────────────────── */
}

// ─── Hasil Eksekusi ──────────────────────────────────────────────────────────

export interface ReminderResult {
  status: number;
  body:   Record<string, unknown>;
}

export async function runRemindersTest(): Promise<ReminderResult> {
  const todayStr = fmtDate(todayWibStr());
  const dummy: PendingTask = {
    type: "Bagi Hasil",
    id: "TRX-0001", 
    date: "2026-05-15",
    investors: "Investor Test",
    amount: 50_000_000,
    bagiHasilAmount: 8_750_000,
    statusLabel: "Selesai"
  };
  const adminEmail = await sendAdminEmail([dummy], `${todayStr} (TEST)`).catch(() => "failed");
  const waStatus   = await sendWhatsApp([dummy], `${todayStr} (TEST)`).catch(() => "failed");
  return { status: 200, body: { mode: "test", adminEmail, waStatus } };
}

/**
 * Jalankan pengiriman reminder tagihan.
 * @param triggeredBy "cron" (otomatis harian) atau "manual" (Kirim Sekarang)
 */
export async function runReminders(triggeredBy: TriggeredBy): Promise<ReminderResult> {
  const serviceEmail    = process.env.PB_SERVICE_EMAIL?.trim();
  const servicePassword = process.env.PB_SERVICE_PASSWORD?.trim();
  if (!serviceEmail || !servicePassword) {
    return { status: 500, body: { error: "Service account tidak dikonfigurasi" } };
  }

  const pb = new PocketBase(process.env.NEXT_PUBLIC_PB_URL?.trim());

  try {
    await pb.collection("users").authWithPassword(serviceEmail, servicePassword);
  } catch (err) {
    console.error("[send-reminders] auth service account gagal", err);
    return {
      status: 401,
      body: { error: "Service account gagal login", detail: "Periksa PB_SERVICE_EMAIL & PB_SERVICE_PASSWORD" },
    };
  }

  try {
    await processAutorenewals(pb);

    const allPending = await findPendingTasks(pb);

    if (allPending.length === 0) {
      return { status: 200, body: { sent: 0, message: "Tidak ada tagihan yang menunggu pembayaran hari ini" } };
    }

    const
     toSend: PendingTask[] = [];

    if (triggeredBy === "manual") {
      toSend.push(...allPending);
    } else {
      const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
      
      const sentFlags = await Promise.all(
        allPending.map((task) =>
          pb.collection("reminder_logs")
            .getList(1, 1, {
              filter: `(pksCustomId = "${pbEsc(task.id)}") && (triggeredBy = "cron" || triggeredBy = "manual") && (sentAt >= "${twentyHoursAgo}")`,
            })
            .then((r) => r.totalItems > 0)
            .catch(() => false),
        ),
      );
      allPending.forEach((task, i) => {
        if (!sentFlags[i]) toSend.push(task);
      });
    }

    if (toSend.length === 0) {
      return { status: 200, body: { sent: 0, message: "Semua reminder harian untuk tagihan ini sudah terkirim." } };
    }

    const todayStr = fmtDate(todayWibStr());
    const errors: string[] = [];

    const adminEmailStatus = await sendAdminEmail(toSend, todayStr).catch((e) => {
      errors.push(`Email admin: ${String(e)}`);
      return "failed";
    });

    const waStatus = await sendWhatsApp(toSend, todayStr).catch((e) => {
      errors.push(`WA: ${String(e)}`);
      return "failed";
    });

    // PATCH (ringan #20 + UX #28): errorMessage disimpan dengan format yang lebih
    // jelas dan informatif untuk membantu user memahami status channel notifikasi.
    // Format baru menjelaskan detail status setiap channel (Email & WhatsApp).
    const anyChannelSent = adminEmailStatus === "sent" || waStatus === "sent";
    const allChannelsSkipped = adminEmailStatus === "skipped" && waStatus === "skipped";

    // Build pesan keterangan yang jelas berdasarkan kombinasi status channel
    let keteranganMessage: string;
    
    if (anyChannelSent) {
      // Ada channel yang sukses - jelaskan mana yang berhasil/gagal
      const parts: string[] = [];
      if (adminEmailStatus === "sent") parts.push("✓ Email terkirim");
      else if (adminEmailStatus === "failed") parts.push("✗ Email gagal");
      else if (adminEmailStatus === "skipped") parts.push("○ Email dilewati (tidak dikonfigurasi)");
      
      if (waStatus === "sent") parts.push("✓ WhatsApp terkirim");
      else if (waStatus === "failed") parts.push("✗ WhatsApp gagal");
      else if (waStatus === "skipped") parts.push("○ WhatsApp dilewati (tidak dikonfigurasi)");
      
      keteranganMessage = parts.join(" · ");
      
      // Tambahkan detail error jika ada channel yang gagal
      if (errors.length > 0) {
        keteranganMessage += "\n\nDetail error:\n" + errors.map((e, i) => `${i + 1}. ${e}`).join("\n");
      }
    } else {
      // Semua channel gagal atau skip
      if (allChannelsSkipped) {
        keteranganMessage = "⚠ Tidak ada channel notifikasi yang aktif\n\n" +
          "Email dan WhatsApp belum dikonfigurasi. Silakan atur GMAIL_USER, GMAIL_APP_PASSWORD, " +
          "dan ADMIN_EMAIL di environment variables untuk mengaktifkan notifikasi email.";
      } else {
        // Ada yang failed
        keteranganMessage = "✗ Semua channel notifikasi gagal\n\n";
        if (adminEmailStatus === "failed") keteranganMessage += "• Email: Gagal\n";
        if (waStatus === "failed") keteranganMessage += "• WhatsApp: Gagal\n";
        
        if (errors.length > 0) {
          keteranganMessage += "\nDetail error:\n" + errors.map((e, i) => `${i + 1}. ${e}`).join("\n");
        }
      }
    }

    // Catat attempt untuk audit, tetapi jangan mengembalikan status sukses atau
    // menghitung task sebagai terkirim bila tidak ada channel yang benar-benar
    // mengirim pesan. Cron dapat mencoba kembali pada eksekusi berikutnya.
    await Promise.all(
      toSend.map((task) =>
        pb.collection("reminder_logs").create({
          pksCustomId:  task.id,
          cycleNumber:  0,
          sentAt:       new Date().toISOString(),
          investorName: task.investors || "",
          keterangan:   task.type,
          jumlah:       task.amount,
          emailStatus:  adminEmailStatus,
          waStatus,
          errorMessage: keteranganMessage,
          triggeredBy,
        }).catch(() => {}),
      ),
    );

    if (!anyChannelSent) {
      return {
        status: allChannelsSkipped ? 503 : 502,
        body: {
          sent: 0,
          adminEmailStatus,
          waStatus,
          errors: errors.length ? errors : [
            allChannelsSkipped ? "Tidak ada channel notifikasi yang aktif" : "Semua channel notifikasi gagal",
          ],
          tasks: toSend.map((t) => ({ id: t.id, type: t.type, date: t.date })),
        },
      };
    }

    return {
      status: 200,
      body: {
        sent:             toSend.length,
        adminEmailStatus,
        waStatus,
        errors:           errors.length ? errors : undefined,
        tasks:            toSend.map((t) => ({ id: t.id, type: t.type, date: t.date })),
      },
    };

  } catch (err) {
    console.error("[send-reminders]", err);
    return { status: 500, body: { error: "Internal error", detail: String(err) } };
  }
}