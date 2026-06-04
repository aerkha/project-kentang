"use client";

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import pb from "./pocketbase";

const currentUserId = () => (pb.authStore.record?.id as string | undefined) ?? "";

export interface TransaksiInvestorEntry {
  investorId: string;
  investorName: string;
  investorBrokerName: string;  // "" jika langsung (tanpa broker)
  nilaiInvestasi: number;
  pctTrader:  number;
  pctMinBun:  number;
  pctBrokerI: number;
  pctBrokerII: number;
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

interface TransaksiContextType {
  transaksis: Transaksi[];
  addTransaksi:    (t: Omit<Transaksi, "id">) => Promise<void>;
  updateTransaksi: (id: string, updates: Partial<Transaksi>) => Promise<void>;
  deleteTransaksi: (id: string) => Promise<void>;
}

const TransaksiContext = createContext<TransaksiContextType | undefined>(undefined);

// ── Record mappers ──────────────────────────────────────────────────────────

function recordToTransaksi(
  r: Record<string, unknown>,
  pbIdMap: Map<string, string>,
  investorEntries: TransaksiInvestorEntry[] = [],
): Transaksi {
  const customId = r.customId as string;
  pbIdMap.set(customId, r.id as string);
  return {
    id:              customId,
    date:            r.date           as string,
    description:     (r.description  as string) || "",
    hpp:             r.hpp            as number,
    kebutuhanModal:  r.kebutuhanModal as number,
    investorEntries,
    ongkirPerKg: r.ongkirPerKg as number,
    hargaJual:   r.hargaJual   as number,
  };
}

function recordToInvestorEntry(r: Record<string, unknown>): TransaksiInvestorEntry {
  return {
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
    const res = await pb.collection("transaksis").getList(1, 1, {
      sort: "-customId", fields: "customId",
    });
    if (res.items.length === 0) return "TRX-0001";
    const n = parseInt((res.items[0].customId as string).replace("TRX-", "")) || 0;
    return `TRX-${String(n + 1).padStart(4, "0")}`;
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

/** Hapus semua junction records untuk satu transaksi */
async function deleteInvestorEntries(transaksiPbId: string): Promise<void> {
  const existing = await pb.collection("transaksi_investors").getFullList({
    filter: `transaksiId = "${transaksiPbId}"`,
    fields: "id",
  });
  await Promise.all(existing.map((r) => pb.collection("transaksi_investors").delete(r.id)));
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
        });

        // 2. Buat junction records
        await createInvestorEntries(record.id, t.investorEntries);

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

    // Pisahkan investorEntries dari payload untuk transaksis collection
    const { investorEntries, ...trxUpdates } = updates;

    const record = await pb.collection("transaksis").update(pbId, {
      ...trxUpdates,
      updatedBy: currentUserId(),
    });

    // Jika investorEntries ikut diupdate: hapus lama, buat baru
    let resolvedEntries: TransaksiInvestorEntry[] | undefined;
    if (investorEntries !== undefined) {
      await deleteInvestorEntries(pbId);
      await createInvestorEntries(pbId, investorEntries);
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
    await deleteInvestorEntries(pbId);
    await pb.collection("transaksis").delete(pbId);

    map.delete(id);
    setTransaksis((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <TransaksiContext.Provider value={{ transaksis, addTransaksi, updateTransaksi, deleteTransaksi }}>
      {children}
    </TransaksiContext.Provider>
  );
}

export function useTransaksi() {
  const ctx = useContext(TransaksiContext);
  if (!ctx) throw new Error("useTransaksi must be used within a TransaksiProvider");
  return ctx;
}
