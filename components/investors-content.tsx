"use client";

import { useState, useMemo } from "react";
import { useInvestors, type Investor } from "@/lib/investors-context";
import { useBrokers, type Broker } from "@/lib/brokers-context";
import { useTransaksi, calcTransaksi } from "@/lib/transaksi-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  Plus, Pencil, Trash2, Search, Users, Briefcase, Building2,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";

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
  occupation: string;
  investmentAmount: string;
  heirName: string;
  heirBankName: string;
  heirAccountNumber: string;
}

interface BrokerFormData {
  name: string;
  address: string;
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
  occupation: "",
  investmentAmount: "",
  heirName: "",
  heirBankName: "",
  heirAccountNumber: "",
};

const initialBrokerForm: BrokerFormData = {
  name: "",
  address: "",
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
}

function InvestorFormFields({ formData, setFormData, onSubmit, submitLabel, previewId, brokers }: InvestorFormProps) {
  const set = (key: keyof InvestorFormData, value: string) =>
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

        {/* ── Data Ahli Waris ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Data Ahli Waris
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="inv-heir-name" className="text-xs">
              Nama Ahli Waris <span className="text-destructive">*</span>
            </Label>
            <Input
              id="inv-heir-name"
              value={formData.heirName}
              onChange={(e) => set("heirName", e.target.value)}
              placeholder="Jane Smith"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-heir-bank" className="text-xs">
                Nama Bank Ahli Waris <span className="text-destructive">*</span>
              </Label>
              <Input
                id="inv-heir-bank"
                value={formData.heirBankName}
                onChange={(e) => set("heirBankName", e.target.value)}
                placeholder="BCA"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-heir-account" className="text-xs">
                No Rekening Ahli Waris <span className="text-destructive">*</span>
              </Label>
              <Input
                id="inv-heir-account"
                value={formData.heirAccountNumber}
                onChange={(e) => set("heirAccountNumber", e.target.value)}
                placeholder="0987654321"
                required
              />
            </div>
          </div>
        </div>
      </div>

      <DialogFooter className="mt-4 pt-4 border-t">
        <Button type="submit">{submitLabel}</Button>
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
}

function BrokerFormFields({ formData, setFormData, onSubmit, submitLabel, previewId }: BrokerFormProps) {
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
        <Button type="submit">{submitLabel}</Button>
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

export function InvestorsContent() {
  const { investors, addInvestor, updateInvestor, deleteInvestor } = useInvestors();
  const { brokers, addBroker, updateBroker, deleteBroker } = useBrokers();
  const { transaksis } = useTransaksi();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [searchQuery, setSearchQuery] = useState("");

  // ── Estimasi bagi hasil per investor (dari data transaksi) ──
  const investorPnlMap = useMemo(() => {
    const map = new Map<string, number>();
    transaksis.forEach((t) => {
      const c = calcTransaksi(t);
      if (c.totalInvestasi === 0) return;
      t.investorEntries.forEach((entry) => {
        const ratio = entry.nilaiInvestasi / c.totalInvestasi;
        const bh    = c.profit > 0 ? c.profit * 0.35 * ratio : 0;
        map.set(entry.investorId, (map.get(entry.investorId) ?? 0) + bh);
      });
    });
    return map;
  }, [transaksis]);

  // Investor dialog state
  const [isAddInvestorOpen, setIsAddInvestorOpen] = useState(false);
  const [isEditInvestorOpen, setIsEditInvestorOpen] = useState(false);
  const [isDeleteInvestorOpen, setIsDeleteInvestorOpen] = useState(false);
  const [selectedInvestor, setSelectedInvestor] = useState<Investor | null>(null);
  const [investorForm, setInvestorForm] = useState<InvestorFormData>(initialInvestorForm);

  // Broker dialog state
  const [isAddBrokerOpen, setIsAddBrokerOpen] = useState(false);
  const [isEditBrokerOpen, setIsEditBrokerOpen] = useState(false);
  const [isDeleteBrokerOpen, setIsDeleteBrokerOpen] = useState(false);
  const [selectedBroker, setSelectedBroker] = useState<Broker | null>(null);
  const [brokerForm, setBrokerForm] = useState<BrokerFormData>(initialBrokerForm);

  const filteredInvestors = investors.filter(
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

  // ── Investor handlers ──

  const handleAddInvestor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addInvestor({
        name: investorForm.name,
        address: investorForm.address,
        brokerName: investorForm.brokerName,
        idNumber: investorForm.idNumber,
        bankName: investorForm.bankName,
        accountNumber: investorForm.accountNumber,
        phone: investorForm.phone,
        occupation: investorForm.occupation,
        investmentAmount: parseFloat(investorForm.investmentAmount),
        heirName: investorForm.heirName,
        heirBankName: investorForm.heirBankName,
        heirAccountNumber: investorForm.heirAccountNumber,
      });
      setInvestorForm(initialInvestorForm);
      setIsAddInvestorOpen(false);
    } catch (err) {
      console.error("Gagal menambahkan investor:", err);
      const detail = err && typeof err === "object" && "data" in err
        ? JSON.stringify((err as Record<string, unknown>).data, null, 2)
        : String(err);
      console.error("Detail validasi PocketBase:", detail);
      alert(`Gagal menambahkan investor.\n\nDetail:\n${detail}`);
    }
  };

  const handleEditInvestor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvestor) return;
    try {
      await updateInvestor(selectedInvestor.id, {
        name: investorForm.name,
        address: investorForm.address,
        brokerName: investorForm.brokerName,
        idNumber: investorForm.idNumber,
        bankName: investorForm.bankName,
        accountNumber: investorForm.accountNumber,
        phone: investorForm.phone,
        occupation: investorForm.occupation,
        investmentAmount: parseFloat(investorForm.investmentAmount),
        heirName: investorForm.heirName,
        heirBankName: investorForm.heirBankName,
        heirAccountNumber: investorForm.heirAccountNumber,
      });
      setInvestorForm(initialInvestorForm);
      setSelectedInvestor(null);
      setIsEditInvestorOpen(false);
    } catch (err) {
      console.error("Gagal memperbarui investor:", err);
      alert("Gagal memperbarui investor. Periksa koneksi atau log konsol untuk detail.");
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
      occupation: investor.occupation,
      investmentAmount: investor.investmentAmount.toString(),
      heirName: investor.heirName,
      heirBankName: investor.heirBankName,
      heirAccountNumber: investor.heirAccountNumber,
    });
    setIsEditInvestorOpen(true);
  };

  const handleDeleteInvestorClick = (investor: Investor) => {
    setSelectedInvestor(investor);
    setIsDeleteInvestorOpen(true);
  };

  const handleDeleteInvestorConfirm = () => {
    if (selectedInvestor) deleteInvestor(selectedInvestor.id);
    setSelectedInvestor(null);
    setIsDeleteInvestorOpen(false);
  };

  // ── Broker handlers ──

  const handleAddBroker = (e: React.FormEvent) => {
    e.preventDefault();
    addBroker({
      name: brokerForm.name,
      address: brokerForm.address,
      idNumber: brokerForm.idNumber,
      bankName: brokerForm.bankName,
      accountNumber: brokerForm.accountNumber,
      phone: brokerForm.phone,
    });
    setBrokerForm(initialBrokerForm);
    setIsAddBrokerOpen(false);
  };

  const handleEditBroker = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedBroker) {
      updateBroker(selectedBroker.id, {
        name: brokerForm.name,
        address: brokerForm.address,
        idNumber: brokerForm.idNumber,
        bankName: brokerForm.bankName,
        accountNumber: brokerForm.accountNumber,
        phone: brokerForm.phone,
      });
    }
    setBrokerForm(initialBrokerForm);
    setSelectedBroker(null);
    setIsEditBrokerOpen(false);
  };

  const handleEditBrokerClick = (broker: Broker) => {
    setSelectedBroker(broker);
    setBrokerForm({
      name: broker.name,
      address: broker.address,
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

  const handleDeleteBrokerConfirm = () => {
    if (selectedBroker) deleteBroker(selectedBroker.id);
    setSelectedBroker(null);
    setIsDeleteBrokerOpen(false);
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
          {isAdmin && <Dialog open={isAddBrokerOpen} onOpenChange={setIsAddBrokerOpen}>
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
              />
            </DialogContent>
          </Dialog>}

          {/* ── Tambah Investor ── */}
          <Dialog open={isAddInvestorOpen} onOpenChange={setIsAddInvestorOpen}>
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
              />
            </DialogContent>
          </Dialog>
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
            const bagHasil = investorPnlMap.get(investor.id) ?? 0;
            const pct = investor.investmentAmount > 0
              ? ((bagHasil / investor.investmentAmount) * 100).toFixed(1)
              : "0.0";
            const isActive = investor.isActive !== false;
            return (
            <Card key={investor.id} className={`hover:shadow-md transition-shadow ${isActive ? "" : "opacity-60"}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <CardTitle className="text-base leading-tight">{investor.name}</CardTitle>
                      <Badge
                        variant="secondary"
                        className={isActive
                          ? "bg-green-100 text-green-800 text-[10px] px-1.5"
                          : "bg-red-100 text-red-700 text-[10px] px-1.5"}
                      >
                        {isActive ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">{investor.id}</span>
                  </div>
                  {isAdmin && (
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleEditInvestorClick(investor)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleDeleteInvestorClick(investor)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      <span className="sr-only">Hapus</span>
                    </Button>
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
                  {isAdmin && (
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleEditBrokerClick(broker)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => handleDeleteBrokerClick(broker)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      <span className="sr-only">Hapus</span>
                    </Button>
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
    </div>
  );
}
