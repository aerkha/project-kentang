import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import nodemailer from "nodemailer";

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

interface DueCycle {
  mou: MoURecord;
  cycleNumber: number;
  cycleStart: string;
  cycleEnd: string;
  daysOverdue: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS_ID = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

function fmtDate(s: string) {
  const d = new Date(s);
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0,
  }).format(n);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Temukan semua siklus 30 hari yang jatuh tempo hari ini atau terlewat */
function findDueCycles(mous: MoURecord[]): DueCycle[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result: DueCycle[] = [];

  for (const mou of mous) {
    if (mou.isTerminated) continue;

    const start = new Date(mou.date);
    start.setHours(0, 0, 0, 0);

    const daysSinceStart = Math.floor(
      (today.getTime() - start.getTime()) / 86_400_000,
    );
    if (daysSinceStart < 30) continue;

    // Hanya siklus yang tepat jatuh tempo hari ini (bukan semua masa lalu)
    // daysSinceStart % 30 === 0 berarti tepat kelipatan 30 hari
    if (daysSinceStart % 30 !== 0) continue;

    const cycleNumber = daysSinceStart / 30;
    const cycleStart  = addDays(mou.date, (cycleNumber - 1) * 30);
    const cycleEnd    = addDays(mou.date, cycleNumber * 30);
    const dueDate     = new Date(cycleEnd);
    dueDate.setHours(0, 0, 0, 0);
    const daysOverdue = Math.floor(
      (today.getTime() - dueDate.getTime()) / 86_400_000,
    );

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

    <!-- Header -->
    <div style="background:#16a34a;padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:22px;">🔔 Reminder Bagi Hasil Investor</h1>
      <p style="margin:6px 0 0;color:#bbf7d0;font-size:14px;">${date} · MinBun ERP</p>
    </div>

    <!-- Summary -->
    <div style="padding:24px 32px;background:#f0fdf4;border-bottom:1px solid #dcfce7;">
      <p style="margin:0;font-size:15px;color:#15803d;">
        <strong>${cycles.length} investor</strong> memiliki bagi hasil yang jatuh tempo hari ini.
        Silakan proses pembayaran dan konfirmasi ke masing-masing investor.
      </p>
    </div>

    <!-- Table -->
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

    <!-- Footer -->
    <div style="padding:20px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:12px;color:#9ca3af;text-align:center;">
        Email ini dikirim otomatis oleh MinBun ERP · Jangan membalas email ini
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Nodemailer transporter ───────────────────────────────────────────────────

function createTransporter() {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
}

async function sendEmail(cycles: DueCycle[], todayStr: string): Promise<void> {
  const transporter = createTransporter();
  const recipients  = (process.env.ADMIN_EMAIL ?? "")
    .split(",").map((e) => e.trim()).filter(Boolean);

  await transporter.sendMail({
    from:    `"MinBun ERP" <${process.env.GMAIL_USER}>`,
    to:      recipients.join(", "),
    subject: `[MinBun] 🔔 ${cycles.length} Investor Jatuh Tempo Bagi Hasil — ${todayStr}`,
    html:    buildEmailHtml(cycles, todayStr),
  });
}

// ─── WA via Fonnte ────────────────────────────────────────────────────────────

async function sendWhatsApp(cycles: DueCycle[], date: string): Promise<void> {
  const token       = process.env.FONNTE_TOKEN;
  const adminPhone  = process.env.ADMIN_PHONE;
  if (!token || !adminPhone) return; // WA tidak dikonfigurasi, lewati

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

  await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: { Authorization: token },
    body: new URLSearchParams({
      target:      adminPhone,
      message:     lines.join("\n"),
      countryCode: "62",
    }),
  });
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Verifikasi secret — Vercel Cron menyertakan header ini otomatis
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Mode test: kirim email contoh tanpa cek PocketBase ──
  const isTest = req.nextUrl.searchParams.get("test") === "true";
  if (isTest) {
    try {
      const todayStr = fmtDate(new Date().toISOString().slice(0, 10));
      const dummy: DueCycle[] = [{
        mou: {
          id: "pb-test-id",
          customId: "MOU-202505-001",
          date: "2025-04-01",
          investorId: "INV-0001",
          investorName: "Investor Test",
          investorPhone: "0812-3456-7890",
          investmentAmount: 50_000_000,
          contractPeriod: 90,
          isTerminated: false,
        },
        cycleNumber:   1,
        cycleStart:    "2025-04-01",
        cycleEnd:      "2025-05-01",
        daysOverdue:   0,
      }];

      await sendEmail(dummy, `${todayStr} (TEST)`);
      return NextResponse.json({ mode: "test", status: "email sent" });
    } catch (err) {
      return NextResponse.json({ mode: "test", error: String(err) }, { status: 500 });
    }
  }

  try {
    // ── Koneksi ke PocketBase ──
    const pb = new PocketBase(process.env.NEXT_PUBLIC_PB_URL);
    await pb.collection("users").authWithPassword(
      process.env.PB_SERVICE_EMAIL!,
      process.env.PB_SERVICE_PASSWORD!,
    );

    // ── Ambil semua MoU ──
    const records = await pb.collection("mous").getFullList<MoURecord>({
      sort: "date",
    });

    // ── Cari yang jatuh tempo hari ini ──
    const dueCycles = findDueCycles(records);
    if (dueCycles.length === 0) {
      return NextResponse.json({ sent: 0, message: "Tidak ada yang jatuh tempo hari ini" });
    }

    // ── Filter yang belum pernah dikirim ──
    const toSend: DueCycle[] = [];
    for (const cycle of dueCycles) {
      const existing = await pb.collection("reminder_logs")
        .getList(1, 1, {
          filter: `mouCustomId = "${cycle.mou.customId}" && cycleNumber = ${cycle.cycleNumber}`,
        })
        .catch(() => ({ totalItems: 0 })); // koleksi belum dibuat = anggap belum ada log

      if (existing.totalItems === 0) {
        toSend.push(cycle);
      }
    }

    if (toSend.length === 0) {
      return NextResponse.json({ sent: 0, message: "Semua reminder hari ini sudah terkirim sebelumnya" });
    }

    const todayStr = fmtDate(new Date().toISOString().slice(0, 10));

    // ── Kirim Email via Gmail ──
    await sendEmail(toSend, todayStr);

    // ── Kirim WA via Fonnte (jika dikonfigurasi) ──
    await sendWhatsApp(toSend, todayStr);

    // ── Simpan log ──
    for (const cycle of toSend) {
      await pb.collection("reminder_logs")
        .create({
          mouCustomId:  cycle.mou.customId,
          cycleNumber:  cycle.cycleNumber,
          sentAt:       new Date().toISOString(),
          investorName: cycle.mou.investorName,
        })
        .catch(() => {}); // jika koleksi belum ada, lewati
    }

    return NextResponse.json({
      sent:     toSend.length,
      investors: toSend.map((c) => ({ name: c.mou.investorName, pks: c.mou.customId, cycle: c.cycleNumber })),
    });

  } catch (err) {
    console.error("[send-reminders]", err);
    return NextResponse.json(
      { error: "Internal error", detail: String(err) },
      { status: 500 },
    );
  }
}
