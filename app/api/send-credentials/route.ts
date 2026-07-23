// PATCH (sedang #send-credentials-auth): tambah validasi token ke PocketBase
// untuk memastikan caller benar-benar login. Sebelumnya endpoint hanya cek
// adanya header Bearer tanpa memverifikasi token, sehingga siapa pun yang
// mengetahui endpoint + body shape bisa kirim kredensial ke sembarang email.
import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import nodemailer from "nodemailer";
import { isSameOriginRequest } from "@/lib/pb-error";

export async function POST(req: NextRequest) {
  try {
    // 0. m-23: tolak cross-origin request.
    if (!isSameOriginRequest(req)) {
      return NextResponse.json({ error: "Forbidden: invalid origin" }, { status: 403 });
    }

    // 1. Verifikasi token: harus ada DAN valid (cek ke PocketBase).
    const authHeader = req.headers.get("authorization");
    const pbToken    = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!pbToken) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }
    try {
      const pb = new PocketBase(process.env.NEXT_PUBLIC_PB_URL);
      pb.authStore.save(pbToken, null);
      const caller = await pb.collection("users").authRefresh();
      if ((caller.record as Record<string, unknown>)?.role !== "admin") {
        return NextResponse.json({ error: "Forbidden — hanya admin" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Token tidak valid atau sudah kedaluwarsa" }, { status: 401 });
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

  } catch (error) {
    console.error("API send-credentials error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan pada server" },
      { status: 500 }
    );
  }
}

// ──────────────────────────────────────────────────────────────────────────
// FUNGSI PENGIRIMAN FONNTE & GMAIL
// ──────────────────────────────────────────────────────────────────────────

// PATCH (sementara): WhatsApp notification dinonaktifkan.
// User saat ini belum bisa memenuhi syarat Meta WhatsApp Business API.
// Untuk mengaktifkan kembali: hapus komentar /* ... */ wrapper.
async function sendWhatsApp(phone: string, message: string): Promise<boolean> {
  if (!phone) return false;
  // WhatsApp belum aktif; jangan melaporkan terkirim jika provider dinonaktifkan.
  return false;

  /* ── KODE ASLI — NONAKTIF SEMENTARA ───────────────────────────────────────
  try {
    let formattedPhone = phone.replace(/\D/g, "");
    if (formattedPhone.startsWith("0")) {
      formattedPhone = "62" + formattedPhone.substring(1);
    }

    const token = process.env.FONNTE_TOKEN;
    if (!token) {
      console.warn("FONNTE_TOKEN belum diatur di .env");
      return false;
    }

    const formData = new FormData();
    formData.append("target",  formattedPhone);
    formData.append("message", message);

    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { "Authorization": token },
      body: formData,
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
  ─────────────────────────────────────────────────────────────────────────── */
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