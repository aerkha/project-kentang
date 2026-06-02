"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import pb from "./pocketbase";

export interface Investor {
  id: string;           // INV-0001 (customId)
  name: string;
  address: string;
  brokerName: string;
  idNumber: string;
  bankName: string;
  accountNumber: string;
  phone: string;
  occupation: string;
  investmentAmount: number;
  heirName: string;
  heirBankName: string;
  heirAccountNumber: string;
  isActive?: boolean;
}

interface InvestorsContextType {
  investors: Investor[];
  addInvestor:    (inv: Omit<Investor, "id">) => Promise<void>;
  updateInvestor: (id: string, updates: Partial<Investor>) => Promise<void>;
  deleteInvestor: (id: string) => Promise<void>;
}

const InvestorsContext = createContext<InvestorsContextType | undefined>(undefined);

// Map customId → PocketBase record id (untuk update & delete)
const pbIdMap = new Map<string, string>();

function recordToInvestor(r: Record<string, unknown>): Investor {
  const customId = r.customId as string;
  pbIdMap.set(customId, r.id as string);
  return {
    id:               customId,
    name:             r.name             as string,
    address:          r.address          as string,
    brokerName:       (r.brokerName      as string) || "",
    idNumber:         r.idNumber         as string,
    bankName:         r.bankName         as string,
    accountNumber:    r.accountNumber    as string,
    phone:            r.phone            as string,
    occupation:       (r.occupation      as string) || "",
    investmentAmount: r.investmentAmount as number,
    heirName:         r.heirName         as string,
    heirBankName:     r.heirBankName     as string,
    heirAccountNumber: r.heirAccountNumber as string,
    isActive:         r.isActive === true,
  };
}

async function generateCustomId(): Promise<string> {
  try {
    const res = await pb.collection("investors").getList(1, 1, {
      sort: "-customId", fields: "customId",
    });
    if (res.items.length === 0) return "INV-0001";
    const n = parseInt((res.items[0].customId as string).replace("INV-", "")) || 0;
    return `INV-${String(n + 1).padStart(4, "0")}`;
  } catch {
    return "INV-0001";
  }
}

export function InvestorsProvider({ children }: { children: ReactNode }) {
  const [investors, setInvestors] = useState<Investor[]>([]);

  useEffect(() => {
    pb.collection("investors")
      .getFullList({ sort: "customId" })
      .then((records) => setInvestors(records.map(recordToInvestor)))
      .catch(console.error);
  }, []);

  const addInvestor = async (inv: Omit<Investor, "id">) => {
    const customId = await generateCustomId();
    const record = await pb.collection("investors").create({
      customId,
      name:             inv.name,
      address:          inv.address,
      brokerName:       inv.brokerName || "",
      idNumber:         inv.idNumber,
      bankName:         inv.bankName,
      accountNumber:    inv.accountNumber,
      phone:            inv.phone,
      occupation:       inv.occupation || "",
      investmentAmount: inv.investmentAmount,
      heirName:         inv.heirName,
      heirBankName:     inv.heirBankName,
      heirAccountNumber: inv.heirAccountNumber,
      isActive:         inv.isActive === true,
    });
    setInvestors((prev) => [...prev, recordToInvestor(record)]);
  };

  const updateInvestor = async (id: string, updates: Partial<Investor>) => {
    const pbId = pbIdMap.get(id);
    if (!pbId) return;
    const record = await pb.collection("investors").update(pbId, updates);
    setInvestors((prev) =>
      prev.map((inv) => (inv.id === id ? recordToInvestor(record) : inv))
    );
  };

  const deleteInvestor = async (id: string) => {
    const pbId = pbIdMap.get(id);
    if (!pbId) return;
    await pb.collection("investors").delete(pbId);
    pbIdMap.delete(id);
    setInvestors((prev) => prev.filter((inv) => inv.id !== id));
  };

  return (
    <InvestorsContext.Provider value={{ investors, addInvestor, updateInvestor, deleteInvestor }}>
      {children}
    </InvestorsContext.Provider>
  );
}

export function useInvestors() {
  const ctx = useContext(InvestorsContext);
  if (!ctx) throw new Error("useInvestors must be used within an InvestorsProvider");
  return ctx;
}
