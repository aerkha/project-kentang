"use client";

import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { useMou, type MoU } from "@/lib/mou-context";
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

// ── Helpers Hitungan Mundur Hari (Standardisasi Kalender Murni) ──────────────

function diffDays(startStr: string, endStr: string): number {
  const [sy, sm, sd] = startStr.slice(0, 10).split("-").map(Number);
  const [ey, em, ed] = endStr.slice(0, 10).split("-").map(Number);
  const startMs = Date.UTC(sy, sm - 1, sd);
  const endMs = Date.UTC(ey, em - 1, ed);
  return Math.round((endMs - startMs) / 86_400_000);
}

function parsePeriodeDays(desc: string): number {
  const m = /\d+/.exec(desc);
  const n = m ? Number.parseInt(m[0], 10) : 30;
  return n > 0 ? n : 30;
}

function sisaHari(t: { date: string; description: string }): number {
  if (!t.date) return 0;
  const days = parsePeriodeDays(t.description);
  const [y, m, d] = t.date.slice(0, 10).split("-").map(Number);
  const endMs = Date.UTC(y, m - 1, d + days);
  const endStr = new Date(endMs).toISOString().slice(0, 10);
  
  return diffDays(todayWibStr(), endStr);
}

function endDatePks(mou: MoU) {
  const [y, m, d] = mou.date.slice(0, 10).split("-").map(Number);
  const totalDays = (mou.contractPeriod || 30) * (mou.siklus || 1);
  return new Date(Date.UTC(y, m - 1, d + totalDays)).toISOString().slice(0, 10);
}

function sisaHariPks(mou: MoU): number {
  if (!mou.date) return 0;
  const endStr = endDatePks(mou);
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
  if (s === 0) return "text-orange-600 font-semibold";
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

function getInvestorPkPct(investorId: string, mous: MoU[]): number {
  const latest = mous
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
  mous:       MoU[],
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

    const pkPct   = getInvestorPkPct(entry.investorId, mous) / 100;
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

type BaseEntitySummaryItem = {
  sourceId: string;
  keterangan: string;
  jumlah: number;
  checkKey: string;
  isDone: boolean;
  sisa: number;
  statusTampil: string;
};

type EntitySummaryBagiHasilItem = BaseEntitySummaryItem & {
  type: "Bagi Hasil";
  trx: Transaksi;
};

type EntitySummaryPengembalianModalItem = BaseEntitySummaryItem & {
  type: "Pengembalian Modal";
  mou: MoU;
};

type EntitySummaryItem = EntitySummaryBagiHasilItem | EntitySummaryPengembalianModalItem;

type ProcessedEntity = {
  id: string;
  nama: string;
  bankName: string;
  accountNumber: string;
  investorId?: string;
  roles: string[];
  filteredItems: EntitySummaryItem[];
  totalAmount: number;
  isInternal: boolean;
  sisaTarget: number;
};

function ChannelBadge({ status, icon }: Readonly<{ status: string; icon: React.ReactNode }>) {
  const map: Record<string, string> = { sent: "bg-green-100 text-green-700", failed: "bg-red-100 text-red-700", skipped: "bg-muted text-muted-foreground" };
  const label: Record<string, string> = { sent: "Terkirim", failed: "Gagal", skipped: "Belum diset" };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? map.skipped}`}>
      {icon}{label[status] ?? status}
    </span>
  );
}

// ── Component Extracted Helpers ───────────────────────────────────────────────────────────────

type ProcessInternalEntityParams = {
  entity: ProcessedEntity;
  mous: MoU[];
  investors: Investor[];
  brokers: Broker[];
  minbun: AccountInfo;
  trader: AccountInfo;
  cashflowTagRecordedFn: (tag: string) => boolean;
  addPengeluaranFn: (p: any) => Promise<void>;
  updateTransaksiFn: (id: string, data: any) => Promise<void>;
  updateMouFn: (id: string, data: any) => Promise<void>;
  setDoneKeysFn: (updater: (s: Set<string>) => Set<string>) => void;
};

async function processInternalEntity({
  entity,
  mous,
  investors,
  brokers,
  minbun,
  trader,
  cashflowTagRecordedFn,
  addPengeluaranFn,
  updateTransaksiFn,
  updateMouFn,
  setDoneKeysFn,
}: ProcessInternalEntityParams) {
  const today = todayWibStr();

  for (const item of entity.filteredItems) {
    if (item.type === "Bagi Hasil" && item.trx) {
      await processInternalBagiHasil({
        item,
        entity,
        mous,
        investors,
        brokers,
        minbun,
        trader,
        today,
        cashflowTagRecordedFn,
        addPengeluaranFn,
        updateTransaksiFn,
        setDoneKeysFn,
      });
    } else if (item.type === "Pengembalian Modal" && item.mou) {
      await processInternalPengembalianModal({
        item,
        entity,
        today,
        cashflowTagRecordedFn,
        addPengeluaranFn,
        updateMouFn,
        setDoneKeysFn,
      });
    }
  }
}

async function processInternalBagiHasil({
  item,
  entity,
  mous,
  investors,
  brokers,
  minbun,
  trader,
  today,
  cashflowTagRecordedFn,
  addPengeluaranFn,
  updateTransaksiFn,
  setDoneKeysFn,
}: {
  item: EntitySummaryBagiHasilItem;
  entity: ProcessedEntity;
  mous: MoU[];
  investors: Investor[];
  brokers: Broker[];
  minbun: AccountInfo;
  trader: AccountInfo;
  today: string;
  cashflowTagRecordedFn: (tag: string) => boolean;
  addPengeluaranFn: (p: any) => Promise<void>;
  updateTransaksiFn: (id: string, data: any) => Promise<void>;
  setDoneKeysFn: (updater: (s: Set<string>) => Set<string>) => void;
}) {
  const isMinBun = item.keterangan === "MinBun";
  const tag = isMinBun
    ? `[Reminder] TRX ${item.trx.id} · MinBun`
    : `[Internal-Profit:${entity.investorId}:${item.trx.id}]`;

  if (!cashflowTagRecordedFn(tag)) {
    await addPengeluaranFn({
      date: today,
      deskripsi: isMinBun ? `Bagi Hasil MinBun — TRX ${item.trx.id}` : `Profit Internal — ${entity.nama} — TRX ${item.trx.id}`,
      debet: item.jumlah,
      kredit: 0,
      kategori: isMinBun ? "Fee MinBun" : "BagHas Modal MinBun",
      catatan: tag,
    });
  }

  const checks = { ...item.trx.bagiHasilChecks, [item.checkKey]: true };
  const allRows = buildTransaksiRows(item.trx, mous, investors, brokers, minbun, trader);
  const allDone = allRows.every((r) => checks[r.checkKey]);

  await updateTransaksiFn(item.trx.id, { bagiHasilChecks: checks, bagiHasilDone: allDone });
  const _trxId = item.trx.id;
  const _checkKey = item.checkKey;
  setDoneKeysFn((prev) => new Set(prev).add(`${_trxId}__${_checkKey}`));
}

async function processInternalPengembalianModal({
  item,
  entity,
  today,
  cashflowTagRecordedFn,
  addPengeluaranFn,
  updateMouFn,
  setDoneKeysFn,
}: {
  item: EntitySummaryPengembalianModalItem;
  entity: ProcessedEntity;
  today: string;
  cashflowTagRecordedFn: (tag: string) => boolean;
  addPengeluaranFn: (p: any) => Promise<void>;
  updateMouFn: (id: string, data: any) => Promise<void>;
  setDoneKeysFn: (updater: (s: Set<string>) => Set<string>) => void;
}) {
  const tag = `[Internal-Return:${entity.investorId}:${item.mou.id}]`;

  if (!cashflowTagRecordedFn(tag)) {
    await addPengeluaranFn({
      date: today,
      deskripsi: `Pengembalian Modal Internal — ${entity.nama} — PKS ${item.mou.id}`,
      debet: item.jumlah,
      kredit: 0,
      kategori: "Pengembalian Modal",
      catatan: tag,
    });
  }

  await updateMouFn(item.mou.id, { isTerminated: true });
  setDoneKeysFn((prev) => new Set(prev).add(item.checkKey));
}

type ProcessUploadEntityParams = {
  entity: ProcessedEntity;
  uploadFiles: File[];
  mous: MoU[];
  investors: Investor[];
  brokers: Broker[];
  minbun: AccountInfo;
  trader: AccountInfo;
  uploadBuktiTransaksiFn: (trxId: string, keterangan: any, file: File) => Promise<string>;
  uploadBuktiPengembalianFn?: (mouId: string, file: File) => Promise<string>;
  updateTransaksiFn: (id: string, data: any) => Promise<void>;
  updateMouFn: (id: string, data: any) => Promise<void>;
  setDoneKeysFn: (updater: (s: Set<string>) => Set<string>) => void;
};

async function uploadBuktiForItem(
  item: ProcessedEntity["filteredItems"][number],
  fileToUpload: File | undefined,
  uploadBuktiTransaksiFn: (trxId: string, keterangan: any, file: File) => Promise<string>,
  uploadBuktiPengembalianFn?: (mouId: string, file: File) => Promise<string>,
): Promise<string> {
  if (!fileToUpload) return "";

  if (item.type === "Pengembalian Modal" && "mou" in item && item.mou && uploadBuktiPengembalianFn) {
    return uploadBuktiPengembalianFn(item.mou.id, fileToUpload);
  }

  if ("trx" in item && item.trx) {
    return uploadBuktiTransaksiFn(item.trx.id, item.keterangan, fileToUpload);
  }

  return "";
}

type UpdateItemCompletionStatusParams = {
  item: ProcessedEntity["filteredItems"][number];
  mous: MoU[];
  investors: Investor[];
  brokers: Broker[];
  minbun: AccountInfo;
  trader: AccountInfo;
  updateTransaksiFn: (id: string, data: any) => Promise<void>;
  updateMouFn: (id: string, data: any) => Promise<void>;
  setDoneKeysFn: (updater: (s: Set<string>) => Set<string>) => void;
};

async function updateItemCompletionStatus({
  item,
  mous,
  investors,
  brokers,
  minbun,
  trader,
  updateTransaksiFn,
  updateMouFn,
  setDoneKeysFn,
}: UpdateItemCompletionStatusParams): Promise<void> {
  if (item.type === "Bagi Hasil" && item.trx) {
    const checks = { ...item.trx.bagiHasilChecks, [item.checkKey]: true };
    const allRows = buildTransaksiRows(item.trx, mous, investors, brokers, minbun, trader);
    const allDone = allRows.every((r) => checks[r.checkKey]);
    const trxId = item.trx.id;

    await updateTransaksiFn(trxId, { bagiHasilChecks: checks, bagiHasilDone: allDone });
    setDoneKeysFn((prev) => new Set(prev).add(`${trxId}__${item.checkKey}`));
    return;
  }

  if (item.type === "Pengembalian Modal" && item.mou) {
    await updateMouFn(item.mou.id, { isTerminated: true });
    setDoneKeysFn((prev) => new Set(prev).add(item.checkKey));
  }
}

async function processUploadEntity({
  entity,
  uploadFiles,
  mous,
  investors,
  brokers,
  minbun,
  trader,
  uploadBuktiTransaksiFn,
  uploadBuktiPengembalianFn,
  updateTransaksiFn,
  updateMouFn,
  setDoneKeysFn,
}: ProcessUploadEntityParams) {
  const fileUrls: string[] = [];
  const validFiles = uploadFiles.filter(Boolean);

  for (let i = 0; i < entity.filteredItems.length; i++) {
    const item = entity.filteredItems[i];
    const fileToUpload = validFiles[i % validFiles.length];

    const url = await uploadBuktiForItem(item, fileToUpload, uploadBuktiTransaksiFn, uploadBuktiPengembalianFn);
    if (url) fileUrls.push(url);

    await updateItemCompletionStatus({
      item,
      mous,
      investors,
      brokers,
      minbun,
      trader,
      updateTransaksiFn,
      updateMouFn,
      setDoneKeysFn,
    });
  }

  const combinedUrls = Array.from(new Set(fileUrls)).join(",");

  if (entity.investorId) {
    await fetch("/api/notify-investor", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${pb.authStore.token}`,
      },
      body: JSON.stringify({
        transaksiId: entity.filteredItems.map((i) => i.sourceId).join(", "),
        keterangan: entity.roles.join(" & "),
        investorId: entity.investorId,
        jumlah: entity.totalAmount,
        buktiUrl: combinedUrls,
      }),
    }).catch((err) => console.error("Gagal panggil API WA:", err));
  }
}

function getBulkActionTooltipText(showDone: boolean, isInternal: boolean) {
  if (showDone) return "Batalkan pelunasan";
  if (isInternal) return "Catat ke Arus Kas (Tanpa Bukti)";
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
        <td className="py-3 px-3 whitespace-nowrap cursor-pointer" onClick={() => toggleExpand(ent.id)}>
          <div className="text-muted-foreground">{ent.bankName}</div>
          <div className="font-mono text-xs text-muted-foreground mt-0.5">{ent.accountNumber}</div>
        </td>
        <td className="py-3 px-3 cursor-pointer" onClick={() => toggleExpand(ent.id)}>
          <div className="flex flex-col gap-0.5">
            {showDone ? (
              <span className="text-xs text-green-600 font-medium">Selesai</span>
            ) : (
              <span className={`text-xs ${getSisaHariColor(ent.sisaTarget)}`}>
                {getSisaHariText(ent.sisaTarget)}
              </span>
            )}
            <div className="text-[10px] text-muted-foreground mt-0.5 hover:underline">
              {ent.filteredItems.length} Tagihan (Lihat Rincian)
            </div>
          </div>
        </td>
        <td className="py-3 px-3 text-right whitespace-nowrap cursor-pointer" onClick={() => toggleExpand(ent.id)}>
          <div className={`font-bold text-base ${showDone ? "text-green-600" : ""}`}>{formatCurrency(ent.totalAmount)}</div>
        </td>
        <td className="py-3 px-3 text-center">
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
                  {showDone
                    ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                    : <Circle className={`h-5 w-5 ${hasDue ? "text-orange-500" : "text-muted-foreground"}`} />
                  }
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="text-xs">
                {tooltipText}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </td>
      </tr>
      
      {/* Expanded Rincian Data */}
      {isExpanded && (
        <tr className="bg-muted/10 border-b border-border/50">
          <td colSpan={6} className="p-0">
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
  const mouContext = useMou();
  const { mous, updateMou } = mouContext;
  
  // Safe-cast fungsi tambahan dari mou-context
  const uploadBuktiPengembalian = (mouContext as any).uploadBuktiPengembalian;

  const { transaksis, updateTransaksi, uploadBuktiTransaksi } = useTransaksi();
  const { investors }                                 = useInvestors();
  const { brokers }                                   = useBrokers();
  const { pengeluarans, addPengeluaran }              = usePengeluaran();
  const { minbun, trader, updateMinbun, updateTrader } = useSettings();
  const { logs, isLoading: logsLoading, refresh: refreshLogs } = useReminderLogs();

  const [isSendingReminder,   setIsSendingReminder]   = useState(false);
  const [toggling, setToggling]          = useState<string | null>(null);
  const [showDone, setShowDone]          = useState(false);
  const [doneKeys, setDoneKeys]          = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows]  = useState<Set<string>>(new Set());

  // State dialog konfirmasi internal
  const [internalTarget,  setInternalTarget]  = useState<ProcessedEntity | null>(null);
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

  // 1. Ringkasan (Summary Metrics)
  const summary = useMemo(() => {
    let investor = 0, traderAmt = 0, minbunAmt = 0, broker = 0, modalToReturn = 0;
    let totalTasks = 0, doneTasks = 0;

    transaksis.forEach((trx) => {
      const rows = buildTransaksiRows(trx, mous, investors, brokers, minbun, trader);
      rows.forEach((r) => {
        totalTasks++;
        const isDone = !!trx.bagiHasilChecks?.[r.checkKey] || doneKeys.has(`${trx.id}__${r.checkKey}`);
        if (isDone) {
          doneTasks++;
        } else if (r.keterangan === "Investor") {
          investor += r.jumlah;
        } else if (r.keterangan === "Trader") {
          traderAmt += r.jumlah;
        } else if (r.keterangan === "MinBun") {
          minbunAmt += r.jumlah;
        } else if (r.keterangan === "Broker") {
          broker += r.jumlah;
        }
      });
    });

    mous.forEach((mou) => {
      const isDone = mou.isTerminated || doneKeys.has(`MOU__${mou.id}`);
      
      // Filter Sisa Hari Dihapus Total!
      totalTasks++;
      if (isDone) {
        doneTasks++;
      } else {
        modalToReturn += mou.investmentAmount;
      }
    });

    return { investor, trader: traderAmt, minbun: minbunAmt, broker, modalToReturn, totalTasks, doneTasks };
  }, [transaksis, mous, investors, brokers, minbun, trader, doneKeys]);

  // 2. Data Entity (Bulk Data)
  const displayEntities = useMemo(() => {
    const map = new Map<string, ProcessedEntity & { items: EntitySummaryItem[] }>();

    const addToMap = (key: string, rName: string, rBank: string, rAcc: string, rInvId: string | undefined, item: EntitySummaryItem, sisaTarget: number) => {
      if (!map.has(key)) {
        map.set(key, {
          id: key, nama: rName, bankName: rBank, accountNumber: rAcc, investorId: rInvId,
          roles: [], items: [], filteredItems: [], totalAmount: 0, 
          isInternal: false, sisaTarget
        });
      }
      map.get(key)!.items.push(item);
    };

    // A. Proses dari Transaksi (Bagi Hasil)
    transaksis.forEach((trx) => {
      const rows = buildTransaksiRows(trx, mous, investors, brokers, minbun, trader);
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

    // B. Proses dari PKS (Pengembalian Modal)
    mous.forEach((mou) => {
      const sisa = sisaHariPks(mou);
      const isDone = mou.isTerminated || doneKeys.has(`MOU__${mou.id}`);

      // Filter Sisa Hari Dihapus Total! (Tampil apa pun harinya)

      const inv = investors.find(i => i.id === mou.investorId);
      const key = `${mou.investorId || mou.investorName}_${sisa}`;
      
      addToMap(key, mou.investorName, inv?.bankName || "—", inv?.accountNumber || "—", mou.investorId, {
        sourceId: mou.id, type: "Pengembalian Modal", keterangan: "Pengembalian Modal", mou: mou,
        jumlah: mou.investmentAmount, checkKey: `MOU__${mou.id}`, isDone, sisa, statusTampil: isDone ? "selesai" : "jatuh tempo",
      }, sisa);
    });

    const result: ProcessedEntity[] = [];
    map.forEach((ent) => {
      const filteredItems = ent.items.filter((i) => i.isDone === showDone);
      if (filteredItems.length > 0) {
        const totalAmount = filteredItems.reduce((s, i) => s + i.jumlah, 0);
        const uniqueRoles = Array.from(new Set(filteredItems.map(i => i.type)));
        const isInternal = filteredItems.some(i => i.keterangan === "MinBun" || (i.keterangan === "Investor" && ent.investorId && internalInvestorIds.has(ent.investorId)));
        
        result.push({ ...ent, filteredItems, totalAmount, roles: uniqueRoles, isInternal });
      }
    });

    // Urutkan berdasarkan: Jatuh tempo paling dekat (ASC), lalu Nominal paling besar (DESC)
    result.sort((a, b) => {
      if (a.sisaTarget !== b.sisaTarget) return a.sisaTarget - b.sisaTarget;
      return b.totalAmount - a.totalAmount;
    });
    
    return result;
  }, [transaksis, mous, investors, brokers, minbun, trader, doneKeys, showDone, internalInvestorIds]);

  // Handlers Aksi
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

  const handleUndoBulk = async (entity: ProcessedEntity) => {
    setToggling(entity.id);
    try {
      for (const item of entity.filteredItems) {
        if (item.type === "Bagi Hasil" && item.trx) {
          const trx = item.trx;
          const checks = { ...trx.bagiHasilChecks, [item.checkKey]: false };
          await updateTransaksi(trx.id, { bagiHasilChecks: checks, bagiHasilDone: false });
          setDoneKeys((prev) => { const s = new Set(prev); s.delete(`${trx.id}__${item.checkKey}`); return s; });
        } else if (item.type === "Pengembalian Modal" && item.mou) {
          await updateMou(item.mou.id, { isTerminated: false });
          setDoneKeys((prev) => { const s = new Set(prev); s.delete(item.checkKey); return s; });
        }
      }
      toast.info(`Status pembayaran untuk ${entity.nama} dibatalkan.`);
    } catch {
      toast.error("Gagal membatalkan. Coba lagi.");
    } finally {
      setToggling(null);
    }
  };

  const cashflowTagRecorded = (tag: string) => pengeluarans.some((p) => p.catatan === tag);

  const handleConfirmInternal = async () => {
    if (!internalTarget) return;
    setIsConfirmingInt(true);
    setToggling(internalTarget.id);
    try {
      await processInternalEntity({
        entity: internalTarget,
        mous,
        investors,
        brokers,
        minbun,
        trader,
        cashflowTagRecordedFn: cashflowTagRecorded,
        addPengeluaranFn: addPengeluaran,
        updateTransaksiFn: updateTransaksi,
        updateMouFn: updateMou,
        setDoneKeysFn: setDoneKeys,
      });

      toast.success(`Pembayaran internal untuk ${internalTarget.nama} dicatat ke Arus Kas.`);
      setInternalTarget(null);
    } catch {
      toast.error("Gagal mencatat. Coba lagi.");
    } finally {
      setIsConfirmingInt(false);
      setToggling(null);
    }
  };

  // MULTIPLE FILE UPLOAD HANDLERS
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
    setUploadFiles(prev => prev.filter((_, i) => i !== idx));
    setUploadPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const clearUploadDialog = () => {
    setUploadTarget(null);
    setUploadFiles([]);
    setUploadPreviews([]);
  };

  const handleConfirmUpload = async () => {
    if (!uploadTarget) return;
    setIsUploading(true);
    setToggling(uploadTarget.id);
    try {
      await processUploadEntity({
        entity: uploadTarget,
        uploadFiles,
        mous,
        investors,
        brokers,
        minbun,
        trader,
        uploadBuktiTransaksiFn: uploadBuktiTransaksi,
        uploadBuktiPengembalianFn: uploadBuktiPengembalian, 
        updateTransaksiFn: updateTransaksi,
        updateMouFn: updateMou,
        setDoneKeysFn: setDoneKeys,
      });

      toast.success(`Pembayaran massal untuk ${uploadTarget.nama} berhasil diselesaikan.`);
      clearUploadDialog();
    } catch {
      toast.error("Gagal menyimpan pembayaran. Coba lagi.");
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
      const response = await fetch("/api/send-reminder", {
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bagi Hasil Investor</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{formatShort(summary.investor)}</div>
            <p className="text-xs text-muted-foreground">{formatCurrency(summary.investor)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pengembalian Modal</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
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
            <div className="text-2xl font-bold">{formatShort(summary.trader)}</div>
            <p className="text-xs text-muted-foreground">{formatCurrency(summary.trader)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bagi Hasil MinBun</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatShort(summary.minbun)}</div>
            <p className="text-xs text-muted-foreground">{formatCurrency(summary.minbun)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bagi Hasil Broker</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatShort(summary.broker)}</div>
            <p className="text-xs text-muted-foreground">{formatCurrency(summary.broker)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Task list Bulk */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base">Tugas Transfer Harian</CardTitle>

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
        </CardHeader>
        <CardContent className="p-0 pt-3">
          {displayEntities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-3">
              <CheckCircle2 className="h-10 w-10" />
              <p className="text-sm">{showDone ? "Belum ada pembayaran yang selesai" : "Tidak ada tagihan yang menunggu pembayaran"}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap w-1/4">Penerima Tagihan</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Komponen Peran</th>
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
                    <td colSpan={4} className="py-3 px-3 text-right text-xs font-semibold text-muted-foreground">Total Keseluruhan</td>
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

      {/* ── Dialog Upload Transfer Massal (Bulk Transfer >50Jt Support) ── */}
      <Dialog open={!!uploadTarget} onOpenChange={(o) => !o && clearUploadDialog()}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Selesaikan Pembayaran</DialogTitle>
            <DialogDescription>
              Silakan lakukan transfer ke <strong>{uploadTarget?.nama}</strong> sebesar <strong className="text-orange-600">{formatCurrency(uploadTarget?.totalAmount || 0)}</strong>.
            </DialogDescription>
          </DialogHeader>

          {uploadTarget && (
            <div className="space-y-4 py-2">
              {/* Rincian Singkat */}
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

              {/* Multiple Upload Slot */}
              <div className="space-y-2">
                <Label>Bukti Transfer <span className="text-muted-foreground font-normal">(Boleh lebih dari 1 file jika &gt;50 Juta)</span></Label>
                
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

                {/* Previews */}
                {uploadPreviews.length > 0 && (
                  <div className="mt-3 bg-muted/20 p-2 rounded-lg border">
                    <p className="text-xs font-semibold text-muted-foreground mb-2">File Terpilih ({uploadFiles.length}):</p>
                    <div className="grid grid-cols-4 gap-2">
                      {uploadPreviews.map((preview, i) => {
                        const file = uploadFiles[i];
                        const key = file
                          ? `${file.name}-${file.size}-${file.lastModified}-${preview}`
                          : preview;

                        return (
                          <div key={key} className="relative group">
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
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={clearUploadDialog} disabled={isUploading}>Batal</Button>
            <Button onClick={handleConfirmUpload} disabled={isUploading}>
              {isUploading ? "Memproses…" : "Selesaikan & Kirim Notif"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Konfirmasi Internal (MinBun/Investor Internal) ── */}
      <Dialog open={!!internalTarget} onOpenChange={(open) => { if (!open) setInternalTarget(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Catat Penerimaan Internal
            </DialogTitle>
            <DialogDescription>
              Terdapat <strong>{internalTarget?.filteredItems.length} tagihan</strong> yang akan dicatat sebagai pemasukan di Arus Kas. Tidak diperlukan bukti transfer.
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
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setInternalTarget(null)} disabled={isConfirmingInt}>Batal</Button>
            <Button onClick={handleConfirmInternal} disabled={isConfirmingInt}>
              {isConfirmingInt ? "Menyimpan…" : "Catat ke Kas"}
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
                    const descriptionContent = isNotif ? keteranganText : log.mouCustomId;
                    return (
                      <tr key={log.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-4 whitespace-nowrap text-muted-foreground text-xs">
                          {new Date(log.sentAt).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-2.5 px-4 font-medium whitespace-nowrap">{log.investorName}</td>
                        <td className="py-2.5 px-4 font-mono text-xs text-muted-foreground whitespace-nowrap">{log.mouCustomId}</td>
                        <td className="py-2.5 px-4 text-center">
                          {isNotif ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">Bagi Hasil</span>
                          ) : (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${typeClassName}`}>
                              {isManual ? "Manual" : "Otomatis"}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-center"><ChannelBadge status={log.emailStatus} icon={<Mail className="h-3 w-3" />} /></td>
                        <td className="py-2.5 px-4 text-center"><ChannelBadge status={log.waStatus} icon={<MessageCircle className="h-3 w-3" />} /></td>
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