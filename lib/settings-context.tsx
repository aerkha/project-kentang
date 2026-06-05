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
    // Belum ada — buat baru
    await pb.collection("settings").create({ key, value });
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
          });
        } catch { /* ignore */ }
      }
    }).finally(() => setIsLoading(false));
  }, []);

  const updateMinbun = async (data: Partial<InternalAccount>) => {
    const updated = { ...minbun, ...data };
    await setSetting("minbun_account", JSON.stringify(updated));
    setMinbun(updated);
  };

  const updateTrader = async (data: Partial<InternalAccount>) => {
    const updated = { ...trader, ...data };
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
