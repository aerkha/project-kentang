"use client";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  usePengeluaran,
  calcRunningBalance,
  type Pengeluaran,
} from "@/lib/cashflow-context";
import { useAuth } from "@/lib/auth-context";
import { todayWibStr } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorDialog } from "@/components/ui/error-dialog";
import { formatPbError, type PbErrorInfo } from "@/lib/pb-error";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Wallet, Download, ShieldCheck } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KATEGORI_OPTIONS } from "@/lib/cashflow-context";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function fmt(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(iso: string) {
  if (!iso) return "-";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

// ─────────────────────────────────────────────
// Form data
// ─────────────────────────────────────────────

interface FormData {
  date: string;
  deskripsi: string;
  debet: string;
  kredit: string;
  kategori: string;
  catatan: string;
}

const emptyForm: FormData = {
  date: "", deskripsi: "", debet: "", kredit: "", kategori: "", catatan: "",
};

// ── Entri otomatis ──
// Entri dengan tag berikut dibuat & dikelola otomatis oleh sistem (Reminder,
// modal investor/PKS). Tag di kolom catatan dipakai untuk dedup & sinkronisasi —
// mengubah/menghapusnya manual bisa membuat sistem mencatat ulang atau
// kehilangan jejak. Tampilkan peringatan saat user mengedit/menghapusnya.
const AUTO_TAG_PREFIXES = [
  "[Reminder]",
  "[Internal:",
  "[Internal-Profit:",
  "[Modal-Investor:",
  "[Modal-PKS:",
  "[Modal-Kembali:",
];

function isAutoEntry(p: Pengeluaran | null): boolean {
  return !!p?.catatan && AUTO_TAG_PREFIXES.some((t) => p.catatan!.startsWith(t));
}

// ─────────────────────────────────────────────
// Form component
// ─────────────────────────────────────────────

function PengeluaranForm({
  formData,
  setFormData,
  onSubmit,
  submitLabel,
  isSaving,
}: {
  formData: FormData;
  setFormData: (f: FormData) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  submitLabel: string;
  isSaving: boolean;
}) {
  const set = (k: keyof FormData, v: string) =>
    setFormData({ ...formData, [k]: v });

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Tanggal & Deskripsi */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pgl-date" className="text-xs">
            Tanggal <span className="text-destructive">*</span>
          </Label>
          <Input
            id="pgl-date"
            type="date"
            value={formData.date}
            onChange={(e) => set("date", e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pgl-deskripsi" className="text-xs">
            Deskripsi <span className="text-destructive">*</span>
          </Label>
          <Input
            id="pgl-deskripsi"
            value={formData.deskripsi}
            onChange={(e) => set("deskripsi", e.target.value)}
            placeholder="Keterangan transaksi"
            required
          />
        </div>
      </div>

      {/* Kategori */}
      <div className="space-y-1.5">
        <Label htmlFor="pgl-kategori" className="text-xs">
          Kategori <span className="text-destructive">*</span>
        </Label>
        <Select
          value={formData.kategori}
          onValueChange={(v) => set("kategori", v)}
          required
        >
          <SelectTrigger id="pgl-kategori">
            <SelectValue placeholder="Pilih kategori…" />
          </SelectTrigger>
          <SelectContent>
            {KATEGORI_OPTIONS.map((k) => (
              <SelectItem key={k} value={k}>{k}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Debet & Kredit */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="pgl-debet" className="text-xs text-green-700 dark:text-green-400">
            Debet (Pemasukan)
          </Label>
          <Input
            id="pgl-debet"
            type="number"
            min="0"
            step="1000"
            value={formData.debet}
            onChange={(e) => set("debet", e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pgl-kredit" className="text-xs text-red-600 dark:text-red-400">
            Kredit (Pengeluaran)
          </Label>
          <Input
            id="pgl-kredit"
            type="number"
            min="0"
            step="1000"
            value={formData.kredit}
            onChange={(e) => set("kredit", e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      {/* Catatan */}
      <div className="space-y-1.5">
        <Label htmlFor="pgl-catatan" className="text-xs">Catatan</Label>
        <Input
          id="pgl-catatan"
          value={formData.catatan}
          onChange={(e) => set("catatan", e.target.value)}
          placeholder="Opsional"
        />
      </div>

      <DialogFooter>
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

export function CashflowContent() {
  const { pengeluarans, addPengeluaran, updatePengeluaran, deletePengeluaran } =
    usePengeluaran();
  const { user, canEdit } = useAuth();
  const isAdmin = canEdit; // owner dan admin sama-sama bisa edit cash flow

  // ── Navigasi bulan (default: bulan berjalan menurut kalender WIB) ──
  const [year,  setYear]  = useState(() => parseInt(todayWibStr().slice(0, 4)));
  const [month, setMonth] = useState(() => parseInt(todayWibStr().slice(5, 7))); // 1–12

  const prevMonth = () => {
    if (month === 1) { setYear((y) => y - 1); setMonth(12); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear((y) => y + 1); setMonth(1); }
    else setMonth((m) => m + 1);
  };

  // ── Data bulan ini ──
  const ymStr = `${year}-${String(month).padStart(2, "0")}`;  // "2025-06"

  // Semua data terurut (sudah disort di context)
  const allWithSaldo = useMemo(() => calcRunningBalance(pengeluarans), [pengeluarans]);

  // Saldo awal bulan = saldo entry terakhir sebelum bulan ini (atau 0)
  const saldoAwal = useMemo(() => {
    const prev = allWithSaldo.filter((p) => p.date < `${ymStr}-01`);
    return prev.length ? prev[prev.length - 1].saldo : 0;
  }, [allWithSaldo, ymStr]);

  // Entri bulan ini dengan saldo running (urutan kronologis — terlama di atas)
  const monthEntries = useMemo(
    () => allWithSaldo.filter((p) => p.date.startsWith(ymStr)),
    [allWithSaldo, ymStr],
  );

  const totalDebet  = monthEntries.reduce((s, p) => s + p.debet,  0);
  const totalKredit = monthEntries.reduce((s, p) => s + p.kredit, 0);
  const saldoAkhir  = monthEntries.length
    ? monthEntries[monthEntries.length - 1].saldo
    : saldoAwal;

  // ── State dialog ──
  const [isAddOpen,    setIsAddOpen]    = useState(false);
  const [isEditOpen,   setIsEditOpen]   = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selected,     setSelected]     = useState<Pengeluaran | null>(null);
  const [form,         setForm]         = useState<FormData>(emptyForm);
  const [isSaving,     setIsSaving]     = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [errorInfo,    setErrorInfo]    = useState<PbErrorInfo | null>(null);

  // ── Validasi: salah satu debet/kredit harus diisi > 0 ──
  const validateForm = (f: FormData): string | null => {
    const d = parseFloat(f.debet)  || 0;
    const k = parseFloat(f.kredit) || 0;
    if (d <= 0 && k <= 0) return "Isi minimal salah satu — Debet (pemasukan) atau Kredit (pengeluaran).";
    if (d > 0 && k > 0)   return "Isi hanya salah satu — Debet atau Kredit, tidak keduanya.";
    return null;
  };

  // ── Handler tambah ──
  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const err = validateForm(form);
    if (err) { toast.error(err); return; }
    if (!form.kategori) { toast.error("Pilih kategori terlebih dahulu."); return; }
    setIsSaving(true);
    try {
      await addPengeluaran({
        date:      form.date,
        deskripsi: form.deskripsi,
        debet:     parseFloat(form.debet)  || 0,
        kredit:    parseFloat(form.kredit) || 0,
        kategori:  form.kategori,
        catatan:   form.catatan,
      });
      toast.success("Entri berhasil ditambahkan");
      setIsAddOpen(false);
      setForm(emptyForm);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal menambahkan entri"));
    } finally {
      setIsSaving(false);
    }
  };

  // ── Handler edit ──
  const openEdit = (p: Pengeluaran) => {
    setSelected(p);
    setForm({
      date:      p.date,
      deskripsi: p.deskripsi,
      debet:     p.debet  ? String(p.debet)  : "",
      kredit:    p.kredit ? String(p.kredit) : "",
      kategori:  p.kategori ?? "",
      catatan:   p.catatan ?? "",
    });
    setIsEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selected) return;
    const err = validateForm(form);
    if (err) { toast.error(err); return; }
    if (!form.kategori) { toast.error("Pilih kategori terlebih dahulu."); return; }
    setIsSaving(true);
    try {
      await updatePengeluaran(selected.id, {
        date:      form.date,
        deskripsi: form.deskripsi,
        debet:     parseFloat(form.debet)  || 0,
        kredit:    parseFloat(form.kredit) || 0,
        kategori:  form.kategori,
        catatan:   form.catatan,
      });
      toast.success("Entri berhasil diperbarui");
      setIsEditOpen(false);
      setSelected(null);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal memperbarui entri"));
    } finally {
      setIsSaving(false);
    }
  };

  // ── Handler hapus ──
  const openDelete = (p: Pengeluaran) => {
    setSelected(p);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!selected) return;
    setIsConfirming(true);
    try {
      await deletePengeluaran(selected.id);
      toast.success("Entri berhasil dihapus");
      setIsDeleteOpen(false);
      setSelected(null);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal menghapus entri"));
    } finally {
      setIsConfirming(false);
    }
  };

  // ── Export CSV ──
  const exportCsv = () => {
    const header = ["No", "Tanggal", "Deskripsi", "Kategori", "Debet", "Kredit", "Saldo Akhir", "Catatan"];
    const rows = monthEntries.map((p, i) => [
      i + 1,
      p.date,
      `"${p.deskripsi.replace(/"/g, '""')}"`,
      `"${(p.kategori ?? "").replace(/"/g, '""')}"`,
      p.debet  || 0,
      p.kredit || 0,
      p.saldo,
      `"${(p.catatan ?? "").replace(/"/g, '""')}"`,
    ]);
    // Baris saldo awal & total
    const saldoAwalRow  = ["", "", "Saldo Awal", "", "", "", saldoAwal, ""];
    const totalRow      = ["", "", "TOTAL", "", totalDebet, totalKredit, saldoAkhir, ""];
    const csv = [header, saldoAwalRow, ...rows, totalRow]
      .map((r) => r.join(","))
      .join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `pengeluaran-${BULAN[month - 1].toLowerCase()}-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Default tanggal saat buka form tambah ──
  const openAdd = () => {
    setForm({ ...emptyForm, date: `${ymStr}-01` });
    setIsAddOpen(true);
  };

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Arus Kas</h1>
          <p className="text-muted-foreground">Buku kas — rekening koran operasional</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv} disabled={monthEntries.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          {isAdmin && (
          <Button onClick={openAdd}>
            <Plus className="w-4 h-4 mr-2" />
            Tambah Entri
          </Button>
          )}
        </div>
      </div>

      {/* ── Navigasi bulan ── */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="icon" onClick={prevMonth}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">
          {BULAN[month - 1]} {year}
        </h2>
        <Button variant="outline" size="icon" onClick={nextMonth}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Ringkasan bulan ── */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <p className="text-xs text-muted-foreground">Total Debet</p>
            </div>
            <p className="text-base font-bold text-green-700 dark:text-green-400 truncate">{fmt(totalDebet)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <p className="text-xs text-muted-foreground">Total Kredit</p>
            </div>
            <p className="text-base font-bold text-red-600 dark:text-red-400 truncate">{fmt(totalKredit)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-primary" />
              <p className="text-xs text-muted-foreground">Saldo Akhir</p>
            </div>
            <p className={`text-base font-bold truncate ${saldoAkhir >= 0 ? "text-foreground" : "text-red-600"}`}>
              {fmt(saldoAkhir)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Tabel ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            Daftar Entri — {BULAN[month - 1]} {year}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {monthEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center">
              <Wallet className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-sm font-medium">Belum ada entri bulan ini</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Klik &ldquo;Tambah Entri&rdquo; untuk mencatat transaksi
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground w-10">No</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Tgl</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Deskripsi</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Kategori</th>
                    <th className="text-right py-3 px-4 font-medium text-green-700 dark:text-green-400">Debet</th>
                    <th className="text-right py-3 px-4 font-medium text-red-600 dark:text-red-400">Kredit</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Saldo Akhir</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Catatan</th>
                    {isAdmin && (
                      <th className="text-center py-3 px-4 font-medium text-muted-foreground">Aksi</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {/* ── Baris Saldo Awal (carry-over dari bulan sebelumnya) ── */}
                  <tr className="border-b border-border bg-muted/40">
                    <td className="py-2.5 px-4 text-muted-foreground text-xs">—</td>
                    <td className="py-2.5 px-4 text-xs text-muted-foreground">01/{String(month).padStart(2,"0")}</td>
                    <td className="py-2.5 px-4 text-xs font-semibold text-muted-foreground italic" colSpan={5}>
                      Saldo Awal {BULAN[month - 1]} {year}
                    </td>
                    <td className="py-2.5 px-4 text-right text-xs font-bold tabular-nums">
                      {fmt(saldoAwal)}
                    </td>
                    <td className="py-2.5 px-4" colSpan={isAdmin ? 2 : 1} />
                  </tr>
                  {monthEntries.map((p, i) => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="py-3 px-4 text-muted-foreground">{i + 1}</td>
                      <td className="py-3 px-4 text-muted-foreground whitespace-nowrap">{fmtDate(p.date)}</td>
                      <td className="py-3 px-4 font-medium">{p.deskripsi}</td>
                      <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                        {p.kategori || <span className="italic opacity-50">—</span>}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {p.debet > 0 ? (
                          <span className="text-green-700 dark:text-green-400 font-medium">
                            {fmt(p.debet)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right tabular-nums">
                        {p.kredit > 0 ? (
                          <span className="text-red-600 dark:text-red-400 font-medium">
                            {fmt(p.kredit)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className={`py-3 px-4 text-right tabular-nums font-semibold ${p.saldo < 0 ? "text-red-600" : ""}`}>
                        {fmt(p.saldo)}
                      </td>
                      <td className="py-3 px-4 text-xs max-w-[200px]">
                        {p.catatan?.startsWith("[Internal-Profit:") ? (
                          <div className="flex items-center gap-1">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 w-fit whitespace-nowrap">
                              <ShieldCheck className="h-2.5 w-2.5" />
                              Profit Internal
                            </span>
                          </div>
                        ) : p.catatan?.startsWith("[Internal:") ? (
                          <div className="flex items-center gap-1">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-primary/10 text-primary w-fit whitespace-nowrap">
                              <ShieldCheck className="h-2.5 w-2.5" />
                              Modal Internal
                            </span>
                          </div>
                        ) : p.catatan?.startsWith("[Reminder]") ? (
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 w-fit whitespace-nowrap">
                              🔔 Dari Reminder
                            </span>
                            <span className="text-muted-foreground truncate">
                              {p.catatan.replace("[Reminder] ", "")}
                            </span>
                          </div>
                        ) : p.catatan?.startsWith("[Modal-Investor:") ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 w-fit whitespace-nowrap">
                            💰 Modal Investor Masuk
                          </span>
                        ) : p.catatan?.startsWith("[Modal-PKS:") ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 w-fit whitespace-nowrap">
                            📄 Modal Digunakan PKS
                          </span>
                        ) : p.catatan?.startsWith("[Modal-Kembali:") ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400 w-fit whitespace-nowrap">
                            ↩️ Modal Dikembalikan
                          </span>
                        ) : (
                          <span className="text-muted-foreground truncate block">{p.catatan || "—"}</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Edit"
                              onClick={() => openEdit(p)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Hapus"
                              onClick={() => openDelete(p)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                {/* Footer total */}
                <tfoot>
                  <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                    <td colSpan={4} className="py-3 px-4 text-sm">Total Bulan Ini</td>
                    <td className="py-3 px-4 text-right tabular-nums text-green-700 dark:text-green-400">
                      {fmt(totalDebet)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums text-red-600 dark:text-red-400">
                      {fmt(totalKredit)}
                    </td>
                    <td className={`py-3 px-4 text-right tabular-nums ${saldoAkhir < 0 ? "text-red-600" : ""}`}>
                      {fmt(saldoAkhir)}
                    </td>
                    <td colSpan={isAdmin ? 2 : 1} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Dialog Tambah ── */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Tambah Entri</DialogTitle>
            <DialogDescription>
              Catat pemasukan (debet) atau pengeluaran (kredit) baru.
            </DialogDescription>
          </DialogHeader>
          <PengeluaranForm
            formData={form}
            setFormData={setForm}
            onSubmit={handleAdd}
            submitLabel="Simpan"
            isSaving={isSaving}
          />
        </DialogContent>
      </Dialog>

      {/* ── Dialog Edit ── */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Edit Entri</DialogTitle>
            <DialogDescription>
              Perbarui data entri — ID tidak dapat diubah.
            </DialogDescription>
          </DialogHeader>
          {isAutoEntry(selected) && (
            <div className="rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-3 text-xs text-orange-800 dark:text-orange-300">
              <p className="font-semibold mb-0.5">⚠ Entri otomatis dari sistem</p>
              <p>
                Entri ini dibuat otomatis (Reminder / modal investor / modal PKS).
                Mengubah <strong>catatan</strong>-nya dapat membuat sistem mencatat
                ulang entri yang sama atau kehilangan jejak sinkronisasi.
              </p>
            </div>
          )}
          <PengeluaranForm
            formData={form}
            setFormData={setForm}
            onSubmit={handleEdit}
            submitLabel="Simpan Perubahan"
            isSaving={isSaving}
          />
        </DialogContent>
      </Dialog>

      {/* ── Dialog Hapus ── */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Hapus Entri</DialogTitle>
            <DialogDescription>
              Yakin ingin menghapus entri{" "}
              <strong>&ldquo;{selected?.deskripsi}&rdquo;</strong> tanggal{" "}
              <strong>{selected?.date}</strong>? Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          {isAutoEntry(selected) && (
            <div className="rounded-md border border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800 p-3 text-xs text-orange-800 dark:text-orange-300">
              <p className="font-semibold mb-0.5">⚠ Entri otomatis dari sistem</p>
              <p>
                Entri ini dibuat otomatis dan tag di catatannya dipakai untuk mencegah
                pencatatan ganda. Jika dihapus, sistem bisa mencatat ulang entri ini
                (atau kehilangan jejak modal yang sudah digunakan/dikembalikan).
              </p>
            </div>
          )}
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

      {/* ── Error dialog ── */}
      <ErrorDialog
        open={!!errorInfo}
        onClose={() => setErrorInfo(null)}
        error={errorInfo}
      />
    </div>
  );
}
