"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import pb from "./pocketbase";

// ── Tipe data ────────────────────────────────────────────────────────────────

export interface InternalAccount {
  nama:          string;
  bankName:      string;
  accountNumber: string;
}

export interface RolePermission {
  create: boolean;
  edit:   boolean;
  delete: boolean;
  print:  boolean;
}

export interface RolePermissions {
  user:     RolePermission;
  owner:    RolePermission;
  investor: RolePermission;
  broker: RolePermission;
}

interface SettingsContextType {
  minbun:             InternalAccount;
  trader:             InternalAccount;
  rolePermissions:    RolePermissions;
  updateMinbun:       (data: Partial<InternalAccount>) => Promise<void>;
  updateTrader:       (data: Partial<InternalAccount>) => Promise<void>;
  updatePermissions:  (data: RolePermissions) => Promise<void>;
  isLoading:          boolean;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_MINBUN: InternalAccount = { nama: "MinBun", bankName: "", accountNumber: "" };
const DEFAULT_TRADER: InternalAccount = { nama: "Trader", bankName: "", accountNumber: "" };

export const DEFAULT_ROLE_PERMISSIONS: RolePermissions = {
  user:     { create: true,  edit: true,  delete: false, print: true  },
  owner:    { create: true,  edit: true,  delete: false, print: true  },
  investor: { create: false, edit: false, delete: false, print: true  },
  broker:   { create: false, edit: false, delete: false, print: true },
};

// ── Context ──────────────────────────────────────────────────────────────────

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string | null> {
  try {
    const rec = await pb.collection("settings").getFirstListItem(`key = "${key}"`);
    return rec.value as string;
  } catch {
    return null;
  }
}

async function setSetting(key: string, value: string): Promise<void> {
  try {
    const rec = await pb.collection("settings").getFirstListItem(`key = "${key}"`);
    await pb.collection("settings").update(rec.id, { value });
  } catch {
    // Record belum ada — coba buat baru.
    // Jika dua request concurrent sama-sama masuk sini dan keduanya mencoba create,
    // yang kedua akan gagal karena duplicate key. Tangkap error itu dan coba update.
    try {
      await pb.collection("settings").create({ key, value });
    } catch {
      // Sudah dibuat concurrent — ambil id-nya lalu update
      try {
        const rec = await pb.collection("settings").getFirstListItem(`key = "${key}"`);
        await pb.collection("settings").update(rec.id, { value });
      } catch (finalErr) {
        console.error(`[settings] setSetting("${key}") gagal setelah 3 percobaan:`, finalErr);
        throw finalErr;
      }
    }
  }
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [minbun,          setMinbun]          = useState<InternalAccount>(DEFAULT_MINBUN);
  const [trader,          setTrader]          = useState<InternalAccount>(DEFAULT_TRADER);
  const [rolePermissions, setRolePermissions] = useState<RolePermissions>(DEFAULT_ROLE_PERMISSIONS);
  const [isLoading,       setIsLoading]       = useState(true);

  useEffect(() => {
    Promise.all([
      getSetting("minbun_account"),
      getSetting("trader_account"),
      getSetting("role_permissions"),
    ]).then(([minbunRaw, traderRaw, permRaw]) => {
      if (minbunRaw) {
        try { setMinbun({ ...DEFAULT_MINBUN, ...JSON.parse(minbunRaw) }); }
        catch { /* ignore */ }
      }
      if (traderRaw) {
        try { setTrader({ ...DEFAULT_TRADER, ...JSON.parse(traderRaw) }); }
        catch { /* ignore */ }
      }
      if (permRaw) {
        try {
          const parsed = JSON.parse(permRaw);
          setRolePermissions({
            user:     { ...DEFAULT_ROLE_PERMISSIONS.user,     ...parsed.user     },
            owner:    { ...DEFAULT_ROLE_PERMISSIONS.owner,    ...parsed.owner    },
            investor: { ...DEFAULT_ROLE_PERMISSIONS.investor, ...parsed.investor },
            broker:   { ...DEFAULT_ROLE_PERMISSIONS.broker,   ...parsed.broker   },
          });
        } catch { /* ignore */ }
      }
    }).finally(() => setIsLoading(false));
  }, []);

  // PATCH (sedang #21): sebelumnya `updateMinbun` langsung optimistic-update
  // state dari payload yang diberikan, tanpa fallback ke default. Sekarang
  // kita handle field kosong dengan fallback ke DEFAULT_MINBUN/TRADER agar
  // UI tidak pernah menampilkan state invalid.
  const updateMinbun = async (data: Partial<InternalAccount>) => {
    const updated: InternalAccount = { ...DEFAULT_MINBUN, ...minbun, ...data };
    await setSetting("minbun_account", JSON.stringify(updated));
    setMinbun(updated);
  };

  const updateTrader = async (data: Partial<InternalAccount>) => {
    const updated: InternalAccount = { ...DEFAULT_TRADER, ...trader, ...data };
    await setSetting("trader_account", JSON.stringify(updated));
    setTrader(updated);
  };

  const updatePermissions = async (data: RolePermissions) => {
    await setSetting("role_permissions", JSON.stringify(data));
    setRolePermissions(data);
  };

  return (
    <SettingsContext.Provider value={{
      minbun, trader, rolePermissions,
      updateMinbun, updateTrader, updatePermissions,
      isLoading,
    }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
