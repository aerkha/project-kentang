"use client";

import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react";
import pb from "./pocketbase";

export interface ModalEntry {
  id: string;
  investorCustomId: string;
  amount: number;
  date: string;
  mouId: string;
  buktiTransfer: string;
  type: "initial" | "topup";
  keterangan: string;
}

interface ModalEntriesContextType {
  entriesByInvestor: Map<string, ModalEntry[]>;
  addEntry: (
    investorCustomId: string,
    data: { amount: number; date: string; type: "initial" | "topup"; keterangan?: string }
  ) => Promise<void>;
  deleteEntry: (id: string) => Promise<void>;
}

const ModalEntriesContext = createContext<ModalEntriesContextType | undefined>(undefined);

type PbRecord = Record<string, unknown>;

function recordToEntry(r: PbRecord): ModalEntry {
  const expand = r.expand as Record<string, PbRecord> | undefined;
  return {
    id:               r.id as string,
    investorCustomId: (expand?.investorId?.customId as string) ?? "",
    amount:           (r.amount as number) ?? 0,
    date:             (r.date as string) ?? "",
    mouId:            (r.mouId as string) ?? "",
    buktiTransfer:    (r.buktiTransfer as string) ?? "",
    type:             (r.type as "initial" | "topup") ?? "initial",
    keterangan:       (r.keterangan as string) ?? "",
  };
}

export function ModalEntriesProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<ModalEntry[]>([]);

  useEffect(() => {
    pb.collection("modal_entries")
      .getFullList({ expand: "investorId", sort: "date" })
      .then((records) => setEntries(records.map((r) => recordToEntry(r as PbRecord))))
      .catch(console.error);
  }, []);

  const entriesByInvestor = useMemo(() => {
    const map = new Map<string, ModalEntry[]>();
    entries.forEach((e) => {
      const list = map.get(e.investorCustomId) ?? [];
      list.push(e);
      map.set(e.investorCustomId, list);
    });
    return map;
  }, [entries]);

  const addEntry = async (
    investorCustomId: string,
    data: { amount: number; date: string; type: "initial" | "topup"; keterangan?: string }
  ) => {
    // m-10: collapse 3 round trips (findInvestor → createEntry → fetchWithExpand)
    // menjadi 2 dengan menggunakan lookup berdasarkan PocketBase id, dan
    // ambili customId langsung dari record hasil create (mereka sudah tersedia
    // melalui `expand`). Untuk amannya, tetap pakai 2-step dengan expand
    // pada create ketika investasi punya data tambahan di masa depan.
    const inv = await pb.collection("investors").getFirstListItem(
      `customId = "${investorCustomId}"`,
      { fields: "id,customId" }
    );
    const record = await pb.collection("modal_entries").create({
      investorId:  inv.id,
      amount:      data.amount,
      date:        data.date,
      type:        data.type,
      keterangan:  data.keterangan ?? "",
    });
    // Gunakan referensi lokal `inv.customId` daripada round-trip fetch ulang.
    const full: PbRecord = {
      ...record,
      expand: { investorId: { customId: inv.customId, id: inv.id } },
    };
    setEntries((prev) => [...prev, recordToEntry(full)]);
  };

  const deleteEntry = async (id: string) => {
    await pb.collection("modal_entries").delete(id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <ModalEntriesContext.Provider value={{ entriesByInvestor, addEntry, deleteEntry }}>
      {children}
    </ModalEntriesContext.Provider>
  );
}

export function useModalEntries() {
  const ctx = useContext(ModalEntriesContext);
  if (!ctx) throw new Error("useModalEntries must be used within ModalEntriesProvider");
  return ctx;
}
