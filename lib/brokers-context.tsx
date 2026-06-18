"use client";

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import pb from "./pocketbase";

const currentUserId = () => (pb.authStore.record?.id as string | undefined) ?? "";

export interface Broker {
  id: string;           // BRK-0001 (customId)
  name: string;
  address: string;
  idNumber: string;
  bankName: string;
  accountNumber: string;
  phone: string;
  email: string;
}

interface BrokersContextType {
  brokers: Broker[];
  addBroker:     (broker: Omit<Broker, "id">) => Promise<void>;
  updateBroker:  (id: string, updates: Partial<Broker>) => Promise<void>;
  deleteBroker:  (id: string) => Promise<void>;
  reloadBrokers: () => Promise<void>;
}

const BrokersContext = createContext<BrokersContextType | undefined>(undefined);

function recordToBroker(r: Record<string, unknown>, pbIdMap: Map<string, string>): Broker {
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
    email:         (r.email        as string) || "",
  };
}

function isCustomIdConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const data = (err as { data?: { data?: { customId?: { code?: string } } } }).data;
  return data?.data?.customId?.code === "validation_not_unique";
}

export async function generateBrokerCustomId(): Promise<string> {
  try {
    // Cari nilai numerik tertinggi secara eksplisit — sort leksikografis tidak aman
    // karena "BRK-0009" > "BRK-0010" secara alfabet.
    const res = await pb.collection("brokers").getFullList({ fields: "customId" });
    if (res.length === 0) return "BRK-0001";
    const max = res.reduce((m, r) => {
      const n = parseInt((r.customId as string).replace("BRK-", "")) || 0;
      return n > m ? n : m;
    }, 0);
    return `BRK-${String(max + 1).padStart(4, "0")}`;
  } catch {
    return "BRK-0001";
  }
}

export function BrokersProvider({ children }: { children: ReactNode }) {
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const pbIdMapRef = useRef(new Map<string, string>());
  const map = pbIdMapRef.current;

  const resolvePbId = async (customId: string): Promise<string | null> => {
    const cached = map.get(customId);
    if (cached) return cached;
    try {
      const res = await pb.collection("brokers").getFirstListItem(
        `customId = "${customId}"`,
        { fields: "id,customId" },
      );
      map.set(customId, res.id);
      return res.id;
    } catch { return null; }
  };

  useEffect(() => {
    pb.collection("brokers")
      .getFullList({ sort: "customId" })
      .then((records) => setBrokers(records.map((r) => recordToBroker(r, map))))
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadBrokers = async () => {
    const records = await pb.collection("brokers").getFullList({ sort: "customId" });
    map.clear();
    setBrokers(records.map((r) => recordToBroker(r, map)));
  };

  const addBroker = async (broker: Omit<Broker, "id">) => {
    let customId = await generateBrokerCustomId();
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const record = await pb.collection("brokers").create({
          customId,
          createdBy: currentUserId(),
          updatedBy: currentUserId(),
          name:          broker.name,
          address:       broker.address,
          idNumber:      broker.idNumber,
          bankName:      broker.bankName,
          accountNumber: broker.accountNumber,
          phone:         broker.phone,
          email:         broker.email || "",
        });
        setBrokers((prev) => [...prev, recordToBroker(record, map)]);
        return;
      } catch (err) {
        if (isCustomIdConflict(err) && attempt < 4) {
          customId = await generateBrokerCustomId();
          continue;
        }
        throw err;
      }
    }
  };

  const updateBroker = async (id: string, updates: Partial<Broker>) => {
    const pbId = await resolvePbId(id);
    if (!pbId) return;
    const record = await pb.collection("brokers").update(pbId, { ...updates, updatedBy: currentUserId() });
    setBrokers((prev) =>
      prev.map((b) => (b.id === id ? recordToBroker(record, map) : b))
    );
  };

  const deleteBroker = async (id: string) => {
    const pbId = await resolvePbId(id);
    if (!pbId) return;
    await pb.collection("brokers").delete(pbId);
    map.delete(id);
    setBrokers((prev) => prev.filter((b) => b.id !== id));
  };

  return (
    <BrokersContext.Provider value={{ brokers, addBroker, updateBroker, deleteBroker, reloadBrokers }}>
      {children}
    </BrokersContext.Provider>
  );
}

export function useBrokers() {
  const ctx = useContext(BrokersContext);
  if (!ctx) throw new Error("useBrokers must be used within a BrokersProvider");
  return ctx;
}
