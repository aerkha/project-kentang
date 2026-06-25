// Logika inti reminder bagi hasil transaksi — dipakai bersama oleh:
//   - app/api/send-reminders   (cron Vercel, auth CRON_SECRET)
//   - app/api/trigger-reminder (tombol "Kirim Sekarang", auth admin PocketBase)
//
// Modul ini SERVER-ONLY. Jangan diimpor dari komponen client.

import PocketBase from "pocketbase";
import nodemailer from "nodemailer";

function pbEsc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ── Zona waktu aplikasi: WIB (UTC+7) ─────────────────────────────────────────

const WIB_OFFSET_MS = 7 * 3_600_000;

function todayWibStr(): string {
  return new Date(Date.now() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface TransaksiRecord {
  id:            string;   // PB internal id
  customId:      string;   // TRX-XXXX
  date:          string;
  status:        string;   // selesai | bermasalah
  bagiHasilDone: boolean;
}

interface InvestorEntry {
  investorId:   string;  // customId investor
  investorName: string;
  nilaiInvestasi: number;
}

interface PendingTransaksi {
  trx:           TransaksiRecord;
  investorNames: string[];  // nama-nama investor dalam transaksi ini
  totalInvestasi: number;
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

/**
 * Temukan semua transaksi yang statusnya selesai/bermasalah dan bagi hasilnya
 * belum lunas (bagiHasilDone = false).
 */
async function findPendingTransaksis(
  pb: PocketBase,
): Promise<PendingTransaksi[]> {
  const records = await pb.collection("transaksis").getFullList<TransaksiRecord>({
    filter: `(status = "selesai" || status = "bermasalah") && bagiHasilDone = false`,
    sort:   "date",
  });

  if (records.length === 0) return [];

  // Ambil investor entries untuk semua transaksi tersebut
  const trxPbIds = records.map((r) => `transaksiId = "${pbEsc(r.id)}"`).join(" || ");
  let entriesMap = new Map<string, InvestorEntry[]>();
  try {
    const entries = await pb.collection("transaksi_investors").getFullList<InvestorEntry & { transaksiId: string }>({
      filter: trxPbIds,
      fields: "transaksiId,investorId,investorName,nilaiInvestasi",
    });
    for (const e of entries) {
      const list = entriesMap.get(e.transaksiId) ?? [];
      list.push(e);
      entriesMap.set(e.transaksiId, list);
    }
  } catch { /* transaksi_investors belum ada atau kosong */ }

  return records.map((trx) => {
    const entries = entriesMap.get(trx.id) ?? [];
    return {
      trx,
      investorNames: [...new Set(entries.map((e) => e.investorName))],
      totalInvestasi: entries.reduce((s, e) => s + e.nilaiInvestasi, 0),
    };
  });
}

// ─── Email HTML: ringkasan untuk admin ─────────────────────────────────────────

function buildAdminEmailHtml(pendings: PendingTransaksi[], date: string): string {
  const rows = pendings.map((p) => `
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:10px 12px;font-family:monospace;font-weight:700;color:#111827;">${p.trx.customId}</td>
      <td style="padding:10px 12px;color:#6b7280;white-space:nowrap;">${fmtDate(p.trx.date)}</td>
      <td style="padding:10px 12px;">${p.investorNames.join(", ") || "—"}</td>
      <td style="padding:10px 12px;text-align:right;font-weight:600;">${p.totalInvestasi > 0 ? fmtRp(p.totalInvestasi) : "—"}</td>
      <td style="padding:10px 12px;text-align:center;color:#dc2626;font-weight:600;white-space:nowrap;">
        ${p.trx.status === "bermasalah" ? "Bermasalah" : "Selesai"}
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
      <h1 style="margin:0;color:#fff;font-size:22px;">🔔 Reminder Bagi Hasil Pending</h1>
      <p style="margin:6px 0 0;color:#bbf7d0;font-size:14px;">${date} · MinBun ERP</p>
    </div>
    <div style="padding:24px 32px;background:#f0fdf4;border-bottom:1px solid #dcfce7;">
      <p style="margin:0;font-size:15px;color:#15803d;">
        <strong>${pendings.length} transaksi</strong> memiliki bagi hasil yang belum dibayarkan.
        Silakan proses pelunasan melalui halaman Reminder.
      </p>
    </div>
    <div style="padding:24px 32px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;">No. TRX</th>
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;">Tanggal</th>
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;">Investor</th>
            <th style="padding:10px 12px;text-align:right;color:#374151;font-weight:600;">Total Modal</th>
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

// ─── Email ────────────────────────────────────────────────────────────────────

function makeTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return { user, transporter: nodemailer.createTransport({ service: "gmail", auth: { user, pass } }) };
}

async function sendAdminEmail(pendings: PendingTransaksi[], todayStr: string): Promise<ChannelStatus> {
  const t          = makeTransporter();
  const recipients = (process.env.ADMIN_EMAIL ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  if (!t || recipients.length === 0) return "skipped";

  await t.transporter.sendMail({
    from:    `"MinBun ERP" <${t.user}>`,
    to:      recipients.join(", "),
    subject: `[MinBun] 🔔 ${pendings.length} Transaksi Menunggu Bagi Hasil — ${todayStr}`,
    html:    buildAdminEmailHtml(pendings, todayStr),
  });
  return "sent";
}

// ─── WhatsApp via Fonnte (ke admin) ────────────────────────────────────────────

async function sendWhatsApp(pendings: PendingTransaksi[], date: string): Promise<ChannelStatus> {
  const token      = process.env.FONNTE_TOKEN;
  const adminPhone = process.env.ADMIN_PHONE;
  if (!token || !adminPhone) return "skipped";

  const lines = [
    `🔔 *Reminder Bagi Hasil Pending — MinBun*`,
    `📅 ${date}`,
    ``,
    `${pendings.length} transaksi menunggu pembayaran bagi hasil:`,
    ``,
    ...pendings.map((p, i) => {
      const investors = p.investorNames.join(", ") || "—";
      return `${i + 1}. *${p.trx.customId}* — ${fmtDate(p.trx.date)}\n   Investor: ${investors}${p.totalInvestasi > 0 ? `\n   Modal: ${fmtRp(p.totalInvestasi)}` : ""}`;
    }),
    ``,
    `_Silakan proses pelunasan bagi hasil melalui halaman Reminder._`,
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
  status: number;
  body:   Record<string, unknown>;
}

/**
 * Kirim reminder TEST — satu transaksi dummy ke ADMIN_EMAIL. Tidak menyentuh DB.
 */
export async function runRemindersTest(): Promise<ReminderResult> {
  const todayStr = fmtDate(todayWibStr());
  const dummy: PendingTransaksi = {
    trx: {
      id: "pb-test-id", customId: "TRX-0001", date: "2026-05-15",
      status: "selesai", bagiHasilDone: false,
    },
    investorNames:  ["Investor Test"],
    totalInvestasi: 50_000_000,
  };
  const adminEmail = await sendAdminEmail([dummy], `${todayStr} (TEST)`).catch(() => "failed" as ChannelStatus);
  const waStatus   = await sendWhatsApp([dummy], `${todayStr} (TEST)`).catch(() => "failed" as ChannelStatus);
  return { status: 200, body: { mode: "test", adminEmail, waStatus } };
}

/**
 * Jalankan pengiriman reminder transaksi dengan bagi hasil pending.
 *
 * @param triggeredBy "cron" (otomatis, dedup aktif) atau "manual" (boleh kirim ulang)
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
      body: {
        error:  "Service account gagal login ke PocketBase",
        detail: "Periksa PB_SERVICE_EMAIL & PB_SERVICE_PASSWORD (pastikan tanpa spasi/newline, dan akun ada di koleksi 'users').",
      },
    };
  }

  try {
    const allPending = await findPendingTransaksis(pb);

    if (allPending.length === 0) {
      return { status: 200, body: { sent: 0, message: "Tidak ada transaksi dengan bagi hasil pending hari ini" } };
    }

    // Untuk cron: filter yang belum pernah dikirim reminder sebelumnya.
    // Dedup per transaksiId (disimpan di field mouCustomId di reminder_logs).
    const toSend: PendingTransaksi[] = [];
    if (triggeredBy === "manual") {
      toSend.push(...allPending);
    } else {
      const sentFlags = await Promise.all(
        allPending.map((p) =>
          pb.collection("reminder_logs")
            .getList(1, 1, {
              filter: `mouCustomId = "${pbEsc(p.trx.customId)}" && (triggeredBy = "cron" || triggeredBy = "manual")`,
            })
            .then((r) => r.totalItems > 0)
            .catch(() => false),
        ),
      );
      allPending.forEach((p, i) => {
        if (!sentFlags[i]) toSend.push(p);
      });
    }

    if (toSend.length === 0) {
      return { status: 200, body: { sent: 0, message: "Semua reminder bagi hasil hari ini sudah terkirim" } };
    }

    const todayStr = fmtDate(todayWibStr());
    const errors: string[] = [];

    // Email ringkasan ke admin (sekali untuk semua transaksi)
    const adminEmailStatus = await sendAdminEmail(toSend, todayStr).catch((e) => {
      errors.push(`Email admin: ${String(e)}`);
      return "failed" as ChannelStatus;
    });

    // WA ke admin (sekali untuk semua transaksi)
    const waStatus = await sendWhatsApp(toSend, todayStr).catch((e) => {
      errors.push(`WA: ${String(e)}`);
      return "failed" as ChannelStatus;
    });

    // Simpan log per transaksi
    await Promise.all(
      toSend.map((p) =>
        pb.collection("reminder_logs").create({
          mouCustomId:  p.trx.customId,   // field lama dipakai untuk transaksiId
          cycleNumber:  0,
          sentAt:       new Date().toISOString(),
          investorName: p.investorNames.join(", ") || "",
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
        transaksis:       toSend.map((p) => ({ id: p.trx.customId, date: p.trx.date, status: p.trx.status })),
      },
    };

  } catch (err) {
    console.error("[send-reminders]", err);
    return { status: 500, body: { error: "Internal error", detail: String(err) } };
  }
}
