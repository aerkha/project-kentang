"use client";

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import pb from "./pocketbase";
import { useInvestors } from "./investors-context";
import {
  recordModalPksDigunakan,
  recordModalPksDiKembalikan,
  removeModalPksDiKembalikan,
} from "./cashflow-auto";
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
  contractPeriod: number;
  investmentAmount: number;
  heirName: string;
  heirRelationship: string;
  heirPhone: string;
  keterangan?: string;
  bagiHasilPP1: number;   // % Pihak Pertama I  (default 50)
  bagiHasilPP2: number;   // % Pihak Pertama II (default 15)
  bagiHasilPK:  number;   // % Pihak Kedua      (default 35)
  isTerminated?: boolean;
  bagiHasilDone?: boolean;
  bagiHasilChecks?: Record<string, boolean>; // { Investor: true, Broker: false, ... }
  buktiInvestor?: string; // URL file bukti transfer
  buktiBroker?:  string;
  buktiTrader?:  string;
  buktiMinBun?:  string;
  esignPihakPertama1?: string;
  esignPihakPertama2?: string;
  esignPihakKedua?: string;
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
    contractPeriod:     r.contractPeriod     as number,
    investmentAmount:   r.investmentAmount   as number,
    heirName:           r.heirName           as string,
    heirRelationship:   r.heirRelationship   as string,
    heirPhone:          r.heirPhone          as string,
    keterangan:         (r.keterangan        as string) || "",
    bagiHasilPP1:       (r.bagiHasilPP1      as number) ?? 50,
    bagiHasilPP2:       (r.bagiHasilPP2      as number) ?? 15,
    bagiHasilPK:        (r.bagiHasilPK       as number) ?? 35,
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
    hasSignedDoc:       !!signedDocUrl,
    signedDocUrl,
  };
}

/**
 * Parse tanggal "YYYY-MM-DD" sebagai UTC midnight.
 * Diperlukan karena `new Date("YYYY-MM-DD")` sudah UTC, tapi `new Date()` lokal —
 * keduanya harus berada di zona waktu yang sama agar perbandingan tidak off satu hari.
 */
function parseUtcDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Tanggal kalender WIB (UTC+7) hari ini sebagai UTC midnight.
 * Tanggal MoU (YYYY-MM-DD) di-parse sebagai UTC midnight, jadi "hari ini"
 * juga dipetakan ke UTC midnight dari tanggal kalender WIB — konsisten
 * di semua zona waktu client maupun server.
 */
function todayUtc(): Date {
  return parseUtcDate(todayWibStr());
}

export type MouStatus = "pending" | "aktif" | "expired" | "nonaktif";

/**
 * Status sebuah PKS. Satu-satunya sumber kebenaran — dipakai oleh halaman PKS,
 * halaman Investor, dan logika sinkronisasi isActive / cash flow di context ini
 * agar tidak ada perbedaan perhitungan antar tempat.
 */
export function getMouStatus(mou: MoU): MouStatus {
  if (mou.isTerminated) return "nonaktif";
  const today = todayUtc();
  const start = parseUtcDate(mou.date);
  const end   = new Date(start);
  end.setUTCDate(end.getUTCDate() + mou.contractPeriod);
  if (end < today) return "expired";
  const isBackdate = start < today;
  if (!isBackdate && !mou.hasSignedDoc) return "pending";
  return "aktif";
}

/** Apakah PKS telah melewati tanggal berakhir secara alami (bukan terminate manual) */
function isMouExpiredNatural(mou: MoU): boolean {
  return getMouStatus(mou) === "expired";
}

/** Apakah sebuah MoU berstatus "aktif" (bukan expired, terminated, atau pending) */
function isMouAktif(mou: MoU): boolean {
  return getMouStatus(mou) === "aktif";
}

function isCustomIdConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const data = (err as { data?: { data?: { customId?: { code?: string } } } }).data;
  return data?.data?.customId?.code === "validation_not_unique";
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
  /**
   * mousRef selalu berisi snapshot mous terbaru, termasuk perubahan yang
   * dilakukan dalam satu async function (sebelum re-render).
   * Diupdate secara sinkron setiap kali mous berubah (baris di bawah).
   */
  const mousRef = useRef<MoU[]>([]);
  mousRef.current = mous;

  const { investors, updateInvestor } = useInvestors();
  const pbIdMapRef = useRef(new Map<string, string>());
  const map = pbIdMapRef.current;

  /**
   * Ambil PocketBase internal ID untuk sebuah customId.
   * Jika tidak ada di cache (map stale / baru mount), re-fetch dari server.
   * Ini mencegah error 404 saat PocketBase direstart atau data di-recreate.
   */
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

  // ── Initial sync: jalankan sekali setelah mous & investors keduanya terisi ──
  const initialSyncDone = useRef(false);
  useEffect(() => {
    if (initialSyncDone.current) return;
    if (!mous.length || !investors.length) return;

    const investorIds = [...new Set(mous.map((m) => m.investorId))];
    const syncs = investorIds.flatMap((investorId) => {
      const shouldBeActive = mous
        .filter((m) => m.investorId === investorId)
        .some(isMouAktif);
      const investor = investors.find((i) => i.id === investorId);
      if (investor && investor.isActive !== shouldBeActive) {
        return [updateInvestor(investorId, { isActive: shouldBeActive })];
      }
      return [];
    });

    // Set flag SEBELUM Promise.all agar effect tidak terpanggil ulang
    // saat updateInvestor di dalam sync mengubah state investors.
    initialSyncDone.current = true;
    Promise.all(syncs).catch(console.error);

    // Catat pengembalian modal untuk PKS yang sudah expired secara alami.
    // cashflowTagExists di dalam recordModalPksDiKembalikan mencegah duplikasi.
    for (const m of mous) {
      if (isMouExpiredNatural(m)) {
        recordModalPksDiKembalikan(
          m.investorId,
          m.investorName,
          m.id,
          m.investmentAmount,
        ).catch((e) => console.warn("cashflow-auto: gagal catat modal PKS dikembalikan:", e));
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
    const pp1 = mou.bagiHasilPP1 ?? 50;
    const pp2 = mou.bagiHasilPP2 ?? 15;
    const pk  = mou.bagiHasilPK  ?? 35;
    if (pp1 + pp2 + pk !== 100) {
      throw new Error(`Persentase bagi hasil harus berjumlah 100% (saat ini ${pp1 + pp2 + pk}%)`);
    }

    let customId = await generateCustomId(mou.date);

    // Step 1: buat record tanpa esign (retry jika customId conflict)
    const createPayload = (id: string) => pb.collection("mous").create({
      customId: id,
      createdBy: currentUserId(),
      updatedBy: currentUserId(),
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
      bagiHasilPP1:       mou.bagiHasilPP1 ?? 50,
      bagiHasilPP2:       mou.bagiHasilPP2 ?? 15,
      bagiHasilPK:        mou.bagiHasilPK  ?? 35,
      isTerminated:       false,
    });

    let record = await createPayload(customId).catch(async (err) => {
      for (let attempt = 1; attempt < 5; attempt++) {
        if (!isCustomIdConflict(err)) throw err;
        customId = await generateCustomId(mou.date);
        try { return await createPayload(customId); } catch (e) { err = e; }
      }
      throw err;
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

    const newMou = recordToMou(record, map);
    // Update ref segera agar sync concurrent melihat MoU terbaru
    mousRef.current = [...mousRef.current, newMou];
    setMous(mousRef.current);
    await syncInvestorStatus(mou.investorId, mousRef.current);

    // Jika PKS langsung aktif (backdate), catat modal digunakan ke cash flow
    if (isMouAktif(newMou)) {
      recordModalPksDigunakan(
        newMou.investorId,
        newMou.investorName,
        newMou.id,
        newMou.investmentAmount,
        newMou.date,
      ).catch((e) => console.warn("cashflow-auto: gagal catat modal PKS digunakan:", e));
    }
  };

  const updateMou = async (id: string, updates: Partial<MoU>) => {
    const pbId = await resolvePbId(id);
    if (!pbId) return;
    const prevMou = mousRef.current.find((m) => m.id === id);

    // Pisahkan field esign dari update reguler
    const {
      esignPihakPertama1,
      esignPihakPertama2,
      esignPihakKedua,
      hasSignedDoc: _hsd,
      signedDocUrl: _sdu,
      ...regularUpdates
    } = updates;

    // Serialisasi bagiHasilChecks ke JSON string sebelum kirim ke PocketBase
    const { bagiHasilChecks, ...restUpdates } = regularUpdates;
    const pbUpdates: Record<string, unknown> = { ...restUpdates, updatedBy: currentUserId() };
    if (bagiHasilChecks !== undefined) {
      pbUpdates.bagiHasilChecks = JSON.stringify(bagiHasilChecks);
    }

    // Nilai esign "" eksplisit berarti user menghapus tanda tangan —
    // kosongkan field file di server. URL http(s) berarti tidak berubah (skip),
    // data URL berarti upload baru (ditangani lewat FormData di bawah).
    const esignAll: [string, string | undefined][] = [
      ["esignPihakPertama1", esignPihakPertama1],
      ["esignPihakPertama2", esignPihakPertama2],
      ["esignPihakKedua",    esignPihakKedua],
    ];
    for (const [key, value] of esignAll) {
      if (value === "") pbUpdates[key] = null;
    }

    let record = await pb.collection("mous").update(pbId, pbUpdates);

    // Upload esign sebagai file jika ada base64 baru
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
    // Update ref segera agar sync concurrent melihat versi terbaru
    mousRef.current = mousRef.current.map((m) => (m.id === id ? updatedMou : m));
    setMous(mousRef.current);

    // Sync jika update menyentuh field yang bisa mengubah status PKS
    const statusFields = ["isTerminated", "date", "contractPeriod", "hasSignedDoc"] as const;
    if (statusFields.some((f) => f in updates)) {
      await syncInvestorStatus(updatedMou.investorId, mousRef.current);
    }

    // ── Cash flow: terminate / aktifkan kembali ──
    // Fire-and-forget seperti pencatatan otomatis lainnya — jangan blokir UI.
    const wasTerminated = prevMou?.isTerminated === true;
    const nowTerminated = updatedMou.isTerminated === true;
    if (prevMou && wasTerminated !== nowTerminated) {
      if (nowTerminated) {
        // PKS dihentikan manual → modal kembali ke kas hari ini.
        // recordModalPksDiKembalikan hanya mencatat jika modal PKS ini
        // pernah tercatat digunakan, dan mencegah duplikasi via tag.
        recordModalPksDiKembalikan(
          updatedMou.investorId,
          updatedMou.investorName,
          updatedMou.id,
          updatedMou.investmentAmount,
        ).catch((e) => console.warn("cashflow-auto: gagal catat modal PKS dikembalikan:", e));
      } else if (getMouStatus(updatedMou) !== "expired") {
        // Diaktifkan kembali dan belum melewati tanggal berakhir → modal
        // dipakai lagi, hapus entri pengembalian agar arus kas tidak dobel.
        // (Jika sudah expired, entri pengembalian dibiarkan — modal memang kembali.)
        removeModalPksDiKembalikan(updatedMou.investorId, updatedMou.id)
          .catch((e) => console.warn("cashflow-auto: gagal hapus entri modal dikembalikan:", e));
      }
    }
  };

  const deleteMou = async (id: string) => {
    const pbId       = await resolvePbId(id);
    if (!pbId) return;
    const mouToDelete = mousRef.current.find((m) => m.id === id);
    await pb.collection("mous").delete(pbId);
    map.delete(id);
    // Update ref segera agar sync concurrent tidak melihat MoU yang sudah dihapus
    mousRef.current = mousRef.current.filter((m) => m.id !== id);
    setMous(mousRef.current);

    // Sync jika PKS yang dihapus berpengaruh pada status investor
    if (mouToDelete) {
      await syncInvestorStatus(mouToDelete.investorId, mousRef.current);
    }
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
    // Kembalikan URL file yang baru diupload agar caller tidak perlu membaca state (yang belum flush)
    return (updatedMou[fieldName as keyof MoU] as string) ?? "";
  };

  const uploadSignedDoc = async (id: string, file: File) => {
    const pbId = await resolvePbId(id);
    if (!pbId) throw new Error(`PKS "${id}" tidak ditemukan di server — coba refresh halaman.`);
    const fd = new FormData();
    fd.append("signedDoc", file);
    const record      = await pb.collection("mous").update(pbId, fd);
    const updatedMou = recordToMou(record, map);
    // Update ref segera agar sync melihat versi terbaru (hasSignedDoc=true)
    mousRef.current = mousRef.current.map((m) => (m.id === id ? updatedMou : m));
    setMous(mousRef.current);

    // PKS kini hasSignedDoc=true → mungkin menjadi aktif → sync investor
    await syncInvestorStatus(updatedMou.investorId, mousRef.current);

    // Jika PKS kini aktif (signed doc baru diunggah mengaktifkannya),
    // catat modal digunakan ke cash flow (duplikasi dicegah oleh tag check).
    if (isMouAktif(updatedMou)) {
      recordModalPksDigunakan(
        updatedMou.investorId,
        updatedMou.investorName,
        updatedMou.id,
        updatedMou.investmentAmount,
        updatedMou.date,
      ).catch((e) => console.warn("cashflow-auto: gagal catat modal PKS digunakan:", e));
    }
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
