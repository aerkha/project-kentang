"use client";

import { useState } from "react";
import { useMou, type MoU } from "@/lib/mou-context";
import { useInvestors, type Investor } from "@/lib/investors-context";
import { useAuth } from "@/lib/auth-context";
import { generateMouHtml } from "@/lib/mou-html";
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
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

type MouStatus = "aktif" | "expired" | "nonaktif";

function getMouStatus(mou: MoU): MouStatus {
  if (mou.isTerminated) return "nonaktif";
  const end = new Date(mou.date);
  end.setDate(end.getDate() + mou.contractPeriod);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return end >= today ? "aktif" : "expired";
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
  isEdit?: boolean;
}

function MouFormFields({
  formData,
  setFormData,
  onSubmit,
  submitLabel,
  previewId,
  investors,
  onInvestorSelect,
  isEdit = false,
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
            <Label htmlFor="mou-keterangan" className="text-xs">Keterangan</Label>
            <Input
              id="mou-keterangan"
              value={formData.keterangan}
              onChange={(e) => set("keterangan", e.target.value)}
              placeholder="Catatan tambahan (opsional)"
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
                min="1"
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

type Filter = "semua" | "aktif" | "expired" | "nonaktif";

export function MouContent() {
  const { mous, addMou, updateMou, deleteMou } = useMou();
  const { investors } = useInvestors();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const [filter, setFilter] = useState<Filter>("semua");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isTerminateOpen, setIsTerminateOpen] = useState(false);
  const [terminateAction, setTerminateAction] = useState<"nonaktifkan" | "aktifkan">("nonaktifkan");
  const [selected, setSelected] = useState<MoU | null>(null);
  const [form, setForm] = useState<MouFormData>(initialForm);

  // ── Filter ──
  const filtered = mous.filter((m) => {
    if (filter === "semua") return true;
    return getMouStatus(m) === filter;
  });

  // ── Terminate / Reactivate ──
  const openTerminate = (mou: MoU) => {
    setSelected(mou);
    setTerminateAction(mou.isTerminated ? "aktifkan" : "nonaktifkan");
    setIsTerminateOpen(true);
  };

  const confirmTerminate = () => {
    if (selected) {
      updateMou(selected.id, { isTerminated: terminateAction === "nonaktifkan" });
    }
    setSelected(null);
    setIsTerminateOpen(false);
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

  // ── Handlers ──
  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    addMou({
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
    });
    setForm(initialForm);
    setIsAddOpen(false);
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    updateMou(selected.id, {
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
    });
    setForm(initialForm);
    setSelected(null);
    setIsEditOpen(false);
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
    });
    setIsEditOpen(true);
  };

  const openDelete = (mou: MoU) => {
    setSelected(mou);
    setIsDeleteOpen(true);
  };

  const confirmDelete = () => {
    if (selected) deleteMou(selected.id);
    setSelected(null);
    setIsDeleteOpen(false);
  };

  const handlePrint = (mou: MoU) => {
    const html = generateMouHtml(mou);
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
    semua: mous.length,
    aktif: mous.filter((m) => getMouStatus(m) === "aktif").length,
    expired: mous.filter((m) => getMouStatus(m) === "expired").length,
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
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex flex-wrap gap-2">
        {(["semua", "aktif", "expired", "nonaktif"] as Filter[]).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter(f)}
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
            <CardTitle className="text-base">Daftar MoU</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">No. MoU</th>
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
                  {filtered.map((mou) => {
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
                              title={mou.isTerminated ? "Aktifkan Kembali" : "Nonaktifkan"}
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
        </Card>
      )}

      {/* ── Edit dialog ── */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Edit MoU</DialogTitle>
            <DialogDescription>
              Perbarui data MoU — No. MoU tidak dapat diubah
            </DialogDescription>
          </DialogHeader>
          <MouFormFields
            formData={form}
            setFormData={setForm}
            onSubmit={handleEdit}
            submitLabel="Simpan Perubahan"
            previewId={selected?.id ?? ""}
            investors={investors}
            onInvestorSelect={handleInvestorSelect}
            isEdit
          />
        </DialogContent>
      </Dialog>

      {/* ── Delete dialog ── */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Hapus MoU</DialogTitle>
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
            <Button variant="destructive" onClick={confirmDelete}>
              Hapus
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
                  Yakin ingin <strong>menghentikan</strong> MoU{" "}
                  <strong>{selected?.id}</strong> atas nama{" "}
                  <strong>{selected?.investorName}</strong>?{" "}
                  Perjanjian akan ditandai sebagai <em>nonaktif</em> secara manual.
                  Data tidak akan dihapus dan bisa diaktifkan kembali kapan saja.
                </>
              ) : (
                <>
                  Aktifkan kembali MoU <strong>{selected?.id}</strong> atas nama{" "}
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
              >
                <PowerOff className="h-4 w-4 mr-2" />
                Nonaktifkan
              </Button>
            ) : (
              <Button
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={confirmTerminate}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Aktifkan Kembali
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
