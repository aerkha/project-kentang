"use client";

import { useMemo, useState } from "react";
import { useMou, type MoU } from "@/lib/mou-context";
import { useTransaksi, calcTransaksi, type Transaksi } from "@/lib/transaksi-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Bell,
  CheckCircle2,
  Circle,
  Users,
  TrendingUp,
  Wallet,
  Briefcase,
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

// ── Component ─────────────────────────────────────────────────────────────────

export function ReminderContent() {
  const { mous, updateMou } = useMou();
  const { transaksis }      = useTransaksi();
  const [toggling, setToggling] = useState<string | null>(null);

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
        return { mou, endDateStr, ...bh };
      })
      .sort((a, b) => a.endDateStr.localeCompare(b.endDateStr));
  }, [mous, transaksis]);

  // Ringkasan — hanya dari tugas yang belum selesai
  const summary = useMemo(() => {
    const pending = tasks.filter((t) => !t.mou.bagiHasilDone);
    return {
      investor: pending.reduce((s, t) => s + t.investor, 0),
      trader:   pending.reduce((s, t) => s + t.trader,   0),
      minbun:   pending.reduce((s, t) => s + t.minbun,   0),
      broker:   pending.reduce((s, t) => s + t.broker,   0),
      totalTasks:   tasks.length,
      doneTasks:    tasks.filter((t) => t.mou.bagiHasilDone).length,
    };
  }, [tasks]);

  const handleToggle = async (mou: MoU) => {
    setToggling(mou.id);
    try {
      await updateMou(mou.id, { bagiHasilDone: !mou.bagiHasilDone });
    } finally {
      setToggling(null);
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
          Pantau dan catat pelunasan bagi hasil per PKS ·{" "}
          <span className="font-medium">{summary.doneTasks}/{summary.totalTasks}</span> selesai
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
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">Investor</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">No PKS</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">Deadline</th>
                    <th className="text-right py-3 px-4 font-medium text-orange-500 whitespace-nowrap">Investor</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">Trader</th>
                    <th className="text-right py-3 px-4 font-medium text-green-600 whitespace-nowrap">MinBun</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">Broker</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => {
                    const done     = !!task.mou.bagiHasilDone;
                    const days     = daysUntil(task.endDateStr);
                    const isLoading = toggling === task.mou.id;

                    let dayLabel: React.ReactNode;
                    if (done) {
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

                    return (
                      <tr
                        key={task.mou.id}
                        className={`border-b border-border/50 transition-colors ${
                          done ? "opacity-50" : "hover:bg-muted/40"
                        }`}
                      >
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className={done ? "line-through text-muted-foreground" : "font-medium"}>
                            {task.mou.investorName}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {task.mou.id}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {dayLabel}
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {formatDate(task.endDateStr)}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap font-medium text-orange-500">
                          {formatShort(task.investor)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap text-muted-foreground">
                          {formatShort(task.trader)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap font-medium text-green-600">
                          {formatShort(task.minbun)}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap text-muted-foreground">
                          {formatShort(task.broker)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <TooltipProvider delayDuration={200}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={isLoading}
                                  onClick={() => handleToggle(task.mou)}
                                >
                                  {done
                                    ? <CheckCircle2 className="h-5 w-5 text-green-500" />
                                    : <Circle className="h-5 w-5 text-muted-foreground" />
                                  }
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="text-xs">
                                {done ? "Tandai belum selesai" : "Tandai sudah selesai"}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
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
