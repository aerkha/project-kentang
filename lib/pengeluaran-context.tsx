"use client";

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import pb from "./pocketbase";

export interface Pengeluaran {
  id: string;         // PGL-YYYYMM-NNN
  date: string;       // "YYYY-MM-DD"
  deskripsi: string;
  debet: number;      // pemasukan
  kredit: number;     // pengeluaran
  catatan?: string;
}

/** Pengeluaran + saldo akhir yang dihitung secara running */
export interface PengeluaranWithSaldo extends Pengeluaran {
  saldo: number;
}

interface PengeluaranContextType {
  pengeluarans: Pengeluaran[];
  addPengeluaran:    (p: Omit<Pengeluaran, "id">) => Promise<void>;
  updatePengeluaran: (id: string, updates: Partial<Pengeluaran>) => Promise<void>;
  deletePengeluaran: (id: string) => Promise<void>;
}

const PengeluaranContext = createContext<PengeluaranContextType | undefined>(undefined);

const currentUserId = () => (pb.authStore.record?.id as string | undefined) ?? "";

function isCustomIdConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const data = (err as { data?: { data?: { customId?: { code?: string } } } }).data;
  return data?.data?.customId?.code === "validation_not_unique";
}

function recordToPengeluaran(
  r: Record<string, unknown>,
  pbIdMap: Map<string, string>,
): Pengeluaran {
  const customId = r.customId as string;
  pbIdMap.set(customId, r.id as string);
  return {
    id:        customId,
    date:      r.date      as string,
    deskripsi: r.deskripsi as string,
    debet:     (r.debet    as number) || 0,
    kredit:    (r.kredit   as number) || 0,
    catatan:   (r.catatan  as string) || "",
  };
}

async function generateCustomId(date: string): Promise<string> {
  const ym     = date.slice(0, 7).replace("-", "");
  const prefix = `PGL-${ym}-`;
  try {
    const res = await pb.collection("pengeluarans").getFullList({
      filter: `customId ~ "${prefix}"`,
      fields: "customId",
    });
    const max = res.reduce((m, r) => {
      const n = parseInt((r.customId as string).slice(prefix.length)) || 0;
      return n > m ? n : m;
    }, 0);
    return `${prefix}${String(max + 1).padStart(3, "0")}`;
  } catch {
    return `${prefix}001`;
  }
}

export function PengeluaranProvider({ children }: { children: ReactNode }) {
  const [pengeluarans, setPengeluarans] = useState<Pengeluaran[]>([]);
  const pbIdMapRef = useRef(new Map<string, string>());
  const map = pbIdMapRef.current;

  const resolvePbId = async (customId: string): Promise<string | null> => {
    const cached = map.get(customId);
    if (cached) return cached;
    try {
      const res = await pb.collection("pengeluarans").getFirstListItem(
        `customId = "${customId}"`,
        { fields: "id,customId" },
      );
      map.set(customId, res.id);
      return res.id;
    } catch { return null; }
  };

  useEffect(() => {
    pb.collection("pengeluarans")
      .getFullList({ sort: "date,customId" })
      .then((records) => setPengeluarans(records.map((r) => recordToPengeluaran(r, map))))
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addPengeluaran = async (p: Omit<Pengeluaran, "id">) => {
    let customId = await generateCustomId(p.date);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const record = await pb.collection("pengeluarans").create({
          customId,
          createdBy: currentUserId(),
          updatedBy: currentUserId(),
          date:      p.date,
          deskripsi: p.deskripsi,
          debet:     p.debet  || 0,
          kredit:    p.kredit || 0,
          catatan:   p.catatan || "",
        });
        setPengeluarans((prev) =>
          [...prev, recordToPengeluaran(record, map)].sort(
            (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
          ),
        );
        return;
      } catch (err) {
        if (isCustomIdConflict(err) && attempt < 4) {
          customId = await generateCustomId(p.date);
          continue;
        }
        throw err;
      }
    }
  };

  const updatePengeluaran = async (id: string, updates: Partial<Pengeluaran>) => {
    const pbId = await resolvePbId(id);
    if (!pbId) return;
    const record = await pb.collection("pengeluarans").update(pbId, {
      ...updates,
      updatedBy: currentUserId(),
    });
    setPengeluarans((prev) =>
      prev
        .map((p) => (p.id === id ? recordToPengeluaran(record, map) : p))
        .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
    );
  };

  const deletePengeluaran = async (id: string) => {
    const pbId = await resolvePbId(id);
    if (!pbId) return;
    await pb.collection("pengeluarans").delete(pbId);
    map.delete(id);
    setPengeluarans((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <PengeluaranContext.Provider
      value={{ pengeluarans, addPengeluaran, updatePengeluaran, deletePengeluaran }}
    >
      {children}
    </PengeluaranContext.Provider>
  );
}

export function usePengeluaran() {
  const ctx = useContext(PengeluaranContext);
  if (!ctx) throw new Error("usePengeluaran must be used within PengeluaranProvider");
  return ctx;
}

// ── Helper: hitung running saldo dari seluruh data ─────────────
export function calcRunningBalance(
  entries: Pengeluaran[],
  saldoAwal = 0,
): PengeluaranWithSaldo[] {
  let running = saldoAwal;
  return entries.map((p) => {
    running = running + p.debet - p.kredit;
    return { ...p, saldo: running };
  });
}
