"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import pb from "./pocketbase";

/** Data satu investor dalam MoU (berlaku untuk investor utama maupun co-investor) */
export interface MoUInvestor {
  investorId: string;
  investorName: string;
  investorAddress: string;
  investorOccupation: string;
  investorIdNumber: string;
  investorPhone: string;
  investmentAmount: number;
  heirName: string;
  heirRelationship: string;
  heirPhone: string;
}

export interface MoU {
  id: string;             // MOU-YYYYMM-NNN (customId, e.g. MOU-202505-001)
  date: string;
  // Investor utama (Pihak Kedua I)
  investorId: string;
  investorName: string;
  investorAddress: string;
  investorOccupation: string;
  investorIdNumber: string;
  investorPhone: string;
  investmentAmount: number;
  heirName: string;
  heirRelationship: string;
  heirPhone: string;
  contractPeriod: number;
  isTerminated?: boolean;
  // Investor tambahan (Pihak Kedua II, III, dst.) — opsional
  coInvestors?: MoUInvestor[];
}

interface MouContextType {
  mous: MoU[];
  addMou:    (mou: Omit<MoU, "id">) => Promise<void>;
  updateMou: (id: string, updates: Partial<MoU>) => Promise<void>;
  deleteMou: (id: string) => Promise<void>;
}

const MouContext = createContext<MouContextType | undefined>(undefined);

// Map customId → PocketBase record id
const pbIdMap = new Map<string, string>();

function recordToMou(r: Record<string, unknown>): MoU {
  const customId = r.customId as string;
  pbIdMap.set(customId, r.id as string);

  // coInvestors disimpan sebagai JSON string atau array di PocketBase
  let coInvestors: MoUInvestor[] | undefined;
  const raw = r.coInvestors;
  if (raw) {
    try {
      coInvestors = typeof raw === "string" ? JSON.parse(raw) : (raw as MoUInvestor[]);
    } catch {
      coInvestors = undefined;
    }
  }

  return {
    id:                 customId,
    date:               r.date               as string,
    investorId:         r.investorId         as string,
    investorName:       r.investorName       as string,
    investorAddress:    r.investorAddress    as string,
    investorOccupation: (r.investorOccupation as string) || "",
    investorIdNumber:   r.investorIdNumber   as string,
    investorPhone:      r.investorPhone      as string,
    contractPeriod:     r.contractPeriod     as number,
    investmentAmount:   r.investmentAmount   as number,
    heirName:           r.heirName           as string,
    heirRelationship:   r.heirRelationship   as string,
    heirPhone:          r.heirPhone          as string,
    isTerminated:       (r.isTerminated      as boolean) || false,
    coInvestors,
  };
}

/**
 * Format ID: MOU-YYYYMM-NNN
 * Contoh: MOU-202505-001
 * Sequence di-reset setiap bulan untuk memudahkan identifikasi & pengarsipan.
 */
async function generateCustomId(date: string): Promise<string> {
  // "2025-05-14" → "202505"
  const ym     = date.slice(0, 7).replace("-", "");
  const prefix = `MOU-${ym}-`;
  try {
    const res = await pb.collection("mous").getFullList({
      filter: `customId ~ "${prefix}"`,
      fields: "customId",
    });
    const max = res.reduce((m, r) => {
      const cid = r.customId as string;
      if (!cid.startsWith(prefix)) return m;
      const n = parseInt(cid.slice(prefix.length)) || 0;
      return n > m ? n : m;
    }, 0);
    return `${prefix}${String(max + 1).padStart(3, "0")}`;
  } catch {
    return `${prefix}001`;
  }
}

export function MouProvider({ children }: { children: ReactNode }) {
  const [mous, setMous] = useState<MoU[]>([]);

  useEffect(() => {
    pb.collection("mous")
      .getFullList({ sort: "customId" })
      .then((records) => setMous(records.map(recordToMou)))
      .catch(console.error);
  }, []);

  const addMou = async (mou: Omit<MoU, "id">) => {
    const customId = await generateCustomId(mou.date);
    const record = await pb.collection("mous").create({
      customId,
      date:               mou.date,
      investorId:         mou.investorId,
      investorName:       mou.investorName,
      investorAddress:    mou.investorAddress,
      investorOccupation: mou.investorOccupation || "",
      investorIdNumber:   mou.investorIdNumber,
      investorPhone:      mou.investorPhone,
      contractPeriod:     mou.contractPeriod,
      investmentAmount:   mou.investmentAmount,
      heirName:           mou.heirName,
      heirRelationship:   mou.heirRelationship,
      heirPhone:          mou.heirPhone,
      isTerminated:       mou.isTerminated || false,
      coInvestors:        mou.coInvestors ?? [],
    });
    setMous((prev) => [...prev, recordToMou(record)]);
  };

  const updateMou = async (id: string, updates: Partial<MoU>) => {
    const pbId = pbIdMap.get(id);
    if (!pbId) return;
    const record = await pb.collection("mous").update(pbId, updates);
    setMous((prev) =>
      prev.map((m) => (m.id === id ? recordToMou(record) : m))
    );
  };

  const deleteMou = async (id: string) => {
    const pbId = pbIdMap.get(id);
    if (!pbId) return;
    await pb.collection("mous").delete(pbId);
    pbIdMap.delete(id);
    setMous((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <MouContext.Provider value={{ mous, addMou, updateMou, deleteMou }}>
      {children}
    </MouContext.Provider>
  );
}

export function useMou() {
  const ctx = useContext(MouContext);
  if (!ctx) throw new Error("useMou must be used within a MouProvider");
  return ctx;
}
