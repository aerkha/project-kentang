"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface TransaksiInvestorEntry {
  investorId: string;
  investorName: string;
  nilaiInvestasi: number;
}

export interface Transaksi {
  id: string;
  date: string;
  description: string;       // keterangan / label pengiriman (opsional)
  hpp: number;               // Harga Pokok Penjualan per kg (Rp)
  kebutuhanModal: number;    // Kebutuhan Modal per pengiriman (Rp)
  investorEntries: TransaksiInvestorEntry[];
  ongkirPerKg: number;       // Ongkir per KG (Rp)
  hargaJual: number;         // Harga Jual per kg (Rp)
  brokerName?: string;       // Nama Broker I (opsional)
  hasBrokerII?: boolean;     // Broker II ada (Ya/Tidak)
}

/** Hitung semua nilai turunan dari sebuah Transaksi */
export function calcTransaksi(t: Transaksi) {
  const qty          = t.hpp > 0 ? t.kebutuhanModal / t.hpp : 0;
  const totalInvestasi = t.investorEntries.reduce((s, e) => s + e.nilaiInvestasi, 0);
  const selisih      = t.kebutuhanModal - totalInvestasi;
  const totalOngkir  = t.ongkirPerKg * qty;
  const income       = t.hargaJual * qty;
  const profit       = income - (t.kebutuhanModal + totalOngkir);
  return { qty, totalInvestasi, selisih, totalOngkir, income, profit };
}

interface TransaksiContextType {
  transaksis: Transaksi[];
  addTransaksi: (t: Omit<Transaksi, "id">) => void;
  updateTransaksi: (id: string, updates: Partial<Transaksi>) => void;
  deleteTransaksi: (id: string) => void;
}

const TransaksiContext = createContext<TransaksiContextType | undefined>(undefined);

export function TransaksiProvider({ children }: { children: ReactNode }) {
  const [transaksis, setTransaksis] = useState<Transaksi[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("minbun_transaksis");
    if (stored) {
      try { setTransaksis(JSON.parse(stored)); } catch { /* ignore */ }
    }
  }, []);

  const save = (next: Transaksi[]) => {
    setTransaksis(next);
    localStorage.setItem("minbun_transaksis", JSON.stringify(next));
  };

  const generateId = (current: Transaksi[]) => {
    const max = current.reduce((m, x) => {
      const n = parseInt(x.id.replace("TRX-", "")) || 0;
      return n > m ? n : m;
    }, 0);
    return `TRX-${String(max + 1).padStart(4, "0")}`;
  };

  const addTransaksi    = (t: Omit<Transaksi, "id">) =>
    save([...transaksis, { ...t, id: generateId(transaksis) }]);

  const updateTransaksi = (id: string, updates: Partial<Transaksi>) =>
    save(transaksis.map((t) => (t.id === id ? { ...t, ...updates } : t)));

  const deleteTransaksi = (id: string) =>
    save(transaksis.filter((t) => t.id !== id));

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
