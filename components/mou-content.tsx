"use client";

import { useState } from "react";
import React from "react";
import { toast } from "sonner";
import { useMou, type MoU } from "@/lib/mou-context";
import { useInvestors, type Investor } from "@/lib/investors-context";
import { useAuth } from "@/lib/auth-context";
import { generateMouHtml } from "@/lib/mou-html";
import { useTransaksi } from "@/lib/transaksi-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorDialog } from "@/components/ui/error-dialog";
import { formatPbError, type PbErrorInfo } from "@/lib/pb-error";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import {
  Plus,
  Pencil,
  Trash2,
  Printer,
  FileText,
  CalendarDays,
  PowerOff,
  RotateCcw,
  Upload,
  ChevronDown,
} from "lucide-react";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface MouFormData {
  date: string;
  keterangan: string;
  investorId: string;
  investorName: string;
  investorAddress: string;
  investorOccupation: string;
  investorIdNumber: string;
  investorPhone: string;
  contractPeriod: string;
  investmentAmount: string;
  heirName: string;
  heirRelationship: string;
  heirPhone: string;
  bagiHasilPP1: string;
  bagiHasilPP2: string;
  bagiHasilPK:  string;
  esignPihakPertama1: string;
  esignPihakPertama2: string;
  esignPihakKedua: string;
}

const initialForm: MouFormData = {
  date: "",
  keterangan: "",
  investorId: "",
  investorName: "",
  investorAddress: "",
  investorOccupation: "",
  investorIdNumber: "",
  investorPhone: "",
  contractPeriod: "",
  investmentAmount: "",
  heirName: "",
  heirRelationship: "",
  heirPhone: "",
  bagiHasilPP1: "50",
  bagiHasilPP2: "15",
  bagiHasilPK:  "35",
  esignPihakPertama1: "",
  esignPihakPertama2: "",
  esignPihakKedua: "",
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

type MouStatus = "pending" | "aktif" | "expired" | "nonaktif";

function getMouStatus(mou: MoU): MouStatus {
  if (mou.isTerminated) return "nonaktif";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(mou.date);
  end.setDate(end.getDate() + mou.contractPeriod);
  if (end < today) return "expired";
  // PKS backdate (tanggal mulai sebelum hari ini) langsung aktif tanpa perlu signedDoc
  const isBackdate = new Date(mou.date) < today;
  if (!isBackdate && !mou.hasSignedDoc) return "pending";
  return "aktif";
}

function formatDate(s: string) {
  if (!s) return "-";
  const months = [
    "Jan","Feb","Mar","Apr","Mei","Jun",
    "Jul","Agu","Sep","Okt","Nov","Des",
  ];
  const d = new Date(s);
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);
}

function endDate(mou: MoU) {
  const d = new Date(mou.date);
  d.setDate(d.getDate() + mou.contractPeriod);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────
// KeteranganCombobox — input + dropdown saran dari data existing
// ─────────────────────────────────────────────

function KeteranganCombobox({
  value,
  onChange,
  suggestions,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // sinkronkan query saat value berubah dari luar (edit mode)
  React.useEffect(() => { setQuery(value); }, [value]);

  const filtered = query.trim()
    ? suggestions.filter((s) => s.toLowerCase().includes(query.toLowerCase()) && s !== query)
    : suggestions;

  function handleSelect(s: string) {
    onChange(s);
    setQuery(s);
    setOpen(false);
  }

  function handleBlur(e: React.FocusEvent) {
    // tutup hanya jika fokus keluar dari container
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <div className="relative">
        <input
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring pr-8"
          placeholder="Catatan tambahan (opsional)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          autoComplete="off"
        />
        {suggestions.length > 0 && (
          <button
            type="button"
            tabIndex={-1}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md text-sm overflow-hidden">
          {filtered.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground transition-colors"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(s)}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Form component — module level (stable ref)
// ─────────────────────────────────────────────

interface FormProps {
  formData: MouFormData;
  setFormData: (d: MouFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
  previewId: string;
  investors: Investor[];
  onInvestorSelect: (id: string) => void;
  keteranganSuggestions: string[];
  isEdit?: boolean;
  isSaving?: boolean;
}

function MouFormFields({
  formData,
  setFormData,
  onSubmit,
  submitLabel,
  previewId,
  investors,
  onInvestorSelect,
  keteranganSuggestions,
  isEdit = false,
  isSaving = false,
}: FormProps) {
  const set = (k: keyof MouFormData, v: string) =>
    setFormData({ ...formData, [k]: v });

  return (
    <form onSubmit={onSubmit}>
      <div className="overflow-y-auto max-h-[65vh] pr-2 space-y-5">

        {/* ── Informasi MoU ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Informasi MoU
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">No. MoU</Label>
            <div className="px-3 py-2 bg-muted rounded-md text-sm font-mono text-muted-foreground">
              {previewId}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mou-date" className="text-xs">
              Tanggal <span className="text-destructive">*</span>
            </Label>
            <Input
              id="mou-date"
              type="date"
              value={formData.date}
              onChange={(e) => set("date", e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Keterangan</Label>
            <KeteranganCombobox
              value={formData.keterangan}
              onChange={(v) => set("keterangan", v)}
              suggestions={keteranganSuggestions}
            />
          </div>
        </div>

        {/* ── Data Pihak Kedua ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Data Pihak Kedua (Investor)
          </p>

          {!isEdit && (
            <div className="space-y-1.5">
              <Label htmlFor="mou-investor" className="text-xs">
                Pilih Investor <span className="text-destructive">*</span>
              </Label>
              <Select value={formData.investorId} onValueChange={onInvestorSelect} required>
                <SelectTrigger id="mou-investor">
                  <SelectValue placeholder="Pilih investor untuk auto-isi..." />
                </SelectTrigger>
                <SelectContent>
                  {investors.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      Belum ada investor terdaftar
                    </div>
                  ) : (
                    investors.map((inv) => (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.name} — {inv.id}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {formData.investorId && (
                <p className="text-xs text-muted-foreground">
                  Data di bawah terisi otomatis — bisa diubah jika perlu.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="mou-inv-name" className="text-xs">
              Nama Investor <span className="text-destructive">*</span>
            </Label>
            <Input
              id="mou-inv-name"
              value={formData.investorName}
              onChange={(e) => set("investorName", e.target.value)}
              placeholder="Nama lengkap"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mou-inv-addr" className="text-xs">
              Alamat <span className="text-destructive">*</span>
            </Label>
            <Input
              id="mou-inv-addr"
              value={formData.investorAddress}
              onChange={(e) => set("investorAddress", e.target.value)}
              placeholder="Alamat lengkap"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mou-inv-job" className="text-xs">
                Pekerjaan <span className="text-destructive">*</span>
              </Label>
              <Input
                id="mou-inv-job"
                value={formData.investorOccupation}
                onChange={(e) => set("investorOccupation", e.target.value)}
                placeholder="Pekerjaan"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mou-inv-ktp" className="text-xs">
                No KTP <span className="text-destructive">*</span>
              </Label>
              <Input
                id="mou-inv-ktp"
                value={formData.investorIdNumber}
                onChange={(e) => set("investorIdNumber", e.target.value)}
                placeholder="16 digit"
                maxLength={16}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mou-inv-phone" className="text-xs">
              No Telepon <span className="text-destructive">*</span>
            </Label>
            <Input
              id="mou-inv-phone"
              value={formData.investorPhone}
              onChange={(e) => set("investorPhone", e.target.value)}
              placeholder="+62 812-xxxx-xxxx"
              required
            />
          </div>
        </div>

        {/* ── Data Kontrak ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Data Kontrak
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mou-period" className="text-xs">
                Periode Kontrak (hari) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="mou-period"
                type="number"
                min="30"
                value={formData.contractPeriod}
                onChange={(e) => set("contractPeriod", e.target.value)}
                placeholder="90"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mou-amount" className="text-xs">
                Nilai Investasi (Rp) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="mou-amount"
                type="number"
                min="0"
                step="1000000"
                value={formData.investmentAmount}
                onChange={(e) => set("investmentAmount", e.target.value)}
                placeholder="76000000"
                required
              />
            </div>
          </div>
        </div>

        {/* ── Data Ahli Waris ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Data Ahli Waris
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="mou-heir-name" className="text-xs">
              Nama Ahli Waris <span className="text-destructive">*</span>
            </Label>
            <Input
              id="mou-heir-name"
              value={formData.heirName}
              onChange={(e) => set("heirName", e.target.value)}
              placeholder="Nama lengkap ahli waris"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mou-heir-rel" className="text-xs">
                Hubungan dengan Investor <span className="text-destructive">*</span>
              </Label>
              <Input
                id="mou-heir-rel"
                value={formData.heirRelationship}
                onChange={(e) => set("heirRelationship", e.target.value)}
                placeholder="Ibu / Suami / Istri / ..."
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mou-heir-phone" className="text-xs">
                No HP Ahli Waris <span className="text-destructive">*</span>
              </Label>
              <Input
                id="mou-heir-phone"
                value={formData.heirPhone}
                onChange={(e) => set("heirPhone", e.target.value)}
                placeholder="+62 858-xxxx-xxxx"
                required
              />
            </div>
          </div>
        </div>

        {/* ── Skema Bagi Hasil ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Skema Bagi Hasil
          </p>
          {(() => {
            const pp1   = parseFloat(formData.bagiHasilPP1) || 0;
            const pp2   = parseFloat(formData.bagiHasilPP2) || 0;
            const pk    = parseFloat(formData.bagiHasilPK)  || 0;
            const total = pp1 + pp2 + pk;
            const valid = total === 100;
            return (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  {(
                    [
                      { key: "bagiHasilPP1" as const, label: "Pihak Pertama I",  placeholder: "50" },
                      { key: "bagiHasilPP2" as const, label: "Pihak Pertama II", placeholder: "15" },
                      { key: "bagiHasilPK"  as const, label: "Pihak Kedua",      placeholder: "35" },
                    ]
                  ).map(({ key, label, placeholder }) => (
                    <div key={key} className="space-y-1.5">
                      <Label htmlFor={`mou-${key}`} className="text-xs">{label}</Label>
                      <div className="relative">
                        <Input
                          id={`mou-${key}`}
                          type="number"
                          min="0"
                          max="100"
                          step="1"
                          value={formData[key]}
                          onChange={(e) => set(key, e.target.value)}
                          placeholder={placeholder}
                          className="pr-7"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className={`flex items-center justify-between rounded-md px-3 py-2 text-sm ${
                  valid
                    ? "bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800"
                    : "bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800"
                }`}>
                  <span className="text-muted-foreground text-xs">Total</span>
                  <span className={`font-bold tabular-nums ${valid ? "text-green-700 dark:text-green-400" : "text-orange-600 dark:text-orange-400"}`}>
                    {total}% {valid ? "✓" : `— kurang ${100 - total > 0 ? 100 - total : ""}${100 - total < 0 ? "lebih " + (total - 100) : ""}%`}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── E-Sign Tanda Tangan ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            E-Sign Tanda Tangan (Opsional)
          </p>
          {(
            [
              { field: "esignPihakPertama1" as const, label: "E-Sign Pihak Pertama I", hint: "Adie Bayu Putra" },
              { field: "esignPihakPertama2" as const, label: "E-Sign Pihak Pertama II", hint: "Parafitra Fidiasari" },
              { field: "esignPihakKedua"    as const, label: "E-Sign Pihak Kedua (Investor)", hint: formData.investorName || "Investor" },
            ] as const
          ).map(({ field, label, hint }) => (
            <div key={field} className="space-y-1.5">
              <Label className="text-xs">
                {label}
                <span className="ml-1 text-muted-foreground font-normal">— {hint}</span>
              </Label>
              {formData[field] ? (
                <div className="flex items-center gap-3 p-2 border rounded-md bg-muted/30">
                  <img
                    src={formData[field]}
                    alt={label}
                    className="h-14 w-auto object-contain border rounded bg-white"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => set(field, "")}
                  >
                    Hapus
                  </Button>
                </div>
              ) : (
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="cursor-pointer"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 200 * 1024) {
                      e.target.value = "";
                      // alert ringan — tidak perlu dialog penuh untuk validasi lokal
                      window.alert(`Ukuran file terlalu besar (${(file.size / 1024).toFixed(0)} KB). Maksimal 200 KB untuk e-sign.`);
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = (ev) => set(field, ev.target?.result as string ?? "");
                    reader.readAsDataURL(file);
                  }}
                />
              )}
              {!formData[field] && (
                <p className="text-[11px] text-muted-foreground">
                  JPEG / PNG / WebP · Maks. 200 KB
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      <DialogFooter className="mt-4 pt-4 border-t">
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

type Filter = "semua" | "pending" | "aktif" | "expired" | "nonaktif";

export function MouContent() {
  const { mous, addMou, updateMou, deleteMou, uploadSignedDoc } = useMou();
  const { investors } = useInvestors();
  const { transaksis } = useTransaksi();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const keteranganSuggestions = React.useMemo(() => {
    const set = new Set<string>();
    mous.forEach((m) => { if (m.keterangan?.trim()) set.add(m.keterangan.trim()); });
    return Array.from(set).sort();
  }, [mous]);

  const [filter, setFilter] = useState<Filter>("semua");
  const changeFilter = (f: Filter) => { setFilter(f); setPage(1); };
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isTerminateOpen, setIsTerminateOpen] = useState(false);
  const [terminateAction, setTerminateAction] = useState<"nonaktifkan" | "aktifkan">("nonaktifkan");
  const [selected, setSelected] = useState<MoU | null>(null);
  const [form, setForm] = useState<MouFormData>(initialForm);

  const [isUploadDocOpen, setIsUploadDocOpen] = useState(false);
  const [uploadDocTarget, setUploadDocTarget] = useState<MoU | null>(null);
  const [uploadDocFile, setUploadDocFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [docConfirmed, setDocConfirmed] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);

  const [errorInfo, setErrorInfo] = useState<PbErrorInfo | null>(null);
  const [page, setPage] = useState(1);

  const ITEMS_PER_PAGE = 20;

  // ── Filter ──
  const filtered = mous.filter((m) => {
    if (filter === "semua") return true;
    return getMouStatus(m) === filter;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated  = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // ── Terminate / Reactivate ──
  const openTerminate = (mou: MoU) => {
    setSelected(mou);
    setTerminateAction(mou.isTerminated ? "aktifkan" : "nonaktifkan");
    setIsTerminateOpen(true);
  };

  const confirmTerminate = async () => {
    if (!selected) return;
    setIsConfirming(true);
    try {
      await updateMou(selected.id, { isTerminated: terminateAction === "nonaktifkan" });
      toast.success(terminateAction === "nonaktifkan" ? "PKS berhasil dinonaktifkan" : "PKS berhasil diaktifkan kembali");
      setSelected(null);
      setIsTerminateOpen(false);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal mengubah status PKS"));
    } finally {
      setIsConfirming(false);
    }
  };

  // ── Preview ID (MOU-YYYYMM-NNN) ──
  // Dihitung dari mous yang sudah ada di state (tanpa query tambahan).
  const nextId = (date: string) => {
    if (!date) return "MOU-??????-???";
    const ym     = date.slice(0, 7).replace("-", ""); // "202505"
    const prefix = `MOU-${ym}-`;
    const max = mous.reduce((m, x) => {
      if (!x.id.startsWith(prefix)) return m;
      const n = parseInt(x.id.slice(prefix.length)) || 0;
      return n > m ? n : m;
    }, 0);
    return `${prefix}${String(max + 1).padStart(3, "0")}`;
  };

  // ── Investor auto-fill ──
  const handleInvestorSelect = (investorId: string) => {
    const inv = investors.find((i) => i.id === investorId);
    if (inv) {
      setForm((prev) => ({
        ...prev,
        investorId: inv.id,
        investorName: inv.name,
        investorAddress: inv.address,
        investorOccupation: inv.occupation,
        investorIdNumber: inv.idNumber,
        investorPhone: inv.phone,
        investmentAmount: inv.investmentAmount.toString(),
        heirName: inv.heirName,
      }));
    }
  };

  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);

  // ── Validasi bagi hasil ──
  const validateBagiHasil = () => {
    const total =
      (parseFloat(form.bagiHasilPP1) || 0) +
      (parseFloat(form.bagiHasilPP2) || 0) +
      (parseFloat(form.bagiHasilPK)  || 0);
    if (total !== 100) {
      setErrorInfo({
        title: "Skema bagi hasil tidak valid",
        fields: [{ field: "bagiHasil", code: "invalid_total", message: `Total persentase harus 100%. Saat ini: ${total}%.` }],
        raw: `Bagi hasil total: ${total}%`,
      });
      return false;
    }
    return true;
  };

  // ── Handlers ──
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateBagiHasil()) return;
    setIsSaving(true);
    try {
      await addMou({
        date: form.date,
        investorId: form.investorId,
        investorName: form.investorName,
        investorAddress: form.investorAddress,
        investorOccupation: form.investorOccupation,
        investorIdNumber: form.investorIdNumber,
        investorPhone: form.investorPhone,
        contractPeriod: parseInt(form.contractPeriod),
        investmentAmount: parseFloat(form.investmentAmount),
        heirName: form.heirName,
        heirRelationship: form.heirRelationship,
        heirPhone: form.heirPhone,
        keterangan: form.keterangan,
        bagiHasilPP1: parseFloat(form.bagiHasilPP1) || 50,
        bagiHasilPP2: parseFloat(form.bagiHasilPP2) || 15,
        bagiHasilPK:  parseFloat(form.bagiHasilPK)  || 35,
        esignPihakPertama1: form.esignPihakPertama1,
        esignPihakPertama2: form.esignPihakPertama2,
        esignPihakKedua: form.esignPihakKedua,
      });
      toast.success("PKS berhasil disimpan");
      setForm(initialForm);
      setIsAddOpen(false);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal menyimpan PKS"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (!validateBagiHasil()) return;
    setIsSaving(true);
    try {
      await updateMou(selected.id, {
        date: form.date,
        investorName: form.investorName,
        investorAddress: form.investorAddress,
        investorOccupation: form.investorOccupation,
        investorIdNumber: form.investorIdNumber,
        investorPhone: form.investorPhone,
        contractPeriod: parseInt(form.contractPeriod),
        investmentAmount: parseFloat(form.investmentAmount),
        heirName: form.heirName,
        heirRelationship: form.heirRelationship,
        heirPhone: form.heirPhone,
        keterangan: form.keterangan,
        bagiHasilPP1: parseFloat(form.bagiHasilPP1) || 50,
        bagiHasilPP2: parseFloat(form.bagiHasilPP2) || 15,
        bagiHasilPK:  parseFloat(form.bagiHasilPK)  || 35,
        esignPihakPertama1: form.esignPihakPertama1,
        esignPihakPertama2: form.esignPihakPertama2,
        esignPihakKedua: form.esignPihakKedua,
      });
      toast.success("PKS berhasil diperbarui");
      setForm(initialForm);
      setSelected(null);
      setIsEditOpen(false);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal memperbarui PKS"));
    } finally {
      setIsSaving(false);
    }
  };

  const openEdit = (mou: MoU) => {
    setSelected(mou);
    setForm({
      date: mou.date,
      keterangan: mou.keterangan ?? "",
      investorId: mou.investorId,
      investorName: mou.investorName,
      investorAddress: mou.investorAddress,
      investorOccupation: mou.investorOccupation,
      investorIdNumber: mou.investorIdNumber,
      investorPhone: mou.investorPhone,
      contractPeriod: mou.contractPeriod.toString(),
      investmentAmount: mou.investmentAmount.toString(),
      heirName: mou.heirName,
      heirRelationship: mou.heirRelationship,
      heirPhone: mou.heirPhone,
      bagiHasilPP1: String(mou.bagiHasilPP1 ?? 50),
      bagiHasilPP2: String(mou.bagiHasilPP2 ?? 15),
      bagiHasilPK:  String(mou.bagiHasilPK  ?? 35),
      esignPihakPertama1: mou.esignPihakPertama1 ?? "",
      esignPihakPertama2: mou.esignPihakPertama2 ?? "",
      esignPihakKedua: mou.esignPihakKedua ?? "",
    });
    setIsEditOpen(true);
  };

  const openUploadDoc = (mou: MoU) => {
    setUploadDocTarget(mou);
    setUploadDocFile(null);
    setUploadPreviewUrl(null);
    setDocConfirmed(false);
    setOverwriteConfirmed(false);
    setIsUploadDocOpen(true);
  };

  const resetUploadDialog = () => {
    if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
    setUploadDocFile(null);
    setUploadPreviewUrl(null);
    setDocConfirmed(false);
    setOverwriteConfirmed(false);
  };

  const handleUploadFileChange = (file: File | null) => {
    if (uploadPreviewUrl) URL.revokeObjectURL(uploadPreviewUrl);
    setUploadDocFile(file);
    setDocConfirmed(false);
    setUploadPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const handleSignedDocUpload = async () => {
    if (!uploadDocTarget || !uploadDocFile) return;
    setIsUploading(true);
    try {
      await uploadSignedDoc(uploadDocTarget.id, uploadDocFile);
      toast.success("Dokumen berhasil diupload — PKS sekarang aktif");
      setIsUploadDocOpen(false);
      setUploadDocTarget(null);
      setUploadDocFile(null);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal mengupload dokumen PKS"));
    } finally {
      setIsUploading(false);
    }
  };

  const openDelete = (mou: MoU) => {
    setSelected(mou);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!selected) return;
    setIsConfirming(true);
    try {
      await deleteMou(selected.id);
      toast.success("PKS berhasil dihapus");
      setSelected(null);
      setIsDeleteOpen(false);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal menghapus PKS"));
    } finally {
      setIsConfirming(false);
    }
  };

  const handlePrint = (mou: MoU) => {
    if (mou.hasSignedDoc && mou.signedDocUrl) {
      window.open(mou.signedDocUrl, "_blank");
      return;
    }
    const html = generateMouHtml(mou, transaksis);
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 500);
    }
  };

  // ── Count per status ──
  const counts = {
    semua:    mous.length,
    pending:  mous.filter((m) => getMouStatus(m) === "pending").length,
    aktif:    mous.filter((m) => getMouStatus(m) === "aktif").length,
    expired:  mous.filter((m) => getMouStatus(m) === "expired").length,
    nonaktif: mous.filter((m) => getMouStatus(m) === "nonaktif").length,
  };

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Perjanjian Kerjasama</h1>
          <p className="text-muted-foreground">Kelola dokumen perjanjian kerjasama investasi</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Buat PKS
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Buat PKS Baru</DialogTitle>
              <DialogDescription>
                Pilih investor untuk auto-isi data, lalu lengkapi sisa kolom
              </DialogDescription>
            </DialogHeader>
            <MouFormFields
              formData={form}
              setFormData={setForm}
              onSubmit={handleAdd}
              submitLabel="Simpan MoU"
              previewId={nextId(form.date)}
              investors={investors}
              onInvestorSelect={handleInvestorSelect}
              keteranganSuggestions={keteranganSuggestions}
              isSaving={isSaving}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex flex-wrap gap-2">
        {(["semua", "pending", "aktif", "expired", "nonaktif"] as Filter[]).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => changeFilter(f)}
            className="capitalize"
          >
            {f}
            <span className="ml-1.5 text-xs opacity-70">({counts[f]})</span>
          </Button>
        ))}
      </div>

      {/* ── Empty state ── */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-14">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">
              {filter === "semua"
                ? "Belum ada MoU"
                : filter === "nonaktif"
                ? "Tidak ada MoU yang dinonaktifkan"
                : `Tidak ada MoU ${filter}`}
            </h3>
            <p className="text-muted-foreground text-sm">
              {filter === "semua"
                ? "Buat MoU pertama dengan klik tombol di atas"
                : "Coba filter lain"}
            </p>
          </CardContent>
        </Card>
      ) : (
        /* ── Table ── */
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Daftar PKS</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">No. PKS</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Tanggal</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Investor</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Keterangan</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Periode</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Nilai Investasi</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Berakhir</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((mou) => {
                    const status = getMouStatus(mou);
                    return (
                      <tr
                        key={mou.id}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono text-xs font-medium">{mou.id}</td>
                        <td className="py-3 px-4 text-muted-foreground">{formatDate(mou.date)}</td>
                        <td className="py-3 px-4">
                          <div className="font-medium">{mou.investorName}</div>
                          <div className="text-xs text-muted-foreground">{mou.investorId}</div>
                        </td>
                        <td className="py-3 px-4 text-muted-foreground text-xs max-w-[160px]">
                          {mou.keterangan || <span className="italic opacity-50">—</span>}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1 text-muted-foreground">
                            <CalendarDays className="h-3 w-3" />
                            {mou.contractPeriod} hari
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          {formatRp(mou.investmentAmount)}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {formatDate(endDate(mou))}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {status === "pending" ? (
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Badge
                                    variant="secondary"
                                    className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 cursor-help underline decoration-dotted underline-offset-2"
                                  >
                                    pending
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[200px] text-center text-xs">
                                  Aktifkan dengan mengunggah PKS final yang telah ditandatangani &amp; dibubuhi materai
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ) : (
                            <Badge
                              variant="secondary"
                              className={
                                status === "aktif"
                                  ? "bg-green-100 text-green-800 hover:bg-green-100"
                                  : status === "nonaktif"
                                  ? "bg-red-100 text-red-700 hover:bg-red-100"
                                  : "bg-muted text-muted-foreground"
                              }
                            >
                              {status}
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Cetak / Download PDF"
                              onClick={() => handlePrint(mou)}
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            {isAdmin && (
                            <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Edit"
                              onClick={() => openEdit(mou)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title={
                                status === "pending"
                                  ? "Upload PKS bertanda tangan terlebih dahulu untuk mengaktifkan"
                                  : mou.isTerminated
                                  ? "Aktifkan Kembali"
                                  : "Nonaktifkan"
                              }
                              disabled={status === "pending"}
                              onClick={() => openTerminate(mou)}
                            >
                              {mou.isTerminated ? (
                                <RotateCcw className="h-3.5 w-3.5 text-green-600" />
                              ) : (
                                <PowerOff className="h-3.5 w-3.5 text-orange-500" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Upload PKS Bertanda Tangan"
                              onClick={() => openUploadDoc(mou)}
                            >
                              <Upload className={`h-3.5 w-3.5 ${mou.hasSignedDoc ? "text-green-600" : "text-blue-500"}`} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Hapus"
                              onClick={() => openDelete(mou)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                            </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <p className="text-xs text-muted-foreground">
                {(page - 1) * ITEMS_PER_PAGE + 1}–{Math.min(page * ITEMS_PER_PAGE, filtered.length)} dari {filtered.length} PKS
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  ←
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | "…")[]>((acc, p, i, arr) => {
                    if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "…" ? (
                      <span key={`ellipsis-${i}`} className="px-1 text-muted-foreground text-xs">…</span>
                    ) : (
                      <Button
                        key={p}
                        variant={page === p ? "default" : "outline"}
                        size="sm"
                        className="w-8 h-8 p-0 text-xs"
                        onClick={() => setPage(p as number)}
                      >
                        {p}
                      </Button>
                    )
                  )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  →
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ── Edit dialog ── */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit PKS</DialogTitle>
            <DialogDescription>
              Perbarui data PKS — No. PKS tidak dapat diubah
            </DialogDescription>
            {(() => {
              if (!selected) return null;
              const inv = investors.find((i) => i.id === selected.investorId);
              if (!inv) return null;
              const drifted =
                inv.name       !== selected.investorName     ||
                inv.address    !== selected.investorAddress  ||
                inv.occupation !== selected.investorOccupation ||
                inv.idNumber   !== selected.investorIdNumber ||
                inv.phone      !== selected.investorPhone;
              if (!drifted) return null;
              return (
                <Badge variant="outline" className="mt-1 w-fit text-amber-600 border-amber-400 bg-amber-50 dark:bg-amber-950 dark:border-amber-700 dark:text-amber-400 text-xs">
                  ⚠ Data investor lebih baru dari snapshot di PKS ini
                </Badge>
              );
            })()}
          </DialogHeader>
          <MouFormFields
            formData={form}
            setFormData={setForm}
            onSubmit={handleEdit}
            submitLabel="Simpan Perubahan"
            previewId={selected?.id ?? ""}
            investors={investors}
            onInvestorSelect={handleInvestorSelect}
            keteranganSuggestions={keteranganSuggestions}
            isEdit
            isSaving={isSaving}
          />
        </DialogContent>
      </Dialog>

      {/* ── Delete dialog ── */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Hapus PKS</DialogTitle>
            <DialogDescription>
              Yakin ingin menghapus <strong>{selected?.id}</strong> atas nama{" "}
              <strong>{selected?.investorName}</strong>? Tindakan ini tidak dapat
              dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={isConfirming}>
              {isConfirming ? "Menghapus…" : "Hapus"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Terminate / Reactivate dialog ── */}
      <Dialog open={isTerminateOpen} onOpenChange={setIsTerminateOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              {terminateAction === "nonaktifkan"
                ? "Nonaktifkan MoU"
                : "Aktifkan Kembali MoU"}
            </DialogTitle>
            <DialogDescription>
              {terminateAction === "nonaktifkan" ? (
                <>
                  Yakin ingin <strong>menghentikan</strong> PKS{" "}
                  <strong>{selected?.id}</strong> atas nama{" "}
                  <strong>{selected?.investorName}</strong>?{" "}
                  Perjanjian akan ditandai sebagai <em>nonaktif</em> secara manual.
                  Data tidak akan dihapus dan bisa diaktifkan kembali kapan saja.
                </>
              ) : (
                <>
                  Aktifkan kembali PKS <strong>{selected?.id}</strong> atas nama{" "}
                  <strong>{selected?.investorName}</strong>?{" "}
                  Status akan dihitung ulang berdasarkan tanggal perjanjian.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsTerminateOpen(false)}>
              Batal
            </Button>
            {terminateAction === "nonaktifkan" ? (
              <Button
                className="bg-orange-500 hover:bg-orange-600 text-white"
                onClick={confirmTerminate}
                disabled={isConfirming}
              >
                <PowerOff className="h-4 w-4 mr-2" />
                {isConfirming ? "Memproses…" : "Nonaktifkan"}
              </Button>
            ) : (
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={confirmTerminate}
                disabled={isConfirming}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                {isConfirming ? "Memproses…" : "Aktifkan Kembali"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* ── Upload Signed Doc dialog ── */}
      <Dialog open={isUploadDocOpen} onOpenChange={(open) => {
        if (!open) { resetUploadDialog(); }
        setIsUploadDocOpen(open);
      }}>
        <DialogContent className={`flex flex-col max-h-[90vh] ${uploadPreviewUrl ? "sm:max-w-[720px]" : "sm:max-w-[440px]"}`}>
          <DialogHeader>
            <DialogTitle>
              {uploadDocTarget?.hasSignedDoc ? "Upload Ulang PKS Bertanda Tangan" : "Upload PKS Bertanda Tangan"}
            </DialogTitle>
            <DialogDescription>
              PKS <strong>{uploadDocTarget?.id}</strong> —{" "}
              {uploadDocTarget?.hasSignedDoc
                ? "dokumen bertanda tangan sudah tersimpan."
                : "upload dokumen yang telah ditandatangani dan dibubuhi materai."}
            </DialogDescription>
          </DialogHeader>

          {/* Peringatan overwrite */}
          {uploadDocTarget?.hasSignedDoc && !overwriteConfirmed ? (
            <div className="space-y-4 py-2">
              <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800 space-y-1">
                <p className="font-semibold">Dokumen sudah diupload sebelumnya.</p>
                <p>
                  PKS ini sudah memiliki dokumen bertanda tangan &amp; bermaterai.
                  Mengupload ulang akan <strong>menghapus permanen</strong> dokumen
                  lama dan menggantinya dengan dokumen baru.
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Apakah Anda yakin ingin menimpa dokumen lama?
              </p>
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => {
                  setIsUploadDocOpen(false);
                  resetUploadDialog();
                }}>
                  Batal
                </Button>
                <Button
                  className="bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={() => setOverwriteConfirmed(true)}
                >
                  Ya, Upload Ulang
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="overflow-y-auto flex-1 space-y-3 py-2 pr-1">
                {/* Pilih file */}
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    File PKS (PDF / Gambar) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="file"
                    accept=".pdf,image/*"
                    className="cursor-pointer"
                    onChange={(e) => handleUploadFileChange(e.target.files?.[0] ?? null)}
                  />
                  {uploadDocFile && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">{uploadDocFile.name}</span>{" "}
                      ({(uploadDocFile.size / 1024).toFixed(0)} KB)
                    </p>
                  )}
                </div>

                {/* Preview dokumen */}
                {uploadPreviewUrl && uploadDocFile && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">Preview dokumen</p>
                    {uploadDocFile.type === "application/pdf" ? (
                      <iframe
                        src={uploadPreviewUrl}
                        className="w-full rounded-md border border-border"
                        style={{ height: "300px" }}
                        title="Preview PKS"
                      />
                    ) : (
                      <div className="rounded-md border border-border overflow-hidden bg-muted/30 flex items-center justify-center" style={{ maxHeight: "420px" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={uploadPreviewUrl}
                          alt="Preview PKS"
                          className="max-w-full max-h-[300px] object-contain"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Konfirmasi */}
                {uploadPreviewUrl && (
                  <label className="flex items-start gap-2.5 cursor-pointer rounded-md border border-border p-3 hover:bg-muted/40 transition-colors">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                      checked={docConfirmed}
                      onChange={(e) => setDocConfirmed(e.target.checked)}
                    />
                    <span className="text-sm leading-snug">
                      Saya telah memeriksa dokumen di atas dan menyatakan bahwa dokumen sudah{" "}
                      <strong>final, ditandatangani, dan dibubuhi materai</strong> sesuai ketentuan.
                    </span>
                  </label>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsUploadDocOpen(false);
                    resetUploadDialog();
                  }}
                >
                  Batal
                </Button>
                <Button
                  disabled={!uploadDocFile || !docConfirmed || isUploading}
                  onClick={handleSignedDocUpload}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {isUploading
                    ? "Mengunggah…"
                    : uploadDocTarget?.hasSignedDoc
                    ? "Timpa & Upload Ulang"
                    : "Upload & Aktifkan"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Error dialog ── */}
      <ErrorDialog
        open={!!errorInfo}
        onClose={() => setErrorInfo(null)}
        error={errorInfo}
      />
    </div>
  );
}
