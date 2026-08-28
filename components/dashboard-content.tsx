"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useInvestors } from "@/lib/investors-context";
import { useBrokers } from "@/lib/brokers-context";
import { usePks, investorPkPct } from "@/lib/pks-context";
import { useTransaksi, calcTransaksi, effectiveStatus, activeInvestorIds, type Transaksi } from "@/lib/transaksi-context";
import { todayWibStr } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
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


const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

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

import type { Pks } from "@/lib/pks-context";

// Hitung distribusi per-TRX untuk satu PKS, hanya untuk siklus yang sedang
// berjalan (currentCycle) dan HANYA transaksi yang masih berstatus "berjalan"
// (effectiveStatus === "berjalan"). Diambil SATU transaksi TERBARU (bukan
// dijumlahkan) agar tidak membengkak lintas siklus/TRX.
//   - Gross Profit     = calc.profit × ratio = (hargaJual × qty) − (modal + ongkir)
//                        per-investor — sama dengan kolom "Profit" di halaman
//                        Transaksi (mis. modal 140 jt → ≈ 19.44 jt).
//   - Distribusi bagi hasil (Owner/Investor/Trader/dll) berbasis NET profit yang
//     sama = calc.profit × ratio × %, sesuai model reminder/pks-html.
//   Persentase bersumber dari PKS:
//   - Owner (PP I)    = profit × bagiHasilPP1%   (dari PKS)
//   - Trader (PP II)  = profit × bagiHasilPP2%   (dari PKS)
//   - Investor (PK)    = profit × bagiHasilPK%    (dari PKS)
//   - MinBun          = profit × entry.pctMinBun% (dari entry TRX, di-clamp ke PP3)
//   - Broker I/II     = profit × sisa PP3 setelah MinBun, dibagi rasio entry
//   - Hasanah         = Investor + Trader + MinBun + Broker I + Broker II
//                       (semua pihak selain Owner = PP2 + PP3 + PK)
//   Catatan: Gross Profit = Owner + Hasanah (sanity check) karena keduanya
//   memakai basis yang sama (calc.profit × ratio) untuk 1 transaksi berjalan.
function calcPksDistribution(
  pks: Pks,
  transaksis: Transaksi[],
  currentCycle: number,
) {
  const [sy, sm, sd] = pks.date.slice(0, 10).split("-").map(Number);
  const pksStart = Date.UTC(sy, sm - 1, sd);
  const contractDays = pks.contractPeriod || 30;

  // Window PER-SIKLUS, bukan [pksStart, pksEnd) yang mencakup SELURUH durasi
  // PKS. Untuk PKS autorenewal (siklus > 1), window siklus-berjalan mencegah
  // transaksi dari siklus sebelumnya ikut terhitung di Gross Profit & distribusi
  // siklus berjalan — konsisten dengan halaman Transaksi yang memfilter
  // displayStatus === "berjalan" (bukan window-based). Sebelumnya parameter
  // currentCycle diterima tapi TIDAK dipakai (bug), sehingga window terlalu lebar
  // untuk PKS multi-siklus.
  //   cycleStart = pksStart + (currentCycle - 1) × contractDays
  //   cycleEnd   = pksStart + currentCycle     × contractDays
  const cycleStartMs = pksStart + (currentCycle - 1) * contractDays * 86_400_000;
  const cycleEndMs   = pksStart + currentCycle     * contractDays * 86_400_000;
  // Cap akhir ke pks.endDate bila siklus melebihi akhir kontrak (data tidak konsisten)
  const pksEndCap = (() => {
    const e = pks.endDate;
    if (!e) return Number.POSITIVE_INFINITY;
    const [ey, em, ed] = e.slice(0, 10).split("-").map(Number);
    return Date.UTC(ey, em - 1, ed);
  })();
  const effectiveEndMs = Math.min(cycleEndMs, pksEndCap);

  // Persentase dari PKS
  const pp1Pct = (pks.bagiHasilPP1 ?? 50) / 100;   // Owner (PP I)
  const pp2Pct = (pks.bagiHasilPP2 ?? 15) / 100;   // Trader (PP II)
  const pkPct  = (pks.bagiHasilPK  ?? 35) / 100;    // Investor (PK)
  const pp3Pct = pks.bagiHasilPP3 ?? 0;             // PP III — MinBun + Broker (dalam %)

  let totalProfit = 0;
  let owner = 0, hasanah = 0, investor = 0, trader = 0, minbun = 0, brokerI = 0, brokerII = 0;
  let effectivePct = { pctTrader: pp2Pct * 100, pctMinBun: 0, pctBrokerI: 0, pctBrokerII: 0 };

  // Gross Profit & distribusi dihitung dari SATU transaksi TERBARU yang masih
  // berstatus "berjalan" untuk investor ini dalam window siklus berjalan PKS
  // ([cycleStartMs, effectiveEndMs)) — bukan dijumlahkan (agar tidak membengkak)
  // dan bukan sembarang transaksi investor. Untuk PKS autorenewal, hanya transaksi
  // yang jatuh di siklus currentCycle yang masuk — bukan siklus lama yang sudah
  // selesai/berakhir.
  // Trace: No PKS → investorId + currentCycle (periode siklus) → transaksi terkait
  // → ambil transaksi berjalan terbaru. Gross Profit = calc.profit (profit total
  // transaksi, sama dengan kolom "Profit" di halaman Transaksi, mis. modal 140 jt
  // → ≈ 19.44 jt).
  let latest: Transaksi | null = null;
  let latestMs = 0;
  for (const t of transaksis) {
    const [ty, tm, td] = (t.date as string).slice(0, 10).split("-").map(Number);
    const tDate = Date.UTC(ty, tm - 1, td);
    // Transaksi harus jatuh dalam window siklus berjalan PKS ini
    if (tDate < cycleStartMs || tDate >= effectiveEndMs) continue;
    if (effectiveStatus(t) !== "berjalan") continue;
    const entry = t.investorEntries.find(
      (e) => e.investorId === pks.investorId && e.nilaiInvestasi > 0,
    );
    if (!entry) continue;
    if (tDate > latestMs) { latestMs = tDate; latest = t; }
  }

  if (latest) {
    const t = latest;
    const calc = calcTransaksi(t);
    const entry = t.investorEntries.find(
      (e) => e.investorId === pks.investorId && e.nilaiInvestasi > 0,
    )!;

    // Gross Profit = profit TOTAL transaksi berjalan terakhir (bukan dibagi
    // rasio investor). calc.profit = income − (kebutuhanModal + ongkir) adalah
    // profit transaksi penuh, sama dengan kolom "Profit" di halaman Transaksi
    // (mis. modal 140 jt → ≈ 19.44 jt). Di tabel Rekap per PKS, satu baris =
    // satu PKS yang merepresentasikan transaksi terkaitnya secara penuh, jadi
    // rasio investor tidak dipakai untuk Gross Profit.
    totalProfit = calc.profit;

    // Distribusi bagi hasil berbasis profit transaksi yang sama (hanya jika
    // profit > 0). Persentase trader/minbun/broker diambil dari entry investor
    // (per-investor), tapi nominal memakai profit transaksi penuh. Sanity
    // check: Owner + Hasanah = totalProfit.
    if (calc.profit > 0) {
      const profit = calc.profit;
      const minBunPct = Math.min(entry.pctMinBun, pp3Pct);
      const brokerPct = Math.max(0, pp3Pct - minBunPct);
      const brokerTotal = entry.pctBrokerI + entry.pctBrokerII;
      const brokerIShare  = brokerTotal > 0 ? brokerPct * (entry.pctBrokerI  / brokerTotal) : 0;
      const brokerIIShare = brokerTotal > 0 ? brokerPct * (entry.pctBrokerII / brokerTotal) : 0;

      effectivePct = {
        pctTrader:   pp2Pct * 100,
        pctMinBun:   minBunPct,
        pctBrokerI:  brokerIShare,
        pctBrokerII: brokerIIShare,
      };

      owner    = profit * pp1Pct;
      trader   = profit * pp2Pct;
      investor = profit * pkPct;
      minbun   = profit * minBunPct    / 100;
      brokerI  = profit * brokerIShare  / 100;
      brokerII = profit * brokerIIShare / 100;
    }
  }

  hasanah = investor + trader + minbun + brokerI + brokerII;

  return { totalProfit, owner, hasanah, investor, trader, minbun, brokerI, brokerII, effectivePct };
}

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
  const { user, isInvestor, isBroker } = useAuth();
  const { investors }   = useInvestors();
  const { brokers }     = useBrokers();
  const { pksList }        = usePks();
  const { transaksis }  = useTransaksi();

  // ── AUTOMATIC ROLE FILTERING ──
  // Filter data secara otomatis berdasarkan privilage akun login
  // Ini akan diterapkan SEBELUM filter manual user
  const allowedInvestorIds = useMemo(() => {
    // Admin & Owner: bisa lihat semua data
    if (!isInvestor && !isBroker) return null;

    // Investor: hanya bisa lihat data milik dirinya sendiri
    if (isInvestor && user?.investorId) {
      return new Set([user.investorId]);
    }

    // Broker: hanya bisa lihat data investor yang menjadi afiliasinya
    if (isBroker && user?.brokerId) {
      const broker = brokers.find(b => b.id === user.brokerId);
      if (broker) {
        const affiliatedInvestors = investors.filter(inv => inv.brokerName === broker.name);
        return new Set(affiliatedInvestors.map(inv => inv.id));
      }
      return new Set<string>();
    }

    return new Set<string>();
  }, [isInvestor, isBroker, user, investors, brokers]);

  // Terapkan filter otomatis ke semua data sebelum diproses lebih lanjut
  const filteredInvestorsByRole = useMemo(() => {
    if (!allowedInvestorIds) return investors;
    return investors.filter(inv => allowedInvestorIds.has(inv.id));
  }, [investors, allowedInvestorIds]);

  const filteredPksByRole = useMemo(() => {
    if (!allowedInvestorIds) return pksList;
    return pksList.filter(pks => allowedInvestorIds.has(pks.investorId));
  }, [pksList, allowedInvestorIds]);

  const filteredTransaksisByRole = useMemo(() => {
    if (!allowedInvestorIds) return transaksis;
    return transaksis.filter(t => 
      t.investorEntries.some(e => allowedInvestorIds.has(e.investorId))
    );
  }, [transaksis, allowedInvestorIds]);

  // Status aktif investor diturunkan dari transaksi — satu sumber kebenaran.
  const activeIds = useMemo(() => activeInvestorIds(filteredTransaksisByRole), [filteredTransaksisByRole]);

  // ── Portfolio metrics (hanya investor aktif) ──
  const metrics = useMemo(() => {
    const activeInvestors = filteredInvestorsByRole.filter((inv) => activeIds.has(inv.id));
    const totalInvestors  = activeInvestors.length;
    
    // Total investasi dihitung dari PKS yang berstatus draft/completed (tidak terminated)
    let totalInvestment = 0;
    filteredPksByRole.forEach((pks) => {
      if (!pks.isTerminated) {
        totalInvestment += pks.investmentAmount;
      }
    });
    
    const avgInvestment   = totalInvestors > 0 ? totalInvestment / totalInvestors : 0;
    // Untuk broker: hanya tampilkan 1 (dirinya sendiri)
    const totalBrokers    = isBroker ? 1 : brokers.length;
    return { totalInvestors, totalInvestment, avgInvestment, totalBrokers };
  }, [filteredInvestorsByRole, brokers, activeIds, filteredPksByRole, isBroker]);


  // ── Chart: investasi per broker — stacked per investor ──
  const brokerStackedData = useMemo(() => {
    const COLORS = [
      "#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6",
      "#06b6d4","#f97316","#84cc16","#ec4899","#6366f1",
      "#14b8a6","#eab308","#a855f7","#22c55e","#0ea5e9",
    ];

    const active = investors.filter((inv) => activeIds.has(inv.id) && inv.investmentAmount > 0);

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
  }, [investors, brokers, activeIds]);

  // ── Filter state ──
  const [dateRange,      setDateRange]      = useState<DateRange | undefined>(undefined);
  const [filterBroker,   setFilterBroker]   = useState<string>("");
  const [filterInvestor, setFilterInvestor] = useState<string>("");
  const [filterPintu,    setFilterPintu]    = useState<string>("");

  // ── Available brokers from investor data ──
  const availableBrokers = useMemo(() => {
    // Jika user adalah broker: hanya tampilkan dirinya sendiri
    if (isBroker && user?.brokerId) {
      const broker = brokers.find(b => b.id === user.brokerId);
      return broker ? [broker.name] : [];
    }
    
    const set = new Set<string>();
    filteredInvestorsByRole.forEach((inv) => {
      set.add(inv.brokerName?.trim() || "Tanpa Broker");
    });
    const sorted = brokers
      .map((b) => b.name)
      .filter((n) => set.has(n));
    if (set.has("Tanpa Broker")) sorted.push("Tanpa Broker");
    return sorted;
  }, [filteredInvestorsByRole, brokers, isBroker, user]);

  // ── Investors filtered by selected broker (for investor dropdown) ──
  const investorOptions = useMemo(() => {
    return filteredInvestorsByRole.filter((inv) => {
      if (!filterBroker) return true;
      return (inv.brokerName?.trim() || "Tanpa Broker") === filterBroker;
    });
  }, [filteredInvestorsByRole, filterBroker]);

  // ── Filtered collections ──
  const fromStr = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : "";
  const toStr   = dateRange?.to   ? format(dateRange.to,   "yyyy-MM-dd") : "";

  const filteredTransaksis = useMemo(
    () => filteredTransaksisByRole.filter((t) => {
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
      // Filter berdasarkan Pintu (channel kontribusi investor)
      if (filterPintu) {
        const hasMatchPintu = t.investorEntries.some((e) => {
          const inv = investors.find((i) => i.id === e.investorId);
          if (!inv) return false;
          if (filterPintu === "MinBun" && !inv.isMinBun) return false;
          if (filterPintu === "Tami" && !inv.isTami) return false;
          if (filterPintu === "DirectAB" && !inv.isDirect) return false;
          return true;
        });
        if (!hasMatchPintu) return false;
      }
      return true;
    }),
    [transaksis, fromStr, toStr, filterInvestor, filterBroker, filterPintu, investors],
  );

  const filteredPkssByPeriod = useMemo(
    () => filteredPksByRole.filter((m) => {
      if (fromStr && m.date < fromStr) return false;
      if (toStr   && m.date > toStr)   return false;
      if (filterInvestor && m.investorId !== filterInvestor) return false;
      if (filterBroker && !filterInvestor) {
        const inv = investors.find((i) => i.id === m.investorId);
        if ((inv?.brokerName?.trim() || "Tanpa Broker") !== filterBroker) return false;
      }
      // Filter berdasarkan Pintu (channel kontribusi investor)
      if (filterPintu) {
        const inv = investors.find((i) => i.id === m.investorId);
        if (!inv) return false;
        if (filterPintu === "MinBun" && !inv.isMinBun) return false;
        if (filterPintu === "Tami" && !inv.isTami) return false;
        if (filterPintu === "DirectAB" && !inv.isDirect) return false;
      }
      return true;
    }),
    [pksList, fromStr, toStr, filterInvestor, filterBroker, filterPintu, investors],
  );

  // ── Investors filtered for detail table ──
  const filteredInvestors = useMemo(() => {
    return filteredInvestorsByRole.filter((inv) => {
      if (filterInvestor && inv.id !== filterInvestor) return false;
      if (filterBroker && (inv.brokerName?.trim() || "Tanpa Broker") !== filterBroker) return false;
      // Filter berdasarkan Pintu (channel kontribusi investor)
      if (filterPintu) {
        if (filterPintu === "MinBun" && !inv.isMinBun) return false;
        if (filterPintu === "Tami" && !inv.isTami) return false;
        if (filterPintu === "DirectAB" && !inv.isDirect) return false;
      }
      return true;
    });
  }, [investors, filterInvestor, filterBroker, filterPintu]);

  // ── Chart: kontribusi investasi per jalur (entry channel) ──
  const jalurContribData = useMemo(() => {
    // Hitung total modal investasi berdasarkan 3 pintu masuk dari channel kontribusi investor
    // MinBun = investor.isMinBun, Tami = investor.isTami, DirectAB = investor.isDirect
    let totalMinBun = 0;
    let totalTami = 0;
    let totalDirectAB = 0;
    
    // Iterasi setiap PKS yang terfilter untuk menghitung kontribusi modal per pintu
    filteredPkssByPeriod.forEach((pks) => {
      // Tentukan pintu masuk berdasarkan channel kontribusi investor
      const inv = investors.find((i) => i.id === pks.investorId);
      if (!inv) return;
      
      if (inv.isMinBun) {
        // MinBun
        totalMinBun += pks.investmentAmount;
      } else if (inv.isTami) {
        // Tami
        totalTami += pks.investmentAmount;
      } else if (inv.isDirect) {
        // DirectAB
        totalDirectAB += pks.investmentAmount;
      }
    });
    
    const total = totalMinBun + totalTami + totalDirectAB;
    
    // Warna untuk setiap pintu masuk
    const COLORS = {
      minbun: "#10b981",    // hijau untuk pintu MinBun
      tami: "#f59e0b",      // oranye untuk pintu Tami
      directAB: "#3b82f6",  // biru untuk pintu DirectAB
    };
    
    const entries = [
      { name: "MinBun", value: totalMinBun, color: COLORS.minbun },
      { name: "Tami", value: totalTami, color: COLORS.tami },
      { name: "DirectAB", value: totalDirectAB, color: COLORS.directAB },
    ].filter((e) => e.value > 0); // hanya tampilkan pintu yang ada kontribusinya
    
    return { entries, total };
  }, [filteredPkssByPeriod]);

  // ── Rekap filter state ──
  const [showFilter, setShowFilter] = useState(false);
  const [filterNama, setFilterNama] = useState("");
  const [filterPks,  setFilterPks]  = useState("");

  // ── Rekap data (per Pks, difilter periode) — dideklarasikan lebih awal
  // karena periodMetrics bergantung padanya
  const rekapData = useMemo(() => {
    return filteredPkssByPeriod
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((pks, idx) => {
        const modal      = pks.investmentAmount;
        const [uy, um, ud] = pks.date.slice(0, 10).split("-").map(Number);
        const [ty, tm, td] = todayWibStr().split("-").map(Number);
        // Usia dihitung dari kalender WIB, bukan jam lokal browser
        const usiaHari   = Math.max(0, Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(uy, um - 1, ud)) / 86_400_000));
        const usiaBulan  = Math.floor(usiaHari / 30);
        const endDateStr = pks.endDate || addDays(pks.date, pks.contractPeriod * (pks.siklus ?? 1));
        
        // Hitung siklus aktual berdasarkan transaksi yang ada dalam periode PKS ini
        const [sy, sm, sd] = pks.date.slice(0, 10).split("-").map(Number);
        const pksStart = Date.UTC(sy, sm - 1, sd);
        const [ey, em, ed] = endDateStr.slice(0, 10).split("-").map(Number);
        const pksEnd = Date.UTC(ey, em - 1, ed);
        
        // Hitung berapa banyak transaksi unik untuk investor ini dalam periode PKS
        const trxInPeriod = filteredTransaksis.filter((t) => {
          const hasInvestor = t.investorEntries.some((e) => e.investorId === pks.investorId);
          if (!hasInvestor) return false;
          const [ty2, tm2, td2] = (t.date as string).slice(0, 10).split("-").map(Number);
          const tDate = Date.UTC(ty2, tm2 - 1, td2);
          return tDate >= pksStart && tDate < pksEnd;
        });
        
        // Siklus "sedang berjalan" ditentukan dari transaksi TERBARU yang masih
        // berstatus "berjalan" untuk investor ini dalam periode kontrak PKS —
        // bukan tanggal hari ini, agar window siklus selalu memuat transaksi
        // aktif terakhir yang benar untuk PKS ini (trace: No PKS → investorId +
        // periode kontrak → transaksi terkait).
        let latestTrxMs = 0;
        trxInPeriod.forEach((t) => {
          if (effectiveStatus(t) !== "berjalan") return;
          if (!t.investorEntries.some((e) => e.investorId === pks.investorId && e.nilaiInvestasi > 0)) return;
          const [ty2, tm2, td2] = (t.date as string).slice(0, 10).split("-").map(Number);
          const tDate = Date.UTC(ty2, tm2 - 1, td2);
          if (tDate > latestTrxMs) latestTrxMs = tDate;
        });
        const cycleLenMs = (pks.contractPeriod || 30) * 86_400_000;
        const currentCycle = latestTrxMs > 0 && cycleLenMs > 0
          ? Math.max(1, Math.floor((latestTrxMs - pksStart) / cycleLenMs) + 1)
          : 1;
        
        // Hitung distribusi profit hanya untuk siklus yang sedang berjalan
        const dist = calcPksDistribution(pks, filteredTransaksis, currentCycle);

        // Ambil pksId langsung dari transaksi.investorEntries — sumber yang SAMA
        // dengan yang dipakai di transaksi-content (lihat InvestorEntryForm.pksId
        // yang disimpan ke koleksi transaksi_investors.pksId, dan dicocokkan
        // kembali via `e.pksId === pks.id` di transaksi-content). Ini menjamin
        // kolom "No PKS" di tabel Rekap Investasi selalu sama dengan pksId
        // yang tersimpan di transaksi — bukan hanya berasal dari Pks record.
        // Fallback ke pks.id (customId PKS-YYYYMM-NNN) bila PKS ini belum
        // memiliki transaksi terkait (mis. PKS baru / tanpa TRX).
        const displayPksId = (() => {
          for (const t of trxInPeriod) {
            const entry = t.investorEntries.find(
              (e) => e.investorId === pks.investorId && e.pksId,
            );
            if (entry) return entry.pksId;
          }
          return pks.id;
        })();

        const roi = (v: number) => (modal > 0 ? (v / modal) * 100 : 0);
        return {
          no: idx + 1, pks, endDateStr, usiaBulan, currentCycle, displayPksId, ...dist,
          roiTotal:          roi(dist.totalProfit),
          roiTraderInvestor: roi(dist.trader + dist.investor),
          roiInvestor:       roi(dist.investor),
          roiTrader:         roi(dist.trader),
          roiMinbun:         roi(dist.minbun),
        };
      });
  }, [filteredPkssByPeriod, filteredTransaksis]);

  // ── Period summary metrics ──
  // Formula disamakan dengan halaman Reminder (buildTransaksiRows):
  //   - Hanya TRX dengan profit > 0 dan investasi > 0 yang dihitung
  //   - Bagi hasil dihitung per-TRX dari profit PENUH, bukan per-investor-entry
  //     (entry hanya jadi faktor bobot PK% jika ada beberapa investor di TRX yang sama;
  //      default persentase trader/minbun/broker ditentukan per-entry)
  //   - Owner = residu: profit - totalDistributed (Investor+Trader+MinBun+Broker)
  const periodMetrics = useMemo(() => {
    let income = 0, profit = 0;
    filteredTransaksis.forEach((t) => {
      const c = calcTransaksi(t);
      income += c.income;
      profit += c.profit;
    });

    let bagHasilInvestor = 0, bagHasilTrader = 0, bagHasilMinbun = 0, bagHasilBroker = 0;
    let profitOwner = 0;
    const countedTrxIds = new Set<string>();

    filteredTransaksis.forEach((trx) => {
      const calc = calcTransaksi(trx);
      if (calc.totalInvestasi === 0 || calc.profit <= 0) return;
      if (countedTrxIds.has(trx.id)) return;
      countedTrxIds.add(trx.id);

      let trxInvestor = 0, trxTrader = 0, trxMinbun = 0, trxBroker = 0;

      for (const entry of trx.investorEntries) {
        if (entry.nilaiInvestasi <= 0) continue;

        // PK% (bagi hasil investor) — sumber: PKS investor, fallback 35.
        const pkPct = investorPkPct(entry.investorId, pksList) / 100;
        const ratio = entry.nilaiInvestasi / calc.totalInvestasi;
        const profit = calc.profit * ratio;

        // Fallback % trader/minbun/broker jika semua 0, konsisten dengan reminder.
        const allZero   = entry.pctTrader === 0 && entry.pctMinBun === 0 && entry.pctBrokerI === 0 && entry.pctBrokerII === 0;
        const hasBroker = !!entry.investorBrokerName;
        const pT  = allZero ? 10                   : entry.pctTrader;
        const pM  = allZero ? (hasBroker ? 0 : 5)  : entry.pctMinBun;
        const pBI = allZero ? (hasBroker ? 5 : 0)  : entry.pctBrokerI;
        const pBII= allZero ? 0                    : entry.pctBrokerII;

        trxInvestor += profit * pkPct;
        trxTrader   += profit * pT  / 100;
        trxMinbun   += profit * pM  / 100;
        trxBroker   += profit * (pBI + pBII) / 100;
      }

      const totalDistributed = trxInvestor + trxTrader + trxMinbun + trxBroker;
      const trxOwner = calc.profit - totalDistributed;

      bagHasilInvestor += trxInvestor;
      bagHasilTrader   += trxTrader;
      bagHasilMinbun   += trxMinbun;
      bagHasilBroker   += trxBroker;
      profitOwner      += trxOwner;
    });

    // Total semua pihak = Gross Profit yang dibagikan
    const totalBagiHasil = profitOwner + bagHasilInvestor + bagHasilTrader + bagHasilMinbun + bagHasilBroker;
    let periodLabel = "Semua Periode";
    if (dateRange?.from && dateRange?.to) {
      periodLabel = `${format(dateRange.from, "d MMM yyyy", { locale: localeId })} – ${format(dateRange.to, "d MMM yyyy", { locale: localeId })}`;
    } else if (dateRange?.from) {
      periodLabel = `Mulai ${format(dateRange.from, "d MMM yyyy", { locale: localeId })}`;
    } else if (dateRange?.to) {
      periodLabel = `Sampai ${format(dateRange.to, "d MMM yyyy", { locale: localeId })}`;
    }
    return {
      income,
      profit,
      profitOwner,
      bagHasilInvestor,
      bagHasilTrader,
      bagHasilMinbun,
      bagHasilBroker,
      totalBagiHasil,
      trxCount:   filteredTransaksis.length,
      pksCount:   filteredPkssByPeriod.length,
      periodLabel,
      isFiltered: !!(dateRange?.from || dateRange?.to || filterBroker || filterInvestor),
    };
  }, [filteredTransaksis, filteredPkssByPeriod, pksList, dateRange, filterBroker, filterInvestor]);

  // ── Chart: modal per bulan stacked by keterangan ──
  const modalByKeteranganData = useMemo(() => {
    const COLORS = [
      "#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6",
      "#06b6d4","#f97316","#84cc16","#ec4899","#6366f1",
      "#14b8a6","#eab308","#a855f7","#22c55e","#0ea5e9",
    ];

    const monthMap = new Map<string, Record<string, number>>();
    const labelSet = new Set<string>();

    filteredPkssByPeriod.forEach((m) => {
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
  }, [filteredPkssByPeriod]);

  // ── Chart: investasi masuk per bulan (dari Pks, terfilter) ──
  const monthlyPksData = useMemo(() => {
    const map = new Map<string, { month: string; investment: number; count: number }>();
    filteredPkssByPeriod.forEach((m) => {
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
  }, [filteredPkssByPeriod]);

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
      if (filterNama && !row.pks.investorName.toLowerCase().includes(filterNama.toLowerCase())) return false;
      if (filterPks  && !row.displayPksId.toLowerCase().includes(filterPks.toLowerCase()))       return false;
      return true;
    });
  }, [rekapData, filterNama, filterPks]);

  // ── Pagination: Detail Investor ──
  // 20 baris per halaman, konsisten dengan halaman PKS.
  const ITEMS_PER_PAGE = 20;
  const [pageInvestor, setPageInvestor] = useState(1);
  const [pageRekap,    setPageRekap]    = useState(1);

  // Reset ke halaman 1 setiap kali filter / data berubah agar tidak
  // terjebak di halaman kosong.
  useMemo(() => {
    setPageInvestor(1);
    setPageRekap(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterBroker, filterInvestor, filterNama, filterPks, dateRange?.from?.toString(), dateRange?.to?.toString()]);

  const totalPagesInvestor = Math.max(1, Math.ceil(filteredInvestors.length / ITEMS_PER_PAGE));
  const totalPagesRekap    = Math.max(1, Math.ceil(filteredRekap.length       / ITEMS_PER_PAGE));

  const safePageInvestor = Math.min(pageInvestor, totalPagesInvestor);
  const safePageRekap    = Math.min(pageRekap,    totalPagesRekap);

  const paginatedInvestor = filteredInvestors.slice(
    (safePageInvestor - 1) * ITEMS_PER_PAGE,
    safePageInvestor       * ITEMS_PER_PAGE,
  );
  const paginatedRekap = filteredRekap.slice(
    (safePageRekap - 1) * ITEMS_PER_PAGE,
    safePageRekap       * ITEMS_PER_PAGE,
  );

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

          <Select
            value={filterPintu || "__all"}
            onValueChange={(v) => setFilterPintu(v === "__all" ? "" : v)}
          >
            <SelectTrigger className="w-[140px] h-8 text-sm">
              <SelectValue placeholder="Semua Pintu" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Semua Pintu</SelectItem>
              <SelectItem value="MinBun">MinBun</SelectItem>
              <SelectItem value="Tami">Tami</SelectItem>
              <SelectItem value="DirectAB">DirectAB</SelectItem>
            </SelectContent>
          </Select>

          {(periodMetrics.isFiltered || filterPintu) && (
            <button
              onClick={() => { setDateRange(undefined); setFilterBroker(""); setFilterInvestor(""); setFilterPintu(""); }}
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
              <div className="text-2xl font-bold">{periodMetrics.pksCount}</div>
              <p className="text-xs text-muted-foreground">perjanjian kerjasama</p>
            </CardContent>
          </Card>

          <Card className={periodMetrics.isFiltered ? "border-primary/30" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatShort(periodMetrics.income)}</div>
              <p className="text-xs text-muted-foreground">{formatCurrency(periodMetrics.income)}</p>
            </CardContent>
          </Card>

          <Card className={periodMetrics.isFiltered ? "border-primary/30" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gross Profit</CardTitle>
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

          {/* Ringkasan Bagi Hasil per pihak (Owner / Investor / Trader / MinBun / Broker) +
              Total sebagai sanity check (harus ≈ Gross Profit). */}
          <Card className={`md:col-span-4 ${periodMetrics.isFiltered ? "border-primary/30" : ""}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Semua Bagi Hasil</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="flex items-center divide-x divide-border">
                <div className="flex-1 pr-4">
                  <p className="text-xs text-muted-foreground mb-1">Owner (PP I)</p>
                  <p className="text-xl font-bold text-purple-600">{formatShort(periodMetrics.profitOwner)}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(periodMetrics.profitOwner)}</p>
                </div>
                <div className="flex-1 px-4">
                  <p className="text-xs text-muted-foreground mb-1">Investor (PK)</p>
                  <p className="text-xl font-bold text-orange-500">{formatShort(periodMetrics.bagHasilInvestor)}</p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(periodMetrics.bagHasilInvestor)}</p>
                </div>
                <div className="flex-1 px-4">
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
                <div className="flex-1 pl-4 border-l-2 border-primary/40 bg-primary/5 -my-2 py-2 pr-2 rounded-r">
                  <p className="text-xs text-muted-foreground mb-1 font-semibold">Total</p>
                  <p className={`text-xl font-bold ${periodMetrics.totalBagiHasil >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {formatShort(periodMetrics.totalBagiHasil)}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatCurrency(periodMetrics.totalBagiHasil)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Chart: Investasi Masuk per Bulan + PnL per Bulan ── */}
      {(monthlyPksData.length > 0 || monthlyPnlData.length > 0) && (
        <div className="grid gap-6 md:grid-cols-2">

          {/* Investasi masuk per bulan */}
          {monthlyPksData.length > 0 && (
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
                      data={monthlyPksData}
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
                            : [value, "Jumlah Pks"]
                        }
                        contentStyle={tooltipStyle}
                        labelStyle={{ color: "hsl(var(--card-foreground))" }}
                        itemStyle={{ color: "#BD0000" }}
                      />
                      <Bar
                        dataKey="investment"
                        fill="#9ca3af"
                        radius={[4, 4, 0, 0]}
                        name="investment"
                      >
                        <LabelList
                          dataKey="count"
                          position="top"
                          formatter={(v: number) => `${v} Pks`}
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
                  Profit (hijau) adalah bagian dari Total Revenue (tinggi bar)
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
                            return [formatCurrency(props.payload.income as number), "Total Revenue"];
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
                          value === "cost" ? "Total Revenue" : value === "profit" ? "Profit" : value
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
                    itemStyle={{ color: "#BD0000" }}
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
                    itemStyle={{ color: "#BD0000" }}
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
            <CardTitle>Kontribusi Investasi per Pintu</CardTitle>
            <CardDescription>
              Total modal investasi berdasarkan 3 pintu masuk — MinBun, Tami, dan DirectAB
              {periodMetrics.isFiltered && ` · ${periodMetrics.periodLabel}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {jalurContribData.entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-[260px] text-muted-foreground gap-2">
                <Wallet className="h-10 w-10" />
                <p className="text-sm">Belum ada investasi</p>
              </div>
            ) : (
              <>
                <div className="h-[240px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsPieChart>
                      <Pie
                        data={jalurContribData.entries}
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={96}
                        paddingAngle={2}
                        dataKey="value"
                        strokeWidth={0}
                      >
                        {jalurContribData.entries.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.color}
                            stroke="white"
                            strokeWidth={1}
                            style={{ outline: "none" }}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const entry = payload[0]?.payload as (typeof jalurContribData.entries)[0];
                          if (!entry) return null;
                          const share = jalurContribData.total > 0
                            ? ((entry.value / jalurContribData.total) * 100).toFixed(1)
                            : "0";
                          return (
                            <div style={tooltipStyle} className="px-3 py-2 space-y-0.5">
                              <p className="font-semibold text-sm">Pintu {entry.name}</p>
                              <p className="text-xs text-muted-foreground">Modal Investasi</p>
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
                <div className="mt-3 border-t pt-3">
                  <div className="flex flex-wrap gap-x-6 gap-y-2 justify-center">
                    {jalurContribData.entries.map((entry) => (
                      <div key={entry.name} className="flex items-center gap-2 text-sm">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: entry.color }}
                        />
                        <span className="font-medium">{entry.name}</span>
                        <span className="text-muted-foreground tabular-nums">
                          {jalurContribData.total > 0
                            ? `${((entry.value / jalurContribData.total) * 100).toFixed(1)}%`
                            : "—"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({formatShort(entry.value)})
                        </span>
                      </div>
                    ))}
                  </div>
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
        <CardContent className="p-0">
          {filteredInvestors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <Users className="h-10 w-10" />
              <p className="text-sm">Belum ada investor</p>
            </div>
          ) : (
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
                {paginatedInvestor.map((investor) => {
                  // PKS aktif = berstatus draft atau completed (yakni belum
                  // terminated). Masa aktif/expiry PKS tidak lagi relevan — PKS
                  // berlaku selama transaksinya jalan.
                  const activePks = pksList
                    .filter((m) => m.investorId === investor.id && !m.isTerminated)
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
                      {activePks ? (
                        <span className="font-bold text-blue-600 dark:text-blue-400">
                          {activePks.bagiHasilPK ?? 35}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-muted-foreground">
                      {activePks ? activePks.id : <span className="text-muted-foreground/50">—</span>}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}
          {totalPagesInvestor > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {(safePageInvestor - 1) * ITEMS_PER_PAGE + 1}–{Math.min(safePageInvestor * ITEMS_PER_PAGE, filteredInvestors.length)} dari {filteredInvestors.length} investor
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPageInvestor((p) => Math.max(1, p - 1))}
                  disabled={safePageInvestor === 1}
                >
                  ←
                </Button>
                {Array.from({ length: totalPagesInvestor }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPagesInvestor || Math.abs(p - safePageInvestor) <= 1)
                  .reduce<(number | "…")[]>((acc, p, i, arr) => {
                    if (i > 0 && p - arr[i - 1] > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p) =>
                    p === "…" ? (
                      <span key="ellipsis" className="px-1 text-muted-foreground text-xs">…</span>
                    ) : (
                      <Button
                        key={p}
                        variant={safePageInvestor === p ? "default" : "outline"}
                        size="sm"
                        className="w-8 h-8 p-0 text-xs"
                        onClick={() => setPageInvestor(p)}
                      >
                        {p}
                      </Button>
                    )
                  )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPageInvestor((p) => Math.min(totalPagesInvestor, p + 1))}
                  disabled={safePageInvestor === totalPagesInvestor}
                >
                  →
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* ══ Rekap Investasi per Pks ══ */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Rekap Investasi per PKS</CardTitle>
              <CardDescription>
                Distribusi profit berdasarkan transaksi dalam periode setiap PKS
                {periodMetrics.isFiltered && ` · Pks mulai ${periodMetrics.periodLabel}`}
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
                <Label className="text-xs">pksId</Label>
                <Input
                  placeholder="PKS-YYYYMM-NNN"
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
          {pksList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground gap-3">
              <Briefcase className="h-10 w-10" />
              <p className="text-sm">Belum ada Pks — tambahkan di halaman Perjanjian Kerjasama</p>
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
                    <th className="text-left   py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">pksId</th>
                    <th className="text-center py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">Keterangan</th>
                    <th className="text-right  py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">Gross Profit</th>
                    <th className="text-right  py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">Owner (PP I)</th>
                    <th className="text-right  py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">HASANAH</th>
                    <th className="text-right  py-2.5 px-2.5 font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">Investor (PK)</th>
                    <th className="text-right  py-2.5 px-2.5 font-medium text-muted-foreground whitespace-nowrap">Trader (PP II)</th>
                    <th className="text-right  py-2.5 px-2.5 font-medium text-green-700 dark:text-green-400 whitespace-nowrap">MinBun</th>
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
                  {paginatedRekap.map((row) => (
                    <tr key={row.pks.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-2.5 text-center text-muted-foreground">{row.no}</td>
                      <td className="py-2.5 px-2.5 font-medium whitespace-nowrap">{row.pks.investorName}</td>
                      <td className="py-2.5 px-2.5 text-center text-muted-foreground">{row.pks.contractPeriod}</td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap">{formatShort(row.pks.investmentAmount)}</td>
                      <td className="py-2.5 px-2.5 whitespace-nowrap text-muted-foreground">{formatDate(row.pks.date)}</td>
                      <td className="py-2.5 px-2.5 whitespace-nowrap text-muted-foreground">{formatDate(row.endDateStr)}</td>
                      <td className="py-2.5 px-2.5 font-mono text-muted-foreground whitespace-nowrap" title="pksId dari transaksi.investorEntries — sama dengan pksId yang dipakai di halaman Transaksi">{row.displayPksId}</td>
                      <td className="py-2.5 px-2.5 text-center text-muted-foreground whitespace-nowrap">Siklus ke-{row.currentCycle}</td>
                      <td className={`py-2.5 px-2.5 text-right font-bold whitespace-nowrap ${row.totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatShortFloat(row.totalProfit)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap" title={`PP I: ${row.pks.bagiHasilPP1 ?? 50}%`}>{formatShortFloat(row.owner)}</td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap">{formatShortFloat(row.hasanah)}</td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap text-blue-600 font-medium" title={`PK: ${row.pks.bagiHasilPK ?? 35}%`}>{formatShortFloat(row.investor)}</td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap" title={`PP II: ${row.pks.bagiHasilPP2 ?? 15}%`}>
                        <div>{formatShortFloat(row.trader)}</div>
                        <div className="text-[9px] text-muted-foreground">{row.effectivePct.pctTrader}%</div>
                      </td>
                      <td className="py-2.5 px-2.5 text-right whitespace-nowrap text-green-700 dark:text-green-400 font-medium" title={`dari PP III: ${row.pks.bagiHasilPP3 ?? 0}%`}>
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
          {totalPagesRekap > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {(safePageRekap - 1) * ITEMS_PER_PAGE + 1}–{Math.min(safePageRekap * ITEMS_PER_PAGE, filteredRekap.length)} dari {filteredRekap.length} PKS
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPageRekap((p) => Math.max(1, p - 1))}
                  disabled={safePageRekap === 1}
                >
                  ←
                </Button>
                {Array.from({ length: totalPagesRekap }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPagesRekap || Math.abs(p - safePageRekap) <= 1)
                  .reduce<(number | "…")[]>((acc, p, i, arr) => {
                    if (i > 0 && p - arr[i - 1] > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p) =>
                    p === "…" ? (
                      <span key="ellipsis" className="px-1 text-muted-foreground text-xs">…</span>
                    ) : (
                      <Button
                        key={p}
                        variant={safePageRekap === p ? "default" : "outline"}
                        size="sm"
                        className="w-8 h-8 p-0 text-xs"
                        onClick={() => setPageRekap(p)}
                      >
                        {p}
                      </Button>
                    )
                  )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPageRekap((p) => Math.min(totalPagesRekap, p + 1))}
                  disabled={safePageRekap === totalPagesRekap}
                >
                  →
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
