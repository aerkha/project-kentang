"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import pb from "./pocketbase";

// ── Tipe data ────────────────────────────────────────────────────────────────

export interface InternalAccount {
  nama:          string;
  bankName:      string;
  accountNumber: string;
}

interface SettingsContextType {
  minbun:        InternalAccount;
  trader:        InternalAccount;
  updateMinbun:  (data: Partial<InternalAccount>) => Promise<void>;
  updateTrader:  (data: Partial<InternalAccount>) => Promise<void>;
  isLoading:     boolean;
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_MINBUN: InternalAccount = { nama: "MinBun", bankName: "", accountNumber: "" };
const DEFAULT_TRADER: InternalAccount = { nama: "Trader", bankName: "", accountNumber: "" };

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
  const [minbun,    setMinbun]    = useState<InternalAccount>(DEFAULT_MINBUN);
  const [trader,    setTrader]    = useState<InternalAccount>(DEFAULT_TRADER);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getSetting("minbun_account"),
      getSetting("trader_account"),
    ]).then(([minbunRaw, traderRaw]) => {
      if (minbunRaw) {
        try { setMinbun({ ...DEFAULT_MINBUN, ...JSON.parse(minbunRaw) }); }
        catch { /* ignore parse error */ }
      }
      if (traderRaw) {
        try { setTrader({ ...DEFAULT_TRADER, ...JSON.parse(traderRaw) }); }
        catch { /* ignore parse error */ }
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

  return (
    <SettingsContext.Provider value={{ minbun, trader, updateMinbun, updateTrader, isLoading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
