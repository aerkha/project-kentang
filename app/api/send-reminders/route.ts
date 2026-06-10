import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import nodemailer from "nodemailer";

function pbEsc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

// ── Zona waktu aplikasi: WIB (UTC+7) ─────────────────────────────────────────
// Server (Vercel) berjalan di UTC — semua "hari ini" dihitung dari kalender WIB
// agar konsisten dengan client.

const WIB_OFFSET_MS = 7 * 3_600_000;

/** Tanggal kalender WIB hari ini sebagai "YYYY-MM-DD" */
function todayWibStr(): string {
  return new Date(Date.now() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Parse "YYYY-MM-DD" ke epoch ms pada UTC midnight (untuk aritmetika hari) */
function dateUtcMs(s: string): number {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MoURecord {
  id: string;
  customId: string;
  date: string;
  investorId: string;
  investorName: string;
  investorPhone: string;
  investmentAmount: number;
  contractPeriod: number;
  isTerminated: boolean;
}

// ─── Expired PKS helpers ──────────────────────────────────────────────────────

function isMouExpiredNatural(mou: MoURecord): boolean {
  if (mou.isTerminated) return false;
  // mou.date dari PocketBase bisa berformat "YYYY-MM-DD HH:mm:ss" — ambil tanggalnya saja
  const end = addDays(mou.date.slice(0, 10), mou.contractPeriod);
  return end < todayWibStr(); // perbandingan string "YYYY-MM-DD" aman
}

async function recordExpiredReturns(pb: PocketBase, mous: MoURecord[]): Promise<number> {
  const expired = mous.filter(isMouExpiredNatural);
  let recorded = 0;
  for (const mou of expired) {
    const tag = `[Modal-Kembali:${mou.investorId}:${mou.customId}]`;
    try {
      // Hanya catat pengembalian jika modal PKS ini pernah dicatat digunakan —
      // PKS pending yang expired tanpa pernah aktif tidak boleh menghasilkan
      // pemasukan (guard yang sama dengan recordModalPksDiKembalikan di client).
      const usedTag = `[Modal-PKS:${mou.investorId}:${mou.customId}]`;
      const used = await pb.collection("pengeluarans").getList(1, 1, {
        filter: `catatan ~ "${pbEsc(usedTag)}"`,
        fields: "id",
      });
      if (used.totalItems === 0) continue;

      const existing = await pb.collection("pengeluarans").getList(1, 1, {
        filter: `catatan ~ "${pbEsc(tag)}"`,
        fields: "id",
      });
      if (existing.totalItems > 0) continue;

      // Generate PGL ID
      const today = todayWibStr();
      const ym = today.slice(0, 7).replace("-", "");
      const prefix = `PGL-${ym}-`;
      const existing2 = await pb.collection("pengeluarans").getFullList({
        filter: `customId ~ "${prefix}"`,
        fields: "customId",
      });
      const max = existing2.reduce((m, r) => {
        const n = parseInt((r.customId as string).slice(prefix.length)) || 0;
        return n > m ? n : m;
      }, 0);
      const customId = `${prefix}${String(max + 1).padStart(3, "0")}`;

      await pb.collection("pengeluarans").create({
        customId,
        date:      today,
        deskripsi: `Modal Dikembalikan — ${mou.customId} (${mou.investorName})`,
        debet:     mou.investmentAmount,
        kredit:    0,
        catatan:   tag,
      });
      recorded++;
    } catch (e) {
      console.warn(`[send-reminders] gagal catat modal kembali ${mou.customId}:`, e);
    }
  }
  return recorded;
}

interface DueCycle {
  mou: MoURecord;
  cycleNumber: number;
  cycleStart: string;
  cycleEnd: string;
  daysOverdue: number;
}

type ChannelStatus = "sent" | "failed" | "skipped";

interface SendResult {
  emailStatus:   ChannelStatus;
  waStatus:      ChannelStatus;
  errorMessage:  string;
}

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

/**
 * Temukan semua siklus 30 hari yang jatuh tempo hari ini ATAU dalam 3 hari terakhir.
 *
 * Window catch-up 3 hari mencegah siklus terlewat jika cron gagal berjalan
 * tepat di hari jatuh tempo. Duplikasi dicegah oleh pengecekan reminder_logs
 * di handler — siklus yang sudah pernah dikirim tidak akan dikirim ulang.
 */
function findDueCycles(mous: MoURecord[]): DueCycle[] {
  // Seluruh aritmetika hari memakai UTC midnight dari tanggal kalender WIB —
  // bebas dari zona waktu server.
  const todayMs = dateUtcMs(todayWibStr());
  const result: DueCycle[] = [];

  for (const mou of mous) {
    if (mou.isTerminated) continue;

    const startMs = dateUtcMs(mou.date.slice(0, 10));

    const daysSinceStart = Math.round((todayMs - startMs) / 86_400_000);
    if (daysSinceStart < 30) continue;

    // Siklus yang sedang aktif = kelipatan 30 sebelum atau tepat hari ini
    // Catch-up window 3 hari: hari ke-30..32, 60..62, 90..92, dst.
    const cycleNumber   = Math.floor(daysSinceStart / 30);
    const daysIntoCycle = daysSinceStart % 30;        // 0 = tepat jatuh tempo, 1-2 = catch-up
    if (daysIntoCycle >= 3) continue;                 // di luar window catch-up

    // Jangan kirim reminder untuk siklus yang melewati batas kontrak
    // mis. contractPeriod=60 → hanya siklus 1 (hari 30) dan 2 (hari 60) yang valid
    if (cycleNumber * 30 > mou.contractPeriod) continue;

    const cycleStart  = addDays(mou.date, (cycleNumber - 1) * 30);
    const cycleEnd    = addDays(mou.date, cycleNumber * 30);
    const daysOverdue = Math.round((todayMs - dateUtcMs(cycleEnd)) / 86_400_000);

    result.push({ mou, cycleNumber, cycleStart, cycleEnd, daysOverdue });
  }

  return result;
}

// ─── Email HTML ───────────────────────────────────────────────────────────────

function buildEmailHtml(cycles: DueCycle[], date: string): string {
  const rows = cycles.map((c) => `
    <tr style="border-bottom:1px solid #e5e7eb;">
      <td style="padding:10px 12px;font-weight:600;">${c.mou.investorName}</td>
      <td style="padding:10px 12px;font-family:monospace;color:#6b7280;">${c.mou.customId}</td>
      <td style="padding:10px 12px;text-align:center;">ke-${c.cycleNumber}</td>
      <td style="padding:10px 12px;color:#6b7280;white-space:nowrap;">
        ${fmtDate(c.cycleStart)} — ${fmtDate(c.cycleEnd)}
      </td>
      <td style="padding:10px 12px;text-align:right;font-weight:600;">
        ${fmtRp(c.mou.investmentAmount)}
      </td>
      <td style="padding:10px 12px;color:#6b7280;">${c.mou.investorPhone}</td>
    </tr>
  `).join("");

  return `
<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:700px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
    <div style="background:#16a34a;padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:22px;">🔔 Reminder Bagi Hasil Investor</h1>
      <p style="margin:6px 0 0;color:#bbf7d0;font-size:14px;">${date} · MinBun ERP</p>
    </div>
    <div style="padding:24px 32px;background:#f0fdf4;border-bottom:1px solid #dcfce7;">
      <p style="margin:0;font-size:15px;color:#15803d;">
        <strong>${cycles.length} investor</strong> memiliki bagi hasil yang jatuh tempo hari ini.
        Silakan proses pembayaran dan konfirmasi ke masing-masing investor.
      </p>
    </div>
    <div style="padding:24px 32px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;">Investor</th>
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;">No. PKS</th>
            <th style="padding:10px 12px;text-align:center;color:#374151;font-weight:600;">Siklus</th>
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;">Periode</th>
            <th style="padding:10px 12px;text-align:right;color:#374151;font-weight:600;">Investasi</th>
            <th style="padding:10px 12px;text-align:left;color:#374151;font-weight:600;">No. WA</th>
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

async function sendEmail(cycles: DueCycle[], todayStr: string): Promise<ChannelStatus> {
  const user       = process.env.GMAIL_USER;
  const pass       = process.env.GMAIL_APP_PASSWORD;
  const recipients = (process.env.ADMIN_EMAIL ?? "").split(",").map((e) => e.trim()).filter(Boolean);

  if (!user || !pass || recipients.length === 0) return "skipped";

  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await transporter.sendMail({
    from:    `"MinBun ERP" <${user}>`,
    to:      recipients.join(", "),
    subject: `[MinBun] 🔔 ${cycles.length} Investor Jatuh Tempo Bagi Hasil — ${todayStr}`,
    html:    buildEmailHtml(cycles, todayStr),
  });
  return "sent";
}

// ─── WhatsApp via Fonnte ──────────────────────────────────────────────────────

async function sendWhatsApp(cycles: DueCycle[], date: string): Promise<ChannelStatus> {
  const token      = process.env.FONNTE_TOKEN;
  const adminPhone = process.env.ADMIN_PHONE;
  if (!token || !adminPhone) return "skipped";

  const lines = [
    `🔔 *Reminder Bagi Hasil MinBun*`,
    `📅 ${date}`,
    ``,
    `${cycles.length} investor jatuh tempo hari ini:`,
    ``,
    ...cycles.map((c, i) =>
      `${i + 1}. *${c.mou.investorName}*\n   PKS: ${c.mou.customId} · Siklus ke-${c.cycleNumber}\n   Investasi: ${fmtRp(c.mou.investmentAmount)}\n   WA: ${c.mou.investorPhone}`
    ),
    ``,
    `_Silakan proses pembayaran bagi hasil._`,
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

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const isTest      = req.nextUrl.searchParams.get("test") === "true";
  const triggeredBy = req.nextUrl.searchParams.get("manual") === "true" ? "manual" : "cron";

  // ── Mode test ──
  if (isTest) {
    const todayStr = fmtDate(todayWibStr());
    const dummy: DueCycle[] = [{
      mou: {
        id: "pb-test-id", customId: "MOU-202505-001", date: "2025-04-01",
        investorId: "INV-0001", investorName: "Investor Test",
        investorPhone: "0812-3456-7890", investmentAmount: 50_000_000,
        contractPeriod: 90, isTerminated: false,
      },
      cycleNumber: 1, cycleStart: "2025-04-01", cycleEnd: "2025-05-01", daysOverdue: 0,
    }];
    const emailStatus = await sendEmail(dummy, `${todayStr} (TEST)`).catch(() => "failed" as ChannelStatus);
    const waStatus    = await sendWhatsApp(dummy, `${todayStr} (TEST)`).catch(() => "failed" as ChannelStatus);
    return NextResponse.json({ mode: "test", emailStatus, waStatus });
  }

  const serviceEmail    = process.env.PB_SERVICE_EMAIL;
  const servicePassword = process.env.PB_SERVICE_PASSWORD;
  if (!serviceEmail || !servicePassword) {
    return NextResponse.json({ error: "Service account tidak dikonfigurasi" }, { status: 500 });
  }

  try {
    const pb = new PocketBase(process.env.NEXT_PUBLIC_PB_URL);
    await pb.collection("users").authWithPassword(serviceEmail, servicePassword);

    const records    = await pb.collection("mous").getFullList<MoURecord>({ sort: "date" });

    // Catat pengembalian modal untuk PKS yang expired secara alami (tidak perlu di mode test)
    const modalKembaliCount = await recordExpiredReturns(pb, records);

    const dueCycles  = findDueCycles(records);

    if (dueCycles.length === 0) {
      return NextResponse.json({
        sent: 0,
        message: "Tidak ada yang jatuh tempo hari ini",
        modalKembali: modalKembaliCount,
      });
    }

    // Filter yang belum pernah dikirim (kecuali manual — boleh kirim ulang).
    // Semua cek dilakukan paralel agar tidak timeout jika ada banyak siklus jatuh tempo.
    const toSend: DueCycle[] = [];
    if (triggeredBy === "manual") {
      toSend.push(...dueCycles);
    } else {
      const alreadySentFlags = await Promise.all(
        dueCycles.map((cycle) =>
          pb.collection("reminder_logs")
            .getList(1, 1, {
              filter: `mouCustomId = "${pbEsc(cycle.mou.customId)}" && cycleNumber = ${cycle.cycleNumber} && triggeredBy = "cron"`,
            })
            .then((r) => r.totalItems > 0)
            .catch(() => false),
        ),
      );
      dueCycles.forEach((cycle, i) => {
        if (!alreadySentFlags[i]) toSend.push(cycle);
      });
    }

    if (toSend.length === 0) {
      return NextResponse.json({ sent: 0, message: "Semua reminder hari ini sudah terkirim" });
    }

    const todayStr = fmtDate(todayWibStr());
    const errors: string[] = [];

    // Kirim email
    const emailStatus = await sendEmail(toSend, todayStr).catch((e) => {
      errors.push(`Email: ${String(e)}`);
      return "failed" as ChannelStatus;
    });

    // Kirim WA
    const waStatus = await sendWhatsApp(toSend, todayStr).catch((e) => {
      errors.push(`WA: ${String(e)}`);
      return "failed" as ChannelStatus;
    });

    // Simpan log per siklus
    for (const cycle of toSend) {
      await pb.collection("reminder_logs").create({
        mouCustomId:  cycle.mou.customId,
        cycleNumber:  cycle.cycleNumber,
        sentAt:       new Date().toISOString(),
        investorName: cycle.mou.investorName,
        emailStatus,
        waStatus,
        errorMessage: errors.join(" | "),
        triggeredBy,
      }).catch(() => {});
    }

    return NextResponse.json({
      sent:        toSend.length,
      emailStatus,
      waStatus,
      modalKembali: modalKembaliCount,
      errors:      errors.length ? errors : undefined,
      investors:   toSend.map((c) => ({
        name: c.mou.investorName, pks: c.mou.customId, cycle: c.cycleNumber,
      })),
    });

  } catch (err) {
    console.error("[send-reminders]", err);
    return NextResponse.json({ error: "Internal error", detail: String(err) }, { status: 500 });
  }
}
