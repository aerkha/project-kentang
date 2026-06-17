"use client";

import { useState, useRef } from "react";
import pb from "@/lib/pocketbase";
import { useInvestors } from "@/lib/investors-context";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Upload, FileJson, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ImportRow {
  customId: string;
  name: string;
  idNumber: string;
  address: string;
  brokerName: string;
  bankName: string;
  accountNumber: string;
  phone: string;
  email: string;
  occupation: string;
  investmentAmount: number;
  heirName: string;
  heirBankName: string;
  heirAccountNumber: string;
  isMinBun: boolean;
  isInternal: boolean;
  isTami: boolean;
  isDirect: boolean;
  isActive: boolean;
}

type RowStatus = "pending" | "importing" | "success" | "error";

interface ImportRowState {
  row: ImportRow;
  status: RowStatus;
  error?: string;
}

// ── Validation ─────────────────────────────────────────────────────────────────

function validateRow(row: ImportRow, index: number): string | null {
  if (!row.customId) return `Baris ${index + 1}: customId kosong`;
  if (!row.name)     return `Baris ${index + 1}: name kosong`;
  if (!row.isMinBun && !row.isTami && !row.isDirect)
    return `Baris ${index + 1} (${row.name}): tidak ada flag tipe (isMinBun/isTami/isDirect)`;
  if (typeof row.investmentAmount !== "number" || row.investmentAmount <= 0)
    return `Baris ${index + 1} (${row.name}): investmentAmount tidak valid`;
  return null;
}

function parseJson(text: string): { rows: ImportRow[]; error: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { rows: [], error: "Format JSON tidak valid" };
  }
  if (!Array.isArray(parsed)) {
    return { rows: [], error: "JSON harus berupa array [ ... ]" };
  }
  // Filter baris kosong (customId kosong)
  const rows = (parsed as ImportRow[]).filter((r) => r.customId && r.name);
  if (rows.length === 0) {
    return { rows: [], error: "Tidak ada data valid di JSON" };
  }
  for (let i = 0; i < rows.length; i++) {
    const err = validateRow(rows[i], i);
    if (err) return { rows: [], error: err };
  }
  return { rows, error: null };
}

// ── Flag badge ─────────────────────────────────────────────────────────────────

function FlagBadge({ row }: { row: ImportRow }) {
  if (row.isMinBun)  return <Badge className="text-[10px] bg-primary/10 text-primary">{row.isInternal ? "MB-Internal" : "MinBun"}</Badge>;
  if (row.isTami)    return <Badge className="text-[10px] bg-purple-100 text-purple-700">Tami</Badge>;
  if (row.isDirect)  return <Badge className="text-[10px] bg-blue-100 text-blue-700">Direct</Badge>;
  return <Badge variant="secondary" className="text-[10px]">—</Badge>;
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  canCreate: boolean;
}

export function InvestorsImportDialog({ canCreate }: Props) {
  const { investors, updateInvestor } = useInvestors();
  const [open, setOpen]         = useState(false);
  const [step, setStep]         = useState<"upload" | "preview" | "result">("upload");
  const [parseError, setParseError] = useState<string | null>(null);
  const [rows, setRows]         = useState<ImportRowState[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const successCount = rows.filter((r) => r.status === "success").length;
  const errorCount   = rows.filter((r) => r.status === "error").length;
  const doneCount    = successCount + errorCount;

  // ── Reset saat dialog ditutup ──
  const handleOpenChange = (v: boolean) => {
    if (!v && !isImporting) {
      setStep("upload");
      setParseError(null);
      setRows([]);
    }
    setOpen(v);
  };

  // ── Parse file JSON ──
  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { rows: parsed, error } = parseJson(text);
      if (error) {
        setParseError(error);
        setRows([]);
        return;
      }
      setParseError(null);
      setRows(parsed.map((row) => ({ row, status: "pending" })));
      setStep("preview");
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // ── Import ke PocketBase ──
  const handleImport = async () => {
    setIsImporting(true);
    setStep("result");

    const existingIds = new Set(investors.map((inv) => inv.id));

    for (let i = 0; i < rows.length; i++) {
      const { row } = rows[i];

      // Update status → importing
      setRows((prev) => prev.map((r, idx) =>
        idx === i ? { ...r, status: "importing" } : r
      ));

      // Cek apakah customId sudah ada (update) atau baru (create)
      if (existingIds.has(row.customId)) {
        try {
          await updateInvestor(row.customId, {
            name:             row.name,
            address:          row.address,
            brokerName:       row.brokerName || "",
            idNumber:         row.idNumber,
            bankName:         row.bankName,
            accountNumber:    row.accountNumber,
            phone:            row.phone,
            email:            row.email || "",
            occupation:       row.occupation || "",
            investmentAmount: row.investmentAmount,
            heirName:         row.heirName || "",
            heirBankName:     row.heirBankName || "",
            heirAccountNumber: row.heirAccountNumber || "",
            isMinBun:         row.isMinBun,
            isInternal:       row.isInternal,
            isTami:           row.isTami,
            isDirect:         row.isDirect,
            isActive:         row.isActive,
          });
          setRows((prev) => prev.map((r, idx) =>
            idx === i ? { ...r, status: "success", error: "(diperbarui)" } : r
          ));
        } catch (err) {
          const msg = (err as { message?: string })?.message ?? "Gagal update";
          setRows((prev) => prev.map((r, idx) =>
            idx === i ? { ...r, status: "error", error: msg } : r
          ));
        }
        continue;
      }

      // Create baru langsung via PB SDK (pakai customId dari JSON)
      try {
        await pb.collection("investors").create({
          customId:         row.customId,
          name:             row.name,
          address:          row.address,
          brokerName:       row.brokerName || "",
          idNumber:         row.idNumber,
          bankName:         row.bankName,
          accountNumber:    row.accountNumber,
          phone:            row.phone,
          email:            row.email || "",
          occupation:       row.occupation || "",
          investmentAmount: row.investmentAmount,
          heirName:         row.heirName || "",
          heirBankName:     row.heirBankName || "",
          heirAccountNumber: row.heirAccountNumber || "",
          isMinBun:         row.isMinBun  === true,
          isInternal:       row.isInternal === true,
          isTami:           row.isTami    === true,
          isDirect:         row.isDirect  === true,
          isActive:         row.isActive  !== false,
          buktiTransfer:    "",
          createdBy:        pb.authStore.record?.id ?? "",
          updatedBy:        pb.authStore.record?.id ?? "",
        });
        setRows((prev) => prev.map((r, idx) =>
          idx === i ? { ...r, status: "success" } : r
        ));
      } catch (err) {
        const pbErr = err as { data?: { data?: Record<string, { message?: string }> }; message?: string };
        const fieldErrors = pbErr?.data?.data
          ? Object.entries(pbErr.data.data).map(([k, v]) => `${k}: ${v?.message}`).join(", ")
          : pbErr?.message ?? "Gagal";
        setRows((prev) => prev.map((r, idx) =>
          idx === i ? { ...r, status: "error", error: fieldErrors } : r
        ));
      }
    }

    setIsImporting(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {canCreate && (
          <Button variant="outline">
            <Upload className="w-4 h-4 mr-2" />
            Import JSON
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Import Investor dari JSON</DialogTitle>
          <DialogDescription>
            Upload file JSON berisi data investor. ID duplikat akan diperbarui, ID baru akan dibuat.
          </DialogDescription>
        </DialogHeader>

        {/* ── Step 1: Upload ── */}
        {step === "upload" && (
          <div className="space-y-4 py-2">
            <div
              className="border-2 border-dashed rounded-lg p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
            >
              <FileJson className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
              <p className="text-sm font-medium">Drag &amp; drop file JSON di sini</p>
              <p className="text-xs text-muted-foreground mt-1">atau klik untuk pilih file</p>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
            {parseError && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                {parseError}
              </div>
            )}
            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Format yang diperlukan:</p>
              <p>• Array JSON dengan field: <code>customId</code>, <code>name</code>, <code>investmentAmount</code></p>
              <p>• Salah satu flag harus <code>true</code>: <code>isMinBun</code>, <code>isTami</code>, atau <code>isDirect</code></p>
              <p>• Baris dengan <code>customId</code> kosong akan diabaikan otomatis</p>
            </div>
          </div>
        )}

        {/* ── Step 2: Preview ── */}
        {step === "preview" && (
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              <strong>{rows.length} investor</strong> siap diimport. Periksa data sebelum melanjutkan.
            </p>
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-y-auto max-h-[340px]">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">ID</th>
                      <th className="text-left px-3 py-2 font-medium">Nama</th>
                      <th className="text-left px-3 py-2 font-medium">Tipe</th>
                      <th className="text-right px-3 py-2 font-medium">Investasi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ row }, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                        <td className="px-3 py-2 font-mono">{row.customId}</td>
                        <td className="px-3 py-2">{row.name}</td>
                        <td className="px-3 py-2"><FlagBadge row={row} /></td>
                        <td className="px-3 py-2 text-right">
                          {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(row.investmentAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setStep("upload"); setRows([]); }}>
                Kembali
              </Button>
              <Button onClick={handleImport}>
                Import {rows.length} Investor
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step 3: Result ── */}
        {step === "result" && (
          <div className="space-y-3 py-2">
            {/* Progress */}
            {isImporting && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Mengimport...</span>
                  <span>{doneCount} / {rows.length}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${(doneCount / rows.length) * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Summary setelah selesai */}
            {!isImporting && (
              <div className="flex gap-3">
                <div className="flex-1 rounded-lg bg-green-50 border border-green-200 p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{successCount}</p>
                  <p className="text-xs text-green-700">Berhasil</p>
                </div>
                <div className="flex-1 rounded-lg bg-red-50 border border-red-200 p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{errorCount}</p>
                  <p className="text-xs text-red-700">Gagal</p>
                </div>
              </div>
            )}

            {/* List hasil per baris */}
            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-y-auto max-h-[300px]">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium w-6"></th>
                      <th className="text-left px-3 py-2 font-medium">ID</th>
                      <th className="text-left px-3 py-2 font-medium">Nama</th>
                      <th className="text-left px-3 py-2 font-medium">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ row, status, error }, i) => (
                      <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                        <td className="px-3 py-2">
                          {status === "pending"   && <span className="text-muted-foreground">—</span>}
                          {status === "importing" && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                          {status === "success"   && <CheckCircle2 className="h-3 w-3 text-green-600" />}
                          {status === "error"     && <XCircle className="h-3 w-3 text-destructive" />}
                        </td>
                        <td className="px-3 py-2 font-mono">{row.customId}</td>
                        <td className="px-3 py-2">{row.name}</td>
                        <td className={`px-3 py-2 ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                          {status === "success" ? (error ?? "OK") : (error ?? "")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {!isImporting && (
              <DialogFooter>
                <Button onClick={() => handleOpenChange(false)}>Selesai</Button>
              </DialogFooter>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
