import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import nodemailer from "nodemailer";
import { isSameOriginRequest } from "@/lib/pb-error";
import { todayWibStr } from "@/lib/utils";

/**
 * POST /api/notify-broker-resend
 *
 * Endpoint khusus untuk RESEND notifikasi bagi hasil investor ke broker
 * afiliasinya. Pesan yang dikirim ke broker di sini BUKAN "pencairan fee
 * broker" melainkan salinan notifikasi investor dengan konteks tambahan
 * bahwa klien broker tersebut baru saja menerima bagi hasil.
 *
 * Perbedaan dengan /api/notify-broker:
 * - /api/notify-broker → FEE BROKER (saat entitas murni broker lunas).
 * - /api/notify-broker-resend → SALINAN NOTIFIKASI INVESTOR (saat investor
 *   yang berafiliasi lunas; broker menerima bukti transfer yang SAMA
 *   dengan bukti yang dikirim ke investornya, dengan nominal yang SAMA
 *   dengan yang diterima investor — BUKAN fee broker).
 */

interface ResendBody {
  brokerName:   string;
  investorName: string;
  jumlah:       number;
  buktiUrl:     string;
  noPks:        string;
  modal?:       number; // opsional: nilai modal investasi klien (untuk display)
}

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

function buildResendWaMessage(opts: ResendBody & { tanggal: string }): string {
  const { brokerName, investorName, noPks, jumlah, buktiUrl, tanggal, modal } = opts;
  const modalLine = modal && modal > 0
    ? `*Modal*          : ${fmtRp(modal)}\n`
    : "";
  return [
    `Selamat malam Kak *${brokerName}*,`,
    `Berikut *notifikasi bagi hasil klien* Anda yang baru saja kami transfer:`,
    ``,
    `*Tanggal*        : ${tanggal}`,
    `*No. Referensi*  : ${noPks}`,
    `*Klien*          : ${investorName}`,
    `${modalLine}*Bagi Hasil Klien* : ${fmtRp(jumlah)}`,
    ``,
    `Nominal di atas adalah *bagi hasil yang diterima oleh klien Anda*`,
    `(bukan fee broker Anda). Bukti transfer terlampir di bawah ini`,
    `merupakan bukti yang sama dengan yang dikirim ke klien.`,
    ``,
    `${buktiUrl ? buktiUrl : "_*Tidak ada lampiran bukti transfer*_"}`,
    ``,
    `Terima kasih.`,
  ].join("\n");
}

function buildResendEmailHtml(opts: ResendBody & { tanggal: string }): string {
  const { brokerName, investorName, noPks, jumlah, buktiUrl, tanggal, modal } = opts;
  return `
<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">

    <div style="background:#1d4ed8;padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;">🔔 Notifikasi Bagi Hasil Klien Anda</h1>
      <p style="margin:6px 0 0;color:#bfdbfe;font-size:13px;">${tanggal} · MinBun</p>
    </div>

    <div style="padding:28px 32px;">
      <p style="margin:0 0 16px;font-size:15px;color:#111827;">
        Yth. <strong>${brokerName}</strong>,
      </p>
      <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
        Kami informasikan bahwa klien Anda atas nama
        <strong>${investorName}</strong> baru saja menerima transfer bagi hasil.
        Berikut detailnya untuk informasi Anda:
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;color:#6b7280;width:40%;">No. Referensi</td>
          <td style="padding:10px 14px;font-weight:600;font-family:monospace;">${noPks}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#6b7280;border-top:1px solid #f3f4f6;">Tanggal Bayar</td>
          <td style="padding:10px 14px;border-top:1px solid #f3f4f6;">${tanggal}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;color:#6b7280;">Klien</td>
          <td style="padding:10px 14px;font-weight:600;">${investorName}</td>
        </tr>
        ${modal && modal > 0 ? `
        <tr>
          <td style="padding:10px 14px;color:#6b7280;border-top:1px solid #f3f4f6;">Modal Investasi Klien</td>
          <td style="padding:10px 14px;border-top:1px solid #f3f4f6;">${fmtRp(modal)}</td>
        </tr>
        ` : ""}
        <tr ${modal && modal > 0 ? "" : 'style="background:#f9fafb;"'}>
          <td style="padding:10px 14px;color:#6b7280;${modal && modal > 0 ? "border-top:1px solid #f3f4f6;" : ""}">Bagi Hasil Klien</td>
          <td style="padding:10px 14px;font-weight:700;color:#1d4ed8;font-size:15px;${modal && modal > 0 ? "border-top:1px solid #f3f4f6;" : ""}">${fmtRp(jumlah)}</td>
        </tr>
      </table>

      <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:6px;margin-bottom:20px;">
        <p style="margin:0;font-size:12px;color:#78350f;line-height:1.5;">
          ℹ️ <strong>Catatan:</strong> Nominal di atas adalah <strong>bagi hasil yang
          diterima oleh klien Anda</strong>, bukan fee broker Anda.
          Bukti transfer di bawah ini sama dengan bukti yang dikirim ke klien.
        </p>
      </div>

      ${buktiUrl ? `
      <div style="text-align:center;margin:24px 0;">
        <a href="${buktiUrl}"
          style="display:inline-block;background:#1d4ed8;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">
          📎 Lihat Bukti Transfer
        </a>
      </div>` : ""}

      <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
        Informasi ini diberikan sebagai bentuk transparansi kepada Anda selaku
        broker afiliasi.
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

type ChannelStatus = "sent" | "failed" | "skipped";

async function logAttempt(
  pb: PocketBase,
  data: {
    brokerName: string;
    noPks:      string;
    jumlah:     number;
    waStatus:   ChannelStatus;
    emailStatus: ChannelStatus;
    errorMessage: string;
  },
): Promise<void> {
  try {
    await pb.collection("reminder_logs").create({
      mouCustomId:  data.noPks,
      cycleNumber:  0,
      sentAt:       new Date().toISOString(),
      // Khusus resend, label berbeda agar admin mudah membedakannya
      // dari notifikasi fee broker di Riwayat Reminder.
      investorName: `Broker (resend): ${data.brokerName}`,
      emailStatus:  data.emailStatus,
      waStatus:     data.waStatus,
      errorMessage: data.errorMessage,
      triggeredBy:  "notifikasi",
      keterangan:   "Resend Notifikasi Bagi Hasil ke Broker",
      // PENTING: jumlah yang disimpan di log adalah jumlah BAGI HASIL
      // KLIEN (yang diterima investor), bukan fee broker. Ini sesuai
      // dengan pesan yang dikirim ke broker.
      jumlah:       data.jumlah,
    });
  } catch {
    /* silent */
  }
}

async function sendEmail(
  to: string,
  opts: ResendBody & { tanggal: string },
): Promise<ChannelStatus> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass || !to) return "skipped";
  try {
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
    await transporter.sendMail({
      from:    `"MinBun ERP" <${user}>`,
      to,
      subject: `[MinBun] 🔔 Notifikasi Bagi Hasil Klien ${opts.investorName} — ${opts.noPks}`,
      html:    buildResendEmailHtml(opts),
    });
    return "sent";
  } catch (e) {
    console.error("[notify-broker-resend] gagal kirim email:", e);
    return "failed";
  }
}

async function sendWhatsApp(
  brokerPhone: string,
  msgText:     string,
): Promise<{ status: ChannelStatus; error: string }> {
  // PATCH (sementara): simulasi skipped sampai Meta WA API siap.
  return { status: "skipped", error: "WA dinonaktifkan sementara" };

  /* ── KODE ASLI — NONAKTIF SEMENTARA ───────────────────────────────────────
  const token = process.env.FONNTE_TOKEN?.trim();
  if (!token)       return { status: "skipped", error: "FONNTE_TOKEN kosong" };
  if (!brokerPhone) return { status: "skipped", error: "Nomor HP broker kosong" };
  try {
    const normalizedPhone = brokerPhone.replace(/^0/, "62").replace(/\D/g, "");
    const buildBody = () => {
      const fd = new FormData();
      fd.append("target",      normalizedPhone);
      fd.append("message",     msgText);
      fd.append("countryCode", "62");
      return fd;
    };
    let res  = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: token },
      body:   buildBody(),
    });
    let data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`Fonnte HTTP ${res.status}`);
    if (data && data.status === false) {
      throw new Error(`Fonnte: ${data.reason || data.detail || "ditolak"}`);
    }
    return { status: "sent", error: "" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[notify-broker-resend] gagal kirim WA:", msg);
    return { status: "failed", error: msg };
  }
  ─────────────────────────────────────────────────────────────────────────── */
}

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden: invalid origin" }, { status: 403 });
  }

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
    return NextResponse.json({ error: "Token invalid" }, { status: 401 });
  }

  let body: ResendBody;
  try {
    body = await req.json() as ResendBody;
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  if (!body.brokerName || !body.investorName) {
    return NextResponse.json(
      { error: "brokerName dan investorName wajib diisi" },
      { status: 400 },
    );
  }

  let brokerRecord: { phone?: unknown; email?: unknown } | null = null;
  try {
    brokerRecord = await pb.collection("brokers").getFirstListItem(
      `name = "${body.brokerName.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
      { fields: "phone,email" },
    );
  } catch {
    // Broker tidak ditemukan di DB — skip silent, jangan gagalkan proses
    // bulk karena notifikasi ke investor sudah sukses.
    return NextResponse.json(
      { success: false, skipped: true, reason: `Broker "${body.brokerName}" tidak ditemukan` },
      { status: 200 },
    );
  }

  const brokerPhone = (brokerRecord?.phone  as string | undefined) || "";
  const brokerEmail = (brokerRecord?.email as string | undefined) || "";
  const tanggal = fmtDate(todayWibStr());
  const opts = { ...body, tanggal };

  // Channel WhatsApp
  const waResult = await sendWhatsApp(brokerPhone, buildResendWaMessage(opts));
  // Channel Email (fallback)
  const emailStatus: ChannelStatus = await sendEmail(brokerEmail, opts);

  const waStatus = waResult.status;
  const waError  = waResult.error;

  const anyChannelSent    = waStatus === "sent" || emailStatus === "sent";
  const allChannelsFailed = waStatus === "failed" && emailStatus === "failed";

  const errParts: string[] = [];
  if (waStatus !== "sent")    errParts.push(`WA ${waStatus}${waError ? `: ${waError}` : ""}`);
  if (emailStatus !== "sent") errParts.push(`Email ${emailStatus}`);
  const combinedError = errParts.join(" | ");

  await logAttempt(pb, {
    brokerName: body.brokerName,
    noPks:      body.noPks,
    // PENTING: log jumlah = jumlah BAGI HASIL KLIEN (bukan fee broker).
    // Pesan yang dikirim adalah notifikasi RESEND bagi hasil klien ke broker.
    jumlah:       body.jumlah,
    waStatus,
    emailStatus,
    errorMessage: combinedError,
  });

  if (allChannelsFailed) {
    return NextResponse.json(
      { success: false, waStatus, emailStatus, reason: "Semua channel notifikasi gagal" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: anyChannelSent,
    waStatus,
    emailStatus,
    reason: !anyChannelSent ? combinedError : undefined,
  });
}
