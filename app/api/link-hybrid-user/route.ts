import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import { isSameOriginRequest } from "@/lib/pb-error";
import { getPbBaseUrl } from "@/lib/pb-base-url";

/**
 * POST /api/link-hybrid-user
 *
 * Mencari user PocketBase yang sudah ada berdasarkan email (menggunakan
 * service account / superuser) lalu menghubungkan investorId atau brokerId
 * ke record tersebut → menciptakan hybrid user.
 *
 * Diperlukan karena PocketBase membatasi filter berbasis `email` pada auth
 * collections untuk non-superuser (email enumeration protection). Filter
 * `email = "..."` pada `getFirstListItem` mengembalikan 404 meskipun record
 * ada. Solusi: gunakan `getFullList()` (tanpa filter email — terbukti bekerja
 * di halaman Users management) lalu cocokkan email di JavaScript.
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
    const pbCaller = new PocketBase(getPbBaseUrl());
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

  const pbService = new PocketBase(getPbBaseUrl());
  try {
    await pbService.collection("users").authWithPassword(serviceEmail, servicePassword);
  } catch (err) {
    console.error("[link-hybrid-user] service account gagal login:", err);
    return NextResponse.json({ error: "Service account gagal login" }, { status: 500 });
  }

  // 4. Cari user berdasarkan email.
  //    Gunakan getFullList() (tanpa filter email) karena PocketBase membatasi
  //    filter berbasis `email` pada auth collections untuk non-superuser.
  //    getFullList() bekerja karena API rule mengizinkan admin melihat semua
  //    user — terbukti di halaman Users management (users-content.tsx).
  //    Email matching dilakukan di JavaScript setelah data di-fetch.
  const targetEmail = email.trim().toLowerCase();
  let existingUser: { id: string; role?: string } | null = null;
  try {
    const allUsers = await pbService.collection("users").getFullList({
      fields: "id,role,email,emailVisibility",
    });
    // Cocokkan email di JS. Beberapa record mungkin punya emailVisibility=false
    // sehingga field email tidak dikembalikan — skip record tersebut.
    existingUser = allUsers.find((u) => {
      const uEmail = (u as Record<string, unknown>).email;
      return typeof uEmail === "string" && uEmail.trim().toLowerCase() === targetEmail;
    }) as { id: string; role?: string } | null;
  } catch (err) {
    console.error("[link-hybrid-user] gagal fetch all users:", err);
    return NextResponse.json(
      { error: "Gagal mengambil daftar user", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  if (!existingUser) {
    return NextResponse.json({ linked: false, reason: "not_found" });
  }

  // 5. Hubungkan investorId atau brokerId ke user yang sudah ada.
  const userId = existingUser.id;
  const existingRole = existingUser.role ?? "";

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
