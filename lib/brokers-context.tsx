"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import pb from "./pocketbase";

export interface Broker {
  id: string;           // BRK-0001 (customId)
  name: string;
  address: string;
  idNumber: string;
  bankName: string;
  accountNumber: string;
  phone: string;
}

interface BrokersContextType {
  brokers: Broker[];
  addBroker:    (broker: Omit<Broker, "id">) => Promise<void>;
  updateBroker: (id: string, updates: Partial<Broker>) => Promise<void>;
  deleteBroker: (id: string) => Promise<void>;
}

const BrokersContext = createContext<BrokersContextType | undefined>(undefined);

// Map customId → PocketBase record id
const pbIdMap = new Map<string, string>();

function recordToBroker(r: Record<string, unknown>): Broker {
  const customId = r.customId as string;
  pbIdMap.set(customId, r.id as string);
  return {
    id:            customId,
    name:          r.name          as string,
    address:       r.address       as string,
    idNumber:      r.idNumber      as string,
    bankName:      r.bankName      as string,
    accountNumber: r.accountNumber as string,
    phone:         r.phone         as string,
  };
}

async function generateCustomId(): Promise<string> {
  try {
    const res = await pb.collection("brokers").getList(1, 1, {
      sort: "-customId", fields: "customId",
    });
    if (res.items.length === 0) return "BRK-0001";
    const n = parseInt((res.items[0].customId as string).replace("BRK-", "")) || 0;
    return `BRK-${String(n + 1).padStart(4, "0")}`;
  } catch {
    return "BRK-0001";
  }
}

export function BrokersProvider({ children }: { children: ReactNode }) {
  const [brokers, setBrokers] = useState<Broker[]>([]);

  useEffect(() => {
    pb.collection("brokers")
      .getFullList({ sort: "customId" })
      .then((records) => setBrokers(records.map(recordToBroker)))
      .catch(console.error);
  }, []);

  const addBroker = async (broker: Omit<Broker, "id">) => {
    const customId = await generateCustomId();
    const record = await pb.collection("brokers").create({
      customId,
      name:          broker.name,
      address:       broker.address,
      idNumber:      broker.idNumber,
      bankName:      broker.bankName,
      accountNumber: broker.accountNumber,
      phone:         broker.phone,
    });
    setBrokers((prev) => [...prev, recordToBroker(record)]);
  };

  const updateBroker = async (id: string, updates: Partial<Broker>) => {
    const pbId = pbIdMap.get(id);
    if (!pbId) return;
    const record = await pb.collection("brokers").update(pbId, updates);
    setBrokers((prev) =>
      prev.map((b) => (b.id === id ? recordToBroker(record) : b))
    );
  };

  const deleteBroker = async (id: string) => {
    const pbId = pbIdMap.get(id);
    if (!pbId) return;
    await pb.collection("brokers").delete(pbId);
    pbIdMap.delete(id);
    setBrokers((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <BrokersContext.Provider value={{ brokers, addBroker, updateBroker, deleteBroker }}>
      {children}
    </BrokersContext.Provider>
  );
}

export function useBrokers() {
  const ctx = useContext(BrokersContext);
  if (!ctx) throw new Error("useBrokers must be used within a BrokersProvider");
  return ctx;
}
