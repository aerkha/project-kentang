"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { ErrorDialog } from "@/components/ui/error-dialog";
import { formatPbError, type PbErrorInfo } from "@/lib/pb-error";
import { useTransaksi, calcTransaksi, effectiveStatus, type Transaksi, type TransaksiStatus, TRANSAKSI_STATUS_LABEL } from "@/lib/transaksi-context";
import { useInvestors, type Investor } from "@/lib/investors-context";
import { useBrokers, type Broker } from "@/lib/brokers-context";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
} from "lucide-react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface InvestorEntryForm {
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
  investorId: "", nilaiInvestasi: "",
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
  description: "",
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
  }
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
  brokers: Broker[];
  isSaving?: boolean;
}

function TrxFormFields({
  formData, setFormData, onSubmit, submitLabel, previewId,
  investors, brokers: _brokers,
  isSaving = false,
}: TrxFormProps) {
  // ── Jalur state ──────────────────────────────────────────────────────────
  const [openJalurs, setOpenJalurs] = useState<Set<InvestorJalur>>(() => {
    const s = new Set<InvestorJalur>();
    formData.investorEntries.forEach((e) => {
      if (!e.investorId) return;
      const inv = investors.find((x) => x.id === e.investorId);
      if (inv) s.add(getJalur(inv));
    });
    return s;
  });

  const investorsByJalur = (jalur: InvestorJalur) =>
    investors.filter((inv) => getJalur(inv) === jalur);

  const isInvestorChecked = (investorId: string) =>
    formData.investorEntries.some((e) => e.investorId === investorId);

  const toggleJalur = (jalur: InvestorJalur) => {
    if (openJalurs.has(jalur)) {
      // Tutup jalur: hapus semua investor jalur ini dari entries
      const ids = new Set(investorsByJalur(jalur).map((i) => i.id));
      setFormData((prev) => ({
        ...prev,
        investorEntries: prev.investorEntries.filter((e) => !ids.has(e.investorId)),
      }));
      setOpenJalurs((prev) => { const n = new Set(prev); n.delete(jalur); return n; });
    } else {
      // Buka jalur: tambah semua investor jalur ini ke entries (pre-checked semua)
      const toAdd = investorsByJalur(jalur).map((inv) => ({
        investorId: inv.id,
        nilaiInvestasi: inv.investmentAmount.toString(),
        ...investorPct(inv.brokerName ?? ""),
      }));
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

  const toggleInvestor = (inv: Investor) => {
    setFormData((prev) => {
      const alreadyIn = prev.investorEntries.some((e) => e.investorId === inv.id);
      if (alreadyIn) {
        return { ...prev, investorEntries: prev.investorEntries.filter((e) => e.investorId !== inv.id) };
      }
      const pct = investorPct(inv.brokerName ?? "");
      return {
        ...prev,
        investorEntries: [
          ...prev.investorEntries.filter((e) => e.investorId),
          { investorId: inv.id, nilaiInvestasi: inv.investmentAmount.toString(), ...pct },
        ],
      };
    });
  };

  const updateNilai = (investorId: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      investorEntries: prev.investorEntries.map((e) =>
        e.investorId === investorId ? { ...e, nilaiInvestasi: value } : e,
      ),
    }));
  };
  const set = (k: keyof Omit<TrxFormData, "investorEntries">, v: string) =>
    setFormData({ ...formData, [k]: v });

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

  const selisihColor =
    selisih === 0 ? "text-green-700" :
    selisih < 0   ? "text-orange-600" :
                    "text-red-600";

  // Ringkasan broker dari investor yang dipilih
  const brokerSummary = useMemo(() => {
    const map = new Map<string, string[]>(); // brokerName → [investorName]
    formData.investorEntries.forEach((e) => {
      if (!e.investorId) return;
      const inv = investors.find((x) => x.id === e.investorId);
      if (!inv) return;
      const key = inv.brokerName?.trim() || "__langsung";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(inv.name);
    });
    return map;
  }, [formData.investorEntries, investors]);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-0">
      <div className="overflow-y-auto max-h-[62vh] pr-2 space-y-5">

        {/* ── Info Pengiriman ── */}
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
              <Label htmlFor="trx-date" className="text-xs">
                Tanggal <span className="text-destructive">*</span>
              </Label>
              <Input
                id="trx-date" type="date"
                value={formData.date}
                onChange={(e) => set("date", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trx-desc" className="text-xs">Keterangan</Label>
              <Input
                id="trx-desc"
                value={formData.description}
                onChange={(e) => set("description", e.target.value)}
                placeholder="Nama PO / batch (opsional)"
              />
            </div>
          </div>
        </div>

        {/* ── Modal & Kuantitas ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Modal &amp; Kuantitas
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trx-hpp" className="text-xs">
                HPP (Rp/kg) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="trx-hpp" type="number" min="0" step="100"
                value={formData.hpp}
                onChange={(e) => set("hpp", e.target.value)}
                placeholder="2000" required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trx-modal" className="text-xs">
                Kebutuhan Modal/pengiriman (Rp) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="trx-modal" type="number" min="0" step="100000"
                value={formData.kebutuhanModal}
                onChange={(e) => set("kebutuhanModal", e.target.value)}
                placeholder="10000000" required
              />
            </div>
          </div>
          <Preview
            label="Quantity (kg) = Kebutuhan Modal ÷ HPP"
            value={hpp > 0 && modal > 0 ? formatQty(qty) : "—"}
          />
        </div>

        {/* ── Ongkir & Penjualan ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Ongkir &amp; Penjualan
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trx-ongkir" className="text-xs">
                Ongkir per KG (Rp) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="trx-ongkir" type="number" min="0" step="100"
                value={formData.ongkirPerKg}
                onChange={(e) => set("ongkirPerKg", e.target.value)}
                placeholder="500" required
              />
            </div>
            <Preview
              label="Total Ongkir = Ongkir/kg × Qty"
              value={ongkirPerKg > 0 && qty > 0 ? formatRp(totalOngkir) : "—"}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="trx-harga" className="text-xs">
                Harga Jual per KG (Rp) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="trx-harga" type="number" min="0" step="100"
                value={formData.hargaJual}
                onChange={(e) => set("hargaJual", e.target.value)}
                placeholder="3000" required
              />
            </div>
            <Preview
              label="Income = Harga Jual × Qty"
              value={hargaJual > 0 && qty > 0 ? formatRp(income) : "—"}
            />
          </div>

          {income > 0 && (
            <div className={`px-3 py-3 rounded-md flex items-center justify-between ${
              profit >= 0 ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
            }`}>
              <span className="flex items-center gap-2 text-sm font-medium">
                {profit >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                Profit = Income − (Modal + Total Ongkir)
              </span>
              <span className="font-bold">{formatRp(profit)}</span>
            </div>
          )}
        </div>

        {/* ── Kontribusi Investor ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Kontribusi Investor
          </p>

          {/* Jalur checkboxes */}
          <div className="flex gap-4">
            {(["MB", "TM", "D"] as InvestorJalur[]).map((jalur) => (
              <label key={jalur} className="flex items-center gap-2 cursor-pointer select-none">
                <Checkbox
                  checked={openJalurs.has(jalur)}
                  onCheckedChange={() => toggleJalur(jalur)}
                />
                <span className="text-sm font-medium">{JALUR_LABEL[jalur]}</span>
              </label>
            ))}
          </div>

          {/* Investor list per jalur */}
          {(["MB", "TM", "D"] as InvestorJalur[]).map((jalur) => {
            if (!openJalurs.has(jalur)) return null;
            const jalurInvestors = investorsByJalur(jalur);
            return (
              <div key={jalur} className="rounded-md border border-border p-3 space-y-2 bg-muted/20">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {JALUR_LABEL[jalur]}
                </p>
                {jalurInvestors.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Tidak ada investor di jalur ini</p>
                ) : (
                  <div className="space-y-2">
                    {jalurInvestors.map((inv) => {
                      const checked = isInvestorChecked(inv.id);
                      const entry = formData.investorEntries.find((e) => e.investorId === inv.id);
                      return (
                        <div key={inv.id} className="flex items-center gap-3">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleInvestor(inv)}
                          />
                          <div className="flex-1 min-w-0 flex items-center gap-2">
                            <span className="font-mono text-[10px] text-muted-foreground shrink-0">{inv.id}</span>
                            <span className="text-sm truncate">{inv.name}</span>
                            {inv.brokerName && (
                              <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-700 px-1.5 py-0.5 rounded shrink-0">
                                {inv.brokerName}
                              </span>
                            )}
                          </div>
                          {checked && (
                            <Input
                              type="number" min="0" step="100000"
                              value={entry?.nilaiInvestasi ?? ""}
                              onChange={(e) => updateNilai(inv.id, e.target.value)}
                              className="w-36 h-8 text-xs shrink-0"
                              placeholder="Nilai investasi"
                            />
                          )}
                          {!checked && (
                            <span className="w-36 shrink-0 px-3 py-1.5 text-xs text-muted-foreground bg-muted rounded-md">
                              {inv.investmentAmount > 0 ? formatRp(inv.investmentAmount) : "—"}
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
              <div className={`px-3 py-2 rounded-md text-sm font-semibold bg-muted ${selisihColor}`}>
                {modal > 0
                  ? selisih === 0 ? "✓ Terpenuhi"
                  : selisih > 0  ? `Kurang ${formatRp(selisih)}`
                  :                `Lebih ${formatRp(Math.abs(selisih))}`
                  : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* ── Afiliasi Broker ── */}
        {brokerSummary.size > 0 && (
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
              Afiliasi Broker
            </p>
            <div className="space-y-1.5 max-h-[120px] overflow-y-auto pr-1">
              {Array.from(brokerSummary.entries()).map(([broker, names]) => (
                <div key={broker} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    broker === "__langsung"
                      ? "bg-muted text-muted-foreground"
                      : "bg-amber-50 border border-amber-200 text-amber-700"
                  }`}>
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
        <Button type="submit" disabled={isSaving}>
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
  const { transaksis, addTransaksi, updateTransaksi, deleteTransaksi } = useTransaksi();
  const { investors }  = useInvestors();
  const { brokers }    = useBrokers();
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

  // Filter untuk investor: hanya tampilkan transaksi yang melibatkan investor tersebut
  const visibleTransaksis = useMemo(() => {
    if (!isInvestor || !user?.investorId) return transaksis;
    return transaksis.filter((t) =>
      t.investorEntries.some((e) => e.investorId === user.investorId)
    );
  }, [transaksis, isInvestor, user?.investorId]);

  // ── Summary metrics ──
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

  // ── Sorted newest first ──
  const sorted = useMemo(
    () => [...visibleTransaksis].sort((a, b) => b.date.localeCompare(a.date)),
    [visibleTransaksis],
  );

  // ── Next ID ──
  const nextId = () => {
    const max = transaksis.reduce((m, x) => {
      const n = parseInt(x.id.replace("TRX-", "")) || 0;
      return n > m ? n : m;
    }, 0);
    return `TRX-${String(max + 1).padStart(4, "0")}`;
  };

  // ── Form → Transaksi ──
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

  // ── Submit handlers ──
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await addTransaksi(formToData(form));
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
      await updateTransaksi(selected.id, formToData(form, selected));
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
    setForm({
      date:        t.date,
      description: t.description,
      hpp:         t.hpp.toString(),
      kebutuhanModal: t.kebutuhanModal.toString(),
      investorEntries: t.investorEntries.length > 0
        ? t.investorEntries.map((e) => ({
            investorId:    e.investorId,
            nilaiInvestasi: e.nilaiInvestasi.toString(),
            pctTrader:     e.pctTrader.toString(),
            pctMinBun:     e.pctMinBun.toString(),
            pctBrokerI:    e.pctBrokerI.toString(),
            pctBrokerII:   e.pctBrokerII.toString(),
          }))
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
    const eff = effectiveStatus(t);
    setFinalizeStatus(eff === "berjalan" || eff === "perbarui" ? "selesai" : eff);
    setFinalizeNote(t.catatanAkhir || "");
    setIsFinalizeOpen(true);
  };

  const handleFinalize = async () => {
    if (!selected) return;
    setIsFinalizing(true);
    try {
      await updateTransaksi(selected.id, { status: finalizeStatus, catatanAkhir: finalizeNote });
      toast.success(`Status transaksi ${selected.id} diubah ke "${TRANSAKSI_STATUS_LABEL[finalizeStatus]}"`);
      setIsFinalizeOpen(false);
      setSelected(null);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal mengubah status transaksi"));
    } finally {
      setIsFinalizing(false);
    }
  };

  const sharedFormProps = {
    investors,
    brokers,
    isSaving,
  };

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
                    <th className="text-left  py-3 px-4 font-medium text-muted-foreground whitespace-nowrap">Keterangan</th>
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
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${statusVariant(effectiveStatus(t))}`}>
                            {TRANSAKSI_STATUS_LABEL[effectiveStatus(t)]}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground max-w-[120px] truncate">{t.description || "—"}</td>
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
                          <span className={`text-xs font-medium ${c.selisih === 0 ? "text-green-600" : c.selisih > 0 ? "text-red-500" : "text-orange-500"}`}>
                            {c.selisih === 0 ? "✓" : c.selisih > 0 ? `-${formatShort(c.selisih)}` : `+${formatShort(Math.abs(c.selisih))}`}
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
                  {(Object.keys(TRANSAKSI_STATUS_LABEL) as TransaksiStatus[]).map((s) => (
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
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Hapus Transaksi</DialogTitle>
            <DialogDescription>
              Yakin ingin menghapus transaksi <strong>{selected?.id}</strong>
              {selected?.description ? ` — ${selected.description}` : ""}?{" "}
              Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
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
