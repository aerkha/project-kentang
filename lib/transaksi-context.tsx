"use client";

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import pb from "./pocketbase";

const currentUserId = () => (pb.authStore.record?.id as string | undefined) ?? "";

export interface TransaksiInvestorEntry {
  investorId: string;
  investorName: string;
  nilaiInvestasi: number;
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
  brokerName?: string;
  hasBrokerII?: boolean;
  pctTrader?: number;
  pctMinBun?: number;
  pctBrokerI?: number;
  pctBrokerII?: number;
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

function recordToTransaksi(r: Record<string, unknown>, pbIdMap: Map<string, string>): Transaksi {
  const customId = r.customId as string;
  pbIdMap.set(customId, r.id as string);
  return {
    id:              customId,
    date:            r.date            as string,
    description:     (r.description   as string) || "",
    hpp:             r.hpp             as number,
    kebutuhanModal:  r.kebutuhanModal  as number,
    investorEntries: (r.investorEntries as TransaksiInvestorEntry[]) || [],
    ongkirPerKg:     r.ongkirPerKg     as number,
    hargaJual:       r.hargaJual       as number,
    brokerName:      (r.brokerName     as string) || undefined,
    hasBrokerII:     (r.hasBrokerII    as boolean) || undefined,
    pctTrader:       (r.pctTrader      as number)  ?? undefined,
    pctMinBun:       (r.pctMinBun      as number)  ?? undefined,
    pctBrokerI:      (r.pctBrokerI     as number)  ?? undefined,
    pctBrokerII:     (r.pctBrokerII    as number)  ?? undefined,
  };
}

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

  useEffect(() => {
    pb.collection("transaksis")
      .getFullList({ sort: "customId" })
      .then((records) => setTransaksis(records.map((r) => recordToTransaksi(r, map))))
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addTransaksi = async (t: Omit<Transaksi, "id">) => {
    let customId = await generateCustomId();
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const record = await pb.collection("transaksis").create({
          customId,
          createdBy: currentUserId(),
          updatedBy: currentUserId(),
          date:            t.date,
          description:     t.description || "",
          hpp:             t.hpp,
          kebutuhanModal:  t.kebutuhanModal,
          investorEntries: t.investorEntries,
          ongkirPerKg:     t.ongkirPerKg,
          hargaJual:       t.hargaJual,
          brokerName:      t.brokerName  || "",
          hasBrokerII:     t.hasBrokerII || false,
          pctTrader:       t.pctTrader   ?? null,
          pctMinBun:       t.pctMinBun   ?? null,
          pctBrokerI:      t.pctBrokerI  ?? null,
          pctBrokerII:     t.pctBrokerII ?? null,
        });
        setTransaksis((prev) => [...prev, recordToTransaksi(record, map)]);
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
    const record = await pb.collection("transaksis").update(pbId, { ...updates, updatedBy: currentUserId() });
    setTransaksis((prev) =>
      prev.map((t) => (t.id === id ? recordToTransaksi(record, map) : t))
    );
  };

  const deleteTransaksi = async (id: string) => {
    const pbId = await resolvePbId(id);
    if (!pbId) return;
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
