"use client";

import { useMemo, useRef } from "react";
import { useMou, type MoU } from "@/lib/mou-context";
import { useTransaksi, calcTransaksi } from "@/lib/transaksi-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Banknote, TrendingDown, Wallet, AlertCircle, Printer,
  CheckCircle2, Clock, Building2,
} from "lucide-react";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function formatDate(s: string) {
  if (!s) return "-";
  const d = new Date(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function addDays(dateStr: string, days: number): Date {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d;
}

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

type MouStatus = "pending" | "aktif" | "expired" | "nonaktif";

function getMouStatus(mou: MoU): MouStatus {
  if (mou.isTerminated) return "nonaktif";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const end = addDays(mou.date, mou.contractPeriod);
  if (end < today) return "expired";
  const isBackdate = new Date(mou.date) < today;
  if (!isBackdate && !mou.hasSignedDoc) return "pending";
  return "aktif";
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function ModalSummaryContent() {
  const { mous }      = useMou();
  const { transaksis } = useTransaksi();
  const printRef      = useRef<HTMLDivElement>(null);

  // Hanya PKS aktif
  const activeMous = useMemo(
    () => mous.filter((m) => getMouStatus(m) === "aktif"),
    [mous]
  );

  // Total modal yang harus ditransfer ke MinBun = Σ investmentAmount PKS aktif
  const totalModal = useMemo(
    () => activeMous.reduce((s, m) => s + m.investmentAmount, 0),
    [activeMous]
  );

  // Modal terpakai: Σ kebutuhanModal dari semua transaksi yang investornya punya PKS aktif
  const activeInvestorIds = useMemo(
    () => new Set(activeMous.map((m) => m.investorId)),
    [activeMous]
  );

  const modalTerpakai = useMemo(() => {
    return transaksis.reduce((sum, t) => {
      // Hitung porsi dari investor yang punya PKS aktif
      const c = calcTransaksi(t);
      if (c.totalInvestasi === 0) return sum + t.kebutuhanModal;
      const activeRatio = t.investorEntries
        .filter((e) => activeInvestorIds.has(e.investorId))
        .reduce((s, e) => s + e.nilaiInvestasi, 0) / c.totalInvestasi;
      return sum + t.kebutuhanModal * activeRatio;
    }, 0);
  }, [transaksis, activeInvestorIds]);

  const modalTersisa = totalModal - modalTerpakai;

  // Sudah transfer = ada buktiInvestor
  const sudahTransfer  = activeMous.filter((m) => m.buktiInvestor).length;
  const belumTransfer  = activeMous.length - sudahTransfer;

  // Nominal belum transfer
  const nominalBelum = activeMous
    .filter((m) => !m.buktiInvestor)
    .reduce((s, m) => s + m.investmentAmount, 0);

  // ── Print handler ──
  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`
      <html><head>
        <title>Ringkasan Modal ke MinBun</title>
        <style>
          * { font-family: Arial, sans-serif; font-size: 12px; }
          h1 { font-size: 16px; margin-bottom: 4px; }
          p  { margin: 2px 0; color: #555; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
          th { background: #f5f5f5; font-weight: 600; }
          .num { text-align: right; }
          .badge-aktif { color: #16a34a; font-weight: 600; }
          .summary { display: flex; gap: 24px; margin: 16px 0; }
          .summary-item { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 16px; }
          .summary-item .label { color: #6b7280; font-size: 11px; }
          .summary-item .value { font-size: 15px; font-weight: 700; margin-top: 2px; }
          .highlight { background: #eff6ff; border-color: #bfdbfe; }
          .urgent { color: #dc2626; }
          @media print { button { display: none; } }
        </style>
      </head><body>
        ${el.innerHTML}
      </body></html>
    `);
    w.document.close();
    w.print();
  };

  const today = new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ringkasan Modal ke MinBun</h1>
          <p className="text-muted-foreground">Nominal modal dari PKS aktif yang harus ditransfer kepada MinBun sebagai pengelola</p>
        </div>
        <Button variant="outline" onClick={handlePrint} className="shrink-0">
          <Printer className="w-4 h-4 mr-2" />
          Cetak / Export
        </Button>
      </div>

      {/* ── Konten yang bisa diprint ── */}
      <div ref={printRef} className="space-y-6">

        {/* Print header (hidden on screen) */}
        <div className="hidden print:block">
          <h1>Ringkasan Modal ke MinBun</h1>
          <p>Dicetak: {today}</p>
        </div>

        {/* ── KPI Cards ── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Total modal — highlight utama */}
          <Card className="sm:col-span-2 border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400 flex items-center gap-2">
                <Banknote className="h-4 w-4" />
                Total Modal Harus Ditransfer ke MinBun
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-700 dark:text-blue-300">{formatRp(totalModal)}</div>
              <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-1">
                dari {activeMous.length} PKS aktif
              </p>
            </CardContent>
          </Card>

          {/* Belum transfer */}
          <Card className={nominalBelum > 0 ? "border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4 text-orange-500" />
                Belum Ditransfer
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${nominalBelum > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"}`}>
                {formatRp(nominalBelum)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{belumTransfer} investor menunggu</p>
            </CardContent>
          </Card>

          {/* Sudah transfer */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Sudah Dikonfirmasi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {formatRp(totalModal - nominalBelum)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{sudahTransfer} investor</p>
            </CardContent>
          </Card>

          {/* Modal terpakai */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-muted-foreground" />
                Modal Terpakai (Transaksi)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatRp(modalTerpakai)}</div>
              <p className="text-xs text-muted-foreground mt-1">{transaksis.length} transaksi</p>
            </CardContent>
          </Card>

          {/* Saldo tersedia */}
          <Card className={modalTersisa < 0 ? "border-red-200 bg-red-50 dark:bg-red-950/20" : ""}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Wallet className="h-4 w-4 text-muted-foreground" />
                Saldo Modal Tersisa
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${modalTersisa < 0 ? "text-red-600" : "text-foreground"}`}>
                {formatRp(modalTersisa)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {modalTersisa < 0 ? "Modal kurang dari transaksi" : "Siap untuk transaksi berikutnya"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Alert jika ada modal belum transfer ── */}
        {nominalBelum > 0 && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-900">
            <AlertCircle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                {belumTransfer} investor belum mengkonfirmasi transfer
              </p>
              <p className="text-xs text-orange-600/80 dark:text-orange-400/70 mt-0.5">
                Total {formatRp(nominalBelum)} belum diterima. Pastikan bukti transfer sudah diupload di halaman PKS sebelum modal digunakan.
              </p>
            </div>
          </div>
        )}

        {/* ── Tabel rincian per PKS aktif ── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Rincian per PKS Aktif</CardTitle>
            <Badge variant="secondary">{activeMous.length} PKS</Badge>
          </CardHeader>
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
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">No. PKS</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Investor</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Mulai</th>
                      <th className="text-left py-3 px-4 font-medium text-muted-foreground">Berakhir</th>
                      <th className="text-right py-3 px-4 font-medium text-muted-foreground">Nominal Modal</th>
                      <th className="text-center py-3 px-4 font-medium text-muted-foreground">Status Transfer</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeMous.map((mou) => {
                      const endDate    = addDays(mou.date, mou.contractPeriod);
                      const sudah      = !!mou.buktiInvestor;
                      const daysLeft   = Math.ceil((endDate.getTime() - Date.now()) / 86400000);
                      const nearExpiry = daysLeft <= 14;
                      return (
                        <tr key={mou.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-4">
                            <span className="font-mono text-xs font-semibold">{mou.id}</span>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-medium">{mou.investorName}</p>
                            {mou.investorPhone && (
                              <p className="text-xs text-muted-foreground">{mou.investorPhone}</p>
                            )}
                          </td>
                          <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">
                            {formatDate(mou.date)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className={nearExpiry ? "text-orange-600 font-medium" : "text-muted-foreground"}>
                              {formatDate(endDate.toISOString().split("T")[0])}
                            </span>
                            {nearExpiry && (
                              <p className="text-[10px] text-orange-500">{daysLeft} hari lagi</p>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-semibold whitespace-nowrap">
                            {formatRp(mou.investmentAmount)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {sudah ? (
                              <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Terkonfirmasi
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 dark:bg-orange-950/30">
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
                      <td colSpan={4} className="py-3 px-4 font-semibold text-sm">
                        Total ({activeMous.length} PKS aktif)
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-lg text-blue-700 dark:text-blue-400 whitespace-nowrap">
                        {formatRp(totalModal)}
                      </td>
                      <td className="py-3 px-4 text-center text-xs text-muted-foreground">
                        {sudahTransfer}/{activeMous.length} terkonfirmasi
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Catatan ── */}
        <Card className="border-dashed">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-medium">Petunjuk Transfer Modal</p>
                <ol className="text-xs text-muted-foreground space-y-1 list-decimal list-inside">
                  <li>Transfer nominal sesuai PKS masing-masing ke rekening MinBun</li>
                  <li>Pastikan investor sudah mengupload bukti transfer di halaman PKS</li>
                  <li>MinBun akan mengalokasikan modal ke transaksi sesuai kebutuhan</li>
                  <li>Saldo modal tersisa dapat digunakan untuk transaksi berikutnya dalam periode PKS</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
