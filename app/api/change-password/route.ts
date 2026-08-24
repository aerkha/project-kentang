import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import { isSameOriginRequest } from "@/lib/pb-error";

/**
 * POST /api/change-password
 *
 * Self-service: user mengganti password akunnya sendiri.
 * Berbeda dengan /api/admin/change-password (yang memakai service account
 * dan hanya untuk admin mengganti password user lain), endpoint ini
 * mengizinkan SEMUA user terautentikasi mengganti password miliknya sendiri.
 *
 * PocketBase mensyaratkan field `oldPassword` bila regular user mengupdate
 * record-nya sendiri — jadi kita memverifikasi oldPassword secara implicit
 * di sisi PocketBase dengan menggunakan token caller sendiri (bukan service
 * account) saat melakukan `update`.
 *
 * Body  : { oldPassword: string, password: string, passwordConfirm: string }
 * Auth  : Authorization: Bearer <pb_token>
 */

interface ChangePasswordBody {
  oldPassword:     string;
  password:        string;
  passwordConfirm: string;
}

export async function POST(req: NextRequest) {
  // 0. m-23: tolak cross-origin request.
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden: invalid origin" }, { status: 403 });
  }

  // 1. Verifikasi caller terautentikasi menggunakan token mereka.
  const authHeader = req.headers.get("authorization");
  const pbToken    = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!pbToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let callerId: string;
  try {
    const pbCaller = new PocketBase(process.env.NEXT_PUBLIC_PB_URL);
    pbCaller.authStore.save(pbToken, null);
    const refreshed = await pbCaller.collection("users").authRefresh();
    callerId = (refreshed.record as Record<string, unknown>).id as string;
    if (!callerId) {
      return NextResponse.json({ error: "Token tidak valid atau sudah kedaluwarsa" }, { status: 401 });
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

  const { oldPassword, password, passwordConfirm } = body as Partial<ChangePasswordBody>;
  if (
    typeof oldPassword !== "string" || !oldPassword
    || typeof password !== "string" || !password
    || typeof passwordConfirm !== "string" || !passwordConfirm
  ) {
    return NextResponse.json({ error: "Field wajib kurang" }, { status: 400 });
  }
  if (password !== passwordConfirm) {
    return NextResponse.json({ error: "Password baru tidak cocok" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password minimal 8 karakter" }, { status: 400 });
  }
  if (oldPassword === password) {
    return NextResponse.json(
      { error: "Password baru harus berbeda dari password lama" },
      { status: 400 },
    );
  }

  // 3. Update record milik caller sendiri memakai token caller.
  //    PocketBase akan memverifikasi oldPassword di sisi server.
  try {
    const pbCaller = new PocketBase(process.env.NEXT_PUBLIC_PB_URL);
    pbCaller.authStore.save(pbToken, null);
    await pbCaller.collection("users").update(callerId, {
      oldPassword,
      password,
      passwordConfirm,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[change-password] gagal update password sendiri:", err);
    // PocketBase mengembalikan 400 jika oldPassword salah.
    const status = err instanceof Error && "status" in err ? (err as { status: number }).status : 0;
    if (status === 400) {
      return NextResponse.json(
        { error: "Password lama salah atau format password baru tidak valid" },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: "Gagal mengganti password" },
      { status: 500 },
    );
  }
}
