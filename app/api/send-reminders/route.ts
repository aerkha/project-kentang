import { NextRequest, NextResponse } from "next/server";
import { runReminders, runRemindersTest } from "@/lib/send-reminders-core";

/**
 * 1. GET /api/send-reminders
 * Dipanggil otomatis oleh cron Vercel (vercel.json: "0 0 * * *" UTC = 07:00 WIB).
 * Auth menggunakan rahasia CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (req.nextUrl.searchParams.get("test") === "true") {
    const { status, body } = await runRemindersTest();
    return NextResponse.json(body, { status });
  }

  // Jika dipanggil via GET cron, otomatis gunakan mode "cron"
  const triggeredBy = req.nextUrl.searchParams.get("manual") === "true" ? "manual" : "cron";
  const { status, body } = await runReminders(triggeredBy);
  return NextResponse.json(body, { status });
}

/**
 * 2. POST /api/send-reminders
 * Dipanggil secara manual saat pengguna mengeklik tombol "Kirim Sekarang" di aplikasi.
 * Auth menggunakan token PocketBase dari pengguna yang sedang login.
 */
export async function POST(req: NextRequest) {
  try {
    // Verifikasi token pengguna aplikasi
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }

    // Jalankan mesin reminder dengan mode "manual" (agar lolos dari filter deduplikasi 20 jam)
    const { status, body } = await runReminders("manual");
    
    return NextResponse.json(body, { status });
  } catch (error: any) {
    console.error("API Route POST Error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan pada server", detail: error.message },
      { status: 500 }
    );
  }
}