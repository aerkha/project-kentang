import { NextRequest, NextResponse } from "next/server";
import { runReminders, runRemindersTest } from "@/lib/send-reminders-core";

/**
 * 1. GET /api/send-reminders
 * Dipanggil otomatis oleh cron VPS (systemd timer / crontab "0 0 * * *" UTC = 07:00 WIB).
 * Auth menggunakan rahasia CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // PATCH (serius #25): endpoint test mode sebelumnya tidak terproteksi —
  // siapa pun yang memegang CRON_SECRET dapat mengirim email test ke admin.
  // Sekarang require header `X-Test-Token` yang cocok dengan ADMIN_TEST_TOKEN
  // (env var). Jika env var kosong, endpoint test dinonaktifkan total.
  const testToken = process.env.ADMIN_TEST_TOKEN?.trim();
  const wantsTest = req.nextUrl.searchParams.get("test") === "true";
  if (wantsTest) {
    if (!testToken) {
      return NextResponse.json(
        { error: "Test mode dinonaktifkan (ADMIN_TEST_TOKEN belum di-set)" },
        { status: 403 },
      );
    }
    if (req.headers.get("x-test-token") !== testToken) {
      return NextResponse.json(
        { error: "Forbidden — X-Test-Token header tidak valid" },
        { status: 403 },
      );
    }
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
    // Verifikasi token pengguna aplikasi. Route halaman memang membatasi UI,
    // tetapi API tetap harus menolak token palsu/nonaktif jika dipanggil langsung.
    const authHeader = req.headers.get("authorization");
    const pbToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!pbToken) {
      return NextResponse.json({ error: "Unauthorized access" }, { status: 401 });
    }
    const PocketBase = (await import("pocketbase")).default;
    const pb = new PocketBase(process.env.NEXT_PUBLIC_PB_URL);
    pb.authStore.save(pbToken, null);
    const caller = await pb.collection("users").authRefresh();
    if ((caller.record as Record<string, unknown>)?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden — hanya admin" }, { status: 403 });
    }

    // Jalankan mesin reminder dengan mode "manual" (agar lolos dari filter deduplikasi 20 jam)
    const { status, body } = await runReminders("manual");
    
    return NextResponse.json(body, { status });
  } catch (error) {
    console.error("API Route POST Error:", error);
    return NextResponse.json(
      { error: "Terjadi kesalahan pada server" },
      { status: 500 }
    );
  }
}