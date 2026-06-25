"use client";

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import pb from "./pocketbase";

const currentUserId = () => (pb.authStore.record?.id as string | undefined) ?? "";

export interface TransaksiInvestorEntry {
  mouId: string;              // ID PKS yang dipakai; "" untuk entry lama
  investorId: string;
  investorName: string;
  investorBrokerName: string;  // "" jika langsung (tanpa broker)
  nilaiInvestasi: number;
  pctTrader:  number;
  pctMinBun:  number;
  pctBrokerI: number;
  pctBrokerII: number;
}

export type TransaksiStatus = "berjalan" | "perbarui" | "selesai" | "bermasalah";

export const TRANSAKSI_STATUS_LABEL: Record<TransaksiStatus, string> = {
  berjalan:   "Berjalan",
  perbarui:   "Perbarui",
  selesai:    "Selesai",
  bermasalah: "Bermasalah",
};

/**
 * Status efektif. "perbarui" bukan lagi status otomatis — sisa hari periode
 * ditampilkan terpisah, dan pembaruan dilakukan manual lewat tombol aksi
 * (status "selesai" → "berjalan"). Record lama berstatus "perbarui"
 * diperlakukan sebagai "berjalan".
 */
export function effectiveStatus(t: { status: TransaksiStatus; date: string }): TransaksiStatus {
  if (t.status === "perbarui") return "berjalan";
  return t.status;
}

/**
 * Status aktif investor diturunkan sepenuhnya dari transaksi — transaksi adalah
 * satu-satunya sumber kebenaran (PKS hanya formalitas). Tidak ada flag isActive
 * tersimpan yang bisa drift.
 *
 * Investor AKTIF ⟺ punya ≥1 transaksi berstatus "berjalan" atau "bermasalah"
 * (modal belum kembali) dengan nilai investasi > 0. Tanpa partisipasi semacam
 * itu — termasuk modal yang masih parkir / investor baru — investor NONAKTIF.
 */
const ACTIVE_TRANSAKSI_STATUS = new Set<TransaksiStatus>(["berjalan", "bermasalah"]);

export function isInvestorActive(investorId: string, transaksis: Transaksi[]): boolean {
  return transaksis.some(
    (t) =>
      ACTIVE_TRANSAKSI_STATUS.has(effectiveStatus(t)) &&
      t.investorEntries.some((e) => e.investorId === investorId && e.nilaiInvestasi > 0),
  );
}

/** Set ID semua investor aktif — sekali lewat, untuk dipakai di list/dashboard. */
export function activeInvestorIds(transaksis: Transaksi[]): Set<string> {
  const ids = new Set<string>();
  for (const t of transaksis) {
    if (!ACTIVE_TRANSAKSI_STATUS.has(effectiveStatus(t))) continue;
    for (const e of t.investorEntries) {
      if (e.nilaiInvestasi > 0) ids.add(e.investorId);
    }
  }
  return ids;
}

export interface Transaksi {
  id: string;             // TRX-0001 (customId)
  date: string;
  description: string;
  hpp: number;
  kebutuhanModal: number;
  investorEntries: TransaksiInvestorEntry[];
  ongkirPerKg: number;
  hargaJual: number;
  status: TransaksiStatus;
  catatanAkhir: string;
  // Pelacakan bagi hasil — digunakan oleh halaman Reminder
  bagiHasilChecks?: Record<string, boolean>;
  bagiHasilDone?: boolean;
  buktiInvestor?: string;
  buktiBroker?: string;
  buktiTrader?: string;
  buktiMinBun?: string;
}

/** Hitung semua nilai turunan dari sebuah Transaksi */
export function calcTransaksi(t: Transaksi) {
  const qty            = t.hpp > 0 ? t.kebutuhanModal / t.hpp : 0;
  const totalInvestasi = t.investorEntries.reduce((s, e) => s + e.nilaiInvestasi, 0);
  const selisih        = t.kebutuhanModal - totalInvestasi;
  const totalOngkir    = t.ongkirPerKg * qty;
  const income         = t.hargaJual * qty;
  const profit         = income - (t.kebutuhanModal + totalOngkir);
  return { qty, totalInvestasi, selisih, totalOngkir, income, profit };
}

// Mapping keterangan → nama field file bukti di PocketBase (koleksi transaksis)
export const BUKTI_FIELD_TRX: Record<string, string> = {
  Investor: "buktiInvestor",
  Broker:   "buktiBroker",
  Trader:   "buktiTrader",
  MinBun:   "buktiMinBun",
};

const PB_BASE = process.env.NEXT_PUBLIC_PB_URL || "http://127.0.0.1:8090";

function pbFileUrlTrx(pbRecordId: string, fieldValue: unknown): string {
  const filename = Array.isArray(fieldValue)
    ? (fieldValue[0] as string) || ""
    : (fieldValue as string) || "";
  return filename ? `${PB_BASE}/api/files/transaksis/${pbRecordId}/${filename}` : "";
}

interface TransaksiContextType {
  transaksis: Transaksi[];
  addTransaksi:    (t: Omit<Transaksi, "id">) => Promise<void>;
  updateTransaksi: (id: string, updates: Partial<Transaksi>) => Promise<void>;
  deleteTransaksi: (id: string) => Promise<void>;
  /** Sinkronkan nama & broker investor yang ter-denormalisasi di entry transaksi */
  syncInvestorInfo: (investorId: string, investorName: string, investorBrokerName: string) => Promise<void>;
  /** Upload bukti transfer untuk satu penerima bagi hasil */
  uploadBuktiTransaksi: (id: string, keterangan: string, file: File) => Promise<string>;
}

const TransaksiContext = createContext<TransaksiContextType | undefined>(undefined);

// ── Record mappers ──────────────────────────────────────────────────────────

const VALID_STATUSES = new Set<TransaksiStatus>(["berjalan", "perbarui", "selesai", "bermasalah"]);
function normalizeStatus(s: string): TransaksiStatus {
  if (VALID_STATUSES.has(s as TransaksiStatus)) return s as TransaksiStatus;
  // backward-compat: old values
  if (s === "rencana" || s === "batal") return "berjalan";
  return "berjalan";
}

function recordToTransaksi(
  r: Record<string, unknown>,
  pbIdMap: Map<string, string>,
  investorEntries: TransaksiInvestorEntry[] = [],
): Transaksi {
  const customId   = r.customId as string;
  const pbRecordId = r.id as string;
  pbIdMap.set(customId, pbRecordId);
  return {
    id:              customId,
    date:            r.date           as string,
    description:     (r.description  as string) || "",
    hpp:             r.hpp            as number,
    kebutuhanModal:  r.kebutuhanModal as number,
    investorEntries,
    ongkirPerKg:  r.ongkirPerKg as number,
    hargaJual:    r.hargaJual   as number,
    status:       (normalizeStatus(r.status as string)),
    catatanAkhir: (r.catatanAkhir as string) || "",
    bagiHasilDone: (r.bagiHasilDone as boolean) || false,
    bagiHasilChecks: (() => {
      const raw = r.bagiHasilChecks;
      if (!raw) return {};
      if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, boolean>;
      try { return JSON.parse(raw as string) as Record<string, boolean>; }
      catch { return {}; }
    })(),
    buktiInvestor: pbFileUrlTrx(pbRecordId, r.buktiInvestor),
    buktiBroker:   pbFileUrlTrx(pbRecordId, r.buktiBroker),
    buktiTrader:   pbFileUrlTrx(pbRecordId, r.buktiTrader),
    buktiMinBun:   pbFileUrlTrx(pbRecordId, r.buktiMinBun),
  };
}

function recordToInvestorEntry(r: Record<string, unknown>): TransaksiInvestorEntry {
  return {
    mouId:              (r.mouId              as string) || "",
    investorId:         r.investorId         as string,
    investorName:       r.investorName       as string,
    investorBrokerName: (r.investorBrokerName as string) || "",
    nilaiInvestasi:     r.nilaiInvestasi      as number,
    pctTrader:          (r.pctTrader          as number) ?? 10,
    pctMinBun:          (r.pctMinBun          as number) ?? 5,
    pctBrokerI:         (r.pctBrokerI         as number) ?? 0,
    pctBrokerII:        (r.pctBrokerII        as number) ?? 0,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function isCustomIdConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const data = (err as { data?: { data?: { customId?: { code?: string } } } }).data;
  return data?.data?.customId?.code === "validation_not_unique";
}

async function generateCustomId(): Promise<string> {
  try {
    // Cari nilai numerik tertinggi secara eksplisit — sort leksikografis tidak aman
    // karena "TRX-0009" > "TRX-0010" secara alfabet.
    const res = await pb.collection("transaksis").getFullList({ fields: "customId" });
    if (res.length === 0) return "TRX-0001";
    const max = res.reduce((m, r) => {
      const n = parseInt((r.customId as string).replace("TRX-", "")) || 0;
      return n > m ? n : m;
    }, 0);
    return `TRX-${String(max + 1).padStart(4, "0")}`;
  } catch {
    return "TRX-0001";
  }
}

/** Buat junction records di transaksi_investors untuk satu transaksi */
async function createInvestorEntries(
  transaksiPbId: string,
  entries: TransaksiInvestorEntry[],
): Promise<void> {
  await Promise.all(
    entries.map((e) =>
      pb.collection("transaksi_investors").create({
        transaksiId:         transaksiPbId,
        mouId:               e.mouId ?? "",
        investorId:          e.investorId,
        investorName:        e.investorName,
        investorBrokerName:  e.investorBrokerName,
        nilaiInvestasi:      e.nilaiInvestasi,
        pctTrader:           e.pctTrader,
        pctMinBun:           e.pctMinBun,
        pctBrokerI:          e.pctBrokerI,
        pctBrokerII:         e.pctBrokerII,
      }),
    ),
  );
}

/** Ambil ID semua junction records milik satu transaksi */
async function listInvestorEntryIds(transaksiPbId: string): Promise<string[]> {
  const existing = await pb.collection("transaksi_investors").getFullList({
    filter: `transaksiId = "${transaksiPbId}"`,
    fields: "id",
  });
  return existing.map((r) => r.id);
}

/** Hapus junction records berdasarkan ID */
async function deleteInvestorEntriesByIds(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => pb.collection("transaksi_investors").delete(id)));
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function TransaksiProvider({ children }: { children: ReactNode }) {
  const [transaksis, setTransaksis] = useState<Transaksi[]>([]);
  const pbIdMapRef = useRef(new Map<string, string>());
  const map = pbIdMapRef.current;

  const resolvePbId = async (customId: string): Promise<string | null> => {
    const cached = map.get(customId);
    if (cached) return cached;
    try {
      const res = await pb.collection("transaksis").getFirstListItem(
        `customId = "${customId}"`,
        { fields: "id,customId" },
      );
      map.set(customId, res.id);
      return res.id;
    } catch { return null; }
  };

  // Load transaksis + investor entries secara paralel, lalu join di memory.
  // Gunakan allSettled agar transaksis tetap ter-load meski transaksi_investors
  // belum dibuat di PocketBase (koleksi baru, mungkin belum ada).
  useEffect(() => {
    Promise.allSettled([
      pb.collection("transaksis").getFullList({ sort: "customId" }),
      pb.collection("transaksi_investors").getFullList({ sort: "created" }),
    ]).then(([trxResult, invResult]) => {
      if (trxResult.status === "rejected") {
        console.error("[transaksi] gagal load transaksis:", trxResult.reason);
        return;
      }

      const trxRecords = trxResult.value;

      // Kelompokkan investor entries by transaksi PB record ID
      const invMap = new Map<string, TransaksiInvestorEntry[]>();
      if (invResult.status === "fulfilled") {
        for (const r of invResult.value) {
          const tid = r.transaksiId as string;
          if (!invMap.has(tid)) invMap.set(tid, []);
          invMap.get(tid)!.push(recordToInvestorEntry(r as Record<string, unknown>));
        }
      } else {
        // transaksi_investors belum ada — transaksis tetap ditampilkan dengan investorEntries kosong
        console.warn("[transaksi] transaksi_investors belum tersedia:", invResult.reason);
      }

      setTransaksis(
        trxRecords.map((r) =>
          recordToTransaksi(
            r as Record<string, unknown>,
            map,
            invMap.get(r.id) ?? [],
          ),
        ),
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── CRUD ──────────────────────────────────────────────────────────────────

  const addTransaksi = async (t: Omit<Transaksi, "id">) => {
    let customId = await generateCustomId();
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        // 1. Buat transaksi (tanpa investorEntries)
        const record = await pb.collection("transaksis").create({
          customId,
          createdBy:      currentUserId(),
          updatedBy:      currentUserId(),
          date:           t.date,
          description:    t.description || "",
          hpp:            t.hpp,
          kebutuhanModal: t.kebutuhanModal,
          ongkirPerKg:    t.ongkirPerKg,
          hargaJual:      t.hargaJual,
          status:         t.status || "rencana",
          catatanAkhir:   t.catatanAkhir || "",
        });

        // 2. Buat junction records — hapus induk jika gagal agar tidak orphan
        try {
          await createInvestorEntries(record.id, t.investorEntries);
        } catch (entryErr) {
          await pb.collection("transaksis").delete(record.id).catch(() => null);
          throw entryErr;
        }

        setTransaksis((prev) => [
          ...prev,
          recordToTransaksi(record as Record<string, unknown>, map, t.investorEntries),
        ]);
        return;
      } catch (err) {
        if (isCustomIdConflict(err) && attempt < 4) {
          customId = await generateCustomId();
          continue;
        }
        throw err;
      }
    }
  };

  const updateTransaksi = async (id: string, updates: Partial<Transaksi>) => {
    const pbId = await resolvePbId(id);
    if (!pbId) return;

    // Pisahkan investorEntries dan bagiHasilChecks dari payload utama
    const { investorEntries, bagiHasilChecks, ...trxUpdates } = updates;

    const pbUpdates: Record<string, unknown> = { ...trxUpdates, updatedBy: currentUserId() };
    if (bagiHasilChecks !== undefined) {
      pbUpdates.bagiHasilChecks = JSON.stringify(bagiHasilChecks);
    }

    const record = await pb.collection("transaksis").update(pbId, pbUpdates);

    // Jika investorEntries ikut diupdate:
    // Catat ID entry lama SEBELUM membuat yang baru, lalu hapus berdasarkan ID —
    // tidak bergantung pada urutan `created` (granularitas detik, bisa tertukar).
    // Entry baru dibuat dulu agar tidak ada data loss jika create gagal di tengah.
    let resolvedEntries: TransaksiInvestorEntry[] | undefined;
    if (investorEntries !== undefined) {
      const oldEntryIds = await listInvestorEntryIds(pbId);
      await createInvestorEntries(pbId, investorEntries);
      await deleteInvestorEntriesByIds(oldEntryIds);
      resolvedEntries = investorEntries;
    }

    setTransaksis((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        return recordToTransaksi(
          record as Record<string, unknown>,
          map,
          resolvedEntries ?? t.investorEntries,
        );
      }),
    );
  };

  const deleteTransaksi = async (id: string) => {
    const pbId = await resolvePbId(id);
    if (!pbId) return;

    // Hapus junction records dulu, baru transaksi
    await deleteInvestorEntriesByIds(await listInvestorEntryIds(pbId));
    await pb.collection("transaksis").delete(pbId);

    map.delete(id);
    setTransaksis((prev) => prev.filter((t) => t.id !== id));
  };

  /**
   * Perbarui investorName / investorBrokerName di semua entry transaksi milik
   * seorang investor. Dipanggil setelah data investor diedit agar tampilan
   * broker & nama di halaman Transaksi tidak menyimpan data lama.
   */
  const syncInvestorInfo = async (
    investorId: string,
    investorName: string,
    investorBrokerName: string,
  ) => {
    const records = await pb.collection("transaksi_investors").getFullList({
      filter: `investorId = "${investorId}"`,
      fields: "id,investorName,investorBrokerName",
    });
    const stale = records.filter(
      (r) => r.investorName !== investorName || (r.investorBrokerName || "") !== investorBrokerName,
    );
    if (stale.length === 0) return;

    await Promise.all(
      stale.map((r) =>
        pb.collection("transaksi_investors").update(r.id, { investorName, investorBrokerName }),
      ),
    );

    setTransaksis((prev) =>
      prev.map((t) => ({
        ...t,
        investorEntries: t.investorEntries.map((e) =>
          e.investorId === investorId ? { ...e, investorName, investorBrokerName } : e,
        ),
      })),
    );
  };

  const uploadBuktiTransaksi = async (id: string, keterangan: string, file: File): Promise<string> => {
    const pbId = await resolvePbId(id);
    if (!pbId) throw new Error(`Transaksi "${id}" tidak ditemukan.`);
    const fieldName = BUKTI_FIELD_TRX[keterangan];
    if (!fieldName) throw new Error(`Keterangan "${keterangan}" tidak dikenali.`);
    const fd = new FormData();
    fd.append(fieldName, file);
    const record = await pb.collection("transaksis").update(pbId, fd);
    const url = pbFileUrlTrx(pbId, record[fieldName]);
    setTransaksis((prev) =>
      prev.map((t) => t.id !== id ? t : { ...t, [fieldName]: url }),
    );
    return url;
  };

  return (
    <TransaksiContext.Provider value={{ transaksis, addTransaksi, updateTransaksi, deleteTransaksi, syncInvestorInfo, uploadBuktiTransaksi }}>
      {children}
    </TransaksiContext.Provider>
  );
}

export function useTransaksi() {
  const ctx = useContext(TransaksiContext);
  if (!ctx) throw new Error("useTransaksi must be used within a TransaksiProvider");
  return ctx;
}
