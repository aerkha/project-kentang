import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import { isSameOriginRequest } from "@/lib/pb-error";

function fieldNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function isAllowedRole(role: unknown): boolean {
  return role === "admin" || role === "user";
}

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden: invalid origin" }, { status: 403 });
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pb = new PocketBase(process.env.NEXT_PUBLIC_PB_URL);
  try {
    pb.authStore.save(token, null);
    const caller = await pb.collection("users").authRefresh();
    if (!isAllowedRole((caller.record as Record<string, unknown>).role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Token tidak valid atau sudah kedaluwarsa" }, { status: 401 });
  }

  let body: { mode?: "create" | "update"; id?: string; data?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const data = body.data ?? {};
  const mode = body.mode === "update" ? "update" : "create";
  if (mode === "update" && !body.id) {
    return NextResponse.json({ error: "ID sortir wajib diisi" }, { status: 400 });
  }

  const pembelianId = String(data.pembelian_id ?? "");
  if (!pembelianId) {
    return NextResponse.json({ error: "pembelian_id wajib diisi" }, { status: 400 });
  }

  const gradeA = fieldNumber(data.grade_a);
  const gradeB = fieldNumber(data.grade_b);
  const gradeC = fieldNumber(data.grade_c);
  const gradeBaby = fieldNumber(data.grade_baby);
  const gradeReject = fieldNumber(data.grade_reject);
  const susut = fieldNumber(data.susut);
  const quantities = [gradeA, gradeB, gradeC, gradeBaby, gradeReject, susut];
  if (quantities.some((value) => value < 0)) {
    return NextResponse.json({ error: "Grade, reject, dan susut tidak boleh negatif" }, { status: 400 });
  }
  if (quantities.every((value) => value === 0)) {
    return NextResponse.json({ error: "Hasil sortir tidak boleh kosong" }, { status: 400 });
  }

  try {
    const pembelian = await pb.collection("inv_pembelian").getOne(pembelianId, { fields: "id,tonase_gudang" });
    const existing = await pb.collection("inv_sortir").getFullList({
      filter: `pembelian_id = "${pembelianId.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`,
      fields: "id,grade_a,grade_b,grade_c,grade_baby,grade_reject,susut",
    });

    const existingTotal = existing
      .filter((record) => mode !== "update" || record.id !== body.id)
      .reduce((total, record) => total
        + fieldNumber(record.grade_a)
        + fieldNumber(record.grade_b)
        + fieldNumber(record.grade_c)
        + fieldNumber(record.grade_baby)
        + fieldNumber(record.grade_reject)
        + fieldNumber(record.susut), 0);
    const requestedTotal = gradeA + gradeB + gradeC + gradeBaby + gradeReject + susut;
    const available = fieldNumber(pembelian.tonase_gudang);
    if (existingTotal + requestedTotal > available + 0.01) {
      return NextResponse.json({
        error: `Total sortir + susut (${(existingTotal + requestedTotal).toFixed(2)} kg) melebihi tonase gudang (${available.toFixed(2)} kg)`,
      }, { status: 409 });
    }

    const payload = {
      ...data,
      pembelian_id: pembelianId,
      grade_a: gradeA,
      grade_b: gradeB,
      grade_c: gradeC,
      grade_baby: gradeBaby,
      grade_reject: gradeReject,
      susut,
    };
    const record = mode === "update"
      ? await pb.collection("inv_sortir").update(body.id as string, payload)
      : await pb.collection("inv_sortir").create(payload);

    await pb.collection("inv_pembelian").update(pembelianId, { status: "Selesai" });
    return NextResponse.json({ record });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menyimpan hasil sortir";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
