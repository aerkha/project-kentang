"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface MoU {
  id: string;
  date: string;
  investorId: string;
  investorName: string;
  investorAddress: string;
  investorOccupation: string;
  investorIdNumber: string;
  investorPhone: string;
  contractPeriod: number; // dalam hari
  investmentAmount: number;
  heirName: string;
  heirRelationship: string;
  heirPhone: string;
  isTerminated?: boolean; // dihentikan manual oleh pengguna
}

interface MouContextType {
  mous: MoU[];
  addMou: (mou: Omit<MoU, "id">) => void;
  updateMou: (id: string, updates: Partial<MoU>) => void;
  deleteMou: (id: string) => void;
}

const MouContext = createContext<MouContextType | undefined>(undefined);

export function MouProvider({ children }: { children: ReactNode }) {
  const [mous, setMous] = useState<MoU[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("minbun_mous");
    if (stored) setMous(JSON.parse(stored));
  }, []);

  const save = (next: MoU[]) => {
    setMous(next);
    localStorage.setItem("minbun_mous", JSON.stringify(next));
  };

  const generateId = (current: MoU[]) => {
    const max = current.reduce((m, x) => {
      const n = parseInt(x.id.replace("MOU-", "")) || 0;
      return n > m ? n : m;
    }, 0);
    return `MOU-${String(max + 1).padStart(4, "0")}`;
  };

  const addMou = (mou: Omit<MoU, "id">) =>
    save([...mous, { ...mou, id: generateId(mous) }]);

  const updateMou = (id: string, updates: Partial<MoU>) =>
    save(mous.map((m) => (m.id === id ? { ...m, ...updates } : m)));

  const deleteMou = (id: string) => save(mous.filter((m) => m.id !== id));

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
