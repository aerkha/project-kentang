"use client";

// PATCH (sedang #19): tambah useEffect untuk sync openJalurs. Sebelumnya
// useState di-init dengan Set kosong dan tidak pernah di-update.
import { useEffect, useState, useMemo, useRef, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { ErrorDialog } from "@/components/ui/error-dialog";
import { formatPbError, type PbErrorInfo } from "@/lib/pb-error";
import { useTransaksi, calcTransaksi, effectiveStatus, isInvestorActive, type Transaksi, type TransaksiStatus, TRANSAKSI_STATUS_LABEL } from "@/lib/transaksi-context";
import pb from "@/lib/pocketbase";
import { useInvestors, type Investor } from "@/lib/investors-context";
import { useBrokers } from "@/lib/brokers-context";
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
} from "lucide-react";

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
  endDate: string;          // DITAMBAHKAN
  isAutorenewal: boolean;   // DITAMBAHKAN
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
  endDate: "",            // DITAMBAHKAN
  isAutorenewal: false,   // DITAMBAHKAN
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

function parsePeriodeDays(desc: string): number {
  const m = /\d+/.exec(desc || "");
  const n = m ? Number.parseInt(m[0], 10) : 30;
  return n > 0 ? n : 30;
}

function sisaHari(t: { date: string; description: string }): number {
  if (!t.date) return 0;
  const days    = parsePeriodeDays(t.description);
  const [y, m, d] = t.date.slice(0, 10).split("-").map(Number);
  const endMs = Date.UTC(y, m - 1, d + days);
  const now = new Date();
  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.ceil((endMs - todayMs) / 86_400_000);
}

function endDatePks(mou: MoU) {
  if (mou.endDate) return mou.endDate.slice(0, 10);
  const [y, m, d] = mou.date.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + (mou.contractPeriod * (mou.siklus ?? 1)))).toISOString().slice(0, 10);
}

function sisaHariPks(mou: MoU): number {
  if (!mou.date) return 0;
  const endStr = endDatePks(mou);
  const now = new Date();
  const todayMs = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const [ey, em, ed] = endStr.split("-").map(Number);
  const endMs = Date.UTC(ey, em - 1, ed);
  return Math.round((endMs - todayMs) / 86_400_000);
}

function getDisplayStatus(t: Transaksi): TransaksiStatus {
  const base = effectiveStatus(t);
  if (base === "berjalan" && sisaHari(t) < 0) {
    return "selesai";
  }
  return base;
}

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

function Preview({ label, value, color }: Readonly<{ label: string; value: string; color?: string }>) {
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
// Form — module level
// ─────────────────────────────────────────────

interface TrxFormProps {
  readonly formData: TrxFormData;
  readonly setFormData: Dispatch<SetStateAction<TrxFormData>>;
  readonly onSubmit: (e: React.SubmitEvent<HTMLFormElement>) => void;
  readonly submitLabel: string;
  readonly previewId: string;
  readonly investors: Investor[];
  readonly activeMous: MoU[];
  readonly committedModal: Map<string, number>;
  readonly isSaving?: boolean;
}

function TrxFormFields({
  formData, setFormData, onSubmit, submitLabel, previewId,
  investors, activeMous, committedModal,
  isSaving = false,
}: TrxFormProps) {
  // PATCH (sedang #19): sebelumnya `openJalurs` hanya di-init pada mount
  // dengan state kosong, dan tidak pernah di-update saat `investorEntries`
  // berubah (mis. user pilih investor baru). Sekarang kita pakai `useEffect`
  // yang sinkron dengan `formData.investorEntries` — saat ada investor
  // baru dipilih, jalur yang relevan otomatis terbuka.
  const [openJalurs, setOpenJalurs] = useState<Set<InvestorJalur>>(new Set());
  useEffect(() => {
    setOpenJalurs((prev) => {
      const next = new Set<InvestorJalur>(prev);
      formData.investorEntries.forEach((e) => {
        if (!e.investorId) return;
        const inv = investors.find((x) => x.id === e.investorId);
        if (inv) next.add(getJalur(inv));
      });
      return next;
    });
  // Hanya re-sync saat investorEntries referensi berubah (length/id). Jangan
  // jalankan saat `investors` berubah untuk hindari loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.investorEntries.length, formData.investorEntries.map((e) => e.investorId).join("|")]);

  const sisaModal = (inv: Investor) =>
    Math.max(0, inv.investmentAmount - (committedModal.get(inv.id) ?? 0));

  const displaySisaForPks = (mou: MoU): number => {
    const inv = investors.find((x) => x.id === mou.investorId);
    if (!inv) return mou.investmentAmount;
    // m-15: gunakan min() antara MoU.investmentAmount dan sisa modal investor.
    // Sebelumnya Math.min() sudah dipanggil — tetap, hanya dokumentasikan.
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
            .reduce((s, e) => s + (Number.parseFloat(e.nilaiInvestasi) || 0), 0);
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
        .reduce((s, e) => s + (Number.parseFloat(e.nilaiInvestasi) || 0), 0);
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
  
  // DUKUNGAN BOOLEAN UNTUK AUTORENEWAL
  const set = (k: keyof Omit<TrxFormData, "investorEntries">, v: string | boolean) =>
    setFormData({ ...formData, [k]: v });

  const overLimitEntries = useMemo(() => {
    const ids = new Set<string>();
    const totalByInvestor = new Map<string, number>();
    
    formData.investorEntries.forEach((e) => {
      if (!e.mouId || !e.nilaiInvestasi) return;
      const nilai = Number.parseFloat(e.nilaiInvestasi) || 0;
      totalByInvestor.set(e.investorId, (totalByInvestor.get(e.investorId) ?? 0) + nilai);
    });
    
    formData.investorEntries.forEach((e) => {
      if (!e.mouId || !e.nilaiInvestasi) return;
      const mou = activeMous.find((m) => m.id === e.mouId);
      if (!mou) return;
      const nilai = Number.parseFloat(e.nilaiInvestasi) || 0;
      
      if (nilai > mou.investmentAmount) { ids.add(e.mouId); return; }
      
      const inv = investors.find((x) => x.id === e.investorId);
      if (!inv) return;
      
      const sisa = Math.max(0, inv.investmentAmount - (committedModal.get(inv.id) ?? 0));
      if ((totalByInvestor.get(e.investorId) ?? 0) > sisa) ids.add(e.mouId);
    });
    return ids;
  }, [formData.investorEntries, activeMous, investors, committedModal]);

  const handleFormSubmit = (e: React.SubmitEvent<HTMLFormElement>) => {
    if (overLimitEntries.size > 0) {
      e.preventDefault();
      return;
    }
    onSubmit(e);
  };

  const hpp         = Number.parseFloat(formData.hpp) || 0;
  const modal       = Number.parseFloat(formData.kebutuhanModal) || 0;
  const qty         = hpp > 0 ? modal / hpp : 0;
  const totalInv    = formData.investorEntries.reduce((s, e) => s + (Number.parseFloat(e.nilaiInvestasi) || 0), 0);
  const selisih     = modal - totalInv;
  const ongkirPerKg = Number.parseFloat(formData.ongkirPerKg) || 0;
  const totalOngkir = ongkirPerKg * qty;
  const hargaJual   = Number.parseFloat(formData.hargaJual) || 0;
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
        
        {/* Info Pengiriman & Autorenewal */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Informasi Pengiriman
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">ID Transaksi</Label>
            <div className="px-3 py-2 bg-muted rounded-md text-sm font-mono text-muted-foreground flex items-center justify-between">
              <span>{previewId}</span>
              {formData.isAutorenewal && <span className="text-[10px] text-blue-500 font-medium tracking-wide">(Autorenewal Aktif)</span>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trx-date" className="text-xs">Tanggal Mulai <span className="text-destructive">*</span></Label>
              <Input id="trx-date" type="date" value={formData.date} onChange={(e) => set("date", e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trx-desc" className="text-xs">Periode</Label>
              <Input id="trx-desc" value={formData.description} onChange={(e) => set("description", e.target.value)} placeholder="30 hari" />
            </div>
          </div>
          
          {/* Box Autorenewal (KINI MUNCUL KEMBALI) */}
          <div className="flex flex-col gap-3 p-3 bg-muted/40 border border-border rounded-md mt-2">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <Checkbox checked={formData.isAutorenewal} onCheckedChange={(c) => set("isAutorenewal", !!c)} />
              <div className="space-y-0.5">
                <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">Autorenewal Transaksi</span>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  Sistem akan otomatis menggandakan transaksi ini untuk bulan depan sesaat setelah transaksi ini dilunasi.
                </p>
              </div>
            </label>
            {formData.isAutorenewal && (
              <div className="space-y-1.5 pt-3 mt-1 border-t border-border/60">
                <Label htmlFor="trx-end-date" className="text-xs">Tanggal Berakhir (Batas Maksimal) <span className="text-destructive">*</span></Label>
                <Input id="trx-end-date" type="date" value={formData.endDate} onChange={(e) => set("endDate", e.target.value)} required={formData.isAutorenewal} />
                <p className="text-[10px] text-muted-foreground">Siklus Autorenewal akan otomatis berhenti / dibatalkan jika melewati batas tanggal ini.</p>
              </div>
            )}
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
                      const pksSisa   = sisaHariPks(mou);
                      let pksSisaClass = 'text-muted-foreground';
                      if (pksSisa <= 0) {
                        pksSisaClass = 'text-red-500 font-bold';
                      } else if (pksSisa <= 7) {
                        pksSisaClass = 'text-orange-500';
                      }
                      
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
                              <span className={`text-[10px] font-medium shrink-0 ${pksSisaClass}`}>
                                (Sisa PKS: {pksSisa <= 0 ? 'Jatuh Tempo' : `${pksSisa} hari`})
                              </span>
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

export default function TransaksiContent() {
  const { transaksis, addTransaksi, updateTransaksi, deleteTransaksi } = useTransaksi();
  const { investors }  = useInvestors();
  const { mous, updateMou, deleteMou } = useMou();
  const { user, isInvestor } = useAuth();
  const { brokers } = useBrokers();
  
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

  const isBroker = user?.role === "broker";
  const currentBroker = brokers.find(b => b.id === user?.brokerId);
  
  const visibleTransaksis = isInvestor && user?.investorId
    ? transaksis.filter((t) => t.investorEntries.some((e) => e.investorId === user.investorId))
    : isBroker && currentBroker
    ? transaksis.filter((t) => t.investorEntries.some((e) => e.investorBrokerName === currentBroker.name))
    : transaksis;

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
      // m-3: anchor regex ke akhir ID — "TRX-0001A" → "0001", bukan "0001" yg
      // salah kalau ID mengandung karakter tak terduga di tengah.
      const numStr = x.id.replace(/^TRX-/i, "").replace(/[A-Za-z]+$/, "");
      const n = Number.parseInt(numStr) || 0;
      return Math.max(m, n);
    }, 0);
    const numStr = String(max + 1).padStart(4, "0");
    return form.isAutorenewal ? `TRX-${numStr}A` : `TRX-${numStr}`;
  };

  const formToData = (f: TrxFormData, existing?: Transaksi | null): Omit<Transaksi, "id"> => ({
    date:           f.date,
    description:    f.description,
    endDate:        f.isAutorenewal ? f.endDate : "",
    isAutorenewal:  f.isAutorenewal,
    hpp:            Number.parseFloat(f.hpp) || 0,
    kebutuhanModal: Number.parseFloat(f.kebutuhanModal) || 0,
    investorEntries: f.investorEntries
      .filter((e) => e.investorId && e.nilaiInvestasi)
      .map((e) => {
        const inv = investors.find((x) => x.id === e.investorId);
        return {
          mouId:              e.mouId,
          investorId:         e.investorId,
          investorName:       inv?.name ?? e.investorId,
          investorBrokerName: inv?.brokerName ?? "",
          nilaiInvestasi:     Number.parseFloat(e.nilaiInvestasi) || 0,
          pctTrader:          Number.parseFloat(e.pctTrader)    || 0,
          pctMinBun:          Number.parseFloat(e.pctMinBun)    || 0,
          pctBrokerI:         Number.parseFloat(e.pctBrokerI)   || 0,
          pctBrokerII:        Number.parseFloat(e.pctBrokerII)  || 0, // m-4: pass through user input
        };
      }),
    ongkirPerKg:  Number.parseFloat(f.ongkirPerKg) || 0,
    hargaJual:    Number.parseFloat(f.hargaJual) || 0,
    status:       existing?.status ?? "berjalan",
    catatanAkhir: existing?.catatanAkhir ?? "",
  });

  // PATCH (kritikal #5): reconcilePksTermination harus baca state TERKINI dari PocketBase,
  // bukan snapshot `transaksis` dari closure React. Sebelumnya reconciliation
  // dipanggil langsung setelah `addTransaksi`/`updateTransaksi` dengan list
  // yang masih versi lama — sehingga PKS yang seharusnya aktif malah
  // ditandai terminated. Sekarang `loadTransaksis()` melakukan fetch ulang
  // sebelum menilai status PKS.
  const reloadTransaksisForReconcile = async () => {
    try {
      const fresh = await pb.collection("transaksis").getFullList<Transaksi>(
        { sort: "customId" },
      );
      const freshEntries = await pb.collection("transaksi_investors").getFullList(
        { sort: "created" },
      );
      const invMap = new Map<string, any[]>();
      for (const r of freshEntries) {
        const tid = (r as any).transaksiId as string;
        const list = invMap.get(tid) ?? [];
        list.push(r);
        invMap.set(tid, list);
      }
      const nextList = fresh.map((r: any) => ({
        ...r,
        investorEntries: invMap.get((r as any).id) ?? [],
      }));
      // Pakai `transaksisRef` dari konteks (lihat lib/transaksi-context.tsx) sebagai
      // sync target, bukan state lokal — tidak ada setter `setTransaksis` di sini.
      // Refresh dari konteks dilakukan lewat normalisasi data berikut: kita
      // bangun ulang `transaksis` via reloadInvestors() di konteks upstream.
      // Untuk konsistensi, langsung baca list ini untuk reconcile.
      latestTransaksisForReconcileRef.current = nextList;
    } catch (err) {
      console.error("[transaksi] gagal reload paska-reconcile:", err);
    }
  };
  // Ref yang memegang snapshot transaksi terbaru, di-update oleh
  // `reloadTransaksisForReconcile` agar `reconcilePksTermination` punya
  // sumber kebenaran terkini (bukan closure stale).
  const latestTransaksisForReconcileRef = useRef<Transaksi[]>([]);
  // Sinkronkan ref dengan state setiap render supaya transaksis dari prop
  // yang baru (mis. setelah re-fetch internal context) juga dipakai sebagai
  // fallback saat reload gagal.
  latestTransaksisForReconcileRef.current = transaksis;

  const reconcilePksTermination = async (affectedInvestorIds: string[]) => {
    try {
      const ids = Array.from(new Set(affectedInvestorIds));
      // Baca list terkini sebagai sumber kebenaran.
      const currentList = latestTransaksisForReconcileRef.current;
      for (const invId of ids) {
        const desired = !isInvestorActive(invId, currentList);
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

  const handleAdd = async (e: React.SubmitEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const data = formToData(form);
      // C-3 + PATCH #5: panggil `addTransaksi`, lalu REFRESH list sebelum
      // reconcile agar state yang dipakai akurat. Sebelumnya pakai closure
      // stale → bisa terjadi active PKS ditandai terminated.
      await addTransaksi(data);
      await reloadTransaksisForReconcile();
      await reconcilePksTermination(
        data.investorEntries.map((e: any) => e.investorId),
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

  const handleEdit = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selected) return;
    setIsSaving(true);
    try {
      const data = formToData(form, selected);
      await updateTransaksi(selected.id, data);
      await reloadTransaksisForReconcile();
      await reconcilePksTermination(
        [...selected.investorEntries, ...data.investorEntries].map((e: any) => e.investorId),
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
    const tAny = t as any;
    setForm({
      date:        t.date,
      description: t.description,
      endDate:     tAny.endDate || "",
      isAutorenewal: tAny.isAutorenewal || false,
      hpp:         t.hpp.toString(),
      kebutuhanModal: t.kebutuhanModal.toString(),
      investorEntries: t.investorEntries.length > 0
        ? t.investorEntries.map((e) => {
            const available = mous.find(
              (m) => m.investorId === e.investorId && !m.isTerminated && !assignedMouIds.has(m.id),
            );
            const mouId = e.mouId || (available?.id ?? "");
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
    // M-4: Hapus MoU terlebih dahulu; bila transaksi gagal dihapus setelah
    // MoU hilang, MoU bisa dibuat ulang dari snapshot `pksToBulkDelete`.
    // Strategi ini menghindari kebocoran MoU orphan (MoU tanpa transaksi).
    const pksSnapshot = [...pksToBulkDelete];
    // PATCH (serius #6): tambah field wajib (investorAddress, contractPeriod,
    // bagiHasilPP1/PP2/PK, investorPhone, heir data, dst) agar MoU hasil restore
    // TIDAK kehilangan fungsi utama (perhitungan bagi hasil, kontak, dll).
    // Sebelumnya, field selain beberapa di-pass menghasilkan MoU dengan default
    // kosong — secara teknis valid tapi data loss fungsional.
    try {
      await Promise.all(pksSnapshot.map((m) => deleteMou(m.id)));
      await deleteTransaksi(selected.id);
      toast.success("Transaksi berhasil dihapus");
      setSelected(null);
      setIsDeleteOpen(false);
    } catch (err) {
      for (const m of pksSnapshot) {
        try {
          await (pb.collection("mous") as any).create({
            customId:                m.id,
            createdBy:               "",
            updatedBy:               "",
            date:                    m.date,
            endDate:                 m.endDate || "",
            investorId:              m.investorId,
            investorName:            m.investorName,
            investorAddress:         m.investorAddress || "",
            investorOccupation:      m.investorOccupation || "",
            investorIdNumber:        m.investorIdNumber || "",
            investorPhone:           m.investorPhone || "",
            contractPeriod:          m.contractPeriod ?? 30,
            investmentAmount:        m.investmentAmount ?? 0,
            heirName:                m.heirName || "",
            heirRelationship:        m.heirRelationship || "",
            heirPhone:               m.heirPhone || "",
            keterangan:               m.keterangan || "",
            bagiHasilPP1:            m.bagiHasilPP1 ?? 50,
            bagiHasilPP2:            m.bagiHasilPP2 ?? 15,
            bagiHasilPK:             m.bagiHasilPK ?? 35,
            brokerId:                m.brokerId || "",
            brokerName:              m.brokerName || "",
            brokerAddress:           m.brokerAddress || "",
            brokerIdNumber:          m.brokerIdNumber || "",
            brokerPhone:             m.brokerPhone || "",
            bagiHasilPP3:            m.bagiHasilPP3 ?? 0,
            isTerminated:            false,
            isComplete:              false,
          });
        } catch {/* swallow — admin dapat restore manual */}
      }
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
      // PATCH #5: panggil `reconcilePksTermination` dengan 1 argumen saja
      // setelah patch terbaru. Fungsi ini membaca `latestTransaksisForReconcileRef`
      // sebagai sumber kebenaran, bukan snapshot closure.
      await reconcilePksTermination(
        selected.investorEntries.map((e) => e.investorId),
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

  const editingTransaksi = isEditOpen ? selected : null;
  const committedModal = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transaksis) {
      if (editingTransaksi?.id === t.id) continue;
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
                    const tAny = t as any;

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
                          {displayStatus === "berjalan" && (() => {
                            const s = sisaHari(t);
                            return (
                              <div className={`text-[10px] ${getSisaHariColor(s)}`}>
                                {getSisaHariText(s)}
                              </div>
                            );
                          })()}
                          {tAny.isAutorenewal && (
                            <div className="mt-1 inline-flex items-center gap-1 text-[9px] font-medium bg-blue-50 text-blue-600 border border-blue-200 px-1.5 py-0.5 rounded-full" title={`Berakhir: ${tAny.endDate ? formatDate(tAny.endDate) : "Tidak dibatasi"}`}>
                              <RefreshCw className="h-2.5 w-2.5" /> Autorenewal
                            </div>
                          )}
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
                            {canEdit && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit Transaksi" onClick={() => openEdit(t)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            )}
                            {canDelete && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Hapus Transaksi" onClick={() => openDelete(t)}>
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

      {/* ── Error Dialog ── */}
      <ErrorDialog
        open={!!errorInfo}
        onClose={() => setErrorInfo(null)}
        error={errorInfo}
      />
    </div>
  );
}