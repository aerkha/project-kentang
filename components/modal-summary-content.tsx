"use client";

import { useMemo, useRef } from "react";
import { useMou, type MoU } from "@/lib/mou-context";
import { useTransaksi, calcTransaksi } from "@/lib/transaksi-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Banknote, TrendingDown, Wallet, AlertCircle, Printer,
  CheckCircle2, Clock, Building2, ArrowDownLeft, ArrowUpRight,
  ReceiptText, Info,
} from "lucide-react";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function formatDate(s: string | Date) {
  if (!s) return "-";
  const d = typeof s === "string" ? new Date(s) : s;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function addDays(dateStr: string, days: number): Date {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d;
}

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n);
}

type MouStatus = "pending" | "aktif" | "expired" | "nonaktif";

function getMouStatus(mou: MoU): MouStatus {
  if (mou.isTerminated) return "nonaktif";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end   = addDays(mou.date, mou.contractPeriod);
  if (end < today) return "expired";
  const isBackdate = new Date(mou.date) < today;
  if (!isBackdate && !mou.hasSignedDoc) return "pending";
  return "aktif";
}

// ─────────────────────────────────────────────
// Tipe untuk data per-PKS
// ─────────────────────────────────────────────

interface MouModalRow {
  mou:             MoU;
  endDate:         Date;
  daysLeft:        number;
  // Arus masuk: investor → MinBun
  modalDiterima:   number;   // investmentAmount jika sudah ada buktiInvestor, else 0
  sudahKonfirmasi: boolean;
  // Arus keluar: MinBun → Owner
  modalDisalurkan: number;   // Σ porsi kebutuhanModal dari transaksi investor ini
  // Profit
  profitBersih:    number;   // Σ profit yang bisa diatribusikan ke investor ini
  // Kewajiban Owner → MinBun di akhir PKS
  bagianPP2:       number;   // MinBun's share of profit
  bagianPK:        number;   // Investor's share of profit (MinBun teruskan ke investor)
  kewajiban:       number;   // investmentAmount + bagianPP2 + bagianPK
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function ModalSummaryContent() {
  const { mous }       = useMou();
  const { transaksis } = useTransaksi();
  const printRef       = useRef<HTMLDivElement>(null);

  // Hanya PKS aktif
  const activeMous = useMemo(
    () => mous.filter((m) => getMouStatus(m) === "aktif"),
    [mous]
  );

  // Hitung data per-PKS
  const mouRows = useMemo<MouModalRow[]>(() => {
    return activeMous.map((mou) => {
      const endDate  = addDays(mou.date, mou.contractPeriod);
      const daysLeft = Math.ceil((endDate.getTime() - Date.now()) / 86400000);

      // Konfirmasi transfer investor → MinBun
      const sudahKonfirmasi = !!mou.buktiInvestor;
      const modalDiterima   = sudahKonfirmasi ? mou.investmentAmount : 0;

      // Modal disalurkan MinBun → Owner: dari transaksi yang melibatkan investor ini
      let modalDisalurkan = 0;
      let profitBersih    = 0;

      transaksis.forEach((t) => {
        const entry = t.investorEntries.find((e) => e.investorId === mou.investorId);
        if (!entry) return;

        const c = calcTransaksi(t);
        // Porsi modal yang dipakai oleh investor ini untuk transaksi ini
        modalDisalurkan += entry.nilaiInvestasi;

        // Profit proporsional investor ini
        if (c.totalInvestasi > 0) {
          const ratio = entry.nilaiInvestasi / c.totalInvestasi;
          profitBersih += c.profit * ratio;
        }
      });

      // Kewajiban Owner → MinBun di akhir PKS
      // = modal pokok + bagian MinBun (PP2) + bagian investor (PK, diteruskan MinBun ke investor)
      // Owner hanya menikmati bagian PP1-nya sendiri
      const bagianPP2 = profitBersih > 0 ? profitBersih * (mou.bagiHasilPP2 / 100) : 0;
      const bagianPK  = profitBersih > 0 ? profitBersih * (mou.bagiHasilPK  / 100) : 0;
      const kewajiban = mou.investmentAmount + bagianPP2 + bagianPK;

      return {
        mou, endDate, daysLeft,
        modalDiterima, sudahKonfirmasi,
        modalDisalurkan, profitBersih,
        bagianPP2, bagianPK, kewajiban,
      };
    });
  }, [activeMous, transaksis]);

  // ── Agregat keseluruhan ──
  const totalModalMasuk      = mouRows.reduce((s, r) => s + r.mou.investmentAmount, 0);
  const totalTerkonfirmasi   = mouRows.reduce((s, r) => s + r.modalDiterima, 0);
  const totalBelumKonfirmasi = totalModalMasuk - totalTerkonfirmasi;
  const totalDisalurkan      = mouRows.reduce((s, r) => s + r.modalDisalurkan, 0);
  const totalSaldo           = totalTerkonfirmasi - totalDisalurkan;
  const totalKewajiban       = mouRows.reduce((s, r) => s + r.kewajiban, 0);
  const totalProfit          = mouRows.reduce((s, r) => s + r.profitBersih, 0);

  const jumlahBelumKonfirmasi = mouRows.filter((r) => !r.sudahKonfirmasi).length;

  // ── Print ──
  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head>
        <title>Ringkasan Modal - MinBun ERP</title>
        <style>
          * { font-family: Arial, sans-serif; font-size: 11px; box-sizing: border-box; }
          body { padding: 20px; }
          h1 { font-size: 15px; margin: 0 0 2px; }
          .sub { color: #666; font-size: 11px; margin-bottom: 16px; }
          .grid { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
          .kpi { border: 1px solid #ddd; border-radius: 6px; padding: 8px 12px; min-width: 140px; flex: 1; }
          .kpi-label { color: #777; font-size: 10px; margin-bottom: 2px; }
          .kpi-val { font-size: 14px; font-weight: 700; }
          .blue { color: #1d4ed8; } .green { color: #15803d; }
          .orange { color: #c2410c; } .red { color: #dc2626; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #ddd; padding: 5px 7px; }
          th { background: #f3f4f6; font-weight: 600; font-size: 10px; }
          td { font-size: 10px; }
          .r { text-align: right; } .c { text-align: center; }
          tfoot td { font-weight: 700; background: #eff6ff; }
          .alert { background: #fff7ed; border: 1px solid #fed7aa; border-radius: 6px;
                   padding: 8px 12px; margin-bottom: 12px; font-size: 10px; color: #9a3412; }
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

      {/* ════════════════════════════════════════════
          Konten yang bisa diprint
      ════════════════════════════════════════════ */}
      <div ref={printRef} className="space-y-8">

        {/* Print-only header */}
        <div className="hidden print:block">
          <h1>Pengelolaan Modal — MinBun ERP</h1>
          <p className="sub">Dicetak: {todayStr} · {activeMous.length} PKS aktif</p>
        </div>

        {/* ══ ALUR MODAL (diagram sederhana) ══ */}
        <div className="grid gap-3 sm:grid-cols-3">
          {/* 1. Investor → MinBun */}
          <Card className="border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-green-700 dark:text-green-400 flex items-center gap-1.5">
                <ArrowDownLeft className="h-3.5 w-3.5" />
                Modal Masuk ke MinBun
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-2xl font-bold text-green-700 dark:text-green-300">{formatRp(totalTerkonfirmasi)}</p>
              <p className="text-xs text-green-600/70">sudah terkonfirmasi</p>
              {totalBelumKonfirmasi > 0 && (
                <p className="text-xs text-orange-600 font-medium pt-1">
                  + {formatRp(totalBelumKonfirmasi)} menunggu konfirmasi
                </p>
              )}
            </CardContent>
          </Card>

          {/* 2. MinBun → Owner */}
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-blue-700 dark:text-blue-400 flex items-center gap-1.5">
                <ArrowUpRight className="h-3.5 w-3.5" />
                Modal Disalurkan ke Owner
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{formatRp(totalDisalurkan)}</p>
              <p className="text-xs text-blue-600/70">dipakai untuk transaksi</p>
              <p className="text-xs text-muted-foreground pt-1">
                Saldo di MinBun: <span className={`font-semibold ${totalSaldo < 0 ? "text-red-600" : "text-foreground"}`}>{formatRp(totalSaldo)}</span>
              </p>
            </CardContent>
          </Card>

          {/* 3. Owner → MinBun (kewajiban) */}
          <Card className="border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-purple-700 dark:text-purple-400 flex items-center gap-1.5">
                <ReceiptText className="h-3.5 w-3.5" />
                Kewajiban Owner ke MinBun
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{formatRp(totalKewajiban)}</p>
              <p className="text-xs text-purple-600/70">dikembalikan di akhir PKS</p>
              <p className="text-xs text-muted-foreground pt-1">
                Modal + PP2 + PK dari profit <span className="font-medium">{formatRp(totalProfit)}</span>
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Alert: investor belum konfirmasi ── */}
        {jumlahBelumKonfirmasi > 0 && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900">
            <AlertCircle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                {jumlahBelumKonfirmasi} investor belum mengkonfirmasi transfer ke MinBun
              </p>
              <p className="text-xs text-orange-600/80 dark:text-orange-400/70 mt-0.5">
                Total {formatRp(totalBelumKonfirmasi)} belum diterima MinBun.
                Upload bukti transfer di halaman PKS untuk mengkonfirmasi.
              </p>
            </div>
          </div>
        )}

        {/* ══ TABEL RINCIAN PER PKS ══ */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Rincian per PKS Aktif</h2>
            <Badge variant="secondary">{activeMous.length} PKS aktif</Badge>
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
                        <th className="text-left py-3 px-4 font-medium text-muted-foreground">Periode</th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                          <span className="text-green-700 dark:text-green-400">Modal Masuk</span>
                          <br /><span className="font-normal text-[10px]">Investor → MinBun</span>
                        </th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                          <span className="text-blue-700 dark:text-blue-400">Disalurkan</span>
                          <br /><span className="font-normal text-[10px]">MinBun → Owner</span>
                        </th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                          Profit
                          <br /><span className="font-normal text-[10px]">dari transaksi</span>
                        </th>
                        <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                          <span className="text-purple-700 dark:text-purple-400">Kewajiban Owner</span>
                          <br /><span className="font-normal text-[10px]">Modal + PP2 + PK</span>
                        </th>
                        <th className="text-center py-3 px-4 font-medium text-muted-foreground">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mouRows.map(({ mou, endDate, daysLeft, modalDiterima, sudahKonfirmasi,
                                     modalDisalurkan, profitBersih, bagianPP2, bagianPK, kewajiban }) => {
                        const nearExpiry = daysLeft <= 14;
                        const saldoMou   = modalDiterima - modalDisalurkan;
                        return (
                          <tr key={mou.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                            {/* PKS / Investor */}
                            <td className="py-3 px-4">
                              <p className="font-mono text-xs font-semibold text-muted-foreground">{mou.id}</p>
                              <p className="font-medium">{mou.investorName}</p>
                              {mou.investorPhone && (
                                <p className="text-xs text-muted-foreground">{mou.investorPhone}</p>
                              )}
                            </td>

                            {/* Periode */}
                            <td className="py-3 px-4 whitespace-nowrap">
                              <p className="text-xs text-muted-foreground">{formatDate(mou.date)}</p>
                              <p className={`text-xs font-medium ${nearExpiry ? "text-orange-600" : "text-muted-foreground"}`}>
                                s/d {formatDate(endDate)}
                              </p>
                              {nearExpiry && (
                                <p className="text-[10px] text-orange-500">{daysLeft} hari lagi</p>
                              )}
                            </td>

                            {/* Modal masuk (Investor → MinBun) */}
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <p className="font-semibold">{formatRp(mou.investmentAmount)}</p>
                              {!sudahKonfirmasi && (
                                <p className="text-[10px] text-orange-500">belum terkonfirmasi</p>
                              )}
                              {sudahKonfirmasi && (
                                <p className="text-[10px] text-green-600">✓ terkonfirmasi</p>
                              )}
                            </td>

                            {/* Disalurkan (MinBun → Owner) */}
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <p className="font-semibold text-blue-700 dark:text-blue-400">{formatRp(modalDisalurkan)}</p>
                              <p className={`text-[10px] ${saldoMou < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                                sisa {formatRp(saldoMou)}
                              </p>
                            </td>

                            {/* Profit */}
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <p className={`font-semibold ${profitBersih >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {formatRp(profitBersih)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">
                                PP1 {mou.bagiHasilPP1}% · PP2 {mou.bagiHasilPP2}% · PK {mou.bagiHasilPK}%
                              </p>
                            </td>

                            {/* Kewajiban Owner → MinBun */}
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <p className="font-bold text-purple-700 dark:text-purple-400">{formatRp(kewajiban)}</p>
                              <p className="text-[10px] text-muted-foreground">
                                Modal + {formatRp(bagianPP2)} + {formatRp(bagianPK)}
                              </p>
                            </td>

                            {/* Status */}
                            <td className="py-3 px-4 text-center">
                              {sudahKonfirmasi ? (
                                <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30 text-[10px]">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Modal diterima
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 dark:bg-orange-950/30 text-[10px]">
                                  <Clock className="h-3 w-3 mr-1" />
                                  Menunggu
                                </Badge>
                              )}
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
                          {formatRp(totalModalMasuk)}
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
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ══ PENJELASAN KEWAJIBAN ══ */}
        <Card className="border-dashed">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-medium">Cara hitung kewajiban pengembalian Owner</p>
                <div className="text-xs text-muted-foreground space-y-1">
                  <p>Di akhir masa PKS, Owner mengembalikan ke MinBun:</p>
                  <div className="ml-3 space-y-0.5 font-mono bg-muted/40 rounded p-2">
                    <p>Kewajiban  =  Modal Pokok  +  (PP2% × Profit)  +  (PK% × Profit)</p>
                    <p className="text-[10px] text-muted-foreground/70">
                      MinBun meneruskan porsi PK ke investor · Owner menikmati PP1% dari profit
                    </p>
                  </div>
                  <p className="pt-1">
                    <strong>Kolom "Disalurkan"</strong> = total modal yang sudah MinBun kirimkan ke Owner untuk keperluan transaksi.{" "}
                    <strong>Saldo</strong> = sisa modal yang masih ada di MinBun dan belum disalurkan.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
