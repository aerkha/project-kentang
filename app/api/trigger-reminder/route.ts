import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";

/**
 * POST /api/trigger-reminder
 *
 * Endpoint untuk trigger reminder manual dari UI (tombol "Kirim Sekarang").
 * Verifikasi dilakukan via PocketBase auth token milik user yang sedang login —
 * CRON_SECRET tidak pernah dikirim ke browser.
 *
 * Flow:
 *   Browser → POST /api/trigger-reminder (header: Authorization: Bearer <pb_token>)
 *     → verifikasi token ke PocketBase
 *     → pastikan user adalah admin
 *     → panggil /api/send-reminders?manual=true dengan CRON_SECRET (server-side)
 *     → kembalikan hasil ke browser
 */
export async function POST(req: NextRequest) {
  // 1. Ambil PocketBase token dari header
  const authHeader = req.headers.get("authorization");
  const pbToken    = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!pbToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Verifikasi token ke PocketBase
  try {
    const pb = new PocketBase(process.env.NEXT_PUBLIC_PB_URL);
    pb.authStore.save(pbToken, null);
    const user = await pb.collection("users").authRefresh();

    // Pastikan hanya admin yang bisa trigger
    if (user.record?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden — hanya admin" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Token tidak valid atau sudah expired" }, { status: 401 });
  }

  // 3. Panggil send-reminders server-side dengan CRON_SECRET (tidak pernah ke browser)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET belum dikonfigurasi di server" }, { status: 500 });
  }

  const baseUrl   = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
  const targetUrl = `${baseUrl}/api/send-reminders?manual=true`;

  try {
    const res  = await fetch(targetUrl, {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("[trigger-reminder]", err);
    return NextResponse.json({ error: "Gagal menghubungi send-reminders", detail: String(err) }, { status: 500 });
  }
}
