import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import nodemailer from "nodemailer";
import { isSameOriginRequest } from "@/lib/pb-error";

function fmtRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0,
  }).format(n);
}

function fmtDate(s: string) {
  const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni",
                  "Juli","Agustus","September","Oktober","November","Desember"];
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

type ChannelStatus = "sent" | "failed" | "skipped";

export interface NotifyOwnerBody {
  type: "new_investor" | "top_up";
  investorId:   string;
  investorName: string;
  amount:       number;       // nilai investasi baru atau nominal top-up
  totalAmount?: number;       // total setelah top-up (hanya untuk top_up)
  buktiUrl?:    string;
  flags?:       string[];     // ["MinBun", "Tami", "Direct"] yang aktif
}

// ── Email ──────────────────────────────────────────────────────────────────────

function buildEmailHtml(body: NotifyOwnerBody, tanggal: string): string {
  const isTopUp   = body.type === "top_up";
  const title     = isTopUp ? "Top Up Investasi" : "Investor Baru";
  const emoji     = isTopUp ? "📈" : "🎉";
  const flagHtml  = body.flags?.length
    ? `<tr style="background:#f9fafb;">
        <td style="padding:10px 14px;color:#6b7280;">Flag</td>
        <td style="padding:10px 14px;font-weight:600;">${body.flags.join(", ")}</td>
       </tr>`
    : "";
  const totalHtml = isTopUp && body.totalAmount != null
    ? `<tr style="background:#f9fafb;">
        <td style="padding:10px 14px;color:#6b7280;">Total Investasi</td>
        <td style="padding:10px 14px;font-weight:700;color:#2563eb;">${fmtRp(body.totalAmount)}</td>
       </tr>`
    : "";

  return `
<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">
    <div style="background:#0f172a;padding:24px 32px;">
      <h1 style="margin:0;color:#fff;font-size:18px;">${emoji} ${title}</h1>
      <p style="margin:6px 0 0;color:#94a3b8;font-size:12px;">${tanggal} · MinBun ERP</p>
    </div>
    <div style="padding:24px 32px;">
      <p style="margin:0 0 16px;font-size:14px;color:#374151;">Notifikasi dari sistem MinBun ERP:</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
        <tr>
          <td style="padding:10px 14px;color:#6b7280;width:40%;">ID Investor</td>
          <td style="padding:10px 14px;font-weight:600;font-family:monospace;">${body.investorId}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;color:#6b7280;">Nama</td>
          <td style="padding:10px 14px;font-weight:600;">${body.investorName}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#6b7280;">${isTopUp ? "Nominal Top Up" : "Nilai Investasi"}</td>
          <td style="padding:10px 14px;font-weight:700;color:#16a34a;font-size:15px;">${fmtRp(body.amount)}</td>
        </tr>
        ${totalHtml}
        ${flagHtml}
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;color:#6b7280;">Tanggal</td>
          <td style="padding:10px 14px;">${tanggal}</td>
        </tr>
      </table>
      ${body.buktiUrl ? `
      <div style="text-align:center;margin:20px 0;">
        <a href="${body.buktiUrl}"
          style="display:inline-block;background:#0f172a;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">
          📎 Lihat Bukti Transfer
        </a>
      </div>` : ""}
    </div>
    <div style="padding:14px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;">
        Email ini dikirim otomatis oleh MinBun ERP
      </p>
    </div>
  </div>
</body>
</html>`;
}

function buildWaMessage(body: NotifyOwnerBody, tanggal: string): string {
  const isTopUp = body.type === "top_up";
  const lines = [
    isTopUp ? `📈 *Top Up Investasi*` : `🎉 *Investor Baru*`,
    ``,
    `🆔 ID        : ${body.investorId}`,
    `👤 Nama      : *${body.investorName}*`,
    `💰 ${isTopUp ? "Top Up   " : "Investasi"} : *${fmtRp(body.amount)}*`,
  ];
  if (isTopUp && body.totalAmount != null) {
    lines.push(`📊 Total     : *${fmtRp(body.totalAmount)}*`);
  }
  if (body.flags?.length) {
    lines.push(`🏷️ Flag      : ${body.flags.join(", ")}`);
  }
  lines.push(`📅 Tanggal   : ${tanggal}`);
  if (body.buktiUrl) {
    lines.push(``, `📎 Bukti Transfer:`, body.buktiUrl);
  }
  lines.push(``, `_— MinBun ERP_`);
  return lines.join("\n");
}

async function sendEmail(to: string, html: string, subject: string): Promise<ChannelStatus> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass || !to) return "skipped";
  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await transporter.sendMail({ from: `"MinBun ERP" <${user}>`, to, subject, html });
  return "sent";
}

async function sendWhatsApp(phone: string, message: string): Promise<ChannelStatus> {
  const token = process.env.FONNTE_TOKEN;
  if (!token || !phone) return "skipped";
  const normalized = phone.replace(/^0/, "62").replace(/\D/g, "");

  // PERBAIKAN: Gunakan FormData (multipart/form-data) bukan URLSearchParams.
  // Fonnte sering "drop" pesan berformat markdown/teks panjang ketika dikirim
  // via application/x-www-form-urlencoded, dengan response HTTP 200 {status:true}
  // sehingga log nampak "terkirim" padahal WA tidak sampai. FormData terbukti
  // 100% diterima (lihat lib/send-reminders-core.ts).
  const buildBody = () => {
    const fd = new FormData();
    fd.append("target",      normalized);
    fd.append("message",     message);
    fd.append("countryCode", "62");
    return fd;
  };

  let res  = await fetch("https://api.fonnte.com/send", {
    method: "POST",
    headers: { Authorization: token },
    body:   buildBody(),
  });
  let data = await res.json().catch(() => null);

  // PERBAIKAN: Auto-retry 1x setelah 5 detik jika Fonnte return
  // "disconnected device" — kasus umum saat device WA HP tempat akun Fonnte
  // terdaftar sedang restart / tidak online.
  if (data?.status === false) {
    const reason = (data.reason || data.detail || "").toLowerCase();
    if (reason.includes("disconnected") || reason.includes("not connected") || reason.includes("not registered")) {
      console.warn(`[notify-owner] Fonnte disconnected, retry dalam 5 detik untuk ${normalized}...`);
      await new Promise((r) => setTimeout(r, 5000));
      res  = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: { Authorization: token },
        body:   buildBody(),
      });
      data = await res.json().catch(() => null);
    }
  }
  if (!res.ok) throw new Error(`Fonnte HTTP ${res.status}`);
  // Fonnte kadang return HTTP 200 dengan body { status: false, reason: "..." }.
  // Parse body dan throw jika gagal agar caller tidak salah anggap "sent".
  if (data && data.status === false) {
    throw new Error(`Fonnte: ${data.reason || data.detail || "ditolak"}`);
  }
  return "sent";
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 0. m-23: tolak cross-origin request yang tidak memiliki Origin/Referer cocok.
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden: invalid origin" }, { status: 403 });
  }

  const authHeader = req.headers.get("authorization");
  const pbToken    = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!pbToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let pb: PocketBase;
  try {
    pb = new PocketBase(process.env.NEXT_PUBLIC_PB_URL);
    pb.authStore.save(pbToken, null);
    await pb.collection("users").authRefresh();
  } catch {
    return NextResponse.json({ error: "Token tidak valid" }, { status: 401 });
  }

  let body: NotifyOwnerBody;
  try {
    body = await req.json() as NotifyOwnerBody;
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  if (!body.type || !body.investorId || !body.investorName || body.amount == null) {
    return NextResponse.json({ error: "Field wajib kurang" }, { status: 400 });
  }

  const ownerEmail = process.env.OWNER_EMAIL ?? "";
  const ownerPhone = process.env.OWNER_PHONE ?? "";

  const tanggal  = fmtDate(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10));
  const isTopUp  = body.type === "top_up";
  const subject  = isTopUp
    ? `[MinBun] 📈 Top Up — ${body.investorName} (${body.investorId})`
    : `[MinBun] 🎉 Investor Baru — ${body.investorName} (${body.investorId})`;

  const errors: string[] = [];
  const [waStatus, emailStatus] = await Promise.all([
    sendWhatsApp(ownerPhone, buildWaMessage(body, tanggal)).catch((e) => {
      errors.push(`WA: ${String(e)}`);
      return "failed" as ChannelStatus;
    }),
    sendEmail(ownerEmail, buildEmailHtml(body, tanggal), subject).catch((e) => {
      errors.push(`Email: ${String(e)}`);
      return "failed" as ChannelStatus;
    }),
  ]);

  // Log ke reminder_logs (silent)
  pb.collection("reminder_logs").create({
    sentAt:       new Date().toISOString(),
    investorName: body.investorName,
    emailStatus,
    waStatus,
    errorMessage: errors.join(" | "),
    triggeredBy:  body.type,
    keterangan:   isTopUp ? "top_up" : "new_investor",
    jumlah:       body.amount,
  }).catch(() => {});

  return NextResponse.json({ waStatus, emailStatus, errors: errors.length ? errors : undefined });
}
