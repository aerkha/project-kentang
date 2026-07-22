import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import nodemailer from "nodemailer";
import { isSameOriginRequest } from "@/lib/pb-error";
import { todayWibStr } from "@/lib/utils";

function pbEsc(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

interface NotifyBrokerBody {
  brokerName:   string;
  investorList: string;
  jumlah:       number;
  buktiUrl:     string;
  noPks:        string;
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

function buildWaMessageBroker(opts: NotifyBrokerBody & { tanggal: string }): string {
  const { brokerName, investorList, noPks, jumlah, buktiUrl, tanggal } = opts;

  const lines = [
    `Selamat malam Kak *${brokerName}*,`,
    `Berikut pencairan *Fee Broker* dari MinBun dengan detail sbb:`,
    ``,
    `*Tanggal*        : ${tanggal}`,
    `*No. Referensi*  : ${noPks}`,
    `*Daftar Klien*   : ${investorList}`,
    `*Total Fee*      : ${fmtRp(jumlah)}`,
    ``,
    `${buktiUrl ? buktiUrl : "_*Tidak ada lampiran bukti transfer*_"}`,
    ``,
    `Alhamdulillah, semoga berkah untuk kita semua.`,
    `Terima kasih sudah bekerjasama dengan Mimin Berkebun dan *PT Madani Agri Lestari*.`
  ];

  return lines.join("\n");
}

/**
 * Bangun email HTML untuk broker — paralel dengan notify-investor.
 * Termasuk tombol/link bukti transfer dan ringkasan fee.
 */
function buildBrokerEmailHtml(opts: NotifyBrokerBody & { tanggal: string }): string {
  const { brokerName, investorList, noPks, jumlah, buktiUrl, tanggal } = opts;
  return `
<!DOCTYPE html>
<html lang="id">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);">

    <div style="background:#0f766e;padding:28px 32px;">
      <h1 style="margin:0;color:#fff;font-size:20px;">✅ Konfirmasi Pencairan Fee Broker</h1>
      <p style="margin:6px 0 0;color:#ccfbf1;font-size:13px;">${tanggal} · MinBun</p>
    </div>

    <div style="padding:28px 32px;">
      <p style="margin:0 0 16px;font-size:15px;color:#111827;">
        Yth. <strong>${brokerName}</strong>,
      </p>
      <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
        Kami informasikan bahwa fee broker Anda telah berhasil ditransfer.
        Berikut detailnya:
      </p>

      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px;">
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;color:#6b7280;width:40%;">No. Referensi</td>
          <td style="padding:10px 14px;font-weight:600;font-family:monospace;">${noPks}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#6b7280;border-top:1px solid #f3f4f6;">Daftar Klien</td>
          <td style="padding:10px 14px;border-top:1px solid #f3f4f6;">${investorList}</td>
        </tr>
        <tr style="background:#f9fafb;">
          <td style="padding:10px 14px;color:#6b7280;">Tanggal Bayar</td>
          <td style="padding:10px 14px;">${tanggal}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#6b7280;border-top:1px solid #f3f4f6;">Total Fee</td>
          <td style="padding:10px 14px;font-weight:700;color:#0f766e;font-size:15px;">${fmtRp(jumlah)}</td>
        </tr>
      </table>

      ${buktiUrl ? `
      <div style="text-align:center;margin:24px 0;">
        <a href="${buktiUrl}"
          style="display:inline-block;background:#0f766e;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">
          📎 Lihat Bukti Transfer
        </a>
      </div>` : ""}

      <p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.6;">
        Jika ada pertanyaan, silakan hubungi tim MinBun.<br>
        Terima kasih atas kerjasama Anda.
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

/**
 * Catat attempt pengiriman ke reminder_logs. Sekarang mendukung tracking
 * email DAN wa agar admin tahu channel mana yang berhasil/gagal.
 */
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
      investorName: `Broker: ${data.brokerName}`,
      emailStatus:  data.emailStatus,
      waStatus:     data.waStatus,
      errorMessage: data.errorMessage,
      triggeredBy:  "notifikasi",
      keterangan:   "Pencairan Fee Broker",
      jumlah:       data.jumlah,
    });
  } catch {
    /* silent — failure logging tidak boleh menggagalkan alur utama */
  }
}

async function sendEmail(
  to: string,
  opts: NotifyBrokerBody & { tanggal: string },
): Promise<ChannelStatus> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user) {
    console.warn(`[notify-broker] email skipped: GMAIL_USER env kosong`);
    return "skipped";
  }
  if (!pass) {
    console.warn(`[notify-broker] email skipped: GMAIL_APP_PASSWORD env kosong`);
    return "skipped";
  }
  if (!to) {
    // Fallback: broker belum punya email di database. Kirim notifikasi
    // ke admin (GMAIL_USER) agar admin tahu broker mana yang perlu
    // dilengkapi emailnya. Admin kemudian bisa meneruskan info fee
    // broker secara manual via WhatsApp / telepon.
    const adminEmail = process.env.GMAIL_USER;
    if (adminEmail) {
      try {
        const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
        await transporter.sendMail({
          from:    `"MinBun ERP" <${user}>`,
          to:      adminEmail,
          subject: `[MinBun] ⚠️ Fee Broker perlu diteruskan manual — ${opts.brokerName}`,
          html: `<!DOCTYPE html><html><body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;background:#f3f4f6;">
<div style="max-width:600px;margin:auto;background:#fff;padding:24px;border-radius:12px;border-left:6px solid #f59e0b;">
<h2 style="color:#92400e;margin-top:0;">⚠️ Broker belum punya email</h2>
<p>Broker <strong>${opts.brokerName}</strong> baru saja menerima transfer fee broker, tetapi email broker belum terdaftar di database.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px;">
<tr style="background:#fef3c7;"><td style="padding:8px;font-weight:600;">No. Referensi</td><td style="padding:8px;font-family:monospace;">${opts.noPks}</td></tr>
<tr><td style="padding:8px;font-weight:600;">Total Fee</td><td style="padding:8px;font-weight:700;color:#16a34a;">Rp ${opts.jumlah.toLocaleString("id-ID")}</td></tr>
<tr style="background:#fef3c7;"><td style="padding:8px;font-weight:600;">Klien</td><td style="padding:8px;">${opts.investorList || "—"}</td></tr>
</table>
<p style="font-size:13px;color:#6b7280;">Mohon hubungi broker tersebut secara manual (WhatsApp / telepon) dan bantu lengkapi data email di halaman Broker.</p>
</div></body></html>`,
        });
        console.log(`[notify-broker] email FALLBACK ke admin=${adminEmail} (broker ${opts.brokerName} belum punya email)`);
        return "skipped";
      } catch (e) {
        console.error(`[notify-broker] gagal kirim email fallback ke admin:`, e);
        return "skipped";
      }
    }
    console.warn(`[notify-broker] email skipped: broker email kosong di database (brokerName="${opts.brokerName}")`);
    return "skipped";
  }
  try {
    const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
    await transporter.sendMail({
      from:    `"MinBun ERP" <${user}>`,
      to,
      subject: `[MinBun] ✅ Konfirmasi Pencairan Fee Broker — ${opts.noPks}`,
      html:    buildBrokerEmailHtml(opts),
    });
    console.log(`[notify-broker] email SENT ke ${to} untuk broker=${opts.brokerName}`);
    return "sent";
  } catch (e) {
    // Berikan detail error + troubleshooting agar admin tahu harus
    // periksa apa. Google SMTP sering gagal karena: App Password
    // expired/revoked, 2FA off, akun terkunci, less secure app off.
    const msg = e instanceof Error ? e.message : String(e);
    const code = (e as any)?.code || (e as any)?.responseCode || "";
    console.error(`[notify-broker] GAGAL kirim email ke ${to} untuk broker=${opts.brokerName}:`, msg, `(code: ${code})`);
    if (msg.includes("Invalid login") || msg.includes("Username and Password not accepted") || code === "EAUTH") {
      console.error("[notify-broker] → TROUBLESHOOT: GMAIL_APP_PASSWORD salah/expired. Buka https://myaccount.google.com/apppasswords buat ulang App Password untuk 'Mail'.");
    } else if (msg.includes("self signed certificate") || code === "ESOCKET") {
      console.error("[notify-broker] → TROUBLESHOOT: Masalah koneksi SMTP. Cek firewall/network.");
    } else if (msg.includes("Daily user sending limit exceeded") || code === "EENVELOPE") {
      console.error("[notify-broker] → TROUBLESHOOT: Gmail daily sending limit exceeded (~500 email/hari).");
    }
    return "failed";
  }
}

/**
 * Kirim WhatsApp via Fonnte. Patch (sementara): nonaktif sampai Meta
 * WA Business API tersedia. Untuk mengaktifkan: hapus blok placeholder
 * dan aktifkan kode Fonnte di bawah.
 */
async function sendWhatsApp(
  brokerPhone: string,
  msgText:     string,
): Promise<{ status: ChannelStatus; error: string }> {
  // PATCH (sementara): simulasi skipped sampai Meta WA API siap.
  return { status: "skipped", error: "WA dinonaktifkan sementara" };

  /* ── KODE ASLI — NONAKTIF SEMENTARA ───────────────────────────────────────
  const token = process.env.FONNTE_TOKEN?.trim();
  if (!token)      return { status: "skipped", error: "FONNTE_TOKEN kosong" };
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

    if (data?.status === false) {
      const reason = (data.reason || data.detail || "").toLowerCase();
      if (reason.includes("disconnected") || reason.includes("not connected") || reason.includes("not registered")) {
        console.warn(`[notify-broker] Fonnte disconnected, retry dalam 5 detik untuk ${normalizedPhone}...`);
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

    if (data && data.status === false) {
      throw new Error(`Fonnte: ${data.reason || data.detail || "ditolak"}`);
    }

    return { status: "sent", error: "" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[notify-broker] gagal kirim WA:", msg);
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

  let body: NotifyBrokerBody;
  try {
    body = await req.json() as NotifyBrokerBody;
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  if (!body.brokerName || !body.brokerName.trim()) {
    return NextResponse.json({ error: "Nama Broker kosong" }, { status: 400 });
  }
  // Trim brokerName untuk menghilangkan whitespace leading/trailing yang
  // mungkin ada saat input atau pengiriman dari client.
  const brokerNameTrimmed = body.brokerName.trim();
  console.log(`[notify-broker] Lookup broker: name="${brokerNameTrimmed}" (length=${brokerNameTrimmed.length})`);

  // 1. Cari Data Broker — ambil phone + email untuk fallback multi-channel.
  let brokerRecord: { phone?: unknown; email?: unknown } | null = null;
  try {
    brokerRecord = await pb.collection("brokers").getFirstListItem(
      `name = "${pbEsc(brokerNameTrimmed)}"`,
      { fields: "phone,email" }
    );
    // Log untuk debugging: tampilkan field email yang berhasil di-fetch.
    console.log(`[notify-broker] fetched broker record for "${body.brokerName}": email="${(brokerRecord as any)?.email ?? "<kosong>"}", phone="${(brokerRecord as any)?.phone ?? "<kosong>"}"`);
  } catch (err) {
    console.error(`[notify-broker] GAGAL fetch broker "${body.brokerName}":`, err);
    return NextResponse.json({ error: `Broker "${body.brokerName}" tidak ditemukan di database` }, { status: 404 });
  }

  const brokerPhone = ((brokerRecord?.phone  as string | undefined) || "").trim();
  // Trim brokerEmail untuk mengatasi whitespace atau newline yang mungkin
  // tersimpan dari input form.
  const brokerEmail = ((brokerRecord?.email as string | undefined) || "").trim();

  // 2. Siapkan Data (dipakai bersama oleh WA dan Email)
  const tanggal = fmtDate(todayWibStr());
  const opts = { ...body, tanggal };

  // 3. Channel: WhatsApp (Fonnte).
  const waResult = await sendWhatsApp(brokerPhone, buildWaMessageBroker(opts));

  // 4. Channel: Email (fallback). Selalu coba kirim email meskipun WA
  //    disabled, agar broker benar-benar menerima notifikasi bukti transfer.
  const emailStatus: ChannelStatus = await sendEmail(brokerEmail, opts);
  if (emailStatus === "failed") {
    console.error(`[notify-broker] email gagal ke broker=${body.brokerName}`);
  }

  // 5. Tentukan status akhir. Failure WA tidak menggagalkan jika email sukses.
  const waStatus    = waResult.status;
  const waError     = waResult.error;
  const anyChannelSent    = waStatus === "sent" || emailStatus === "sent";
  const allChannelsFailed = waStatus === "failed" && emailStatus === "failed";

  // Susun errorMessage ringkas untuk log & response
  const errParts: string[] = [];
  if (waStatus !== "sent")    errParts.push(`WA ${waStatus}${waError ? `: ${waError}` : ""}`);
  if (emailStatus !== "sent") errParts.push(`Email ${emailStatus}`);
  const combinedError = errParts.join(" | ");

  // Susun pesan log yang informatif agar admin bisa lihat di UI
  // Riwayat Reminder apa yang sebenarnya terjadi.
  let logMessage = combinedError;
  if (emailStatus === "skipped" && !waResult.error && !combinedError) {
    logMessage = "Email broker belum terkirim. Cek: (1) broker.email di PB kosong, (2) GMAIL_USER/GMAIL_APP_PASSWORD env tidak diset, atau (3) WA disabled dan email tidak terkirim.";
  } else if (emailStatus === "skipped" && waResult.error) {
    logMessage = `Email skipped. WA: ${waResult.error}. Periksa env GMAIL dan broker.email.`;
  } else if (emailStatus === "failed") {
    logMessage = `Email gagal: ${combinedError || "unknown"}. Kemungkinan: App Password Gmail salah/expired, broker email typo, atau Gmail daily limit.`;
  }

  await logAttempt(pb, {
    brokerName: body.brokerName,
    noPks:      body.noPks,
    jumlah:     body.jumlah,
    waStatus,
    emailStatus,
    errorMessage: logMessage,
  });

  if (allChannelsFailed) {
    return NextResponse.json(
      { success: false, waStatus, emailStatus, reason: "Semua channel notifikasi gagal" },
      { status: 500 },
    );
  }

  // Log final sebelum return — penting untuk debugging kenapa broker
  // tidak menerima email meskipun endpoint dipanggil.
  console.log(`[notify-broker] FINAL: broker="${body.brokerName}", waStatus=${waStatus}, emailStatus=${emailStatus}, anyChannelSent=${anyChannelSent}, brokerEmailUsed="${brokerEmail}"`);

  return NextResponse.json({
    success: anyChannelSent,
    waStatus,
    emailStatus,
    reason: !anyChannelSent ? combinedError : undefined,
  });
}
