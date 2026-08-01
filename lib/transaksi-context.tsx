"use client";

import { createContext, useContext, useMemo, useState, useEffect, useRef, type ReactNode } from "react";
import pb from "./pocketbase";

const currentUserId = () => pb.authStore.record?.id ?? "";

export interface TransaksiInvestorEntry {
  pksId: string;              
  investorId: string;
  investorName: string;
  investorBrokerName: string;  
  nilaiInvestasi: number;
  pctTrader:  number;
  pctMinBun:  number;
  pctBrokerI: number;
  pctBrokerII: number;
}

export type TransaksiStatus = "berjalan" | "perbarui" | "selesai" | "bermasalah";
// m-21: termasuk "rencana" dan "batal" untuk backward-compat dengan data lama.
// Status "rencana"/"batal" ditampilkan sebagai "berjalan" (lihat normalizeStatus).
export type TransaksiStatusRaw = TransaksiStatus | "rencana" | "batal";

export const TRANSAKSI_STATUS_LABEL: Record<TransaksiStatus, string> = {
  berjalan:   "Berjalan",
  perbarui:   "Perbarui",
  selesai:    "Selesai",
  bermasalah: "Bermasalah",
};

export function effectiveStatus(t: { status: TransaksiStatus; date: string }): TransaksiStatus {
  if (t.status === "perbarui") return "berjalan";
  return t.status;
}

const ACTIVE_TRANSAKSI_STATUS = new Set<TransaksiStatus>(["berjalan", "bermasalah"]);

export function isInvestorActive(investorId: string, transaksis: Transaksi[]): boolean {
  return transaksis.some(
    (t) =>
      ACTIVE_TRANSAKSI_STATUS.has(effectiveStatus(t)) &&
      t.investorEntries.some((e) => e.investorId === investorId && e.nilaiInvestasi > 0),
  );
}

export function activeInvestorIds(transaksis: Transaksi[]): Set<string> {
  const ids = new Set<string>();
  for (const t of transaksis) {
    if (!ACTIVE_TRANSAKSI_STATUS.has(effectiveStatus(t))) continue;
    for (const e of t.investorEntries) {
      if (e.nilaiInvestasi > 0) ids.add(e.investorId);
    }
  }
  return ids;
}

export interface Transaksi {
  id: string;             
  date: string;
  description: string;
  endDate?: string;
  isAutorenewal?: boolean;
  hpp: number;
  kebutuhanModal: number;
  investorEntries: TransaksiInvestorEntry[];
  ongkirPerKg: number;
  hargaJual: number;
  status: TransaksiStatus;
  catatanAkhir: string;
  bagiHasilChecks?: Record<string, boolean>;
  bagiHasilDone?: boolean;
  buktiInvestor?: string;
  buktiBroker?: string;
  buktiTrader?: string;
  buktiMinBun?: string;
}

export function calcTransaksi(t: Transaksi) {
  const qty            = t.hpp > 0 ? t.kebutuhanModal / t.hpp : 0;
  const totalInvestasi = t.investorEntries.reduce((s, e) => s + e.nilaiInvestasi, 0);
  const selisih        = t.kebutuhanModal - totalInvestasi;
  const totalOngkir    = t.ongkirPerKg * qty;
  const income         = t.hargaJual * qty;
  const profit         = income - (t.kebutuhanModal + totalOngkir);
  return { qty, totalInvestasi, selisih, totalOngkir, income, profit };
}

export const BUKTI_FIELD_TRX: Record<string, string> = {
  Investor: "buktiInvestor",
  Broker:   "buktiBroker",
  Trader:   "buktiTrader",
  MinBun:   "buktiMinBun",
};

const PB_BASE = process.env.NEXT_PUBLIC_PB_URL || "http://127.0.0.1:8090";

function pbFileUrlTrx(pbRecordId: string, fieldValue: unknown): string {
  const filename = Array.isArray(fieldValue)
    ? (fieldValue[0] as string) || ""
    : (fieldValue as string) || "";
  return filename ? `${PB_BASE}/api/files/transaksis/${pbRecordId}/${filename}` : "";
}

interface TransaksiContextType {
  transaksis: Transaksi[];
  addTransaksi:    (t: Omit<Transaksi, "id">) => Promise<void>;
  updateTransaksi: (id: string, updates: Partial<Transaksi>) => Promise<void>;
  deleteTransaksi: (id: string) => Promise<void>;
  syncInvestorInfo: (investorId: string, investorName: string, investorBrokerName: string) => Promise<void>;
  uploadBuktiTransaksi: (id: string, keterangan: string, file: File) => Promise<string>;
  triggerAutorenewal: (oldTrxId: string) => Promise<void>;
}

const TransaksiContext = createContext<TransaksiContextType | undefined>(undefined);

const VALID_STATUSES = new Set<TransaksiStatusRaw>(["berjalan", "perbarui", "selesai", "bermasalah", "rencana", "batal"]);
function normalizeStatus(s: string): TransaksiStatus {
  if (s === "selesai" || s === "bermasalah") return s;
  // "berjalan", "perbarui", "rencana", "batal", dan nilai tak dikenal → "berjalan"
  return "berjalan";
}

function recordToTransaksi(
  r: Record<string, unknown>,
  pbIdMap: Map<string, string>,
  investorEntries: TransaksiInvestorEntry[] = [],
): Transaksi {
  const customId   = r.customId as string;
  const pbRecordId = r.id as string;
  pbIdMap.set(customId, pbRecordId);
  return {
    id:              customId,
    date:            r.date           as string,
    description:     (r.description  as string) || "",
    endDate:         (r.endDate      as string) || "",
    isAutorenewal:   (r.isAutorenewal as boolean) || false,
    hpp:             r.hpp            as number,
    kebutuhanModal:  r.kebutuhanModal as number,
    investorEntries,
    ongkirPerKg:  r.ongkirPerKg as number,
    hargaJual:    r.hargaJual   as number,
    status:       (normalizeStatus(r.status as string)),
    catatanAkhir: (r.catatanAkhir as string) || "",
    bagiHasilDone: (r.bagiHasilDone as boolean) || false,
    bagiHasilChecks: (() => {
      const raw = r.bagiHasilChecks;
      if (!raw) return {};
      if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, boolean>;
      try { return JSON.parse(raw as string) as Record<string, boolean>; }
      catch { return {}; }
    })(),
    buktiInvestor: pbFileUrlTrx(pbRecordId, r.buktiInvestor),
    buktiBroker:   pbFileUrlTrx(pbRecordId, r.buktiBroker),
    buktiTrader:   pbFileUrlTrx(pbRecordId, r.buktiTrader),
    buktiMinBun:   pbFileUrlTrx(pbRecordId, r.buktiMinBun),
  };
}

function recordToInvestorEntry(r: Record<string, unknown>): TransaksiInvestorEntry {
  return {
    pksId:              (r.pksId              as string) || "",
    investorId:         r.investorId         as string,
    investorName:       r.investorName       as string,
    investorBrokerName: (r.investorBrokerName as string) || "",
    nilaiInvestasi:     r.nilaiInvestasi      as number,
    pctTrader:          (r.pctTrader          as number) ?? 10,
    pctMinBun:          (r.pctMinBun          as number) ?? 5,
    pctBrokerI:         (r.pctBrokerI         as number) ?? 0,
    pctBrokerII:        (r.pctBrokerII        as number) ?? 0,
  };
}

function updateInvestorEntries(
  entries: TransaksiInvestorEntry[],
  investorId: string,
  investorName: string,
  investorBrokerName: string,
): TransaksiInvestorEntry[] {
  return entries.map((e) =>
    e.investorId === investorId
      ? { ...e, investorName, investorBrokerName }
      : e,
  );
}

function isCustomIdConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const data = (err as { data?: { data?: { customId?: { code?: string } } } }).data;
  return data?.data?.customId?.code === "validation_not_unique";
}

async function generateCustomId(isAutorenewal: boolean = false): Promise<string> {
  const fallback = isAutorenewal ? "TRX-0001A" : "TRX-0001";
  try {
    // Ambil hanya 1 record terbesar (descending by customId) — jauh lebih
    // efisien dibanding getFullList() yang memuat seluruh koleksi ke memori.
    const res = await pb.collection("transaksis").getList<{ customId: string }>(1, 1, {
      sort: "-customId",
      fields: "customId",
    });
    const top = res.items[0]?.customId;
    if (!top) return fallback;
    // Hilangkan "TRX-" dan trailing letter (mis. "0005A" -> 5).
    const numStr = top.replace(/^TRX-/, "").replace(/[A-Z]+$/i, "");
    const next = (Number.parseInt(numStr, 10) || 0) + 1;
    const padded = String(next).padStart(4, "0");
    return isAutorenewal ? `TRX-${padded}A` : `TRX-${padded}`;
  } catch {
    return fallback;
  }
}

async function createInvestorEntries(
  transaksiPbId: string,
  entries: TransaksiInvestorEntry[],
): Promise<void> {
  await Promise.all(
    entries.map((e) =>
      pb.collection("transaksi_investors").create({
        transaksiId:         transaksiPbId,
        pksId:               e.pksId ?? "",
        investorId:          e.investorId,
        investorName:        e.investorName,
        investorBrokerName:  e.investorBrokerName,
        nilaiInvestasi:      e.nilaiInvestasi,
        pctTrader:           e.pctTrader,
        pctMinBun:           e.pctMinBun,
        pctBrokerI:          e.pctBrokerI,
        pctBrokerII:         e.pctBrokerII,
      }),
    ),
  );
}

async function listInvestorEntryIds(transaksiPbId: string): Promise<string[]> {
  const existing = await pb.collection("transaksi_investors").getFullList({
    filter: `transaksiId = "${transaksiPbId}"`,
    fields: "id",
  });
  return existing.map((r) => r.id);
}

async function deleteInvestorEntriesByIds(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => pb.collection("transaksi_investors").delete(id)));
}

export function TransaksiProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [transaksis, setTransaksis] = useState<Transaksi[]>([]);
  // M-7: identitas fungsi distabilkan via useMemo di bawah; setTransaksis
  // sudah stabil dari React sehingga tidak perlu dibungkus useCallback.
  const pbIdMapRef = useRef(new Map<string, string>());
  const map = pbIdMapRef.current;

  // Ref untuk menghindari stale closure saat autorenewal berjalan di background
  const transaksisRef = useRef<Transaksi[]>([]);
  // M-2: bersihkan pbIdMap pada logout untuk mencegah leakage data
  // ketika user lain login di browser yang sama.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onLogout = () => pbIdMapRef.current.clear();
    window.addEventListener("app:logout", onLogout);
    return () => window.removeEventListener("app:logout", onLogout);
  }, []);
  useEffect(() => {
    transaksisRef.current = transaksis;
  }, [transaksis]);

  const resolvePbId = async (customId: string): Promise<string | null> => {
    const cached = map.get(customId);
    if (cached) return cached;
    try {
      const res = await pb.collection("transaksis").getFirstListItem(
        `customId = "${customId}"`,
        { fields: "id,customId" },
      );
      map.set(customId, res.id);
      return res.id;
    } catch { return null; }
  };

  useEffect(() => {
    Promise.allSettled([
      pb.collection("transaksis").getFullList({ sort: "customId" }),
      pb.collection("transaksi_investors").getFullList({ sort: "created" }),
    ]).then(([trxResult, invResult]) => {
      if (trxResult.status === "rejected") {
        console.error("[transaksi] gagal load transaksis:", trxResult.reason);
        return;
      }

      const trxRecords = trxResult.value;

      const invMap = new Map<string, TransaksiInvestorEntry[]>();
      if (invResult.status === "fulfilled") {
        for (const r of invResult.value) {
          const tid = r.transaksiId as string;
          let entryList = invMap.get(tid);
          if (!entryList) {
            entryList = [];
            invMap.set(tid, entryList);
          }
          entryList.push(recordToInvestorEntry(r));
        }
      }

      // PocketBase `id` adalah identitas record yang benar-benar unik. Selain itu,
      // lindungi UI dari data legacy dengan `customId` ganda: tampilkan hanya satu
      // record per customId (record terakhir dari hasil query), sehingga baris
      // Mapping Modal tidak terduplikasi.
      const uniqueRecordsByPbId = new Map(trxRecords.map((record) => [record.id, record]));
      const uniqueRecordsByCustomId = new Map<string, (typeof trxRecords)[number]>();
      for (const record of uniqueRecordsByPbId.values()) {
        uniqueRecordsByCustomId.set(String(record.customId), record);
      }

      setTransaksis(
        Array.from(uniqueRecordsByCustomId.values()).map((r) =>
          recordToTransaksi(
            r as Record<string, unknown>,
            map,
            invMap.get(r.id) ?? [],
          ),
        ),
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addTransaksi = async (t: Omit<Transaksi, "id">) => {
    let customId = await generateCustomId(t.isAutorenewal);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const record = await pb.collection("transaksis").create({
          customId,
          createdBy:      currentUserId(),
          updatedBy:      currentUserId(),
          date:           t.date,
          description:    t.description || "",
          endDate:        t.endDate || "",
          isAutorenewal:  t.isAutorenewal || false,
          hpp:            t.hpp,
          kebutuhanModal: t.kebutuhanModal,
          ongkirPerKg:    t.ongkirPerKg,
          hargaJual:      t.hargaJual,
          status:         t.status || "rencana",
          catatanAkhir:   t.catatanAkhir || "",
        });

        try {
          await createInvestorEntries(record.id, t.investorEntries);
        } catch (entryErr) {
          await pb.collection("transaksis").delete(record.id).catch(() => null);
          throw entryErr;
        }

        setTransaksis((prev) => {
          const created = recordToTransaksi(record, map, t.investorEntries);
          // Upsert berdasarkan customId unik agar response ganda/race tidak
          // menghasilkan dua baris dengan ID Mapping Modal yang sama.
          return [...prev.filter((item) => item.id !== created.id), created];
        });
        return;
      } catch (err) {
        if (isCustomIdConflict(err) && attempt < 4) {
          customId = await generateCustomId(t.isAutorenewal);
          continue;
        }
        throw err;
      }
    }
  };

  const updateTransaksi = async (id: string, updates: Partial<Transaksi>) => {
    const pbId = await resolvePbId(id);
    if (!pbId) throw new Error(`Transaksi "${id}" tidak ditemukan.`);

    const { investorEntries, bagiHasilChecks, ...trxUpdates } = updates;

    const pbUpdates: Record<string, unknown> = { ...trxUpdates, updatedBy: currentUserId() };
    if (bagiHasilChecks !== undefined) {
      // PATCH (kembali 400 PB): Kirim sebagai object, bukan JSON string.
      // PB SDK otomatis stringify JSON-field saat fetch; jika field "json",
      // stringified " + chr(34) + "" mungkin gagal divalidasi. Coba object dulu.
      // PATCH: Try JSON string. PB SDK accepts both object and string for json field, but
      // object case might fail validation on strict schema. Try stringifying.
      pbUpdates.bagiHasilChecks = JSON.stringify(bagiHasilChecks);
    }

    console.log("[updateTransaksi] id=", id, "pbId=", pbId, "pbUpdates=", JSON.stringify(pbUpdates));
    const record = await pb.collection("transaksis").update(pbId, pbUpdates);

    let resolvedEntries: TransaksiInvestorEntry[] | undefined;
    if (investorEntries !== undefined) {
      const oldEntryIds = await listInvestorEntryIds(pbId);
      let newEntryIds: string[] = [];
      try {
        const createdEntries = await Promise.all(
          investorEntries.map((entry) => pb.collection("transaksi_investors").create({
            transaksiId: pbId,
            pksId: entry.pksId ?? "",
            investorId: entry.investorId,
            investorName: entry.investorName,
            investorBrokerName: entry.investorBrokerName,
            nilaiInvestasi: entry.nilaiInvestasi,
            pctTrader: entry.pctTrader,
            pctMinBun: entry.pctMinBun,
            pctBrokerI: entry.pctBrokerI,
            pctBrokerII: entry.pctBrokerII,
          })),
        );
        newEntryIds = createdEntries.map((entry) => entry.id);
        await deleteInvestorEntriesByIds(oldEntryIds);
      } catch (entryErr) {
        // Rollback child baru jika create/delete gagal, agar tidak ada duplikasi.
        await deleteInvestorEntriesByIds(newEntryIds).catch(() => null);
        throw entryErr;
      }
      resolvedEntries = investorEntries;
    }

    setTransaksis((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        return recordToTransaksi(
          record,
          map,
          resolvedEntries ?? t.investorEntries,
        );
      }),
    );
  };

  const deleteTransaksi = async (id: string) => {
    const pbId = await resolvePbId(id);
    if (!pbId) throw new Error(`Transaksi "${id}" tidak ditemukan.`);

    const oldEntryIds = await listInvestorEntryIds(pbId);
    await pb.collection("transaksis").delete(pbId);
    // Hapus child setelah parent sukses; jika parent gagal, data tidak menjadi
    // orphan tanpa entries. Child orphan yang tersisa dapat dibersihkan retry.
    await deleteInvestorEntriesByIds(oldEntryIds);

    map.delete(id);
    setTransaksis((prev) => prev.filter((t) => t.id !== id));
  };

  const syncInvestorInfo = async (
    investorId: string,
    investorName: string,
    investorBrokerName: string,
  ) => {
    const records = await pb.collection("transaksi_investors").getFullList({
      filter: `investorId = "${investorId}"`,
      fields: "id,investorName,investorBrokerName",
    });
    const stale = records.filter(
      (r) => r.investorName !== investorName || (r.investorBrokerName || "") !== investorBrokerName,
    );
    if (stale.length === 0) return;

    await Promise.all(
      stale.map((r) =>
        pb.collection("transaksi_investors").update(r.id, { investorName, investorBrokerName }),
      ),
    );

    setTransaksis((prev) =>
      prev.map((t) => ({
        ...t,
        investorEntries: updateInvestorEntries(t.investorEntries, investorId, investorName, investorBrokerName),
      })),
    );
  };

  const uploadBuktiTransaksi = async (id: string, keterangan: string, file: File): Promise<string> => {
    const pbId = await resolvePbId(id);
    if (!pbId) throw new Error(`Transaksi "${id}" tidak ditemukan.`);
    
    const fieldMap: Record<string, string> = {
      Investor: "buktiInvestor",
      Broker: "buktiBroker",
      Trader: "buktiTrader",
      MinBun: "buktiMinBun",
    };
    const fieldName = fieldMap[keterangan];
    if (!fieldName) throw new Error(`Keterangan "${keterangan}" tidak dikenali.`);
    
    const fd = new FormData();
    fd.append(fieldName, file);
    const record = await pb.collection("transaksis").update(pbId, fd);
    
    const filename = record[fieldName];
    const url = filename ? `${PB_BASE}/api/files/transaksis/${pbId}/${filename}` : "";
    
    setTransaksis((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          return { ...t, [fieldName]: url };
        }
        return t;
      })
    );
    
    return url;
  };

  // ── LOGIKA AUTORENEWAL (ALPHABET INCREMENT) ──
  const triggerAutorenewal = async (oldTrxId: string) => {
    const oldTrx = transaksisRef.current.find((t) => t.id === oldTrxId);
    if (!oldTrx) return;

    // 1. Kenaikan Abjad untuk ID (TRX-0005A -> TRX-0005B)
    let newCustomId = "";
    const match = oldTrx.id.match(/^(TRX-\d+)([A-Z]?)$/);
    if (match) {
      const base = match[1];
      const letter = match[2];
      const incrementSuffix = (suffix: string): string => {
        if (!suffix) return "A";
        const chars = suffix.toUpperCase().split("");
        let index = chars.length - 1;
        while (index >= 0 && chars[index] === "Z") {
          chars[index] = "A";
          index--;
        }
        if (index < 0) return `A${chars.join("")}`;
        chars[index] = String.fromCharCode(chars[index].charCodeAt(0) + 1);
        return chars.join("");
      };
      newCustomId = base + incrementSuffix(letter);
    } else {
      newCustomId = `${oldTrx.id}A`;
    }

    // 2. Hitung Tanggal Mulai Baru — m-5: hardcode 30 hari per siklus.
    // 1 ID transaksi = 1 siklus (sudah didokumentasikan). Tidak parse dari
    // deskripsi karena user dapat menulis teks bebas (mis: "PT 2025" akan
    // menghasilkan daysMatch=2025, autorenewal meloncat 5.5 tahun).
    const days = 30;
    const [y, m, d] = oldTrx.date.slice(0, 10).split("-").map(Number);
    const newDateMs = Date.UTC(y, m - 1, d + days);
    const newDateStr = new Date(newDateMs).toISOString().slice(0, 10);

    // 3. Batalkan jika melebihi Tanggal Berakhir (endDate)
    if (oldTrx.endDate && newDateStr > oldTrx.endDate) {
      console.log(`Autorenewal dihentikan: ${newDateStr} melebihi batas endDate ${oldTrx.endDate}`);
      return;
    }

    // 4. Buat transaksi baru di database — C-4 retry pada konflik customId.
    try {
      let record: any = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          record = await pb.collection("transaksis").create({
            customId: newCustomId,
            createdBy: currentUserId(),
            updatedBy: currentUserId(),
            date: newDateStr,
            description: oldTrx.description,
            endDate: oldTrx.endDate || "",
            isAutorenewal: true,
            hpp: oldTrx.hpp,
            kebutuhanModal: oldTrx.kebutuhanModal,
            ongkirPerKg: oldTrx.ongkirPerKg,
            // PATCH (serius #17): autorenewal sebelumnya hardcode `hargaJual: 0`
            // yang membuat profit selalu 0. Sekarang copy hargaJual lama.
            hargaJual: oldTrx.hargaJual ?? 0,
            status: "berjalan",
            catatanAkhir: "",
          });
          break;
        } catch (err) {
          if (isCustomIdConflict(err) && attempt < 4) {
            newCustomId = await generateCustomId(true);
            continue;
          }
          throw err;
        }
      }
      if (!record) throw new Error("triggerAutorenewal: gagal membuat transaksi baru");

      // 5. Salin data investor
      await createInvestorEntries(record.id, oldTrx.investorEntries);

      // PATCH (serius #14): bukti transfer (buktiInvestor/dst) dan field
      // tambahan dari old TIDAK ter-clone. Sebelumnya autorenewal hanya
      // menyalin entries, sehingga TRX hasil clone kehilangan semua bukti
      // transfer lampau. Karena field bukti menyimpan URL PocketBase (string),
      // kita copy langsung.
      const proofFields = ["buktiInvestor", "buktiBroker", "buktiTrader", "buktiMinBun"] as const;
      const proofs: Record<string, unknown> = {};
      for (const f of proofFields) {
        if ((oldTrx as any)[f]) proofs[f] = (oldTrx as any)[f];
      }
      if (Object.keys(proofs).length > 0) {
        await pb.collection("transaksis").update(record.id, proofs).catch(() => null);
      }

      // 6. Tampilkan di layar
      const newTrx = recordToTransaksi(record, map, oldTrx.investorEntries);
      transaksisRef.current = [
        ...transaksisRef.current.filter((item) => item.id !== newTrx.id),
        newTrx,
      ];
      setTransaksis(transaksisRef.current);
    } catch (error) {
      console.error("Gagal menjalankan autorenewal:", error);
    }
  };

  const contextValue = useMemo(() => ({ transaksis, addTransaksi, updateTransaksi, deleteTransaksi, syncInvestorInfo, uploadBuktiTransaksi, triggerAutorenewal }), [transaksis, addTransaksi, updateTransaksi, deleteTransaksi, syncInvestorInfo, uploadBuktiTransaksi, triggerAutorenewal]);

  return (
    <TransaksiContext.Provider value={contextValue}>
      {children}
    </TransaksiContext.Provider>
  );
}

export function useTransaksi() {
  const ctx = useContext(TransaksiContext);
  if (!ctx) throw new Error("useTransaksi must be used within a TransaksiProvider");
  return ctx;
}