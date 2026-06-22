"use client";

import { useState, useMemo, useRef } from "react";
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
  ChevronDown, ChevronUp, ArrowUpCircle, FileSignature,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/permissions";
import { todayWibStr } from "@/lib/utils";
import { useModalEntries } from "@/lib/modal-entries-context";
import pb from "@/lib/pocketbase";
import { generateCustomId } from "@/lib/investors-context";
import { generateBrokerCustomId } from "@/lib/brokers-context";
import { FileJson, Upload, CheckCircle2, XCircle, Loader2 } from "lucide-react";

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
  isInternal: boolean;
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
  isInternal: false,
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

// ─────────────────────────────────────────────
// Inline import panels (shared logic)
// ─────────────────────────────────────────────

interface InvImportRow {
  customId: string; name: string; idNumber: string; address: string; brokerName: string;
  bankName: string; accountNumber: string; phone: string; email: string; occupation: string;
  investmentAmount: number; heirName: string; heirBankName: string; heirAccountNumber: string;
  isMinBun: boolean; isInternal: boolean; isTami: boolean; isDirect: boolean; isActive: boolean;
}
interface BrkImportRow {
  customId: string; name: string; address: string; email: string; idNumber: string;
  bankName: string; accountNumber: string; phone: string;
}

type RowStatus = "pending" | "importing" | "success" | "error";
interface InvRowState { row: InvImportRow; status: RowStatus; error?: string; dupWarning?: string; }
interface BrkRowState { row: BrkImportRow; status: RowStatus; error?: string; }

function FlagBadgeInline({ row }: { row: InvImportRow }) {
  if (row.isMinBun) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{row.isInternal ? "MB-Internal" : "MinBun"}</span>;
  if (row.isTami)   return <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-medium">Tami</span>;
  if (row.isDirect) return <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">Direct</span>;
  return <span className="text-[10px] text-muted-foreground">—</span>;
}

function InvestorImportPanel({ existingIds, existingKtps, onUpdateInvestor, onReload, onDone }: {
  existingIds: Set<string>;
  existingKtps: Set<string>;
  onUpdateInvestor: (id: string, data: Partial<Investor>) => Promise<void>;
  onReload: () => Promise<void>;
  onDone: () => void;
}) {
  const [step, setStep]         = useState<"upload" | "preview" | "result">("upload");
  const [parseError, setParseError] = useState<string | null>(null);
  const [rows, setRows]         = useState<InvRowState[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const successCount = rows.filter((r) => r.status === "success").length;
  const errorCount   = rows.filter((r) => r.status === "error").length;
  const doneCount    = successCount + errorCount;

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { setParseError("Format JSON tidak valid"); return; }
      if (!Array.isArray(parsed)) { setParseError("JSON harus berupa array [ ... ]"); return; }
      const valid = (parsed as InvImportRow[]).filter((r) => r.name);
      if (valid.length === 0) { setParseError("Tidak ada data valid (kolom name wajib diisi)"); return; }
      for (let i = 0; i < valid.length; i++) {
        const r = valid[i];
        if (!r.isMinBun && !r.isTami && !r.isDirect) { setParseError(`Baris ${i+1} (${r.name}): isi salah satu flag = true: isMinBun, isTami, atau isDirect`); return; }
        if (typeof r.investmentAmount !== "number" || r.investmentAmount <= 0) { setParseError(`Baris ${i+1} (${r.name}): investmentAmount tidak valid`); return; }
      }
      setParseError(null);
      const seenInFile = new Set<string>();
      const seenKtpInFile = new Set<string>();
      setRows(valid.map((row) => {
        let dupWarning: string | undefined;
        if (row.customId) {
          if (existingIds.has(row.customId)) dupWarning = "ID sudah ada di database";
          else if (seenInFile.has(row.customId)) dupWarning = "ID duplikat dalam file";
          seenInFile.add(row.customId);
        }
        if (!dupWarning && row.idNumber) {
          if (existingKtps.has(row.idNumber)) dupWarning = `No KTP ${row.idNumber} sudah terdaftar di database`;
          else if (seenKtpInFile.has(row.idNumber)) dupWarning = `No KTP ${row.idNumber} duplikat dalam file`;
          seenKtpInFile.add(row.idNumber);
        }
        return { row, status: "pending", dupWarning };
      }));
      setStep("preview");
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setIsImporting(true);
    setStep("result");
    const usedInSession = new Set<string>(existingIds);
    // No KTP: cek terhadap KESELURUHAN data di database (fetch segar agar
    // menangkap record yang ditambahkan setelah halaman dimuat) + lacak KTP
    // yang dipakai selama sesi import ini untuk cegah duplikat antar-baris.
    const usedKtps = new Set<string>(existingKtps);
    try {
      const dbRecords = await pb.collection("investors").getFullList({ fields: "idNumber" });
      dbRecords.forEach((r) => { const k = (r.idNumber as string)?.trim(); if (k) usedKtps.add(k); });
    } catch { /* gagal fetch — fallback ke data yang sudah ada di memori */ }

    for (let i = 0; i < rows.length; i++) {
      const { row, dupWarning } = rows[i];
      setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, status: "importing" } : r));
      if (dupWarning) {
        setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, status: "error", error: dupWarning } : r));
        continue;
      }
      const ktp = row.idNumber?.trim();
      if (ktp && usedKtps.has(ktp)) {
        setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, status: "error", error: `No KTP ${ktp} sudah terdaftar di database` } : r));
        continue;
      }
      try {
        const flag = row.isMinBun ? "MB" : row.isTami ? "TM" : "D";
        let customId = row.customId || await generateCustomId(flag);
        // Pastikan ID yang di-generate juga tidak konflik dengan batch ini
        while (usedInSession.has(customId)) {
          customId = await generateCustomId(flag);
        }
        usedInSession.add(customId);
        await pb.collection("investors").create({ customId, name: row.name, address: row.address, brokerName: row.brokerName || "", idNumber: row.idNumber, bankName: row.bankName, accountNumber: row.accountNumber, phone: row.phone, email: row.email || "", occupation: row.occupation || "", investmentAmount: row.investmentAmount, heirName: row.heirName || "", heirBankName: row.heirBankName || "", heirAccountNumber: row.heirAccountNumber || "", isMinBun: row.isMinBun === true, isInternal: row.isInternal === true, isTami: row.isTami === true, isDirect: row.isDirect === true, isActive: row.isActive !== false, buktiTransfer: "", createdBy: pb.authStore.record?.id ?? "", updatedBy: pb.authStore.record?.id ?? "" });
        if (ktp) usedKtps.add(ktp);
        setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, status: "success", error: customId } : r));
      } catch (err) {
        const pbErr = err as { data?: { data?: Record<string, { message?: string }> }; message?: string };
        const msg = pbErr?.data?.data ? Object.entries(pbErr.data.data).map(([k, v]) => `${k}: ${v?.message}`).join(", ") : pbErr?.message ?? "Gagal";
        setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, status: "error", error: msg } : r));
      }
    }
    setIsImporting(false);
    await onReload();
  };

  const fmtRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

  return (
    <div className="overflow-y-auto max-h-[62vh] pr-1 space-y-3">
      {step === "upload" && (
        <>
          <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}>
            <FileJson className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">Drag &amp; drop file JSON di sini</p>
            <p className="text-xs text-muted-foreground mt-1">atau klik untuk pilih file</p>
            <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
          {parseError && <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><XCircle className="h-4 w-4 mt-0.5 shrink-0" />{parseError}</div>}
          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium">Format:</p>
            <p>• Field wajib: <code>name</code>, <code>investmentAmount</code></p>
            <p>• Salah satu flag <code>true</code>: <code>isMinBun</code>, <code>isTami</code>, atau <code>isDirect</code></p>
            <p>• <code>customId</code> boleh dikosongkan — otomatis di-generate sesuai tipe</p>
          </div>
        </>
      )}

      {step === "preview" && (
        <>
          {(() => { const dupCount = rows.filter(r => r.dupWarning).length; return dupCount > 0 ? (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
              <span><strong>{dupCount} baris</strong> memiliki ID yang sudah ada dan akan dilewati saat import.</span>
            </div>
          ) : null; })()}
          <p className="text-sm text-muted-foreground"><strong>{rows.length} investor</strong> siap diimport ({rows.filter(r => !r.dupWarning).length} baru).</p>
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-y-auto max-h-[260px]">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0"><tr>
                  <th className="text-left px-3 py-2 font-medium">ID</th>
                  <th className="text-left px-3 py-2 font-medium">Nama</th>
                  <th className="text-left px-3 py-2 font-medium">Tipe</th>
                  <th className="text-right px-3 py-2 font-medium">Investasi</th>
                </tr></thead>
                <tbody>{rows.map(({ row, dupWarning }, i) => (
                  <tr key={i} className={dupWarning ? "bg-amber-50" : i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                    <td className="px-3 py-2 font-mono">
                      {row.customId || <span className="text-muted-foreground italic">auto</span>}
                      {dupWarning && <span className="ml-1 text-amber-600">⚠ {dupWarning}</span>}
                    </td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2"><FlagBadgeInline row={row} /></td>
                    <td className="px-3 py-2 text-right">{fmtRp(row.investmentAmount)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => { setStep("upload"); setRows([]); }}>Kembali</Button>
            <Button onClick={handleImport}>Import {rows.length} Investor</Button>
          </DialogFooter>
        </>
      )}

      {step === "result" && (
        <>
          {isImporting && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground"><span>Mengimport...</span><span>{doneCount} / {rows.length}</span></div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(doneCount / rows.length) * 100}%` }} /></div>
            </div>
          )}
          {!isImporting && (
            <div className="flex gap-3">
              <div className="flex-1 rounded-lg bg-green-50 border border-green-200 p-3 text-center"><p className="text-2xl font-bold text-green-600">{successCount}</p><p className="text-xs text-green-700">Berhasil</p></div>
              <div className="flex-1 rounded-lg bg-red-50 border border-red-200 p-3 text-center"><p className="text-2xl font-bold text-red-600">{errorCount}</p><p className="text-xs text-red-700">Gagal</p></div>
            </div>
          )}
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-y-auto max-h-[240px]">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0"><tr>
                  <th className="w-6 px-3 py-2"></th>
                  <th className="text-left px-3 py-2 font-medium">ID</th>
                  <th className="text-left px-3 py-2 font-medium">Nama</th>
                  <th className="text-left px-3 py-2 font-medium">Keterangan</th>
                </tr></thead>
                <tbody>{rows.map(({ row, status, error }, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                    <td className="px-3 py-2">{status === "pending" && <span className="text-muted-foreground">—</span>}{status === "importing" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}{status === "success" && <CheckCircle2 className="h-3 w-3 text-green-600" />}{status === "error" && <XCircle className="h-3 w-3 text-destructive" />}</td>
                    <td className="px-3 py-2 font-mono">{row.customId}</td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className={`px-3 py-2 ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>{status === "success" ? (error ?? "OK") : (error ?? "")}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          {!isImporting && <DialogFooter className="pt-2"><Button onClick={onDone}>Selesai</Button></DialogFooter>}
        </>
      )}
    </div>
  );
}

function BrokerImportPanel({ existingIds, onUpdateBroker, onReload, onDone }: {
  existingIds: Set<string>;
  onUpdateBroker: (id: string, data: Partial<BrokerFormData>) => Promise<void>;
  onReload: () => Promise<void>;
  onDone: () => void;
}) {
  const [step, setStep]         = useState<"upload" | "preview" | "result">("upload");
  const [parseError, setParseError] = useState<string | null>(null);
  const [rows, setRows]         = useState<BrkRowState[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const successCount = rows.filter((r) => r.status === "success").length;
  const errorCount   = rows.filter((r) => r.status === "error").length;
  const doneCount    = successCount + errorCount;

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { setParseError("Format JSON tidak valid"); return; }
      if (!Array.isArray(parsed)) { setParseError("JSON harus berupa array [ ... ]"); return; }
      const valid = (parsed as BrkImportRow[]).filter((r) => r.name);
      if (valid.length === 0) { setParseError("Tidak ada data valid (kolom name wajib diisi)"); return; }
      setParseError(null);
      setRows(valid.map((row) => ({ row, status: "pending" })));
      setStep("preview");
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    setIsImporting(true);
    setStep("result");
    for (let i = 0; i < rows.length; i++) {
      const { row } = rows[i];
      setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, status: "importing" } : r));
      try {
        const customId = row.customId || await generateBrokerCustomId();
        if (existingIds.has(customId)) {
          await onUpdateBroker(customId, { name: row.name, address: row.address, email: row.email || "", idNumber: row.idNumber, bankName: row.bankName, accountNumber: row.accountNumber, phone: row.phone });
          setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, status: "success", error: `(diperbarui ${customId})` } : r));
        } else {
          await pb.collection("brokers").create({ customId, name: row.name, address: row.address, email: row.email || "", idNumber: row.idNumber, bankName: row.bankName, accountNumber: row.accountNumber, phone: row.phone, createdBy: pb.authStore.record?.id ?? "", updatedBy: pb.authStore.record?.id ?? "" });
          setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, status: "success", error: customId } : r));
        }
      } catch (err) {
        const pbErr = err as { data?: { data?: Record<string, { message?: string }> }; message?: string };
        const msg = pbErr?.data?.data ? Object.entries(pbErr.data.data).map(([k, v]) => `${k}: ${v?.message}`).join(", ") : pbErr?.message ?? "Gagal";
        setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, status: "error", error: msg } : r));
      }
    }
    setIsImporting(false);
    await onReload();
  };

  return (
    <div className="overflow-y-auto max-h-[62vh] pr-1 space-y-3">
      {step === "upload" && (
        <>
          <div className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}>
            <FileJson className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm font-medium">Drag &amp; drop file JSON di sini</p>
            <p className="text-xs text-muted-foreground mt-1">atau klik untuk pilih file</p>
            <input ref={fileRef} type="file" accept=".json,application/json" className="sr-only"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
          {parseError && <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"><XCircle className="h-4 w-4 mt-0.5 shrink-0" />{parseError}</div>}
          <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium">Format:</p>
            <p>• Field wajib: <code>name</code>, <code>phone</code></p>
            <p>• <code>customId</code> boleh dikosongkan — otomatis di-generate (BRK-xxxx)</p>
            <p>• Field opsional: <code>address</code>, <code>email</code>, <code>idNumber</code>, <code>bankName</code>, <code>accountNumber</code></p>
          </div>
        </>
      )}

      {step === "preview" && (
        <>
          <p className="text-sm text-muted-foreground"><strong>{rows.length} broker</strong> siap diimport.</p>
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-y-auto max-h-[260px]">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0"><tr>
                  <th className="text-left px-3 py-2 font-medium">ID</th>
                  <th className="text-left px-3 py-2 font-medium">Nama</th>
                  <th className="text-left px-3 py-2 font-medium">No HP</th>
                  <th className="text-left px-3 py-2 font-medium">Bank</th>
                </tr></thead>
                <tbody>{rows.map(({ row }, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                    <td className="px-3 py-2 font-mono">{row.customId}</td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">{row.phone}</td>
                    <td className="px-3 py-2">{row.bankName}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => { setStep("upload"); setRows([]); }}>Kembali</Button>
            <Button onClick={handleImport}>Import {rows.length} Broker</Button>
          </DialogFooter>
        </>
      )}

      {step === "result" && (
        <>
          {isImporting && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground"><span>Mengimport...</span><span>{doneCount} / {rows.length}</span></div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(doneCount / rows.length) * 100}%` }} /></div>
            </div>
          )}
          {!isImporting && (
            <div className="flex gap-3">
              <div className="flex-1 rounded-lg bg-green-50 border border-green-200 p-3 text-center"><p className="text-2xl font-bold text-green-600">{successCount}</p><p className="text-xs text-green-700">Berhasil</p></div>
              <div className="flex-1 rounded-lg bg-red-50 border border-red-200 p-3 text-center"><p className="text-2xl font-bold text-red-600">{errorCount}</p><p className="text-xs text-red-700">Gagal</p></div>
            </div>
          )}
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-y-auto max-h-[240px]">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0"><tr>
                  <th className="w-6 px-3 py-2"></th>
                  <th className="text-left px-3 py-2 font-medium">ID</th>
                  <th className="text-left px-3 py-2 font-medium">Nama</th>
                  <th className="text-left px-3 py-2 font-medium">Keterangan</th>
                </tr></thead>
                <tbody>{rows.map(({ row, status, error }, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                    <td className="px-3 py-2">{status === "pending" && <span className="text-muted-foreground">—</span>}{status === "importing" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}{status === "success" && <CheckCircle2 className="h-3 w-3 text-green-600" />}{status === "error" && <XCircle className="h-3 w-3 text-destructive" />}</td>
                    <td className="px-3 py-2 font-mono">{row.customId}</td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className={`px-3 py-2 ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>{status === "success" ? (error ?? "OK") : (error ?? "")}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
          {!isImporting && <DialogFooter className="pt-2"><Button onClick={onDone}>Selesai</Button></DialogFooter>}
        </>
      )}
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

        {/* ── Tipe Investor ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Tipe Investor <span className="text-destructive">*</span>
          </p>
          {!formData.isMinBun && !formData.isTami && !formData.isDirect && (
            <p className="text-xs text-destructive">Pilih salah satu tipe investor</p>
          )}
          {(
            [
              { key: "isMinBun" as const, label: "MinBun", desc: "Investor di bawah naungan MinBun (eksternal maupun internal)." },
              { key: "isTami"   as const, label: "Tami",   desc: "Investor melalui jalur Tami." },
              { key: "isDirect" as const, label: "Direct",  desc: "Investor langsung tanpa perantara broker." },
            ]
          ).map(({ key, label, desc }) => (
            <div key={key} className={`rounded-lg border transition-colors ${formData[key] ? "bg-primary/5 border-primary/30" : "bg-muted/30"}`}>
              <div className="flex items-start justify-between gap-4 p-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    {key === "isMinBun" && <ShieldCheck className="h-3.5 w-3.5 text-primary" />}
                    <Label className="text-sm font-medium">{label}</Label>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
                <Switch
                  checked={formData[key]}
                  onCheckedChange={(v) => {
                    if (v) {
                      setFormData({ ...formData, isMinBun: false, isTami: false, isDirect: false, [key]: true, isInternal: false });
                    } else {
                      setFormData({ ...formData, [key]: false, isInternal: false });
                    }
                  }}
                />
              </div>
              {/* Sub-toggle Internal — hanya tampil jika MinBun aktif */}
              {key === "isMinBun" && formData.isMinBun && (
                <div className="flex items-start justify-between gap-4 px-3 pb-3 pt-0 ml-4 border-t border-primary/10 mt-0 pt-2">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-medium text-primary">Internal (MinBun sendiri)</Label>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      MinBun bertindak sebagai investor. Modal + seluruh arus kas (pemasukan &amp; pengeluaran) dicatat otomatis. Jika tidak dicentang, hanya bagi hasil MinBun (5%) yang dicatat.
                    </p>
                  </div>
                  <Switch
                    checked={formData.isInternal}
                    onCheckedChange={(v) => setFlag("isInternal", v)}
                  />
                </div>
              )}
            </div>
          ))}
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
  const { investors, addInvestor, updateInvestor, deleteInvestor, reloadInvestors, uploadBuktiTransfer, getBuktiUrl } = useInvestors();
  const { entriesByInvestor } = useModalEntries();
  const { mous, addMou } = useMou();
  const { brokers, addBroker, updateBroker, deleteBroker, reloadBrokers } = useBrokers();
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
  const [filterType, setFilterType] = useState<"all" | "minbun" | "tami" | "direct">("all");
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const toggleCard = (id: string) =>
    setExpandedCards((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const [expandedBrokerCards, setExpandedBrokerCards] = useState<Set<string>>(new Set());
  const toggleBrokerCard = (id: string) =>
    setExpandedBrokerCards((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // ── Dana terpakai per investor (transaksi aktif: rencana + berjalan) ──
  const investorDanaMap = useMemo(() => {
    const map = new Map<string, number>();
    transaksis.forEach((t) => {
      if (t.status !== "berjalan" && t.status !== "perbarui") return;
      t.investorEntries.forEach((entry) => {
        map.set(entry.investorId, (map.get(entry.investorId) ?? 0) + entry.nilaiInvestasi);
      });
    });
    return map;
  }, [transaksis]);

  // ── Modal yang sudah dialokasikan ke PKS per investor ──
  const mouAllocatedMap = useMemo(() => {
    const map = new Map<string, number>();
    mous.forEach((m) => {
      if (m.isTerminated) return;
      map.set(m.investorId, (map.get(m.investorId) ?? 0) + m.investmentAmount);
    });
    return map;
  }, [mous]);

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
          const mouEnd = m.endDate
            ? (() => { const [ey, em, ed2] = m.endDate.slice(0,10).split("-").map(Number); return Date.UTC(ey, em-1, ed2); })()
            : start + m.contractPeriod * (m.siklus ?? 1) * 86_400_000;
          return tTime >= start && tTime < mouEnd;
        });
        const pkPct = (mou?.bagiHasilPK ?? 35) / 100;
        const bh    = c.profit > 0 ? c.profit * pkPct * ratio : 0;
        map.set(entry.investorId, (map.get(entry.investorId) ?? 0) + bh);
      });
    });
    return map;
  }, [transaksis, mous]);

  // Dialog mode: "form" | "import"
  const [addInvestorMode, setAddInvestorMode] = useState<"form" | "import">("form");
  const [addBrokerMode, setAddBrokerMode]     = useState<"form" | "import">("form");

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

  const typeFilteredInvestors = useMemo(() => {
    if (filterType === "minbun")  return visibleInvestors.filter((inv) => inv.isMinBun);
    if (filterType === "tami")    return visibleInvestors.filter((inv) => inv.isTami);
    if (filterType === "direct")  return visibleInvestors.filter((inv) => inv.isDirect);
    return visibleInvestors;
  }, [visibleInvestors, filterType]);

  const filteredInvestors = typeFilteredInvestors.filter(
    (inv) =>
      inv.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.brokerName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.occupation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inv.phone.includes(searchQuery)
  );

  const totalInvestasi = useMemo(
    () => typeFilteredInvestors.reduce((sum, inv) => sum + inv.investmentAmount, 0),
    [typeFilteredInvestors],
  );

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(value);

  const nextInvestorId = (form: InvestorFormData) => {
    const flag = form.isMinBun ? "MB" : form.isTami ? "TM" : "D";
    const prefix = `INV-${flag}-`;
    const maxNum = investors.reduce((max, inv) => {
      if (!inv.id.startsWith(prefix)) return max;
      const num = parseInt(inv.id.slice(prefix.length)) || 0;
      return num > max ? num : max;
    }, 0);
    return `${prefix}${String(maxNum + 1).padStart(4, "0")}`;
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

  // ── Buat PKS dari investor card ──

  const handleCreatePks = async (investor: Investor) => {
    const allocated = mouAllocatedMap.get(investor.id) ?? 0;
    const available = investor.investmentAmount - allocated;
    if (available <= 0) {
      toast.error("Semua modal sudah dialokasikan ke PKS. Lakukan top up terlebih dahulu.");
      return;
    }

    // Tentukan default bagi hasil berdasarkan prefix investor ID
    const isDirect = investor.id.startsWith("INV-D-");
    const isTm     = investor.id.startsWith("INV-TM-");
    const defaultPP1 = isDirect ? 60 : 50;
    const defaultPP2 = isDirect ? 0  : 15;
    const defaultPK  = isDirect ? 40 : 35;

    // Load e-sign PP I & PP II dari localStorage (sama seperti form buat PKS manual)
    const loadEsign = (key: string) => { try { return localStorage.getItem(key) ?? ""; } catch { return ""; } };
    const esignPP1 = loadEsign("pks_esign_pp1");
    const esignPP2 = isDirect ? "" : loadEsign(isTm ? "pks_esign_pp2_tm" : "pks_esign_pp2");
    const esignPK  = loadEsign(`pks_esign_inv_${investor.id}`);

    const today = todayWibStr();
    const [y, m, d] = today.split("-").map(Number);
    const end = new Date(Date.UTC(y, m - 1, d + 30)).toISOString().slice(0, 10);
    try {
      await addMou({
        date: today,
        endDate: end,
        investorId: investor.id,
        investorName: investor.name,
        investorAddress: investor.address,
        investorOccupation: investor.occupation || "",
        investorIdNumber: investor.idNumber,
        investorPhone: investor.phone,
        contractPeriod: 30,
        investmentAmount: available,
        heirName: investor.heirName || "",
        heirRelationship: "",
        heirPhone: "",
        keterangan: "",
        bagiHasilPP1: defaultPP1,
        bagiHasilPP2: defaultPP2,
        bagiHasilPK:  defaultPK,
        bagiHasilPP3: 0,
        brokerId: "",
        brokerName: investor.brokerName || "",
        brokerAddress: "",
        brokerIdNumber: "",
        brokerPhone: "",
        esignPihakPertama1: esignPP1,
        esignPihakPertama2: esignPP2,
        esignPihakKedua:    esignPK,
        esignPihakPertama3: "",
      });
      toast.success(`Draft PKS untuk ${investor.name} berhasil dibuat — lihat di halaman PKS`);
    } catch (err) {
      const pbErr = err as { response?: { message?: string }; data?: { message?: string }; message?: string };
      const detail =
        pbErr?.response?.message ||
        pbErr?.data?.message ||
        pbErr?.message ||
        "Unknown error";
      const pbData = (err as { data?: unknown })?.data;
      console.error("handleCreatePks error:", err, "PB data:", JSON.stringify(pbData, null, 2));
      toast.error(`Gagal membuat PKS: ${detail}`);
    }
  };

  // ── Investor handlers ──

  const handleAddInvestor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!investorForm.isMinBun && !investorForm.isTami && !investorForm.isDirect) {
      setErrorInfo({ title: "Tipe investor wajib dipilih", fields: [{ field: "flag", code: "required", message: "Pilih salah satu tipe: MinBun, Tami, atau Direct." }], raw: "" });
      return;
    }
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
        isInternal: investorForm.isInternal,
        isTami: investorForm.isTami,
        isDirect: investorForm.isDirect,
      });
      // Hanya investor Internal (MinBun sendiri) yang langsung catat modal ke cashflow
      if (investorForm.isInternal) {
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
        isInternal: investorForm.isInternal,
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

      // Sinkronisasi cash flow — hanya untuk investor Internal (MinBun sendiri)
      const wasInternal = selectedInvestor.isInternal === true;
      const nowInternal = investorForm.isInternal;
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
      isInternal: investor.isInternal === true,
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
      if (topUpInvestor.isInternal) {
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
    if (!selectedInvestor || isSaving) return;
    // Snapshot ID sebelum operasi async dimulai — mencegah stale closure
    // jika re-render mengubah selectedInvestor di tengah jalan.
    const targetId = selectedInvestor.id;
    setIsSaving(true);
    try {
      const ref = makeInternalRef(targetId);
      const internalEntry = pengeluarans.find((p) => p.catatan === ref);
      if (internalEntry) await deletePengeluaran(internalEntry.id);

      const profitEntries = pengeluarans.filter((p) =>
        p.catatan?.startsWith(`[Internal-Profit:${targetId}:`)
      );
      for (const entry of profitEntries) {
        await deletePengeluaran(entry.id);
      }

      await deleteInvestor(targetId);
      toast.success("Investor berhasil dihapus");
      setSelectedInvestor(null);
      setIsDeleteInvestorOpen(false);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal menghapus investor"));
    } finally {
      setIsSaving(false);
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
          {canCreate && <Dialog open={isAddBrokerOpen} onOpenChange={(v) => { if (!v) setAddBrokerMode("form"); setIsAddBrokerOpen(v); }}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus className="w-4 h-4 mr-2" />
                Tambah Broker
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Tambah Broker Baru</DialogTitle>
                {/* Tab toggle */}
                <div className="flex gap-1 mt-2 p-0.5 bg-muted rounded-lg w-fit">
                  <button type="button" onClick={() => setAddBrokerMode("form")}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${addBrokerMode === "form" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    Input Manual
                  </button>
                  <button type="button" onClick={() => setAddBrokerMode("import")}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-colors flex items-center gap-1 ${addBrokerMode === "import" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    <Upload className="h-3 w-3" /> Import JSON
                  </button>
                </div>
              </DialogHeader>
              {addBrokerMode === "form" ? (
                <BrokerFormFields
                  formData={brokerForm}
                  setFormData={setBrokerForm}
                  onSubmit={handleAddBroker}
                  submitLabel="Simpan Broker"
                  previewId={nextBrokerId()}
                  isSaving={isSaving}
                />
              ) : (
                <BrokerImportPanel
                  existingIds={new Set(brokers.map((b) => b.id))}
                  onUpdateBroker={updateBroker}
                  onReload={reloadBrokers}
                  onDone={() => { setAddBrokerMode("form"); setIsAddBrokerOpen(false); }}
                />
              )}
            </DialogContent>
          </Dialog>}

          {/* ── Tambah Investor ── */}
          {canCreate && <Dialog open={isAddInvestorOpen} onOpenChange={(v) => { if (!v) setAddInvestorMode("form"); setIsAddInvestorOpen(v); }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Tambah Investor
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[580px]">
              <DialogHeader>
                <DialogTitle>Tambah Investor Baru</DialogTitle>
                {/* Tab toggle */}
                <div className="flex gap-1 mt-2 p-0.5 bg-muted rounded-lg w-fit">
                  <button type="button" onClick={() => setAddInvestorMode("form")}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${addInvestorMode === "form" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    Input Manual
                  </button>
                  <button type="button" onClick={() => setAddInvestorMode("import")}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-colors flex items-center gap-1 ${addInvestorMode === "import" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                    <Upload className="h-3 w-3" /> Import JSON
                  </button>
                </div>
              </DialogHeader>
              {addInvestorMode === "form" ? (
                <InvestorFormFields
                  formData={investorForm}
                  setFormData={setInvestorForm}
                  onSubmit={handleAddInvestor}
                  submitLabel="Simpan Investor"
                  previewId={nextInvestorId(investorForm)}
                  brokers={brokers}
                  isSaving={isSaving}
                  buktiFile={addInvestorFile}
                  onBuktiChange={setAddInvestorFile}
                />
              ) : (
                <InvestorImportPanel
                  existingIds={new Set(investors.map((inv) => inv.id))}
                  existingKtps={new Set(investors.map((inv) => inv.idNumber).filter(Boolean))}
                  onUpdateInvestor={updateInvestor}
                  onReload={reloadInvestors}
                  onDone={() => { setAddInvestorMode("form"); setIsAddInvestorOpen(false); }}
                />
              )}
            </DialogContent>
          </Dialog>}
        </div>
      </div>

      {/* Filter + Summary + Search */}
      <div className="flex flex-col gap-2">
        {/* Baris filter tipe + summary */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Tab filter tipe */}
          <div className="flex gap-1 p-0.5 bg-muted rounded-lg w-fit">
            {(
              [
                { key: "all",    label: "Semua" },
                { key: "minbun", label: "MinBun" },
                { key: "tami",   label: "Tami" },
                { key: "direct", label: "Direct" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilterType(key)}
                className={`px-3 py-1 text-xs rounded-md font-medium transition-colors ${
                  filterType === key
                    ? "bg-background shadow text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
                <span className={`ml-1.5 text-[10px] font-mono ${filterType === key ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
                  {key === "all"    ? visibleInvestors.length
                   : key === "minbun" ? visibleInvestors.filter((i) => i.isMinBun).length
                   : key === "tami"   ? visibleInvestors.filter((i) => i.isTami).length
                   :                   visibleInvestors.filter((i) => i.isDirect).length}
                </span>
              </button>
            ))}
          </div>

          {/* Summary */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{typeFilteredInvestors.length}</span> investor
            </span>
            <span className="text-border">|</span>
            <span>
              Total <span className="font-semibold text-foreground">{formatCurrency(totalInvestasi)}</span>
            </span>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari berdasarkan nama..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Investor Cards */}
      {filteredInvestors.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">Belum ada investor</h3>
            <p className="text-muted-foreground text-sm">
              {searchQuery ? "Coba kata kunci lain" : filterType !== "all" ? `Belum ada investor tipe ${filterType === "minbun" ? "MinBun" : filterType === "tami" ? "Tami" : "Direct"}` : "Tambahkan investor pertama Anda"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredInvestors.map((investor) => {
            const bagHasil     = investorPnlMap.get(investor.id) ?? 0;
            const danaTermakai = investorDanaMap.get(investor.id) ?? 0;
            const danaSisa     = Math.max(0, investor.investmentAmount - danaTermakai);
            const mouAllocated = mouAllocatedMap.get(investor.id) ?? 0;
            const modalTersedia = Math.max(0, investor.investmentAmount - mouAllocated);
            const pct = investor.investmentAmount > 0
              ? ((bagHasil / investor.investmentAmount) * 100).toFixed(1)
              : "0.0";
            const isActive = investor.isActive === true;

            // Tentukan label & warna badge berdasarkan kondisi PKS investor
            const investorMous = mous.filter((m) => m.investorId === investor.id);
            const hasDraftMou = investorMous.some((m) => getMouStatus(m) === "draft");
            const investorBadge = isActive
              ? { label: "Aktif",     cls: "bg-green-100 text-green-800" }
              : hasDraftMou
              ? { label: "Draft PKS", cls: "bg-yellow-100 text-yellow-800" }
              : { label: "Nonaktif",  cls: "bg-red-100 text-red-700" };

            const isExpanded = expandedCards.has(investor.id);
            const modalList = entriesByInvestor.get(investor.id) ?? [];

            return (
            <Card key={investor.id} className={`transition-shadow ${isActive ? "hover:shadow-md" : "opacity-60 hover:shadow-sm"}`}>

              {/* ── Compact header (always visible) ── */}
              <div
                className="p-3 cursor-pointer select-none"
                onClick={() => toggleCard(investor.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  {/* Left: name + badges */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold leading-tight truncate">{investor.name}</span>
                      <Badge variant="secondary" className={`${investorBadge.cls} text-[10px] px-1.5 shrink-0`}>
                        {investorBadge.label}
                      </Badge>
                      {investor.isMinBun && (
                        <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] px-1.5 gap-0.5 shrink-0">
                          <ShieldCheck className="h-2.5 w-2.5" />
                          {investor.isInternal ? "Internal" : "MinBun"}
                        </Badge>
                      )}
                      {investor.isTami && (
                        <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-[10px] px-1.5 shrink-0">Tami</Badge>
                      )}
                      {investor.isDirect && (
                        <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-[10px] px-1.5 shrink-0">Direct</Badge>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">{investor.id}</span>
                  </div>

                  {/* Right: actions + expand */}
                  <div className="flex gap-0.5 shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
                    {canCreate && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500 hover:text-blue-600 hover:bg-blue-50" onClick={() => handleCreatePks(investor)} title="Buat Draft PKS">
                        <FileSignature className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canEdit && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleTopUpClick(investor)} title="Top Up">
                        <TrendingUp className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canEdit && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditInvestorClick(investor)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteInvestorClick(investor)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => toggleCard(investor.id)}>
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>

                {/* Mini investment + progress */}
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Total Modal</span>
                  <span className="font-bold text-sm">{formatCurrency(investor.investmentAmount)}</span>
                </div>
                {mouAllocated > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Tersedia untuk PKS</span>
                    <span className={`font-semibold ${modalTersedia <= 0 ? "text-red-500" : "text-blue-600"}`}>
                      {formatCurrency(modalTersedia)}
                    </span>
                  </div>
                )}
                {investor.investmentAmount > 0 && (
                  <div className="mt-1.5 space-y-0.5">
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-orange-400 transition-all"
                        style={{ width: `${Math.min(100, (danaTermakai / investor.investmentAmount) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className={danaTermakai > 0 ? "text-orange-500" : "text-muted-foreground"}>
                        {formatCurrency(danaTermakai)} terpakai
                      </span>
                      <span className={danaSisa > 0 ? "text-green-600" : "text-destructive"}>
                        {formatCurrency(danaSisa)} tersedia
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* ── Expanded detail ── */}
              {isExpanded && (
                <CardContent className="border-t pt-3 pb-3 space-y-3 text-sm">

                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Broker</p>
                      <p className="font-medium truncate">{investor.brokerName || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">No Handphone</p>
                      <p className="font-medium truncate">{investor.phone}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Pekerjaan</p>
                      <p className="font-medium truncate">{investor.occupation || "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">No KTP</p>
                      <p className="font-medium truncate font-mono">{maskKtp(investor.idNumber)}</p>
                    </div>
                  </div>

                  <div className="border-t border-border/50 pt-2">
                    <p className="text-xs text-muted-foreground mb-0.5">Alamat</p>
                    <p className="text-sm leading-snug">{investor.address}</p>
                  </div>

                  <div className="border-t border-border/50 pt-2">
                    <p className="text-xs text-muted-foreground mb-1">Rekening Investor</p>
                    <div className="flex gap-1.5 items-center text-xs">
                      <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="font-medium">{investor.bankName}</span>
                      <span className="text-muted-foreground">— {investor.accountNumber}</span>
                    </div>
                  </div>

                  {(investor.heirName || investor.heirBankName) && (
                    <div className="border-t border-border/50 pt-2">
                      <p className="text-xs text-muted-foreground mb-1">Ahli Waris</p>
                      <p className="text-sm font-medium">{investor.heirName}</p>
                      {investor.heirBankName && (
                        <div className="flex gap-1.5 items-center text-xs mt-0.5">
                          <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="font-medium">{investor.heirBankName}</span>
                          <span className="text-muted-foreground">— {investor.heirAccountNumber}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Riwayat Modal ── */}
                  <div className="border-t border-border/50 pt-2">
                    <p className="text-xs text-muted-foreground mb-1.5">Riwayat Modal</p>
                    {modalList.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">Belum ada data modal tercatat</p>
                    ) : (
                      <div className="space-y-1">
                        {modalList.map((entry) => (
                          <div key={entry.id} className="flex items-start justify-between gap-2 rounded-md bg-muted/40 px-2.5 py-1.5 text-xs">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <ArrowUpCircle className={`h-3 w-3 shrink-0 ${entry.type === "topup" ? "text-green-500" : "text-primary"}`} />
                              <div className="min-w-0">
                                <span className="font-medium">
                                  {entry.type === "topup" ? "Top Up" : "Modal Awal"}
                                </span>
                                {entry.keterangan && (
                                  <span className="text-muted-foreground ml-1">· {entry.keterangan}</span>
                                )}
                                {entry.mouId && (
                                  <span className="ml-1 font-mono text-primary">#{entry.mouId}</span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-semibold">{formatCurrency(entry.amount)}</span>
                              {entry.date && (
                                <p className="text-muted-foreground text-[10px]">
                                  {new Date(entry.date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Estimasi Bagi Hasil ── */}
                  {transaksis.length > 0 && (
                    <div className="border-t border-border/50 pt-2">
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
              )}
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
            const investorCount = investors.filter((inv) => inv.brokerName === broker.name).length;
            const isBrokerExpanded = expandedBrokerCards.has(broker.id);
            return (
            <Card key={broker.id} className="hover:shadow-md transition-shadow">

              {/* ── Compact header (always visible) ── */}
              <div
                className="p-3 cursor-pointer select-none"
                onClick={() => toggleBrokerCard(broker.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold leading-tight truncate">{broker.name}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 shrink-0">
                        {investorCount} investor
                      </Badge>
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground">{broker.id}</span>
                  </div>
                  <div className="flex gap-0.5 shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
                    {canEdit && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEditBrokerClick(broker)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteBrokerClick(broker)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => toggleBrokerCard(broker.id)}>
                      {isBrokerExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>

                {/* Phone mini preview */}
                <div className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
                  <span>{broker.phone}</span>
                  {broker.email && <><span>·</span><span className="truncate">{broker.email}</span></>}
                </div>
              </div>

              {/* ── Expanded detail ── */}
              {isBrokerExpanded && (
                <CardContent className="border-t pt-3 pb-3 space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground">No Handphone</p>
                      <p className="font-medium">{broker.phone}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">No KTP</p>
                      <p className="font-medium font-mono">{maskKtp(broker.idNumber)}</p>
                    </div>
                    {broker.email && (
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">Email</p>
                        <p className="font-medium">{broker.email}</p>
                      </div>
                    )}
                  </div>
                  <div className="border-t border-border/50 pt-2">
                    <p className="text-xs text-muted-foreground mb-0.5">Alamat</p>
                    <p className="text-sm leading-snug">{broker.address}</p>
                  </div>
                  <div className="border-t border-border/50 pt-2">
                    <p className="text-xs text-muted-foreground mb-1">Rekening Broker</p>
                    <div className="flex gap-1.5 items-center text-xs">
                      <Building2 className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="font-medium">{broker.bankName}</span>
                      <span className="text-muted-foreground">— {broker.accountNumber}</span>
                    </div>
                  </div>
                </CardContent>
              )}
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
            previewId={selectedInvestor?.id ?? "—"}
            brokers={brokers}
            isSaving={isSaving}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteInvestorOpen} onOpenChange={(v) => { if (!v) setSelectedInvestor(null); setIsDeleteInvestorOpen(v); }}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Hapus Investor</DialogTitle>
            <DialogDescription>
              Yakin ingin menghapus <strong>{selectedInvestor?.name}</strong>?{" "}
              Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={isSaving} onClick={() => setIsDeleteInvestorOpen(false)}>
              Batal
            </Button>
            <Button variant="destructive" disabled={isSaving} onClick={handleDeleteInvestorConfirm}>
              {isSaving ? "Menghapus…" : "Hapus"}
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
                  step="any"
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
