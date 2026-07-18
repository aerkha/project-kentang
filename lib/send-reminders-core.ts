// Logika inti reminder bagi hasil & pengembalian modal.
// Modul ini SERVER-ONLY. Jangan diimpor dari komponen client.

import PocketBase from "pocketbase";
import nodemailer from "nodemailer";
import { todayWibStr } from "@/lib/utils";

function pbEsc(value: string): string {
  return value.replaceAll('\\', "\\\\").replaceAll('"', String.raw`\"`);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PendingTask {
  type: "Bagi Hasil" | "Pengembalian Modal";
  id: string; 
  date: string; 
  investors: string;
  amount: number;
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

function parsePeriodeDays(desc: string): number {
  const m = /\d+/.exec(desc || "");
  const n = m ? Number.parseInt(m[0], 10) : 30;
  return n > 0 ? n : 30;
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
function endDatePks(mou: any) {
  // 1. Prioritaskan Tanggal Berakhir (endDate) asli dari input PKS
  if (mou.endDate) {
    return mou.endDate.substring(0, 10);
  }
  // 2. Fallback cadangan
  const [y, m, d] = mou.date.substring(0, 10).split("-").map(Number);
  const totalDays = (mou.contractPeriod || 30) * (mou.siklus || 1);
  return new Date(Date.UTC(y, m - 1, d + totalDays)).toISOString().substring(0, 10);
}

// ─── Core Logic Autorenewal Transaksi ─────────────────────────────────────────

// Generate the next customId for an autorenewal clone.
// If the old id already ends with "-autorenew-N" increment N, otherwise append "-autorenew-1".
function nextAutorenewalCustomId(oldId: string): string {
  if (!oldId) return "TRX-0000A"; // Fallback aman jika kosong

  // Memisahkan "TRX-0004" dan huruf di belakangnya (misal "A")
  const match = oldId.match(/(TRX-\d+)([A-Z]*)/i);
  
  // Jika formatnya sama sekali tidak dikenali
  if (!match) return oldId + "A"; 
  
  const base = match[1];   // Menangkap bagian "TRX-0004"
  const suffix = match[2]; // Menangkap bagian huruf "A", "B", dsb. (jika ada)
  
  // Jika transaksi awal belum punya huruf (termasuk jika ID lamanya masih mengandung "-autorenew-1")
  if (!suffix) return base + "A";
  
  // Naikkan huruf terakhir (A -> B, B -> C, dst)
  const lastChar = suffix.slice(-1);
  const nextChar = String.fromCharCode(lastChar.charCodeAt(0) + 1);
  const newSuffix = suffix.slice(0, -1) + nextChar;
  
  return base + newSuffix;
}

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

      const period = parsePeriodeDays(old.description);
      const [y, m, d] = (old.date as string).slice(0, 10).split("-").map(Number);
      const nextDate = new Date(Date.UTC(y, m - 1, d + period)).toISOString().slice(0, 10);

      const oldInvestors = await pb.collection("transaksi_investors").getFullList<any>({
        filter: `transaksiId = "${pbEsc(old.id)}"`
      });

      const newTrx = await pb.collection("transaksis").create({
        customId: newCustomId,
        date: nextDate,
        description: old.description,
        endDate: old.endDate,
        isAutorenewal: true,
        hpp: old.hpp,
        kebutuhanModal: old.kebutuhanModal,
        ongkirPerKg: old.ongkirPerKg,
        hargaJual: old.hargaJual, 
        status: "berjalan",
        bagiHasilDone: false,
        bagiHasilChecks: {},
        catatanAkhir: `[Sistem] Transaksi autorenewal lanjutan dari ${oldCustomId}`
      });

      for (const inv of oldInvestors) {
         await pb.collection("transaksi_investors").create({
            transaksiId: newTrx.id,
            investorId: inv.investorId,
            mouId: inv.mouId,
            investorName: inv.investorName,
            investorBrokerName: inv.investorBrokerName,
            nilaiInvestasi: inv.nilaiInvestasi,
            pctTrader: inv.pctTrader,
            pctMinBun: inv.pctMinBun,
            pctBrokerI: inv.pctBrokerI,
            pctBrokerII: inv.pctBrokerII
         });
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

// Helper: Build map of investors from entries
async function buildInvestorsMap(pb: PocketBase, trxPbIds: string): Promise<Map<string, any[]>> {
  const entriesMap = new Map<string, any[]>();
  if (!trxPbIds) return entriesMap;
  
  try {
    const entries = await pb.collection("transaksi_investors").getFullList<any>({
      filter: trxPbIds,
      fields: "transaksiId,investorName,nilaiInvestasi",
    });
    for (const e of entries) {
      const list = entriesMap.get(e.transaksiId) ?? [];
      list.push(e);
      entriesMap.set(e.transaksiId, list);
    }
  } catch { /* ignore */ }
  
  return entriesMap;
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

  const trxPbIds = trxs.map((r) => `transaksiId = "${pbEsc(r.id)}"`).join(" || ");
  const entriesMap = await buildInvestorsMap(pb, trxPbIds);

  for (const trx of trxs) {
    const sisa = sisaHariTrx(trx);
    const isManualSelesai = trx.status === "selesai" || trx.status === "bermasalah";
    
    if (!isManualSelesai && sisa > 0) continue;

    const entries = entriesMap.get(trx.id) ?? [];
    const investors = [...new Set(entries.map((e: any) => e.investorName))].join(", ") || "—";
    const amount = entries.reduce((s: number, e: any) => s + e.nilaiInvestasi, 0);
    
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
      statusLabel,
    });
  }
}

// Helper: Process Pengembalian Modal (MoU)
async function processPengembalianModalTasks(pb: PocketBase, tasks: PendingTask[], today: string): Promise<void> {
  const mous = await pb.collection("mous").getFullList<any>({
    filter: `isTerminated = false`,
  });

  for (const mou of mous) {
    const endStr = endDatePks(mou);
    if (diffDays(today, endStr) <= 0) {
      tasks.push({
        type: "Pengembalian Modal",
        id: mou.id,
        date: endStr,
        investors: mou.investorName || "—",
        amount: mou.investmentAmount || 0,
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
  const rows = tasks.map((t) => `
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:10px 12px;font-family:monospace;font-weight:700;color:#111827;">${t.id}</td>
      <td style="padding:10px 12px;white-space:nowrap;">
        <span style="font-size:11px;padding:3px 8px;border-radius:999px;font-weight:600;${t.type === 'Bagi Hasil' ? 'background:#dcfce7;color:#166534;' : 'background:#ffe4e6;color:#9f1239;'}">
          ${t.type}
        </span>
      </td>
      <td style="padding:10px 12px;color:#6b7280;white-space:nowrap;">${fmtDate(t.date)}</td>
      <td style="padding:10px 12px;">${t.investors}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:600;">${t.amount > 0 ? fmtRp(t.amount) : "—"}</td>
      <td style="padding:10px 12px;text-align:center;color:#dc2626;font-weight:600;white-space:nowrap;">${t.statusLabel}</td>
    </tr>
  `).join("");

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
            <th style="padding:10px 12px;color:#374151;font-weight:600;text-align:center;">Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
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

async function sendWhatsApp(tasks: PendingTask[], date: string): Promise<ChannelStatus> {
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

  // PERBAIKAN: Menggunakan format murni FormData agar 100% diterima oleh Fonnte
  const formData = new FormData();
  formData.append("target", adminPhone);
  formData.append("message", lines.join("\n"));
  formData.append("countryCode", "62");

  const res = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: { Authorization: token },
    body: formData,
  });

  if (!res.ok) throw new Error(`Fonnte HTTP ${res.status}`);

  // SINKRONISASI: Pola yang sama dengan notify-investor / notify-broker /
  // notify-owner — Fonnte kadang return HTTP 200 dengan body { status: false,
  // reason: "..." }. Tanpa cek ini, log akan keliru menandai "sent" padahal
  // pesan tidak terkirim ke device admin (mis. gateway WA offline, nomor
  // tidak terdaftar WA, dst).
  const data = await res.json().catch(() => null);
  if (data && data.status === false) {
    throw new Error(`Fonnte: ${data.reason || data.detail || "ditolak"}`);
  }
  return "sent";
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

    const toSend: PendingTask[] = [];

    if (triggeredBy === "manual") {
      toSend.push(...allPending);
    } else {
      const twentyHoursAgo = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
      
      const sentFlags = await Promise.all(
        allPending.map((task) =>
          pb.collection("reminder_logs")
            .getList(1, 1, {
              filter: `(mouCustomId = "${pbEsc(task.id)}") && (triggeredBy = "cron" || triggeredBy = "manual") && (sentAt >= "${twentyHoursAgo}")`,
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

    await Promise.all(
      toSend.map((task) =>
        pb.collection("reminder_logs").create({
          mouCustomId:  task.id, 
          cycleNumber:  0,
          sentAt:       new Date().toISOString(),
          investorName: task.investors || "",
          keterangan:   task.type,
          jumlah:       task.amount,
          emailStatus:  adminEmailStatus,
          waStatus,
          errorMessage: errors.join(" | "),
          triggeredBy,
        }).catch(() => {}),
      ),
    );

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