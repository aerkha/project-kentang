import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import { isSameOriginRequest } from "@/lib/pb-error";
import { getPbBaseUrl } from "@/lib/pb-base-url";

function numberValue(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function escapeFilter(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export async function POST(req: NextRequest) {
  if (!isSameOriginRequest(req)) {
    return NextResponse.json({ error: "Forbidden: invalid origin" }, { status: 403 });
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const pb = new PocketBase(getPbBaseUrl());
  try {
    pb.authStore.save(token, null);
    const caller = await pb.collection("users").authRefresh();
    const role = (caller.record as Record<string, unknown>).role;
    if (role !== "admin" && role !== "user") {
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
    return NextResponse.json({ error: "ID pengiriman wajib diisi" }, { status: 400 });
  }

  let persisted: Record<string, unknown> = {};
  if (mode === "update") {
    try {
      persisted = await pb.collection("inv_pengiriman").getOne(body.id as string);
    } catch {
      return NextResponse.json({ error: "Data pengiriman tidak ditemukan" }, { status: 404 });
    }
  }
  const effectiveData = { ...persisted, ...data };
  const fields = ["qty_grade_a", "qty_grade_b", "qty_grade_c", "qty_grade_baby", "qty_campur"] as const;
  const quantities = Object.fromEntries(fields.map((field) => [field, numberValue(effectiveData[field])])) as Record<typeof fields[number], number>;
  if (Object.values(quantities).some((value) => value < 0)) {
    return NextResponse.json({ error: "Kuantitas pengiriman tidak boleh negatif" }, { status: 400 });
  }
  if (quantities.qty_grade_a + quantities.qty_grade_b + quantities.qty_grade_c + quantities.qty_grade_baby + quantities.qty_campur <= 0) {
    return NextResponse.json({ error: "Kuantitas pengiriman harus lebih besar dari nol" }, { status: 400 });
  }

  try {
    const sortirs = await pb.collection("inv_sortir").getFullList({
      fields: "grade_a,grade_b,grade_c,grade_baby,susut,grade_reject",
    });
    const shipmentFilter = mode === "update"
      ? `id != "${escapeFilter(body.id as string)}"`
      : "id != \"\"";
    const shipments = await pb.collection("inv_pengiriman").getFullList({
      filter: shipmentFilter,
      fields: "qty_grade_a,qty_grade_b,qty_grade_c,qty_grade_baby,qty_campur",
    });

    // Susut dan reject mengurangi bahan mentah, tetapi tidak dapat dikirim.
    // Hanya grade siap jual yang menjadi stok tersedia untuk pengiriman.
    const available = {
      gradeA: sortirs.reduce((sum, row) => sum + numberValue(row.grade_a), 0) - shipments.reduce((sum, row) => sum + numberValue(row.qty_grade_a), 0),
      gradeB: sortirs.reduce((sum, row) => sum + numberValue(row.grade_b), 0) - shipments.reduce((sum, row) => sum + numberValue(row.qty_grade_b), 0),
      gradeC: sortirs.reduce((sum, row) => sum + numberValue(row.grade_c), 0) - shipments.reduce((sum, row) => sum + numberValue(row.qty_grade_c), 0),
      baby: sortirs.reduce((sum, row) => sum + numberValue(row.grade_baby), 0) - shipments.reduce((sum, row) => sum + numberValue(row.qty_grade_baby), 0),
    };
    const requested = {
      gradeA: quantities.qty_grade_a,
      gradeB: quantities.qty_grade_b,
      gradeC: quantities.qty_grade_c,
      baby: quantities.qty_grade_baby,
    };
    if (requested.gradeA > available.gradeA + 0.01 || requested.gradeB > available.gradeB + 0.01 || requested.gradeC > available.gradeC + 0.01 || requested.baby > available.baby + 0.01) {
      return NextResponse.json({ error: "Kuantitas pengiriman melebihi stok grade tersedia" }, { status: 409 });
    }

    const payload = {
      ...data,
      ...quantities,
    };
    const record = mode === "update"
      ? await pb.collection("inv_pengiriman").update(body.id as string, payload)
      : await pb.collection("inv_pengiriman").create(payload);
    return NextResponse.json({ record }, { status: mode === "create" ? 201 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal menyimpan pengiriman";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
