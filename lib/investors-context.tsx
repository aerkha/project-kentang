"use client";

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import pb from "./pocketbase";
import {
  recordModalInvestorMasuk,
  updateModalInvestorMasuk,
  removeModalInvestorMasuk,
} from "./cashflow-auto";

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
  heirBankName: string;
  heirAccountNumber: string;
  isActive?: boolean;
  isInternal?: boolean;
}

interface InvestorsContextType {
  investors: Investor[];
  addInvestor:    (inv: Omit<Investor, "id">) => Promise<string>;
  updateInvestor: (id: string, updates: Partial<Investor>) => Promise<void>;
  deleteInvestor: (id: string) => Promise<void>;
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
    heirName:         r.heirName         as string,
    heirBankName:     r.heirBankName     as string,
    heirAccountNumber: r.heirAccountNumber as string,
    isActive:         r.isActive === true,
    isInternal:       r.isInternal === true,
  };
}

function isCustomIdConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const data = (err as { data?: { data?: { customId?: { code?: string } } } }).data;
  return data?.data?.customId?.code === "validation_not_unique";
}

async function generateCustomId(): Promise<string> {
  try {
    // Ambil semua customId lalu cari nilai numerik tertinggi.
    // Tidak menggunakan sort: "-customId" karena sort itu leksikografis,
    // sehingga "INV-0009" > "INV-0010" dan akan menghasilkan ID yang salah.
    const res = await pb.collection("investors").getFullList({ fields: "customId" });
    if (res.length === 0) return "INV-0001";
    const max = res.reduce((m, r) => {
      const n = parseInt((r.customId as string).replace("INV-", "")) || 0;
      return n > m ? n : m;
    }, 0);
    return `INV-${String(max + 1).padStart(4, "0")}`;
  } catch {
    return "INV-0001";
  }
}

export function InvestorsProvider({ children }: { children: ReactNode }) {
  const [investors, setInvestors] = useState<Investor[]>([]);
  const pbIdMap = useRef(new Map<string, string>());
  const map = pbIdMap.current;

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
    let customId = await generateCustomId();
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
          heirName:         inv.heirName,
          heirBankName:     inv.heirBankName,
          heirAccountNumber: inv.heirAccountNumber,
          isActive:         inv.isActive === true,
          isInternal:       inv.isInternal === true,
        });
        setInvestors((prev) => [...prev, recordToInvestor(record, map)]);

        // Catat modal investor masuk ke cash flow (pemasukan / debet)
        // Dicatat segera saat investor ditambahkan, tanpa menunggu PKS aktif.
        await recordModalInvestorMasuk(
          customId,
          inv.name,
          inv.investmentAmount,
        );

        return customId;
      } catch (err) {
        if (isCustomIdConflict(err) && attempt < 4) {
          customId = await generateCustomId();
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

    // Sinkronkan entri cash flow [Modal-Investor:...] jika nama / nilai investasi berubah.
    // Fire-and-forget: jangan blokir UI jika gagal.
    if (updates.name !== undefined || updates.investmentAmount !== undefined) {
      updateModalInvestorMasuk(id, updated.name, updated.investmentAmount)
        .catch((e) => console.warn("cashflow-auto: gagal sinkron modal investor:", e));
    }
  };

  const deleteInvestor = async (id: string) => {
    const pbId = await resolvePbId(id);
    if (!pbId) return;
    await pb.collection("investors").delete(pbId);
    map.delete(id);
    setInvestors((prev) => prev.filter((inv) => inv.id !== id));

    // Bersihkan entri cash flow modal investor agar tidak menyisakan
    // pemasukan dari investor yang sudah dihapus.
    removeModalInvestorMasuk(id)
      .catch((e) => console.warn("cashflow-auto: gagal hapus entri modal investor:", e));
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
