import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import nodemailer from "nodemailer";
import { isSameOriginRequest } from "@/lib/pb-error";

/**
 * POST /api/debug-broker-email
 *
 * Endpoint untuk men-debug apakah broker tertentu punya email di
 * PocketBase dan apakah GMAIL credentials bisa mengirim email ke
 * broker tersebut. Gunakan untuk memastikan konfigurasi sudah benar
 * saat broker fee tidak diterima emailnya.
 *
 * Body: { brokerName: string, dryRun?: boolean }
 * - dryRun=true (default): hanya cek apakah broker ditemukan dan
 *   field email ada. TIDAK mengirim email.
 * - dryRun=false: kirim email percobaan ke broker.brokerEmail untuk
 *   mengetes apakah Nodemailer + GMAIL credentials bekerja.
 */
interface DebugBody {
  brokerName: string;
  dryRun?: boolean;
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
    const caller = await pb.collection("users").authRefresh();
    if ((caller.record as Record<string, unknown>)?.role !== "admin") {
      return NextResponse.json({ error: "Forbidden — hanya admin" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Token invalid" }, { status: 401 });
  }

  let body: DebugBody;
  try {
    body = await req.json() as DebugBody;
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  if (!body.brokerName) {
    return NextResponse.json({ error: "brokerName wajib diisi" }, { status: 400 });
  }

  const escapedName = body.brokerName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  let brokerRecord: { id?: string; name?: string; email?: unknown; phone?: unknown } | null = null;
  let fetchError: string | null = null;
  try {
    brokerRecord = await pb.collection("brokers").getFirstListItem(
      `name = "${escapedName}"`,
      { fields: "id,name,phone,email" },
    );
  } catch (e) {
    fetchError = e instanceof Error ? e.message : String(e);
  }

  const gmailUser = process.env.GMAIL_USER?.trim() || "";
  const gmailPass = process.env.GMAIL_APP_PASSWORD?.trim() || "";
  const envCheck = {
    GMAIL_USER_set: !!gmailUser,
    GMAIL_APP_PASSWORD_set: !!gmailPass,
  };

  const result: Record<string, unknown> = {
    brokerName: body.brokerName,
    brokerFound: !!brokerRecord,
    brokerEmail: brokerRecord?.email ?? null,
    brokerPhone: brokerRecord?.phone ?? null,
    envCheck,
    fetchError,
    dryRun: body.dryRun !== false,
  };

  if (body.dryRun === false) {
    // Mode test: kirim email percobaan
    if (!gmailUser || !gmailPass) {
      return NextResponse.json({
        ...result,
        testEmailSent: false,
        testEmailError: "GMAIL credentials kosong — tidak bisa kirim test email",
      }, { status: 400 });
    }
    if (!brokerRecord?.email) {
      return NextResponse.json({
        ...result,
        testEmailSent: false,
        testEmailError: "Broker tidak punya email di database — tidak bisa kirim test email",
      }, { status: 400 });
    }
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: gmailUser, pass: gmailPass },
      });
      const info = await transporter.sendMail({
        from:    `"MinBun ERP" <${gmailUser}>`,
        to:      String(brokerRecord.email),
        subject: `[MinBun] Test Email — ${body.brokerName}`,
        html: `<p>Ini adalah email test dari MinBun ERP.</p><p>Jika Anda menerima email ini, konfigurasi email broker sudah benar.</p>`,
      });
      result.testEmailSent = true;
      result.testEmailMessageId = info.messageId;
      result.testEmailResponse = info.response;
    } catch (e) {
      result.testEmailSent = false;
      result.testEmailError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json(result);
}
