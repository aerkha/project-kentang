"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import pb from "./pocketbase";

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

// Map customId → PocketBase record id
const pbIdMap = new Map<string, string>();

function recordToTransaksi(r: Record<string, unknown>): Transaksi {
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
  };
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

  useEffect(() => {
    pb.collection("transaksis")
      .getFullList({ sort: "customId" })
      .then((records) => setTransaksis(records.map(recordToTransaksi)))
      .catch(console.error);
  }, []);

  const addTransaksi = async (t: Omit<Transaksi, "id">) => {
    const customId = await generateCustomId();
    const record = await pb.collection("transaksis").create({
      customId,
      date:            t.date,
      description:     t.description || "",
      hpp:             t.hpp,
      kebutuhanModal:  t.kebutuhanModal,
      investorEntries: t.investorEntries,
      ongkirPerKg:     t.ongkirPerKg,
      hargaJual:       t.hargaJual,
      brokerName:      t.brokerName  || "",
      hasBrokerII:     t.hasBrokerII || false,
    });
    setTransaksis((prev) => [...prev, recordToTransaksi(record)]);
  };

  const updateTransaksi = async (id: string, updates: Partial<Transaksi>) => {
    const pbId = pbIdMap.get(id);
    if (!pbId) return;
    const record = await pb.collection("transaksis").update(pbId, updates);
    setTransaksis((prev) =>
      prev.map((t) => (t.id === id ? recordToTransaksi(record) : t))
    );
  };

  const deleteTransaksi = async (id: string) => {
    const pbId = pbIdMap.get(id);
    if (!pbId) return;
    await pb.collection("transaksis").delete(pbId);
    pbIdMap.delete(id);
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
