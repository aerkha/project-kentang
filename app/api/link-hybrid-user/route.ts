import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import { isSameOriginRequest } from "@/lib/pb-error";

/**
 * POST /api/link-hybrid-user
 *
 * Mencari user PocketBase yang sudah ada berdasarkan email (menggunakan
 * service account / superuser) lalu menghubungkan investorId atau brokerId
 * ke record tersebut → menciptakan hybrid user.
 *
 * Diperlukan karena client-side `getFirstListItem` dengan filter `email = "..."`
 * dapat gagal akibat PocketBase API rules pada collection `users` (pencarian
 * berbasis email dibatasi). Service account (superuser) tidak terkena batasan
 * tersebut.
 *
 * Body  : { email: string, role: "investor" | "broker", recordId: string }
 * Auth  : Authorization: Bearer <pb_token>  (harus admin)
 *
 * Response:
 *   200 { linked: true, existingRole: string }
 *   200 { linked: false, reason: "not_found" }   — email belum terdaftar
 *   4xx/5xx { error: string }
 */

interface LinkBody {
  email: string;
  role: "investor" | "broker";
  recordId: string;
}

export async function POST(req: NextRequest) {
  // 0. Tolak cross-origin request.
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden: invalid origin" }, { status: 403 });
  }

  // 1. Verifikasi caller adalah admin menggunakan token mereka.
  const authHeader = req.headers.get("authorization");
  const pbToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!pbToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pbCaller = new PocketBase(process.env.NEXT_PUBLIC_PB_URL);
    pbCaller.authStore.save(pbToken, null);
    const refreshed = await pbCaller.collection("users").authRefresh();
    const callerRole = (refreshed.record as Record<string, unknown>).role as string | undefined;
    if (callerRole !== "admin") {
      return NextResponse.json(
        { error: "Forbidden — hanya admin yang dapat menghubungkan akun hybrid" },
        { status: 403 },
      );
    }
  } catch {
    return NextResponse.json({ error: "Token tidak valid atau sudah kedaluwarsa" }, { status: 401 });
  }

  // 2. Parse body.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const { email, role, recordId } = body as Partial<LinkBody>;
  if (
    typeof email !== "string" || !email.trim()
    || (role !== "investor" && role !== "broker")
    || typeof recordId !== "string" || !recordId.trim()
  ) {
    return NextResponse.json({ error: "Field wajib kurang atau tidak valid" }, { status: 400 });
  }

  // 3. Login sebagai service account (superuser PocketBase).
  const serviceEmail = process.env.PB_SERVICE_EMAIL;
  const servicePassword = process.env.PB_SERVICE_PASSWORD;
  if (!serviceEmail || !servicePassword) {
    return NextResponse.json(
      { error: "Service account belum dikonfigurasi (PB_SERVICE_EMAIL / PB_SERVICE_PASSWORD)" },
      { status: 500 },
    );
  }

  const pbService = new PocketBase(process.env.NEXT_PUBLIC_PB_URL);
  try {
    await pbService.collection("users").authWithPassword(serviceEmail, servicePassword);
  } catch (err) {
    console.error("[link-hybrid-user] service account gagal login:", err);
    return NextResponse.json({ error: "Service account gagal login" }, { status: 500 });
  }

  // 4. Cari user berdasarkan email.
  const escapedEmail = email.trim().replace(/"/g, '\\"');
  let existingUser: Record<string, unknown> | null = null;
  try {
    existingUser = await pbService.collection("users").getFirstListItem(
      `email = "${escapedEmail}"`,
    ) as Record<string, unknown>;
  } catch (err) {
    // 404 = user belum ada → ini normal, berarti tidak ada akun untuk di-link.
    const status = (err as { status?: number }).status;
    if (status === 404) {
      return NextResponse.json({ linked: false, reason: "not_found" });
    }
    // Error lain (500, 403, dll) — log dan laporkan.
    console.error("[link-hybrid-user] gagal mencari user by email:", err);
    return NextResponse.json(
      { error: "Gagal mencari user berdasarkan email", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  // 5. Hubungkan investorId atau brokerId ke user yang sudah ada.
  const userId = existingUser.id as string;
  const existingRole = existingUser.role as string;

  const updateData: Record<string, unknown> = {};
  if (role === "investor") {
    updateData.investorId = recordId;
  } else {
    updateData.brokerId = recordId;
    // Broker sebagai primary role (agar sidebar menampilkan view broker).
    updateData.role = "broker";
  }

  try {
    await pbService.collection("users").update(userId, updateData);
    return NextResponse.json({ linked: true, existingRole });
  } catch (err) {
    console.error("[link-hybrid-user] gagal update user:", err);
    return NextResponse.json(
      { error: "Gagal menghubungkan ID ke akun yang sudah ada", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
