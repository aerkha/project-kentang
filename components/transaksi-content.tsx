"use client";

import { useState, useMemo, Fragment } from "react";
import { toast } from "sonner";
import pb from "@/lib/pocketbase"; // Tambahkan ini di deretan import atas
import { ErrorDialog } from "@/components/ui/error-dialog";
import { formatPbError, type PbErrorInfo } from "@/lib/pb-error";
import { useTransaksi, calcTransaksi, effectiveStatus, isInvestorActive, type Transaksi, type TransaksiStatus, TRANSAKSI_STATUS_LABEL } from "@/lib/transaksi-context";
import { useInvestors, type Investor } from "@/lib/investors-context";
import { useBrokers, type Broker } from "@/lib/brokers-context";
import { useMou, type MoU } from "@/lib/mou-context";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  PackageCheck,
  Truck,
  Receipt,
  ClipboardCheck,
  RefreshCw,
  Coins,
  Upload,
  FileCheck,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { todayWibStr } from "@/lib/utils";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface InvestorEntryForm {
  mouId: string;
  investorId: string;
  nilaiInvestasi: string;
  pctTrader: string;
  pctMinBun: string;
  pctBrokerI: string;
  pctBrokerII: string;
}

interface TrxFormData {
  date: string;
  description: string;
  hpp: string;
  kebutuhanModal: string;
  investorEntries: InvestorEntryForm[];
  ongkirPerKg: string;
  hargaJual: string;
}

/** Default pct berdasarkan broker investor — langsung dari data investor */
function investorPct(
  investorBrokerName: string,
): Pick<InvestorEntryForm, "pctTrader" | "pctMinBun" | "pctBrokerI" | "pctBrokerII"> {
  const hasBroker = !!investorBrokerName;
  return {
    pctTrader:   "10",
    pctMinBun:   hasBroker ? "0" : "5",
    pctBrokerI:  hasBroker ? "5" : "0",
    pctBrokerII: "0",
  };
}

const emptyEntry = (): InvestorEntryForm => ({
  mouId: "", investorId: "", nilaiInvestasi: "",
  pctTrader: "10", pctMinBun: "5", pctBrokerI: "0", pctBrokerII: "0",
});

type InvestorJalur = "MB" | "TM" | "D";
const JALUR_LABEL: Record<InvestorJalur, string> = { MB: "MinBun (MB)", TM: "Tami (TM)", D: "Direct (D)" };

function getJalur(inv: Investor): InvestorJalur {
  if (inv.isMinBun) return "MB";
  if (inv.isTami) return "TM";
  return "D";
}

const initialForm = (): TrxFormData => ({
  date: "",
  description: "30 hari",
  hpp: "",
  kebutuhanModal: "",
  investorEntries: [emptyEntry()],
  ongkirPerKg: "",
  hargaJual: "",
});

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0,
  }).format(n);
}

function formatShort(n: number) {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}Jt`;
  if (Math.abs(n) >= 1_000)         return `${(n / 1_000).toFixed(0)}Rb`;
  return String(Math.round(n));
}

function formatQty(n: number) {
  return n % 1 === 0 ? `${n.toFixed(0)} kg` : `${n.toFixed(2)} kg`;
}

function formatDate(s: string) {
  if (!s) return "-";
  const d = new Date(s);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function statusVariant(status: TransaksiStatus): string {
  switch (status) {
    case "berjalan":   return "bg-blue-100   text-blue-800   dark:bg-blue-900/30   dark:text-blue-300";
    case "perbarui":   return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
    case "selesai":    return "bg-green-100  text-green-800  dark:bg-green-900/30  dark:text-green-300";
    case "bermasalah": return "bg-red-100    text-red-800    dark:bg-red-900/30    dark:text-red-300";
    default:           return "bg-muted text-muted-foreground";
  }
}

// Ambil jumlah hari periode dari teks "Periode" (mis. "30 hari"), default 30.
function parsePeriodeDays(desc: string): number {
  const m = desc?.match(/\d+/);
  const n = m ? parseInt(m[0], 10) : 30;
  return n > 0 ? n : 30;
}

// Sisa hari sampai periode berakhir = (tanggal + periode) − hari ini.
function sisaHari(t: { date: string; description: string }): number {
  const days    = parsePeriodeDays(t.description);
  const elapsed = (Date.now() - new Date(t.date).getTime()) / 86_400_000;
  return Math.ceil(days - elapsed);
}

// ─────────────────────────────────────────────
// BUG FIX: Helper penentuan Display Status
// ─────────────────────────────────────────────
function getDisplayStatus(t: Transaksi): TransaksiStatus {
  const base = effectiveStatus(t);
  // Jika transaksi masih berjalan tapi periodenya lewat (< 0), otomatis status jadi "selesai"
  if (base === "berjalan" && sisaHari(t) < 0) {
    return "selesai";
  }
  return base;
}

// ─────────────────────────────────────────────
// Helper Teks untuk Menghindari Nested Ternary
// ─────────────────────────────────────────────
function getSisaHariText(s: number) {
  if (s > 0) return `Sisa ${s} hari`;
  if (s === 0) return "Hari terakhir";
  return `Lewat ${-s} hari`;
}

function getSisaHariColor(s: number) {
  if (s < 0) return "text-red-500";
  if (s <= 3) return "text-orange-500";
  return "text-muted-foreground/70";
}

function getSelisihStatusText(s: number) {
  if (s === 0) return "✓";
  if (s > 0) return `-${formatShort(s)}`;
  return `+${formatShort(Math.abs(s))}`;
}

function getSelisihStatusColor(s: number) {
  if (s === 0) return "text-green-600";
  if (s > 0) return "text-red-500";
  return "text-orange-500";
}

// ─────────────────────────────────────────────
// Bagi Hasil calculator (for dialog display)
// ─────────────────────────────────────────────

type BagiHasilRow = {
  keterangan: "Investor" | "Broker" | "Trader" | "MinBun";
  nama:       string;
  jumlah:     number;
  checkKey:   string;
  investorId?: string;
};

function calcBagiHasilRows(t: Transaksi, mous: MoU[]): BagiHasilRow[] {
  const rows: BagiHasilRow[] = [];
  const c = calcTransaksi(t);
  if (c.totalInvestasi === 0 || c.profit <= 0) return rows;

  let traderTotal = 0, minbunTotal = 0;
  const brokerMap = new Map<string, number>();

  for (const entry of t.investorEntries) {
    if (entry.nilaiInvestasi <= 0) continue;
    const latest = mous
      .filter((m) => m.investorId === entry.investorId)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const pkPct    = ((latest?.bagiHasilPK) ?? 35) / 100;
    const ratio    = entry.nilaiInvestasi / c.totalInvestasi;
    const profit   = c.profit * ratio;
    
    const allZero  = entry.pctTrader === 0 && entry.pctMinBun === 0 && entry.pctBrokerI === 0 && entry.pctBrokerII === 0;
    const hasBroker = !!entry.investorBrokerName;
    
    let pT = entry.pctTrader;
    let pM = entry.pctMinBun;
    let pBI = entry.pctBrokerI;
    let pBII = entry.pctBrokerII;

    if (allZero) {
      pT = 10;
      pM = hasBroker ? 0 : 5;
      pBI = hasBroker ? 5 : 0;
      pBII = 0;
    }

    const invAmt = profit * pkPct;
    if (invAmt > 0)
      rows.push({ keterangan: "Investor", nama: entry.investorName, jumlah: invAmt, checkKey: `BagiHasil_${entry.investorId}_Investor`, investorId: entry.investorId });
    
    traderTotal += profit * pT / 100;
    minbunTotal += profit * pM / 100;
    
    const brokerAmt = profit * (pBI + pBII) / 100;
    if (brokerAmt > 0 && hasBroker) {
      brokerMap.set(entry.investorBrokerName, (brokerMap.get(entry.investorBrokerName) ?? 0) + brokerAmt);
    }
  }

  for (const [name, amt] of brokerMap)
    rows.push({ keterangan: "Broker", nama: name, jumlah: amt, checkKey: `BagiHasil_${name}_Broker` });
  if (traderTotal > 0) rows.push({ keterangan: "Trader", nama: "Trader", jumlah: traderTotal, checkKey: "BagiHasil_Trader" });
  if (minbunTotal > 0) rows.push({ keterangan: "MinBun", nama: "MinBun", jumlah: minbunTotal, checkKey: "BagiHasil_MinBun" });
  return rows;
}

// Read-only preview box
function Preview({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className={`px-3 py-2 rounded-md text-sm font-medium bg-muted ${color ?? ""}`}>
        {value}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Form — module level (stable ref)
// ─────────────────────────────────────────────

interface TrxFormProps {
  formData: TrxFormData;
  setFormData: React.Dispatch<React.SetStateAction<TrxFormData>>;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
  previewId: string;
  investors: Investor[];
  activeMous: MoU[];
  committedModal: Map<string, number>;
  isSaving?: boolean;
}

function TrxFormFields({
  formData, setFormData, onSubmit, submitLabel, previewId,
  investors, activeMous, committedModal,
  isSaving = false,
}: TrxFormProps) {
  const [openJalurs, setOpenJalurs] = useState<Set<InvestorJalur>>(() => {
    const s = new Set<InvestorJalur>();
    formData.investorEntries.forEach((e) => {
      if (!e.investorId) return;
      const inv = investors.find((x) => x.id === e.investorId);
      if (inv) s.add(getJalur(inv));
    });
    return s;
  });

  const sisaModal = (inv: Investor) =>
    Math.max(0, inv.investmentAmount - (committedModal.get(inv.id) ?? 0));

  const displaySisaForPks = (mou: MoU): number => {
    const inv = investors.find((x) => x.id === mou.investorId);
    if (!inv) return mou.investmentAmount;
    return Math.min(mou.investmentAmount, sisaModal(inv));
  };

  const isPksChecked = (mou: MoU): boolean =>
    formData.investorEntries.some((e) => e.mouId === mou.id);

  const getEntryForPks = (mou: MoU): InvestorEntryForm | undefined =>
    formData.investorEntries.find((e) => e.mouId === mou.id);

  const pksByJalur = (jalur: InvestorJalur): MoU[] =>
    activeMous.filter((m) => {
      const inv = investors.find((x) => x.id === m.investorId);
      if (!inv || getJalur(inv) !== jalur) return false;
      return displaySisaForPks(m) > 0 || isPksChecked(m);
    });

  const toggleJalur = (jalur: InvestorJalur) => {
    if (openJalurs.has(jalur)) {
      const mouIds = new Set(
        activeMous
          .filter((m) => { const inv = investors.find((x) => x.id === m.investorId); return inv && getJalur(inv) === jalur; })
          .map((m) => m.id),
      );
      setFormData((prev) => ({
        ...prev,
        investorEntries: prev.investorEntries.filter((e) => !mouIds.has(e.mouId)),
      }));
      setOpenJalurs((prev) => { const n = new Set(prev); n.delete(jalur); return n; });
    } else {
      const toAdd = pksByJalur(jalur)
        .filter((m) => !isPksChecked(m))
        .map((m) => {
          const inv = investors.find((x) => x.id === m.investorId);
          const pct = investorPct(inv?.brokerName ?? "");
          const alreadyEntered = formData.investorEntries
            .filter((e) => e.investorId === m.investorId)
            .reduce((s, e) => s + (parseFloat(e.nilaiInvestasi) || 0), 0);
          const remaining = Math.max(0, (inv ? sisaModal(inv) : 0) - alreadyEntered);
          return {
            mouId: m.id,
            investorId: m.investorId,
            nilaiInvestasi: Math.min(m.investmentAmount, remaining).toString(),
            ...pct,
          };
        });
      setFormData((prev) => ({
        ...prev,
        investorEntries: [
          ...prev.investorEntries.filter((e) => e.investorId),
          ...toAdd,
        ],
      }));
      setOpenJalurs((prev) => new Set([...prev, jalur]));
    }
  };

  const togglePks = (mou: MoU) => {
    setFormData((prev) => {
      const alreadyIn = prev.investorEntries.some((e) => e.mouId === mou.id);
      if (alreadyIn) {
        return { ...prev, investorEntries: prev.investorEntries.filter((e) => e.mouId !== mou.id) };
      }
      const inv = investors.find((x) => x.id === mou.investorId);
      const pct = investorPct(inv?.brokerName ?? "");
      const alreadyEntered = prev.investorEntries
        .filter((e) => e.investorId === mou.investorId)
        .reduce((s, e) => s + (parseFloat(e.nilaiInvestasi) || 0), 0);
      const remaining = Math.max(0, (inv ? sisaModal(inv) : 0) - alreadyEntered);
      return {
        ...prev,
        investorEntries: [
          ...prev.investorEntries.filter((e) => e.investorId),
          {
            mouId: mou.id,
            investorId: mou.investorId,
            nilaiInvestasi: Math.min(mou.investmentAmount, remaining).toString(),
            ...pct,
          },
        ],
      };
    });
  };

  const updateNilai = (mouId: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      investorEntries: prev.investorEntries.map((e) =>
        e.mouId === mouId ? { ...e, nilaiInvestasi: value } : e,
      ),
    }));
  };
  const set = (k: keyof Omit<TrxFormData, "investorEntries">, v: string) =>
    setFormData({ ...formData, [k]: v });

  const overLimitEntries = useMemo(() => {
    const ids = new Set<string>();
    const totalByInvestor = new Map<string, number>();
    
    formData.investorEntries.forEach((e) => {
      if (!e.mouId || !e.nilaiInvestasi) return;
      const nilai = parseFloat(e.nilaiInvestasi) || 0;
      totalByInvestor.set(e.investorId, (totalByInvestor.get(e.investorId) ?? 0) + nilai);
    });
    
    formData.investorEntries.forEach((e) => {
      if (!e.mouId || !e.nilaiInvestasi) return;
      const mou = activeMous.find((m) => m.id === e.mouId);
      if (!mou) return;
      const nilai = parseFloat(e.nilaiInvestasi) || 0;
      
      if (nilai > mou.investmentAmount) { ids.add(e.mouId); return; }
      
      const inv = investors.find((x) => x.id === e.investorId);
      if (!inv) return;
      
      const sisa = Math.max(0, inv.investmentAmount - (committedModal.get(inv.id) ?? 0));
      if ((totalByInvestor.get(e.investorId) ?? 0) > sisa) ids.add(e.mouId);
    });
    return ids;
  }, [formData.investorEntries, activeMous, investors, committedModal]);

  const handleFormSubmit = (e: React.FormEvent) => {
    if (overLimitEntries.size > 0) {
      e.preventDefault();
      return;
    }
    onSubmit(e);
  };

  const hpp         = parseFloat(formData.hpp) || 0;
  const modal       = parseFloat(formData.kebutuhanModal) || 0;
  const qty         = hpp > 0 ? modal / hpp : 0;
  const totalInv    = formData.investorEntries.reduce((s, e) => s + (parseFloat(e.nilaiInvestasi) || 0), 0);
  const selisih     = modal - totalInv;
  const ongkirPerKg = parseFloat(formData.ongkirPerKg) || 0;
  const totalOngkir = ongkirPerKg * qty;
  const hargaJual   = parseFloat(formData.hargaJual) || 0;
  const income      = hargaJual * qty;
  const profit      = income - (modal + totalOngkir);

  const getSelisihFormText = () => {
    if (modal <= 0) return "—";
    if (selisih === 0) return "✓ Terpenuhi";
    if (selisih > 0) return `Kurang ${formatRp(selisih)}`;
    return `Lebih ${formatRp(Math.abs(selisih))}`;
  };

  const getSelisihFormColor = () => {
    if (selisih === 0) return "text-green-700";
    if (selisih < 0) return "text-orange-600";
    return "text-red-600";
  };

  const brokerSummary = useMemo(() => {
    const sets = new Map<string, Set<string>>(); 
    formData.investorEntries.forEach((e) => {
      if (!e.investorId) return;
      const inv = investors.find((x) => x.id === e.investorId);
      if (!inv) return;
      const key = inv.brokerName?.trim() || "__langsung";
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key)!.add(inv.name);
    });
    const map = new Map<string, string[]>();
    sets.forEach((names, key) => map.set(key, Array.from(names)));
    return map;
  }, [formData.investorEntries, investors]);

  return (
    <form onSubmit={handleFormSubmit} className="flex flex-col gap-0">
      <div className="overflow-y-auto max-h-[62vh] pr-2 space-y-5">
        {/* Info Pengiriman */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Informasi Pengiriman
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">ID Transaksi</Label>
            <div className="px-3 py-2 bg-muted rounded-md text-sm font-mono text-muted-foreground">
              {previewId}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trx-date" className="text-xs">Tanggal <span className="text-destructive">*</span></Label>
              <Input id="trx-date" type="date" value={formData.date} onChange={(e) => set("date", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trx-desc" className="text-xs">Periode</Label>
              <Input id="trx-desc" value={formData.description} onChange={(e) => set("description", e.target.value)} placeholder="30 hari" />
            </div>
          </div>
        </div>

        {/* Modal & Kuantitas */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Modal &amp; Kuantitas
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trx-hpp" className="text-xs">HPP (Rp/kg) <span className="text-destructive">*</span></Label>
              <Input id="trx-hpp" type="number" min="0" step="10" value={formData.hpp} onChange={(e) => set("hpp", e.target.value)} placeholder="2000" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trx-modal" className="text-xs">Kebutuhan Modal (Rp) <span className="text-destructive">*</span></Label>
              <Input id="trx-modal" type="number" min="0" step="100000" value={formData.kebutuhanModal} onChange={(e) => set("kebutuhanModal", e.target.value)} placeholder="10000000" required />
            </div>
          </div>
          <Preview label="Quantity (kg) = Kebutuhan Modal ÷ HPP" value={hpp > 0 && modal > 0 ? formatQty(qty) : "—"} />
        </div>

        {/* Ongkir & Penjualan */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Ongkir &amp; Penjualan
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trx-ongkir" className="text-xs">Ongkir per KG (Rp) <span className="text-destructive">*</span></Label>
              <Input id="trx-ongkir" type="number" min="0" step="100" value={formData.ongkirPerKg} onChange={(e) => set("ongkirPerKg", e.target.value)} placeholder="500" required />
            </div>
            <Preview label="Total Ongkir = Ongkir/kg × Qty" value={ongkirPerKg > 0 && qty > 0 ? formatRp(totalOngkir) : "—"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trx-harga" className="text-xs">Harga Jual per KG (Rp) <span className="text-destructive">*</span></Label>
              <Input id="trx-harga" type="number" min="0" step="100" value={formData.hargaJual} onChange={(e) => set("hargaJual", e.target.value)} placeholder="3000" required />
            </div>
            <Preview label="Income = Harga Jual × Qty" value={hargaJual > 0 && qty > 0 ? formatRp(income) : "—"} />
          </div>
          {income > 0 && (
            <div className={`px-3 py-3 rounded-md flex items-center justify-between ${profit >= 0 ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
              <span className="flex items-center gap-2 text-sm font-medium">
                {profit >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                Profit = Income − (Modal + Total Ongkir)
              </span>
              <span className="font-bold">{formatRp(profit)}</span>
            </div>
          )}
        </div>

        {/* Kontribusi Investor */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">Kontribusi Investor</p>
          <div className="flex gap-4">
            {(["MB", "TM", "D"] as InvestorJalur[]).map((jalur) => (
              <label key={jalur} className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox checked={openJalurs.has(jalur)} onCheckedChange={() => toggleJalur(jalur)} />
                <span className="text-sm font-medium">{JALUR_LABEL[jalur]}</span>
              </label>
            ))}
          </div>

          {(["MB", "TM", "D"] as InvestorJalur[]).map((jalur) => {
            if (!openJalurs.has(jalur)) return null;
            const jalurPks = pksByJalur(jalur);
            return (
              <div key={jalur} className="rounded-md border border-border p-3 space-y-2 bg-muted/20">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{JALUR_LABEL[jalur]}</p>
                {jalurPks.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Mohon buat PKS terlebih dahulu</p>
                ) : (
                  <div className="space-y-2">
                    {jalurPks.map((mou) => {
                      const checked   = isPksChecked(mou);
                      const entry     = getEntryForPks(mou);
                      const isOver    = overLimitEntries.has(mou.id);
                      const sisa      = displaySisaForPks(mou);
                      const inv       = investors.find((x) => x.id === mou.investorId);
                      return (
                        <div key={mou.id} className="flex items-center gap-3">
                          <Checkbox checked={checked} onCheckedChange={() => togglePks(mou)} />
                          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-semibold text-foreground shrink-0">{mou.id}</span>
                              {inv?.brokerName && (
                                <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded shrink-0">
                                  {inv.brokerName}
                                </span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground truncate">{mou.investorName}</span>
                          </div>
                          {checked && (
                            <div className="flex flex-col items-end gap-0.5 shrink-0">
                              <Input
                                type="number" min="0" step="100000"
                                value={entry?.nilaiInvestasi ?? ""}
                                onChange={(e) => updateNilai(mou.id, e.target.value)}
                                className={`w-36 h-8 text-xs ${isOver ? "border-red-500 focus-visible:ring-red-500" : ""}`}
                                placeholder="Nilai investasi"
                              />
                              {isOver && <span className="text-[10px] text-red-500">Melebihi batas</span>}
                            </div>
                          )}
                          {!checked && (
                            <span className="w-36 shrink-0 px-3 py-1.5 text-xs text-muted-foreground bg-muted rounded-md">
                              {sisa > 0 ? formatRp(sisa) : "—"}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <div className="grid grid-cols-2 gap-3 pt-1">
            <Preview label="Total Nilai Investasi" value={totalInv > 0 ? formatRp(totalInv) : "—"} />
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Selisih Kebutuhan Modal</Label>
              <div className={`px-3 py-2 rounded-md text-sm font-semibold bg-muted ${getSelisihFormColor()}`}>
                {getSelisihFormText()}
              </div>
            </div>
          </div>
        </div>

        {/* Afiliasi Broker */}
        {brokerSummary.size > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">Afiliasi Broker</p>
            <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
              {Array.from(brokerSummary.entries()).map(([broker, names]) => (
                <div key={broker} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${broker === "__langsung" ? "bg-muted text-muted-foreground" : "bg-amber-50 border border-amber-200 text-amber-700"}`}>
                    {broker === "__langsung" ? "Langsung" : broker}
                  </span>
                  <span className="text-muted-foreground">{names.join(", ")}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <DialogFooter className="mt-4 pt-4 border-t shrink-0">
        <Button type="submit" disabled={isSaving || overLimitEntries.size > 0}>
          {isSaving ? "Menyimpan…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export function TransaksiContent() {
  const { transaksis, addTransaksi, updateTransaksi, deleteTransaksi, uploadBuktiTransaksi } = useTransaksi();
  const { investors }  = useInvestors();
  const { mous, updateMou, deleteMou } = useMou();
  const { user, isInvestor } = useAuth();
  
  const isAdmin   = user?.role === "admin";
  const perm      = usePermissions();
  const canCreate = isAdmin || perm.create;
  const canEdit   = isAdmin || perm.edit;
  const canDelete = isAdmin || perm.delete;

  const [isAddOpen, setIsAddOpen]             = useState(false);
  const [isEditOpen, setIsEditOpen]           = useState(false);
  const [isDeleteOpen, setIsDeleteOpen]       = useState(false);
  const [isFinalizeOpen, setIsFinalizeOpen]   = useState(false);
  const [isDeleting, setIsDeleting]           = useState(false);
  const [isSaving, setIsSaving]               = useState(false);
  const [isFinalizing, setIsFinalizing]       = useState(false);
  const [selected, setSelected]               = useState<Transaksi | null>(null);
  const [finalizeStatus, setFinalizeStatus]   = useState<TransaksiStatus>("selesai");
  const [finalizeNote, setFinalizeNote]       = useState("");
  const [errorInfo, setErrorInfo]             = useState<PbErrorInfo | null>(null);
  const [form, setForm]                       = useState<TrxFormData>(initialForm());
  
  // States: Dialog Tindak Lanjuti (Bagi Hasil)
  const [isBagiHasilOpen, setIsBagiHasilOpen]     = useState(false);
  const [bagiHasilTrx, setBagiHasilTrx]           = useState<Transaksi | null>(null);
  const [bagiHasilFiles, setBagiHasilFiles]            = useState<Record<string, File>>({});
  const [bagiHasilPreviews, setBagiHasilPreviews]      = useState<Record<string, string>>({});
  const [expandedBuktiKeys, setExpandedBuktiKeys]      = useState<Set<string>>(new Set());
  const [isSubmittingBH, setIsSubmittingBH]            = useState(false);

  // States: Dialog Pengembalian Modal
  const [isPengembalianOpen, setIsPengembalianOpen] = useState(false);
  const [pengembalianTrx, setPengembalianTrx]       = useState<Transaksi | null>(null);
  const [pengembalianFiles, setPengembalianFiles]       = useState<Record<string, File>>({});
  const [pengembalianPreviews, setPengembalianPreviews] = useState<Record<string, string>>({});
  const [expandedPengembalianKeys, setExpandedPengembalianKeys] = useState<Set<string>>(new Set());
  const [isSubmittingPengembalian, setIsSubmittingPengembalian] = useState(false);

  const visibleTransaksis = useMemo(() => {
    if (!isInvestor || !user?.investorId) return transaksis;
    return transaksis.filter((t) =>
      t.investorEntries.some((e) => e.investorId === user.investorId)
    );
  }, [transaksis, isInvestor, user?.investorId]);

  const metrics = useMemo(() => {
    let totalModal = 0, totalIncome = 0, totalProfit = 0;
    visibleTransaksis.forEach((t) => {
      const c = calcTransaksi(t);
      totalModal  += t.kebutuhanModal;
      totalIncome += c.income;
      totalProfit += c.profit;
    });
    return { totalModal, totalIncome, totalProfit, count: visibleTransaksis.length };
  }, [visibleTransaksis]);

  const sorted = useMemo(
    () => [...visibleTransaksis].sort((a, b) => b.date.localeCompare(a.date)),
    [visibleTransaksis],
  );

  const nextId = () => {
    const max = transaksis.reduce((m, x) => {
      const n = parseInt(x.id.replace("TRX-", "")) || 0;
      return n > m ? n : m;
    }, 0);
    return `TRX-${String(max + 1).padStart(4, "0")}`;
  };

  const formToData = (f: TrxFormData, existing?: Transaksi | null): Omit<Transaksi, "id"> => ({
    date:           f.date,
    description:    f.description,
    hpp:            parseFloat(f.hpp) || 0,
    kebutuhanModal: parseFloat(f.kebutuhanModal) || 0,
    investorEntries: f.investorEntries
      .filter((e) => e.investorId && e.nilaiInvestasi)
      .map((e) => {
        const inv = investors.find((x) => x.id === e.investorId);
        return {
          mouId:              e.mouId,
          investorId:         e.investorId,
          investorName:       inv?.name ?? e.investorId,
          investorBrokerName: inv?.brokerName ?? "",
          nilaiInvestasi:     parseFloat(e.nilaiInvestasi) || 0,
          pctTrader:          parseFloat(e.pctTrader)  || 0,
          pctMinBun:          parseFloat(e.pctMinBun)  || 0,
          pctBrokerI:         parseFloat(e.pctBrokerI) || 0,
          pctBrokerII:        0,
        };
      }),
    ongkirPerKg:  parseFloat(f.ongkirPerKg) || 0,
    hargaJual:    parseFloat(f.hargaJual) || 0,
    status:       existing?.status ?? "berjalan",
    catatanAkhir: existing?.catatanAkhir ?? "",
  });

  const reconcilePksTermination = async (affectedInvestorIds: string[], nextTransaksis: Transaksi[]) => {
    try {
      const ids = Array.from(new Set(affectedInvestorIds));
      for (const invId of ids) {
        const desired = !isInvestorActive(invId, nextTransaksis);
        for (const pks of mous.filter((m) => m.investorId === invId)) {
          if ((pks.isTerminated ?? false) !== desired) {
            await updateMou(pks.id, { isTerminated: desired });
          }
        }
      }
    } catch (err) {
      console.error("[transaksi] gagal sinkronkan status terminate PKS:", err);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const data = formToData(form);
      await addTransaksi(data);
      await reconcilePksTermination(
        data.investorEntries.map((e) => e.investorId),
        [...transaksis, { id: nextId(), ...data }],
      );
      toast.success("Transaksi berhasil disimpan");
      setForm(initialForm());
      setIsAddOpen(false);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal menyimpan transaksi"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setIsSaving(true);
    try {
      const data = formToData(form, selected);
      await updateTransaksi(selected.id, data);
      await reconcilePksTermination(
        [...selected.investorEntries, ...data.investorEntries].map((e) => e.investorId),
        transaksis.map((t) => (t.id === selected.id ? { ...t, ...data } : t)),
      );
      toast.success("Transaksi berhasil diperbarui");
      setForm(initialForm());
      setSelected(null);
      setIsEditOpen(false);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal memperbarui transaksi"));
    } finally {
      setIsSaving(false);
    }
  };

  const openEdit = (t: Transaksi) => {
    setSelected(t);
    const assignedMouIds = new Set<string>();
    setForm({
      date:        t.date,
      description: t.description,
      hpp:         t.hpp.toString(),
      kebutuhanModal: t.kebutuhanModal.toString(),
      investorEntries: t.investorEntries.length > 0
        ? t.investorEntries.map((e) => {
            const available = mous.filter(
              (m) => m.investorId === e.investorId && !m.isTerminated && !assignedMouIds.has(m.id),
            );
            const mouId = e.mouId || (available[0]?.id ?? "");
            if (mouId) assignedMouIds.add(mouId);
            return {
              mouId,
              investorId:     e.investorId,
              nilaiInvestasi: e.nilaiInvestasi.toString(),
              pctTrader:      e.pctTrader.toString(),
              pctMinBun:      e.pctMinBun.toString(),
              pctBrokerI:     e.pctBrokerI.toString(),
              pctBrokerII:    e.pctBrokerII.toString(),
            };
          })
        : [emptyEntry()],
      ongkirPerKg: t.ongkirPerKg.toString(),
      hargaJual:   t.hargaJual.toString(),
    });
    setIsEditOpen(true);
  };

  const openDelete = (t: Transaksi) => { setSelected(t); setIsDeleteOpen(true); };

  const confirmDelete = async () => {
    if (!selected) return;
    setIsDeleting(true);
    try {
      await deleteTransaksi(selected.id);
      await Promise.all(pksToBulkDelete.map((m) => deleteMou(m.id)));
      toast.success("Transaksi berhasil dihapus");
      setSelected(null);
      setIsDeleteOpen(false);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal menghapus transaksi"));
    } finally {
      setIsDeleting(false);
    }
  };

  const openFinalize = (t: Transaksi) => {
    setSelected(t);
    const eff = getDisplayStatus(t);
    setFinalizeStatus(eff === "berjalan" || eff === "selesai" ? "selesai" : eff);
    setFinalizeNote(t.catatanAkhir || "");
    setIsFinalizeOpen(true);
  };

  const handleFinalize = async () => {
    if (!selected) return;
    setIsFinalizing(true);
    try {
      await updateTransaksi(selected.id, { status: finalizeStatus, catatanAkhir: finalizeNote });
      await reconcilePksTermination(
        selected.investorEntries.map((e) => e.investorId),
        transaksis.map((t) => (t.id === selected.id ? { ...t, status: finalizeStatus, catatanAkhir: finalizeNote } : t)),
      );
      toast.success(`Status transaksi ${selected.id} diubah ke "${TRANSAKSI_STATUS_LABEL[finalizeStatus]}"`);
      setIsFinalizeOpen(false);
      setSelected(null);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal mengubah status transaksi"));
    } finally {
      setIsFinalizing(false);
    }
  };

  // Handler Buka Dialog 1 (Bagi Hasil / Tindak Lanjuti)
  const openBagiHasil = (t: Transaksi) => {
    setBagiHasilTrx(t);
    setBagiHasilFiles({});
    setBagiHasilPreviews({});
    setExpandedBuktiKeys(new Set());
    setIsBagiHasilOpen(true);
  };

  // Handler Buka Dialog 2 (Pengembalian Modal)
  const openPengembalianModal = (t: Transaksi) => {
    setPengembalianTrx(t);
    setPengembalianFiles({});
    setPengembalianPreviews({});
    setExpandedPengembalianKeys(new Set());
    setIsPengembalianOpen(true);
  };

  const toggleBuktiExpand = (checkKey: string) => {
    setExpandedBuktiKeys((prev) => {
      const next = new Set(prev);
      if (next.has(checkKey)) next.delete(checkKey); else next.add(checkKey);
      return next;
    });
  };

  const togglePengembalianExpand = (checkKey: string) => {
    setExpandedPengembalianKeys((prev) => {
      const next = new Set(prev);
      if (next.has(checkKey)) next.delete(checkKey); else next.add(checkKey);
      return next;
    });
  };

  const handleBagiHasilFileChange = (checkKey: string, file: File | null) => {
    if (!file) {
      setBagiHasilFiles((prev) => { const n = { ...prev }; delete n[checkKey]; return n; });
      setBagiHasilPreviews((prev) => { const n = { ...prev }; delete n[checkKey]; return n; });
      return;
    }
    setBagiHasilFiles((prev) => ({ ...prev, [checkKey]: file }));
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setBagiHasilPreviews((prev) => ({ ...prev, [checkKey]: ev.target?.result as string }));
      reader.readAsDataURL(file);
    } else {
      setBagiHasilPreviews((prev) => { const n = { ...prev }; delete n[checkKey]; return n; });
    }
  };

  const handlePengembalianFileChange = (checkKey: string, file: File | null) => {
    if (!file) {
      setPengembalianFiles((prev) => { const n = { ...prev }; delete n[checkKey]; return n; });
      setPengembalianPreviews((prev) => { const n = { ...prev }; delete n[checkKey]; return n; });
      return;
    }
    setPengembalianFiles((prev) => ({ ...prev, [checkKey]: file }));
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => setPengembalianPreviews((prev) => ({ ...prev, [checkKey]: ev.target?.result as string }));
      reader.readAsDataURL(file);
    } else {
      setPengembalianPreviews((prev) => { const n = { ...prev }; delete n[checkKey]; return n; });
    }
  };

  // Proses Submit Dialog 1: Tindak Lanjuti
  // Proses Submit Dialog 1: Tindak Lanjuti
  const handleBagiHasil = async (action: "perbarui" | "Akhiri") => {
    if (!bagiHasilTrx) return;
    setIsSubmittingBH(true);
    try {
      // Pindahkan kalkulasi rows ke atas agar bisa digunakan untuk mencari 'keterangan' asli
      const rows = calcBagiHasilRows(bagiHasilTrx, mous);

      // 1. Upload semua bukti bagi hasil terlebih dahulu
      const uploadedUrls: Record<string, string> = {};
      for (const [checkKey, file] of Object.entries(bagiHasilFiles)) {
        const row = rows.find((r) => r.checkKey === checkKey);
        if (row) {
          const url = await uploadBuktiTransaksi(bagiHasilTrx.id, row.keterangan, file);
          uploadedUrls[checkKey] = url;
        }
      }

      // 2. 🚀 PANGGIL API UNTUK MENGIRIM WA KE INVESTOR
      for (const row of rows) {
        if (row.keterangan === "Investor" && row.investorId) {
          await fetch("/api/notify-investor", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${pb.authStore.token}`
            },
            body: JSON.stringify({
              transaksiId: bagiHasilTrx.id,
              keterangan: "Bagi Hasil",
              investorId: row.investorId,
              jumlah: row.jumlah,
              buktiUrl: uploadedUrls[row.checkKey] || ""
            })
          }).catch(err => console.error("Gagal panggil API WA:", err));
        }
      }

      if (action === "Akhiri") {
        // Tandai bagi hasil selesai, bersiap untuk pengembalian modal
        const allChecks: Record<string, boolean> = {};
        rows.forEach((r) => { allChecks[r.checkKey] = true; });
        await updateTransaksi(bagiHasilTrx.id, { bagiHasilChecks: allChecks, bagiHasilDone: true });
        
        const txToForward = bagiHasilTrx; // simpan referensi sebelum di-null
        setIsBagiHasilOpen(false);
        setBagiHasilTrx(null);
        
        // Membuka dialog 2: Pengembalian Modal
        openPengembalianModal(txToForward);
      } else {
        // Perpanjang (Perbarui) transaksi 30 hari ke depan
        const today = todayWibStr();
        await updateTransaksi(bagiHasilTrx.id, {
          status: "berjalan",
          date: today,
          bagiHasilDone: false,
          bagiHasilChecks: {},
        });
        await reconcilePksTermination(
          bagiHasilTrx.investorEntries.map((e) => e.investorId),
          transaksis.map((x) =>
            x.id === bagiHasilTrx.id ? { ...x, status: "berjalan" as TransaksiStatus, date: today } : x,
          ),
        );
        toast.success(`TRX ${bagiHasilTrx.id} diperbarui — periode baru dimulai`);
        setIsBagiHasilOpen(false);
        setBagiHasilTrx(null);
      }
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal memproses tindak lanjut"));
    } finally {
      setIsSubmittingBH(false);
    }
  };

  // Proses Submit Dialog 2: Pengembalian Modal
  // Proses Submit Dialog 2: Pengembalian Modal
  const handlePengembalianAkhiri = async () => {
    if (!pengembalianTrx) return;
    setIsSubmittingPengembalian(true);
    try {
      for (const [checkKey, file] of Object.entries(pengembalianFiles)) {
        // Karena ini pengembalian modal ke investor, keterangannya kita kunci ke "Investor"
        await uploadBuktiTransaksi(pengembalianTrx.id, "Investor", file);
      }
      
      // Akhiri transaksi sepenuhnya
      await updateTransaksi(pengembalianTrx.id, { status: "selesai" });
      await reconcilePksTermination(
        pengembalianTrx.investorEntries.map((e) => e.investorId),
        transaksis.map((x) =>
          x.id === pengembalianTrx.id ? { ...x, status: "selesai" } : x,
        ),
      );

      toast.success(`Transaksi ${pengembalianTrx.id} resmi diakhiri`);
      setIsPengembalianOpen(false);
      setPengembalianTrx(null);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal menyimpan pengembalian modal"));
    } finally {
      setIsSubmittingPengembalian(false);
    }
  };

  const editingTransaksi = isEditOpen ? selected : null;
  const committedModal = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transaksis) {
      if (editingTransaksi && t.id === editingTransaksi.id) continue;
      const eff = effectiveStatus(t);
      if (eff !== "berjalan" && eff !== "bermasalah") continue;
      for (const e of t.investorEntries) {
        if (e.nilaiInvestasi > 0) {
          map.set(e.investorId, (map.get(e.investorId) ?? 0) + e.nilaiInvestasi);
        }
      }
    }
    return map;
  }, [transaksis, editingTransaksi]);

  const activeMous = useMemo(() => mous.filter((m) => !m.isTerminated), [mous]);

  const pksToBulkDelete = useMemo(() => {
    if (!selected) return [];
    const remainingActiveInvestors = new Set(
      transaksis
        .filter((t) => t.id !== selected.id)
        .filter((t) => { const e = effectiveStatus(t); return e === "berjalan" || e === "bermasalah"; })
        .flatMap((t) => t.investorEntries.map((e) => e.investorId)),
    );
    return mous.filter((m) => {
      if (!selected.investorEntries.some((e) => e.investorId === m.investorId)) return false;
      if (remainingActiveInvestors.has(m.investorId)) return false;
      return !m.isTerminated && !m.isComplete;
    });
  }, [selected, transaksis, mous]);

  const sharedFormProps = { investors, activeMous, committedModal, isSaving };

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Transaksi</h1>
          <p className="text-muted-foreground">Input data pengiriman dan hitung profit secara otomatis</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) setForm(initialForm()); }}>
          {canCreate && <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-2" />Tambah Transaksi</Button>
          </DialogTrigger>}
          <DialogContent className="sm:max-w-[660px]">
            <DialogHeader>
              <DialogTitle>Tambah Transaksi Baru</DialogTitle>
              <DialogDescription>
                Isi data pengiriman — nilai quantity, total ongkir, income, dan profit dihitung otomatis
              </DialogDescription>
            </DialogHeader>
            <TrxFormFields
              formData={form} setFormData={setForm}
              onSubmit={handleAdd} submitLabel="Simpan Transaksi"
              previewId={nextId()}
              {...sharedFormProps}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transaksi</CardTitle>
            <PackageCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.count}</div>
            <p className="text-xs text-muted-foreground">pengiriman tercatat</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Modal</CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatShort(metrics.totalModal)}</div>
            <p className="text-xs text-muted-foreground">{formatRp(metrics.totalModal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Income</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatShort(metrics.totalIncome)}</div>
            <p className="text-xs text-muted-foreground">{formatRp(metrics.totalIncome)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
            {metrics.totalProfit >= 0
              ? <TrendingUp className="h-4 w-4 text-green-500" />
              : <TrendingDown className="h-4 w-4 text-red-500" />}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${metrics.totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
              {formatShort(metrics.totalProfit)}
            </div>
            <p className="text-xs text-muted-foreground">{formatRp(metrics.totalProfit)}</p>
          </CardContent>
        </Card>
      </div>

      {/* ── Riwayat Transaksi ── */}
      {visibleTransaksis.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14">
            <PackageCheck className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Belum ada transaksi</h3>
            <p className="text-muted-foreground text-sm">Tambahkan transaksi pertama dengan klik tombol di atas</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Riwayat Transaksi</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left  py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">ID</th>
                    <th className="text-left  py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">Tanggal</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">Status</th>
                    <th className="text-left  py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">Periode</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">HPP</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">Qty</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">Modal</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">Investor</th>
                    <th className="text-left  py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">Broker</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">Selisih</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">Income</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">Profit</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((t) => {
                    const c = calcTransaksi(t);
                    const baseStatus = effectiveStatus(t);
                    const displayStatus = getDisplayStatus(t);

                    const brokers = [...new Set(
                      t.investorEntries
                        .map((e) => e.investorBrokerName)
                        .filter(Boolean)
                    )];
                    const brokerLabel = brokers.length > 0 ? brokers.join(", ") : "—";
                    return (
                      <tr key={t.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs font-medium">{t.id}</td>
                        <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{formatDate(t.date)}</td>
                        <td className="py-3 px-4 text-center">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${statusVariant(displayStatus)}`}>
                            {TRANSAKSI_STATUS_LABEL[displayStatus] || displayStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground max-w-[140px]">
                          <div className="truncate">{t.description || "—"}</div>
                          {baseStatus === "berjalan" && (() => {
                            const s = sisaHari(t);
                            return (
                              <div className={`text-[10px] ${getSisaHariColor(s)}`}>
                                {getSisaHariText(s)}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">{formatRp(t.hpp)}</td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">{formatQty(c.qty)}</td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">{formatRp(t.kebutuhanModal)}</td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center justify-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                            {t.investorEntries.length} investor
                          </span>
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">{brokerLabel}</td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <span className={`text-xs font-medium ${getSelisihStatusColor(c.selisih)}`}>
                            {getSelisihStatusText(c.selisih)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-medium whitespace-nowrap">{formatRp(c.income)}</td>
                        <td className={`py-3 px-4 text-right font-bold whitespace-nowrap ${c.profit >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatRp(c.profit)}
                        </td>
                        <td className="py-3 px-4">
                          {(canEdit || canDelete) && (
                          <div className="flex items-center justify-center gap-1">
                            {canEdit && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Ubah status" onClick={() => openFinalize(t)}>
                              <ClipboardCheck className="h-3.5 w-3.5 text-blue-500" />
                            </Button>
                            )}
                            {canEdit && (displayStatus === "selesai" || displayStatus === "bermasalah") && (
                            <Button
                              variant="ghost" size="icon" className="h-7 w-7"
                              title="Tindak Lanjuti"
                              onClick={() => t.bagiHasilDone ? openPengembalianModal(t) : openBagiHasil(t)}
                            >
                              <Coins className="h-3.5 w-3.5 text-green-600" />
                            </Button>
                            )}
                            {canEdit && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            )}
                            {canDelete && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openDelete(t)}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                            )}
                          </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/20">
                    <td colSpan={10} className="py-3 px-4 font-semibold text-sm">
                      Total ({visibleTransaksis.length} transaksi)
                    </td>
                    <td className="py-3 px-4 text-right font-bold whitespace-nowrap">{formatRp(metrics.totalIncome)}</td>
                    <td className={`py-3 px-4 text-right font-bold whitespace-nowrap ${metrics.totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatRp(metrics.totalProfit)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Finalisasi Dialog ── */}
      <Dialog open={isFinalizeOpen} onOpenChange={(open) => { setIsFinalizeOpen(open); if (!open) setSelected(null); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Ubah Status Transaksi</DialogTitle>
            <DialogDescription>
              {selected?.id}{selected?.description ? ` — ${selected.description}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Status Baru</Label>
              <Select value={finalizeStatus} onValueChange={(v) => setFinalizeStatus(v as TransaksiStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(TRANSAKSI_STATUS_LABEL) as TransaksiStatus[])
                    .filter((s) => s !== "perbarui")
                    .map((s) => (
                    <SelectItem key={s} value={s}>{TRANSAKSI_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Catatan Akhir</Label>
              <Textarea
                placeholder="Isi catatan jika ada — wajib untuk status Bermasalah"
                value={finalizeNote}
                onChange={(e) => setFinalizeNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsFinalizeOpen(false)} disabled={isFinalizing}>Batal</Button>
            <Button onClick={handleFinalize} disabled={isFinalizing}>
              {isFinalizing ? "Menyimpan…" : "Simpan Status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Dialog ── */}
      <Dialog open={isEditOpen} onOpenChange={(open) => { setIsEditOpen(open); if (!open) { setSelected(null); setForm(initialForm()); } }}>
        <DialogContent className="sm:max-w-[660px]">
          <DialogHeader>
            <DialogTitle>Edit Transaksi</DialogTitle>
            <DialogDescription>Perbarui data transaksi — ID tidak dapat diubah</DialogDescription>
          </DialogHeader>
          <TrxFormFields
            formData={form} setFormData={setForm}
            onSubmit={handleEdit} submitLabel="Simpan Perubahan"
            previewId={selected?.id ?? ""}
            {...sharedFormProps}
          />
        </DialogContent>
      </Dialog>

      {/* ── Delete Dialog ── */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Hapus Transaksi</DialogTitle>
            <DialogDescription>
              Yakin ingin menghapus transaksi <strong>{selected?.id}</strong>
              {selected?.description ? ` — ${selected.description}` : ""}?
            </DialogDescription>
          </DialogHeader>
          {pksToBulkDelete.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 space-y-2">
              <p className="text-sm font-medium text-destructive">PKS yang ikut dihapus:</p>
              <ul className="space-y-1">
                {pksToBulkDelete.map((m) => (
                  <li key={m.id} className="flex items-center justify-between text-xs">
                    <span className="font-mono text-muted-foreground">{m.id}</span>
                    <span className="font-medium">{m.investorName}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                PKS investor yang masih aktif di transaksi lain tidak akan dihapus.
              </p>
            </div>
          )}
          <p className="text-sm text-destructive font-medium">Tindakan ini tidak dapat dibatalkan.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)} disabled={isDeleting}>Batal</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isDeleting}>
              {isDeleting ? "Menghapus…" : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog 1: Tindak Lanjuti (Bagi Hasil) ── */}
      <Dialog
        open={isBagiHasilOpen}
        onOpenChange={(open) => {
          setIsBagiHasilOpen(open);
          if (!open) { setBagiHasilTrx(null); setBagiHasilFiles({}); setBagiHasilPreviews({}); setExpandedBuktiKeys(new Set()); }
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-green-600" />
              Tindak Lanjuti — {bagiHasilTrx?.id}
            </DialogTitle>
            <DialogDescription>
              Tahap 1: Rincian Bagi Hasil · Upload bukti transfer profit ke para pihak
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto max-h-[65vh] pr-1">

          {bagiHasilTrx && (() => {
            const rows = calcBagiHasilRows(bagiHasilTrx, mous);
            if (rows.length === 0) return (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Tidak ada profit untuk dibagi hasil.
              </p>
            );
            const total = rows.reduce((s, r) => s + r.jumlah, 0);
            const badgeKet: Record<string, string> = {
              Investor: "bg-orange-100 text-orange-700 border-orange-200",
              Broker:   "bg-blue-100   text-blue-700   border-blue-200",
              Trader:   "bg-purple-100 text-purple-700 border-purple-200",
              MinBun:   "bg-green-100  text-green-700  border-green-200",
            };
            return (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="py-2 px-3 text-left font-medium text-muted-foreground">Penerima</th>
                      <th className="py-2 px-3 text-left font-medium text-muted-foreground">Jenis</th>
                      <th className="py-2 px-3 text-right font-medium text-muted-foreground">Jumlah</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const canUpload   = r.keterangan !== "MinBun";
                      const isExpanded  = expandedBuktiKeys.has(r.checkKey);
                      const file        = canUpload ? bagiHasilFiles[r.checkKey] : undefined;
                      const preview     = canUpload ? bagiHasilPreviews[r.checkKey] : undefined;
                      
                      const chevronIcon = isExpanded 
                        ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> 
                        : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;

                      return (
                        <Fragment key={r.checkKey}>
                          <tr
                            className={`border-b border-border/50 transition-colors ${
                              canUpload ? "cursor-pointer hover:bg-muted/30 select-none" : ""
                            }`}
                            onClick={canUpload ? () => toggleBuktiExpand(r.checkKey) : undefined}
                          >
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-1.5">
                                {canUpload ? chevronIcon : <span className="w-3.5 shrink-0" />}
                                <span className={canUpload ? "font-medium" : ""}>{r.nama}</span>
                                {Boolean(file) && !isExpanded && (
                                  <FileCheck className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badgeKet[r.keterangan]}`}>
                                {r.keterangan}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-semibold">{formatRp(r.jumlah)}</td>
                          </tr>

                          {canUpload && isExpanded && (
                            <tr className="border-b border-border/50 bg-muted/10">
                              <td colSpan={3} className="px-4 py-3 space-y-2">
                                <label className={`flex items-center gap-3 w-full border-2 border-dashed rounded-lg cursor-pointer transition-colors px-4 py-3 ${
                                  file
                                    ? "border-green-400 bg-green-50 dark:bg-green-950/20"
                                    : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"
                                }`}>
                                  <input
                                    type="file"
                                    accept="image/*,.pdf"
                                    className="hidden"
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      handleBagiHasilFileChange(r.checkKey, e.target.files?.[0] ?? null);
                                    }}
                                  />
                                  {file ? (
                                    <>
                                      <FileCheck className="h-5 w-5 text-green-500 shrink-0" />
                                      <div className="min-w-0">
                                        <p className="text-xs font-medium text-green-700 dark:text-green-400 truncate">{file.name}</p>
                                        <p className="text-[10px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB · Klik ganti</p>
                                      </div>
                                    </>
                                  ) : (
                                    <>
                                      <Upload className="h-5 w-5 text-muted-foreground shrink-0" />
                                      <span className="text-xs text-muted-foreground">Klik untuk upload bukti profit</span>
                                    </>
                                  )}
                                </label>
                                {preview && (
                                  <div className="rounded-lg overflow-hidden border">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={preview} alt={`Preview ${r.keterangan}`} className="w-full max-h-32 object-contain bg-muted" />
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    <tr className="bg-muted/20">
                      <td colSpan={2} className="py-2 px-3 text-xs text-muted-foreground font-medium">Total Bagi Hasil</td>
                      <td className="py-2 px-3 text-right font-bold">{formatRp(total)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            );
          })()}

          </div>

          <DialogFooter className="gap-2 flex-wrap sm:flex-nowrap">
            <Button variant="outline" onClick={() => setIsBagiHasilOpen(false)} disabled={isSubmittingBH}>
              Batal
            </Button>
            <Button
              variant="outline"
              onClick={() => { handleBagiHasil("perbarui").catch(console.error); }}
              disabled={isSubmittingBH}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              {isSubmittingBH ? "Menyimpan…" : "Perbarui"}
            </Button>
            <Button
              onClick={() => { handleBagiHasil("Akhiri").catch(console.error); }}
              disabled={isSubmittingBH}
            >
              <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />
              {isSubmittingBH ? "Memproses…" : "Akhiri"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog 2: Akhiri (Pengembalian Modal) ── */}
      <Dialog
        open={isPengembalianOpen}
        onOpenChange={(open) => {
          setIsPengembalianOpen(open);
          if (!open) { setPengembalianTrx(null); setPengembalianFiles({}); setPengembalianPreviews({}); setExpandedPengembalianKeys(new Set()); }
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-green-600" />
              Pengembalian Modal — {pengembalianTrx?.id}
            </DialogTitle>
            <DialogDescription>
              Tahap 2: Upload bukti transfer pengembalian modal kepada para Investor.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto max-h-[65vh] pr-1">
            {pengembalianTrx && (() => {
              const rows = pengembalianTrx.investorEntries.filter(e => e.nilaiInvestasi > 0);
              if (rows.length === 0) return (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  Tidak ada modal yang harus dikembalikan.
                </p>
              );

              return (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="py-2 px-3 text-left font-medium text-muted-foreground">Investor</th>
                        <th className="py-2 px-3 text-right font-medium text-muted-foreground">Modal Investasi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const checkKey = `Modal_${r.investorId}`;
                        const isExpanded = expandedPengembalianKeys.has(checkKey);
                        const file = pengembalianFiles[checkKey];
                        const preview = pengembalianPreviews[checkKey];
                        
                        const chevronIcon = isExpanded 
                          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> 
                          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;

                        return (
                          <Fragment key={checkKey}>
                            <tr
                              className="border-b border-border/50 transition-colors cursor-pointer hover:bg-muted/30 select-none"
                              onClick={() => togglePengembalianExpand(checkKey)}
                            >
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-1.5">
                                  {chevronIcon}
                                  <span className="font-medium">{r.investorName}</span>
                                  {Boolean(file) && !isExpanded && (
                                    <FileCheck className="h-3.5 w-3.5 text-green-500 shrink-0" />
                                  )}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-semibold">{formatRp(r.nilaiInvestasi)}</td>
                            </tr>
                            
                            {isExpanded && (
                              <tr className="border-b border-border/50 bg-muted/10">
                                <td colSpan={2} className="px-4 py-3 space-y-2">
                                  <label className={`flex items-center gap-3 w-full border-2 border-dashed rounded-lg cursor-pointer transition-colors px-4 py-3 ${
                                    file ? "border-green-400 bg-green-50 dark:bg-green-950/20" : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"
                                  }`}>
                                    <input
                                      type="file"
                                      accept="image/*,.pdf"
                                      className="hidden"
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        handlePengembalianFileChange(checkKey, e.target.files?.[0] ?? null);
                                      }}
                                    />
                                    {file ? (
                                      <>
                                        <FileCheck className="h-5 w-5 text-green-500 shrink-0" />
                                        <div className="min-w-0">
                                          <p className="text-xs font-medium text-green-700 dark:text-green-400 truncate">{file.name}</p>
                                          <p className="text-[10px] text-muted-foreground">{(file.size / 1024).toFixed(0)} KB · Klik ganti</p>
                                        </div>
                                      </>
                                    ) : (
                                      <>
                                        <Upload className="h-5 w-5 text-muted-foreground shrink-0" />
                                        <span className="text-xs text-muted-foreground">Klik untuk upload bukti pengembalian modal</span>
                                      </>
                                    )}
                                  </label>
                                  {preview && (
                                    <div className="rounded-lg overflow-hidden border">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={preview} alt="Preview" className="w-full max-h-32 object-contain bg-muted" />
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsPengembalianOpen(false)} disabled={isSubmittingPengembalian}>
              Batal
            </Button>
            <Button
              onClick={handlePengembalianAkhiri}
              disabled={isSubmittingPengembalian}
            >
              {isSubmittingPengembalian ? "Menyimpan…" : "Selesaikan Transaksi"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Error Dialog ── */}
      <ErrorDialog
        open={!!errorInfo}
        onClose={() => setErrorInfo(null)}
        error={errorInfo}
      />
    </div>
  );
}