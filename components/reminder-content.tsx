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
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function formatDate(s: string) {
  if (!s) return "-";
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

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

// ── Build payment rows per transaksi ─────────────────────────────────────────

type AccountInfo = { nama: string; bankName: string; accountNumber: string };

/**
 * Cari pkPct (%) bagi hasil investor dari PKS terbaru investor tersebut.
 * Default 35 jika belum ada PKS.
 */
function getInvestorPkPct(investorId: string, mous: MoU[]): number {
  const latest = mous
    .filter((m) => m.investorId === investorId)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  return latest?.bagiHasilPK ?? 35;
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
  // Agregasi per broker (berdasarkan nama broker)
  const brokerMap = new Map<string, { nama: string; bankName: string; accountNumber: string; jumlah: number }>();

  for (const entry of trx.investorEntries) {
    if (entry.nilaiInvestasi <= 0) continue;

    const pkPct   = getInvestorPkPct(entry.investorId, mous) / 100;
    const ratio   = entry.nilaiInvestasi / calc.totalInvestasi;
    const profit  = calc.profit * ratio;

    const allZero   = entry.pctTrader === 0 && entry.pctMinBun === 0 && entry.pctBrokerI === 0 && entry.pctBrokerII === 0;
    const hasBroker = !!entry.investorBrokerName;
    const pT   = allZero ? 10                   : entry.pctTrader;
    const pM   = allZero ? (hasBroker ? 0 : 5)  : entry.pctMinBun;
    const pBI  = allZero ? (hasBroker ? 5 : 0)  : entry.pctBrokerI;
    const pBII = allZero ? 0                    : entry.pctBrokerII;

    const investorAmt = profit * pkPct;
    traderTotal      += profit * pT            / 100;
    minbunTotal      += profit * pM            / 100;
    const brokerAmt   = profit * (pBI + pBII)  / 100;

    // Baris Investor
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

    // Baris Broker — agregasi per nama broker
    if (brokerAmt > 0 && hasBroker) {
      const brokerKey  = entry.investorBrokerName;
      const brokerData = brokers.find((b) => b.name === entry.investorBrokerName);
      const existing   = brokerMap.get(brokerKey);
      if (existing) {
        existing.jumlah += brokerAmt;
      } else {
        brokerMap.set(brokerKey, {
          nama:          entry.investorBrokerName,
          bankName:      brokerData?.bankName      || "—",
          accountNumber: brokerData?.accountNumber || "—",
          jumlah:        brokerAmt,
        });
      }
    }
  }

  // Tambahkan baris Broker
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

  // Baris Trader
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

  // Baris MinBun
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

// ── ChannelBadge ─────────────────────────────────────────────────────────────

function ChannelBadge({ status, icon }: { status: string; icon: React.ReactNode }) {
  const map: Record<string, string> = {
    sent:    "bg-green-100 text-green-700",
    failed:  "bg-red-100 text-red-700",
    skipped: "bg-muted text-muted-foreground",
  };
  const label: Record<string, string> = {
    sent: "Terkirim", failed: "Gagal", skipped: "Belum diset",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? map.skipped}`}>
      {icon}
      {label[status] ?? status}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ReminderContent() {
  const { mous }                                      = useMou();
  const { transaksis, updateTransaksi } = useTransaksi();
  const { investors }                                 = useInvestors();
  const { brokers }                                   = useBrokers();
  const { pengeluarans, addPengeluaran }              = usePengeluaran();
  const { minbun, trader, updateMinbun, updateTrader } = useSettings();
  const { logs, isLoading: logsLoading, refresh: refreshLogs } = useReminderLogs();
  const [isSendingReminder,   setIsSendingReminder]   = useState(false);
  const [toggling, setToggling]          = useState<string | null>(null);
  const [showDone, setShowDone]          = useState(false);
  // Optimistic update: tandai selesai seketika tanpa menunggu context re-render
  const [doneKeys, setDoneKeys]          = useState<Set<string>>(new Set());

  // Set investor ID yang bertanda Internal (MinBun sendiri — full cashflow)
  const internalInvestorIds = useMemo(
    () => new Set(investors.filter((inv) => inv.isInternal).map((inv) => inv.id)),
    [investors],
  );

  // ── State dialog konfirmasi internal (MinBun & investor internal) ──
  type InternalTarget = { trx: Transaksi; keterangan: string; row: PaymentRow } | null;
  const [internalTarget,  setInternalTarget]  = useState<InternalTarget>(null);
  const [isConfirmingInt, setIsConfirmingInt] = useState(false);

  // ── State form pengaturan rekening internal ──
  const [showSettings, setShowSettings]  = useState(false);
  const [isSavingMB,   setIsSavingMB]   = useState(false);
  const [isSavingTR,   setIsSavingTR]   = useState(false);
  const [formMinbun,   setFormMinbun]   = useState({ nama: minbun.nama, bankName: minbun.bankName, accountNumber: minbun.accountNumber });
  const [formTrader,   setFormTrader]   = useState({ nama: trader.nama, bankName: trader.bankName, accountNumber: trader.accountNumber });

  useEffect(() => {
    setFormMinbun({ nama: minbun.nama, bankName: minbun.bankName, accountNumber: minbun.accountNumber });
  }, [minbun.nama, minbun.bankName, minbun.accountNumber]);
  useEffect(() => {
    setFormTrader({ nama: trader.nama, bankName: trader.bankName, accountNumber: trader.accountNumber });
  }, [trader.nama, trader.bankName, trader.accountNumber]);

  // Transaksi yang memerlukan bagi hasil: sudah selesai/bermasalah
  const tasks = useMemo(() => {
    return transaksis
      .filter((t) => t.status === "selesai" || t.status === "bermasalah")
      .map((trx) => {
        const rows = buildTransaksiRows(trx, mous, investors, brokers, minbun, trader);
        return { trx, rows };
      })
      .filter((t) => t.rows.length > 0)
      .sort((a, b) => a.trx.date.localeCompare(b.trx.date));
  }, [transaksis, mous, investors, brokers, minbun, trader]);

  // Ringkasan — jumlah per penerima yang BELUM dicentang
  const summary = useMemo(() => {
    let investor = 0, trader = 0, minbun = 0, broker = 0;
    let totalTasks = 0, doneTasks = 0;

    tasks.forEach((t) => {
      t.rows.forEach((r) => {
        const checked = !!t.trx.bagiHasilChecks?.[r.checkKey] || doneKeys.has(`${t.trx.id}__${r.checkKey}`);
        totalTasks++;
        if (checked) {
          doneTasks++;
          return;
        }
        if (r.keterangan === "Investor") investor += r.jumlah;
        else if (r.keterangan === "Trader") trader  += r.jumlah;
        else if (r.keterangan === "MinBun") minbun  += r.jumlah;
        else if (r.keterangan === "Broker") broker  += r.jumlah;
      });
    });

    return { investor, trader, minbun, broker, totalTasks, doneTasks };
  }, [tasks, doneKeys]);

  // Klik ceklis: konfirmasi cashflow untuk internal/MinBun, langsung centang untuk yang lain
  const handleToggleRow = (trx: Transaksi, row: PaymentRow) => {
    const isChecked = !!trx.bagiHasilChecks?.[row.checkKey] || doneKeys.has(`${trx.id}__${row.checkKey}`);
    if (!isChecked) {
      const isMinBun     = row.keterangan === "MinBun";
      const isInternalInv = row.keterangan === "Investor" && !!row.investorId && internalInvestorIds.has(row.investorId);
      if (isMinBun || isInternalInv) {
        setInternalTarget({ trx, keterangan: row.keterangan, row });
      } else {
        void handleDirectCheck(trx, row);
      }
    } else {
      void handleUncheck(trx, row);
    }
  };

  const handleDirectCheck = async (trx: Transaksi, row: PaymentRow) => {
    const key       = `${trx.id}__${row.checkKey}`;
    const latestTask = tasks.find((t) => t.trx.id === trx.id);
    const latestTrx  = latestTask?.trx ?? trx;
    const checks     = { ...(latestTrx.bagiHasilChecks ?? {}), [row.checkKey]: true };
    const allDone    = latestTask ? latestTask.rows.every((r) => checks[r.checkKey]) : false;
    setToggling(key);
    try {
      await updateTransaksi(trx.id, { bagiHasilChecks: checks, bagiHasilDone: allDone });
      setDoneKeys((prev) => new Set(prev).add(key));
      toast.success(`${row.keterangan} — ${row.nama} ditandai selesai`);
    } catch {
      toast.error("Gagal menyimpan perubahan. Coba lagi.");
    } finally {
      setToggling(null);
    }
  };

  const handleUncheck = async (trx: Transaksi, row: PaymentRow) => {
    const key    = `${trx.id}__${row.checkKey}`;
    const checks = { ...(trx.bagiHasilChecks ?? {}), [row.checkKey]: false };
    const task   = tasks.find((t) => t.trx.id === trx.id);
    const allDone = task ? task.rows.every((r) => checks[r.checkKey]) : false;
    setToggling(key);
    try {
      await updateTransaksi(trx.id, { bagiHasilChecks: checks, bagiHasilDone: allDone });
      setDoneKeys((prev) => { const s = new Set(prev); s.delete(key); return s; });
      const hasCashFlow =
        row.keterangan === "MinBun" ||
        (row.keterangan === "Investor" && !!row.investorId && internalInvestorIds.has(row.investorId));
      toast.info(
        `${row.keterangan} ditandai belum dibayar.${hasCashFlow ? " Entri Cash Flow tidak dihapus otomatis." : ""}`,
      );
    } catch {
      toast.error("Gagal menyimpan perubahan. Coba lagi.");
    } finally {
      setToggling(null);
    }
  };

  const cashflowTagRecorded = (tag: string) =>
    pengeluarans.some((p) => p.catatan === tag);

  // Submit dialog internal: mark check → catat ke cashflow (tanpa upload bukti)
  const handleConfirmInternal = async () => {
    if (!internalTarget) return;
    const { trx: snapshotTrx, keterangan, row } = internalTarget;
    const key = `${snapshotTrx.id}__${row.checkKey}`;

    const latestTask = tasks.find((t) => t.trx.id === snapshotTrx.id);
    const latestTrx  = latestTask?.trx ?? snapshotTrx;

    if (latestTrx.bagiHasilChecks?.[row.checkKey] || doneKeys.has(key)) {
      setInternalTarget(null);
      return;
    }

    const checks  = { ...(latestTrx.bagiHasilChecks ?? {}), [row.checkKey]: true };
    const allDone = latestTask ? latestTask.rows.every((r) => checks[r.checkKey]) : false;
    const today   = todayWibStr();

    setIsConfirmingInt(true);
    setToggling(key);
    try {
      await updateTransaksi(snapshotTrx.id, { bagiHasilChecks: checks, bagiHasilDone: allDone });
      setDoneKeys((prev) => new Set(prev).add(key));

      const isMinBun = keterangan === "MinBun";
      const tag = isMinBun
        ? `[Reminder] TRX ${snapshotTrx.id} · MinBun`
        : `[Internal-Profit:${row.investorId}:${snapshotTrx.id}]`;

      if (cashflowTagRecorded(tag)) {
        toast.info("Entri Arus Kas untuk tugas ini sudah ada — tidak dicatat ulang.");
      } else if (isMinBun) {
        await addPengeluaran({
          date:      today,
          deskripsi: `Bagi Hasil MinBun — TRX ${snapshotTrx.id}`,
          debet:     row.jumlah,
          kredit:    0,
          kategori:  "Fee MinBun",
          catatan:   tag,
        });
        toast.success(`Bagi hasil MinBun TRX ${snapshotTrx.id} dicatat di Arus Kas`);
      } else {
        await addPengeluaran({
          date:      today,
          deskripsi: `Profit Internal — ${row.nama} — TRX ${snapshotTrx.id}`,
          debet:     row.jumlah,
          kredit:    0,
          kategori:  "BagHas Modal MinBun",
          catatan:   tag,
        });
        toast.success(`Profit internal ${row.nama} dicatat di Arus Kas`);
      }

      setInternalTarget(null);
    } catch {
      toast.error("Gagal menyimpan. Coba lagi.");
    } finally {
      setIsConfirmingInt(false);
      setToggling(null);
    }
  };

  const handleSaveMinbun = async () => {
    setIsSavingMB(true);
    try {
      await updateMinbun(formMinbun);
      toast.success("Rekening MinBun berhasil disimpan");
    } catch {
      toast.error("Gagal menyimpan rekening MinBun");
    } finally {
      setIsSavingMB(false);
    }
  };

  const handleSaveTrader = async () => {
    setIsSavingTR(true);
    try {
      await updateTrader(formTrader);
      toast.success("Rekening Trader berhasil disimpan");
    } catch {
      toast.error("Gagal menyimpan rekening Trader");
    } finally {
      setIsSavingTR(false);
    }
  };

  const handleSendReminder = async () => {
    setIsSendingReminder(true);
    try {
      const pbToken = pb.authStore.token;
      if (!pbToken) {
        toast.error("Sesi tidak ditemukan. Silakan login ulang.");
        return;
      }

      const res = await fetch("/api/trigger-reminder", {
        method: "POST",
        headers: { Authorization: `Bearer ${pbToken}` },
      });
      const data = await res.json() as {
        sent?: number; message?: string;
        adminEmailStatus?: string; investorEmailsSent?: number;
        waStatus?: string; errors?: string[]; error?: string; detail?: string;
      };

      if (!res.ok) {
        toast.error(`Gagal: ${data.error ?? "Unknown error"}${data.detail ? ` — ${data.detail}` : ""}`);
      } else if (data.sent === 0) {
        toast.info(data.message ?? "Tidak ada yang perlu dikirim");
      } else {
        const parts = [`${data.sent} reminder terkirim`];
        if (data.adminEmailStatus === "sent")    parts.push("✉️ Email admin OK");
        if (data.adminEmailStatus === "skipped") parts.push("✉️ Email admin (belum dikonfigurasi)");
        if (data.waStatus    === "sent")    parts.push("💬 WA OK");
        if (data.waStatus    === "skipped") parts.push("💬 WA (belum dikonfigurasi)");
        toast.success(parts.join(" · "));
        await refreshLogs();
      }

    } catch {
      toast.error("Gagal menghubungi server. Coba lagi.");
    } finally {
      setIsSendingReminder(false);
    }
  };

  const keteranganColor: Record<PaymentRow["keterangan"], string> = {
    Investor: "bg-orange-100 text-orange-700 border-orange-200",
    Broker:   "bg-blue-100 text-blue-700 border-blue-200",
    Trader:   "bg-purple-100 text-purple-700 border-purple-200",
    MinBun:   "bg-green-100 text-green-700 border-green-200",
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
          Pantau dan catat pelunasan bagi hasil per transaksi ·{" "}
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

      {/* Task list */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <CardTitle className="text-base">Daftar Tugas Bagi Hasil</CardTitle>

            {/* Tab toggle */}
            <div className="flex items-center rounded-lg border border-border bg-muted/40 p-0.5 text-sm">
              <button
                onClick={() => setShowDone(false)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                  !showDone
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Pending
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  !showDone ? "bg-orange-100 text-orange-700" : "bg-muted text-muted-foreground"
                }`}>
                  {summary.totalTasks - summary.doneTasks}
                </span>
              </button>
              <button
                onClick={() => setShowDone(true)}
                className={`px-3 py-1.5 rounded-md font-medium transition-colors whitespace-nowrap ${
                  showDone
                    ? "bg-background shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Selesai
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  showDone ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                }`}>
                  {summary.doneTasks}
                </span>
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-3">
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-3">
              <CheckCircle2 className="h-10 w-10" />
              <p className="text-sm">Tidak ada transaksi yang memerlukan bagi hasil</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Nama</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Keterangan</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Nama Bank</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">No Rekening</th>
                    <th className="text-right  py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Jumlah</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">No TRX</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Tanggal</th>
                    <th className="text-center py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.flatMap((task) => {
                    const checks  = task.trx.bagiHasilChecks ?? {};
                    const isRowDone = (r: PaymentRow) => {
                      const k = `${task.trx.id}__${r.checkKey}`;
                      return !!checks[r.checkKey] || doneKeys.has(k);
                    };
                    const visibleRows = showDone
                      ? task.rows.filter(isRowDone)
                      : task.rows.filter((r) => !isRowDone(r));
                    if (visibleRows.length === 0) return [];

                    const rowCount = visibleRows.length;
                    const statusBadge = task.trx.status === "bermasalah"
                      ? <Badge variant="destructive" className="text-xs py-0.5">Bermasalah</Badge>
                      : <Badge className="text-xs py-0.5 bg-green-600 hover:bg-green-600">Selesai</Badge>;

                    const rowEls = visibleRows.map((pr, idx) => {
                      const rowKey    = `${task.trx.id}__${pr.checkKey}`;
                      const rowDone   = !!checks[pr.checkKey] || doneKeys.has(rowKey);
                      const isLoading = toggling === rowKey;
                      const rowClass  = "transition-colors hover:bg-muted/40";

                      return (
                        <tr
                          key={rowKey}
                          className={`border-b border-border/50 ${rowClass} ${idx === 0 ? "border-t-2 border-t-border" : ""}`}
                        >
                          {/* Nama */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className={showDone ? "text-muted-foreground" : "font-medium"}>
                              {pr.nama}
                            </span>
                          </td>
                          {/* Keterangan */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${keteranganColor[pr.keterangan]}`}>
                                {pr.keterangan}
                              </span>
                              {pr.keterangan === "Investor" && pr.investorId && internalInvestorIds.has(pr.investorId) && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary">
                                  <ShieldCheck className="h-2.5 w-2.5" />Internal
                                </span>
                              )}
                            </div>
                          </td>
                          {/* Nama Bank */}
                          <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground">
                            {pr.bankName}
                          </td>
                          {/* No Rekening */}
                          <td className="py-2.5 px-3 whitespace-nowrap font-mono text-xs text-muted-foreground">
                            {pr.accountNumber}
                          </td>
                          {/* Jumlah */}
                          <td className="py-2.5 px-3 text-right whitespace-nowrap font-semibold">
                            {formatShort(pr.jumlah)}
                            <div className="text-[10px] font-normal text-muted-foreground">{formatCurrency(pr.jumlah)}</div>
                          </td>
                          {/* No TRX — hanya baris pertama, rowspan */}
                          {idx === 0 && (
                            <td
                              className="py-2.5 px-3 font-mono text-xs font-bold text-foreground whitespace-nowrap align-top border-l-[3px] border-l-border"
                              rowSpan={rowCount}
                            >
                              {task.trx.id}
                            </td>
                          )}
                          {/* Tanggal — hanya baris pertama, rowspan */}
                          {idx === 0 && (
                            <td className="py-2.5 px-3 whitespace-nowrap align-top" rowSpan={rowCount}>
                              {statusBadge}
                              <div className="text-[10px] text-muted-foreground mt-0.5">{formatDate(task.trx.date)}</div>
                            </td>
                          )}
                          {/* Status — ceklis + indikator bukti */}
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      disabled={isLoading}
                                      onClick={() => handleToggleRow(task.trx, pr)}
                                    >
                                      {rowDone
                                        ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                                        : <Circle className="h-5 w-5 text-muted-foreground" />
                                      }
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="text-xs">
                                    {rowDone
                                      ? "Tandai belum dibayar"
                                      : pr.keterangan === "MinBun"
                                        ? "Catat ke Arus Kas"
                                        : pr.keterangan === "Investor" && pr.investorId && internalInvestorIds.has(pr.investorId)
                                          ? "Catat profit internal ke Arus Kas"
                                          : "Tandai selesai"}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>

                            </div>
                          </td>
                        </tr>
                      );
                    });
                    const total = visibleRows.reduce((sum, r) => sum + r.jumlah, 0);
                    return [
                      ...rowEls,
                      <tr key={`${task.trx.id}__total`} className="bg-muted/20">
                        <td colSpan={4} className="py-1.5 px-3 text-right text-xs font-medium text-muted-foreground">Total</td>
                        <td className="py-1.5 px-3 text-right whitespace-nowrap font-bold text-sm">
                          {formatShort(total)}
                          <div className="text-[10px] font-normal text-muted-foreground">{formatCurrency(total)}</div>
                        </td>
                        <td colSpan={3} className="border-b-2 border-border" />
                      </tr>,
                    ];
                  })}
                  {/* Empty state per tab */}
                  {tasks.every((task) =>
                    task.rows.every((r) =>
                      showDone
                        ? !task.trx.bagiHasilChecks?.[r.checkKey]
                        : !!task.trx.bagiHasilChecks?.[r.checkKey]
                    )
                  ) && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                        {showDone
                          ? "Belum ada tugas yang selesai"
                          : <span className="flex flex-col items-center gap-2">
                              <CheckCircle2 className="h-8 w-8 text-green-500" />
                              Semua tugas sudah selesai 🎉
                            </span>
                        }
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Pengaturan Rekening Internal ── */}
      <Card>
        <CardHeader className="pb-3">
          <button
            onClick={() => setShowSettings((v) => !v)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Pengaturan Rekening Internal</CardTitle>
            </div>
            {showSettings
              ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground" />
            }
          </button>
          {!showSettings && (
            <p className="text-xs text-muted-foreground mt-1 ml-6">
              Kelola nama, bank, dan nomor rekening MinBun & Trader
            </p>
          )}
        </CardHeader>

        {showSettings && (
          <CardContent className="space-y-6">
            {/* MinBun */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-green-100 text-green-700 border-green-200">MinBun</span>
                Rekening MinBun
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nama</Label>
                  <Input
                    value={formMinbun.nama}
                    onChange={(e) => setFormMinbun((f) => ({ ...f, nama: e.target.value }))}
                    placeholder="MinBun / nama perusahaan"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nama Bank</Label>
                  <Input
                    value={formMinbun.bankName}
                    onChange={(e) => setFormMinbun((f) => ({ ...f, bankName: e.target.value }))}
                    placeholder="BCA / BRI / Mandiri..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nomor Rekening</Label>
                  <Input
                    value={formMinbun.accountNumber}
                    onChange={(e) => setFormMinbun((f) => ({ ...f, accountNumber: e.target.value }))}
                    placeholder="1234567890"
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button size="sm" onClick={handleSaveMinbun} disabled={isSavingMB}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {isSavingMB ? "Menyimpan…" : "Simpan MinBun"}
                </Button>
              </div>
            </div>

            <div className="border-t" />

            {/* Trader */}
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border bg-purple-100 text-purple-700 border-purple-200">Trader</span>
                Rekening Trader
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nama</Label>
                  <Input
                    value={formTrader.nama}
                    onChange={(e) => setFormTrader((f) => ({ ...f, nama: e.target.value }))}
                    placeholder="Trader / nama trader"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nama Bank</Label>
                  <Input
                    value={formTrader.bankName}
                    onChange={(e) => setFormTrader((f) => ({ ...f, bankName: e.target.value }))}
                    placeholder="BCA / BRI / Mandiri..."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nomor Rekening</Label>
                  <Input
                    value={formTrader.accountNumber}
                    onChange={(e) => setFormTrader((f) => ({ ...f, accountNumber: e.target.value }))}
                    placeholder="1234567890"
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button size="sm" onClick={handleSaveTrader} disabled={isSavingTR}>
                  <Save className="h-3.5 w-3.5 mr-1.5" />
                  {isSavingTR ? "Menyimpan…" : "Simpan Trader"}
                </Button>
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => void refreshLogs()}
                disabled={logsLoading}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${logsLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSendReminder()}
                disabled={isSendingReminder}
              >
                <Send className="h-3.5 w-3.5 mr-1.5" />
                {isSendingReminder ? "Mengirim…" : "Kirim Sekarang"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {logsLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Memuat…</div>
          ) : logs.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Belum ada riwayat pengiriman reminder
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left   py-2.5 px-4 font-medium text-muted-foreground whitespace-nowrap">Waktu Kirim</th>
                    <th className="text-left   py-2.5 px-4 font-medium text-muted-foreground whitespace-nowrap">Investor</th>
                    <th className="text-left   py-2.5 px-4 font-medium text-muted-foreground whitespace-nowrap">No. Referensi</th>
                    <th className="text-center py-2.5 px-4 font-medium text-muted-foreground whitespace-nowrap">Jenis</th>
                    <th className="text-center py-2.5 px-4 font-medium text-muted-foreground whitespace-nowrap">Email</th>
                    <th className="text-center py-2.5 px-4 font-medium text-muted-foreground whitespace-nowrap">WhatsApp</th>
                    <th className="text-left   py-2.5 px-4 font-medium text-muted-foreground whitespace-nowrap">Keterangan</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.slice(0, 50).map((log: ReminderLog) => {
                    const isNotif = log.triggeredBy === "notifikasi";
                    return (
                      <tr key={log.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 px-4 whitespace-nowrap text-muted-foreground text-xs">
                          {new Date(log.sentAt).toLocaleString("id-ID", {
                            day: "2-digit", month: "short", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </td>
                        <td className="py-2.5 px-4 font-medium whitespace-nowrap">{log.investorName}</td>
                        <td className="py-2.5 px-4 font-mono text-xs text-muted-foreground whitespace-nowrap">{log.mouCustomId}</td>
                        <td className="py-2.5 px-4 text-center">
                          {isNotif ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">
                              Bagi Hasil
                            </span>
                          ) : (
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              log.triggeredBy === "manual"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                                : "bg-muted text-muted-foreground"
                            }`}>
                              {log.triggeredBy === "manual" ? "Manual" : "Otomatis"}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <ChannelBadge status={log.emailStatus} icon={<Mail className="h-3 w-3" />} />
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <ChannelBadge status={log.waStatus} icon={<MessageCircle className="h-3 w-3" />} />
                        </td>
                        <td className="py-2.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                          {isNotif
                            ? `${log.keterangan}${log.jumlah > 0 ? ` · ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(log.jumlah)}` : ""}`
                            : log.mouCustomId
                          }
                          {log.errorMessage && (
                            <div className="text-red-500 text-[10px] mt-0.5 max-w-[200px] truncate" title={log.errorMessage}>
                              {log.errorMessage}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {logs.length > 50 && (
                <p className="text-xs text-muted-foreground text-center py-3">
                  Menampilkan 50 terbaru dari {logs.length} log
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog Konfirmasi Internal (investor internal & MinBun) ── */}
      <Dialog open={!!internalTarget} onOpenChange={(open) => { if (!open) setInternalTarget(null); }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {internalTarget?.keterangan === "MinBun"
                ? "Konfirmasi Bagi Hasil MinBun"
                : "Catat Profit Internal ke Arus Kas"}
            </DialogTitle>
            <DialogDescription>
              {internalTarget?.keterangan === "MinBun"
                ? <>Bagi hasil MinBun untuk TRX <strong>{internalTarget.trx.id}</strong> akan dicatat sebagai pemasukan di Arus Kas. Tidak diperlukan bukti transfer.</>
                : <>Profit TRX <strong>{internalTarget?.trx.id}</strong> untuk investor internal akan dicatat sebagai pemasukan (debet) di Arus Kas. Tidak diperlukan bukti transfer.</>
              }
            </DialogDescription>
          </DialogHeader>

          {internalTarget && (
            <div className="rounded-lg border bg-muted/30 p-3 space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">
                  {internalTarget.keterangan === "MinBun" ? "Penerima" : "Investor"}
                </span>
                <span className="font-medium">{internalTarget.row.nama}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Transaksi</span>
                <span className="font-mono text-xs font-medium">{internalTarget.trx.id}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-semibold">
                <span>{internalTarget.keterangan === "MinBun" ? "Bagi hasil dicatat" : "Profit dicatat"}</span>
                <span className="text-green-600">{formatCurrency(internalTarget.row.jumlah)}</span>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setInternalTarget(null)} disabled={isConfirmingInt}>
              Batal
            </Button>
            <Button onClick={() => void handleConfirmInternal()} disabled={isConfirmingInt}>
              {isConfirmingInt ? "Menyimpan…" : "Konfirmasi & Catat ke Kas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
