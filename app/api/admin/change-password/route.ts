import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import { isSameOriginRequest } from "@/lib/pb-error";

/**
 * POST /api/admin/change-password
 *
 * Mengganti password user lain menggunakan service account PocketBase.
 * Diperlukan karena PocketBase mensyaratkan `oldPassword` jika update dilakukan
 * oleh regular user token — bahkan jika user tersebut punya role "admin".
 * Service account (superuser) dapat mengubah password tanpa `oldPassword`.
 *
 * Body  : { userId: string, password: string, passwordConfirm: string }
 * Auth  : Authorization: Bearer <pb_token>  (harus admin)
 */

interface ChangePasswordBody {
  userId:          string;
  password:        string;
  passwordConfirm: string;
}

export async function POST(req: NextRequest) {
  // 0. m-23: tolak cross-origin request.
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden: invalid origin" }, { status: 403 });
  }

  // 1. Verifikasi caller adalah admin menggunakan token mereka
  const authHeader = req.headers.get("authorization");
  const pbToken    = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!pbToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Cek token valid dan role = admin
  try {
    const pbCaller = new PocketBase(process.env.NEXT_PUBLIC_PB_URL);
    pbCaller.authStore.save(pbToken, null);
    const refreshed = await pbCaller.collection("users").authRefresh();
    const role = (refreshed.record as Record<string, unknown>).role as string | undefined;
    if (role !== "admin") {
      return NextResponse.json({ error: "Forbidden — hanya admin yang dapat mengganti password" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Token tidak valid atau sudah kedaluwarsa" }, { status: 401 });
  }

  // 2. Parse body
  let body: ChangePasswordBody;
  try {
    body = await req.json() as ChangePasswordBody;
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const { userId, password, passwordConfirm } = body;
  if (!userId || !password || !passwordConfirm) {
    return NextResponse.json({ error: "Field wajib kurang" }, { status: 400 });
  }
  if (password !== passwordConfirm) {
    return NextResponse.json({ error: "Password tidak cocok" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password minimal 8 karakter" }, { status: 400 });
  }

  // 3. Login sebagai service account (superuser PocketBase) lalu update password
  const serviceEmail    = process.env.PB_SERVICE_EMAIL;
  const servicePassword = process.env.PB_SERVICE_PASSWORD;
  if (!serviceEmail || !servicePassword) {
    return NextResponse.json(
      { error: "Service account belum dikonfigurasi (PB_SERVICE_EMAIL / PB_SERVICE_PASSWORD)" },
      { status: 500 },
    );
  }

  try {
    const pbService = new PocketBase(process.env.NEXT_PUBLIC_PB_URL);
    await pbService.collection("users").authWithPassword(serviceEmail, servicePassword);
    await pbService.collection("users").update(userId, { password, passwordConfirm });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[change-password] gagal update via service account:", err);
    return NextResponse.json(
      { error: "Gagal mengganti password", detail: String(err) },
      { status: 500 },
    );
  }
}
