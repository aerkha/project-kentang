"use client";

import { useMemo, useState } from "react";
import { useInvestors } from "@/lib/investors-context";
import { useBrokers } from "@/lib/brokers-context";
import { useMou } from "@/lib/mou-context";
import { useTransaksi, calcTransaksi, type Transaksi } from "@/lib/transaksi-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { id as localeId } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import {
  DollarSign,
  Users,
  Briefcase,
  TrendingUp,
  TrendingDown,
  Filter,
  X,
  CalendarDays,
  Receipt,
  Wallet,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Legend,
  LabelList,
} from "recharts";


// ─── Rekap helpers ────────────────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function pct(n: number) { return `${n.toFixed(2)}%`; }

function formatDate(s: string) {
  if (!s) return "-";
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
}

import type { MoU } from "@/lib/mou-context";

function calcMouDistribution(
  mou: MoU,
  transaksis: Transaksi[],
) {
  const [sy, sm, sd] = mou.date.slice(0, 10).split("-").map(Number);
  const mouStart = Date.UTC(sy, sm - 1, sd);
  const mouEnd   = mouStart + mou.contractPeriod * 86_400_000;

  const pp1Pct = (mou.bagiHasilPP1 ?? 50) / 100;
  const pkPct  = (mou.bagiHasilPK  ?? 35) / 100;

  let totalProfit = 0;
  let owner = 0, hasanah = 0, investor = 0, trader = 0, minbun = 0, brokerI = 0, brokerII = 0;

  // Pct efektif dari entry pertama yang ditemukan — untuk ditampilkan di tabel
  let effectivePct = { pctTrader: 10, pctMinBun: 5, pctBrokerI: 0, pctBrokerII: 0 };
  let pctSet = false;

  transaksis.forEach((t) => {
    const [ty, tm, td] = (t.date as string).slice(0, 10).split("-").map(Number);
    const tDate = Date.UTC(ty, tm - 1, td);
    if (tDate < mouStart || tDate > mouEnd) return;

    const entry = t.investorEntries.find((e) => e.investorId === mou.investorId);
    if (!entry) return;

    const calc = calcTransaksi(t);
    if (calc.totalInvestasi === 0) return;

    const ratio  = entry.nilaiInvestasi / calc.totalInvestasi;
    const profit = calc.profit * ratio;
    totalProfit += profit;

    // Jika data lama semua pct=0, fallback ke default berdasarkan ada/tidaknya broker
    const allZero  = entry.pctTrader === 0 && entry.pctMinBun === 0 && entry.pctBrokerI === 0 && entry.pctBrokerII === 0;
    const hasBroker = !!entry.investorBrokerName;
    const ePctTrader  = allZero ? 10                    : entry.pctTrader;
    const ePctMinBun  = allZero ? (hasBroker ? 0 : 5)  : entry.pctMinBun;
    const ePctBrokerI = allZero ? (hasBroker ? 5 : 0)  : entry.pctBrokerI;
    const ePctBrokerII= allZero ? 0                     : entry.pctBrokerII;

    if (!pctSet) {
      effectivePct = { pctTrader: ePctTrader, pctMinBun: ePctMinBun, pctBrokerI: ePctBrokerI, pctBrokerII: ePctBrokerII };
      pctSet = true;
    }

    owner    += profit * pp1Pct;
    investor += profit * pkPct;
    trader   += profit * ePctTrader   / 100;
    minbun   += profit * ePctMinBun   / 100;
    brokerI  += profit * ePctBrokerI  / 100;
    brokerII += profit * ePctBrokerII / 100;
  });

  hasanah = investor + trader + minbun + brokerI + brokerII;

  return { totalProfit, owner, hasanah, investor, trader, minbun, brokerI, brokerII, effectivePct };
}
const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function monthLabel(ym: string) {
  const [year, month] = ym.split("-");
  return `${MONTHS[parseInt(month) - 1]} ${year}`;
}

function formatShort(n: number) {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(0)}Jt`;
  if (Math.abs(n) >= 1_000)         return `${(n / 1_000).toFixed(0)}Rb`;
  return String(n);
}

function formatShortFloat(n: number) {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(2)}Jt`;
  if (Math.abs(n) >= 1_000)         return `${(n / 1_000).toFixed(2)}Rb`;
  return n.toFixed(2);
}

export function DashboardContent() {
  const { investors }   = useInvestors();
  const { brokers }     = useBrokers();
  const { mous }        = useMou();
  const { transaksis }  = useTransaksi();

  // ── Portfolio metrics (hanya investor aktif) ──
  const metrics = useMemo(() => {
    const activeInvestors = investors.filter((inv) => inv.isActive !== false);
    const totalInvestors  = activeInvestors.length;
    const totalInvestment = activeInvestors.reduce((sum, inv) => sum + inv.investmentAmount, 0);
    const avgInvestment   = totalInvestors > 0 ? totalInvestment / totalInvestors : 0;
    const totalBrokers    = brokers.length;
    return { totalInvestors, totalInvestment, avgInvestment, totalBrokers };
  }, [investors, brokers]);


  // ── Chart: investasi per broker — stacked per investor ──
  const brokerStackedData = useMemo(() => {
    const COLORS = [
      "#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6",
      "#06b6d4","#f97316","#84cc16","#ec4899","#6366f1",
      "#14b8a6","#eab308","#a855f7","#22c55e","#0ea5e9",
    ];

    const active = investors.filter((inv) => inv.isActive !== false && inv.investmentAmount > 0);

    // Urutan broker: dari daftar broker, lalu "Tanpa Broker"
    const brokerOrder: string[] = [];
    brokers.forEach((b) => {
      if (active.some((inv) => inv.brokerName === b.name)) brokerOrder.push(b.name);
    });
    if (active.some((inv) => !inv.brokerName?.trim())) brokerOrder.push("Tanpa Broker");

    // Satu baris per broker, kolom = investor ID
    const data = brokerOrder.map((brokerName) => {
      const row: Record<string, string | number> = { broker: brokerName };
      active
        .filter((inv) => (inv.brokerName?.trim() || "Tanpa Broker") === brokerName)
        .forEach((inv) => { row[inv.id] = inv.investmentAmount; });
      return row;
    });

    // Map ID → nama untuk tooltip & legend
    const idToName = new Map(active.map((inv) => [inv.id, inv.name]));
    const investorIds = active.map((inv) => inv.id);
    const colorMap   = new Map(active.map((inv, i) => [inv.id, COLORS[i % COLORS.length]]));

    return { data, investorIds, idToName, colorMap };
  }, [investors, brokers]);

  // ── Chart: kontribusi investasi per investor aktif ──
  const investorContribData = useMemo(() => {
    const active        = investors.filter((inv) => inv.isActive !== false && inv.investmentAmount > 0);
    const withBroker    = active.filter((inv) => !!inv.brokerName?.trim());
    const withoutBroker = active.filter((inv) => !inv.brokerName?.trim());
    const total         = active.reduce((s, inv) => s + inv.investmentAmount, 0);
    const GAP_VAL       = total > 0 ? total * 0.025 : 1;

    const BROKER_COLORS    = ["#2d6a4f", "#40916c", "#52b788", "#74c69d", "#95d5b2", "#b7e4c7"];
    const NO_BROKER_COLORS = ["#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#ec4899", "#f97316"];

    type Group = "broker" | "noBroker" | "gap";
    const entries: Array<{ name: string; value: number; group: Group; color: string }> = [
      ...withBroker.map((inv, i) => ({
        name: inv.name, value: inv.investmentAmount,
        group: "broker" as Group, color: BROKER_COLORS[i % BROKER_COLORS.length],
      })),
      ...(withBroker.length > 0 && withoutBroker.length > 0
        ? [{ name: "__gap__", value: GAP_VAL, group: "gap" as Group, color: "transparent" }]
        : []),
      ...withoutBroker.map((inv, i) => ({
        name: inv.name, value: inv.investmentAmount,
        group: "noBroker" as Group, color: NO_BROKER_COLORS[i % NO_BROKER_COLORS.length],
      })),
    ];

    return {
      entries, total,
      hasBroker:   withBroker.length > 0,
      hasNoBroker: withoutBroker.length > 0,
      activeCount: active.length,
    };
  }, [investors]);

  // ── Filter state ──
  const [dateRange,      setDateRange]      = useState<DateRange | undefined>(undefined);
  const [filterBroker,   setFilterBroker]   = useState<string>("");
  const [filterInvestor, setFilterInvestor] = useState<string>("");

  // ── Available brokers from investor data ──
  const availableBrokers = useMemo(() => {
    const set = new Set<string>();
    investors.forEach((inv) => {
      set.add(inv.brokerName?.trim() || "Tanpa Broker");
    });
    const sorted = brokers
      .map((b) => b.name)
      .filter((n) => set.has(n));
    if (set.has("Tanpa Broker")) sorted.push("Tanpa Broker");
    return sorted;
  }, [investors, brokers]);

  // ── Investors filtered by selected broker (for investor dropdown) ──
  const investorOptions = useMemo(() => {
    return investors.filter((inv) => {
      if (!filterBroker) return true;
      return (inv.brokerName?.trim() || "Tanpa Broker") === filterBroker;
    });
  }, [investors, filterBroker]);

  // ── Filtered collections ──
  const fromStr = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "";
  const toStr   = dateRange?.to   ? format(dateRange.to,   "yyyy-MM-dd") : "";

  const filteredTransaksis = useMemo(
    () => transaksis.filter((t) => {
      if (fromStr && t.date < fromStr) return false;
      if (toStr   && t.date > toStr)   return false;
      if (filterInvestor && !t.investorEntries.some((e) => e.investorId === filterInvestor)) return false;
      if (filterBroker && !filterInvestor) {
        const hasMatch = t.investorEntries.some((e) => {
          const inv = investors.find((i) => i.id === e.investorId);
          return (inv?.brokerName?.trim() || "Tanpa Broker") === filterBroker;
        });
        if (!hasMatch) return false;
      }
      return true;
    }),
    [transaksis, fromStr, toStr, filterInvestor, filterBroker, investors],
  );

  const filteredMousByPeriod = useMemo(
    () => mous.filter((m) => {
      if (fromStr && m.date < fromStr) return false;
      if (toStr   && m.date > toStr)   return false;
      if (filterInvestor && m.investorId !== filterInvestor) return false;
      if (filterBroker && !filterInvestor) {
        const inv = investors.find((i) => i.id === m.investorId);
        if ((inv?.brokerName?.trim() || "Tanpa Broker") !== filterBroker) return false;
      }
      return true;
    }),
    [mous, fromStr, toStr, filterInvestor, filterBroker, investors],
  );

  // ── Investors filtered for detail table ──
  const filteredInvestors = useMemo(() => {
    return investors.filter((inv) => {
      if (filterInvestor && inv.id !== filterInvestor) return false;
      if (filterBroker && (inv.brokerName?.trim() || "Tanpa Broker") !== filterBroker) return false;
      return true;
    });
  }, [investors, filterInvestor, filterBroker]);

  // ── Rekap filter state ──
  const [showFilter, setShowFilter] = useState(false);
  const [filterNama, setFilterNama] = useState("");
  const [filterPks,  setFilterPks]  = useState("");

  // ── Rekap data (per MoU, difilter periode) — dideklarasikan lebih awal
  // karena periodMetrics bergantung padanya
  const rekapData = useMemo(() => {
    return filteredMousByPeriod
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((mou, idx) => {
        const dist       = calcMouDistribution(mou, transaksis);
        const modal      = mou.investmentAmount;
        const usiaHari   = Math.max(0, Math.floor((Date.now() - new Date(mou.date).getTime()) / 86_400_000));
        const usiaBulan  = Math.floor(usiaHari / 30);
        const endDateStr = addDays(mou.date, mou.contractPeriod);
        const roi = (v: number) => (modal > 0 ? (v / modal) * 100 : 0);
        return {
          no: idx + 1, mou, endDateStr, usiaBulan, ...dist,
          roiTotal:          roi(dist.totalProfit),
          roiTraderInvestor: roi(dist.trader + dist.investor),
          roiInvestor:       roi(dist.investor),
          roiTrader:         roi(dist.trader),
          roiMinbun:         roi(dist.minbun),
        };
      });
  }, [filteredMousByPeriod, transaksis]);

  // ── Period summary metrics ──
  const periodMetrics = useMemo(() => {
    let income = 0, profit = 0;
    filteredTransaksis.forEach((t) => {
      const c = calcTransaksi(t);
      income += c.income;
      profit += c.profit;
    });
    // Bagi hasil dihitung per-PKS dari rekapData agar mengikuti skema masing-masing PKS
    const bagHasil = rekapData.reduce((s, r) => s + r.investor, 0);

    // Bagi hasil Trader, MinBun, Broker — langsung dari pct per entry transaksi
    let bagHasilTrader = 0, bagHasilMinbun = 0, bagHasilBroker = 0, grossProfitMinbun = 0;
    filteredTransaksis.forEach((t) => {
      const calc = calcTransaksi(t);
      if (calc.totalInvestasi === 0) return;
      t.investorEntries.forEach((e) => {
        const ratio     = e.nilaiInvestasi / calc.totalInvestasi;
        const profit    = calc.profit * ratio;
        const allZero   = e.pctTrader === 0 && e.pctMinBun === 0 && e.pctBrokerI === 0 && e.pctBrokerII === 0;
        const hasBroker = !!e.investorBrokerName;
        const pT  = allZero ? 10                   : e.pctTrader;
        const pM  = allZero ? (hasBroker ? 0 : 5)  : e.pctMinBun;
        const pBI = allZero ? (hasBroker ? 5 : 0)  : e.pctBrokerI;
        const pBII= allZero ? 0                    : e.pctBrokerII;
        bagHasilTrader += profit * pT   / 100;
        bagHasilMinbun += profit * pM   / 100;
        bagHasilBroker += profit * (pBI + pBII) / 100;
        grossProfitMinbun += profit * (pT + pM + pBI + pBII) / 100;
      });
    });
    let periodLabel = "Semua Periode";
    if (dateRange?.from && dateRange?.to) {
      periodLabel = `${format(dateRange.from, "d MMM yyyy", { locale: localeId })} – ${format(dateRange.to, "d MMM yyyy", { locale: localeId })}`;
    } else if (dateRange?.from) {
      periodLabel = `Mulai ${format(dateRange.from, "d MMM yyyy", { locale: localeId })}`;
    } else if (dateRange?.to) {
      periodLabel = `Sampai ${format(dateRange.to, "d MMM yyyy", { locale: localeId })}`;
    }
    return {
      income, profit, bagHasil, grossProfitMinbun, bagHasilTrader, bagHasilMinbun, bagHasilBroker,
      trxCount:   filteredTransaksis.length,
      mouCount:   filteredMousByPeriod.length,
      periodLabel,
      isFiltered: !!(dateRange?.from || dateRange?.to || filterBroker || filterInvestor),
    };
  }, [filteredTransaksis, filteredMousByPeriod, rekapData, dateRange, filterBroker, filterInvestor]);

  // ── Chart: modal per bulan stacked by keterangan ──
  const modalByKeteranganData = useMemo(() => {
    const COLORS = [
      "#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6",
      "#06b6d4","#f97316","#84cc16","#ec4899","#6366f1",
      "#14b8a6","#eab308","#a855f7","#22c55e","#0ea5e9",
    ];

    const monthMap = new Map<string, Record<string, number>>();
    const labelSet = new Set<string>();

    filteredMousByPeriod.forEach((m) => {
      const ym    = m.date.slice(0, 7);
      const label = m.keterangan?.trim() || "Tanpa Keterangan";
      labelSet.add(label);
      if (!monthMap.has(ym)) monthMap.set(ym, {});
      const row = monthMap.get(ym)!;
      row[label] = (row[label] ?? 0) + m.investmentAmount;
    });

    const data = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ym, row]) => ({ month: monthLabel(ym), ...row }));

    const labels   = Array.from(labelSet);
    const colorMap = new Map(labels.map((l, i) => [l, COLORS[i % COLORS.length]]));

    return { data, labels, colorMap };
  }, [filteredMousByPeriod]);

  // ── Chart: investasi masuk per bulan (dari MoU, terfilter) ──
  const monthlyMouData = useMemo(() => {
    const map = new Map<string, { month: string; investment: number; count: number }>();
    filteredMousByPeriod.forEach((m) => {
      const ym    = m.date.slice(0, 7);
      const label = monthLabel(ym);
      if (!map.has(ym)) map.set(ym, { month: label, investment: 0, count: 0 });
      const e = map.get(ym)!;
      e.investment += m.investmentAmount;
      e.count      += 1;
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [filteredMousByPeriod]);

  // ── Chart: PnL per bulan (dari Transaksi, terfilter) ──
  // Stacked bar: cost (bawah) + profit (atas) = total income (tinggi bar)
  // profit di-clamp ke 0 untuk display agar stack tidak rusak saat rugi;
  // nilai aktual tetap disimpan di actualProfit untuk tooltip.
  const monthlyPnlData = useMemo(() => {
    const map = new Map<string, {
      month: string;
      income: number;
      profit: number;      // display: max(0, profit) — untuk stack
      cost: number;        // display: income - displayProfit
      actualProfit: number; // nilai asli untuk tooltip
    }>();
    filteredTransaksis.forEach((t) => {
      const c            = calcTransaksi(t);
      const ym           = t.date.slice(0, 7);
      const label        = monthLabel(ym);
      if (!map.has(ym)) map.set(ym, { month: label, income: 0, profit: 0, cost: 0, actualProfit: 0 });
      const e            = map.get(ym)!;
      const displayProfit = Math.max(0, c.profit);
      e.income       += c.income;
      e.actualProfit += c.profit;
      e.profit       += displayProfit;
      e.cost         += Math.max(0, c.income - displayProfit);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [filteredTransaksis]);

  const filteredRekap = useMemo(() => {
    return rekapData.filter((row) => {
      if (filterNama && !row.mou.investorName.toLowerCase().includes(filterNama.toLowerCase())) return false;
      if (filterPks  && !row.mou.id.toLowerCase().includes(filterPks.toLowerCase()))             return false;
      return true;
    });
  }, [rekapData, filterNama, filterPks]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const tooltipStyle = {
    backgroundColor: "hsl(var(--card))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "8px",
    fontSize: "12px",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard Analitik</h1>
        <p className="text-muted-foreground">Monitor kinerja investasi dan portofolio</p>
      </div>

      {/* ── Filter ── */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground shrink-0">
          <Filter className="h-4 w-4" />
          <span>Filter</span>
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
          {/* Date range picker */}
          <Popover>
            <PopoverTrigger asChild>
              <button className={`inline-flex items-center gap-1.5 h-8 px-3 text-sm rounded-md border transition-colors whitespace-nowrap ${
                dateRange?.from
                  ? "border-primary/50 bg-primary/5 text-foreground"
                  : "border-input bg-background text-muted-foreground hover:bg-accent"
              }`}>
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                {dateRange?.from
                  ? dateRange.to
                    ? `${format(dateRange.from, "d MMM yy")} – ${format(dateRange.to, "d MMM yy")}`
                    : format(dateRange.from, "d MMM yyyy")
                  : "Semua Periode"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                captionLayout="dropdown"
              />
              {dateRange?.from && (
                <div className="border-t px-3 py-2 flex justify-end">
                  <button
                    onClick={() => setDateRange(undefined)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Hapus filter tanggal
                  </button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <Select
            value={filterBroker || "__all"}
            onValueChange={(v) => {
              setFilterBroker(v === "__all" ? "" : v);
              setFilterInvestor("");
            }}
          >
            <SelectTrigger className="w-[140px] h-8 text-sm">
              <SelectValue placeholder="Semua Broker" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Semua Broker</SelectItem>
              {availableBrokers.map((b) => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filterInvestor || "__all"}
            onValueChange={(v) => setFilterInvestor(v === "__all" ? "" : v)}
          >
            <SelectTrigger className="w-[160px] h-8 text-sm">
              <SelectValue placeholder="Semua Investor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Semua Investor</SelectItem>
              {investorOptions.map((inv) => (
                <SelectItem key={inv.id} value={inv.id}>{inv.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {periodMetrics.isFiltered && (
            <button
              onClick={() => { setDateRange(undefined); setFilterBroker(""); setFilterInvestor(""); }}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
        </div>

        <span className={`ml-auto shrink-0 text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
          periodMetrics.isFiltered
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground"
        }`}>
          {periodMetrics.periodLabel}
        </span>
      </div>

      {/* ── Ringkasan Portofolio ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Investor</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalInvestors}</div>
            <p className="text-xs text-muted-foreground">investor aktif</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Jumlah Broker</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.totalBrokers}</div>
            <p className="text-xs text-muted-foreground">broker terdaftar</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Investasi</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.totalInvestment)}</div>
            <p className="text-xs text-muted-foreground">dari investor aktif</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rata-rata Investasi</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(metrics.avgInvestment)}</div>
            <p className="text-xs text-muted-foreground">per investor</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Ringkasan Periode ── */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          Kinerja {periodMetrics.periodLabel}
        </p>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className={periodMetrics.isFiltered ? "border-primary/30" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Transaksi</CardTitle>
              <Receipt className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{periodMetrics.trxCount}</div>
              <p className="text-xs text-muted-foreground">pengiriman tercatat</p>
            </CardContent>
          </Card>

          <Card className={periodMetrics.isFiltered ? "border-primary/30" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">PKS</CardTitle>
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{periodMetrics.mouCount}</div>
              <p className="text-xs text-muted-foreground">perjanjian kerjasama</p>
            </CardContent>
          </Card>

          <Card className={periodMetrics.isFiltered ? "border-primary/30" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Income</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatShort(periodMetrics.income)}</div>
              <p className="text-xs text-muted-foreground">{formatCurrency(periodMetrics.income)}</p>
            </CardContent>
          </Card>

          <Card className={periodMetrics.isFiltered ? "border-primary/30" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
              {periodMetrics.profit >= 0
                ? <TrendingUp className="h-4 w-4 text-green-500" />
                : <TrendingDown className="h-4 w-4 text-red-500" />}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${periodMetrics.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatShort(periodMetrics.profit)}
              </div>
              <p className="text-xs text-muted-foreground">{formatCurrency(periodMetrics.profit)}</p>
            </CardContent>
          </Card>

          <Card className={periodMetrics.isFiltered ? "border-primary/30" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bagi Hasil Investor</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">
                {formatShort(periodMetrics.bagHasil)}
              </div>
              <p className="text-xs text-muted-foreground">{formatCurrency(periodMetrics.bagHasil)}</p>
            </CardContent>
          </Card>

          <Card className={periodMetrics.isFiltered ? "border-primary/30" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gross Profit MinBun</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${periodMetrics.grossProfitMinbun >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatShort(periodMetrics.grossProfitMinbun)}
              </div>
              <p className="text-xs text-muted-foreground">{formatCurrency(periodMetrics.grossProfitMinbun)}</p>
            </CardContent>
          </Card>

          <Card className={`md:col-span-2 ${periodMetrics.isFiltered ? "border-primary/30" : ""}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Bagi Hasil MinBun</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center divide-x divide-border">
                <div className="flex-1 pr-4">
                  <p className="text-xs text-muted-foreground mb-1">Trader</p>
                  <p className="text-xl font-bold">{formatShort(periodMetrics.bagHasilTrader)}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(periodMetrics.bagHasilTrader)}</p>
                </div>
                <div className="flex-1 px-4">
                  <p className="text-xs text-muted-foreground mb-1">MinBun</p>
                  <p className="text-xl font-bold text-green-600">{formatShort(periodMetrics.bagHasilMinbun)}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(periodMetrics.bagHasilMinbun)}</p>
                </div>
                <div className="flex-1 pl-4">
                  <p className="text-xs text-muted-foreground mb-1">Broker</p>
                  <p className="text-xl font-bold">{formatShort(periodMetrics.bagHasilBroker)}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(periodMetrics.bagHasilBroker)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Chart: Investasi Masuk per Bulan + PnL per Bulan ── */}
      {(monthlyMouData.length > 0 || monthlyPnlData.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">

          {/* Investasi masuk per bulan */}
          {monthlyMouData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Investasi Masuk per Bulan</CardTitle>
                <CardDescription>
                  Total nilai dan jumlah PKS
                  {periodMetrics.isFiltered && ` · ${periodMetrics.periodLabel}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={monthlyMouData}
                      margin={{ top: 20, right: 20, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis
                        tickFormatter={formatShort}
                        tick={{ fontSize: 11 }}
                        width={52}
                      />
                      <Tooltip
                        formatter={(value, name) =>
                          name === "investment"
                            ? [formatCurrency(value as number), "Total Investasi"]
                            : [value, "Jumlah MoU"]
                        }
                        contentStyle={tooltipStyle}
                        labelStyle={{ color: "hsl(var(--card-foreground))" }}
                        itemStyle={{ color: "#ffffff" }}
                      />
                      <Bar
                        dataKey="investment"
                        fill="hsl(var(--chart-1))"
                        radius={[4, 4, 0, 0]}
                        name="investment"
                      >
                        <LabelList
                          dataKey="count"
                          position="top"
                          formatter={(v: number) => `${v} MoU`}
                          style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* PnL per bulan — stacked bar */}
          {monthlyPnlData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>PnL per Bulan</CardTitle>
                <CardDescription>
                  Profit (hijau) adalah bagian dari Total Income (tinggi bar)
                  {periodMetrics.isFiltered && ` · ${periodMetrics.periodLabel}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={monthlyPnlData}
                      margin={{ top: 20, right: 20, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis
                        tickFormatter={formatShort}
                        tick={{ fontSize: 11 }}
                        width={52}
                      />
                      <Tooltip
                        formatter={(value, name, props) => {
                          if (name === "cost") {
                            return [formatCurrency(props.payload.income as number), "Total Income"];
                          }
                          if (name === "profit") {
                            return [formatCurrency(props.payload.actualProfit as number), "Profit"];
                          }
                          return [formatCurrency(value as number), name];
                        }}
                        contentStyle={tooltipStyle}
                        labelStyle={{ color: "hsl(var(--card-foreground))", fontWeight: 600 }}
                        itemStyle={{ color: "#000000" }}
                      />
                      <Legend
                        formatter={(value) =>
                          value === "cost" ? "Total Income" : value === "profit" ? "Profit" : value
                        }
                        wrapperStyle={{ fontSize: "11px" }}
                      />
                      {/* Biaya — segmen bawah (income − profit) */}
                      <Bar dataKey="cost" stackId="pnl" fill="#93c5fd" name="cost" radius={[0, 0, 0, 0]} />
                      {/* Profit — segmen atas */}
                      <Bar dataKey="profit" stackId="pnl" fill="#4ade80" name="profit" radius={[4, 4, 0, 0]}>
                        <LabelList
                          dataKey="income"
                          position="top"
                          formatter={(v: number) => formatShort(v)}
                          style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Chart: Modal per bulan by Keterangan ── */}
      {modalByKeteranganData.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Total Investasi per Bulan</CardTitle>
            <CardDescription>
              Total nilai investasi per bulan dan penggunaannya
              {periodMetrics.isFiltered && ` · ${periodMetrics.periodLabel}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={modalByKeteranganData.data}
                  margin={{ top: 20, right: 20, left: 8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis
                    tickFormatter={formatShort}
                    tick={{ fontSize: 11 }}
                    width={52}
                  />
                  <Tooltip
                    formatter={(value, name) => [formatCurrency(value as number), name as string]}
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: "hsl(var(--card-foreground))", fontWeight: 600 }}
                    itemStyle={{ color: "#ffffff" }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  {modalByKeteranganData.labels.map((label, i) => (
                    <Bar
                      key={label}
                      dataKey={label}
                      stackId="modal"
                      fill={modalByKeteranganData.colorMap.get(label)}
                      radius={i === modalByKeteranganData.labels.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      name={label}
                    >
                      {i === modalByKeteranganData.labels.length - 1 && (
                        <LabelList
                          valueAccessor={(entry: Record<string, number>) => {
                            const total = modalByKeteranganData.labels.reduce(
                              (s, l) => s + (entry[l] ?? 0), 0
                            );
                            return formatShort(total);
                          }}
                          position="top"
                          style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        />
                      )}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Chart: Per broker & kontribusi per investor ── */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Investasi per Broker</CardTitle>
            <CardDescription>Kontribusi tiap investor dalam setiap broker</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={brokerStackedData.data}
                  margin={{ top: 16, right: 20, left: 8, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="broker" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={formatShort} tick={{ fontSize: 11 }} width={52} />
                  <Tooltip
                    formatter={(value, id) => [
                      formatCurrency(value as number),
                      brokerStackedData.idToName.get(id as string) ?? id,
                    ]}
                    contentStyle={tooltipStyle}
                    labelStyle={{ color: "hsl(var(--card-foreground))", fontWeight: 600 }}
                    itemStyle={{ color: "#ffffff" }}
                  />
                  {brokerStackedData.investorIds.map((id, i) => (
                    <Bar
                      key={id}
                      dataKey={id}
                      stackId="b"
                      fill={brokerStackedData.colorMap.get(id)}
                      radius={i === brokerStackedData.investorIds.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      name={id}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Kontribusi Investasi per Investor</CardTitle>
            <CardDescription>
              Proporsi modal dari {investorContribData.activeCount} investor aktif —
              hijau = via broker, biru = langsung
            </CardDescription>
          </CardHeader>
          <CardContent>
            {investorContribData.activeCount === 0 ? (
              <div className="flex flex-col items-center justify-center h-[260px] text-muted-foreground gap-2">
                <Users className="h-10 w-10" />
                <p className="text-sm">Belum ada investor aktif</p>
              </div>
            ) : (
              <>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={investorContribData.entries}
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={96}
                        paddingAngle={2}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {investorContribData.entries.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.color}
                            stroke={entry.group === "gap" ? "none" : "white"}
                            strokeWidth={entry.group === "gap" ? 0 : 1}
                            style={{ outline: "none" }}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const entry = payload[0]?.payload as (typeof investorContribData.entries)[0];
                          if (!entry || entry.group === "gap") return null;
                          const share = investorContribData.total > 0
                            ? ((entry.value / investorContribData.total) * 100).toFixed(1)
                            : "0";
                          return (
                            <div style={tooltipStyle} className="px-3 py-2 space-y-0.5">
                              <p className="font-semibold text-sm">{entry.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {entry.group === "broker" ? "Via Broker" : "Langsung"}
                              </p>
                              <p className="text-sm font-bold">{formatCurrency(entry.value)}</p>
                              <p className="text-xs text-muted-foreground">{share}% dari total</p>
                            </div>
                          );
                        }}
                      />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </div>

                {/* Custom legend */}
                <div className="mt-3 space-y-2.5 border-t pt-3">
                  {investorContribData.hasBroker && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                        Via Broker
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {investorContribData.entries
                          .filter((e) => e.group === "broker")
                          .map((e) => (
                            <div key={e.name} className="flex items-center gap-1.5 text-xs">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: e.color }}
                              />
                              <span className="truncate max-w-[110px]">{e.name}</span>
                              <span className="text-muted-foreground tabular-nums">
                                {investorContribData.total > 0
                                  ? `${((e.value / investorContribData.total) * 100).toFixed(0)}%`
                                  : "—"}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                  {investorContribData.hasNoBroker && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                        Langsung (Tanpa Broker)
                      </p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {investorContribData.entries
                          .filter((e) => e.group === "noBroker")
                          .map((e) => (
                            <div key={e.name} className="flex items-center gap-1.5 text-xs">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: e.color }}
                              />
                              <span className="truncate max-w-[110px]">{e.name}</span>
                              <span className="text-muted-foreground tabular-nums">
                                {investorContribData.total > 0
                                  ? `${((e.value / investorContribData.total) * 100).toFixed(0)}%`
                                  : "—"}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Investor Table ── */}
      <Card>
        <CardHeader>
          <CardTitle>Detail Investor</CardTitle>
          <CardDescription>Daftar lengkap investor dan nilai investasi</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">ID</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Investor</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Broker</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">Pekerjaan</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">No HP</th>
                  <th className="text-right py-3 px-4 font-medium text-muted-foreground">Nilai Investasi</th>
                  <th className="text-center py-3 px-4 font-medium text-blue-600 dark:text-blue-400">Bagi Hasil (PK)</th>
                  <th className="text-left py-3 px-4 font-medium text-muted-foreground">No PKS Aktif</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvestors.map((investor) => {
                  // Cari PKS aktif investor ini (non-terminated, bukan expired, sudah ada signed doc)
                  const activeMou = mous
                    .filter((m) =>
                      m.investorId === investor.id &&
                      !m.isTerminated &&
                      m.hasSignedDoc,
                    )
                    .sort((a, b) => b.date.localeCompare(a.date))[0];

                  return (
                  <tr
                    key={investor.id}
                    className="border-b border-border/50 hover:bg-muted/50 transition-colors"
                  >
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{investor.id}</td>
                    <td className="py-3 px-4 font-medium">{investor.name}</td>
                    <td className="py-3 px-4 text-muted-foreground">{investor.brokerName}</td>
                    <td className="py-3 px-4 text-muted-foreground">{investor.occupation}</td>
                    <td className="py-3 px-4 text-muted-foreground">{investor.phone}</td>
                    <td className="py-3 px-4 text-right font-medium">
                      {formatCurrency(investor.investmentAmount)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {activeMou ? (
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          {activeMou.bagiHasilPK ?? 35}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                      {activeMou ? activeMou.id : <span className="text-muted-foreground/50">—</span>}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* ══ Rekap Investasi per MoU ══ */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Rekap Investasi per PKS</CardTitle>
              <CardDescription>
                Distribusi profit berdasarkan transaksi dalam periode setiap PKS
                {periodMetrics.isFiltered && ` · MoU mulai ${periodMetrics.periodLabel}`}
              </CardDescription>
            </div>
            <button
              onClick={() => setShowFilter((v) => !v)}
              className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm hover:bg-accent transition-colors"
            >
              <Filter className="h-4 w-4" />
              {showFilter ? "Sembunyikan Filter" : "Filter Kolom"}
            </button>
          </div>

          {showFilter && (
            <div className="mt-3 flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[180px] space-y-1">
                <Label className="text-xs">Nama Investor</Label>
                <Input
                  placeholder="Cari nama investor..."
                  value={filterNama}
                  onChange={(e) => setFilterNama(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div className="w-44 space-y-1">
                <Label className="text-xs">No PKS (MoU)</Label>
                <Input
                  placeholder="MOU-0001"
                  value={filterPks}
                  onChange={(e) => setFilterPks(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              {(filterNama || filterPks) && (
                <button
                  onClick={() => { setFilterNama(""); setFilterPks(""); }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md hover:bg-accent transition-colors"
                >
                  <X className="h-4 w-4" />Reset
                </button>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          {mous.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <Briefcase className="h-10 w-10" />
              <p className="text-sm">Belum ada MoU — tambahkan di halaman Perjanjian Kerjasama</p>
            </div>
          ) : filteredRekap.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <Filter className="h-10 w-10" />
              <p className="text-sm">Tidak ada data sesuai filter</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-center py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">No</th>
                    <th className="text-left   py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">Nama Investor</th>
                    <th className="text-center py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">Periode (hari)</th>
                    <th className="text-right  py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">Modal</th>
                    <th className="text-left   py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">Start</th>
                    <th className="text-left   py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">End</th>
                    <th className="text-left   py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">No PKS</th>
                    <th className="text-center py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">Keterangan</th>
                    <th className="text-right  py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">Total Profit</th>
                    <th className="text-right  py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">Owner (PP I)</th>
                    <th className="text-right  py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">HASANAH</th>
                    <th className="text-right  py-2.5 px-2.5 font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">Investor (PK)</th>
                    <th className="text-right  py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">Trader</th>
                    <th className="text-right  py-2.5 px-2.5 font-medium text-green-700 dark:text-green-400 whitespace-nowrap">MinBun (PP II)</th>
                    <th className="text-right  py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">Broker I</th>
                    <th className="text-right  py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">Broker II</th>
                    <th className="text-right  py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">ROI Total</th>
                    <th className="text-right  py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">ROI Trader+Inv</th>
                    <th className="text-right  py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">ROI Investor</th>
                    <th className="text-right  py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">ROI Trader</th>
                    <th className="text-right  py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">ROI MinBun</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRekap.map((row) => (
                    <tr key={row.mou.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-2.5 text-center text-muted-foreground">{row.no}</td>
                      <td className="py-2.5 px-2.5 font-medium whitespace-nowrap">{row.mou.investorName}</td>
                      <td className="py-2.5 px-2.5 text-center text-muted-foreground">{row.mou.contractPeriod}</td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap">{formatShort(row.mou.investmentAmount)}</td>
                      <td className="py-2.5 px-2.5 whitespace-nowrap text-muted-foreground">{formatDate(row.mou.date)}</td>
                      <td className="py-2.5 px-2.5 whitespace-nowrap text-muted-foreground">{formatDate(row.endDateStr)}</td>
                      <td className="py-2.5 px-2.5 font-mono text-muted-foreground whitespace-nowrap">{row.mou.id}</td>
                      <td className="py-2.5 px-2.5 text-center text-muted-foreground whitespace-nowrap">bulan ke-{row.usiaBulan + 1}</td>
                      <td className={`py-2.5 px-2.5 text-right font-bold whitespace-nowrap ${row.totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatShortFloat(row.totalProfit)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap" title={`PP I: ${row.mou.bagiHasilPP1 ?? 50}%`}>{formatShortFloat(row.owner)}</td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap">{formatShortFloat(row.hasanah)}</td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap text-blue-600 font-medium" title={`PK: ${row.mou.bagiHasilPK ?? 35}%`}>{formatShortFloat(row.investor)}</td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                        <div>{formatShortFloat(row.trader)}</div>
                        <div className="text-[9px] text-muted-foreground">{row.effectivePct.pctTrader}%</div>
                      </td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap text-green-700 dark:text-green-400 font-medium">
                        <div>{formatShortFloat(row.minbun)}</div>
                        <div className="text-[9px] text-muted-foreground">{row.effectivePct.pctMinBun}%</div>
                      </td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                        <div>{formatShortFloat(row.brokerI)}</div>
                        <div className="text-[9px] text-muted-foreground">{row.effectivePct.pctBrokerI}%</div>
                      </td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                        <div>{formatShortFloat(row.brokerII)}</div>
                        <div className="text-[9px] text-muted-foreground">{row.effectivePct.pctBrokerII}%</div>
                      </td>
                      <td className={`py-2.5 px-2.5 text-right whitespace-nowrap font-semibold ${row.roiTotal >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {pct(row.roiTotal)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap">{pct(row.roiTraderInvestor)}</td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap">{pct(row.roiInvestor)}</td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap">{pct(row.roiTrader)}</td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap">{pct(row.roiMinbun)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
