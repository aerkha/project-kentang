import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(req: NextRequest) {
  try {
    // 1. Verifikasi Keamanan (Pastikan yang memanggil adalah aplikasi kita)
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    // 2. Tangkap data dari Frontend
    const body = await req.json();
    const { type, name, email, phone, password, role } = body;

    if (type !== "new_account") {
      return NextResponse.json({ error: "Invalid request type" }, { status: 400 });
    }

    // 3. Siapkan Teks Pesan
    const roleLabel = role === "investor" ? "Investor" : role === "broker" ? "Broker" : role;
    
    const waMessage = `Halo *${name}*, selamat bergabung di MinBun ERP! 🎉\n\n` +
      `Akun ${roleLabel} Anda telah berhasil dibuat. Berikut adalah informasi login Anda:\n\n` +
      `👤 *Email*: ${email}\n` +
      `🔑 *Password*: ${password}\n\n` +
      `Silakan login melalui aplikasi/website kami. Kami menyarankan Anda untuk segera mengganti password setelah berhasil login demi keamanan akun Anda.\n\n` +
      `Salam hangat,\n*Tim MinBun*`;

    const emailSubject = `Selamat Datang di MinBun ERP - Informasi Akun ${roleLabel}`;
    const emailHtml = `
      <div style="font-family: sans-serif; max-w: 600px; margin: auto; line-height: 1.6; color: #333;">
        <h2 style="color: #2563eb;">Halo ${name}, selamat bergabung di MinBun ERP! 🎉</h2>
        <p>Akun <strong>${roleLabel}</strong> Anda telah berhasil dibuat. Berikut adalah kredensial login Anda:</p>
        <div style="background-color: #f4f4f5; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #e4e4e7;">
          <p style="margin: 0 0 10px 0;"><strong>Email:</strong> ${email}</p>
          <p style="margin: 0;"><strong>Password:</strong> <span style="font-family: monospace; background: #e2e8f0; padding: 2px 6px; border-radius: 4px;">${password}</span></p>
        </div>
        <p>Silakan login ke sistem kami. Sangat disarankan untuk segera mengganti password Anda pada menu pengaturan akun demi menjaga keamanan.</p>
        <br/>
        <p style="margin-bottom: 0;">Salam hangat,</p>
        <p style="margin-top: 5px;"><strong>Tim MinBun</strong></p>
      </div>
    `;

    // 4. Proses Pengiriman Paralel
    const sendResults = await Promise.allSettled([
      sendWhatsApp(phone, waMessage),
      sendEmail(email, emailSubject, emailHtml)
    ]);

    // 5. Evaluasi Hasil
    const waStatus = sendResults[0].status === "fulfilled" && sendResults[0].value ? "sent" : "failed";
    const emailStatus = sendResults[1].status === "fulfilled" && sendResults[1].value ? "sent" : "failed";

    return NextResponse.json({
      message: "Credentials process completed",
      waStatus,
      emailStatus
    }, { status: 200 });

  } catch (error: any) {
    console.error("API send-credentials error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan pada server", detail: error.message },
      { status: 500 }
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────
// FUNGSI PENGIRIMAN FONNTE & GMAIL
// ──────────────────────────────────────────────────────────────────────────

async function sendWhatsApp(phone: string, message: string): Promise<boolean> {
  if (!phone) return false;
  
  try {
    // Format ke standar 62
    let formattedPhone = phone.replace(/\D/g, "");
    if (formattedPhone.startsWith("0")) {
      formattedPhone = "62" + formattedPhone.substring(1);
    }

    const token = process.env.FONNTE_TOKEN;
    if (!token) {
      console.warn("FONNTE_TOKEN belum diatur di .env");
      return false;
    }

    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        "Authorization": token,
      },
      body: new URLSearchParams({
        target: formattedPhone,
        message: message,
      })
    });

    const data = await res.json();
    if (!data.status) {
      console.error("Fonnte menolak pengiriman:", data.reason || data.detail);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Gagal request ke API Fonnte:", err);
    return false;
  }
}

async function sendEmail(email: string, subject: string, html: string): Promise<boolean> {
  // Abaikan pengiriman jika email adalah dummy (.local) atau kosong
  if (!email || email.includes(".local")) return false;

  try {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;

    if (!user || !pass) {
      console.warn("GMAIL_USER atau GMAIL_APP_PASSWORD belum diatur di .env");
      return false;
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: user,
        pass: pass,
      },
    });

    const info = await transporter.sendMail({
      from: `"MinBun ERP" <${user}>`,
      to: email,
      subject: subject,
      html: html,
    });

    return !!info.messageId;
  } catch (err) {
    console.error("Gagal mengirim email via Gmail:", err);
    return false;
  }
}