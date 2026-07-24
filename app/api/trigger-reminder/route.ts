import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import { runReminders } from "@/lib/send-reminders-core";
import { createLogger } from "@/lib/api-logger";


const log = createLogger("trigger-reminder");
/**
 * POST /api/trigger-reminder
 *
 * Endpoint untuk trigger reminder manual dari UI (tombol "Kirim Sekarang").
 * Verifikasi dilakukan via PocketBase auth token milik user yang sedang login —
 * CRON_SECRET tidak pernah dikirim ke browser.
 *
 * Flow:
 *   Browser → POST /api/trigger-reminder (header: Authorization: Bearer <pb_token>)
 *     → verifikasi token ke PocketBase, pastikan user adalah admin
 *     → jalankan runReminders("manual") langsung (tanpa HTTP self-call)
 *     → kembalikan hasil ke browser
 */
export async function POST(req: NextRequest) {
  // 1. Ambil PocketBase token dari header
  const authHeader = req.headers.get("authorization");
  const pbToken    = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!pbToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Verifikasi token ke PocketBase — hanya admin yang boleh trigger
  try {
    const pb = new PocketBase(process.env.NEXT_PUBLIC_PB_URL);
    pb.authStore.save(pbToken, null);
    const user = await pb.collection("users").authRefresh();

    if (user.record?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden — hanya admin" }, { status: 403 });
    }
  } catch (err) {
    log.error("ERROR ASLI POCKETBASE:", err);
    return NextResponse.json({ error: "Token tidak valid atau sudah expired" }, { status: 401 });
  }

  // 3. Jalankan logika reminder langsung (manual → boleh kirim ulang).
  //    Memanggil core in-process, bukan fetch ke /api/send-reminders, agar tidak
  //    bergantung pada base URL deployment (NEXT_PUBLIC_APP_URL).
  const { status, body } = await runReminders("manual");
  return NextResponse.json(body, { status });
}
