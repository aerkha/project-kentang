"use client";

import { useMemo, useState, useEffect } from "react";
import { toast } from "sonner";
import { useMou, type MoU } from "@/lib/mou-context";
import { useTransaksi, calcTransaksi, type Transaksi } from "@/lib/transaksi-context";
import { useInvestors } from "@/lib/investors-context";
import { useBrokers } from "@/lib/brokers-context";
import { usePengeluaran } from "@/lib/pengeluaran-context";
import { useSettings } from "@/lib/settings-context";
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
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function formatDate(s: string) {
  if (!s) return "-";
  const d = new Date(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
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

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86_400_000);
}

// ── Kalkulasi bagi hasil per PKS ─────────────────────────────────────────────

function calcBagiHasil(mou: MoU, transaksis: Transaksi[]) {
  const mouStart = new Date(mou.date).getTime();
  const mouEnd   = mouStart + mou.contractPeriod * 86_400_000;
  const pkPct    = (mou.bagiHasilPK ?? 35) / 100;

  let investor = 0, trader = 0, minbun = 0, broker = 0;

  transaksis.forEach((t) => {
    const tDate = new Date(t.date).getTime();
    if (tDate < mouStart || tDate > mouEnd) return;

    const entry = t.investorEntries.find((e) => e.investorId === mou.investorId);
    if (!entry) return;

    const calc = calcTransaksi(t);
    if (calc.totalInvestasi === 0) return;

    const ratio  = entry.nilaiInvestasi / calc.totalInvestasi;
    const profit = calc.profit * ratio;

    const allZero   = entry.pctTrader === 0 && entry.pctMinBun === 0 && entry.pctBrokerI === 0 && entry.pctBrokerII === 0;
    const hasBroker = !!entry.investorBrokerName;
    const pT  = allZero ? 10                   : entry.pctTrader;
    const pM  = allZero ? (hasBroker ? 0 : 5)  : entry.pctMinBun;
    const pBI = allZero ? (hasBroker ? 5 : 0)  : entry.pctBrokerI;
    const pBII= allZero ? 0                    : entry.pctBrokerII;

    investor += profit * pkPct;
    trader   += profit * pT    / 100;
    minbun   += profit * pM    / 100;
    broker   += profit * (pBI + pBII) / 100;
  });

  return { investor, trader, minbun, broker };
}

// ── Tipe baris tabel ─────────────────────────────────────────────────────────

type PaymentRow = {
  nama:          string;
  keterangan:    "Investor" | "Broker" | "Trader" | "MinBun";
  bankName:      string;
  accountNumber: string;
  jumlah:        number;
};

// ── Component ─────────────────────────────────────────────────────────────────

export function ReminderContent() {
  const { mous, updateMou }              = useMou();
  const { transaksis }                   = useTransaksi();
  const { investors }                    = useInvestors();
  const { brokers }                      = useBrokers();
  const { addPengeluaran }               = usePengeluaran();
  const { minbun, trader, updateMinbun, updateTrader } = useSettings();
  const [toggling, setToggling]          = useState<string | null>(null);

  // ── State form pengaturan rekening internal ──
  const [showSettings, setShowSettings]  = useState(false);
  const [isSavingMB,   setIsSavingMB]   = useState(false);
  const [isSavingTR,   setIsSavingTR]   = useState(false);
  const [formMinbun,   setFormMinbun]   = useState({ nama: minbun.nama, bankName: minbun.bankName, accountNumber: minbun.accountNumber });
  const [formTrader,   setFormTrader]   = useState({ nama: trader.nama, bankName: trader.bankName, accountNumber: trader.accountNumber });

  // Sync form jika context baru load dari PocketBase
  useEffect(() => {
    setFormMinbun({ nama: minbun.nama, bankName: minbun.bankName, accountNumber: minbun.accountNumber });
  }, [minbun.nama, minbun.bankName, minbun.accountNumber]);
  useEffect(() => {
    setFormTrader({ nama: trader.nama, bankName: trader.bankName, accountNumber: trader.accountNumber });
  }, [trader.nama, trader.bankName, trader.accountNumber]);

  // Hanya PKS yang aktif (tidak terminated, belum expired)
  const tasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return mous
      .filter((m) => {
        if (m.isTerminated) return false;
        const end = new Date(addDays(m.date, m.contractPeriod));
        return end >= today;
      })
      .map((mou) => {
        const endDateStr = addDays(mou.date, mou.contractPeriod);
        const bh         = calcBagiHasil(mou, transaksis);
        const inv        = investors.find((i) => i.id === mou.investorId);
        const brokerData = brokers.find((b) => b.name === inv?.brokerName);

        // Susun baris pembayaran per penerima (skip jika jumlah = 0)
        const rows: PaymentRow[] = [];

        if (bh.investor > 0)
          rows.push({
            nama:          mou.investorName,
            keterangan:    "Investor",
            bankName:      inv?.bankName      || "—",
            accountNumber: inv?.accountNumber || "—",
            jumlah:        bh.investor,
          });

        if (bh.broker > 0)
          rows.push({
            nama:          inv?.brokerName    || "Broker",
            keterangan:    "Broker",
            bankName:      brokerData?.bankName      || "—",
            accountNumber: brokerData?.accountNumber || "—",
            jumlah:        bh.broker,
          });

        if (bh.trader > 0)
          rows.push({
            nama:          trader.nama || "Trader",
            keterangan:    "Trader",
            bankName:      trader.bankName      || "—",
            accountNumber: trader.accountNumber || "—",
            jumlah:        bh.trader,
          });

        if (bh.minbun > 0)
          rows.push({
            nama:          minbun.nama || "MinBun",
            keterangan:    "MinBun",
            bankName:      minbun.bankName      || "—",
            accountNumber: minbun.accountNumber || "—",
            jumlah:        bh.minbun,
          });

        return { mou, endDateStr, bh, rows };
      })
      .sort((a, b) => a.endDateStr.localeCompare(b.endDateStr));
  }, [mous, transaksis, investors, brokers, minbun, trader]);

  // Ringkasan — jumlah per penerima yang BELUM dicentang (per baris, bukan per PKS)
  const summary = useMemo(() => {
    let investor = 0, trader = 0, minbun = 0, broker = 0;
    tasks.forEach((t) => {
      t.rows.forEach((r) => {
        if (t.mou.bagiHasilChecks?.[r.keterangan]) return; // sudah dicentang, skip
        if (r.keterangan === "Investor") investor += r.jumlah;
        else if (r.keterangan === "Trader") trader  += r.jumlah;
        else if (r.keterangan === "MinBun") minbun  += r.jumlah;
        else if (r.keterangan === "Broker") broker  += r.jumlah;
      });
    });
    return {
      investor, trader, minbun, broker,
      totalTasks: tasks.reduce((s, t) => s + t.rows.length, 0),
      doneTasks:  tasks.reduce((s, t) =>
        s + t.rows.filter((r) => !!t.mou.bagiHasilChecks?.[r.keterangan]).length, 0
      ),
    };
  }, [tasks]);

  const handleToggleRow = async (mou: MoU, keterangan: string, row: PaymentRow) => {
    const key       = `${mou.id}__${keterangan}`;
    const checks    = { ...(mou.bagiHasilChecks ?? {}) };
    const willCheck = !checks[keterangan];
    checks[keterangan] = willCheck;

    // PKS dianggap selesai jika semua baris sudah dicentang
    const task    = tasks.find((t) => t.mou.id === mou.id);
    const allDone = task ? task.rows.every((r) => checks[r.keterangan]) : false;

    setToggling(key);
    try {
      // 1. Simpan status ceklis ke PocketBase
      await updateMou(mou.id, {
        bagiHasilChecks: checks,
        bagiHasilDone:   allDone,
      });

      if (willCheck) {
        // 2. Catat ke cashflow — MinBun = debet (pemasukan), lainnya = kredit (pengeluaran)
        const today = new Date().toISOString().slice(0, 10);
        try {
          await addPengeluaran({
            date:      today,
            deskripsi: `Bagi Hasil ${row.nama} (${keterangan}) - PKS ${mou.id}`,
            debet:     keterangan === "MinBun" ? row.jumlah : 0,
            kredit:    keterangan === "MinBun" ? 0 : row.jumlah,
            catatan:   `Auto dari Reminder PKS ${mou.id}`,
          });
          toast.success(`${keterangan} — ${row.nama} dicatat di Cash Flow`);
        } catch {
          // Ceklis sudah tersimpan, tapi cashflow gagal — beri tahu user
          toast.error(
            `Ceklis tersimpan, tapi gagal mencatat ${keterangan} di Cash Flow. Tambahkan manual.`
          );
        }
      } else {
        // Un-check: ceklis dibatalkan, entri cashflow TIDAK dihapus otomatis
        toast.info(`${keterangan} ditandai belum dibayar. Entri Cash Flow tidak dihapus otomatis.`);
      }
    } catch {
      toast.error("Gagal menyimpan perubahan. Coba lagi.");
    } finally {
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
          Pantau dan catat pelunasan bagi hasil per PKS ·{" "}
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
        <CardHeader>
          <CardTitle className="text-base">Daftar Tugas Bagi Hasil</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-3">
              <CheckCircle2 className="h-10 w-10" />
              <p className="text-sm">Tidak ada PKS aktif</p>
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
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">No PKS</th>
                    <th className="text-left   py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Deadline</th>
                    <th className="text-center py-2.5 px-3 font-medium text-muted-foreground whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const days     = daysUntil(task.endDateStr);
                    const allDone  = task.rows.every((r) => task.mou.bagiHasilChecks?.[r.keterangan]);
                    const rowCount = task.rows.length || 1;

                    let dayLabel: React.ReactNode;
                    if (allDone) {
                      dayLabel = <span className="text-muted-foreground text-xs">Selesai</span>;
                    } else if (days < 0) {
                      dayLabel = <Badge variant="destructive" className="text-xs py-0.5">Lewat {Math.abs(days)} hari</Badge>;
                    } else if (days === 0) {
                      dayLabel = <Badge className="text-xs py-0.5 bg-red-500 hover:bg-red-500">Hari ini</Badge>;
                    } else if (days <= 7) {
                      dayLabel = <Badge className="text-xs py-0.5 bg-orange-500 hover:bg-orange-500">{days} hari lagi</Badge>;
                    } else if (days <= 30) {
                      dayLabel = <Badge variant="outline" className="text-xs py-0.5 text-yellow-600 border-yellow-400">{days} hari lagi</Badge>;
                    } else {
                      dayLabel = <span className="text-sm text-muted-foreground">{days} hari lagi</span>;
                    }

                    return task.rows.map((pr, idx) => {
                      const rowDone   = !!task.mou.bagiHasilChecks?.[pr.keterangan];
                      const rowKey    = `${task.mou.id}__${pr.keterangan}`;
                      const isLoading = toggling === rowKey;
                      const rowClass  = `transition-colors ${rowDone ? "opacity-50" : "hover:bg-muted/40"}`;

                      return (
                        <tr
                          key={rowKey}
                          className={`border-b border-border/50 ${rowClass} ${idx === 0 ? "border-t-2 border-t-border" : ""}`}
                        >
                          {/* Nama */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className={rowDone ? "line-through text-muted-foreground" : "font-medium"}>
                              {pr.nama}
                            </span>
                          </td>
                          {/* Keterangan */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${keteranganColor[pr.keterangan]}`}>
                              {pr.keterangan}
                            </span>
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
                          {/* No PKS — hanya baris pertama, rowspan */}
                          {idx === 0 && (
                            <td
                              className="py-2.5 px-3 font-mono text-xs font-bold text-foreground whitespace-nowrap align-top border-l-[3px] border-l-border"
                              rowSpan={rowCount}
                            >
                              {task.mou.id}
                            </td>
                          )}
                          {/* Deadline — hanya baris pertama, rowspan */}
                          {idx === 0 && (
                            <td className="py-2.5 px-3 whitespace-nowrap align-top" rowSpan={rowCount}>
                              {dayLabel}
                              <div className="text-[10px] text-muted-foreground mt-0.5">{formatDate(task.endDateStr)}</div>
                            </td>
                          )}
                          {/* Status — 1 ceklis per baris */}
                          <td className="py-2.5 px-3 text-center">
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    disabled={isLoading}
                                    onClick={() => handleToggleRow(task.mou, pr.keterangan, pr)}
                                  >
                                    {rowDone
                                      ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                                      : <Circle className="h-5 w-5 text-muted-foreground" />
                                    }
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="left" className="text-xs">
                                  {rowDone ? "Tandai belum dibayar" : "Tandai sudah dibayar"}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </td>
                        </tr>
                      );
                    });
                  })}
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
    </div>
  );
}
