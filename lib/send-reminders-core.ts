// Logika inti reminder akhir periode PKS — dipakai bersama oleh:
//   - app/api/send-reminders   (cron Vercel, auth CRON_SECRET)
//   - app/api/trigger-reminder (tombol "Kirim Sekarang", auth admin PocketBase)
//
// Modul ini SERVER-ONLY. Jangan diimpor dari komponen client.
// Kedua route memanggil runReminders() langsung — tanpa HTTP self-call — agar
// tidak bergantung pada NEXT_PUBLIC_APP_URL / base URL deployment.

import PocketBase from "pocketbase";
import nodemailer from "nodemailer";

function pbEsc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ── Zona waktu aplikasi: WIB (UTC+7) ─────────────────────────────────────────
// Server (Vercel) berjalan di UTC — semua "hari ini" dihitung dari kalender WIB
// agar konsisten dengan client. Cron dijadwalkan "0 0 * * *" (UTC) = 07:00 WIB.

const WIB_OFFSET_MS = 7 * 3_600_000;

/** Tanggal kalender WIB hari ini sebagai "YYYY-MM-DD" */
function todayWibStr(): string {
  return new Date(Date.now() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Parse "YYYY-MM-DD" ke epoch ms pada UTC midnight (untuk aritmetika hari) */
function dateUtcMs(s: string): number {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MoURecord {
  id: string;
  customId: string;
  date: string;
  investorId: string;       // customId investor, mis. "INV-0001"
  investorName: string;
  investorPhone: string;
  investmentAmount: number;
  contractPeriod: number;
  isTerminated: boolean;
  bagiHasilDone?: boolean;
  brokerId?: string;        // customId broker jika PKS via broker
  brokerName?: string;
}

/** Satu PKS yang mencapai akhir periode kontrak (hari-H atau dalam window catch-up). */
interface DueMou {
  mou: MoURecord;
  endDate: string;          // tanggal akhir kontrak "YYYY-MM-DD"
  daysOverdue: number;      // 0 = berakhir hari ini, 1-2 = catch-up
}

type ChannelStatus = "sent" | "failed" | "skipped";

export type TriggeredBy = "cron" | "manual";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS_ID = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

function fmtDate(s: string) {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS_ID[m - 1]} ${y}`;
}

function fmtRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0,
  }).format(n);
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Label status akhir periode untuk ditampilkan di email/WA. */
function dueLabel(daysOverdue: number): string {
  if (daysOverdue <= 0) return "Berakhir hari ini";
  return `Berakhir ${daysOverdue} hari lalu`;
}

/**
 * Temukan semua PKS yang mencapai AKHIR PERIODE KONTRAK hari ini ATAU dalam
 * 2 hari terakhir.
 *
 * Akhir periode = tanggal mulai (date) + contractPeriod hari — konsisten dengan
 * kolom "Deadline" di halaman reminder (reminder-content.tsx).
 *
 * Window catch-up 2 hari mencegah PKS terlewat jika cron gagal berjalan tepat
 * di hari jatuh tempo. Duplikasi dicegah oleh pengecekan reminder_logs di
 * runReminders — PKS yang sudah pernah dikirim tidak dikirim ulang.
 */
function findDueMous(mous: MoURecord[]): DueMou[] {
  const todayMs = dateUtcMs(todayWibStr());
  const result: DueMou[] = [];

  for (const mou of mous) {
    if (mou.isTerminated) continue;     // PKS dihentikan — tidak ada kewajiban
    if (mou.bagiHasilDone) continue;    // seluruh bagi hasil sudah lunas — tidak perlu remind

    const endDate     = addDays(mou.date, mou.contractPeriod);
    const daysOverdue = Math.round((todayMs - dateUtcMs(endDate)) / 86_400_000);

    // Hanya hari-H (0) sampai 2 hari setelahnya (catch-up bila cron telat)
    if (daysOverdue < 0 || daysOverdue > 2) continue;

    result.push({ mou, endDate, daysOverdue });
  }

  return result;
}

// ─── Email HTML: ringkasan untuk admin ─────────────────────────────────────────

function buildAdminEmailHtml(dues: DueMou[], date: string): string {
  const rows = dues.map((d) => `
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:10px 12px;font-weight:600;">${d.mou.investorName}</td>
      <td style="padding:10px 12px;font-family:monospace;color:#6b7280;">${d.mou.customId}</td>
      <td style="padding:10px 12px;color:#6b7280;white-space:nowrap;">
        ${fmtDate(d.mou.date)} — ${fmtDate(d.endDate)}
      </td>
      <td style="padding:10px 12px;text-align:right;font-weight:600;">
        ${fmtRp(d.mou.investmentAmount)}
      </td>
      <td style="padding:10px 12px;color:#6b7280;">${d.mou.investorPhone}</td>
      <td style="padding:10px 12px;text-align:center;color:#dc2626;font-weight:600;white-space:nowrap;">
        ${dueLabel(d.daysOverdue)}
      </td>
    </tr>
  `).join("");

  return `
<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:720px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
    <div style="background:#16a34a;padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:22px;">🔔 Reminder Akhir Periode PKS</h1>
      <p style="margin:6px 0 0;color:#bbf7d0;font-size:14px;">${date} · MinBun ERP</p>
    </div>
    <div style="padding:24px 32px;background:#f0fdf4;border-bottom:1px solid #dcfce7;">
      <p style="margin:0;font-size:15px;color:#15803d;">
        <strong>${dues.length} PKS</strong> mencapai akhir periode kontrak.
        Silakan proses pelunasan bagi hasil dan konfirmasi ke masing-masing investor.
      </p>
    </div>
    <div style="padding:24px 32px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;">Investor</th>
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;">No. PKS</th>
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;">Periode</th>
            <th style="padding:10px 12px;text-align:right;color:#374151;font-weight:600;">Investasi</th>
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;">No. WA</th>
            <th style="padding:10px 12px;text-align:center;color:#374151;font-weight:600;">Status</th>
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

// ─── Email HTML: notifikasi untuk investor ─────────────────────────────────────

function buildInvestorEmailHtml(d: DueMou, date: string): string {
  return `
<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
    <div style="background:#16a34a;padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;">🔔 PKS Anda Mencapai Akhir Periode</h1>
      <p style="margin:6px 0 0;color:#bbf7d0;font-size:13px;">${date} · MinBun ERP</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 16px;font-size:15px;color:#111827;">
        Yth. <strong>${d.mou.investorName}</strong>,
      </p>
      <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
        Kami informasikan bahwa Perjanjian Kerja Sama (PKS) Anda berikut
        <strong>${dueLabel(d.daysOverdue).toLowerCase()}</strong>.
        Tim MinBun akan memproses pelunasan bagi hasil Anda.
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px;">
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;color:#6b7280;width:40%;">No. PKS</td>
          <td style="padding:10px 14px;font-weight:600;font-family:monospace;">${d.mou.customId}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#6b7280;border-top:1px solid #f3f4f6;">Periode Kontrak</td>
          <td style="padding:10px 14px;font-weight:600;border-top:1px solid #f3f4f6;">${fmtDate(d.mou.date)} — ${fmtDate(d.endDate)}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;color:#6b7280;">Nilai Investasi</td>
          <td style="padding:10px 14px;font-weight:700;color:#16a34a;font-size:15px;">${fmtRp(d.mou.investmentAmount)}</td>
        </tr>
      </table>

      <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
        Jika ada pertanyaan, silakan hubungi tim MinBun.<br>
        Terima kasih atas kepercayaan Anda.
      </p>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
        Email ini dikirim otomatis oleh MinBun ERP · Jangan membalas email ini
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Email HTML: notifikasi untuk broker ──────────────────────────────────────

function buildBrokerEmailHtml(d: DueMou, date: string): string {
  return `
<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
    <div style="background:#2563eb;padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;">🔔 PKS Klien Anda Mencapai Akhir Periode</h1>
      <p style="margin:6px 0 0;color:#bfdbfe;font-size:13px;">${date} · MinBun ERP</p>
    </div>
    <div style="padding:28px 32px;">
      <p style="margin:0 0 16px;font-size:15px;color:#111827;">
        Yth. <strong>${d.mou.brokerName ?? "Broker"}</strong>,
      </p>
      <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
        Kami informasikan bahwa Perjanjian Kerja Sama (PKS) klien Anda berikut
        <strong>${dueLabel(d.daysOverdue).toLowerCase()}</strong>.
        Tim MinBun akan memproses pelunasan bagi hasil.
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px;">
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;color:#6b7280;width:40%;">Investor</td>
          <td style="padding:10px 14px;font-weight:600;">${d.mou.investorName}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#6b7280;border-top:1px solid #f3f4f6;">No. PKS</td>
          <td style="padding:10px 14px;font-weight:600;font-family:monospace;border-top:1px solid #f3f4f6;">${d.mou.customId}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;color:#6b7280;">Periode Kontrak</td>
          <td style="padding:10px 14px;font-weight:600;">${fmtDate(d.mou.date)} — ${fmtDate(d.endDate)}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#6b7280;border-top:1px solid #f3f4f6;">Nilai Investasi</td>
          <td style="padding:10px 14px;font-weight:700;color:#2563eb;font-size:15px;border-top:1px solid #f3f4f6;">${fmtRp(d.mou.investmentAmount)}</td>
        </tr>
      </table>

      <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
        Jika ada pertanyaan, silakan hubungi tim MinBun.<br>
        Terima kasih atas kerjasamanya.
      </p>
    </div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
        Email ini dikirim otomatis oleh MinBun ERP · Jangan membalas email ini
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Email ────────────────────────────────────────────────────────────────────

function makeTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return { user, transporter: nodemailer.createTransport({ service: "gmail", auth: { user, pass } }) };
}

/** Email ringkasan ke admin (ADMIN_EMAIL, bisa multi dipisah koma). */
async function sendAdminEmail(dues: DueMou[], todayStr: string): Promise<ChannelStatus> {
  const t          = makeTransporter();
  const recipients = (process.env.ADMIN_EMAIL ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  if (!t || recipients.length === 0) return "skipped";

  await t.transporter.sendMail({
    from:    `"MinBun ERP" <${t.user}>`,
    to:      recipients.join(", "),
    subject: `[MinBun] 🔔 ${dues.length} PKS Mencapai Akhir Periode — ${todayStr}`,
    html:    buildAdminEmailHtml(dues, todayStr),
  });
  return "sent";
}

/** Email notifikasi ke broker untuk PKS kliennya. */
async function sendBrokerEmail(to: string, d: DueMou, todayStr: string): Promise<ChannelStatus> {
  const t = makeTransporter();
  if (!t || !to) return "skipped";

  await t.transporter.sendMail({
    from:    `"MinBun ERP" <${t.user}>`,
    to,
    subject: `[MinBun] 🔔 PKS Klien Anda (${d.mou.investorName}) Mencapai Akhir Periode — ${todayStr}`,
    html:    buildBrokerEmailHtml(d, todayStr),
  });
  return "sent";
}

/** Email notifikasi ke satu investor untuk PKS-nya. */
async function sendInvestorEmail(to: string, d: DueMou, todayStr: string): Promise<ChannelStatus> {
  const t = makeTransporter();
  if (!t || !to) return "skipped";

  await t.transporter.sendMail({
    from:    `"MinBun ERP" <${t.user}>`,
    to,
    subject: `[MinBun] 🔔 PKS ${d.mou.customId} Mencapai Akhir Periode — ${todayStr}`,
    html:    buildInvestorEmailHtml(d, todayStr),
  });
  return "sent";
}

// ─── WhatsApp via Fonnte (ke admin) ────────────────────────────────────────────

async function sendWhatsApp(dues: DueMou[], date: string): Promise<ChannelStatus> {
  const token      = process.env.FONNTE_TOKEN;
  const adminPhone = process.env.ADMIN_PHONE;
  if (!token || !adminPhone) return "skipped";

  const lines = [
    `🔔 *Reminder Akhir Periode PKS MinBun*`,
    `📅 ${date}`,
    ``,
    `${dues.length} PKS mencapai akhir periode:`,
    ``,
    ...dues.map((d, i) =>
      `${i + 1}. *${d.mou.investorName}*\n   PKS: ${d.mou.customId} · ${dueLabel(d.daysOverdue)}\n   Periode: ${fmtDate(d.mou.date)} — ${fmtDate(d.endDate)}\n   Investasi: ${fmtRp(d.mou.investmentAmount)}\n   WA: ${d.mou.investorPhone}`
    ),
    ``,
    `_Silakan proses pelunasan bagi hasil._`,
  ];

  const res = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: { Authorization: token },
    body: new URLSearchParams({
      target:      adminPhone,
      message:     lines.join("\n"),
      countryCode: "62",
    }),
  });
  if (!res.ok) throw new Error(`Fonnte HTTP ${res.status}`);
  return "sent";
}

// ─── Hasil ──────────────────────────────────────────────────────────────────

export interface ReminderResult {
  status: number;                 // HTTP status yang disarankan untuk route
  body: Record<string, unknown>;  // payload JSON
}

/**
 * Kirim reminder TEST — satu PKS dummy ke ADMIN_EMAIL. Tidak menyentuh DB.
 */
export async function runRemindersTest(): Promise<ReminderResult> {
  const todayStr = fmtDate(todayWibStr());
  const dummy: DueMou = {
    mou: {
      id: "pb-test-id", customId: "MOU-202505-001", date: "2025-03-01",
      investorId: "INV-0001", investorName: "Investor Test",
      investorPhone: "0812-3456-7890", investmentAmount: 50_000_000,
      contractPeriod: 90, isTerminated: false,
    },
    endDate: "2025-05-30", daysOverdue: 0,
  };
  const adminEmail    = await sendAdminEmail([dummy], `${todayStr} (TEST)`).catch(() => "failed" as ChannelStatus);
  const investorEmail = await sendInvestorEmail(process.env.ADMIN_EMAIL ?? "", dummy, `${todayStr} (TEST)`).catch(() => "failed" as ChannelStatus);
  const waStatus      = await sendWhatsApp([dummy], `${todayStr} (TEST)`).catch(() => "failed" as ChannelStatus);
  return { status: 200, body: { mode: "test", adminEmail, investorEmail, waStatus } };
}

/**
 * Jalankan pengiriman reminder akhir periode PKS.
 * Membuat koneksi PocketBase dengan service account sendiri (PB_SERVICE_*).
 *
 * @param triggeredBy "cron" (otomatis, dedup aktif) atau "manual" (boleh kirim ulang)
 */
export async function runReminders(triggeredBy: TriggeredBy): Promise<ReminderResult> {
  // Trim untuk menghindari spasi/newline yang sering ikut ter-paste saat mengisi
  // environment variable di dashboard (penyebab umum "Failed to authenticate").
  const serviceEmail    = process.env.PB_SERVICE_EMAIL?.trim();
  const servicePassword = process.env.PB_SERVICE_PASSWORD?.trim();
  if (!serviceEmail || !servicePassword) {
    return { status: 500, body: { error: "Service account tidak dikonfigurasi" } };
  }

  const pb = new PocketBase(process.env.NEXT_PUBLIC_PB_URL?.trim());

  // Autentikasi service account secara terpisah agar pesan error spesifik —
  // bukan "Internal error" yang menyamarkan masalah kredensial.
  try {
    await pb.collection("users").authWithPassword(serviceEmail, servicePassword);
  } catch (err) {
    console.error("[send-reminders] auth service account gagal", err);
    return {
      status: 401,
      body: {
        error: "Service account gagal login ke PocketBase",
        detail: "Periksa PB_SERVICE_EMAIL & PB_SERVICE_PASSWORD (pastikan tanpa spasi/newline, dan akun ada di koleksi 'users').",
      },
    };
  }

  try {
    const records = await pb.collection("mous").getFullList<MoURecord>({ sort: "date" });
    const dueMous = findDueMous(records);

    if (dueMous.length === 0) {
      return { status: 200, body: { sent: 0, message: "Tidak ada PKS yang mencapai akhir periode hari ini" } };
    }

    // Filter yang belum pernah dikirim (kecuali manual — boleh kirim ulang).
    // Dedup per PKS: hanya cek log reminder (cron/manual), bukan log "notifikasi"
    // dari notify-investor agar konfirmasi pembayaran tidak memblokir reminder
    // akhir periode yang merupakan notifikasi berbeda.
    const toSend: DueMou[] = [];
    if (triggeredBy === "manual") {
      toSend.push(...dueMous);
    } else {
      const alreadySentFlags = await Promise.all(
        dueMous.map((d) =>
          pb.collection("reminder_logs")
            .getList(1, 1, {
              filter: `mouCustomId = "${pbEsc(d.mou.customId)}" && (triggeredBy = "cron" || triggeredBy = "manual")`,
            })
            .then((r) => r.totalItems > 0)
            .catch(() => false),
        ),
      );
      dueMous.forEach((d, i) => {
        if (!alreadySentFlags[i]) toSend.push(d);
      });
    }

    if (toSend.length === 0) {
      return { status: 200, body: { sent: 0, message: "Semua reminder akhir periode hari ini sudah terkirim" } };
    }

    // Ambil email investor dari koleksi investors → map customId → email
    const investorEmailMap = new Map<string, string>();
    try {
      const investorIds = [...new Set(toSend.map((d) => d.mou.investorId))];
      const idFilter    = investorIds.map((id) => `customId = "${pbEsc(id)}"`).join(" || ");
      const invs        = await pb.collection("investors").getFullList({
        filter: idFilter,
        fields: "customId,email",
      });
      for (const inv of invs) {
        investorEmailMap.set(inv.customId as string, (inv.email as string) || "");
      }
    } catch { /* abaikan — email investor akan skipped */ }

    // Ambil email broker dari koleksi brokers → map customId → email
    const brokerEmailMap = new Map<string, string>();
    try {
      const brokerIds = [...new Set(
        toSend.map((d) => d.mou.brokerId).filter((id): id is string => !!id)
      )];
      if (brokerIds.length > 0) {
        const idFilter = brokerIds.map((id) => `customId = "${pbEsc(id)}"`).join(" || ");
        const brks     = await pb.collection("brokers").getFullList({
          filter: idFilter,
          fields: "customId,email",
        });
        for (const brk of brks) {
          brokerEmailMap.set(brk.customId as string, (brk.email as string) || "");
        }
      }
    } catch { /* abaikan — email broker akan skipped */ }

    const todayStr = fmtDate(todayWibStr());
    const errors: string[] = [];

    // Email ringkasan ke admin (sekali untuk semua PKS)
    const adminEmailStatus = await sendAdminEmail(toSend, todayStr).catch((e) => {
      errors.push(`Email admin: ${String(e)}`);
      return "failed" as ChannelStatus;
    });

    // WA ke admin (sekali untuk semua PKS)
    const waStatus = await sendWhatsApp(toSend, todayStr).catch((e) => {
      errors.push(`WA: ${String(e)}`);
      return "failed" as ChannelStatus;
    });

    // Email per investor + simpan log per PKS — dijalankan paralel agar tidak
    // timeout di Vercel saat banyak PKS berakhir bersamaan.
    // Error dikumpulkan per-PKS (bukan akumulatif) agar log setiap PKS hanya
    // mencatat error miliknya sendiri, bukan error dari iterasi sebelumnya.
    const results = await Promise.all(
      toSend.map(async (d) => {
        const perErrors: string[] = [];

        const investorEmail = investorEmailMap.get(d.mou.investorId) ?? "";
        const investorEmailStatus = await sendInvestorEmail(investorEmail, d, todayStr).catch((e) => {
          perErrors.push(String(e));
          return "failed" as ChannelStatus;
        });

        const brokerEmail = d.mou.brokerId ? (brokerEmailMap.get(d.mou.brokerId) ?? "") : "";
        const brokerEmailStatus = await sendBrokerEmail(brokerEmail, d, todayStr).catch((e) => {
          perErrors.push(String(e));
          return "failed" as ChannelStatus;
        });

        await pb.collection("reminder_logs").create({
          mouCustomId:       d.mou.customId,
          cycleNumber:       0,
          sentAt:            new Date().toISOString(),
          investorName:      d.mou.investorName,
          emailStatus:       investorEmailStatus,
          brokerEmailStatus,
          waStatus,
          errorMessage:      perErrors.join(" | "),
          triggeredBy,
        }).catch(() => {});
        return { investorEmailStatus, brokerEmailStatus, perErrors };
      }),
    );

    let investorSent = 0;
    let brokerSent   = 0;
    for (const r of results) {
      if (r.investorEmailStatus === "sent") investorSent++;
      if (r.brokerEmailStatus   === "sent") brokerSent++;
      if (r.perErrors.length) errors.push(...r.perErrors);
    }

    return {
      status: 200,
      body: {
        sent:               toSend.length,
        adminEmailStatus,
        investorEmailsSent: investorSent,
        brokerEmailsSent:   brokerSent,
        waStatus,
        errors:             errors.length ? errors : undefined,
        pks:                toSend.map((d) => ({
          name: d.mou.investorName, pks: d.mou.customId, endDate: d.endDate,
        })),
      },
    };

  } catch (err) {
    console.error("[send-reminders]", err);
    return { status: 500, body: { error: "Internal error", detail: String(err) } };
  }
}
