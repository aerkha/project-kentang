"use client";

import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { useMou, type MoU } from "@/lib/mou-context";
import { todayWibStr } from "@/lib/utils";
import { useTransaksi, calcTransaksi, type Transaksi } from "@/lib/transaksi-context";
import { useInvestors, type Investor } from "@/lib/investors-context";
import { useBrokers, type Broker } from "@/lib/brokers-context";
import { usePengeluaran } from "@/lib/cashflow-context";
import { useSettings } from "@/lib/settings-context";
import { useReminderLogs, type ReminderLog } from "@/lib/reminder-logs-context";
import pb from "@/lib/pocketbase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Settings2,
  Save,
  ChevronDown,
  ChevronUp,
  Send,
  RefreshCw,
  Mail,
  MessageCircle,
  Clock,
  ShieldCheck,
  Upload,
  FileCheck,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Tipe baris tabel ─────────────────────────────────────────────────────────

type PaymentRow = {
  nama:          string;
  keterangan:    "Investor" | "Broker" | "Trader" | "MinBun";
  bankName:      string;
  accountNumber: string;
  jumlah:        number;
  checkKey:      string; // kunci untuk bagiHasilChecks: mis. "INV-0001_Investor", "Trader"
  investorId?:   string; // untuk baris Investor saja
};

type AccountInfo = { nama: string; bankName: string; accountNumber: string };

function getInvestorPkPct(investorId: string, mous: MoU[]): number {
  const latest = mous
    .filter((m) => m.investorId === investorId)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return latest?.bagiHasilPK ?? 35;
}

// Build payment rows per transaksi
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
  if (calc.totalInvestasi === 0) return rows;

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

type EntitySummaryItem = {
  trx: Transaksi;
  jumlah: number;
  checkKey: string;
  isDone: boolean;
};

type ProcessedEntity = {
  id: string; // keterangan + nama (unik)
  nama: string;
  keterangan: PaymentRow["keterangan"];
  bankName: string;
  accountNumber: string;
  investorId?: string;
  filteredItems: EntitySummaryItem[];
  totalAmount: number;
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

// ── Component ─────────────────────────────────────────────────────────────────
// Extracted helpers to reduce cognitive complexity in component

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
  setDoneKeysFn,
}: ProcessInternalEntityParams) {
  const today = todayWibStr();
  const isMinBun = entity.keterangan === "MinBun";

  for (const item of entity.filteredItems) {
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
    setDoneKeysFn((prev) => new Set(prev).add(`${item.trx.id}__${item.checkKey}`));
  }
}

type ProcessUploadEntityParams = {
  entity: ProcessedEntity;
  uploadFile: File | null;
  mous: MoU[];
  investors: Investor[];
  brokers: Broker[];
  minbun: AccountInfo;
  trader: AccountInfo;
  uploadBuktiTransaksiFn: (trxId: string, keterangan: any, file: File) => Promise<string>;
  updateTransaksiFn: (id: string, data: any) => Promise<void>;
  setDoneKeysFn: (updater: (s: Set<string>) => Set<string>) => void;
};

async function uploadBuktiIfNeeded(
  item: EntitySummaryItem,
  entity: ProcessedEntity,
  uploadFile: File | null,
  uploadBuktiTransaksiFn: (trxId: string, keterangan: any, file: File) => Promise<string>,
) {
  if (!uploadFile) return "";
  return uploadBuktiTransaksiFn(item.trx.id, entity.keterangan, uploadFile);
}

async function notifyInvestorIfNeeded(
  item: EntitySummaryItem,
  entity: ProcessedEntity,
  buktiUrl: string,
) {
  if (entity.keterangan !== "Investor" || !entity.investorId) return;

  await fetch("/api/notify-investor", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${pb.authStore.token}`,
    },
    body: JSON.stringify({
      transaksiId: item.trx.id,
      keterangan: "Bagi Hasil",
      investorId: entity.investorId,
      jumlah: item.jumlah,
      buktiUrl,
    }),
  }).catch((err) => console.error("Gagal panggil API WA:", err));
}

async function processUploadEntity({
  entity,
  uploadFile,
  mous,
  investors,
  brokers,
  minbun,
  trader,
  uploadBuktiTransaksiFn,
  updateTransaksiFn,
  setDoneKeysFn,
}: ProcessUploadEntityParams) {
  for (const item of entity.filteredItems) {
    const buktiUrl = await uploadBuktiIfNeeded(item, entity, uploadFile, uploadBuktiTransaksiFn);

    const checks = { ...item.trx.bagiHasilChecks, [item.checkKey]: true };
    const allRows = buildTransaksiRows(item.trx, mous, investors, brokers, minbun, trader);
    const allDone = allRows.every((r) => checks[r.checkKey]);

    await updateTransaksiFn(item.trx.id, { bagiHasilChecks: checks, bagiHasilDone: allDone });
    setDoneKeysFn((prev) => new Set(prev).add(`${item.trx.id}__${item.checkKey}`));

    await notifyInvestorIfNeeded(item, entity, buktiUrl);
  }
}

function isBulkEntityInternal(entity: ProcessedEntity, internalInvestorIds: Set<string>) {
  return entity.keterangan === "MinBun" || (entity.keterangan === "Investor" && !!entity.investorId && internalInvestorIds.has(entity.investorId));
}

function getBulkActionTooltipText(showDone: boolean, isInternal: boolean) {
  if (showDone) return "Batalkan pelunasan";
  if (isInternal) return "Catat ke Arus Kas (Tanpa Bukti)";
  return "Upload Bukti & Tandai Selesai";
}

function EntityRow({
  ent,
  toggling,
  internalInvestorIds,
  showDone,
  handleActionClick,
  keteranganColor,
}: Readonly<{
  ent: ProcessedEntity;
  toggling: string | null;
  internalInvestorIds: Set<string>;
  showDone: boolean;
  handleActionClick: (e: ProcessedEntity) => void;
  keteranganColor: Record<PaymentRow["keterangan"], string>;
}>) {
  const isLoading = toggling === ent.id;
  const isInternal = isBulkEntityInternal(ent, internalInvestorIds);
  const tooltipText = getBulkActionTooltipText(showDone, isInternal);

  return (
    <tr key={ent.id} className="border-b border-border/50 hover:bg-muted/40 transition-colors">
      <td className="py-3 px-3 font-medium whitespace-nowrap">{ent.nama}</td>
      <td className="py-3 px-3 whitespace-nowrap">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${keteranganColor[ent.keterangan]}`}>
          {ent.keterangan}
        </span>
        {isInternal && (
          <span className="inline-flex ml-1.5 items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
            <ShieldCheck className="h-2.5 w-2.5" />Internal
          </span>
        )}
      </td>
      <td className="py-3 px-3 whitespace-nowrap">
        <div className="text-muted-foreground">{ent.bankName}</div>
        <div className="font-mono text-xs text-muted-foreground mt-0.5">{ent.accountNumber}</div>
      </td>
      <td className="py-3 px-3">
        <div className="flex flex-wrap gap-1.5 max-w-[240px]">
          {ent.filteredItems.map(i => (
            <Badge key={i.trx.id} variant="secondary" className="text-[10px] font-mono font-normal">
              {i.trx.id}
            </Badge>
          ))}
        </div>
      </td>
      <td className="py-3 px-3 text-right whitespace-nowrap font-bold text-base">
        <div className={showDone ? "text-green-600" : ""}>{formatCurrency(ent.totalAmount)}</div>
        <div className="text-[10px] font-normal text-muted-foreground mt-0.5">
          {ent.filteredItems.length} tagihan digabung
        </div>
      </td>
      <td className="py-3 px-3 text-center">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                disabled={isLoading}
                onClick={() => handleActionClick(ent)}
              >
                {showDone
                  ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                  : <Circle className="h-5 w-5 text-muted-foreground" />
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
  );
}

export function ReminderContent() {
  const { mous }                                      = useMou();
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

  // State dialog konfirmasi internal
  const [internalTarget,  setInternalTarget]  = useState<ProcessedEntity | null>(null);
  const [isConfirmingInt, setIsConfirmingInt] = useState(false);

  // State dialog upload transfer massal
  const [uploadTarget, setUploadTarget] = useState<ProcessedEntity | null>(null);
  const [uploadFile, setUploadFile]     = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string>("");
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

  // 1. Ringkasan (Summary Metrics)
  const summary = useMemo(() => {
    let investor = 0, traderAmt = 0, minbunAmt = 0, broker = 0;
    let totalTasks = 0, doneTasks = 0;

    transaksis.filter((t) => t.status === "selesai" || t.status === "bermasalah").forEach((trx) => {
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

    return { investor, trader: traderAmt, minbun: minbunAmt, broker, totalTasks, doneTasks };
  }, [transaksis, mous, investors, brokers, minbun, trader, doneKeys]);

  // 2. Data Entity (Bulk Data)
  const displayEntities = useMemo(() => {
    const map = new Map<string, ProcessedEntity & { items: EntitySummaryItem[] }>();

    transaksis.filter((t) => t.status === "selesai" || t.status === "bermasalah").forEach((trx) => {
      const rows = buildTransaksiRows(trx, mous, investors, brokers, minbun, trader);
      rows.forEach((r) => {
        const key = `${r.keterangan}_${r.investorId || r.nama}`;
        if (!map.has(key)) {
          map.set(key, {
            id: key, nama: r.nama, keterangan: r.keterangan, bankName: r.bankName,
            accountNumber: r.accountNumber, investorId: r.investorId, items: [], filteredItems: [], totalAmount: 0
          });
        }
        const isDone = !!trx.bagiHasilChecks?.[r.checkKey] || doneKeys.has(`${trx.id}__${r.checkKey}`);
        map.get(key)!.items.push({ trx, jumlah: r.jumlah, checkKey: r.checkKey, isDone });
      });
    });

    const result: ProcessedEntity[] = [];
    map.forEach((ent) => {
      const filteredItems = ent.items.filter((i) => i.isDone === showDone);
      if (filteredItems.length > 0) {
        const totalAmount = filteredItems.reduce((s, i) => s + i.jumlah, 0);
        result.push({ ...ent, filteredItems, totalAmount });
      }
    });

    result.sort((a, b) => b.totalAmount - a.totalAmount);
    return result;
  }, [transaksis, mous, investors, brokers, minbun, trader, doneKeys, showDone]);

  // Handler Klik Tombol Aksi per Entitas
  const handleActionClick = (entity: ProcessedEntity) => {
    if (showDone) {
      void handleUndoBulk(entity);
      return;
    }

    const isInternal = isBulkEntityInternal(entity, internalInvestorIds);
    const setTargetFn = isInternal ? setInternalTarget : setUploadTarget;
    setTargetFn(entity);
  };

  // ── Fungsi Pembatalan ──
  const handleUndoBulk = async (entity: ProcessedEntity) => {
    setToggling(entity.id);
    try {
      for (const item of entity.filteredItems) {
        const checks = { ...item.trx.bagiHasilChecks, [item.checkKey]: false };
        await updateTransaksi(item.trx.id, { bagiHasilChecks: checks, bagiHasilDone: false });
        setDoneKeys((prev) => { const s = new Set(prev); s.delete(`${item.trx.id}__${item.checkKey}`); return s; });
      }
      toast.info(`Status pembayaran untuk ${entity.nama} dibatalkan.`);
    } catch {
      toast.error("Gagal membatalkan. Coba lagi.");
    } finally {
      setToggling(null);
    }
  };

  const cashflowTagRecorded = (tag: string) => pengeluarans.some((p) => p.catatan === tag);

  // ── Fungsi Simpan Internal (Tanpa Upload) ──
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

  // ── File Handler ──
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadFile(file);
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (ev) => setUploadPreview(ev.target?.result as string);
        reader.readAsDataURL(file);
      } else {
        setUploadPreview("");
      }
    } else {
      setUploadFile(null);
      setUploadPreview("");
    }
  };

  // ── Fungsi Simpan Massal (Eksternal + Upload Bukti + WA) ──
  const handleConfirmUpload = async () => {
    if (!uploadTarget) return;
    setIsUploading(true);
    setToggling(uploadTarget.id);
    try {
      await processUploadEntity({
        entity: uploadTarget,
        uploadFile,
        mous,
        investors,
        brokers,
        minbun,
        trader,
        uploadBuktiTransaksiFn: uploadBuktiTransaksi,
        updateTransaksiFn: updateTransaksi,
        setDoneKeysFn: setDoneKeys,
      });

      toast.success(`Pembayaran massal untuk ${uploadTarget.nama} berhasil diselesaikan.`);
      setUploadTarget(null);
      setUploadFile(null);
      setUploadPreview("");
    } catch {
      toast.error("Gagal menyimpan pembayaran. Coba lagi.");
    } finally {
      setIsUploading(false);
      setToggling(null);
    }
  };

  const keteranganColor: Record<PaymentRow["keterangan"], string> = {
    Investor: "bg-orange-100 text-orange-700 border-orange-200",
    Broker:   "bg-blue-100 text-blue-700 border-blue-200",
    Trader:   "bg-purple-100 text-purple-700 border-purple-200",
    MinBun:   "bg-green-100 text-green-700 border-green-200",
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

  const buildReminderSuccessMessage = (data: any) => {
    const parts = [`${data.sent} reminder terkirim`];
    if (data.adminEmailStatus === "sent") parts.push("✉️ Email admin OK");
    if (data.waStatus === "sent") parts.push("💬 WA OK");
    return parts.join(" · ");
  };

  const handleSendReminder = async () => {
    setIsSendingReminder(true);
    try {
      const response = await fetch("/api/send-reminder", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${pb.authStore.token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Gagal mengirim reminder");
      }

      const data = await response.json();
      toast.success(buildReminderSuccessMessage(data));
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <CardTitle className="text-base">Pembayaran Massal (Bulk Transfer)</CardTitle>

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
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Penerima</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Peran</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Rekening Tujuan</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground">Daftar Transaksi</th>
                    <th className="text-right  py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Total Tagihan</th>
                    <th className="text-center py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {displayEntities.map((ent) => (
                    <EntityRow
                      key={ent.id}
                      ent={ent}
                      toggling={toggling}
                      internalInvestorIds={internalInvestorIds}
                      showDone={showDone}
                      handleActionClick={handleActionClick}
                      keteranganColor={keteranganColor}
                    />
                  ))}
                  <tr className="bg-muted/20">
                    <td colSpan={4} className="py-2.5 px-3 text-right text-xs font-medium text-muted-foreground">Total Keseluruhan</td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap font-bold text-base">
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

      {/* ── Dialog Upload Transfer Massal (Bulk Transfer) ── */}
      <Dialog open={!!uploadTarget} onOpenChange={(o) => { if (!o) { setUploadTarget(null); setUploadFile(null); setUploadPreview(""); }}}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Selesaikan Pembayaran</DialogTitle>
            <DialogDescription>
              Upload satu bukti transfer untuk melunasi {uploadTarget?.filteredItems.length} tagihan atas nama <strong>{uploadTarget?.nama}</strong>.
            </DialogDescription>
          </DialogHeader>

          {uploadTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                <p className="font-semibold text-muted-foreground mb-2">Rincian Tagihan:</p>
                <ul className="space-y-1.5 mb-3 max-h-[140px] overflow-y-auto pr-2">
                  {uploadTarget.filteredItems.map(i => (
                    <li key={i.trx.id} className="flex justify-between items-center text-xs border-b border-border/50 pb-1.5">
                      <span className="font-mono">{i.trx.id}</span>
                      <span>{formatCurrency(i.jumlah)}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex justify-between items-center font-bold text-base pt-1">
                  <span>Total Transfer</span>
                  <span className="text-orange-600">{formatCurrency(uploadTarget.totalAmount)}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Bukti Transfer (Opsional)</Label>
                <label className={`flex flex-col items-center justify-center w-full border-2 border-dashed rounded-lg cursor-pointer transition-colors px-4 py-6 ${
                  uploadFile ? "border-green-400 bg-green-50/50" : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"
                }`}>
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleFileChange} />
                  {uploadFile ? (
                    <div className="flex flex-col items-center text-center space-y-2">
                      <FileCheck className="h-8 w-8 text-green-500" />
                      <div>
                        <p className="text-sm font-medium text-green-700">{uploadFile.name}</p>
                        <p className="text-xs text-muted-foreground">Klik untuk ganti file</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center space-y-2 text-muted-foreground">
                      <Upload className="h-8 w-8 opacity-70" />
                      <div>
                        <p className="text-sm font-medium">Klik untuk upload bukti</p>
                        <p className="text-xs">Format JPG, PNG, atau PDF</p>
                      </div>
                    </div>
                  )}
                </label>
                {uploadPreview && (
                  <div className="rounded-lg overflow-hidden border mt-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={uploadPreview} alt="Preview" className="w-full max-h-32 object-contain bg-muted" />
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setUploadTarget(null)} disabled={isUploading}>Batal</Button>
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
              {internalTarget?.keterangan === "MinBun" ? "Konfirmasi Bagi Hasil MinBun" : "Catat Profit Internal"}
            </DialogTitle>
            <DialogDescription>
              Terdapat <strong>{internalTarget?.filteredItems.length} tagihan</strong> yang akan dilunasi dan dicatat sebagai pemasukan di Arus Kas. Tidak diperlukan bukti transfer.
            </DialogDescription>
          </DialogHeader>

          {internalTarget && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">{internalTarget.keterangan === "MinBun" ? "Penerima" : "Investor"}</span>
                <span className="font-medium">{internalTarget.nama}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>Total Dicatat</span>
                <span className="text-green-600">{formatCurrency(internalTarget.totalAmount)}</span>
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