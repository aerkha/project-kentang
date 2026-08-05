"use client";

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import pb from "./pocketbase";

const currentUserId = () => (pb.authStore.record?.id as string | undefined) ?? "";

export interface Investor {
  id: string;           // INV-0001 (customId)
  name: string;
  address: string;
  brokerName: string;
  idNumber: string;
  bankName: string;
  accountNumber: string;
  phone: string;
  email: string;
  occupation: string;
  investmentAmount: number;
  heirName: string;
  heirRelationship: string;
  heirEmail: string;
  heirBankName: string;
  heirAccountNumber: string;
  isMinBun?:      boolean;
  isInternal?:    boolean;   // sub-flag MinBun: true = MinBun sendiri (full cashflow)
  isTami?:        boolean;
  isDirect?:      boolean;
  buktiTransfer?: string;
}

interface InvestorsContextType {
  investors: Investor[];
  addInvestor:          (inv: Omit<Investor, "id">) => Promise<string>;
  updateInvestor:       (id: string, updates: Partial<Investor>) => Promise<void>;
  deleteInvestor:       (id: string) => Promise<void>;
  reloadInvestors:      () => Promise<void>;
  uploadBuktiTransfer:  (id: string, file: File) => Promise<string>;
  getBuktiUrl:          (id: string, filename: string) => string;
}

const InvestorsContext = createContext<InvestorsContextType | undefined>(undefined);

function recordToInvestor(r: Record<string, unknown>, pbIdMap: Map<string, string>): Investor {
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
    email:            (r.email           as string) || "",
    occupation:       (r.occupation      as string) || "",
    investmentAmount: r.investmentAmount as number,
    heirName:         (r.heirName         as string) || "",
    heirRelationship: (r.heirRelationship as string) || "",
    heirEmail:        (r.heirEmail        as string) || "",
    heirBankName:     (r.heirBankName     as string) || "",
    heirAccountNumber: (r.heirAccountNumber as string) || "",
    isMinBun:         r.isMinBun === true,
    isInternal:       r.isInternal === true,
    isTami:           r.isTami === true,
    isDirect:         r.isDirect === true,
    buktiTransfer:    (r.buktiTransfer as string) || "",
  };
}

function isCustomIdConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const data = (err as { data?: { data?: { customId?: { code?: string } } } }).data;
  return data?.data?.customId?.code === "validation_not_unique";
}

export type InvestorFlag = "MB" | "TM" | "D";

export async function generateCustomId(flag: InvestorFlag): Promise<string> {
  const prefix = `INV-${flag}-`;
  try {
    const res = await pb.collection("investors").getFullList({ fields: "customId" });
    const max = res.reduce((m, r) => {
      const id = r.customId as string;
      if (!id.startsWith(prefix)) return m;
      const n = parseInt(id.slice(prefix.length)) || 0;
      return n > m ? n : m;
    }, 0);
    return `${prefix}${String(max + 1).padStart(4, "0")}`;
  } catch {
    return `${prefix}0001`;
  }
}

export function InvestorsProvider({ children }: { children: ReactNode }) {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const pbIdMap = useRef(new Map<string, string>());
  const map = pbIdMap.current;
  // M-2: bersihkan pbIdMap pada logout
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onLogout = () => { pbIdMap.current.clear(); };
    window.addEventListener("app:logout", onLogout);
    return () => window.removeEventListener("app:logout", onLogout);
  }, []);

  const resolvePbId = async (customId: string): Promise<string | null> => {
    const cached = map.get(customId);
    if (cached) return cached;
    try {
      const res = await pb.collection("investors").getFirstListItem(
        `customId = "${customId}"`,
        { fields: "id,customId" },
      );
      map.set(customId, res.id);
      return res.id;
    } catch { return null; }
  };

  useEffect(() => {
    pb.collection("investors")
      .getFullList({ sort: "customId" })
      .then((records) => setInvestors(records.map((r) => recordToInvestor(r, map))))
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addInvestor = async (inv: Omit<Investor, "id">) => {
    const flag: InvestorFlag = inv.isMinBun ? "MB" : inv.isTami ? "TM" : "D";
    let customId = await generateCustomId(flag);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const record = await pb.collection("investors").create({
          customId,
          createdBy: currentUserId(),
          updatedBy: currentUserId(),
          name:             inv.name,
          address:          inv.address,
          brokerName:       inv.brokerName || "",
          idNumber:         inv.idNumber,
          bankName:         inv.bankName,
          accountNumber:    inv.accountNumber,
          phone:            inv.phone,
          email:            inv.email || "",
          occupation:       inv.occupation || "",
          investmentAmount: inv.investmentAmount,
          heirName:         inv.heirName || "",
          heirRelationship: inv.heirRelationship || "",
          heirEmail:        inv.heirEmail || "",
          heirBankName:     inv.heirBankName || "",
          heirAccountNumber: inv.heirAccountNumber || "",
          isMinBun:         inv.isMinBun === true,
          isInternal:       inv.isInternal === true,
          isTami:           inv.isTami === true,
          isDirect:         inv.isDirect === true,
        });
        setInvestors((prev) => [...prev, recordToInvestor(record, map)]);
        return customId;
      } catch (err) {
        if (isCustomIdConflict(err) && attempt < 4) {
          customId = await generateCustomId(flag);
          continue;
        }
        throw err;
      }
    }
    throw new Error("Gagal membuat ID investor unik setelah 5 percobaan");
  };

  const updateInvestor = async (id: string, updates: Partial<Investor>) => {
    const pbId = await resolvePbId(id);
    if (!pbId) return;
    const record = await pb.collection("investors").update(pbId, { ...updates, updatedBy: currentUserId() });
    const updated = recordToInvestor(record, map);
    setInvestors((prev) =>
      prev.map((inv) => (inv.id === id ? updated : inv))
    );
  };

  const uploadBuktiTransfer = async (id: string, file: File): Promise<string> => {
    const pbId = await resolvePbId(id);
    if (!pbId) throw new Error(`Investor "${id}" tidak ditemukan`);
    const fd = new FormData();
    fd.append("buktiTransfer", file);
    const record  = await pb.collection("investors").update(pbId, fd);
    const updated = recordToInvestor(record, map);
    setInvestors((prev) => prev.map((inv) => (inv.id === id ? updated : inv)));
    return updated.buktiTransfer ?? "";
  };

  const getBuktiUrl = (id: string, filename: string): string => {
    if (!filename) return "";
    const pbId = map.get(id);
    if (!pbId) return "";
    return pb.files.getURL({ id: pbId, collectionId: "investors", collectionName: "investors" } as Parameters<typeof pb.files.getURL>[0], filename);
  };

  const reloadInvestors = async () => {
    const records = await pb.collection("investors").getFullList({ sort: "customId" });
    // Rebuild map sepenuhnya agar tidak ada sisa entry stale
    map.clear();
    setInvestors(records.map((r) => recordToInvestor(r, map)));
  };

  const deleteInvestor = async (id: string) => {
    const pbId = await resolvePbId(id);
    if (!pbId) throw new Error(`Investor "${id}" tidak ditemukan di sistem`);
    await pb.collection("investors").delete(pbId);
    // Reload dari DB sebagai sumber kebenaran — mencegah drift state
    await reloadInvestors();
  };

  return (
    <InvestorsContext.Provider value={{ investors, addInvestor, updateInvestor, deleteInvestor, reloadInvestors, uploadBuktiTransfer, getBuktiUrl }}>
      {children}
    </InvestorsContext.Provider>
  );
}

export function useInvestors() {
  const ctx = useContext(InvestorsContext);
  if (!ctx) throw new Error("useInvestors must be used within an InvestorsProvider");
  return ctx;
}
