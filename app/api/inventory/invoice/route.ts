import { NextRequest, NextResponse } from "next/server";
import PocketBase from "pocketbase";
import { isSameOriginRequest } from "@/lib/pb-error";

function allowedRole(role: unknown): boolean {
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
    if (!allowedRole((caller.record as Record<string, unknown>).role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Token tidak valid atau sudah kedaluwarsa" }, { status: 401 });
  }

  let body: { invoice?: Record<string, unknown>; pengirimanIds?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body tidak valid" }, { status: 400 });
  }

  const invoice = body.invoice ?? {};
  const pengirimanIds = Array.from(new Set(body.pengirimanIds ?? []));
  if (!invoice.buyer || pengirimanIds.length === 0) {
    return NextResponse.json({ error: "Buyer dan minimal satu Surat Jalan wajib dipilih" }, { status: 400 });
  }

  let createdInvoice: { id: string } | null = null;
  const lockedIds: string[] = [];
  try {
    const shipmentRecords = await Promise.all(
      pengirimanIds.map((id) => pb.collection("inv_pengiriman").getOne(id, {
        fields: "id,buyer,sj_id,invoice_id",
      })),
    );

    const buyer = String(invoice.buyer);
    const sjIds = shipmentRecords.map((record) => String(record.sj_id || "")).filter(Boolean);
    const legacyInvoiceRecords = await pb.collection("inv_invoice").getFullList({ fields: "id,ref_sj" });
    const alreadyInvoicedLegacy = legacyInvoiceRecords.some((record) => {
      const refs = String(record.ref_sj || "").split(",").map((ref) => ref.trim());
      return sjIds.some((sjId) => refs.includes(sjId));
    });
    if (alreadyInvoicedLegacy) {
      return NextResponse.json({ error: "Salah satu Surat Jalan sudah tercantum pada invoice sebelumnya" }, { status: 409 });
    }
    const invalid = shipmentRecords.find((record) =>
      record.buyer !== buyer || !record.sj_id || record.invoice_id,
    );
    if (invalid) {
      return NextResponse.json({
        error: "Salah satu Surat Jalan sudah ditagihkan, belum memiliki SJ, atau buyer tidak sesuai",
      }, { status: 409 });
    }

    // `invoice_id` adalah relasi/field status pada inv_pengiriman. PocketBase
    // collection harus memberi rule/constraint yang mencegah overwrite oleh
    // user biasa; pengecekan kedua di sini menutup kasus data lama.
    const invoiceRecord = await pb.collection("inv_invoice").create(invoice);
    createdInvoice = invoiceRecord;

    for (const id of pengirimanIds) {
      const current = await pb.collection("inv_pengiriman").getOne(id, { fields: "id,invoice_id" });
      if (current.invoice_id) {
        throw new Error(`Surat Jalan ${id} sudah terhubung ke invoice lain`);
      }
      await pb.collection("inv_pengiriman").update(id, { invoice_id: invoiceRecord.id });
      lockedIds.push(id);
    }

    const record = await pb.collection("inv_invoice").getOne(invoiceRecord.id);
    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    for (const id of lockedIds) {
      await pb.collection("inv_pengiriman").update(id, { invoice_id: null }).catch(() => null);
    }
    if (createdInvoice) {
      await pb.collection("inv_invoice").delete(createdInvoice.id).catch(() => null);
    }
    const message = error instanceof Error ? error.message : "Gagal menerbitkan invoice";
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
