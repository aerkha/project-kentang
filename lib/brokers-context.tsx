"use client";

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import pb from "./pocketbase";

const currentUserId = () => (pb.authStore.record?.id as string | undefined) ?? "";

export const SYSTEM_BROKER_ID = "BRK-0001"; // broker "abadi" MinBun — selalu ada di database

export interface Broker {
  id: string;           // BRK-0001 (customId)
  name: string;
  address: string;
  idNumber: string;
  bankName: string;
  accountNumber: string;
  phone: string;
  email: string;
  /** True untuk broker sistem (MinBun/BRK-0001) yang tidak boleh dihapus/diubah namanya. */
  isSystemBroker?: boolean;
}

interface BrokersContextType {
  brokers: Broker[];
  addBroker:     (broker: Omit<Broker, "id">) => Promise<string>;
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
    isSystemBroker: customId === SYSTEM_BROKER_ID,
  };
}

/**
 * Pastikan broker sistem MinBun (BRK-0001) selalu ada di koleksi `brokers`.
 * Dipanggil sekali saat BrokersProvider mount. Jika record sudah ada, tidak
 * melakukan apa-apa. PocketBase tidak menolak insert record biasa; record ini
 * diperlakukan seperti record biasa kecuali:
 *   - Tidak boleh dihapus (lihat deleteBroker).
 *   - Tombol edit & delete di UI disembunyikan untuk record ini.
 */
async function ensureSystemBroker(): Promise<void> {
  try {
    const existing = await pb.collection("brokers").getFirstListItem(
      `customId = "${SYSTEM_BROKER_ID}"`,
      { fields: "id" },
    );
    if (existing) return;
  } catch {
    // belum ada → lanjut insert
  }
  try {
    await pb.collection("brokers").create({
      customId:      SYSTEM_BROKER_ID,
      createdBy:     "",
      updatedBy:     "",
      name:          "MinBun",
      address:       "Jakarta",
      idNumber:      "3170000000000001",
      bankName:      "Jenius",
      accountNumber: "1111111111",
      phone:         "6289670700889",
      email:         "ummamimin123@gmail.com",
    });
  } catch (err) {
    // Gagal insert (mungkin sudah ada race condition dengan tab lain, atau
    // PB menolak karena aturan koleksi). Abaikan — UI akan fallback ke
    // kondisi "broker belum tersedia" yang menampilkan pesan error.
    console.warn("[brokers-context] Gagal seed MinBun (BRK-0001):", err);
  }
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
  // M-2: bersihkan pbIdMap pada logout
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onLogout = () => { pbIdMapRef.current.clear(); };
    window.addEventListener("app:logout", onLogout);
    return () => window.removeEventListener("app:logout", onLogout);
  }, []);

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
    (async () => {
      // 1) Pastikan broker sistem MinBun (BRK-0001) selalu tersedia.
      await ensureSystemBroker();
      // 2) Muat ulang seluruh daftar broker (termasuk yang baru di-seed).
      try {
        const records = await pb.collection("brokers").getFullList({ sort: "customId" });
        setBrokers(records.map((r) => recordToBroker(r, map)));
      } catch (err) {
        console.error("[brokers-context] Gagal memuat daftar broker:", err);
      }
    })();
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
        return customId;
      } catch (err) {
        if (isCustomIdConflict(err) && attempt < 4) {
          customId = await generateBrokerCustomId();
          continue;
        }
        throw err;
      }
    }
    throw new Error("Gagal membuat ID broker unik setelah 5 percobaan.");
  };

  const updateBroker = async (id: string, updates: Partial<Broker>) => {
    const pbId = await resolvePbId(id);
    if (!pbId) throw new Error(`Broker "${id}" tidak ditemukan.`);
    const record = await pb.collection("brokers").update(pbId, { ...updates, updatedBy: currentUserId() });
    setBrokers((prev) =>
      prev.map((b) => (b.id === id ? recordToBroker(record, map) : b))
    );
  };

  const deleteBroker = async (id: string) => {
    // Lindungi broker sistem agar tidak terhapus. Broker MinBun dipakai sebagai
    // default pada form "Tambah Investor" dan referensi banyak investor.
    if (id === SYSTEM_BROKER_ID) {
      throw new Error(
        `Broker sistem "${id}" (MinBun) tidak dapat dihapus karena merupakan broker default.`,
      );
    }
    const pbId = await resolvePbId(id);
    if (!pbId) throw new Error(`Broker "${id}" tidak ditemukan.`);
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
