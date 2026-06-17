"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useInvestors, type Investor } from "@/lib/investors-context";
import { useBrokers, type Broker } from "@/lib/brokers-context";
import { useTransaksi, calcTransaksi, type TransaksiStatus } from "@/lib/transaksi-context";
import { useMou, getMouStatus } from "@/lib/mou-context";
import { usePengeluaran } from "@/lib/cashflow-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorDialog } from "@/components/ui/error-dialog";
import { formatPbError, type PbErrorInfo } from "@/lib/pb-error";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus, Pencil, Trash2, Search, Users, Briefcase, Building2, ShieldCheck, TrendingUp,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/permissions";
import { todayWibStr } from "@/lib/utils";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface InvestorFormData {
  name: string;
  address: string;
  brokerName: string;
  idNumber: string;
  bankName: string;
  accountNumber: string;
  phone: string;
  email: string;
  occupation: string;
  investmentAmount: string;
  heirName: string;
  heirBankName: string;
  heirAccountNumber: string;
  isMinBun: boolean;
  isTami: boolean;
  isDirect: boolean;
}

interface BrokerFormData {
  name: string;
  address: string;
  email: string;
  idNumber: string;
  bankName: string;
  accountNumber: string;
  phone: string;
}

const initialInvestorForm: InvestorFormData = {
  name: "",
  address: "",
  brokerName: "",
  idNumber: "",
  bankName: "",
  accountNumber: "",
  phone: "",
  email: "",
  occupation: "",
  investmentAmount: "",
  heirName: "",
  heirBankName: "",
  heirAccountNumber: "",
  isMinBun: false,
  isTami: false,
  isDirect: false,
};

const initialBrokerForm: BrokerFormData = {
  name: "",
  address: "",
  email: "",
  idNumber: "",
  bankName: "",
  accountNumber: "",
  phone: "",
};

// ─────────────────────────────────────────────
// Form components (defined at module level to
// keep a stable reference — avoids unmount on
// every parent re-render which would lose focus)
// ─────────────────────────────────────────────

interface InvestorFormProps {
  formData: InvestorFormData;
  setFormData: (data: InvestorFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
  previewId: string;
  brokers: Broker[];
  isSaving?: boolean;
  buktiFile?: File | null;
  onBuktiChange?: (f: File | null) => void;
}

function BuktiUploadField({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">
        Bukti Transfer <span className="text-muted-foreground font-normal">(opsional)</span>
      </Label>
      <label className={`flex items-center gap-3 cursor-pointer rounded-lg border-2 border-dashed px-4 py-3 transition-colors ${file ? "border-green-400 bg-green-50" : "border-border hover:border-primary/50 hover:bg-muted/40"}`}>
        <input
          type="file"
          accept="image/*,application/pdf"
          className="sr-only"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-green-600 text-lg">✅</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-green-700 truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB · Klik untuk ganti</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-lg">📎</span>
            <p className="text-xs">Klik untuk upload bukti transfer (jpg, png, pdf)</p>
          </div>
        )}
      </label>
    </div>
  );
}

function InvestorFormFields({ formData, setFormData, onSubmit, submitLabel, previewId, brokers, isSaving = false, buktiFile, onBuktiChange }: InvestorFormProps) {
  const set = (key: keyof InvestorFormData, value: string) =>
    setFormData({ ...formData, [key]: value });
  const setFlag = (key: keyof InvestorFormData, value: boolean) =>
    setFormData({ ...formData, [key]: value });

  return (
    <form onSubmit={onSubmit}>
      <div className="overflow-y-auto max-h-[62vh] pr-2 space-y-5">

        {/* ── Data Investor ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Data Investor
          </p>

          <div className="space-y-1.5">
            <Label className="text-xs">ID Investor</Label>
            <div className="px-3 py-2 bg-muted rounded-md text-sm font-mono text-muted-foreground">
              {previewId}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-name" className="text-xs">
              Nama Investor <span className="text-destructive">*</span>
            </Label>
            <Input
              id="inv-name"
              value={formData.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="John Smith"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-address" className="text-xs">
              Alamat <span className="text-destructive">*</span>
            </Label>
            <Input
              id="inv-address"
              value={formData.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Jl. Sudirman No. 1, Jakarta"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-ktp" className="text-xs">
                No KTP <span className="text-destructive">*</span>
              </Label>
              <Input
                id="inv-ktp"
                value={formData.idNumber}
                onChange={(e) => set("idNumber", e.target.value)}
                placeholder="3174010101800001"
                maxLength={16}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-phone" className="text-xs">
                No Handphone <span className="text-destructive">*</span>
              </Label>
              <Input
                id="inv-phone"
                value={formData.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+62 812-xxxx-xxxx"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-email" className="text-xs">Email</Label>
            <Input
              id="inv-email"
              type="email"
              value={formData.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="contoh@email.com"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-occupation" className="text-xs">
              Pekerjaan <span className="text-destructive">*</span>
            </Label>
            <Input
              id="inv-occupation"
              value={formData.occupation}
              onChange={(e) => set("occupation", e.target.value)}
              placeholder="Pengusaha"
              required
            />
          </div>
        </div>

        {/* ── Data Investasi ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Data Investasi
          </p>

          <div className="space-y-1.5">
            <Label className="text-xs">Nama Broker</Label>
            {brokers.length > 0 ? (
              <Select
                value={formData.brokerName || "__none__"}
                onValueChange={(v) => set("brokerName", v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih broker (opsional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    <span className="text-muted-foreground">— Tanpa Broker —</span>
                  </SelectItem>
                  {brokers.map((b) => (
                    <SelectItem key={b.id} value={b.name}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                value={formData.brokerName}
                onChange={(e) => set("brokerName", e.target.value)}
                placeholder="Belum ada broker terdaftar"
                disabled
              />
            )}
            {brokers.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Tambah broker terlebih dahulu melalui tombol &ldquo;Tambah Broker&rdquo;
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inv-amount" className="text-xs">
              Nilai Investasi (Rp) <span className="text-destructive">*</span>
            </Label>
            <Input
              id="inv-amount"
              type="number"
              min="0"
              step="1000000"
              value={formData.investmentAmount}
              onChange={(e) => set("investmentAmount", e.target.value)}
              placeholder="150000000"
              required
            />
          </div>
        </div>

        {/* ── Bukti Transfer ── */}
        {onBuktiChange && (
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
              Bukti Transfer
            </p>
            <BuktiUploadField file={buktiFile ?? null} onChange={onBuktiChange} />
          </div>
        )}

        {/* ── Rekening Investor ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Rekening Investor
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-bank" className="text-xs">
                Nama Bank <span className="text-destructive">*</span>
              </Label>
              <Input
                id="inv-bank"
                value={formData.bankName}
                onChange={(e) => set("bankName", e.target.value)}
                placeholder="BCA"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-account" className="text-xs">
                No Rekening <span className="text-destructive">*</span>
              </Label>
              <Input
                id="inv-account"
                value={formData.accountNumber}
                onChange={(e) => set("accountNumber", e.target.value)}
                placeholder="1234567890"
                required
              />
            </div>
          </div>
        </div>

        {/* ── Status Investor ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Status Investor
          </p>
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3 bg-muted/30">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <Label className="text-sm font-medium">MinBun</Label>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Investor internal MinBun. Nilai investasi dan arus kas terintegrasi otomatis dengan saldo MinBun.
              </p>
            </div>
            <Switch
              checked={formData.isMinBun}
              onCheckedChange={(v) => setFlag("isMinBun", v)}
            />
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3 bg-muted/30">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Tami</Label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Investor melalui jalur Tami.
              </p>
            </div>
            <Switch
              checked={formData.isTami}
              onCheckedChange={(v) => setFlag("isTami", v)}
            />
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3 bg-muted/30">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Direct</Label>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Investor langsung tanpa perantara broker.
              </p>
            </div>
            <Switch
              checked={formData.isDirect}
              onCheckedChange={(v) => setFlag("isDirect", v)}
            />
          </div>
        </div>

        {/* ── Data Ahli Waris ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Data Ahli Waris
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="inv-heir-name" className="text-xs">Nama Ahli Waris</Label>
            <Input
              id="inv-heir-name"
              value={formData.heirName}
              onChange={(e) => set("heirName", e.target.value)}
              placeholder="Jane Smith"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-heir-bank" className="text-xs">Nama Bank Ahli Waris</Label>
              <Input
                id="inv-heir-bank"
                value={formData.heirBankName}
                onChange={(e) => set("heirBankName", e.target.value)}
                placeholder="BCA"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-heir-account" className="text-xs">No Rekening Ahli Waris</Label>
              <Input
                id="inv-heir-account"
                value={formData.heirAccountNumber}
                onChange={(e) => set("heirAccountNumber", e.target.value)}
                placeholder="0987654321"
              />
            </div>
          </div>
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

interface BrokerFormProps {
  formData: BrokerFormData;
  setFormData: (data: BrokerFormData) => void;
  onSubmit: (e: React.FormEvent) => void;
  submitLabel: string;
  previewId: string;
  isSaving?: boolean;
}

function BrokerFormFields({ formData, setFormData, onSubmit, submitLabel, previewId, isSaving = false }: BrokerFormProps) {
  const set = (key: keyof BrokerFormData, value: string) =>
    setFormData({ ...formData, [key]: value });

  return (
    <form onSubmit={onSubmit}>
      <div className="overflow-y-auto max-h-[62vh] pr-2 space-y-5">

        {/* ── Data Broker ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Data Broker
          </p>

          <div className="space-y-1.5">
            <Label className="text-xs">ID Broker</Label>
            <div className="px-3 py-2 bg-muted rounded-md text-sm font-mono text-muted-foreground">
              {previewId}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brk-name" className="text-xs">
              Nama Broker <span className="text-destructive">*</span>
            </Label>
            <Input
              id="brk-name"
              value={formData.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Nama lengkap broker"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brk-address" className="text-xs">
              Alamat <span className="text-destructive">*</span>
            </Label>
            <Input
              id="brk-address"
              value={formData.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="Jl. Sudirman No. 1, Jakarta"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brk-email" className="text-xs">
              Email <span className="text-muted-foreground font-normal">(untuk notifikasi reminder)</span>
            </Label>
            <Input
              id="brk-email"
              type="email"
              value={formData.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="broker@email.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="brk-ktp" className="text-xs">
                No KTP <span className="text-destructive">*</span>
              </Label>
              <Input
                id="brk-ktp"
                value={formData.idNumber}
                onChange={(e) => set("idNumber", e.target.value)}
                placeholder="3174010101800001"
                maxLength={16}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brk-phone" className="text-xs">
                No Handphone <span className="text-destructive">*</span>
              </Label>
              <Input
                id="brk-phone"
                value={formData.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+62 813-xxxx-xxxx"
                required
              />
            </div>
          </div>
        </div>

        {/* ── Rekening Broker ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Rekening Broker
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="brk-bank" className="text-xs">
                Nama Bank <span className="text-destructive">*</span>
              </Label>
              <Input
                id="brk-bank"
                value={formData.bankName}
                onChange={(e) => set("bankName", e.target.value)}
                placeholder="Mandiri"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brk-account" className="text-xs">
                No Rekening <span className="text-destructive">*</span>
              </Label>
              <Input
                id="brk-account"
                value={formData.accountNumber}
                onChange={(e) => set("accountNumber", e.target.value)}
                placeholder="1122334455"
                required
              />
            </div>
          </div>
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

function maskKtp(ktp: string) {
  if (!ktp) return "—";
  if (ktp.length <= 6) return ktp;
  const visible = 4;
  const tail    = 4;
  const mid     = Math.max(0, ktp.length - visible - tail);
  return ktp.slice(0, visible) + "•".repeat(mid) + ktp.slice(-tail);
}

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", minimumFractionDigits: 0,
  }).format(n);
}

// ─────────────────────────────────────────────
// Helper: prefix untuk entri cash flow internal
// ─────────────────────────────────────────────
const INTERNAL_REF_PREFIX = "[Internal:";
function makeInternalRef(investorId: string) {
  return `${INTERNAL_REF_PREFIX}${investorId}]`;
}
function parseInternalRef(catatan: string): string | null {
  if (!catatan.startsWith(INTERNAL_REF_PREFIX)) return null;
  const end = catatan.indexOf("]", INTERNAL_REF_PREFIX.length);
  if (end === -1) return null;
  return catatan.slice(INTERNAL_REF_PREFIX.length, end);
}

export function InvestorsContent() {
  const { investors, addInvestor, updateInvestor, deleteInvestor, uploadBuktiTransfer, getBuktiUrl } = useInvestors();
  const { mous } = useMou();
  const { brokers, addBroker, updateBroker, deleteBroker } = useBrokers();
  const { transaksis, syncInvestorInfo } = useTransaksi();
  const { pengeluarans, addPengeluaran, updatePengeluaran, deletePengeluaran } = usePengeluaran();
  const { user, isInvestor } = useAuth();
  const isAdmin = user?.role === "admin";
  const perm    = usePermissions();
  const canEdit   = isAdmin || perm.edit;
  const canCreate = isAdmin || perm.create;
  const canDelete = isAdmin || perm.delete;
  const visibleInvestors = isInvestor && user?.investorId
    ? investors.filter((inv) => inv.id === user.investorId)
    : investors;

  const [searchQuery, setSearchQuery] = useState("");

  // ── Dana terpakai per investor (transaksi aktif: rencana + berjalan) ──
  const investorDanaMap = useMemo(() => {
    const map = new Map<string, number>();
    transaksis.forEach((t) => {
      if (t.status !== "rencana" && t.status !== "berjalan") return;
      t.investorEntries.forEach((entry) => {
        map.set(entry.investorId, (map.get(entry.investorId) ?? 0) + entry.nilaiInvestasi);
      });
    });
    return map;
  }, [transaksis]);

  // ── Estimasi bagi hasil per investor (dari data transaksi) ──
  const investorPnlMap = useMemo(() => {
    const map = new Map<string, number>();
    transaksis.forEach((t) => {
      if (t.status !== "selesai" && t.status !== "bermasalah") return;
      const c = calcTransaksi(t);
      if (c.totalInvestasi === 0) return;
      const [ty, tm, td] = (t.date as string).slice(0, 10).split("-").map(Number);
      const tTime = Date.UTC(ty, tm - 1, td);
      t.investorEntries.forEach((entry) => {
        const ratio = entry.nilaiInvestasi / c.totalInvestasi;
        // Pakai % Pihak Kedua dari PKS investor yang periodenya mencakup
        // tanggal transaksi — konsisten dengan dashboard & dokumen PKS.
        const mou = mous.find((m) => {
          if (m.investorId !== entry.investorId) return false;
          const [my, mm, md] = m.date.slice(0, 10).split("-").map(Number);
          const start = Date.UTC(my, mm - 1, md);
          return tTime >= start && tTime < start + m.contractPeriod * (m.siklus ?? 1) * 86_400_000;
        });
        const pkPct = (mou?.bagiHasilPK ?? 35) / 100;
        const bh    = c.profit > 0 ? c.profit * pkPct * ratio : 0;
        map.set(entry.investorId, (map.get(entry.investorId) ?? 0) + bh);
      });
    });
    return map;
  }, [transaksis, mous]);

  // Investor dialog state
  const [isAddInvestorOpen, setIsAddInvestorOpen] = useState(false);
  const [isEditInvestorOpen, setIsEditInvestorOpen] = useState(false);
  const [isDeleteInvestorOpen, setIsDeleteInvestorOpen] = useState(false);
  const [selectedInvestor, setSelectedInvestor] = useState<Investor | null>(null);
  const [investorForm, setInvestorForm] = useState<InvestorFormData>(initialInvestorForm);

  // Top-up dialog state
  const [isTopUpOpen, setIsTopUpOpen] = useState(false);
  const [topUpInvestor, setTopUpInvestor] = useState<Investor | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("");
  const [topUpFile, setTopUpFile] = useState<File | null>(null);

  // Bukti transfer untuk dialog tambah investor
  const [addInvestorFile, setAddInvestorFile] = useState<File | null>(null);

  // Broker dialog state
  const [isAddBrokerOpen, setIsAddBrokerOpen] = useState(false);
  const [isEditBrokerOpen, setIsEditBrokerOpen] = useState(false);
  const [isDeleteBrokerOpen, setIsDeleteBrokerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorInfo, setErrorInfo] = useState<PbErrorInfo | null>(null);
  const [selectedBroker, setSelectedBroker] = useState<Broker | null>(null);
  const [brokerForm, setBrokerForm] = useState<BrokerFormData>(initialBrokerForm);

  const filteredInvestors = visibleInvestors.filter(
    (inv) =>
      inv.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.brokerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.occupation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.phone.includes(searchQuery)
  );

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value);

  const nextInvestorId = () => {
    const maxNum = investors.reduce((max, inv) => {
      const num = parseInt(inv.id.replace("INV-", "")) || 0;
      return num > max ? num : max;
    }, 0);
    return `INV-${String(maxNum + 1).padStart(4, "0")}`;
  };

  const nextBrokerId = () => {
    const maxNum = brokers.reduce((max, b) => {
      const num = parseInt(b.id.replace("BRK-", "")) || 0;
      return num > max ? num : max;
    }, 0);
    return `BRK-${String(maxNum + 1).padStart(4, "0")}`;
  };

  // ── Helpers ──

  const activeFlags = (form: InvestorFormData) => {
    const flags: string[] = [];
    if (form.isMinBun) flags.push("MinBun");
    if (form.isTami)   flags.push("Tami");
    if (form.isDirect) flags.push("Direct");
    return flags;
  };

  const notifyOwner = async (
    type: "new_investor" | "top_up",
    investorId: string,
    investorName: string,
    amount: number,
    opts?: { totalAmount?: number; buktiUrl?: string; flags?: string[] },
  ) => {
    try {
      await fetch("/api/notify-owner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await import("@/lib/pocketbase")).default.authStore.token}`,
        },
        body: JSON.stringify({ type, investorId, investorName, amount, ...opts }),
      });
    } catch {
      // Notifikasi gagal tidak boleh menghentikan alur utama
    }
  };

  // ── Investor handlers ──

  const handleAddInvestor = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const newId = await addInvestor({
        name: investorForm.name,
        address: investorForm.address,
        brokerName: investorForm.brokerName,
        idNumber: investorForm.idNumber,
        bankName: investorForm.bankName,
        accountNumber: investorForm.accountNumber,
        phone: investorForm.phone,
        email: investorForm.email,
        occupation: investorForm.occupation,
        investmentAmount: parseFloat(investorForm.investmentAmount),
        heirName: investorForm.heirName,
        heirBankName: investorForm.heirBankName,
        heirAccountNumber: investorForm.heirAccountNumber,
        isMinBun: investorForm.isMinBun,
        isTami: investorForm.isTami,
        isDirect: investorForm.isDirect,
      });
      // Untuk investor MinBun, catat modal yang di-deploy sebagai kredit (uang MinBun terpakai)
      if (investorForm.isMinBun) {
        const today = todayWibStr();
        await addPengeluaran({
          date: today,
          deskripsi: `Modal Internal — ${investorForm.name}`,
          debet: 0,
          kredit: parseFloat(investorForm.investmentAmount) || 0,
          kategori: "Investasi",
          catatan: makeInternalRef(newId),
        });
      }
      // Upload bukti transfer jika ada
      let buktiUrl = "";
      if (addInvestorFile) {
        try {
          const filename = await uploadBuktiTransfer(newId, addInvestorFile);
          buktiUrl = getBuktiUrl(newId, filename);
        } catch { /* upload gagal — lanjut tanpa bukti */ }
      }

      // Notifikasi ke owner (fire-and-forget)
      notifyOwner("new_investor", newId, investorForm.name, parseFloat(investorForm.investmentAmount) || 0, {
        buktiUrl,
        flags: activeFlags(investorForm),
      });

      toast.success("Investor berhasil ditambahkan");
      setInvestorForm(initialInvestorForm);
      setAddInvestorFile(null);
      setIsAddInvestorOpen(false);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal menambahkan investor"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditInvestor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvestor) return;
    setIsSaving(true);
    try {
      await updateInvestor(selectedInvestor.id, {
        name: investorForm.name,
        address: investorForm.address,
        brokerName: investorForm.brokerName,
        idNumber: investorForm.idNumber,
        bankName: investorForm.bankName,
        accountNumber: investorForm.accountNumber,
        phone: investorForm.phone,
        email: investorForm.email,
        occupation: investorForm.occupation,
        investmentAmount: parseFloat(investorForm.investmentAmount),
        heirName: investorForm.heirName,
        heirBankName: investorForm.heirBankName,
        heirAccountNumber: investorForm.heirAccountNumber,
        isMinBun: investorForm.isMinBun,
        isTami: investorForm.isTami,
        isDirect: investorForm.isDirect,
      });

      // Sinkronkan nama & broker yang ter-denormalisasi di entry transaksi
      if (
        selectedInvestor.name !== investorForm.name ||
        selectedInvestor.brokerName !== investorForm.brokerName
      ) {
        await syncInvestorInfo(selectedInvestor.id, investorForm.name, investorForm.brokerName);
      }

      // Sinkronisasi cash flow untuk investor MinBun
      const wasInternal = selectedInvestor.isMinBun === true;
      const nowInternal = investorForm.isMinBun;
      const ref = makeInternalRef(selectedInvestor.id);
      const existingEntry = pengeluarans.find((p) => p.catatan === ref);

      if (wasInternal && nowInternal) {
        // Masih internal — update nilai modal jika berubah
        if (existingEntry) {
          await updatePengeluaran(existingEntry.id, {
            deskripsi: `Modal Internal — ${investorForm.name}`,
            kredit: parseFloat(investorForm.investmentAmount) || 0,
          });
        } else {
          // Entry hilang, buat ulang
          const today = todayWibStr();
          await addPengeluaran({
            date: today,
            deskripsi: `Modal Internal — ${investorForm.name}`,
            debet: 0,
            kredit: parseFloat(investorForm.investmentAmount) || 0,
            kategori: "Investasi",
            catatan: ref,
          });
        }
      } else if (!wasInternal && nowInternal) {
        // Baru ditandai internal — buat entri modal baru
        const today = todayWibStr();
        await addPengeluaran({
          date: today,
          deskripsi: `Modal Internal — ${investorForm.name}`,
          debet: 0,
          kredit: parseFloat(investorForm.investmentAmount) || 0,
          kategori: "Investasi",
          catatan: ref,
        });
      } else if (wasInternal && !nowInternal) {
        // Flag dicabut — hapus entri cash flow terkait
        if (existingEntry) {
          await deletePengeluaran(existingEntry.id);
        }
      }

      toast.success("Data investor berhasil diperbarui");
      setInvestorForm(initialInvestorForm);
      setSelectedInvestor(null);
      setIsEditInvestorOpen(false);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal memperbarui investor"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditInvestorClick = (investor: Investor) => {
    setSelectedInvestor(investor);
    setInvestorForm({
      name: investor.name,
      address: investor.address,
      brokerName: investor.brokerName,
      idNumber: investor.idNumber,
      bankName: investor.bankName,
      accountNumber: investor.accountNumber,
      phone: investor.phone,
      email: investor.email ?? "",
      occupation: investor.occupation,
      investmentAmount: investor.investmentAmount.toString(),
      heirName: investor.heirName,
      heirBankName: investor.heirBankName,
      heirAccountNumber: investor.heirAccountNumber,
      isMinBun: investor.isMinBun === true,
      isTami: investor.isTami === true,
      isDirect: investor.isDirect === true,
    });
    setIsEditInvestorOpen(true);
  };

  const handleTopUpClick = (investor: Investor) => {
    setTopUpInvestor(investor);
    setTopUpAmount("");
    setIsTopUpOpen(true);
  };

  const handleTopUpConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topUpInvestor) return;
    const nominal = parseFloat(topUpAmount);
    if (!nominal || nominal <= 0) return;
    setIsSaving(true);
    try {
      const newAmount = topUpInvestor.investmentAmount + nominal;
      await updateInvestor(topUpInvestor.id, { investmentAmount: newAmount });

      // Sinkronkan entri cash flow internal jika investor internal
      if (topUpInvestor.isMinBun) {
        const ref = makeInternalRef(topUpInvestor.id);
        const existingEntry = pengeluarans.find((p) => p.catatan === ref);
        if (existingEntry) {
          await updatePengeluaran(existingEntry.id, { kredit: newAmount });
        } else {
          await addPengeluaran({
            date: todayWibStr(),
            deskripsi: `Modal Internal — ${topUpInvestor.name}`,
            debet: 0,
            kredit: newAmount,
            kategori: "Investasi",
            catatan: ref,
          });
        }
      }

      // Upload bukti transfer jika ada
      let buktiUrl = "";
      if (topUpFile) {
        try {
          const filename = await uploadBuktiTransfer(topUpInvestor.id, topUpFile);
          buktiUrl = getBuktiUrl(topUpInvestor.id, filename);
        } catch { /* upload gagal — lanjut tanpa bukti */ }
      }

      // Notifikasi ke owner (fire-and-forget)
      notifyOwner("top_up", topUpInvestor.id, topUpInvestor.name, nominal, {
        totalAmount: newAmount,
        buktiUrl,
        flags: [
          ...(topUpInvestor.isMinBun  ? ["MinBun"]  : []),
          ...(topUpInvestor.isTami    ? ["Tami"]    : []),
          ...(topUpInvestor.isDirect  ? ["Direct"]  : []),
        ],
      });

      toast.success(`Top up ${formatRp(nominal)} berhasil ditambahkan`);
      setIsTopUpOpen(false);
      setTopUpInvestor(null);
      setTopUpAmount("");
      setTopUpFile(null);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal melakukan top up"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteInvestorClick = (investor: Investor) => {
    // Cek apakah investor masih punya MoU
    const hasMou = mous.some((m) => m.investorId === investor.id);
    if (hasMou) {
      setErrorInfo({
        title: `Investor "${investor.name}" tidak dapat dihapus`,
        fields: [{
          field: "mous",
          code: "has_related_records",
          message: "Investor masih memiliki data PKS. Hapus semua PKS terkait terlebih dahulu sebelum menghapus investor.",
        }],
        raw: "",
      });
      return;
    }
    // Cek apakah investor masih tercatat di transaksi
    const hasTransaksi = transaksis.some((t) =>
      t.investorEntries.some((e) => e.investorId === investor.id)
    );
    if (hasTransaksi) {
      setErrorInfo({
        title: `Investor "${investor.name}" tidak dapat dihapus`,
        fields: [{
          field: "transaksis",
          code: "has_related_records",
          message: "Investor masih tercatat di data transaksi. Hapus atau ubah transaksi terkait terlebih dahulu sebelum menghapus investor.",
        }],
        raw: "",
      });
      return;
    }
    setSelectedInvestor(investor);
    setIsDeleteInvestorOpen(true);
  };

  const handleDeleteInvestorConfirm = async () => {
    if (!selectedInvestor) return;
    try {
      // Hapus entri cash flow terkait terlebih dahulu.
      // Dicek tanpa melihat flag isInternal — flag bisa saja sudah dicabut
      // sementara entri lamanya masih ada.
      const ref = makeInternalRef(selectedInvestor.id);
      const internalEntry = pengeluarans.find((p) => p.catatan === ref);
      if (internalEntry) await deletePengeluaran(internalEntry.id);

      // Entri profit internal per-PKS ([Internal-Profit:INV-xxxx:MOU-...])
      const profitEntries = pengeluarans.filter((p) =>
        p.catatan?.startsWith(`[Internal-Profit:${selectedInvestor.id}:`)
      );
      for (const entry of profitEntries) {
        await deletePengeluaran(entry.id);
      }

      await deleteInvestor(selectedInvestor.id);
      toast.success("Investor berhasil dihapus");
      setSelectedInvestor(null);
      setIsDeleteInvestorOpen(false);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal menghapus investor"));
    }
  };

  // ── Broker handlers ──

  const handleAddBroker = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await addBroker({
        name: brokerForm.name,
        address: brokerForm.address,
        email: brokerForm.email,
        idNumber: brokerForm.idNumber,
        bankName: brokerForm.bankName,
        accountNumber: brokerForm.accountNumber,
        phone: brokerForm.phone,
      });
      toast.success("Broker berhasil ditambahkan");
      setBrokerForm(initialBrokerForm);
      setIsAddBrokerOpen(false);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal menambahkan broker"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditBroker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBroker) return;
    setIsSaving(true);
    try {
      await updateBroker(selectedBroker.id, {
        name: brokerForm.name,
        address: brokerForm.address,
        email: brokerForm.email,
        idNumber: brokerForm.idNumber,
        bankName: brokerForm.bankName,
        accountNumber: brokerForm.accountNumber,
        phone: brokerForm.phone,
      });
      toast.success("Data broker berhasil diperbarui");
      setBrokerForm(initialBrokerForm);
      setSelectedBroker(null);
      setIsEditBrokerOpen(false);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal memperbarui broker"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditBrokerClick = (broker: Broker) => {
    setSelectedBroker(broker);
    setBrokerForm({
      name: broker.name,
      address: broker.address,
      email: broker.email,
      idNumber: broker.idNumber,
      bankName: broker.bankName,
      accountNumber: broker.accountNumber,
      phone: broker.phone,
    });
    setIsEditBrokerOpen(true);
  };

  const handleDeleteBrokerClick = (broker: Broker) => {
    setSelectedBroker(broker);
    setIsDeleteBrokerOpen(true);
  };

  const handleDeleteBrokerConfirm = async () => {
    if (!selectedBroker) return;
    try {
      await deleteBroker(selectedBroker.id);
      toast.success("Broker berhasil dihapus");
      setSelectedBroker(null);
      setIsDeleteBrokerOpen(false);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal menghapus broker"));
    }
  };

  return (
    <div className="space-y-6">

      {/* ══════════════════════════════════════
          INVESTOR SECTION
      ══════════════════════════════════════ */}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Investors</h1>
          <p className="text-muted-foreground">Kelola data investor dan investasi</p>
        </div>
        <div className="flex items-center gap-2">
          {/* ── Tambah Broker (admin only) ── */}
          {canCreate && <Dialog open={isAddBrokerOpen} onOpenChange={setIsAddBrokerOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Tambah Broker
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Tambah Broker Baru</DialogTitle>
                <DialogDescription>Lengkapi data broker di bawah ini</DialogDescription>
              </DialogHeader>
              <BrokerFormFields
                formData={brokerForm}
                setFormData={setBrokerForm}
                onSubmit={handleAddBroker}
                submitLabel="Simpan Broker"
                previewId={nextBrokerId()}
                isSaving={isSaving}
              />
            </DialogContent>
          </Dialog>}

          {/* ── Tambah Investor ── */}
          {canCreate && <Dialog open={isAddInvestorOpen} onOpenChange={setIsAddInvestorOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Tambah Investor
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[580px]">
              <DialogHeader>
                <DialogTitle>Tambah Investor Baru</DialogTitle>
                <DialogDescription>Lengkapi semua data investor di bawah ini</DialogDescription>
              </DialogHeader>
              <InvestorFormFields
                formData={investorForm}
                setFormData={setInvestorForm}
                onSubmit={handleAddInvestor}
                submitLabel="Simpan Investor"
                previewId={nextInvestorId()}
                brokers={brokers}
                isSaving={isSaving}
                buktiFile={addInvestorFile}
                onBuktiChange={setAddInvestorFile}
              />
            </DialogContent>
          </Dialog>}
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nama, broker, atau pekerjaan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Investor Cards */}
      {filteredInvestors.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Belum ada investor</h3>
            <p className="text-muted-foreground text-sm">
              {searchQuery ? "Coba kata kunci lain" : "Tambahkan investor pertama Anda"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredInvestors.map((investor) => {
            const bagHasil   = investorPnlMap.get(investor.id) ?? 0;
            const danaTermakai = investorDanaMap.get(investor.id) ?? 0;
            const danaSisa   = Math.max(0, investor.investmentAmount - danaTermakai);
            const pct = investor.investmentAmount > 0
              ? ((bagHasil / investor.investmentAmount) * 100).toFixed(1)
              : "0.0";
            const isActive = investor.isActive === true;

            // Tentukan label & warna badge berdasarkan kondisi PKS investor
            const investorMous = mous.filter((m) => m.investorId === investor.id);
            const hasPendingMou = investorMous.some((m) => getMouStatus(m) === "pending");
            const investorBadge = isActive
              ? { label: "Aktif",   cls: "bg-green-100 text-green-800" }
              : hasPendingMou
              ? { label: "Pending", cls: "bg-yellow-100 text-yellow-800" }
              : { label: "Nonaktif", cls: "bg-red-100 text-red-700" };

            return (
            <Card key={investor.id} className={`hover:shadow-md transition-shadow ${isActive ? "" : "opacity-60"}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <CardTitle className="text-base leading-tight">{investor.name}</CardTitle>
                      <Badge
                        variant="secondary"
                        className={`${investorBadge.cls} text-[10px] px-1.5`}
                      >
                        {investorBadge.label}
                      </Badge>
                      {investor.isMinBun && (
                        <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] px-1.5 gap-0.5">
                          <ShieldCheck className="h-2.5 w-2.5" />
                          MinBun
                        </Badge>
                      )}
                      {investor.isTami && (
                        <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-[10px] px-1.5">
                          Tami
                        </Badge>
                      )}
                      {investor.isDirect && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-[10px] px-1.5">
                          Direct
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">{investor.id}</span>
                  </div>
                  {(canEdit || canDelete) && (
                  <div className="flex gap-1 shrink-0">
                    {canEdit && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleTopUpClick(investor)} title="Top Up Investasi">
                      <TrendingUp className="h-3.5 w-3.5" />
                      <span className="sr-only">Top Up</span>
                    </Button>
                    )}
                    {canEdit && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditInvestorClick(investor)}>
                      <Pencil className="h-3.5 w-3.5" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    )}
                    {canDelete && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteInvestorClick(investor)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      <span className="sr-only">Hapus</span>
                    </Button>
                    )}
                  </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Broker</p>
                    <p className="font-medium truncate">{investor.brokerName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">No Handphone</p>
                    <p className="font-medium truncate">{investor.phone}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Pekerjaan</p>
                    <p className="font-medium truncate">{investor.occupation}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">No KTP</p>
                    <p className="font-medium truncate font-mono">{maskKtp(investor.idNumber)}</p>
                  </div>
                </div>

                <div className="pt-1 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-0.5">Alamat</p>
                  <p className="text-sm leading-snug text-foreground">{investor.address}</p>
                </div>

                <div className="pt-1 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-0.5">Nilai Investasi</p>
                  <p className="text-lg font-bold text-foreground">
                    {formatCurrency(investor.investmentAmount)}
                  </p>
                </div>

                <div className="pt-1 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-1.5">Alokasi Dana</p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Terpakai</span>
                      <span className={`font-semibold ${danaTermakai > 0 ? "text-orange-600" : "text-muted-foreground"}`}>
                        {formatCurrency(danaTermakai)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Tersedia</span>
                      <span className={`font-semibold ${danaSisa > 0 ? "text-green-600" : "text-destructive"}`}>
                        {formatCurrency(danaSisa)}
                      </span>
                    </div>
                    {investor.investmentAmount > 0 && (
                      <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-orange-400 transition-all"
                          style={{ width: `${Math.min(100, (danaTermakai / investor.investmentAmount) * 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-1 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-1">Rekening Investor</p>
                  <div className="flex gap-1.5 items-center text-xs">
                    <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{investor.bankName}</span>
                    <span className="text-muted-foreground">— {investor.accountNumber}</span>
                  </div>
                </div>

                <div className="pt-1 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-1">Ahli Waris</p>
                  <p className="text-sm font-medium">{investor.heirName}</p>
                  <div className="flex gap-1.5 items-center text-xs mt-0.5">
                    <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{investor.heirBankName}</span>
                    <span className="text-muted-foreground">— {investor.heirAccountNumber}</span>
                  </div>
                </div>

                {/* ── Estimasi Bagi Hasil ── */}
                {transaksis.length > 0 && (
                  <div className="pt-1 border-t border-border/50">
                    <p className="text-xs text-muted-foreground mb-1">Estimasi Bagi Hasil</p>
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold ${bagHasil > 0 ? "text-green-600" : "text-muted-foreground"}`}>
                        {formatCurrency(bagHasil)}
                      </span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${bagHasil > 0 ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                        +{pct}%
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )
          })}
        </div>
      )}

      {!isInvestor && (<>
      <Separator className="my-4" />

      {/* ══════════════════════════════════════
          BROKER SECTION
      ══════════════════════════════════════ */}

      <div>
        <h2 className="text-xl font-bold text-foreground">Manajemen Broker</h2>
        <p className="text-muted-foreground">Kelola data broker dan informasi rekening</p>
      </div>

      {/* Broker Cards */}
      {brokers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-10">
            <Briefcase className="h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="text-base font-medium mb-1">Belum ada broker</h3>
            <p className="text-muted-foreground text-sm">
              Tambahkan broker untuk mulai mengelola data
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {brokers.map((broker) => {
            const investorCount = investors.filter(
              (inv) => inv.brokerName === broker.name
            ).length;
            return (
            <Card key={broker.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base leading-tight">{broker.name}</CardTitle>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-mono text-muted-foreground">{broker.id}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5">
                        {investorCount} investor
                      </Badge>
                    </div>
                  </div>
                  {(canEdit || canDelete) && (
                  <div className="flex gap-1 shrink-0">
                    {canEdit && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditBrokerClick(broker)}>
                      <Pencil className="h-3.5 w-3.5" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    )}
                    {canDelete && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteBrokerClick(broker)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      <span className="sr-only">Hapus</span>
                    </Button>
                    )}
                  </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <div>
                    <p className="text-xs text-muted-foreground">No Handphone</p>
                    <p className="font-medium">{broker.phone}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">No KTP</p>
                    <p className="font-medium font-mono">{maskKtp(broker.idNumber)}</p>
                  </div>
                </div>
                <div className="pt-1 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-0.5">Alamat</p>
                  <p className="text-sm leading-snug">{broker.address}</p>
                </div>
                <div className="pt-1 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-1">Rekening Broker</p>
                  <div className="flex gap-1.5 items-center text-xs">
                    <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span className="font-medium">{broker.bankName}</span>
                    <span className="text-muted-foreground">— {broker.accountNumber}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
          })}
        </div>
      )}

      {/* ══════════════════════════════════════
          DIALOGS — Investor
      ══════════════════════════════════════ */}

      <Dialog open={isEditInvestorOpen} onOpenChange={setIsEditInvestorOpen}>
        <DialogContent className="sm:max-w-[580px]">
          <DialogHeader>
            <DialogTitle>Edit Investor</DialogTitle>
            <DialogDescription>
              Perbarui data investor — ID tidak dapat diubah
            </DialogDescription>
          </DialogHeader>
          <InvestorFormFields
            formData={investorForm}
            setFormData={setInvestorForm}
            onSubmit={handleEditInvestor}
            submitLabel="Simpan Perubahan"
            previewId={selectedInvestor?.id ?? ""}
            brokers={brokers}
            isSaving={isSaving}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteInvestorOpen} onOpenChange={setIsDeleteInvestorOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Hapus Investor</DialogTitle>
            <DialogDescription>
              Yakin ingin menghapus <strong>{selectedInvestor?.name}</strong>?{" "}
              Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDeleteInvestorOpen(false)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleDeleteInvestorConfirm}>
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Top Up ── */}
      <Dialog open={isTopUpOpen} onOpenChange={setIsTopUpOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Top Up Investasi</DialogTitle>
            <DialogDescription>
              Tambah dana investasi untuk <strong>{topUpInvestor?.name}</strong>
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleTopUpConfirm}>
            <div className="space-y-4 py-2">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nilai saat ini</span>
                  <span className="font-semibold">{formatRp(topUpInvestor?.investmentAmount ?? 0)}</span>
                </div>
                {topUpAmount && parseFloat(topUpAmount) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>+ Top up</span>
                    <span className="font-semibold">{formatRp(parseFloat(topUpAmount))}</span>
                  </div>
                )}
                {topUpAmount && parseFloat(topUpAmount) > 0 && (
                  <div className="flex justify-between border-t pt-1.5 font-bold">
                    <span>Total baru</span>
                    <span>{formatRp((topUpInvestor?.investmentAmount ?? 0) + parseFloat(topUpAmount))}</span>
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="topup-amount" className="text-xs">
                  Nominal Top Up (Rp) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="topup-amount"
                  type="number"
                  min="1"
                  step="1000000"
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  placeholder="50000000"
                  required
                  autoFocus
                />
              </div>
              <BuktiUploadField file={topUpFile} onChange={setTopUpFile} />
            </div>
            <DialogFooter className="mt-4 pt-4 border-t gap-2">
              <Button type="button" variant="outline" onClick={() => setIsTopUpOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={isSaving} className="bg-green-600 hover:bg-green-700">
                {isSaving ? "Menyimpan…" : "Konfirmasi Top Up"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      </>)}{/* end !isInvestor broker section */}

      {/* ══════════════════════════════════════
          DIALOGS — Broker
      ══════════════════════════════════════ */}

      <Dialog open={isEditBrokerOpen} onOpenChange={setIsEditBrokerOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Broker</DialogTitle>
            <DialogDescription>
              Perbarui data broker — ID tidak dapat diubah
            </DialogDescription>
          </DialogHeader>
          <BrokerFormFields
            formData={brokerForm}
            setFormData={setBrokerForm}
            onSubmit={handleEditBroker}
            submitLabel="Simpan Perubahan"
            previewId={selectedBroker?.id ?? ""}
            isSaving={isSaving}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteBrokerOpen} onOpenChange={setIsDeleteBrokerOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Hapus Broker</DialogTitle>
            <DialogDescription>
              Yakin ingin menghapus broker <strong>{selectedBroker?.name}</strong>?{" "}
              Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDeleteBrokerOpen(false)}>
              Batal
            </Button>
            <Button variant="destructive" onClick={handleDeleteBrokerConfirm}>
              Hapus
            </Button>
          </DialogFooter>
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
