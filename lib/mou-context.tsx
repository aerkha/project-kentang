"use client";

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import pb from "./pocketbase";
import { todayWibStr } from "./utils";

const currentUserId = () => (pb.authStore.record?.id as string | undefined) ?? "";

export interface MoU {
  id: string;             // MOU-YYYYMM-NNN (customId, e.g. MOU-202505-001)
  date: string;
  investorId: string;
  investorName: string;
  investorAddress: string;
  investorOccupation: string;
  investorIdNumber: string;
  investorPhone: string;
  endDate: string;
  contractPeriod: number;   // periode bagi hasil (hari, default 30)
  investmentAmount: number;
  heirName: string;
  heirRelationship: string;
  heirPhone: string;
  keterangan?: string;
  bagiHasilPP1: number;   // % Pihak Pertama I  (default 50)
  bagiHasilPP2: number;   // % Pihak Pertama II (default 15)
  bagiHasilPK:  number;   // % Pihak Kedua      (default 35)
  isComplete?: boolean;
  isTerminated?: boolean;
  siklus?: number;             // jumlah siklus (default 1, bertambah tiap renewal)
  bagiHasilDone?: boolean;
  bagiHasilChecks?: Record<string, boolean>; // { Investor: true, Broker: false, ... }
  buktiInvestor?: string; // URL file bukti transfer
  buktiBroker?:  string;
  buktiTrader?:  string;
  buktiMinBun?:  string;
  esignPihakPertama1?: string;
  esignPihakPertama2?: string;
  esignPihakKedua?: string;
  // Broker sebagai Pihak Pertama III (opsional)
  brokerId?: string;
  brokerName?: string;
  brokerAddress?: string;
  brokerIdNumber?: string;
  brokerPhone?: string;
  bagiHasilPP3?: number;
  esignPihakPertama3?: string;
  hasSignedDoc?: boolean;
  signedDocUrl?: string;
}

// Mapping keterangan → nama field file di PocketBase
export const BUKTI_FIELD: Record<string, string> = {
  Investor: "buktiInvestor",
  Broker:   "buktiBroker",
  Trader:   "buktiTrader",
  MinBun:   "buktiMinBun",
};

interface MouContextType {
  mous: MoU[];
  addMou:              (mou: Omit<MoU, "id">) => Promise<void>;
  updateMou:           (id: string, updates: Partial<MoU>) => Promise<void>;
  deleteMou:           (id: string) => Promise<void>;
  uploadSignedDoc:     (id: string, file: File) => Promise<void>;
  uploadBuktiTransfer: (id: string, keterangan: string, file: File) => Promise<string>;
}

const MouContext = createContext<MouContextType | undefined>(undefined);

const PB_BASE = process.env.NEXT_PUBLIC_PB_URL || "http://127.0.0.1:8090";

/** Konversi base64 data URL ke File object untuk upload ke PocketBase */
function base64ToFile(dataUrl: string, fieldName: string): File {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) throw new Error("base64ToFile: input bukan data URL yang valid");
  const header = dataUrl.slice(0, commaIdx);
  const b64    = dataUrl.slice(commaIdx + 1);
  const mime   = header.match(/:(.*?);/)?.[1] ?? "image/png";
  const ext    = mime.split("/")[1] ?? "png";
  const bytes  = atob(b64);
  const arr    = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new File([arr], `${fieldName}.${ext}`, { type: mime });
}

/** Ambil URL file dari field File PocketBase */
function pbFileUrl(pbRecordId: string, fieldValue: unknown): string {
  const filename = Array.isArray(fieldValue)
    ? (fieldValue[0] as string) || ""
    : (fieldValue as string) || "";
  return filename ? `${PB_BASE}/api/files/mous/${pbRecordId}/${filename}` : "";
}

function recordToMou(r: Record<string, unknown>, pbIdMap: Map<string, string>): MoU {
  const customId   = r.customId as string;
  const pbRecordId = r.id as string;
  pbIdMap.set(customId, pbRecordId);

  const signedDocUrl = pbFileUrl(pbRecordId, r.signedDoc);

  return {
    id:                 customId,
    date:               r.date               as string,
    investorId:         r.investorId         as string,
    investorName:       r.investorName       as string,
    investorAddress:    r.investorAddress    as string,
    investorOccupation: (r.investorOccupation as string) || "",
    investorIdNumber:   r.investorIdNumber   as string,
    investorPhone:      r.investorPhone      as string,
    endDate:            (r.endDate           as string) || "",
    contractPeriod:     (r.contractPeriod    as number) || 30,
    siklus:             (r.siklus            as number) || 1,
    investmentAmount:   r.investmentAmount   as number,
    heirName:           r.heirName           as string,
    heirRelationship:   r.heirRelationship   as string,
    heirPhone:          r.heirPhone          as string,
    keterangan:         (r.keterangan        as string) || "",
    bagiHasilPP1:       (r.bagiHasilPP1      as number) ?? 50,
    bagiHasilPP2:       (r.bagiHasilPP2      as number) ?? 15,
    bagiHasilPK:        (r.bagiHasilPK       as number) ?? 35,
    isComplete:         (r.isComplete        as boolean) || false,
    isTerminated:       (r.isTerminated      as boolean) || false,
    bagiHasilDone:      (r.bagiHasilDone     as boolean) || false,
    buktiInvestor:      pbFileUrl(pbRecordId, r.buktiInvestor),
    buktiBroker:        pbFileUrl(pbRecordId, r.buktiBroker),
    buktiTrader:        pbFileUrl(pbRecordId, r.buktiTrader),
    buktiMinBun:        pbFileUrl(pbRecordId, r.buktiMinBun),
    bagiHasilChecks:    (() => {
      const raw = r.bagiHasilChecks;
      if (!raw) return {};
      if (typeof raw === "object") return raw as Record<string, boolean>;
      try { return JSON.parse(raw as string) as Record<string, boolean>; }
      catch { return {}; }
    })(),
    esignPihakPertama1: pbFileUrl(pbRecordId, r.esignPihakPertama1),
    esignPihakPertama2: pbFileUrl(pbRecordId, r.esignPihakPertama2),
    esignPihakKedua:    pbFileUrl(pbRecordId, r.esignPihakKedua),
    brokerId:           (r.brokerId      as string) || "",
    brokerName:         (r.brokerName    as string) || "",
    brokerAddress:      (r.brokerAddress as string) || "",
    brokerIdNumber:     (r.brokerIdNumber as string) || "",
    brokerPhone:        (r.brokerPhone   as string) || "",
    bagiHasilPP3:       (r.bagiHasilPP3  as number) ?? 0,
    esignPihakPertama3: pbFileUrl(pbRecordId, r.esignPihakPertama3),
    hasSignedDoc:       !!signedDocUrl,
    signedDocUrl,
  };
}

/**
 * Parse tanggal "YYYY-MM-DD" sebagai UTC midnight.
 */
function parseUtcDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Tanggal kalender WIB (UTC+7) hari ini sebagai UTC midnight.
 */
function todayUtc(): Date {
  return parseUtcDate(todayWibStr());
}

export type MouStatus = "draft" | "complete";

/** Status PKS: draft (belum final) atau complete (sudah final). */
export function getMouStatus(mou: MoU): MouStatus {
  return mou.isComplete ? "complete" : "draft";
}

function isCustomIdConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const data = (err as { data?: { data?: { customId?: { code?: string } } } }).data;
  return data?.data?.customId?.code === "validation_not_unique";
}

/** Format ID: MOU-YYYYMM-NNN */
async function generateCustomId(date: string): Promise<string> {
  const ym     = date.slice(0, 7).replace("-", "");
  const prefix = `MOU-${ym}-`;
  try {
    const res = await pb.collection("mous").getFullList({
      filter: `customId ~ "${prefix}"`,
      fields: "customId",
    });
    const max = res.reduce((m, r) => {
      const cid = r.customId as string;
      if (!cid.startsWith(prefix)) return m;
      const n = parseInt(cid.slice(prefix.length)) || 0;
      return n > m ? n : m;
    }, 0);
    return `${prefix}${String(max + 1).padStart(3, "0")}`;
  } catch {
    return `${prefix}001`;
  }
}

export function MouProvider({ children }: { children: ReactNode }) {
  const [mous, setMous] = useState<MoU[]>([]);
  const mousRef = useRef<MoU[]>([]);
  mousRef.current = mous;

  const pbIdMapRef = useRef(new Map<string, string>());
  const map = pbIdMapRef.current;

  const resolvePbId = async (customId: string): Promise<string | null> => {
    const cached = map.get(customId);
    if (cached) return cached;
    try {
      const res = await pb.collection("mous").getFirstListItem(
        `customId = "${customId}"`,
        { fields: "id,customId" },
      );
      map.set(customId, res.id);
      return res.id;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    pb.collection("mous")
      .getFullList({ sort: "customId" })
      .then((records) => setMous(records.map((r) => recordToMou(r, map))))
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addMou = async (mou: Omit<MoU, "id">) => {
    const pp1 = mou.bagiHasilPP1 ?? 50;
    const pp2 = mou.bagiHasilPP2 ?? 15;
    const pp3 = mou.bagiHasilPP3 ?? 0;
    const pk  = mou.bagiHasilPK  ?? 35;
    if (pp1 + pp2 + pp3 + pk !== 100) {
      throw new Error(`Persentase bagi hasil harus berjumlah 100% (saat ini ${pp1 + pp2 + pp3 + pk}%)`);
    }

    let customId = await generateCustomId(mou.date);

    const createPayload = (id: string) => pb.collection("mous").create({
      customId: id,
      createdBy: currentUserId(),
      updatedBy: currentUserId(),
      date:               mou.date,
      endDate:            mou.endDate || "",
      investorId:         mou.investorId,
      investorName:       mou.investorName,
      investorAddress:    mou.investorAddress,
      investorOccupation: mou.investorOccupation || "",
      investorIdNumber:   mou.investorIdNumber,
      investorPhone:      mou.investorPhone,
      contractPeriod:     mou.contractPeriod,
      investmentAmount:   mou.investmentAmount,
      heirName:           mou.heirName,
      heirRelationship:   mou.heirRelationship,
      heirPhone:          mou.heirPhone,
      keterangan:         mou.keterangan || "",
      bagiHasilPP1:       mou.bagiHasilPP1 ?? 50,
      bagiHasilPP2:       mou.bagiHasilPP2 ?? 15,
      bagiHasilPK:        mou.bagiHasilPK  ?? 35,
      brokerId:           mou.brokerId     || "",
      brokerName:         mou.brokerName   || "",
      brokerAddress:      mou.brokerAddress || "",
      brokerIdNumber:     mou.brokerIdNumber || "",
      brokerPhone:        mou.brokerPhone   || "",
      bagiHasilPP3:       mou.bagiHasilPP3 ?? 0,
      isTerminated:       false,
      isComplete:         false,
    });

    let record = await createPayload(customId).catch(async (err) => {
      for (let attempt = 1; attempt < 5; attempt++) {
        if (!isCustomIdConflict(err)) throw err;
        customId = await generateCustomId(mou.date);
        try { return await createPayload(customId); } catch (e) { err = e; }
      }
      throw err;
    });

    // Upload esign sebagai file jika ada (base64 data URL)
    const esignPairs: [string, string][] = (
      [
        ["esignPihakPertama1", mou.esignPihakPertama1  ?? ""],
        ["esignPihakPertama2", mou.esignPihakPertama2  ?? ""],
        ["esignPihakKedua",    mou.esignPihakKedua     ?? ""],
        ["esignPihakPertama3", mou.esignPihakPertama3  ?? ""],
      ] as [string, string][]
    ).filter(([, v]) => v.startsWith("data:"));

    if (esignPairs.length > 0) {
      const fd = new FormData();
      for (const [key, value] of esignPairs) {
        fd.append(key, base64ToFile(value, key));
      }
      record = await pb.collection("mous").update(record.id, fd);
    }

    const newMou = recordToMou(record, map);
    mousRef.current = [...mousRef.current, newMou];
    setMous(mousRef.current);
  };

  const updateMou = async (id: string, updates: Partial<MoU>) => {
    const pbId = await resolvePbId(id);
    if (!pbId) return;

    const {
      esignPihakPertama1,
      esignPihakPertama2,
      esignPihakKedua,
      esignPihakPertama3,
      hasSignedDoc: _hsd,
      signedDocUrl: _sdu,
      ...regularUpdates
    } = updates;

    const { bagiHasilChecks, ...restUpdates } = regularUpdates;
    const pbUpdates: Record<string, unknown> = { ...restUpdates, updatedBy: currentUserId() };
    if (bagiHasilChecks !== undefined) {
      pbUpdates.bagiHasilChecks = JSON.stringify(bagiHasilChecks);
    }

    const esignAll: [string, string | undefined][] = [
      ["esignPihakPertama1", esignPihakPertama1],
      ["esignPihakPertama2", esignPihakPertama2],
      ["esignPihakKedua",    esignPihakKedua],
      ["esignPihakPertama3", esignPihakPertama3],
    ];
    for (const [key, value] of esignAll) {
      if (value === "") pbUpdates[key] = null;
    }

    let record = await pb.collection("mous").update(pbId, pbUpdates);

    const esignPairs: [string, string][] = (
      esignAll.map(([k, v]) => [k, v ?? ""]) as [string, string][]
    ).filter(([, v]) => v.startsWith("data:"));

    if (esignPairs.length > 0) {
      const fd = new FormData();
      for (const [key, value] of esignPairs) {
        fd.append(key, base64ToFile(value, key));
      }
      record = await pb.collection("mous").update(pbId, fd);
    }

    const updatedMou = recordToMou(record, map);
    mousRef.current = mousRef.current.map((m) => (m.id === id ? updatedMou : m));
    setMous(mousRef.current);
  };

  const deleteMou = async (id: string) => {
    const pbId       = await resolvePbId(id);
    if (!pbId) return;
    const mouToDelete = mousRef.current.find((m) => m.id === id);
    await pb.collection("mous").delete(pbId);
    map.delete(id);
    mousRef.current = mousRef.current.filter((m) => m.id !== id);
    setMous(mousRef.current);
  };

  const uploadBuktiTransfer = async (id: string, keterangan: string, file: File): Promise<string> => {
    const pbId     = await resolvePbId(id);
    if (!pbId) throw new Error(`PKS "${id}" tidak ditemukan.`);
    const fieldName = BUKTI_FIELD[keterangan];
    if (!fieldName) throw new Error(`Keterangan "${keterangan}" tidak dikenali.`);
    const fd = new FormData();
    fd.append(fieldName, file);
    const record     = await pb.collection("mous").update(pbId, fd);
    const updatedMou = recordToMou(record, map);
    setMous((prev) => prev.map((m) => (m.id === id ? updatedMou : m)));
    return (updatedMou[fieldName as keyof MoU] as string) ?? "";
  };

  const uploadSignedDoc = async (id: string, file: File) => {
    const pbId = await resolvePbId(id);
    if (!pbId) throw new Error(`PKS "${id}" tidak ditemukan di server — coba refresh halaman.`);
    const fd = new FormData();
    fd.append("signedDoc", file);
    const record      = await pb.collection("mous").update(pbId, fd);
    const updatedMou = recordToMou(record, map);
    mousRef.current = mousRef.current.map((m) => (m.id === id ? updatedMou : m));
    setMous(mousRef.current);
    await syncInvestorStatus(updatedMou.investorId, mousRef.current);
  };

  return (
    <MouContext.Provider value={{ mous, addMou, updateMou, deleteMou, uploadSignedDoc, uploadBuktiTransfer }}>
      {children}
    </MouContext.Provider>
  );
}

export function useMou() {
  const ctx = useContext(MouContext);
  if (!ctx) throw new Error("useMou must be used within a MouProvider");
  return ctx;
}
