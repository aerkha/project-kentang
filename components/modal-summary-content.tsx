"use client";

import { useMemo, useRef, useState } from "react";
import { useMou, getMouStatus, type MoU, type MouStatus } from "@/lib/mou-context";
import { useTransaksi, calcTransaksi } from "@/lib/transaksi-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Printer, ArrowDownLeft, ArrowUpRight, ReceiptText, Building2, CalendarRange, X,
} from "lucide-react";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function formatDate(s: string | Date) {
  if (!s) return "-";
  const d = typeof s === "string"
    ? (() => { const [y, m, dd] = s.slice(0, 10).split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)); })()
    : s;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function addDays(dateStr: string, days: number): Date {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days));
}

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n);
}

// ─────────────────────────────────────────────
// Tipe data per-PKS
// ─────────────────────────────────────────────

interface MouModalRow {
  mou:             MoU;
  endDate:         Date;
  daysLeft:        number;
  modalDisalurkan: number;
  profitBersih:    number;
  bagianPP2:       number;
  bagianPK:        number;
  kewajiban:       number;
  trxCount:        number;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function ModalSummaryContent() {
  const { mous }       = useMou();
  const { transaksis } = useTransaksi();
  const printRef       = useRef<HTMLDivElement>(null);

  // ── Date range state ──
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");

  const hasFilter = dateFrom || dateTo;

  const resetFilter = () => { setDateFrom(""); setDateTo(""); };

  // Transaksi yang lolos filter
  const filteredTransaksis = useMemo(() => {
    if (!hasFilter) return transaksis;
    return transaksis.filter((t) => {
      if (dateFrom && t.date < dateFrom) return false;
      if (dateTo   && t.date > dateTo)   return false;
      return true;
    });
  }, [transaksis, dateFrom, dateTo, hasFilter]);

  const activeMous = useMemo(
    () => mous.filter((m) => getMouStatus(m) === "aktif"),
    [mous]
  );

  // Hitung data per-PKS (menggunakan transaksi yang sudah difilter)
  const mouRows = useMemo<MouModalRow[]>(() => {
    // Hitung "hari ini" dalam kalender WIB (UTC+7) agar tidak off-by-one di sekitar tengah malam
    const nowWib  = Date.now() + 7 * 3600 * 1000;
    const todayMs = nowWib - (nowWib % 86400000);

    return activeMous.map((mou) => {
      const endDate  = addDays(mou.date, mou.contractPeriod);
      const daysLeft = Math.round((endDate.getTime() - todayMs) / 86400000);

      // Batas periode PKS ini untuk filtering transaksi — [mouStart, mouEnd)
      const [my, mm, md] = mou.date.slice(0, 10).split("-").map(Number);
      const mouStart = Date.UTC(my, mm - 1, md);
      const mouEnd   = mouStart + mou.contractPeriod * 86_400_000;

      let modalDisalurkan = 0;
      let profitBersih    = 0;
      let trxCount        = 0;

      filteredTransaksis.forEach((t) => {
        // Hanya transaksi dalam periode PKS ini — batas akhir eksklusif [start, end),
        // agar PKS lama & perpanjangan tidak dobel-hitung
        const [ty, tm, td] = t.date.slice(0, 10).split("-").map(Number);
        const tDate = Date.UTC(ty, tm - 1, td);
        if (tDate < mouStart || tDate >= mouEnd) return;

        const entry = t.investorEntries.find((e) => e.investorId === mou.investorId);
        if (!entry) return;
        const c = calcTransaksi(t);
        modalDisalurkan += entry.nilaiInvestasi;
        if (c.totalInvestasi > 0) {
          profitBersih += c.profit * (entry.nilaiInvestasi / c.totalInvestasi);
        }
        trxCount++;
      });

      const bagianPP2 = profitBersih > 0 ? profitBersih * (mou.bagiHasilPP2 / 100) : 0;
      const bagianPK  = profitBersih > 0 ? profitBersih * (mou.bagiHasilPK  / 100) : 0;
      const kewajiban = mou.investmentAmount + bagianPP2 + bagianPK;

      return { mou, endDate, daysLeft, modalDisalurkan, profitBersih, bagianPP2, bagianPK, kewajiban, trxCount };
    });
  }, [activeMous, filteredTransaksis]);

  // Agregat
  const totalModal      = mouRows.reduce((s, r) => s + r.mou.investmentAmount, 0);
  const totalDisalurkan = mouRows.reduce((s, r) => s + r.modalDisalurkan, 0);
  const totalSaldo      = totalModal - totalDisalurkan;
  const totalKewajiban  = mouRows.reduce((s, r) => s + r.kewajiban, 0);
  const totalProfit     = mouRows.reduce((s, r) => s + r.profitBersih, 0);

  // ── Print ──
  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head>
        <title>Pengelolaan Modal - MinBun ERP</title>
        <style>
          * { font-family: Arial, sans-serif; font-size: 11px; box-sizing: border-box; }
          body { padding: 20px; }
          h1 { font-size: 15px; margin: 0 0 2px; }
          .sub { color: #666; font-size: 11px; margin-bottom: 16px; }
          .grid { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
          .kpi { border: 1px solid #ddd; border-radius: 6px; padding: 8px 12px; min-width: 140px; flex: 1; }
          .kpi-label { color: #777; font-size: 10px; margin-bottom: 2px; }
          .kpi-val { font-size: 14px; font-weight: 700; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #ddd; padding: 5px 7px; }
          th { background: #f3f4f6; font-weight: 600; font-size: 10px; }
          td { font-size: 10px; }
          .r { text-align: right; }
          tfoot td { font-weight: 700; background: #eff6ff; }
          h2 { font-size: 12px; margin: 16px 0 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
          @media print { @page { margin: 15mm; } }
        </style>
      </head><body>${el.innerHTML}</body></html>
    `);
    w.document.close();
    w.print();
  };

  const todayStr = new Date().toLocaleDateString("id-ID", {
    day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pengelolaan Modal</h1>
          <p className="text-muted-foreground">
            Rekapitulasi alur modal dari investor → MinBun → Owner, dan kewajiban pengembalian Owner di akhir PKS
          </p>
        </div>
        <Button variant="outline" onClick={handlePrint} className="shrink-0">
          <Printer className="w-4 h-4 mr-2" />
          Cetak / Export
        </Button>
      </div>

      {/* ── Filter Date Range ── */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <CalendarRange className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block mb-1.5" />
            <div className="flex flex-col sm:flex-row gap-3 flex-1">
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs text-muted-foreground">Dari Tanggal</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  max={dateTo || undefined}
                />
              </div>
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs text-muted-foreground">Sampai Tanggal</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  min={dateFrom || undefined}
                />
              </div>
            </div>
            {hasFilter && (
              <Button variant="ghost" size="sm" onClick={resetFilter} className="shrink-0 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4 mr-1" />
                Reset
              </Button>
            )}
          </div>
          {hasFilter && (
            <p className="text-xs text-muted-foreground mt-2 ml-0 sm:ml-7">
              Menampilkan transaksi{dateFrom ? ` dari ${formatDate(dateFrom)}` : ""}
              {dateTo ? ` sampai ${formatDate(dateTo)}` : ""} ·{" "}
              <span className="font-medium">{filteredTransaksis.length} transaksi</span>
            </p>
          )}
        </CardContent>
      </Card>

      <div ref={printRef} className="space-y-8">

        {/* Print-only header */}
        <div className="hidden print:block">
          <h1>Pengelolaan Modal — MinBun ERP</h1>
          <p className="sub">
            Dicetak: {todayStr} · {activeMous.length} PKS aktif
            {hasFilter ? ` · Filter: ${dateFrom || "—"} s/d ${dateTo || "—"}` : ""}
          </p>
        </div>

        {/* ── 3 KPI Cards ── */}
        <div className="grid gap-3 sm:grid-cols-3">

          <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-green-700 dark:text-green-400 flex items-center gap-1.5">
                <ArrowDownLeft className="h-3.5 w-3.5" />
                Modal dari Investor ke MinBun
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">{formatRp(totalModal)}</p>
              <p className="text-xs text-green-600/70">{activeMous.length} PKS aktif</p>
            </CardContent>
          </Card>

          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                <ArrowUpRight className="h-3.5 w-3.5" />
                Disalurkan MinBun ke Owner
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{formatRp(totalDisalurkan)}</p>
              <p className="text-xs text-blue-600/70">
                {hasFilter ? `${filteredTransaksis.length} transaksi (filter aktif)` : "dipakai untuk transaksi"}
              </p>
              <p className="text-xs text-muted-foreground pt-1">
                Saldo di MinBun:{" "}
                <span className={`font-semibold ${totalSaldo < 0 ? "text-red-600" : "text-foreground"}`}>
                  {formatRp(totalSaldo)}
                </span>
              </p>
            </CardContent>
          </Card>

          <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-purple-700 dark:text-purple-400 flex items-center gap-1.5">
                <ReceiptText className="h-3.5 w-3.5" />
                Kewajiban Owner ke MinBun
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{formatRp(totalKewajiban)}</p>
              <p className="text-xs text-purple-600/70">
                {hasFilter ? "berdasarkan periode filter" : "dikembalikan di akhir PKS"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Tabel per PKS ── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Rincian per PKS Aktif</h2>
            <div className="flex items-center gap-2">
              {hasFilter && (
                <Badge variant="outline" className="text-xs">
                  <CalendarRange className="h-3 w-3 mr-1" />
                  Filter aktif
                </Badge>
              )}
              <Badge variant="secondary">{activeMous.length} PKS aktif</Badge>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              {activeMous.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-muted-foreground gap-2">
                  <Building2 className="h-10 w-10" />
                  <p className="text-sm">Tidak ada PKS aktif saat ini</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">PKS / Investor</th>
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Periode PKS</th>
                        <th className="text-right py-3 px-4 font-medium text-green-700 dark:text-green-400">Modal Investor</th>
                        <th className="text-right py-3 px-4 font-medium text-blue-700 dark:text-blue-400">
                          Disalurkan
                          {hasFilter && <span className="block text-[10px] font-normal text-muted-foreground">periode filter</span>}
                        </th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                          Profit
                          {hasFilter && <span className="block text-[10px] font-normal text-muted-foreground">periode filter</span>}
                        </th>
                        <th className="text-right py-3 px-4 font-medium text-purple-700 dark:text-purple-400">Kewajiban Owner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mouRows.map(({ mou, endDate, daysLeft, modalDisalurkan,
                                     profitBersih, bagianPP2, bagianPK, kewajiban, trxCount }) => {
                        const nearExpiry = daysLeft <= 14;
                        return (
                          <tr key={mou.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">

                            <td className="py-3 px-4">
                              <p className="font-mono text-xs font-semibold text-muted-foreground">{mou.id}</p>
                              <p className="font-medium">{mou.investorName}</p>
                            </td>

                            <td className="py-3 px-4 whitespace-nowrap">
                              <p className="text-xs text-muted-foreground">{formatDate(mou.date)}</p>
                              <p className={`text-xs font-medium ${nearExpiry ? "text-orange-600" : "text-muted-foreground"}`}>
                                s/d {formatDate(endDate)}
                              </p>
                              {nearExpiry && (
                                <p className="text-[10px] text-orange-500">{daysLeft} hari lagi</p>
                              )}
                            </td>

                            <td className="py-3 px-4 text-right whitespace-nowrap font-semibold">
                              {formatRp(mou.investmentAmount)}
                            </td>

                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <p className="font-semibold text-blue-700 dark:text-blue-400">{formatRp(modalDisalurkan)}</p>
                              {hasFilter && trxCount > 0 && (
                                <p className="text-[10px] text-muted-foreground">{trxCount} transaksi</p>
                              )}
                              {hasFilter && trxCount === 0 && (
                                <p className="text-[10px] text-muted-foreground">—</p>
                              )}
                            </td>

                            <td className={`py-3 px-4 text-right whitespace-nowrap font-semibold ${profitBersih >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {formatRp(profitBersih)}
                            </td>

                            <td className="py-3 px-4 text-right whitespace-nowrap font-bold text-purple-700 dark:text-purple-400">
                              {formatRp(kewajiban)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/20">
                        <td colSpan={2} className="py-3 px-4 font-semibold text-sm">
                          Total ({activeMous.length} PKS aktif)
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-green-700 dark:text-green-400 whitespace-nowrap">
                          {formatRp(totalModal)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-blue-700 dark:text-blue-400 whitespace-nowrap">
                          {formatRp(totalDisalurkan)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold whitespace-nowrap">
                          {formatRp(totalProfit)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-purple-700 dark:text-purple-400 whitespace-nowrap">
                          {formatRp(totalKewajiban)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
