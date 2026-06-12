import { NextRequest, NextResponse } from "next/server";
import { runReminders, runRemindersTest } from "@/lib/send-reminders-core";

/**
 * GET /api/send-reminders
 *
 * Dipanggil oleh cron Vercel (vercel.json: "0 0 * * *" UTC = 07:00 WIB).
 * Auth via CRON_SECRET. Logika inti ada di lib/send-reminders-core.ts agar
 * bisa dipakai bersama oleh /api/trigger-reminder tanpa HTTP self-call.
 *
 *   ?test=true   → kirim 1 PKS dummy ke ADMIN_EMAIL (tidak menyentuh DB)
 *   ?manual=true → boleh kirim ulang (dedup dilewati)
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

  const triggeredBy = req.nextUrl.searchParams.get("manual") === "true" ? "manual" : "cron";
  const { status, body } = await runReminders(triggeredBy);
  return NextResponse.json(body, { status });
}
