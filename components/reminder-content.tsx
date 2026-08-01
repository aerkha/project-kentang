"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { toast } from "sonner";

// Helper untuk revoke object URL agar tidak memory leak.
function revokePreview(url: string) {
  if (url && url.startsWith("blob:")) {
    try { URL.revokeObjectURL(url); } catch { /* ignore */ }
  }
}
import { usePks, type Pks } from "@/lib/pks-context";
import { todayWibStr } from "@/lib/utils";
import { useTransaksi, calcTransaksi, effectiveStatus, type Transaksi } from "@/lib/transaksi-context";
import { useInvestors, type Investor } from "@/lib/investors-context";
import { useBrokers, type Broker } from "@/lib/brokers-context";
import { usePengeluaran } from "@/lib/cashflow-context";
import { useSettings } from "@/lib/settings-context";
import { useReminderLogs, type ReminderLog } from "@/lib/reminder-logs-context";
import pb from "@/lib/pocketbase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Bell,
  CheckCircle2,
  Circle,
  Users,
  TrendingUp,
  Wallet,
  Briefcase,
  Banknote,
  Settings2,
  Save,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Send,
  RefreshCw,
  Mail,
  MessageCircle,
  Clock,
  ShieldCheck,
  Upload,
  XCircle,
  Crown,
} from "lucide-react";

// ── Helpers Umum ─────────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function formatShort(n: number) {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}Jt`;
  if (Math.abs(n) >= 1_000)         return `${(n / 1_000).toFixed(0)}Rb`;
  return n.toFixed(0);
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR",
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(n);
}

function diffDays(startStr: string, endStr: string): number {
  const [sy, sm, sd] = startStr.slice(0, 10).split("-").map(Number);
  const [ey, em, ed] = endStr.slice(0, 10).split("-").map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);
  return Math.round((endMs - startMs) / 86_400_000);
}

function parsePeriodeDays(desc: string): number {
  const m = /\d+/.exec(desc ?? "");
  const n = m ? Number.parseInt(m[0], 10) : 30;
  return n > 0 ? n : 30;
}

function dueDateTransaksi(t: { date: string; description: string }): string {
  if (!t.date) return "";
  const days = parsePeriodeDays(t.description);
  const [y, m, d] = t.date.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function sisaHari(t: { date: string; description: string }): number {
  const endStr = dueDateTransaksi(t);
  return endStr ? diffDays(todayWibStr(), endStr) : 0;
}

function endDatePks(pks: Pks) {
  if (pks.endDate) {
    return pks.endDate.slice(0, 10);
  }
  const [y, m, d] = pks.date.slice(0, 10).split("-").map(Number);
  const totalDays = (pks.contractPeriod || 30) * (pks.siklus || 1);
  return new Date(Date.UTC(y, m - 1, d + totalDays)).toISOString().slice(0, 10);
}

function sisaHariPks(pks: Pks): number {
  if (!pks.date) return 0;
  const endStr = endDatePks(pks);
  return diffDays(todayWibStr(), endStr);
}

function getDisplayStatus(t: Transaksi): string {
  const base = effectiveStatus(t);
  if (base === "berjalan" && sisaHari(t) < 0) return "selesai";
  return base;
}

function getSisaHariText(s: number) {
  if (s > 0) return `${s} hari lagi`;
  if (s === 0) return "Hari ini";
  return `Lewat ${-s} hari`;
}

function getSisaHariColor(s: number) {
  if (s < 0) return "text-red-600 font-semibold";
  if (s <= 7) return "text-orange-600 font-semibold";
  return "text-muted-foreground";
}

// ── Tipe baris tabel ─────────────────────────────────────────────────────────

type PaymentRow = {
  nama:          string;
  keterangan:    "Investor" | "Broker" | "Trader" | "MinBun" | "Pengembalian Modal";
  bankName:      string;
  accountNumber: string;
  jumlah:        number;
  checkKey:      string; 
  investorId?:   string; 
};

type AccountInfo = { nama: string; bankName: string; accountNumber: string };

function getInvestorPkPct(investorId: string, pksList: Pks[]): number {
  const latest = pksList
    .filter((m) => m.investorId === investorId)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return latest?.bagiHasilPK ?? 35;
}

function resolveDistributionPercentages(entry: {
  pctTrader: number;
  pctMinBun: number;
  pctBrokerI: number;
  pctBrokerII: number;
  investorBrokerName?: string | null;
}) {
  const allZero = entry.pctTrader === 0 && entry.pctMinBun === 0 && entry.pctBrokerI === 0 && entry.pctBrokerII === 0;
  const hasBroker = !!entry.investorBrokerName;
  const pT = allZero ? 10 : entry.pctTrader;
  let pM = entry.pctMinBun;
  if (allZero) {
    pM = hasBroker ? 0 : 5;
  }
  let pBI = entry.pctBrokerI;
  if (allZero) {
    pBI = hasBroker ? 5 : 0;
  }
  const pBII = allZero ? 0 : entry.pctBrokerII;

  return { pT, pM, pBI, pBII };
}

function addBrokerAmount(
  brokerMap: Map<string, { nama: string; bankName: string; accountNumber: string; jumlah: number }>,
  brokerKey: string,
  brokerData: Broker | undefined,
  brokerAmt: number,
) {
  const existing = brokerMap.get(brokerKey);
  if (existing) {
    existing.jumlah += brokerAmt;
  } else {
    brokerMap.set(brokerKey, {
      nama: brokerKey,
      bankName: brokerData?.bankName || "—",
      accountNumber: brokerData?.accountNumber || "—",
      jumlah: brokerAmt,
    });
  }
}

function buildTransaksiRows(
  trx:        Transaksi,
  pksList:       Pks[],
  investors:  Investor[],
  brokers:    Broker[],
  minbunAcc:  AccountInfo,
  traderAcc:  AccountInfo,
): PaymentRow[] {
  const rows: PaymentRow[] = [];
  const calc = calcTransaksi(trx);
  if (calc.totalInvestasi === 0 || calc.profit <= 0) return rows;

  let traderTotal = 0;
  let minbunTotal = 0;
  const brokerMap = new Map<string, { nama: string; bankName: string; accountNumber: string; jumlah: number }>();

  for (const entry of trx.investorEntries) {
    if (entry.nilaiInvestasi <= 0) continue;

    const pkPct   = getInvestorPkPct(entry.investorId, pksList) / 100;
    const ratio   = entry.nilaiInvestasi / calc.totalInvestasi;
    const profit  = calc.profit * ratio;
    const { pT, pM, pBI, pBII } = resolveDistributionPercentages(entry);

    const investorAmt = profit * pkPct;
    traderTotal      += profit * pT            / 100;
    minbunTotal      += profit * pM            / 100;
    const brokerAmt   = profit * (pBI + pBII)  / 100;

    if (investorAmt > 0) {
      const inv = investors.find((i) => i.id === entry.investorId);
      rows.push({
        nama:          entry.investorName,
        keterangan:    "Investor",
        bankName:      inv?.bankName      || "—",
        accountNumber: inv?.accountNumber || "—",
        jumlah:        investorAmt,
        checkKey:      `${entry.investorId}_Investor`,
        investorId:    entry.investorId,
      });
    }

    if (brokerAmt > 0 && entry.investorBrokerName) {
      addBrokerAmount(
        brokerMap,
        entry.investorBrokerName,
        brokers.find((b) => b.name === entry.investorBrokerName),
        brokerAmt,
      );
    }
  }

  for (const [brokerKey, data] of brokerMap) {
    rows.push({
      nama:          data.nama,
      keterangan:    "Broker",
      bankName:      data.bankName,
      accountNumber: data.accountNumber,
      jumlah:        data.jumlah,
      checkKey:      `${brokerKey}_Broker`,
    });
  }

  if (traderTotal > 0) {
    rows.push({
      nama:          traderAcc.nama || "Trader",
      keterangan:    "Trader",
      bankName:      traderAcc.bankName      || "—",
      accountNumber: traderAcc.accountNumber || "—",
      jumlah:        traderTotal,
      checkKey:      "Trader",
    });
  }

  if (minbunTotal > 0) {
    rows.push({
      nama:          minbunAcc.nama || "MinBun",
      keterangan:    "MinBun",
      bankName:      minbunAcc.bankName      || "—",
      accountNumber: minbunAcc.accountNumber || "—",
      jumlah:        minbunTotal,
      checkKey:      "MinBun",
    });
  }

  return rows;
}

// ── Tipe & Helper Pengelompokan (Bulk Entity) ────────────────────────────────

type EntitySummaryItem =
  | {
      sourceId: string;
      type: "Bagi Hasil";
      keterangan: string;
      trx: Transaksi;
      jumlah: number;
      checkKey: string;
      isDone: boolean;
      sisa: number;
      statusTampil: string;
    }
  | {
      sourceId: string;
      type: "Pengembalian Modal";
      keterangan: string;
      pks: Pks;
      jumlah: number;
      checkKey: string;
      isDone: boolean;
      sisa: number;
      statusTampil: string;
    };

type RecipientRole = "Investor" | "Broker" | "System";

type ProcessedEntity = {
  id: string; 
  nama: string;
  bankName: string;
  accountNumber: string;
  investorId?: string;
  roles: string[];
  recipientRole: RecipientRole;
  filteredItems: EntitySummaryItem[];
  totalAmount: number;
  isInternal: boolean;
  sisaTarget: number; 
};

/**
 * Deteksi error pattern dari Fonnte / email yang menandakan sebenarnya gagal
 * padahal field `waStatus` / `emailStatus` di DB tercatat "sent".
 * Ini terjadi karena log lama dibuat sebelum validasi response Fonnte dipasang.
 * Kita override display agar tidak membingungkan admin.
 */
function detectFailedByErrorMessage(errorMessage?: string): boolean {
  if (!errorMessage) return false;
  const lc = errorMessage.toLowerCase();
  return (
    lc.includes("disconnected") ||
    lc.includes("not connected") ||
    lc.includes("not registered") ||
    lc.includes("request invalid") ||
    lc.includes("fonnte:") ||
    lc.includes("fonnte http") ||
    lc.includes("email:") ||
    lc.includes("error")
  );
}

function ChannelBadge({
  status,
  icon,
  errorMessage,
}: Readonly<{ status: string; icon: React.ReactNode; errorMessage?: string }>) {
  // Jika DB mencatat "sent" tapi errorMessage mengandung pola gagal,
  // tampilkan sebagai "Gagal" agar UI tidak membingungkan.
  const displayStatus =
    status === "sent" && detectFailedByErrorMessage(errorMessage)
      ? "failed"
      : status;
  const map: Record<string, string> = {
    sent:    "bg-green-100 text-green-700",
    failed:  "bg-red-100 text-red-700",
    skipped: "bg-muted text-muted-foreground",
  };
  const label: Record<string, string> = {
    sent: "Terkirim", failed: "Gagal", skipped: "Belum diset",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${map[displayStatus] ?? map.skipped}`}
      title={errorMessage || undefined}
    >
      {icon}{label[displayStatus] ?? displayStatus}
    </span>
  );
}

// ── Component Extracted Helpers (Disesuaikan dengan `any` untuk Bypass Strict TS) ──

type ProcessInternalEntityParams = {
  entity: ProcessedEntity;
  pksList: Pks[];
  investors: Investor[];
  brokers: Broker[];
  minbun: AccountInfo;
  trader: AccountInfo;
  cashflowTagRecordedFn: (tag: string) => boolean;
  addPengeluaranFn: (p: any) => Promise<void>;
  updateTransaksiFn: (id: string, data: any) => Promise<void>;
  updatePksFn: (id: string, data: any) => Promise<void>;
  updateInvestorFn: (id: string, data: any) => Promise<void>;
  triggerAutorenewalFn: (id: string) => Promise<void>;
  setDoneKeysFn: (updater: (s: Set<string>) => Set<string>) => void;
  uploadFiles: File[];
  uploadBuktiTransaksiFn: (trxId: string, keterangan: any, file: File) => Promise<string>;
  uploadBuktiPengembalianFn?: (pksId: string, file: File) => Promise<string>;
};

async function processInternalEntity({
  entity, pksList, investors, brokers, minbun, trader, cashflowTagRecordedFn, addPengeluaranFn,
  updateTransaksiFn, updatePksFn, updateInvestorFn, triggerAutorenewalFn, setDoneKeysFn,
  uploadFiles, uploadBuktiTransaksiFn, uploadBuktiPengembalianFn
}: ProcessInternalEntityParams) {
  const today = todayWibStr();
  const triggeredRenewals = new Set<string>();
  const validFiles = uploadFiles.filter(Boolean);

// PATCH (refactor `as any`): EntitySummaryItem sudah didefinisikan di atas
// sebagai union type. Sekarang kita gunakan type tersebut untuk `item` di loop
// — TS akan narrow otomatis berdasarkan `item.type` di setiap branch.
  for (let i = 0; i < entity.filteredItems.length; i++) {
    const item = entity.filteredItems[i];

    const fileToUpload = validFiles[i % validFiles.length];
    if (fileToUpload) {
      if (item.type === "Bagi Hasil" && item.trx) {
        await uploadBuktiTransaksiFn(item.trx.id, item.keterangan, fileToUpload);
      } else if (item.type === "Pengembalian Modal" && item.pks && uploadBuktiPengembalianFn) {
        await uploadBuktiPengembalianFn(item.pks.id, fileToUpload);
      }
    }

    if (item.type === "Bagi Hasil" && item.trx) {
      await processInternalProfitItem({
        item,
        entity,
        pksList,
        investors,
        brokers,
        minbun,
        trader,
        cashflowTagRecordedFn,
        addPengeluaranFn,
        updateTransaksiFn,
        triggerAutorenewalFn,
        setDoneKeysFn,
        triggeredRenewals,
        today,
      });
    } else if (item.type === "Pengembalian Modal" && item.pks) {
      await processPengembalianModalItem({
        item,
        entity,
        investors,
        cashflowTagRecordedFn,
        addPengeluaranFn,
        updatePksFn,
        updateInvestorFn,
        setDoneKeysFn,
        today,
      });
    }
  }
}

// PATCH (refactor `as any`): ganti `item: any` ke `item: EntitySummaryItem`
// agar TS bisa narrow type otomatis. `item.trx` dan `item.pks` akan
// ter-typed sesuai variant "Bagi Hasil" atau "Pengembalian Modal".
// Kita bungkus dengan Extract<Exclude<EntitySummaryItem, { type: "Pengembalian Modal" }>>
// agar di function ini `item.trx` selalu ada (bukan `| undefined`).
type BagiHasilItem = Extract<EntitySummaryItem, { type: "Bagi Hasil" }>;

type ProcessInternalProfitItemParams = {
  item: BagiHasilItem;
  entity: ProcessedEntity;
  pksList: Pks[];
  investors: Investor[];
  brokers: Broker[];
  minbun: AccountInfo;
  trader: AccountInfo;
  cashflowTagRecordedFn: (tag: string) => boolean;
  addPengeluaranFn: (p: any) => Promise<void>;
  updateTransaksiFn: (id: string, data: any) => Promise<void>;
  triggerAutorenewalFn: (id: string) => Promise<void>;
  setDoneKeysFn: (updater: (s: Set<string>) => Set<string>) => void;
  triggeredRenewals: Set<string>;
  today: string;
};

async function processInternalProfitItem({
  item,
  entity,
  pksList,
  investors,
  brokers,
  minbun,
  trader,
  cashflowTagRecordedFn,
  addPengeluaranFn,
  updateTransaksiFn,
  triggerAutorenewalFn,
  setDoneKeysFn,
  triggeredRenewals,
  today,
}: ProcessInternalProfitItemParams) {
  // PATCH: `item` sekarang typed `BagiHasilItem`, sehingga `item.trx` non-null.
  const trx = item.trx;
  const isMinBun = item.keterangan === "MinBun";
  const trxId = trx.id;
  const tag = isMinBun
    ? `[Reminder] TRX ${trxId} · MinBun`
    : `[Internal-Profit:${entity.investorId}:${trxId}]`;

  if (!cashflowTagRecordedFn(tag)) {
    await addPengeluaranFn({
      date: today,
      deskripsi: isMinBun ? `Bagi Hasil MinBun — TRX ${trxId}` : `Profit Internal — ${entity.nama} — TRX ${trxId}`,
      debet: item.jumlah,
      kredit: 0,
      kategori: isMinBun ? "Fee MinBun" : "BagHas Modal MinBun",
      catatan: tag,
    });
  }

  const checks = { ...trx.bagiHasilChecks, [item.checkKey]: true };
  const allRows = buildTransaksiRows(trx, pksList, investors, brokers, minbun, trader);

  const bagiHasilDone = allRows.every((r) => checks[r.checkKey]);

  const updates: any = { bagiHasilChecks: checks, bagiHasilDone };
  if (bagiHasilDone) {
    // PATCH (status perbarui bermasalah):
    // - isAutorenewal + endDate < today: "selesai" (siklus autorenewal berakhir)
    // - isAutorenewal (masih aktif):      "berjalan" (menunggu autorenewal berikutnya)
    // - bukan autorenewal:               "selesai" (transaksi normal selesai)
    const _isExpired = !!(trx.endDate && trx.endDate.slice(0, 10) < todayWibStr());
    updates.status = (!trx.isAutorenewal || _isExpired) ? "selesai" : "berjalan";
  }

  await updateTransaksiFn(trxId, updates);
  setDoneKeysFn((prev) => new Set(prev).add(`${trxId}__${item.checkKey}`));

  if (trx.isAutorenewal && bagiHasilDone && !triggeredRenewals.has(trxId)) {
    triggeredRenewals.add(trxId);
    await triggerAutorenewalFn(trxId);
  }
}

// PATCH (refactor `as any`): ganti `item: any` ke `item: PengembalianModalItem`
// agar TS narrow otomatis. `item.pks` selalu non-null di function ini.
type PengembalianModalItem = Extract<EntitySummaryItem, { type: "Pengembalian Modal" }>;

type ProcessPengembalianModalItemParams = {
  item: PengembalianModalItem;
  entity: ProcessedEntity;
  investors: Investor[];
  cashflowTagRecordedFn: (tag: string) => boolean;
  addPengeluaranFn: (p: any) => Promise<void>;
  updatePksFn: (id: string, data: any) => Promise<void>;
  updateInvestorFn: (id: string, data: any) => Promise<void>;
  setDoneKeysFn: (updater: (s: Set<string>) => Set<string>) => void;
  today: string;
};

async function processPengembalianModalItem({
  item,
  entity,
  investors,
  cashflowTagRecordedFn,
  addPengeluaranFn,
  updatePksFn,
  updateInvestorFn,
  setDoneKeysFn,
  today,
}: ProcessPengembalianModalItemParams) {
  // PATCH: `item` typed → `item.pks` non-null.
  const pks = item.pks;
  const tag = `[Internal-Return:${entity.investorId}:${pks.id}]`;

  if (!cashflowTagRecordedFn(tag)) {
    await addPengeluaranFn({
      date: today,
      deskripsi: `Pengembalian Modal Internal — ${entity.nama} — PKS ${pks.id}`,
      debet: item.jumlah,
      kredit: 0,
      kategori: "Pengembalian Modal",
      catatan: tag,
    });
  }

  // Syarat: cukup terminate PKS untuk menandai modal dikembalikan.
  // Status "nonaktif" investor diturunkan dari PKS (`isTerminated`)
  // & data transaksi (lihat getPksStatus/activeInvestorIds). Mengubah
  // `investmentAmount` jadi 0 akan merusak perhitungan total modal &
  // cascade ke banyak halaman. Tidak ada update ke investor di sini.
  await updatePksFn(pks.id, { isTerminated: true });

  setDoneKeysFn((prev) => new Set(prev).add(item.checkKey));
}

type ProcessUploadEntityParams = {
  entity: ProcessedEntity;
  uploadFiles: File[];
  pksList: Pks[];
  investors: Investor[];
  brokers: Broker[];
  minbun: AccountInfo;
  trader: AccountInfo;
  uploadBuktiTransaksiFn: (trxId: string, keterangan: any, file: File) => Promise<string>;
  uploadBuktiPengembalianFn?: (pksId: string, file: File) => Promise<string>;
  updateTransaksiFn: (id: string, data: any) => Promise<void>;
  updatePksFn: (id: string, data: any) => Promise<void>;
  updateInvestorFn: (id: string, data: any) => Promise<void>; 
  triggerAutorenewalFn: (id: string) => Promise<void>;
  setDoneKeysFn: (updater: (s: Set<string>) => Set<string>) => void;
};

// PATCH (refactor `as any`): gunakan discriminated union EntitySummaryItem.
// TS akan narrow otomatis: `item.trx` di branch "Bagi Hasil", `item.pks` di
// branch "Pengembalian Modal". Tidak perlu `as any` lagi.
async function uploadProofForItem({
  item,
  validFiles,
  index,
  uploadBuktiTransaksiFn,
  uploadBuktiPengembalianFn,
}: {
  item: EntitySummaryItem;
  validFiles: File[];
  index: number;
  uploadBuktiTransaksiFn: (trxId: string, keterangan: any, file: File) => Promise<string>;
  uploadBuktiPengembalianFn?: (pksId: string, file: File) => Promise<string>;
}) {
  if (!validFiles.length) return "";

  const fileToUpload = validFiles[index % validFiles.length];
  if (!fileToUpload) return "";

  if (item.type === "Pengembalian Modal" && uploadBuktiPengembalianFn) {
    // PATCH: `item.type` narrowed → `item.pks` non-null.
    return await uploadBuktiPengembalianFn(item.pks.id, fileToUpload);
  }

  if (item.type === "Bagi Hasil") {
    // PATCH: `item.type` narrowed → `item.trx` non-null.
    return await uploadBuktiTransaksiFn(item.trx.id, item.keterangan, fileToUpload);
  }

  return "";
}

// PATCH (refactor `as any`): gunakan type alias yang sudah didefinisikan.
type UploadItem = EntitySummaryItem;

async function processBagiHasilItem({
  item,
  pksList,
  investors,
  brokers,
  minbun,
  trader,
  updateTransaksiFn,
  triggerAutorenewalFn,
  setDoneKeysFn,
  triggeredRenewals,
}: {
  item: BagiHasilItem;
  pksList: Pks[];
  investors: Investor[];
  brokers: Broker[];
  minbun: AccountInfo;
  trader: AccountInfo;
  updateTransaksiFn: (id: string, data: any) => Promise<void>;
  triggerAutorenewalFn: (id: string) => Promise<void>;
  setDoneKeysFn: (updater: (s: Set<string>) => Set<string>) => void;
  triggeredRenewals: Set<string>;
}) {
  // PATCH: item typed sebagai BagiHasilItem → item.trx non-null.
  const trx = item.trx;
  const checks = { ...trx.bagiHasilChecks, [item.checkKey]: true };
  const allRows = buildTransaksiRows(trx, pksList, investors, brokers, minbun, trader);
  const bagiHasilDone = allRows.every((r) => checks[r.checkKey]);

  const updates: any = { bagiHasilChecks: checks, bagiHasilDone };
  if (bagiHasilDone) {
    // PATCH (status perbarui bermasalah):
    // - isAutorenewal + endDate < today: "selesai" (siklus autorenewal berakhir)
    // - isAutorenewal (masih aktif):      "berjalan" (menunggu autorenewal berikutnya)
    // - bukan autorenewal:               "selesai" (transaksi normal selesai)
    const _isExpired = !!(trx.endDate && trx.endDate.slice(0, 10) < todayWibStr());
    updates.status = (!trx.isAutorenewal || _isExpired) ? "selesai" : "berjalan";
  }

  await updateTransaksiFn(trx.id, updates);
  setDoneKeysFn((prev) => new Set(prev).add(`${trx.id}__${item.checkKey}`));

  if (trx.isAutorenewal && bagiHasilDone && !triggeredRenewals.has(trx.id)) {
    triggeredRenewals.add(trx.id);
    await triggerAutorenewalFn(trx.id);
  }
}

// type alias untuk callback di-upload-proof (item bisa BagiHasilItem
// atau PengembalianModalItem; kita union-kan di sini).
type _UploadProofItem = UploadItem;

async function processPengembalianModalUploadItem({
  item,
  investors,
  updatePksFn,
  updateInvestorFn,
  setDoneKeysFn,
}: {
  item: PengembalianModalItem;
  investors: Investor[];
  updatePksFn: (id: string, data: any) => Promise<void>;
  updateInvestorFn: (id: string, data: any) => Promise<void>;
  setDoneKeysFn: (updater: (s: Set<string>) => Set<string>) => void;
}) {
  // PATCH: item typed → item.pks non-null.
  // Syarat: cukup terminate PKS — investor otomatis nonaktif via cascade
  // getPksStatus / activeInvestorIds. Tidak ada update investmentAmount.
  const pks = item.pks;
  await updatePksFn(pks.id, { isTerminated: true });

  setDoneKeysFn((prev) => new Set(prev).add(item.checkKey));
}

async function processUploadEntity({
  entity,
  uploadFiles,
  pksList,
  investors,
  brokers,
  minbun,
  trader,
  uploadBuktiTransaksiFn,
  uploadBuktiPengembalianFn,
  updateTransaksiFn,
  updatePksFn,
  updateInvestorFn,
  triggerAutorenewalFn,
  setDoneKeysFn,
}: ProcessUploadEntityParams) {
  // PERBAIKAN: Two-phase commit. Fase 1 — upload bukti & kirim notifikasi
  // (semua side-effect eksternal). Fase 2 — commit DB PocketBase.
  // Jika fase 1 gagal, DB TIDAK ter-update dan item tetap di tab Pending.
  // Sebelumnya: DB commit duluan, kalau notify gagal, item sudah pindah ke
  // tab Selesai tapi notifikasi tidak terkirim.
  const fileUrls: string[] = [];
  const validFiles = uploadFiles.filter(Boolean);
  const triggeredRenewals = new Set<string>();
  const isSystemRecipient = entity.recipientRole === "System";

// PATCH (refactor `as any`): `item` typed EntitySummaryItem; TS akan narrow
// otomatis `item.trx` vs `item.pks` berdasarkan discriminator `item.type`.
  if (!isSystemRecipient) {
    for (let i = 0; i < entity.filteredItems.length; i++) {
      const item: EntitySummaryItem = entity.filteredItems[i];
      const url = await uploadProofForItem({
        item,
        validFiles,
        index: i,
        uploadBuktiTransaksiFn,
        uploadBuktiPengembalianFn,
      });
      if (url) fileUrls.push(url);
    }
  }
  const combinedUrls = Array.from(new Set(fileUrls)).join(",");

  // FASE 1B: Kirim notifikasi. Kalau gagal → throw (DB belum berubah,
  // item tetap di tab Pending).
  // Trader/MinBun/Owner atau nama lain yang tidak terdaftar sebagai Investor
  // maupun Broker adalah penerima system: bukti dan notifikasi dikecualikan.
  if (!isSystemRecipient) {
    await sendBulkNotifications(entity, combinedUrls, uploadBuktiTransaksiFn);
  }

  // FASE 2: Commit ke PocketBase (update bagiHasilChecks, status, dll).
  // Track perubahan yang sudah terjadi untuk rollback jika ada item berikutnya
  // yang gagal. Tanpa rollback, item yang sukses bisa tetap pindah tab Selesai
  // padahal item berikutnya gagal — meninggalkan state tidak konsisten.
  type RollbackRecord = {
    trxId?: string;
    previousChecks?: Record<string, boolean>;
    previousBagiHasilDone?: boolean;
    previousStatus?: string;
    pksId?: string;
    previousIsTerminated?: boolean;
    investorId?: string;
    previousInvestmentAmount?: number;
  };
  const rollbackLog: RollbackRecord[] = [];
  // Snapshot awal untuk semua TRX yang akan di-update, untuk rollback jika gagal.
  const trxSnapshots = new Map<string, any>();
  const pksSnapshots = new Map<string, any>();
  const investorSnapshots = new Map<string, any>();
  for (const it of entity.filteredItems) {
    const anyIt = it as any;
    if (anyIt.trx && !trxSnapshots.has(anyIt.trx.id)) {
      trxSnapshots.set(anyIt.trx.id, {
        bagiHasilChecks: { ...(anyIt.trx.bagiHasilChecks ?? {}) },
        bagiHasilDone:    anyIt.trx.bagiHasilDone ?? false,
        status:           anyIt.trx.status,
      });
    }
    if (anyIt.pks && !pksSnapshots.has(anyIt.pks.id)) {
      pksSnapshots.set(anyIt.pks.id, { isTerminated: !!anyIt.pks.isTerminated });
      // PATCH: Tidak ada perubahan ke investor.investmentAmount saat pengembalian
      // modal, jadi tidak perlu snapshot/rollback investmentAmount di sini.
    }
  }

  try {
    // BUGFIX (duplikasi undo → lunas ulang): dedupe proses per
    // (TRX × checkKey). Sebelumnya loop memanggil processBagiHasilItem
    // untuk SETIAP item di entity.filteredItems. Untuk broker murni
    // yang muncul di banyak TRX (sekarang tidak didedupe lagi), ini
    // menghasilkan banyak panggilan update_transaksi yang sebenarnya
    // idempotent — tapi tetap BOROS dan bisa RACE CONDITION.
    //
    // Solusi: kumpulkan dulu (trxId, checkKey) unik per TRX, proses
    // SEKALI per TRX dengan SEMUA checkKey relevan di-set true
    // bersamaan.
    const trxCheckKeys = new Map<string, { trx: any; checkKeys: Set<string> }>();
    for (const item of entity.filteredItems) {
      if (item.type === "Bagi Hasil" && item.trx) {
        const cur = trxCheckKeys.get(item.trx.id);
        if (!cur) {
          trxCheckKeys.set(item.trx.id, { trx: item.trx, checkKeys: new Set([item.checkKey]) });
        } else {
          cur.checkKeys.add(item.checkKey);
        }
      }
    }

    for (const { trx, checkKeys } of trxCheckKeys.values()) {
      // Set SEMUA checkKey TRX ini ke true dalam satu kali updates.
      const checks: Record<string, boolean> = { ...(trx.bagiHasilChecks ?? {}) };
      checkKeys.forEach((ck) => { checks[ck] = true; });
      const allRows = buildTransaksiRows(trx, pksList, investors, brokers, minbun, trader);
      const bagiHasilDone = allRows.every((r) => checks[r.checkKey]);
      const updates: any = { bagiHasilChecks: checks, bagiHasilDone };
      if (bagiHasilDone) {
        // PATCH (status perbarui bermasalah):
    // - isAutorenewal + endDate < today: "selesai" (siklus autorenewal berakhir)
    // - isAutorenewal (masih aktif):      "berjalan" (menunggu autorenewal berikutnya)
    // - bukan autorenewal:               "selesai" (transaksi normal selesai)
    const _isExpired = !!(trx.endDate && trx.endDate.slice(0, 10) < todayWibStr());
    updates.status = (!trx.isAutorenewal || _isExpired) ? "selesai" : "berjalan";
      }
      try {
        await updateTransaksiFn(trx.id, updates);
      } catch (err) {
        // PATCH: surface field-level PocketBase error dari err.data
        const _e = err as { status?: number; data?: Record<string, unknown>; message?: string };
        console.error(`[processUploadEntity] PB error TRX=${trx.id} status=${_e.status} fields=${JSON.stringify(_e.data)}`, err);
        throw err;
      }
      // Tambahkan doneKey untuk SEMUA checkKey TRX ini.
      setDoneKeysFn((prev) => {
        const next = new Set(prev);
        checkKeys.forEach((ck) => next.add(`${trx.id}__${ck}`));
        return next;
      });
      rollbackLog.push({ trxId: trx.id });

      if (trx.isAutorenewal && bagiHasilDone && !triggeredRenewals.has(trx.id)) {
        triggeredRenewals.add(trx.id);
        try {
          await triggerAutorenewalFn(trx.id);
        } catch (err) {
          console.warn("[processUploadEntity] gagal triggerAutorenewalFn:", err);
        }
      }
    }

    // Proses Pks (tidak berubah; hanya Pks, tidak terkait TRX)
    for (const item of entity.filteredItems) {
      if (item.type === "Pengembalian Modal" && item.pks) {
        await processPengembalianModalUploadItem({
          item,
          investors,
          updatePksFn,
          updateInvestorFn,
          setDoneKeysFn,
        });
        rollbackLog.push({
          pksId: item.pks.id,
          investorId: item.pks.investorId,
        });
      }
    }
  } catch (err) {
    // ROLLBACK: Kembalikan semua perubahan DB ke snapshot awal, agar
    // item tetap di tab Pending. setDoneKeys dihapus agar optimistic
    // update di UI juga dibatalkan.
    console.error("[processUploadEntity] FASE 2 gagal, rollback:", err);
    for (const snap of trxSnapshots.entries()) {
      const [trxId, prev] = snap;
      try {
        await updateTransaksiFn(trxId, {
          bagiHasilChecks: prev.bagiHasilChecks,
          bagiHasilDone:    prev.bagiHasilDone,
          status:           prev.status,
        });
      } catch (rollbackErr) {
        console.error("[rollback] gagal kembalikan TRX", trxId, rollbackErr);
      }
    }
    for (const snap of pksSnapshots.entries()) {
      const [pksId, prev] = snap;
      try {
        await updatePksFn(pksId, { isTerminated: prev.isTerminated });
      } catch (rollbackErr) {
        console.error("[rollback] gagal kembalikan PKS", pksId, rollbackErr);
      }
    }
    // PATCH: investor.investmentAmount tidak lagi disentuh saat pengembalian
    // modal, jadi tidak ada rollback investor yang diperlukan di sini.
    // Hapus semua doneKeys yang baru ditambahkan agar UI kembali ke Pending.
    // doneKeys mengikuti pola `${trxId}__${checkKey}` dan `PKS__${pksId}`.
    setDoneKeysFn((prev) => {
      const next = new Set(prev);
      for (const r of rollbackLog) {
        if (r.trxId) {
          // Hapus semua key yang prefix-nya trxId (semua checkKey dalam TRX ini)
          for (const k of Array.from(prev)) {
            if (k.startsWith(`${r.trxId}__`)) next.delete(k);
          }
        }
        if (r.pksId) {
          next.delete(`PKS__${r.pksId}`);
        }
      }
      return next;
    });
    throw err; // Naikkan lagi agar handleConfirmUpload menampilkan toast error.
  }
}

/**
 * Kirim notifikasi bulk ke investor / broker. Throw error jika ada yang gagal,
 * sehingga fase 2 (DB commit) tidak akan dieksekusi — item tetap di tab Pending.
 */

/**
 * Best-effort: kirim salinan notifikasi bagi hasil ke broker afiliasi.
 *
 * Dipanggil setelah notifikasi investor berhasil dikirim, agar broker
 * yang memiliki afiliasi dengan investor (entry.investorBrokerName)
 * juga menerima bukti transfer yang sama. Kegagalan pada helper ini
 * TIDAK menggagalkan proses bulk karena notifikasi utama (ke investor)
 * sudah sukses — broker cukup menerima log error di console.
 *
 * Menggunakan endpoint /api/notify-broker yang sudah support field
 * buktiUrl (URL bukti transfer) sehingga bukti yang sama dikirim juga
 * ke broker.
 */
async function notifyBrokerAffiliated(
  brokerName: string,
  investorName: string,
  transaksiId: string,
  noPks: string,
  jumlah: number,
  combinedUrls: string,
): Promise<void> {
  // PENTING: endpoint ini RESEND notifikasi investor, BUKAN fee broker.
  // Nominal yang dikirim (`jumlah`) adalah nominal BAGI HASIL yang diterima
  // investor (bukan fee broker), dan narasi di email/WA menjelaskan
  // bahwa itu bagi hasil klien broker.
  try {
    const res = await fetch("/api/notify-broker-resend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${pb.authStore.token}`,
      },
      body: JSON.stringify({
        brokerName,
        investorName,
        jumlah,
        buktiUrl: combinedUrls,
        noPks,
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.warn(
        `[notifyBrokerAffiliated] HTTP ${res.status} untuk broker="${brokerName}":`,
        errBody?.error || errBody?.reason || "",
      );
      return;
    }
    const result = await res.json().catch(() => ({}));
    if (!(result?.waStatus === "sent" || result?.emailStatus === "sent")) {
      console.warn(
        `[notifyBrokerAffiliated] Broker tidak menerima notifikasi untuk broker="${brokerName}":`,
        result?.reason || "semua channel gagal atau skipped",
      );
    }
  } catch (err) {
    // Best-effort: log saja, jangan throw.
    console.warn(
      `[notifyBrokerAffiliated] exception untuk broker="${brokerName}":`,
      err,
    );
  }
}

async function sendBulkNotifications(
  entity: ProcessedEntity,
  combinedUrls: string,
  _uploadBuktiTransaksiFn: (trxId: string, keterangan: any, file: File) => Promise<string>,
): Promise<void> {
  console.log(`[sendBulkNotifications] entity nama="${entity.nama}", investorId=${entity.investorId ?? "undefined"}, roles=${JSON.stringify(entity.roles)}`);
  // Role sudah di-resolve dari kolom Penerima Tagihan terhadap master
  // Investor/Broker. Jangan menebak role dari panjang ID atau jenis tugas.
  if (entity.recipientRole === "Investor") {
    let brokerName = "Pusat";
    // PATCH (refactor `(i: any)`): use EntitySummaryItem — type narrowing automatic
    const sampleItem = entity.filteredItems.find((i: EntitySummaryItem) => i.type === "Bagi Hasil") as BagiHasilItem | undefined;
    if (sampleItem && sampleItem.trx) {
      const entry = sampleItem.trx.investorEntries.find((e: { investorId: string }) => e.investorId === entity.investorId);
      if (entry && entry.investorBrokerName) brokerName = entry.investorBrokerName;
    }

    const pksList = entity.filteredItems.map((i: any) => {
      if (i.type === "Bagi Hasil" && i.trx) return i.trx.customId || i.trx.id;
      if (i.type === "Pengembalian Modal" && i.pks) return i.pks.customId || i.pks.id;
      return i.sourceId;
    });
    const finalNoPks = Array.from(new Set(pksList)).join(", ");

    const res = await fetch("/api/notify-investor", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${pb.authStore.token}`,
      },
      body: JSON.stringify({
        transaksiId: entity.filteredItems.map((i) => i.sourceId).join(", "),
        keterangan: entity.roles.join(" & "),
        investorId: entity.investorId,
        jumlah: typeof entity.totalAmount === "number" && !isNaN(entity.totalAmount) ? entity.totalAmount : 0,
        buktiUrl: combinedUrls,
        brokerName: brokerName,
        noPks: finalNoPks,
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      // Best-effort: jangan rollback DB jika notifikasi gagal. Hanya log warning.
      throw new Error(
        `Notifikasi investor HTTP ${res.status}: ${errBody?.error || "unknown"}`,
      );
    }
    const result = await res.json().catch(() => ({}));
    const investorAnyChannelSent = result?.waStatus === "sent" || result?.emailStatus === "sent";
    const investorAllChannelsSkipped = result?.waStatus === "skipped" && result?.emailStatus === "skipped";
    if (!investorAnyChannelSent) {
      const parts: string[] = [];
      if (result?.waStatus === "failed")    parts.push("WhatsApp gagal");
      if (result?.emailStatus === "failed") parts.push("Email gagal");
      if (investorAllChannelsSkipped) parts.push("semua channel skipped");
      throw new Error(
        `Notifikasi investor — ${parts.join(", ") || result?.reason || "tidak terkirim"}` +
        (result?.errors?.length ? `. ${result.errors.join("; ")}` : ""),
      );
    }
    // BEST-EFFORT: kirim salinan notifikasi ke broker afiliasi (jika investor
    // berafiliasi dengan broker). Tujuannya agar broker juga menerima bukti
    // transfer bagi hasil investasi kliennya. Kegagalan TIDAK membatalkan
    // notifikasi investor yang sudah sukses — hanya dicatat di console.
    if (brokerName && brokerName !== "Pusat") {
      await notifyBrokerAffiliated(
        brokerName,
        entity.nama,
        entity.filteredItems.map((i) => i.sourceId).join(", "),
        finalNoPks,
        entity.totalAmount,
        combinedUrls,
      );
    }
    return;
  }

  // KONDISI 2: JIKA PENERIMA ADALAH BROKER MURNI (tanpa investorId).
  // PENTING: roles="Bagi Hasil" untuk SEMUA entity (baik investor maupun
  // broker murni) — karena type item selalu "Bagi Hasil" hanya keterangan
  // yang berbeda ("Investor" / "Broker" / "Trader" / "MinBun"). Jadi
  // deteksi broker murni HANYA berdasarkan entity.investorId === undefined.
  if (entity.recipientRole === "Broker") {
    console.log(`[reminder-content] KONDISI 2: MASUK! kirim fee broker ke "${entity.nama}", total=${entity.totalAmount}, combinedUrls=${combinedUrls ? "ada" : "kosong"}, filteredItems count=${entity.filteredItems.length}`);
    const affiliatedInvestors = new Set<string>();
    entity.filteredItems.forEach((i: EntitySummaryItem) => {
      if (i.type === "Bagi Hasil" && i.trx) {
        i.trx.investorEntries.forEach((e: { investorId: string; investorName?: string; investorBrokerName?: string }) => {
          if (e.investorBrokerName === entity.nama && e.investorName) {
            affiliatedInvestors.add(e.investorName);
          }
        });
      }
    });
    const investorList = Array.from(affiliatedInvestors).join(", ");
    const pksList = entity.filteredItems.map((i: any) => {
      if (i.type === "Bagi Hasil" && i.trx) return i.trx.customId || i.trx.id;
      return i.sourceId;
    });
    const finalNoPks = Array.from(new Set(pksList)).join(", ");

    const res = await fetch("/api/notify-broker", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${pb.authStore.token}`,
      },
      body: JSON.stringify({
        brokerName: entity.nama,
        investorList,
        jumlah: typeof entity.totalAmount === "number" && !isNaN(entity.totalAmount) ? entity.totalAmount : 0,
        buktiUrl: combinedUrls,
        noPks: finalNoPks,
      }),
    });
    console.log(`[reminder-content] /api/notify-broker response status=${res.status}`);
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(
        `Notifikasi broker HTTP ${res.status}` +
        (errBody?.error ? `: ${errBody.error}` : "") +
        (errBody?.reason ? `: ${errBody.reason}` : ""),
      );
    }
    const result = await res.json().catch(() => ({}));
    // Endpoint /api/notify-broker sekarang multi-channel (WA + Email).
    // Throw HANYA jika SEMUA channel gagal — jika salah satu (mis. email)
    // sudah terkirim, anggap sukses karena broker benar-benar sudah
    // menerima notifikasi bukti transfer.
    const brokerAnyChannelSent = result?.waStatus === "sent" || result?.emailStatus === "sent";
    if (!brokerAnyChannelSent) {
      throw new Error(
        `Notifikasi broker tidak terkirim: ` +
        (result?.reason || "Semua channel gagal atau skipped"),
      );
    }
  }
}

function getEntityTaskDescription(entity: ProcessedEntity): string {
  const hasProfitSharing = entity.filteredItems.some((item) => item.type === "Bagi Hasil");
  const hasCapitalReturn = entity.filteredItems.some((item) => item.type === "Pengembalian Modal");
  if (hasProfitSharing && hasCapitalReturn) return "Bagi Hasil & Pengembalian Modal";
  if (hasCapitalReturn) return "Pengembalian Modal";
  return "Bagi Hasil";
}

function getBulkActionTooltipText(showDone: boolean, isInternal: boolean) {
  if (showDone) return "Batalkan pelunasan";
  if (isInternal) return "Catat ke Arus Kas & Upload Bukti";
  return "Upload Bukti & Tandai Selesai";
}

// ── Komponen Baris Tabel Kolaps (Accordion Row) ──────────────────────────────

function EntityRow({
  ent,
  toggling,
  showDone,
  handleActionClick,
  expandedRows,
  toggleExpand,
}: Readonly<{
  ent: ProcessedEntity;
  toggling: string | null;
  showDone: boolean;
  handleActionClick: (e: ProcessedEntity) => void;
  expandedRows: Set<string>;
  toggleExpand: (id: string) => void;
}>) {
  const isLoading = toggling === ent.id;
  const isExpanded = expandedRows.has(ent.id);
  const tooltipText = getBulkActionTooltipText(showDone, ent.isInternal);
  const hasDue = ent.sisaTarget <= 0; 

  return (
    <>
      <tr className={`border-b border-border/50 transition-colors ${isExpanded ? "bg-muted/30" : "hover:bg-muted/40"}`}>
        <td className="py-3 px-3 whitespace-nowrap cursor-pointer select-none" onClick={() => toggleExpand(ent.id)}>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 rounded-full">
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
            <span className="font-medium">{ent.nama}</span>
            {ent.isInternal && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                <ShieldCheck className="h-2.5 w-2.5" />Internal
              </span>
            )}
          </div>
        </td>
        <td className="py-3 px-3 cursor-pointer" onClick={() => toggleExpand(ent.id)}>
          <div className="flex flex-wrap gap-1">
            {ent.roles.map(r => (
              <span key={r} className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border bg-secondary text-secondary-foreground border-border">
                {r}
              </span>
            ))}
          </div>
        </td>
        <td className="py-3 px-3 cursor-pointer" onClick={() => toggleExpand(ent.id)}>
          <span className="inline-flex px-2 py-1 rounded-md text-xs font-medium bg-muted text-foreground">
            {getEntityTaskDescription(ent)}
          </span>
        </td>
        <td className="py-3 px-3 whitespace-nowrap cursor-pointer" onClick={() => toggleExpand(ent.id)}>
          <div className="text-muted-foreground">{ent.bankName}</div>
          <div className="font-mono text-xs text-muted-foreground mt-0.5">{ent.accountNumber}</div>
        </td>
        <td className="py-3 px-3 cursor-pointer" onClick={() => toggleExpand(ent.id)}>
          <div className="flex flex-col gap-0.5">
            <span className={`text-xs ${getSisaHariColor(ent.sisaTarget)}`}>
              {getSisaHariText(ent.sisaTarget)}
            </span>
            <div className="text-[10px] text-muted-foreground mt-0.5 hover:underline">
              {ent.filteredItems.length} Tagihan (Lihat Rincian)
            </div>
          </div>
        </td>
        <td className="py-3 px-3 text-right whitespace-nowrap cursor-pointer" onClick={() => toggleExpand(ent.id)}>
          <div className={`font-bold text-base ${showDone ? "text-green-600" : ""}`}>{formatCurrency(ent.totalAmount)}</div>
        </td>
        <td className="py-3 px-3 text-center">
          {/* Tombol "Batalkan pelunasan" (muncul di tab Selesai) untuk sementara dinonaktifkan.
              Logika handleUndoBulk dan getBulkActionTooltipText tetap tersedia agar bisa
              diaktifkan kembali tanpa perlu restore kode. Untuk mengaktifkan kembali,
              hapus komentar blok JSX showDone di bawah dan ganti tag TD menjadi ternary. */}
          {/* showDone && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 z-10"
                    disabled={isLoading}
                    onClick={(e) => { e.stopPropagation(); handleActionClick(ent); }}
                  >
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">
                  {tooltipText}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) */}
          {!showDone && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 z-10"
                    disabled={isLoading}
                    onClick={(e) => { e.stopPropagation(); handleActionClick(ent); }}
                  >
                    <Circle className={`h-5 w-5 ${hasDue ? "text-orange-500" : "text-muted-foreground"}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="text-xs">
                  {tooltipText}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </td>
      </tr>
      
      {/* Expanded Rincian Data */}
      {isExpanded && (
        <tr className="bg-muted/10 border-b border-border/50">
          <td colSpan={7} className="p-0">
            <div className="px-10 py-4 pb-5 border-l-4 border-primary">
              <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Rincian Tagihan</h4>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border/50">
                    <th className="pb-2 font-medium">ID Referensi</th>
                    <th className="pb-2 font-medium">Tipe / Keterangan</th>
                    <th className="pb-2 font-medium text-right">Nominal</th>
                  </tr>
                </thead>
                <tbody>
                  {ent.filteredItems.map(item => (
                    <tr key={item.sourceId + item.checkKey} className="border-b border-border/30 last:border-0 hover:bg-muted/30">
                      <td className="py-2.5 font-mono">{item.sourceId}</td>
                      <td className="py-2.5">
                        <span className="font-semibold">{item.type}</span>
                        {item.type !== item.keterangan && <span className="text-muted-foreground"> ({item.keterangan})</span>}
                      </td>
                      <td className="py-2.5 text-right font-medium">{formatCurrency(item.jumlah)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Komponen Utama ────────────────────────────────────────────────────────────

export function ReminderContent() {
  const pksContext = usePks();
  const { pksList, updatePks } = pksContext;
  const uploadBuktiPengembalian = (pksContext as any).uploadBuktiPengembalian;

  const transaksiContext = useTransaksi();
  const { transaksis, updateTransaksi, uploadBuktiTransaksi } = transaksiContext;
  const triggerAutorenewal = (transaksiContext as any).triggerAutorenewal;
  const { investors, updateInvestor }                 = useInvestors();
  const { brokers }                                   = useBrokers();
  const { pengeluarans, addPengeluaran }              = usePengeluaran();
  const { minbun, trader, updateMinbun, updateTrader } = useSettings();
  const { logs, isLoading: logsLoading, refresh: refreshLogs } = useReminderLogs();

  const [isSendingReminder,   setIsSendingReminder]   = useState(false);
  const [toggling, setToggling]          = useState<string | null>(null);
  const [showDone, setShowDone]          = useState(false);
  const [selectedDueDate, setSelectedDueDate] = useState("");
  const [doneKeys, setDoneKeys]          = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows]  = useState<Set<string>>(new Set());

  // State dialog konfirmasi internal
  const [internalTarget,  setInternalTarget]  = useState<ProcessedEntity | null>(null);
  const [internalUploadFiles, setInternalUploadFiles]   = useState<File[]>([]);
  const [internalUploadPreviews, setInternalUploadPreviews] = useState<string[]>([]);
  const [isConfirmingInt, setIsConfirmingInt] = useState(false);

  // State dialog upload transfer massal (>50jt multi file)
  const [uploadTarget, setUploadTarget] = useState<ProcessedEntity | null>(null);
  const [uploadFiles, setUploadFiles]   = useState<File[]>([]);
  const [uploadPreviews, setUploadPreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading]   = useState(false);

  // State form pengaturan
  const [showSettings, setShowSettings]  = useState(false);
  const [isSavingMB,   setIsSavingMB]   = useState(false);
  const [isSavingTR,   setIsSavingTR]   = useState(false);
  const [formMinbun,   setFormMinbun]   = useState({ nama: minbun.nama, bankName: minbun.bankName, accountNumber: minbun.accountNumber });
  const [formTrader,   setFormTrader]   = useState({ nama: trader.nama, bankName: trader.bankName, accountNumber: trader.accountNumber });

  useEffect(() => { setFormMinbun({ nama: minbun.nama, bankName: minbun.bankName, accountNumber: minbun.accountNumber }); }, [minbun]);
  useEffect(() => { setFormTrader({ nama: trader.nama, bankName: trader.bankName, accountNumber: trader.accountNumber }); }, [trader]);

  const internalInvestorIds = useMemo(
    () => new Set(investors.filter((inv) => inv.isInternal).map((inv) => inv.id)),
    [investors],
  );

  const toggleExpandRow = (id: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  // 2. Data Entity (Bulk Data)
  const displayEntities = useMemo(() => {
    const map = new Map<string, ProcessedEntity & { items: EntitySummaryItem[] }>();

    const addToMap = (key: string, rName: string, rBank: string, rAcc: string, rInvId: string | undefined, item: EntitySummaryItem, sisaTarget: number) => {
      if (!map.has(key)) {
        map.set(key, {
          id: key, nama: rName, bankName: rBank, accountNumber: rAcc, investorId: rInvId,
          roles: [], recipientRole: "System", items: [], filteredItems: [], totalAmount: 0,
          isInternal: false, sisaTarget
        });
      }
      const entRef = map.get(key)!;
      // Dedupe checkKey HANYA untuk item "Investor" dan "Pengembalian Modal"
      // (per orang + 1 slot pelunasan). Untuk item "Broker", JANGAN
      // dedupe — broker murni yang muncul di banyak TRX harus diagregat
      // agar totalAmount dan rincian fee broker akurat. TRX yang berbeda
      // untuk broker yang sama = TRX berbeda dengan checkKey berbeda
      // (TRX ID di-serialize ke sourceId item, bukan checkKey).
      const isInvestorOrReturn = item.keterangan === "Investor" || item.keterangan === "Pengembalian Modal";
      if (isInvestorOrReturn) {
        const isDup = entRef.items.some(
          (existing) => existing.checkKey === item.checkKey,
        );
        if (isDup) return;
      }
      entRef.items.push(item);
    };

    transaksis.forEach((trx) => {
      const rows = buildTransaksiRows(trx, pksList, investors, brokers, minbun, trader);
      const sisa = sisaHari(trx);
      const statusTampil = getDisplayStatus(trx);

      rows.forEach((r) => {
        const key = `${r.investorId || r.nama}_${sisa}`;
        const isDone = !!trx.bagiHasilChecks?.[r.checkKey] || doneKeys.has(`${trx.id}__${r.checkKey}`);
        
        addToMap(key, r.nama, r.bankName, r.accountNumber, r.investorId, {
          sourceId: trx.id, type: "Bagi Hasil", keterangan: r.keterangan, trx, 
          jumlah: r.jumlah, checkKey: r.checkKey, isDone, sisa, statusTampil 
        }, sisa);
      });
    });

    pksList.forEach((pks) => {
      const sisa = sisaHariPks(pks);
      const isDone = pks.isTerminated || doneKeys.has(`PKS__${pks.id}`);

      if (!isDone && sisa > 30) return; 

      const inv = investors.find(i => i.id === pks.investorId);
      const key = `${pks.investorId || pks.investorName}_${sisa}`;
      
      addToMap(key, pks.investorName, inv?.bankName || "—", inv?.accountNumber || "—", pks.investorId, {
        sourceId: pks.id, type: "Pengembalian Modal", keterangan: "Pengembalian Modal", pks: pks,
        jumlah: pks.investmentAmount, checkKey: `PKS__${pks.id}`, isDone, sisa, 
        statusTampil: isDone ? "selesai" : "jatuh tempo",
      }, sisa);
    });

    const result: ProcessedEntity[] = [];
    map.forEach((ent) => {
      const filteredItems = ent.items.filter((item) => {
        if (item.isDone !== showDone) return false;
        if (!selectedDueDate) return true;
        const dueDate = item.type === "Bagi Hasil"
          ? dueDateTransaksi(item.trx)
          : endDatePks(item.pks);
        return dueDate === selectedDueDate;
      });
      if (filteredItems.length > 0) {
        const totalAmount = filteredItems.reduce((s, i) => s + i.jumlah, 0);
        // Jika semua item adalah Broker fee, roles hanya berisi ["Broker"].
        // Jika campuran (seperti investor + broker dari transaksi yg sama),
        // roles akan berisi beberapa nilai dan entity tetap dianggap investor
        // karena priority routing ada di processUploadEntity (cek investorId dulu).
        const normalizeName = (value: string) => value.trim().toLocaleLowerCase("id-ID");
        const recipientName = normalizeName(ent.nama);
        const matchedInvestor = investors.find((inv) =>
          (ent.investorId && inv.id === ent.investorId) || normalizeName(inv.name) === recipientName
        );
        const matchedBroker = brokers.find((broker) =>
          !broker.isSystemBroker && normalizeName(broker.name) === recipientName
        );
        const recipientRole: RecipientRole = matchedInvestor
          ? "Investor"
          : matchedBroker
            ? "Broker"
            : "System";
        const uniqueRoles = [recipientRole];
        const isInternal = filteredItems.some(i => i.keterangan === "MinBun" || (i.keterangan === "Investor" && ent.investorId && internalInvestorIds.has(ent.investorId)));

        result.push({
          ...ent,
          investorId: matchedInvestor?.id,
          filteredItems,
          totalAmount,
          roles: uniqueRoles,
          recipientRole,
          isInternal,
        });
      }
    });

    result.sort((a, b) => {
      if (a.sisaTarget !== b.sisaTarget) return a.sisaTarget - b.sisaTarget;
      return b.totalAmount - a.totalAmount;
    });
    
    return result;
  }, [transaksis, pksList, investors, brokers, minbun, trader, doneKeys, showDone, selectedDueDate, internalInvestorIds]);

  // 1. Ringkasan (Summary Metrics) - Berdasarkan data yang TAMPIL SAJA di displayEntities
  const summary = useMemo(() => {
    let investor = 0, traderAmt = 0, minbunAmt = 0, broker = 0, modalToReturn = 0;
    
    displayEntities.forEach((ent) => {
      ent.filteredItems.forEach((item) => {
        if (item.type === "Pengembalian Modal") {
          modalToReturn += item.jumlah;
        } else if (item.type === "Bagi Hasil") {
          if (item.keterangan === "Investor") investor += item.jumlah;
          else if (item.keterangan === "Trader") traderAmt += item.jumlah;
          else if (item.keterangan === "MinBun") minbunAmt += item.jumlah;
          else if (item.keterangan === "Broker") broker += item.jumlah;
        }
      });
    });

    let ownerAmt = 0;
    const processedTrxIds = new Set<string>();

    displayEntities.forEach((ent) => {
      ent.filteredItems.forEach((item) => {
        if (item.type === "Bagi Hasil" && item.trx && !processedTrxIds.has(item.trx.id)) {
          processedTrxIds.add(item.trx.id);
          const calc = calcTransaksi(item.trx);
          if (calc.profit > 0) {
            const allRows = buildTransaksiRows(item.trx, pksList, investors, brokers, minbun, trader);
            const totalDistributed = allRows.reduce((sum, r) => sum + r.jumlah, 0);
            ownerAmt += (calc.profit - totalDistributed);
          }
        }
      });
    });

    const totalProfitBagiHasil = investor + traderAmt + minbunAmt + broker + ownerAmt;

    let totalTasks = 0, doneTasks = 0;
    transaksis.forEach((trx) => {
      const rows = buildTransaksiRows(trx, pksList, investors, brokers, minbun, trader);
      rows.forEach((r) => {
        totalTasks++;
        if (!!trx.bagiHasilChecks?.[r.checkKey] || doneKeys.has(`${trx.id}__${r.checkKey}`)) doneTasks++;
      });
    });
    pksList.forEach((pks) => {
      const isDone = pks.isTerminated || doneKeys.has(`PKS__${pks.id}`);
      const sisa = sisaHariPks(pks);
      if (isDone || sisa <= 30) {
        totalTasks++;
        if (isDone) doneTasks++;
      }
    });

    return { 
      investor, trader: traderAmt, minbun: minbunAmt, broker, owner: ownerAmt, 
      modalToReturn, totalTasks, doneTasks, totalProfitBagiHasil
    };
  }, [displayEntities, transaksis, pksList, investors, brokers, minbun, trader, doneKeys]);

  const toPct = (val: number) => summary.totalProfitBagiHasil > 0 
    ? `${Number(((val / summary.totalProfitBagiHasil) * 100).toFixed(1))}%` 
    : "0%";

  const handleActionClick = (entity: ProcessedEntity) => {
    if (showDone) {
      void handleUndoBulk(entity);
      return;
    }

    if (entity.isInternal) {
      setInternalTarget(entity);
    } else {
      setUploadTarget(entity);
    }
  };

// TS union discriminator tidak otomatis narrow `item.pks` di dalam blok ini,
// jadi pakai variabel lokal `pks` yang sudah pasti bertipe Pks.
  // PATCH: Undo pelunasan modal cukup membalik `isTerminated` PKS jadi
  // `false`. Tidak ada perubahan `investmentAmount` di sisi forward (lihat
  // processPengembalianModalItem/Upload), jadi undo juga tidak menyentuh
  // data investor. Cukup set PKS aktif lagi agar investasi kembali
  // muncul di halaman investor & dashboard.
  const handleUndoBulk = async (entity: ProcessedEntity) => {
    setToggling(entity.id);
    try {
      // Dedupe per-TRX agar satu TRX hanya di-update SEKALI meskipun
      // entity.filteredItems memuat beberapa item dari TRX yang sama (mis.
      // broker murni yang muncul di banyak TRX — displayEntities sudah
      // dedupe checkKey, tapi loop ini harus aman dari TRX yang sama
      // muncul lebih dari sekali lewat checkKey berbeda).
      // PATCH: Transaksi type is already known in the loop; use proper type.
      const trxUpdates = new Map<string, { trx: NonNullable<BagiHasilItem["trx"]>; checkKey: string }>();
      for (const item of entity.filteredItems) {
        if (item.type === "Bagi Hasil" && item.trx) {
          const existing = trxUpdates.get(item.trx.id);
          if (!existing) {
            trxUpdates.set(item.trx.id, { trx: item.trx, checkKey: item.checkKey });
          }
          // Untuk TRX yang sama dengan beberapa checkKey (kasus broker
          // murni dengan dedupe checkKey hanya menyimpan 1), kita hanya
          // butuh satu update per TRX. Gunakan checkKey pertama yang
          // ditemukan.
        } else if (item.type === "Pengembalian Modal" && item.pks) {
          const pks = item.pks;
          try {
            await updatePks(pks.id, { isTerminated: false });
          } catch (err) {
            console.warn("[handleUndoBulk] gagal updatePks:", err);
            continue;
          }
        }
      }
      for (const { trx, checkKey } of trxUpdates.values()) {
        // BUGFIX: hitung ulang bagiHasilDone dari checks, bukan paksa false.
        // Sebelumnya `bagiHasilDone: false` membuat checkKey lain yang sudah
        // lunas ikut ditandai belum lunas → duplikasi baris di Pending.
        const checks = { ...(trx.bagiHasilChecks ?? {}), [checkKey]: false };
        const allDone = Object.keys(checks).length > 0 && Object.values(checks).every(Boolean);
        const updates: any = { bagiHasilChecks: checks };
        if (!allDone) {
          updates.bagiHasilDone = false;
          updates.status = "berjalan";
        }
        try {
          await updateTransaksi(trx.id, updates);
        } catch (err) {
        console.warn(`[handleUndoBulk] gagal updateTransaksi untuk TRX ${trx.id}:`, err);
        }
        setDoneKeys((prev) => { const s = new Set(prev); s.delete(`${trx.id}__${checkKey}`); return s; });
      }
      // Hapus doneKeys untuk semua Pks yang di-undo.
      setDoneKeys((prev) => {
        const s = new Set(prev);
        for (const item of entity.filteredItems) {
          if (item.type === "Pengembalian Modal" && item.pks) {
            s.delete(`PKS__${item.pks.id}`);
          }
        }
        return s;
      });
      toast.info(`Status pembayaran untuk ${entity.nama} dibatalkan.`);
    } catch (err) {
      console.error("[handleUndoBulk] gagal:", err);
      toast.error("Gagal membatalkan. Coba lagi.");
    } finally {
      setToggling(null);
    }
  };

  const cashflowTagRecorded = (tag: string) => pengeluarans.some((p) => p.catatan === tag);

  // --- Handlers Upload Internal ---
  const handleInternalFileChangeMulti = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setInternalUploadFiles((prev) => [...prev, ...newFiles]);

      const newPreviews = newFiles.map(f => {
        if (f.type.startsWith("image/")) return URL.createObjectURL(f);
        return "📄 Dokumen PDF";
      });
      setInternalUploadPreviews((prev) => [...prev, ...newPreviews]);
    }
    e.target.value = '';
  };

  const removeInternalUploadFile = (idx: number) => {
    setInternalUploadPreviews(prev => {
      const removed = prev[idx];
      if (removed) revokePreview(removed);
      return prev.filter((_, i) => i !== idx);
    });
    setInternalUploadFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const clearInternalUploadDialog = () => {
    setInternalUploadPreviews(prev => { prev.forEach(revokePreview); return []; });
    setInternalTarget(null);
    setInternalUploadFiles([]);
  };

  const handleConfirmInternal = async () => {
    if (!internalTarget) return;
    setIsConfirmingInt(true);
    setToggling(internalTarget.id);
    try {
      await processInternalEntity({
        entity: internalTarget,
        pksList,
        investors,
        brokers,
        minbun,
        trader,
        cashflowTagRecordedFn: cashflowTagRecorded,
        addPengeluaranFn: addPengeluaran,
        updateTransaksiFn: updateTransaksi,
        updatePksFn: updatePks,
        updateInvestorFn: updateInvestor,
        triggerAutorenewalFn: triggerAutorenewal,
        setDoneKeysFn: setDoneKeys,
        uploadFiles: internalUploadFiles,
        uploadBuktiTransaksiFn: uploadBuktiTransaksi,
        uploadBuktiPengembalianFn: uploadBuktiPengembalian,
      });

      toast.success(`Pembayaran internal untuk ${internalTarget.nama} dicatat ke Arus Kas & Bukti tersimpan.`);
      clearInternalUploadDialog();
    } catch {
      toast.error("Gagal mencatat. Coba lagi.");
    } finally {
      setIsConfirmingInt(false);
      setToggling(null);
    }
  };

  // --- Handlers Upload Eksternal ---
  const handleFileChangeMulti = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setUploadFiles((prev) => [...prev, ...newFiles]);

      const newPreviews = newFiles.map(f => {
        if (f.type.startsWith("image/")) return URL.createObjectURL(f);
        return "📄 Dokumen PDF";
      });
      setUploadPreviews((prev) => [...prev, ...newPreviews]);
    }
    e.target.value = '';
  };

  const removeUploadFile = (idx: number) => {
    setUploadPreviews(prev => {
      const removed = prev[idx];
      if (removed) revokePreview(removed);
      return prev.filter((_, i) => i !== idx);
    });
    setUploadFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const clearUploadDialog = () => {
    setUploadPreviews(prev => { prev.forEach(revokePreview); return []; });
    setUploadTarget(null);
    setUploadFiles([]);
  };

  // Cleanup object URLs saat komponen unmount agar tidak ada memory leak.
  // Pakai ref (bukan setState di cleanup) karena setState di dalam cleanup
  // unmount tidak akan tereksekusi — komponen sudah di-unmount. Ref tetap
  // memegang referensi ke array terakhir sehingga revoke benar-benar terjadi.
  //
  // PATCH (kritikal #2): sebelumnya `setInternalUploadPreviews` & `setUploadPreviews`
  // dipanggil saat `clearInternalUploadDialog` / `clearUploadDialog`. Jika state
  // berubah → komponen unmount sebelum `useEffect` sync ref lagi, ref masih memegang
  // URL lama → tidak di-revoke → memory leak bertumpuk di halaman Reminder.
  // Solusi: simpan versi PREV state di ref terpisah sehingga cleanup melihat
  // snapshot terakhir yang valid.
  const internalPreviewsRef = useRef<string[]>([]);
  const uploadPreviewsRef   = useRef<string[]>([]);
  useEffect(() => {
    internalPreviewsRef.current = internalUploadPreviews;
    return () => { internalUploadPreviews.forEach(revokePreview); };
  }, [internalUploadPreviews]);
  useEffect(() => {
    uploadPreviewsRef.current = uploadPreviews;
    return () => { uploadPreviews.forEach(revokePreview); };
  }, [uploadPreviews]);
  // Final unmount safety-net — revoke semua URL yang masih ada di ref
  // (mis. jika state di-reset saat dialog ditutup tapi URL belum sempat di-revoke).
  useEffect(() => {
    return () => {
      internalPreviewsRef.current.forEach(revokePreview);
      uploadPreviewsRef.current.forEach(revokePreview);
    };
  }, []);

  const handleConfirmUpload = async () => {
    if (!uploadTarget) return;
    // m-MB-fee-wajib: bukti transfer WAJIB untuk role investor & broker.
    // Jika entity punya investorId (Investor) atau tidak (Broker murni),
    // proses dianggap gagal kalau belum ada file bukti yang diupload.
    const requiresProof = uploadTarget.recipientRole !== "System";
    if (requiresProof && uploadFiles.length === 0) {
      toast.error("Bukti transfer wajib diupload untuk role Investor & Broker.");
      return;
    }
    setIsUploading(true);
    setToggling(uploadTarget.id);
    try {
      await processUploadEntity({
        entity: uploadTarget,
        uploadFiles,
        pksList,
        investors,
        brokers,
        minbun,
        trader,
        uploadBuktiTransaksiFn: uploadBuktiTransaksi,
        uploadBuktiPengembalianFn: uploadBuktiPengembalian,
        updateTransaksiFn: updateTransaksi,
        updatePksFn: updatePks,
        updateInvestorFn: updateInvestor,
        triggerAutorenewalFn: triggerAutorenewal,
        setDoneKeysFn: setDoneKeys,
      });


      toast.success(`Pembayaran massal untuk ${uploadTarget.nama} berhasil diselesaikan.`);
      clearUploadDialog();
    } catch (err) {
      // Tampilkan error message asli, bukan generic toast, agar user tahu
      // root cause (mis. HTTP 400 dari PocketBase validasi, atau error lain).
      console.error("[handleConfirmUpload] error:", err);
      const msg = String((err as Error)?.message ?? err);
      toast.error(`Gagal menyimpan pembayaran: ${msg}`);
      // Jika proses sempat menulis ke DB lalu rollback, ingatkan user untuk
      // refresh halaman agar state UI sinkron dengan PocketBase.
      toast.info(
        "Database sudah di-rollback. Refresh halaman untuk melihat status terbaru.",
      );
    } finally {
      setIsUploading(false);
      setToggling(null);
    }
  };

  const handleSaveMinbun = async () => {
    setIsSavingMB(true);
    try { await updateMinbun(formMinbun); toast.success("Rekening MinBun berhasil disimpan"); }
    catch { toast.error("Gagal menyimpan rekening MinBun"); } finally { setIsSavingMB(false); }
  };
  const handleSaveTrader = async () => {
    setIsSavingTR(true);
    try { await updateTrader(formTrader); toast.success("Rekening Trader berhasil disimpan"); }
    catch { toast.error("Gagal menyimpan rekening Trader"); } finally { setIsSavingTR(false); }
  };

  const handleSendReminder = async () => {
    setIsSendingReminder(true);
    try {
      const response = await fetch("/api/send-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${pb.authStore.token}` },
      });

      if (!response.ok) throw new Error("Gagal mengirim reminder");

      const data = await response.json();
      const parts = [`${data.sent} reminder terkirim`];
      if (data.adminEmailStatus === "sent") parts.push("✉️ Email admin OK");
      if (data.waStatus === "sent") parts.push("💬 WA OK");
      
      toast.success(parts.join(" · "));
      await refreshLogs();
    } catch {
      toast.error("Gagal mengirim reminder. Coba lagi.");
    } finally {
      setIsSendingReminder(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Bell className="h-6 w-6" />
          Reminder Bagi Hasil
        </h1>
        <p className="text-muted-foreground">
          Pantau dan catat pelunasan bagi hasil yang dikelompokkan secara massal ·{" "}
          <span className="font-medium">{summary.doneTasks}/{summary.totalTasks}</span> tugas selesai
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bagi Hasil Investor</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{toPct(summary.investor)}</div>
            <p className="text-xs text-muted-foreground">{formatCurrency(summary.investor)}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pengembalian Modal</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {/* Modal dipertahankan dalam nominal (formatShort) karena bukan irisan profit */}
            <div className="text-2xl font-bold text-rose-600">{formatShort(summary.modalToReturn)}</div>
            <p className="text-xs text-muted-foreground">{formatCurrency(summary.modalToReturn)}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bagi Hasil Trader</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{toPct(summary.trader)}</div>
            <p className="text-xs text-muted-foreground">{formatCurrency(summary.trader)}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bagi Hasil MinBun</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{toPct(summary.minbun)}</div>
            <p className="text-xs text-muted-foreground">{formatCurrency(summary.minbun)}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bagi Hasil Broker</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{toPct(summary.broker)}</div>
            <p className="text-xs text-muted-foreground">{formatCurrency(summary.broker)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bagi Hasil Owner</CardTitle>
            <Crown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{toPct(summary.owner)}</div>
            <p className="text-xs text-muted-foreground">{formatCurrency(summary.owner)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Task list Bulk */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base">Tugas Transfer Harian</CardTitle>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Label htmlFor="filter-jatuh-tempo" className="text-xs text-muted-foreground whitespace-nowrap">
                  Jatuh tempo
                </Label>
                <Input
                  id="filter-jatuh-tempo"
                  type="date"
                  value={selectedDueDate}
                  onChange={(event) => setSelectedDueDate(event.target.value)}
                  className="h-8 w-[150px] text-xs"
                  aria-label="Filter tanggal jatuh tempo"
                />
                {selectedDueDate && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={() => setSelectedDueDate("")}
                  >
                    Reset
                  </Button>
                )}
              </div>

              <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-sm">
              <button
                onClick={() => setShowDone(false)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                  showDone ? "text-muted-foreground hover:text-foreground" : "bg-background shadow-sm text-foreground"
                }`}
              >
                Pending
              </button>
              <button
                onClick={() => setShowDone(true)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                  showDone ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Selesai
              </button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-3">
          {displayEntities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-3">
              <CheckCircle2 className="h-10 w-10" />
              <p className="text-sm">
                {selectedDueDate
                  ? `Tidak ada tagihan dengan jatuh tempo ${new Date(`${selectedDueDate}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })}`
                  : showDone ? "Belum ada pembayaran yang selesai" : "Tidak ada tagihan yang menunggu pembayaran"}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap w-1/4">Penerima Tagihan</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Komponen Peran</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Keterangan</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Rekening Tujuan</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground">Jatuh Tempo & Rincian</th>
                    <th className="text-right  py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Total Transfer</th>
                    <th className="text-center py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {displayEntities.map((ent) => (
                    <EntityRow
                      key={ent.id}
                      ent={ent}
                      toggling={toggling}
                      showDone={showDone}
                      handleActionClick={handleActionClick}
                      expandedRows={expandedRows}
                      toggleExpand={toggleExpandRow}
                    />
                  ))}
                  <tr className="bg-muted/20 border-t-2 border-border">
                    <td colSpan={5} className="py-3 px-3 text-right text-xs font-semibold text-muted-foreground">Total Keseluruhan</td>
                    <td className="py-3 px-3 text-right whitespace-nowrap font-bold text-base">
                      {formatCurrency(displayEntities.reduce((sum, e) => sum + e.totalAmount, 0))}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog Selesaikan Pembayaran Massal (EKSTERNAL) ──
           Saat tombol "Selesaikan & Kirim Notif" ditekan, sistem otomatis:
           1) Menentukan role dari Penerima Tagihan pada master Investor/Broker
           2) Penerima yang tidak ditemukan dianggap System
           3) Investor/Broker wajib bukti dan menerima notifikasi sesuai route
           4) System tidak wajib bukti dan tidak dikirimi notifikasi
           5) Tandai lunas dan pindah item ke tab Selesai. */}
      <Dialog open={!!uploadTarget} onOpenChange={(o) => !o && clearUploadDialog()}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Selesaikan Pembayaran</DialogTitle>
            <DialogDescription>
              {uploadTarget?.recipientRole === "System"
                ? <>Penerima <strong>{uploadTarget.nama}</strong> terdeteksi sebagai role System, sehingga bukti transfer dan notifikasi tidak diwajibkan.</>
                : <>Sistem akan otomatis mengirim notifikasi pelunasan ke <strong>{uploadTarget?.nama}</strong> sebesar <strong className="text-orange-600">{formatCurrency(uploadTarget?.totalAmount || 0)}</strong>.</>}
            </DialogDescription>
          </DialogHeader>


          {uploadTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                <div className="flex justify-between items-center text-muted-foreground mb-1">
                  <span>No Rekening:</span>
                  <span className="font-mono text-foreground">{uploadTarget.accountNumber}</span>
                </div>
                <div className="flex justify-between items-center text-muted-foreground">
                  <span>Bank:</span>
                  <span className="font-medium text-foreground">{uploadTarget.bankName}</span>
                </div>
                <div className="mt-3 text-[10px] text-muted-foreground text-right border-t pt-2">
                  Jatuh Tempo: {getSisaHariText(uploadTarget.sisaTarget)} · Terdiri dari {uploadTarget.filteredItems.length} rincian
                </div>
              </div>

              <div className="space-y-2">
                <Label>
                  Bukti Transfer {uploadTarget.recipientRole === "System"
                    ? <span className="text-muted-foreground font-normal">(Opsional untuk role System)</span>
                    : <span className="text-destructive font-normal">* (Wajib untuk role Investor & Broker)</span>}
                </Label>


                
                <label className="flex flex-col items-center justify-center w-full border-2 border-dashed rounded-lg cursor-pointer transition-colors px-4 py-5 border-border hover:border-primary/50 hover:bg-muted/30">
                  <input type="file" accept="image/*,.pdf" multiple className="hidden" onChange={handleFileChangeMulti} />
                  <div className="flex flex-col items-center text-center space-y-2 text-muted-foreground">
                    <Upload className="h-6 w-6 opacity-70" />
                    <div>
                      <p className="text-sm font-medium">Klik untuk tambah gambar/PDF</p>
                      <p className="text-xs">Bisa pilih beberapa sekaligus</p>
                    </div>
                  </div>
                </label>

                {uploadPreviews.length > 0 && (
                  <div className="mt-3 bg-muted/20 p-2 rounded-lg border">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">File Terpilih ({uploadFiles.length}):</p>
                    <div className="grid grid-cols-4 gap-2">
                      {uploadPreviews.map((preview, i) => (
                        <div key={`${preview}-${i}`} className="relative group">
                          {preview.startsWith("blob:") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={preview} alt="Preview" className="w-full h-16 object-cover rounded border bg-white" />
                          ) : (
                            <div className="w-full h-16 rounded border bg-white flex items-center justify-center text-[10px] font-medium text-center p-1">
                              {preview}
                            </div>
                          )}
                          <button 
                            onClick={() => removeUploadFile(i)} 
                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Hapus file"
                            type="button"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={clearUploadDialog} disabled={isUploading}>Batal</Button>
            <Button onClick={handleConfirmUpload} disabled={isUploading}>
              {isUploading ? "Memproses…" : uploadTarget?.recipientRole === "System" ? "Selesaikan" : "Selesaikan & Kirim Notif"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Konfirmasi Internal (DENGAN UPLOAD BUKTI) ── */}
      <Dialog open={!!internalTarget} onOpenChange={(open) => { if (!open) clearInternalUploadDialog(); }}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Catat Penerimaan Internal
            </DialogTitle>
            <DialogDescription>
              Terdapat <strong>{internalTarget?.filteredItems.length} tagihan</strong> yang akan dicatat sebagai pemasukan di Arus Kas.
            </DialogDescription>
          </DialogHeader>

          {internalTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Penerima</span>
                  <span className="font-medium">{internalTarget.nama}</span>
                </div>
                
                <div className="pt-2 border-t mt-2">
                  <p className="text-xs text-muted-foreground mb-1.5 font-medium">Rincian Transaksi:</p>
                  <ul className="space-y-1.5 max-h-[140px] overflow-y-auto pr-2">
                    {internalTarget.filteredItems.map(i => (
                      <li key={i.sourceId} className="flex justify-between items-center text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono">{i.sourceId}</span>
                          <span className="text-[10px] text-muted-foreground">({i.type})</span>
                        </div>
                        <span>{formatCurrency(i.jumlah)}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="border-t pt-2 flex justify-between font-semibold mt-2">
                  <span>Total Dicatat ke Kas</span>
                  <span className="text-green-600">{formatCurrency(internalTarget.totalAmount)}</span>
                </div>
              </div>

              {/* FITUR BARU: UPLOAD BUKTI UNTUK INTERNAL */}
              <div className="space-y-2">
                <Label>Bukti Transfer <span className="text-muted-foreground font-normal">(Opsional)</span></Label>
                
                <label className="flex flex-col items-center justify-center w-full border-2 border-dashed rounded-lg cursor-pointer transition-colors px-4 py-5 border-border hover:border-primary/50 hover:bg-muted/30">
                  <input type="file" accept="image/*,.pdf" multiple className="hidden" onChange={handleInternalFileChangeMulti} />
                  <div className="flex flex-col items-center text-center space-y-2 text-muted-foreground">
                    <Upload className="h-6 w-6 opacity-70" />
                    <div>
                      <p className="text-sm font-medium">Klik untuk tambah gambar/PDF</p>
                      <p className="text-xs">Bisa pilih beberapa sekaligus</p>
                    </div>
                  </div>
                </label>

                {internalUploadPreviews.length > 0 && (
                  <div className="mt-3 bg-muted/20 p-2 rounded-lg border">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">File Terpilih ({internalUploadFiles.length}):</p>
                    <div className="grid grid-cols-4 gap-2">
                      {internalUploadPreviews.map((preview, i) => (
                        <div key={`${preview}-${i}`} className="relative group">
                          {preview.startsWith("blob:") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={preview} alt="Preview" className="w-full h-16 object-cover rounded border bg-white" />
                          ) : (
                            <div className="w-full h-16 rounded border bg-white flex items-center justify-center text-[10px] font-medium text-center p-1">
                              {preview}
                            </div>
                          )}
                          <button 
                            onClick={() => removeInternalUploadFile(i)} 
                            className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Hapus file"
                            type="button"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => clearInternalUploadDialog()} disabled={isConfirmingInt}>Batal</Button>
            <Button onClick={handleConfirmInternal} disabled={isConfirmingInt}>
              {isConfirmingInt ? "Menyimpan…" : "Catat ke Kas & Selesaikan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Pengaturan Rekening Internal ── */}
      <Card>
        <CardHeader className="pb-3">
          <button onClick={() => setShowSettings((v) => !v)} className="flex items-center justify-between w-full text-left">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Pengaturan Rekening Internal</CardTitle>
            </div>
            {showSettings ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </button>
          {!showSettings && <p className="text-xs text-muted-foreground mt-1 ml-6">Kelola nama, bank, dan nomor rekening MinBun & Trader</p>}
        </CardHeader>
        {showSettings && (
          <CardContent className="space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-green-100 text-green-700 border-green-200">MinBun</span>{" "}
                Rekening MinBun
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Nama</Label><Input value={formMinbun.nama} onChange={(e) => setFormMinbun((f) => ({ ...f, nama: e.target.value }))} placeholder="MinBun / nama perusahaan" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Nama Bank</Label><Input value={formMinbun.bankName} onChange={(e) => setFormMinbun((f) => ({ ...f, bankName: e.target.value }))} placeholder="BCA / BRI / Mandiri..." /></div>
                <div className="space-y-1.5"><Label className="text-xs">Nomor Rekening</Label><Input value={formMinbun.accountNumber} onChange={(e) => setFormMinbun((f) => ({ ...f, accountNumber: e.target.value }))} placeholder="1234567890" /></div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button size="sm" onClick={handleSaveMinbun} disabled={isSavingMB}><Save className="h-3.5 w-3.5 mr-1.5" />{isSavingMB ? "Menyimpan…" : "Simpan MinBun"}</Button>
              </div>
            </div>
            <div className="border-t" />
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-purple-100 text-purple-700 border-purple-200">Trader</span>
                {" "}Rekening Trader
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5"><Label className="text-xs">Nama</Label><Input value={formTrader.nama} onChange={(e) => setFormTrader((f) => ({ ...f, nama: e.target.value }))} placeholder="Trader / nama trader" /></div>
                <div className="space-y-1.5"><Label className="text-xs">Nama Bank</Label><Input value={formTrader.bankName} onChange={(e) => setFormTrader((f) => ({ ...f, bankName: e.target.value }))} placeholder="BCA / BRI / Mandiri..." /></div>
                <div className="space-y-1.5"><Label className="text-xs">Nomor Rekening</Label><Input value={formTrader.accountNumber} onChange={(e) => setFormTrader((f) => ({ ...f, accountNumber: e.target.value }))} placeholder="1234567890" /></div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button size="sm" onClick={handleSaveTrader} disabled={isSavingTR}><Save className="h-3.5 w-3.5 mr-1.5" />{isSavingTR ? "Menyimpan…" : "Simpan Trader"}</Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Riwayat Reminder ── */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                Riwayat Reminder
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Log pengiriman reminder &amp; notifikasi bagi hasil via Email / WhatsApp
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void refreshLogs()} disabled={logsLoading}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${logsLoading ? "animate-spin" : ""}`} />Refresh
              </Button>
              <Button size="sm" onClick={() => void handleSendReminder()} disabled={isSendingReminder}>
                <Send className="h-3.5 w-3.5 mr-1.5" />{isSendingReminder ? "Mengirim…" : "Kirim Sekarang"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {logsLoading && (
            <div className="py-8 text-center text-sm text-muted-foreground">Memuat…</div>
          )}
          {!logsLoading && logs.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />Belum ada riwayat pengiriman reminder
            </div>
          )}
          {!logsLoading && logs.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Waktu Kirim</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Investor</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">No. Referensi</th>
                    <th className="text-center py-2.5 px-4 font-medium text-muted-foreground">Jenis</th>
                    <th className="text-center py-2.5 px-4 font-medium text-muted-foreground">Email</th>
                    <th className="text-center py-2.5 px-4 font-medium text-muted-foreground">WhatsApp</th>
                    <th className="text-left py-2.5 px-4 font-medium text-muted-foreground">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.slice(0, 50).map((log: ReminderLog) => {
                    const isNotif = log.triggeredBy === "notifikasi";
                    const isManual = log.triggeredBy === "manual";
                    const typeClassName = isManual ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" : "bg-muted text-muted-foreground";
                    const formattedAmount = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(log.jumlah);
                    const keteranganText = log.jumlah > 0 ? `${log.keterangan} · ${formattedAmount}` : log.keterangan;
                    const descriptionContent = isNotif ? keteranganText : log.pksCustomId;
                    return (
                      <tr key={log.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-4 whitespace-nowrap text-muted-foreground text-xs">
                          {new Date(log.sentAt).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-2.5 px-4 font-medium whitespace-nowrap">{log.investorName}</td>
                        <td className="py-2.5 px-4 font-mono text-xs text-muted-foreground whitespace-nowrap">{log.pksCustomId}</td>
                        <td className="py-2.5 px-4 text-center">
                          {isNotif ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">Bagi Hasil</span>
                          ) : (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${typeClassName}`}>
                              {isManual ? "Manual" : "Otomatis"}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-center"><ChannelBadge status={log.emailStatus} icon={<Mail className="h-3 w-3" />} errorMessage={log.errorMessage} /></td>
                        <td className="py-2.5 px-4 text-center"><ChannelBadge status={log.waStatus} icon={<MessageCircle className="h-3 w-3" />} errorMessage={log.errorMessage} /></td>
                        <td className="py-2.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                          {descriptionContent}
                          {log.errorMessage && <div className="text-red-500 text-[10px] mt-0.5 max-w-[200px] truncate" title={log.errorMessage}>{log.errorMessage}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}