import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import nodemailer from "nodemailer";
import { isSameOriginRequest } from "@/lib/pb-error";

function pbEsc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * POST /api/notify-investor
 *
 * Kirim notifikasi ke investor bahwa bagi hasilnya sudah dibayar.
 * Body: { transaksiId, keterangan, investorId, jumlah, buktiUrl }
 * Auth : Authorization: Bearer <pb_token>
 */

interface NotifyBody {
  transaksiId: string;
  keterangan:  string;
  investorId:  string;
  jumlah:      number;
  buktiUrl:    string;
}

type ChannelStatus = "sent" | "failed" | "skipped";

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

// ── History helpers ────────────────────────────────────────────────────────────

interface HistoryRow {
  transaksiId:    string;
  tanggal:        string;
  status:         string;
  nilaiInvestasi: number;
  bagiHasilDone:  boolean;
}

async function buildHistory(
  pb:         PocketBase,
  investorId: string,
): Promise<HistoryRow[]> {
  try {
    // 1. Ambil semua transaksi_investors milik investor ini
    const tiRecords = await pb.collection("transaksi_investors").getFullList({
      filter: `investorId = "${pbEsc(investorId)}"`,
      fields: "transaksiId,nilaiInvestasi",
    });
    if (tiRecords.length === 0) return [];

    // 2. Ambil transaksi-nya (hanya yang selesai/bermasalah)
    const trxIds    = [...new Set(tiRecords.map((r) => r.transaksiId as string))];
    const idFilter  = trxIds.map((id) => `id = "${pbEsc(id)}"`).join(" || ");
    const trxRecords = await pb.collection("transaksis").getFullList({
      filter: `(${idFilter}) && (status = "selesai" || status = "bermasalah")`,
      sort:   "-date",
      fields: "id,customId,date,status,bagiHasilDone",
    });

    const trxMap = new Map(trxRecords.map((r) => [r.id as string, r]));

    return tiRecords
      .map((ti) => {
        const trx = trxMap.get(ti.transaksiId as string);
        if (!trx) return null;
        return {
          transaksiId:    trx.customId    as string,
          tanggal:        trx.date        as string,
          status:         trx.status      as string,
          nilaiInvestasi: ti.nilaiInvestasi as number,
          bagiHasilDone:  (trx.bagiHasilDone as boolean) || false,
        };
      })
      .filter((r): r is HistoryRow => r !== null);
  } catch {
    return [];
  }
}

// ── Email HTML ─────────────────────────────────────────────────────────────────

function buildHistoryTableHtml(rows: HistoryRow[]): string {
  if (rows.length === 0) return "";

  const rowsHtml = rows.map((r, i) => {
    const bg        = i % 2 === 0 ? "#ffffff" : "#f9fafb";
    const lunasIcon = r.bagiHasilDone ? "✅" : "⏳";
    const statusLbl = r.status === "selesai" ? "Selesai" : r.status === "bermasalah" ? "Bermasalah" : r.status;
    const statusClr = r.status === "selesai" ? "#16a34a" : "#dc2626";
    return `
    <tr style="background:${bg};">
      <td style="padding:9px 10px;font-family:monospace;font-size:12px;font-weight:700;white-space:nowrap;">${r.transaksiId}</td>
      <td style="padding:9px 10px;font-size:12px;white-space:nowrap;">${fmtDate(r.tanggal)}</td>
      <td style="padding:9px 10px;font-size:12px;text-align:right;white-space:nowrap;">${fmtRp(r.nilaiInvestasi)}</td>
      <td style="padding:9px 10px;font-size:12px;text-align:center;">
        <span style="color:${statusClr};font-size:11px;font-weight:600;">${statusLbl}</span>
      </td>
      <td style="padding:9px 10px;font-size:13px;text-align:center;">${lunasIcon}</td>
    </tr>`;
  }).join("");

  const totalInvestment = rows.reduce((s, r) => s + r.nilaiInvestasi, 0);

  return `
  <div style="margin-top:28px;">
    <h2 style="margin:0 0 12px;font-size:14px;color:#111827;font-weight:700;">📊 Ringkasan Partisipasi Transaksi</h2>
    <div style="overflow-x:auto;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:440px;">
        <thead>
          <tr style="background:#f3f4f6;border-bottom:2px solid #e5e7eb;">
            <th style="padding:9px 10px;text-align:left;color:#6b7280;font-weight:600;white-space:nowrap;">No. TRX</th>
            <th style="padding:9px 10px;text-align:left;color:#6b7280;font-weight:600;white-space:nowrap;">Tanggal</th>
            <th style="padding:9px 10px;text-align:right;color:#6b7280;font-weight:600;white-space:nowrap;">Nilai Investasi</th>
            <th style="padding:9px 10px;text-align:center;color:#6b7280;font-weight:600;">Status</th>
            <th style="padding:9px 10px;text-align:center;color:#6b7280;font-weight:600;">Lunas</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr style="background:#f0fdf4;border-top:2px solid #e5e7eb;">
            <td colspan="2" style="padding:9px 10px;font-size:12px;color:#6b7280;font-weight:600;">${rows.length} transaksi</td>
            <td style="padding:9px 10px;text-align:right;font-weight:700;font-size:12px;">${fmtRp(totalInvestment)}</td>
            <td colspan="2"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>`;
}

function buildEmailHtml(opts: {
  investorName: string;
  transaksiId:  string;
  keterangan:   string;
  jumlah:       number;
  buktiUrl:     string;
  tanggal:      string;
  historyHtml:  string;
}): string {
  const { investorName, transaksiId, keterangan, jumlah, buktiUrl, tanggal, historyHtml } = opts;
  return `
<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">

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
          <td style="padding:10px 14px;color:#6b7280;width:40%;">No. Transaksi</td>
          <td style="padding:10px 14px;font-weight:600;font-family:monospace;">${transaksiId}</td>
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

      ${historyHtml}

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

// ── WhatsApp message ───────────────────────────────────────────────────────────

function buildWaMessage(opts: {
  investorName: string;
  transaksiId:  string;
  keterangan:   string;
  jumlah:       number;
  buktiUrl:     string;
  tanggal:      string;
  history:      HistoryRow[];
}): string {
  const { investorName, transaksiId, keterangan, jumlah, buktiUrl, tanggal, history } = opts;
  const lines = [
    `✅ *Konfirmasi Pembayaran Bagi Hasil*`,
    ``,
    `Yth. *${investorName}*,`,
    ``,
    `Bagi hasil Anda telah berhasil dibayarkan:`,
    ``,
    `📋 No. TRX   : ${transaksiId}`,
    `📂 Jenis     : ${keterangan}`,
    `💰 Jumlah    : *${fmtRp(jumlah)}*`,
    `📅 Tgl Bayar : ${tanggal}`,
  ];
  if (buktiUrl) {
    lines.push(``, `📎 Bukti Transfer:`, buktiUrl);
  }

  if (history.length > 0) {
    lines.push(``, `─────────────────────────`, `📊 *Ringkasan Partisipasi Transaksi*`, ``);
    for (const r of history) {
      const lunasIcon = r.bagiHasilDone ? "✅" : "⏳";
      lines.push(
        `${lunasIcon} *${r.transaksiId}*`,
        `   Tanggal  : ${fmtDate(r.tanggal)}`,
        `   Investasi: ${fmtRp(r.nilaiInvestasi)}`,
        `   Status   : ${r.status}`,
        ``,
      );
    }
    const totalInvestment = history.reduce((s, r) => s + r.nilaiInvestasi, 0);
    lines.push(`*Total Investasi: ${fmtRp(totalInvestment)}*`);
  }

  lines.push(``, `Terima kasih atas kepercayaan Anda. 🙏`, `_— Tim MinBun_`);
  return lines.join("\n");
}

// ── Kirim Email ────────────────────────────────────────────────────────────────

async function sendEmail(to: string, opts: Parameters<typeof buildEmailHtml>[0]): Promise<ChannelStatus> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass || !to) return "skipped";

  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await transporter.sendMail({
    from:    `"MinBun ERP" <${user}>`,
    to,
    subject: `[MinBun] ✅ Konfirmasi Bagi Hasil ${opts.keterangan} — ${opts.transaksiId}`,
    html:    buildEmailHtml(opts),
  });
  return "sent";
}

// ── Kirim WhatsApp ─────────────────────────────────────────────────────────────

async function sendWhatsApp(phone: string, opts: Parameters<typeof buildWaMessage>[0]): Promise<ChannelStatus> {
  const token = process.env.FONNTE_TOKEN;
  if (!token || !phone) return "skipped";

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
  // Fonnte kadang return HTTP 200 dengan body { status: false, reason: "..." }.
  // Parse body dan throw jika gagal agar caller tidak salah anggap "sent".
  const data = await res.json().catch(() => null);
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

  // 1. Verifikasi PocketBase token
  const authHeader = req.headers.get("authorization");
  const pbToken    = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!pbToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let pb: PocketBase;
  try {
    pb = new PocketBase(process.env.NEXT_PUBLIC_PB_URL);
    pb.authStore.save(pbToken, null);
    await pb.collection("users").authRefresh();
  } catch {
    return NextResponse.json({ error: "Token tidak valid atau sudah kedaluwarsa" }, { status: 401 });
  }

  // 2. Parse body
  let body: NotifyBody;
  try {
    body = await req.json() as NotifyBody;
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const { transaksiId, keterangan, investorId, buktiUrl } = body;
  const jumlah: number = typeof body.jumlah === "number" && body.jumlah >= 0 ? body.jumlah : 0;
  if (!transaksiId || !keterangan || !investorId) {
    return NextResponse.json({ error: "Field wajib kurang" }, { status: 400 });
  }

  // 3. Ambil data investor
  let investorPhone = "";
  let investorEmail = "";
  let investorName  = "";

  try {
    const inv = await pb.collection("investors").getFirstListItem(
      `customId = "${pbEsc(investorId)}"`,
      { fields: "name,phone,email" }
    );
    investorName  = (inv.name  as string) || "";
    investorPhone = (inv.phone as string) || "";
    investorEmail = (inv.email as string) || "";
  } catch {
    return NextResponse.json({ error: `Investor "${investorId}" tidak ditemukan` }, { status: 404 });
  }

  // 4. Bangun riwayat transaksi investor
  const history     = await buildHistory(pb, investorId);
  const historyHtml = buildHistoryTableHtml(history);

  const tanggal  = fmtDate(new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10));
  const baseOpts = { investorName, transaksiId, keterangan, jumlah, buktiUrl, tanggal };
  const errors: string[] = [];

  // 5 & 6. Kirim WA dan email ke investor secara paralel
  const [waStatus, emailStatus] = await Promise.all([
    sendWhatsApp(investorPhone, { ...baseOpts, history }).catch((e) => {
      errors.push(`WA: ${String(e)}`);
      return "failed" as ChannelStatus;
    }),
    sendEmail(investorEmail, { ...baseOpts, historyHtml }).catch((e) => {
      errors.push(`Email: ${String(e)}`);
      return "failed" as ChannelStatus;
    }),
  ]);

  // 7. Simpan log (mouCustomId diisi transaksiId untuk backward compat field)
  pb.collection("reminder_logs").create({
    mouCustomId:  transaksiId,
    cycleNumber:  0,
    sentAt:       new Date().toISOString(),
    investorName: investorName,
    emailStatus,
    waStatus,
    errorMessage: errors.join(" | "),
    triggeredBy:  "notifikasi",
    keterangan,
    jumlah:       jumlah ?? 0,
  }).catch(() => {});

  return NextResponse.json({
    waStatus,
    emailStatus,
    errors: errors.length ? errors : undefined,
  });
}
