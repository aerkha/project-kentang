import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import nodemailer from "nodemailer";

/**
 * POST /api/notify-investor
 *
 * Kirim notifikasi ke investor bahwa bagi hasilnya sudah dibayar.
 * Body: { mouId, keterangan, investorId, jumlah, buktiUrl, mouCustomId }
 * Auth : Authorization: Bearer <pb_token>
 */

interface NotifyBody {
  mouCustomId:  string;
  keterangan:   string;
  investorId:   string;
  jumlah:       number;
  buktiUrl:     string;
}

type ChannelStatus = "sent" | "failed" | "skipped";

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

// ── Email HTML ────────────────────────────────────────────────────────────────

function buildEmailHtml(opts: {
  investorName: string;
  mouCustomId:  string;
  keterangan:   string;
  jumlah:       number;
  buktiUrl:     string;
  tanggal:      string;
}): string {
  const { investorName, mouCustomId, keterangan, jumlah, buktiUrl, tanggal } = opts;
  return `
<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">

    <div style="background:#16a34a;padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;">✅ Konfirmasi Pembayaran Bagi Hasil</h1>
      <p style="margin:6px 0 0;color:#bbf7d0;font-size:13px;">${tanggal} · MinBun ERP</p>
    </div>

    <div style="padding:28px 32px;">
      <p style="margin:0 0 16px;font-size:15px;color:#111827;">
        Yth. <strong>${investorName}</strong>,
      </p>
      <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
        Kami ingin memberitahukan bahwa bagi hasil Anda telah berhasil dibayarkan.
        Berikut detailnya:
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;color:#6b7280;width:40%;">No. PKS</td>
          <td style="padding:10px 14px;font-weight:600;font-family:monospace;">${mouCustomId}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#6b7280;border-top:1px solid #f3f4f6;">Jenis Bagi Hasil</td>
          <td style="padding:10px 14px;font-weight:600;border-top:1px solid #f3f4f6;">${keterangan}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;color:#6b7280;">Jumlah</td>
          <td style="padding:10px 14px;font-weight:700;color:#16a34a;font-size:15px;">${fmtRp(jumlah)}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#6b7280;border-top:1px solid #f3f4f6;">Tanggal Bayar</td>
          <td style="padding:10px 14px;border-top:1px solid #f3f4f6;">${tanggal}</td>
        </tr>
      </table>

      ${buktiUrl ? `
      <div style="text-align:center;margin:24px 0;">
        <a href="${buktiUrl}"
          style="display:inline-block;background:#16a34a;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">
          📎 Lihat Bukti Transfer
        </a>
      </div>` : ""}

      <p style="margin:20px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
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

// ── WhatsApp message ──────────────────────────────────────────────────────────

function buildWaMessage(opts: {
  investorName: string;
  mouCustomId:  string;
  keterangan:   string;
  jumlah:       number;
  buktiUrl:     string;
  tanggal:      string;
}): string {
  const { investorName, mouCustomId, keterangan, jumlah, buktiUrl, tanggal } = opts;
  const lines = [
    `✅ *Konfirmasi Pembayaran Bagi Hasil*`,
    ``,
    `Yth. *${investorName}*,`,
    ``,
    `Bagi hasil Anda telah berhasil dibayarkan:`,
    ``,
    `📋 No. PKS   : ${mouCustomId}`,
    `📂 Jenis     : ${keterangan}`,
    `💰 Jumlah    : *${fmtRp(jumlah)}*`,
    `📅 Tgl Bayar : ${tanggal}`,
  ];
  if (buktiUrl) {
    lines.push(``, `📎 Bukti Transfer:`, buktiUrl);
  }
  lines.push(``, `Terima kasih atas kepercayaan Anda. 🙏`, `_— Tim MinBun_`);
  return lines.join("\n");
}

// ── Kirim Email ───────────────────────────────────────────────────────────────

async function sendEmail(to: string, opts: Parameters<typeof buildEmailHtml>[0]): Promise<ChannelStatus> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass || !to) return "skipped";

  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await transporter.sendMail({
    from:    `"MinBun ERP" <${user}>`,
    to,
    subject: `[MinBun] ✅ Konfirmasi Bagi Hasil ${opts.keterangan} — ${opts.mouCustomId}`,
    html:    buildEmailHtml(opts),
  });
  return "sent";
}

// ── Kirim WhatsApp ────────────────────────────────────────────────────────────

async function sendWhatsApp(phone: string, opts: Parameters<typeof buildWaMessage>[0]): Promise<ChannelStatus> {
  const token = process.env.FONNTE_TOKEN;
  if (!token || !phone) return "skipped";

  // Normalkan nomor: 08xx → 628xx
  const normalized = phone.replace(/^0/, "62").replace(/\D/g, "");
  const res = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: { Authorization: token },
    body: new URLSearchParams({
      target:      normalized,
      message:     buildWaMessage(opts),
      countryCode: "62",
    }),
  });
  if (!res.ok) throw new Error(`Fonnte HTTP ${res.status}`);
  return "sent";
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Verifikasi PocketBase token
  const authHeader = req.headers.get("authorization");
  const pbToken    = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!pbToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pb = new PocketBase(process.env.NEXT_PUBLIC_PB_URL);
    pb.authStore.save(pbToken, null);
    await pb.collection("users").authRefresh();
  } catch {
    return NextResponse.json({ error: "Token tidak valid" }, { status: 401 });
  }

  // 2. Parse body
  let body: NotifyBody;
  try {
    body = await req.json() as NotifyBody;
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const { mouCustomId, keterangan, investorId, jumlah, buktiUrl } = body;
  if (!mouCustomId || !keterangan || !investorId) {
    return NextResponse.json({ error: "Field wajib kurang" }, { status: 400 });
  }

  // 3. Ambil data investor dari PocketBase
  const pb2 = new PocketBase(process.env.NEXT_PUBLIC_PB_URL);
  pb2.authStore.save(pbToken, null);

  let investorPhone = "";
  let investorEmail = "";
  let investorName  = "";

  try {
    const inv = await pb2.collection("investors").getFirstListItem(
      `customId = "${investorId}"`,
      { fields: "name,phone,email" }
    );
    investorName  = (inv.name  as string) || "";
    investorPhone = (inv.phone as string) || "";
    investorEmail = (inv.email as string) || "";
  } catch {
    return NextResponse.json({ error: `Investor "${investorId}" tidak ditemukan` }, { status: 404 });
  }

  const tanggal = fmtDate(new Date().toISOString().slice(0, 10));
  const msgOpts = { investorName, mouCustomId, keterangan, jumlah, buktiUrl, tanggal };
  const errors: string[] = [];

  // 4. Kirim WA ke investor
  const waStatus = await sendWhatsApp(investorPhone, msgOpts).catch((e) => {
    errors.push(`WA: ${String(e)}`);
    return "failed" as ChannelStatus;
  });

  // 5. Kirim email ke investor
  const emailStatus = await sendEmail(investorEmail, msgOpts).catch((e) => {
    errors.push(`Email: ${String(e)}`);
    return "failed" as ChannelStatus;
  });

  return NextResponse.json({
    waStatus,
    emailStatus,
    errors: errors.length ? errors : undefined,
  });
}
