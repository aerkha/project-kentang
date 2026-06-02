"use client";

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import pb from "./pocketbase";
import { useInvestors } from "./investors-context";

export interface MoU {
  id: string;             // MOU-YYYYMM-NNN (customId, e.g. MOU-202505-001)
  date: string;
  investorId: string;
  investorName: string;
  investorAddress: string;
  investorOccupation: string;
  investorIdNumber: string;
  investorPhone: string;
  contractPeriod: number;
  investmentAmount: number;
  heirName: string;
  heirRelationship: string;
  heirPhone: string;
  keterangan?: string;
  isTerminated?: boolean;
  esignPihakPertama1?: string;
  esignPihakPertama2?: string;
  esignPihakKedua?: string;
  hasSignedDoc?: boolean;
  signedDocUrl?: string;
}

interface MouContextType {
  mous: MoU[];
  addMou:          (mou: Omit<MoU, "id">) => Promise<void>;
  updateMou:       (id: string, updates: Partial<MoU>) => Promise<void>;
  deleteMou:       (id: string) => Promise<void>;
  uploadSignedDoc: (id: string, file: File) => Promise<void>;
}

const MouContext = createContext<MouContextType | undefined>(undefined);

// Map customId → PocketBase record id
const pbIdMap = new Map<string, string>();

const PB_BASE = process.env.NEXT_PUBLIC_PB_URL || "http://127.0.0.1:8090";

/** Konversi base64 data URL ke File object untuk upload ke PocketBase */
function base64ToFile(dataUrl: string, fieldName: string): File {
  const [header, b64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] ?? "image/png";
  const ext  = mime.split("/")[1] ?? "png";
  const bytes = atob(b64);
  const arr   = new Uint8Array(bytes.length);
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

function recordToMou(r: Record<string, unknown>): MoU {
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
    contractPeriod:     r.contractPeriod     as number,
    investmentAmount:   r.investmentAmount   as number,
    heirName:           r.heirName           as string,
    heirRelationship:   r.heirRelationship   as string,
    heirPhone:          r.heirPhone          as string,
    keterangan:         (r.keterangan        as string) || "",
    isTerminated:       (r.isTerminated      as boolean) || false,
    esignPihakPertama1: pbFileUrl(pbRecordId, r.esignPihakPertama1),
    esignPihakPertama2: pbFileUrl(pbRecordId, r.esignPihakPertama2),
    esignPihakKedua:    pbFileUrl(pbRecordId, r.esignPihakKedua),
    hasSignedDoc:       !!signedDocUrl,
    signedDocUrl,
  };
}

/** Apakah sebuah MoU berstatus "aktif" (bukan expired, terminated, atau pending) */
function isMouAktif(mou: MoU): boolean {
  if (mou.isTerminated) return false;
  if (!mou.hasSignedDoc) return false;
  const end = new Date(mou.date);
  end.setDate(end.getDate() + mou.contractPeriod);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return end >= today;
}

/**
 * Format ID: MOU-YYYYMM-NNN
 */
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
  const { investors, updateInvestor } = useInvestors();

  useEffect(() => {
    pb.collection("mous")
      .getFullList({ sort: "customId" })
      .then((records) => setMous(records.map(recordToMou)))
      .catch(console.error);
  }, []);

  // ── Initial sync: jalankan sekali setelah mous & investors keduanya terisi ──
  const initialSyncDone = useRef(false);
  useEffect(() => {
    if (initialSyncDone.current) return;
    if (!mous.length || !investors.length) return;
    initialSyncDone.current = true;

    const investorIds = [...new Set(mous.map((m) => m.investorId))];
    for (const investorId of investorIds) {
      const shouldBeActive = mous
        .filter((m) => m.investorId === investorId)
        .some(isMouAktif);
      const investor = investors.find((i) => i.id === investorId);
      if (investor && investor.isActive !== shouldBeActive) {
        updateInvestor(investorId, { isActive: shouldBeActive }).catch(console.error);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mous, investors]);

  /**
   * Sinkronisasi isActive investor berdasarkan seluruh PKS yang dimilikinya.
   * Dipanggil langsung setelah setiap operasi MoU yang bisa mengubah status.
   * @param investorId  customId investor (e.g. "INV-0004")
   * @param latestMous  array MoU terbaru (setelah mutasi, sebelum re-render)
   */
  const syncInvestorStatus = async (investorId: string, latestMous: MoU[]) => {
    const shouldBeActive = latestMous
      .filter((m) => m.investorId === investorId)
      .some(isMouAktif);

    const investor = investors.find((i) => i.id === investorId);
    if (investor && investor.isActive !== shouldBeActive) {
      try {
        await updateInvestor(investorId, { isActive: shouldBeActive });
      } catch (e) {
        console.error("Gagal sinkronisasi status investor:", e);
      }
    }
  };

  const addMou = async (mou: Omit<MoU, "id">) => {
    const customId = await generateCustomId(mou.date);

    // Step 1: buat record tanpa esign
    let record = await pb.collection("mous").create({
      customId,
      date:               mou.date,
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
      isTerminated:       false,
    });

    // Step 2: upload esign sebagai file jika ada (base64 data URL)
    const esignPairs: [string, string][] = (
      [
        ["esignPihakPertama1", mou.esignPihakPertama1 ?? ""],
        ["esignPihakPertama2", mou.esignPihakPertama2 ?? ""],
        ["esignPihakKedua",    mou.esignPihakKedua    ?? ""],
      ] as [string, string][]
    ).filter(([, v]) => v.startsWith("data:"));

    if (esignPairs.length > 0) {
      const fd = new FormData();
      for (const [key, value] of esignPairs) {
        fd.append(key, base64ToFile(value, key));
      }
      record = await pb.collection("mous").update(record.id, fd);
    }

    const newMou    = recordToMou(record);
    const updatedMous = [...mous, newMou];
    setMous(updatedMous);

    // PKS baru selalu pending → investor nonaktif (kecuali punya PKS aktif lain)
    await syncInvestorStatus(mou.investorId, updatedMous);
  };

  const updateMou = async (id: string, updates: Partial<MoU>) => {
    const pbId = pbIdMap.get(id);
    if (!pbId) return;

    // Pisahkan field esign dari update reguler
    const {
      esignPihakPertama1,
      esignPihakPertama2,
      esignPihakKedua,
      hasSignedDoc: _hsd,
      signedDocUrl: _sdu,
      ...regularUpdates
    } = updates;

    let record = await pb.collection("mous").update(pbId, regularUpdates);

    // Upload esign sebagai file jika ada base64 baru
    const esignPairs: [string, string][] = (
      [
        ["esignPihakPertama1", esignPihakPertama1 ?? ""],
        ["esignPihakPertama2", esignPihakPertama2 ?? ""],
        ["esignPihakKedua",    esignPihakKedua    ?? ""],
      ] as [string, string][]
    ).filter(([, v]) => v.startsWith("data:"));

    if (esignPairs.length > 0) {
      const fd = new FormData();
      for (const [key, value] of esignPairs) {
        fd.append(key, base64ToFile(value, key));
      }
      record = await pb.collection("mous").update(pbId, fd);
    }

    const updatedMou  = recordToMou(record);
    const updatedMous = mous.map((m) => (m.id === id ? updatedMou : m));
    setMous(updatedMous);

    // Sync jika update menyentuh field yang bisa mengubah status PKS
    if ("isTerminated" in updates) {
      await syncInvestorStatus(updatedMou.investorId, updatedMous);
    }
  };

  const deleteMou = async (id: string) => {
    const pbId       = pbIdMap.get(id);
    if (!pbId) return;
    const mouToDelete = mous.find((m) => m.id === id);
    await pb.collection("mous").delete(pbId);
    pbIdMap.delete(id);
    const updatedMous = mous.filter((m) => m.id !== id);
    setMous(updatedMous);

    // Sync jika PKS yang dihapus berpengaruh pada status investor
    if (mouToDelete) {
      await syncInvestorStatus(mouToDelete.investorId, updatedMous);
    }
  };

  const uploadSignedDoc = async (id: string, file: File) => {
    const pbId = pbIdMap.get(id);
    if (!pbId) return;
    const fd = new FormData();
    fd.append("signedDoc", file);
    const record      = await pb.collection("mous").update(pbId, fd);
    const updatedMou  = recordToMou(record);
    const updatedMous = mous.map((m) => (m.id === id ? updatedMou : m));
    setMous(updatedMous);

    // PKS kini hasSignedDoc=true → mungkin menjadi aktif → sync investor
    await syncInvestorStatus(updatedMou.investorId, updatedMous);
  };

  return (
    <MouContext.Provider value={{ mous, addMou, updateMou, deleteMou, uploadSignedDoc }}>
      {children}
    </MouContext.Provider>
  );
}

export function useMou() {
  const ctx = useContext(MouContext);
  if (!ctx) throw new Error("useMou must be used within a MouProvider");
  return ctx;
}
