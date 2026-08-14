"use client";

import { useState, type SyntheticEvent } from "react";
import { toast } from "sonner";
import { useInvestors, type Investor } from "@/lib/investors-context";
import { useBrokers } from "@/lib/brokers-context";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/permissions";
import { generatePksHtml } from "@/lib/pks-html";
import { useTransaksi } from "@/lib/transaksi-context";
import { PAYMENT_ACCOUNTS, usePks, getPksStatus, type Pks } from "@/lib/pks-context";
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
  CheckCircle2,
  CircleDashed,
  Upload,
  PenLine,
  Search,
  X,
} from "lucide-react";

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// M-6: localStorage key diprefix dengan id user supaya tidak bocor antara
// user yang bergantian login di browser yang sama.
function currentUserPrefix(): string {
  if (typeof window === "undefined") return "anon";
  try {
    const auth = localStorage.getItem("pocketbase_auth");
    if (!auth) return "anon";
    const parsed = JSON.parse(auth);
    return parsed?.record?.id ?? "anon";
  } catch { return "anon"; }
}

function esignKey(name: string): string {
  return `${currentUserPrefix()}:${name}`;
}

const ESIGN_KEYS = {
  esignPihakPertama1: esignKey("pks_esign_pp1"),
  esignPihakPertama2: esignKey("pks_esign_pp2"),
} as const;

function esignInvKey(investorId: string): string {
  return esignKey(`pks_esign_inv_${investorId}`);
}

function loadStoredEsign(key: string): string {
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
}

function storeEsign(key: string, dataUrl: string): void {
  try { if (dataUrl) localStorage.setItem(key, dataUrl); } catch {}
}

function deleteStoredEsign(key: string): void {
  try { localStorage.removeItem(key); } catch {}
}

interface PksFormData {
  date: string;
  endDate: string;
  keterangan: string;
  investorId: string;
  investorName: string;
  investorAddress: string;
  investorOccupation: string;
  investorIdNumber: string;
  investorPhone: string;
  contractPeriod: string;
  investmentAmount: string;
  paymentAccount: string;
  heirName: string;
  heirRelationship: string;
  heirEmail: string;
  heirPhone: string;
  bagiHasilPP1: string;
  bagiHasilPP2: string;
  bagiHasilPK:  string;
  esignPihakPertama1: string;
  esignPihakPertama2: string;
  esignPihakKedua: string;
  brokerId: string;
  brokerName: string;
  brokerAddress: string;
  brokerIdNumber: string;
  brokerPhone: string;
  bagiHasilPP3: string; // << DIKEMBALIKAN
}

const initialForm: PksFormData = {
  date: "",
  endDate: "",
  keterangan: "",
  investorId: "",
  investorName: "",
  investorAddress: "",
  investorOccupation: "",
  investorIdNumber: "",
  investorPhone: "",
  contractPeriod: "30",
  investmentAmount: "",
  paymentAccount: "BCA 6768043702",
  heirName: "",
  heirRelationship: "",
  heirEmail: "",
  heirPhone: "",
  bagiHasilPP1: "50",
  bagiHasilPP2: "15",
  bagiHasilPK:  "35",
  esignPihakPertama1: "",
  esignPihakPertama2: "",
  esignPihakKedua: "",
  brokerId: "",
  brokerName: "",
  brokerAddress: "",
  brokerIdNumber: "",
  brokerPhone: "",
  bagiHasilPP3: "0", // << DIKEMBALIKAN
};

function formatDate(s: string) {
  if (!s) return "-";
  const months = [
    "Jan","Feb","Mar","Apr","Mei","Jun",
    "Jul","Agu","Sep","Okt","Nov","Des",
  ];
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return `${d} ${months[m - 1]} ${y}`;
}

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);
}

function endDate(pks: Pks) {
  return pks.endDate || addDays(pks.date, pks.contractPeriod * (pks.siklus ?? 1));
}

function durationMonths(pks: Pks) {
  const [sy, sm, sd] = pks.date.slice(0, 10).split("-").map(Number);
  const [ey, em, ed] = endDate(pks).slice(0, 10).split("-").map(Number);
  const days = Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(sy, sm - 1, sd)) / 86_400_000);
  return Math.max(1, Math.round(days / 30));
}

interface FormProps {
  readonly formData: PksFormData;
  readonly setFormData: (d: PksFormData) => void;
  readonly onSubmit: (e: SyntheticEvent<HTMLFormElement>) => void;
  readonly submitLabel: string;
  readonly previewId: string;
  readonly investors: Investor[];
  readonly onInvestorSelect: (id: string) => void;
  readonly onBrokerSelect: (brokerId: string) => void;
  readonly isEdit?: boolean;
  readonly isSaving?: boolean;
  readonly savedEsignFields?: Set<string>;
  readonly brokerOptions: { id: string; name: string }[];
}

function PksFormFields({
  formData,
  setFormData,
  onSubmit,
  submitLabel,
  previewId,
  investors,
  onInvestorSelect,
  onBrokerSelect,
  isEdit = false,
  isSaving = false,
  savedEsignFields,
  brokerOptions,
}: FormProps) {
  const set = (k: keyof PksFormData, v: string) =>
    setFormData({ ...formData, [k]: v });

  return (
    <form onSubmit={onSubmit}>
      <div className="overflow-y-auto max-h-[65vh] pr-2 space-y-5">

          {/* ── Informasi Pks ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Informasi Pks
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">No. Pks</Label>
            <div className="px-3 py-2 bg-muted rounded-md text-sm font-mono text-muted-foreground">
              {previewId}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pks-date" className="text-xs">
                Tanggal Mulai <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pks-date"
                type="date"
                value={formData.date}
                onChange={(e) => set("date", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pks-end-date" className="text-xs">
                Tanggal Berakhir <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pks-end-date"
                type="date"
                value={formData.endDate}
                min={formData.date || undefined}
                onChange={(e) => set("endDate", e.target.value)}
                required
              />
              {(() => {
                // Keterangan kecil: hitung jumlah hari dari tanggal mulai ke
                // tanggal berakhir agar user tahu durasi PKS yang akan dibuat.
                if (!formData.date || !formData.endDate) return null;
                const [sy, sm, sd] = formData.date.slice(0, 10).split("-").map(Number);
                const [ey, em, ed] = formData.endDate.slice(0, 10).split("-").map(Number);
                const startMs = Date.UTC(sy, sm - 1, sd);
                const endMs   = Date.UTC(ey, em - 1, ed);
                if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
                const days = Math.round((endMs - startMs) / 86_400_000);
                  if (days < 0) {
                    return (
                      <p className="text-[11px] text-destructive">
                        ⚠ Tanggal berakhir lebih awal dari tanggal mulai ({Math.abs(days)} hari sebelum mulai).
                      </p>
                    );
                  }
                  return (
                    <p className="text-[11px] text-muted-foreground">
                      {days === 0
                        ? "Durasi: hari yang sama (0 hari)."
                        : `Durasi: ${days} hari (≈ ${(days / 30).toFixed(1)} bulan).`}
                    </p>
                  );
              })()}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pks-keterangan" className="text-xs">Keterangan</Label>
            <Input
              id="pks-keterangan"
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
              <Label htmlFor="pks-investor" className="text-xs">
                Pilih Investor <span className="text-destructive">*</span>
              </Label>
              <Select value={formData.investorId} onValueChange={onInvestorSelect} required>
                <SelectTrigger id="pks-investor">
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
            <Label htmlFor="pks-inv-name" className="text-xs">
              Nama Investor <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pks-inv-name"
              value={formData.investorName}
              onChange={(e) => set("investorName", e.target.value)}
              placeholder="Nama lengkap"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pks-inv-addr" className="text-xs">
              Alamat <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pks-inv-addr"
              value={formData.investorAddress}
              onChange={(e) => set("investorAddress", e.target.value)}
              placeholder="Alamat lengkap"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pks-inv-job" className="text-xs">
                Pekerjaan <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pks-inv-job"
                value={formData.investorOccupation}
                onChange={(e) => set("investorOccupation", e.target.value)}
                placeholder="Pekerjaan"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pks-inv-ktp" className="text-xs">
                No KTP <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pks-inv-ktp"
                value={formData.investorIdNumber}
                onChange={(e) => set("investorIdNumber", e.target.value)}
                placeholder="16 digit"
                maxLength={16}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pks-inv-phone" className="text-xs">
              No Telepon <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pks-inv-phone"
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
              <Label htmlFor="pks-period" className="text-xs">
                Periode Bagi Hasil (hari) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pks-period"
                type="number"
                min="1"
                value={formData.contractPeriod}
                onChange={(e) => set("contractPeriod", e.target.value)}
                placeholder="30"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pks-amount" className="text-xs">
                Nilai Investasi (Rp) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pks-amount"
                type="number"
                min="0"
                step="1"
                value={formData.investmentAmount}
                onChange={(e) => set("investmentAmount", e.target.value)}
                placeholder="76000000"
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pks-payment-account" className="text-xs">
              Rekening Tujuan Transfer <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.paymentAccount}
              onValueChange={(value) => set("paymentAccount", value)}
              required
            >
              <SelectTrigger id="pks-payment-account">
                <SelectValue placeholder="Pilih rekening tujuan..." />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_ACCOUNTS.map((account) => (
                  <SelectItem key={account} value={account}>{account}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Rekening ini akan dicantumkan sebagai tujuan transfer modal di dokumen PKS.
            </p>
          </div>
        </div>

        {/* ── Data Ahli Waris ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Data Ahli Waris
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="pks-heir-name" className="text-xs">
              Nama Ahli Waris <span className="text-destructive">*</span>
            </Label>
            <Input
              id="pks-heir-name"
              value={formData.heirName}
              onChange={(e) => set("heirName", e.target.value)}
              placeholder="Nama lengkap ahli waris"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pks-heir-rel" className="text-xs">
                Hubungan dengan Investor <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pks-heir-rel"
                value={formData.heirRelationship}
                onChange={(e) => set("heirRelationship", e.target.value)}
                placeholder="Ibu / Suami / Istri / ..."
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pks-heir-phone" className="text-xs">
                No HP Ahli Waris <span className="text-destructive">*</span>
              </Label>
              <Input
                id="pks-heir-phone"
                value={formData.heirPhone}
                onChange={(e) => set("heirPhone", e.target.value)}
                placeholder="+62 858-xxxx-xxxx"
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pks-heir-email" className="text-xs">
              Email Ahli Waris <span className="text-muted-foreground font-normal">(disinkronkan dari data investor)</span>
            </Label>
            <Input
              id="pks-heir-email"
              type="email"
              value={formData.heirEmail}
              onChange={(e) => set("heirEmail", e.target.value)}
              placeholder="ahliwaris@email.com"
            />
          </div>
        </div>

        {/* ── Skema Bagi Hasil ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Skema Bagi Hasil
          </p>
          {(() => {
            const pp1   = Number.parseFloat(formData.bagiHasilPP1)  || 0;
            const pp2   = Number.parseFloat(formData.bagiHasilPP2)  || 0;
            const pp3   = formData.brokerId ? (Number.parseFloat(formData.bagiHasilPP3) || 0) : 0; // << DIKEMBALIKAN
            const pk    = Number.parseFloat(formData.bagiHasilPK)   || 0;
            const total = pp1 + pp2 + pp3 + pk; // << DIKEMBALIKAN
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
                      <Label htmlFor={`pks-${key}`} className="text-xs">{label}</Label>
                      <div className="relative">
                        <Input
                          id={`pks-${key}`}
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
                    {(() => {
                      const remainder = 100 - total;
                      let statusText = "";
                      if (remainder > 0) {
                        statusText = String(remainder);
                      } else if (remainder < 0) {
                        statusText = `lebih ${total - 100}`;
                      }
                      if (valid) {
                        return `${total}% ✓`;
                      }
                      return `${total}% — kurang ${statusText}%`;
                    })()}
                  </span>
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── Broker (Pihak Pertama III) Opsional ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            Broker / Pihak Pertama III (Opsional)
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">Pilih Broker</Label>
            <Select
              value={formData.brokerId || "__none__"}
              onValueChange={(val) => {
                if (val === "__none__") {
                  setFormData({
                    ...formData,
                    brokerId: "", brokerName: "", brokerAddress: "",
                    brokerIdNumber: "", brokerPhone: "", bagiHasilPP3: "0",
                  });
                } else {
                  onBrokerSelect(val);
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Tanpa broker (langsung)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Tanpa broker (langsung)</SelectItem>
                {brokerOptions.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.name} — {b.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Pilih dari master data broker untuk referensi di PKS.</p>
          </div>

          {/* Kolom Persentase Broker Dikembalikan */}
          {formData.brokerId && (
            <div className="space-y-1.5">
              <Label htmlFor="pks-bh-pp3" className="text-xs">
                Bagi Hasil Pihak Pertama III (%) <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="pks-bh-pp3"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={formData.bagiHasilPP3}
                  onChange={(e) => setFormData({ ...formData, bagiHasilPP3: e.target.value })}
                  placeholder="0"
                  className="pr-7"
                />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
              </div>
            </div>
          )}
        </div>

        {/* ── E-Sign Tanda Tangan ── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground border-b pb-1.5">
            E-Sign Tanda Tangan (Opsional)
          </p>
          {(
            [
              { field: "esignPihakPertama1" as const, label: "E-Sign Pihak Pertama I", hint: "Adie Bayu Putra", show: true },
              { field: "esignPihakPertama2" as const, label: "E-Sign Pihak Pertama II", hint: "Parafitra Fidiasari", show: true },
              { field: "esignPihakKedua"    as const, label: "E-Sign Pihak Kedua (Investor)", hint: formData.investorName || "Investor", show: true },
            ] as const
          ).filter(({ show }) => show).map(({ field, label, hint }) => (
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
                  <div className="flex flex-col gap-1">
                    {savedEsignFields?.has(field) && (
                      <span className="text-[10px] text-green-600 font-medium">↻ Dari penyimpanan</span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive h-7 px-2"
                      onClick={() => set(field, "")}
                    >
                      Hapus
                    </Button>
                  </div>
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
                      globalThis.alert(`Ukuran file terlalu besar (${(file.size / 1024).toFixed(0)} KB). Maksimal 200 KB untuk e-sign.`);
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

// ─────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────

type Filter = "semua" | "draft" | "complete" | "terminated";

export function PksContent() {
  const { pksList, addPks, updatePks, deletePks, uploadSignedDoc } = usePks();
  const { investors } = useInvestors();
  const { brokers } = useBrokers();
  const { transaksis } = useTransaksi();
  const { user, isInvestor } = useAuth();
  const isAdmin   = user?.role === "admin";
  const perm      = usePermissions();
  const canCreate = isAdmin || perm.create;
  const canEdit   = isAdmin || perm.edit;
  const canDelete = isAdmin || perm.delete;
  const canPrint  = isAdmin || perm.print;

  const [filter, setFilter] = useState<Filter>("semua");
  const changeFilter = (f: Filter) => { setFilter(f); setPage(1); };
  // ── Search query (cari PKS berdasarkan No. PKS atau nama investor) ──
  const [searchQuery, setSearchQuery] = useState("");
  const changeSearchQuery = (q: string) => { setSearchQuery(q); setPage(1); };
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [selected, setSelected] = useState<Pks | null>(null);
  const [form, setForm] = useState<PksFormData>(initialForm);

  const [isUploadDocOpen, setIsUploadDocOpen] = useState(false);
  const [uploadDocTarget, setUploadDocTarget] = useState<Pks | null>(null);
  const [uploadDocFile, setUploadDocFile] = useState<File | null>(null);
  const [uploadPreviewUrl, setUploadPreviewUrl] = useState<string | null>(null);
  const [docConfirmed, setDocConfirmed] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [overwriteConfirmed, setOverwriteConfirmed] = useState(false);

  // ── Dialog TTD investor ──
  const [isTtdOpen,    setIsTtdOpen]    = useState(false);
  const [ttdTarget,    setTtdTarget]    = useState<Pks | null>(null);
  const [ttdPreview,   setTtdPreview]   = useState<string>("");
  const [isSavingTtd,  setIsSavingTtd]  = useState(false);

  const openTtd = (pks: Pks) => {
    setTtdTarget(pks);
    setTtdPreview(pks.esignPihakKedua ?? "");
    setIsTtdOpen(true);
  };

  const handleTtdFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 200 * 1024) {
      e.target.value = "";
      globalThis.alert(`Ukuran file terlalu besar (${(file.size / 1024).toFixed(0)} KB). Maksimal 200 KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string ?? "";
      setTtdPreview(dataUrl);
      if (dataUrl && ttdTarget?.investorId) {
        storeEsign(esignInvKey(ttdTarget.investorId), dataUrl);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveTtd = async () => {
    if (!ttdTarget) return;
    setIsSavingTtd(true);
    try {
      await updatePks(ttdTarget.id, { esignPihakKedua: ttdPreview });
      toast.success(ttdPreview ? "Tanda tangan berhasil disimpan" : "Tanda tangan berhasil dihapus");
      setIsTtdOpen(false);
      setTtdTarget(null);
      setTtdPreview("");
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal menyimpan tanda tangan"));
    } finally {
      setIsSavingTtd(false);
    }
  };

  const [errorInfo, setErrorInfo] = useState<PbErrorInfo | null>(null);
  const [page, setPage] = useState(1);

  const ITEMS_PER_PAGE = 20;

  const isBroker = user?.role === "broker";
  const currentBroker = brokers.find((b) => b.id === user?.brokerId);

  const visiblePkss = isInvestor && user?.investorId
    ? pksList.filter((m) => m.investorId === user.investorId)
    : isBroker && currentBroker
    ? pksList.filter((m) => m.brokerId === currentBroker.id)
    : pksList;
  // ── Filter (status + pencarian berdasarkan No. PKS atau nama investor) ──
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filtered = visiblePkss.filter((m) => {
    if (filter !== "semua" && getPksStatus(m) !== filter) return false;
    if (normalizedQuery) {
      const haystack = `${m.id} ${m.investorName}`.toLowerCase();
      if (!haystack.includes(normalizedQuery)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginated  = filtered.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  // ── Toggle Complete ──
  const handleToggleComplete = async (pks: Pks) => {
    setIsConfirming(true);
    try {
      await updatePks(pks.id, { isComplete: !pks.isComplete });
      toast.success(pks.isComplete ? "PKS dikembalikan ke Draft" : "PKS ditandai Complete");
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal mengubah status PKS"));
    } finally {
      setIsConfirming(false);
    }
  };

  // ── Preview ID (PKS-YYYYMM-NNN) ──
  const nextId = (date: string) => {
    if (!date) return "PKS-??????-???";
    const ym     = date.slice(0, 7).replace("-", "");
    const prefix = `PKS-${ym}-`;
    const max = pksList.reduce((m, x) => {
      if (!x.id.startsWith(prefix)) return m;
      const n = Number.parseInt(x.id.slice(prefix.length)) || 0;
      return Math.max(m, n);
    }, 0);
    return `${prefix}${String(max + 1).padStart(3, "0")}`;
  };

  // ── Broker auto-fill ──
  const handleBrokerSelect = (brokerId: string) => {
    const broker = brokers.find((b) => b.id === brokerId);
    if (!broker) return;
    setForm((prev) => ({
      ...prev,
      brokerId: broker.id,
      brokerName: broker.name,
      brokerAddress: broker.address,
      brokerIdNumber: broker.idNumber,
      brokerPhone: broker.phone,
    }));
  };

  // ── Investor auto-fill ──
  const handleInvestorSelect = (investorId: string) => {
    const inv = investors.find((i) => i.id === investorId);
    if (!inv) return;

    const savedTtd = loadStoredEsign(esignInvKey(investorId));
    const broker = inv.brokerName ? brokers.find((b) => b.name === inv.brokerName) : null;

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
      heirRelationship: inv.heirRelationship,
      heirEmail: inv.heirEmail,
      esignPihakKedua: savedTtd,
      brokerId:           broker ? broker.id      : "",
      brokerName:         broker ? broker.name    : "",
      brokerAddress:      broker ? broker.address : "",
      brokerIdNumber:     broker ? broker.idNumber : "",
      brokerPhone:        broker ? broker.phone   : "",
      bagiHasilPP3:       broker ? prev.bagiHasilPP3 : "0", // << PP3 ditarik normal
    }));

    const newSaved = new Set<string>();
    if (savedTtd) newSaved.add("esignPihakKedua");
    setSavedEsignFields(newSaved);
  };

  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [savedEsignFields, setSavedEsignFields] = useState(new Set<string>());

  const handleEsignChange = (
    fieldName: string,
    newValue: string,
    oldValue: string,
    storageKey: string,
    condition?: boolean
  ) => {
    if (condition === false) return;
    if (newValue === oldValue) return;

    if (newValue.startsWith("data:")) {
      storeEsign(storageKey, newValue);
      setSavedEsignFields((s) => new Set([...s, fieldName]));
    } else if (!newValue) {
      deleteStoredEsign(storageKey);
      setSavedEsignFields((s) => { const n = new Set(s); n.delete(fieldName); return n; });
    }
  };

  const handleFormChange = (newForm: PksFormData) => {
    handleEsignChange("esignPihakPertama1", newForm.esignPihakPertama1, form.esignPihakPertama1, ESIGN_KEYS.esignPihakPertama1);
    handleEsignChange("esignPihakPertama2", newForm.esignPihakPertama2, form.esignPihakPertama2, ESIGN_KEYS.esignPihakPertama2);
    handleEsignChange("esignPihakKedua", newForm.esignPihakKedua, form.esignPihakKedua, esignInvKey(newForm.investorId), Boolean(newForm.investorId));

    setForm(newForm);
  };

  // ── Validasi bagi hasil ──
  const validateBagiHasil = () => {
    const total =
      (Number.parseFloat(form.bagiHasilPP1)  || 0) +
      (Number.parseFloat(form.bagiHasilPP2)  || 0) +
      (form.brokerId ? (Number.parseFloat(form.bagiHasilPP3) || 0) : 0) +
      (Number.parseFloat(form.bagiHasilPK)   || 0);
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
  const handleAdd = async (e: SyntheticEvent<HTMLFormElement, Event>) => {
    e.preventDefault();
    if (!validateBagiHasil()) return;

    const inv = investors.find((i) => i.id === form.investorId);
    if (inv) {
      const allocated = pksList
        .filter((m) => m.investorId === form.investorId && !m.isTerminated)
        .reduce((sum, m) => sum + m.investmentAmount, 0);
      const available = inv.investmentAmount - allocated;
      const requested = Number.parseFloat(form.investmentAmount) || 0;
      if (requested > available + 0.01) {
        setErrorInfo({
          title: "Nilai investasi melebihi modal tersedia",
          fields: [{ field: "investmentAmount", code: "exceeds_available",
            message: `Modal tersedia: Rp ${available.toLocaleString("id-ID")}. Nilai yang dimasukkan: Rp ${requested.toLocaleString("id-ID")}.` }],
          raw: `Available: ${available}, Requested: ${requested}`,
        });
        return;
      }
    }

    setIsSaving(true);
    try {
      await addPks({
        date: form.date,
        endDate: form.endDate,
        investorId: form.investorId,
        investorName: form.investorName,
        investorAddress: form.investorAddress,
        investorOccupation: form.investorOccupation,
        investorIdNumber: form.investorIdNumber,
        investorPhone: form.investorPhone,
        contractPeriod: Number.parseInt(form.contractPeriod),
        investmentAmount: Number.parseFloat(form.investmentAmount),
        paymentAccount: form.paymentAccount,
        heirName: form.heirName,
        heirRelationship: form.heirRelationship,
        heirEmail: form.heirEmail,
        heirPhone: form.heirPhone,
        keterangan: form.keterangan,
        // FIX: Jangan pakai `|| default` karena input "0" adalah nilai sah
        // dan `Number.parseFloat("0") || 15` akan jatuh ke default 15, membuat
        // total PP1+PP2+PP3+PK salah (mis. 60+15+0+40 = 115% padahal user
        // memasukkan PP2=0). Pakai Number.isFinite sebagai gantinya.
        bagiHasilPP1: (() => { const n = Number.parseFloat(form.bagiHasilPP1); return Number.isFinite(n) ? n : 50; })(),
        bagiHasilPP2: (() => { const n = Number.parseFloat(form.bagiHasilPP2); return Number.isFinite(n) ? n : 15; })(),
        bagiHasilPK:  (() => { const n = Number.parseFloat(form.bagiHasilPK);  return Number.isFinite(n) ? n : 35; })(),
        brokerId:      form.brokerId,
        brokerName:    form.brokerName,
        brokerAddress: form.brokerAddress,
        brokerIdNumber: form.brokerIdNumber,
        brokerPhone:   form.brokerPhone,
        bagiHasilPP3:  (() => {
          if (!form.brokerId) return 0;
          const n = Number.parseFloat(form.bagiHasilPP3);
          return Number.isFinite(n) ? n : 0;
        })(),
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

  const handleEdit = async (e: SyntheticEvent<HTMLFormElement, Event>) => {
    e.preventDefault();
    if (!selected) return;
    if (!validateBagiHasil()) return;

    const inv = investors.find((i) => i.id === selected.investorId);
    if (inv) {
      const allocated = pksList
        .filter((m) => m.investorId === selected.investorId && !m.isTerminated && m.id !== selected.id)
        .reduce((sum, m) => sum + m.investmentAmount, 0);
      const available = inv.investmentAmount - allocated;
      const requested = Number.parseFloat(form.investmentAmount) || 0;
      if (requested > available + 0.01) {
        setErrorInfo({
          title: "Nilai investasi melebihi modal tersedia",
          fields: [{ field: "investmentAmount", code: "exceeds_available",
            message: `Modal tersedia: Rp ${available.toLocaleString("id-ID")}. Nilai yang dimasukkan: Rp ${requested.toLocaleString("id-ID")}.` }],
          raw: `Available: ${available}, Requested: ${requested}`,
        });
        return;
      }
    }

    setIsSaving(true);
    try {
      await updatePks(selected.id, {
        date: form.date,
        endDate: form.endDate,
        investorName: form.investorName,
        investorAddress: form.investorAddress,
        investorOccupation: form.investorOccupation,
        investorIdNumber: form.investorIdNumber,
        investorPhone: form.investorPhone,
        contractPeriod: Number.parseInt(form.contractPeriod),
        investmentAmount: Number.parseFloat(form.investmentAmount),
        paymentAccount: form.paymentAccount,
        heirName: form.heirName,
        heirRelationship: form.heirRelationship,
        heirEmail: form.heirEmail,
        heirPhone: form.heirPhone,
        keterangan: form.keterangan,
        // FIX: Sama seperti handleAdd, gunakan Number.isFinite daripada `|| default`
        // agar nilai "0" tidak jatuh ke default.
        bagiHasilPP1: (() => { const n = Number.parseFloat(form.bagiHasilPP1); return Number.isFinite(n) ? n : 50; })(),
        bagiHasilPP2: (() => { const n = Number.parseFloat(form.bagiHasilPP2); return Number.isFinite(n) ? n : 15; })(),
        bagiHasilPK:  (() => { const n = Number.parseFloat(form.bagiHasilPK);  return Number.isFinite(n) ? n : 35; })(),
        brokerId:      form.brokerId,
        brokerName:    form.brokerName,
        brokerAddress: form.brokerAddress,
        brokerIdNumber: form.brokerIdNumber,
        brokerPhone:   form.brokerPhone,
        bagiHasilPP3:  (() => {
          if (!form.brokerId) return 0;
          const n = Number.parseFloat(form.bagiHasilPP3);
          return Number.isFinite(n) ? n : 0;
        })(),
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

  const openEdit = (pks: Pks) => {
    setSelected(pks);
    setSavedEsignFields(new Set());
    const resolvedBroker =
      !pks.brokerId && pks.brokerName
        ? brokers.find((b) => b.name === pks.brokerName) ?? null
        : null;
    setForm({
      date: pks.date,
      endDate: pks.endDate ?? "",
      keterangan: pks.keterangan ?? "",
      investorId: pks.investorId,
      investorName: pks.investorName,
      investorAddress: pks.investorAddress,
      investorOccupation: pks.investorOccupation,
      investorIdNumber: pks.investorIdNumber,
      investorPhone: pks.investorPhone,
      contractPeriod: pks.contractPeriod.toString(),
      investmentAmount: pks.investmentAmount.toString(),
      paymentAccount: pks.paymentAccount ?? "BCA 6768043702",
      heirName: pks.heirName,
      heirRelationship: pks.heirRelationship,
      heirEmail: pks.heirEmail,
      heirPhone: pks.heirPhone,
      bagiHasilPP1: String(pks.bagiHasilPP1 ?? 50),
      bagiHasilPP2: String(pks.bagiHasilPP2 ?? 15),
      bagiHasilPK:  String(pks.bagiHasilPK  ?? 35),
      esignPihakPertama1: pks.esignPihakPertama1 ?? "",
      esignPihakPertama2: pks.esignPihakPertama2 ?? "",
      esignPihakKedua: pks.esignPihakKedua ?? "",
      brokerId:       resolvedBroker ? resolvedBroker.id       : (pks.brokerId      ?? ""),
      brokerName:     resolvedBroker ? resolvedBroker.name     : (pks.brokerName    ?? ""),
      brokerAddress:  resolvedBroker ? resolvedBroker.address  : (pks.brokerAddress ?? ""),
      brokerIdNumber: resolvedBroker ? resolvedBroker.idNumber : (pks.brokerIdNumber ?? ""),
      brokerPhone:    resolvedBroker ? resolvedBroker.phone    : (pks.brokerPhone   ?? ""),
      bagiHasilPP3:   String(pks.bagiHasilPP3 ?? 0), // << STATE PP3 DIKEMBALIKAN
    });
    setIsEditOpen(true);
  };

  const openUploadDoc = (pks: Pks) => {
    setUploadDocTarget(pks);
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

  const openDelete = (pks: Pks) => {
    setSelected(pks);
    setIsDeleteOpen(true);
  };

  const confirmDelete = async () => {
    if (!selected) return;
    setIsConfirming(true);
    try {
      await deletePks(selected.id);
      toast.success("PKS berhasil dihapus");
      setSelected(null);
      setIsDeleteOpen(false);
    } catch (err) {
      setErrorInfo(formatPbError(err, "Gagal menghapus PKS"));
    } finally {
      setIsConfirming(false);
    }
  };

  const handlePrint = (pks: Pks) => {
    if (pks.hasSignedDoc && pks.signedDocUrl) {
      window.open(pks.signedDocUrl, "_blank");
      return;
    }
    const html = generatePksHtml(pks, transaksis);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const w    = window.open(url, "_blank");
    if (w) w.focus();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  // ── Count per status ──
  const counts = {
    semua:      visiblePkss.length,
    draft:      visiblePkss.filter((m) => getPksStatus(m) === "draft").length,
    complete:   visiblePkss.filter((m) => getPksStatus(m) === "complete").length,
    terminated: visiblePkss.filter((m) => getPksStatus(m) === "terminated").length,
  };

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Perjanjian Kerjasama</h1>
          <p className="text-muted-foreground">Kelola dokumen perjanjian kerjasama investasi</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={(open) => {
          if (open) {
            const pp1 = loadStoredEsign(ESIGN_KEYS.esignPihakPertama1);
            const pp2 = loadStoredEsign(ESIGN_KEYS.esignPihakPertama2);
            const saved = new Set<string>();
            const updates: Partial<PksFormData> = {};
            if (pp1) { updates.esignPihakPertama1 = pp1; saved.add("esignPihakPertama1"); }
            if (pp2) { updates.esignPihakPertama2 = pp2; saved.add("esignPihakPertama2"); }
            if (Object.keys(updates).length) setForm((f) => ({ ...f, ...updates }));
            setSavedEsignFields(saved);
          } else {
            setSavedEsignFields(new Set());
          }
          setIsAddOpen(open);
        }}>
          {canCreate && <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Buat PKS
            </Button>
          </DialogTrigger>}
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Buat PKS Baru</DialogTitle>
              <DialogDescription>
                Pilih investor untuk auto-isi data, lalu lengkapi sisa kolom
              </DialogDescription>
            </DialogHeader>
            <PksFormFields
              formData={form}
              setFormData={handleFormChange}
              onSubmit={handleAdd}
              submitLabel="Simpan Pks"
              previewId={nextId(form.date)}
              investors={investors}
              onInvestorSelect={handleInvestorSelect}
              onBrokerSelect={handleBrokerSelect}
              brokerOptions={brokers.map((b) => ({ id: b.id, name: b.name }))}
              isSaving={isSaving}
              savedEsignFields={savedEsignFields}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* ── Filter tabs ── */}
      <div className="flex flex-wrap gap-2">
        {(["semua", "draft", "complete", "terminated"] as Filter[]).map((f) => (
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
              {
                (() => {
                  if (normalizedQuery) return "PKS tidak ditemukan";
                  if (filter === "semua") return "Belum ada PKS";
                  if (filter === "complete") return "Belum ada PKS yang selesai";
                  if (filter === "terminated") return "Belum ada PKS yang terminated";
                  return "Belum ada PKS draft";
                })()
              }
            </h3>
            <p className="text-muted-foreground text-sm">
              {normalizedQuery
                ? `Tidak ada PKS yang cocok dengan pencarian "${searchQuery}". Coba kata kunci lain.`
                : filter === "semua"
                ? "Buat Pks pertama dengan klik tombol di atas"
                : "Coba filter lain"}
            </p>
          </CardContent>
        </Card>
      ) : (
        /* ── Table ── */
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between space-y-0">
            <CardTitle className="text-base">Daftar PKS</CardTitle>
            {/* ── Input pencarian PKS ── */}
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => changeSearchQuery(e.target.value)}
                placeholder="Cari No. PKS atau nama investor..."
                className="h-8 pl-8 pr-8 text-xs"
                aria-label="Cari PKS"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => changeSearchQuery("")}
                  aria-label="Bersihkan pencarian"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">No. PKS</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Tanggal</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Investor</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Broker</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Keterangan</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Periode</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Nilai Investasi</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Berakhir</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">Status</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((pks) => {
                    const status = getPksStatus(pks);
                    return (
                      <tr
                        key={pks.id}
                        className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-3 px-4 font-mono text-xs font-medium">{pks.id}</td>
                        <td className="py-3 px-4 text-muted-foreground">{formatDate(pks.date)}</td>
                        <td className="py-3 px-4">
                          <div className="font-medium">{pks.investorName}</div>
                          <div className="text-xs text-muted-foreground">{pks.investorId}</div>
                        </td>
                        <td className="py-3 px-4">
                          {pks.brokerName
                            ? <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">{pks.brokerName}</span>
                            : <span className="text-xs text-muted-foreground italic">—</span>}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground text-xs max-w-[160px]">
                          {pks.keterangan || <span className="italic opacity-50">—</span>}
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1 text-muted-foreground">
                            <CalendarDays className="h-3 w-3" />
                            {durationMonths(pks) * 30} hari
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          {formatRp(pks.investmentAmount)}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground">
                          {formatDate(endDate(pks))}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {(() => {
                            let badgeClass: string;
                            if (status === "complete") {
                              badgeClass = "bg-green-100 text-green-800 hover:bg-green-100";
                            } else if (status === "terminated") {
                              badgeClass = "bg-red-100 text-red-800 hover:bg-red-100";
                            } else {
                              badgeClass = "bg-muted text-muted-foreground hover:bg-muted";
                            }

                            let badgeText: string;
                            if (status === "complete") {
                              badgeText = "Complete";
                            } else if (status === "terminated") {
                              badgeText = "Terminated";
                            } else {
                              badgeText = "Draft";
                            }

                            return (
                              <Badge
                                variant="secondary"
                                className={badgeClass}
                              >
                                {badgeText}
                              </Badge>
                            );
                          })()}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-center gap-1">
                            {canPrint && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Cetak / Download PDF"
                              onClick={() => handlePrint(pks)}
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </Button>
                            )}
                            {isInvestor && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title={pks.esignPihakKedua ? "Ubah Tanda Tangan" : "Upload Tanda Tangan"}
                              onClick={() => openTtd(pks)}
                            >
                              <PenLine className={`h-3.5 w-3.5 ${pks.esignPihakKedua ? "text-green-600" : "text-blue-500"}`} />
                            </Button>
                            )}
                            {canEdit && (
                            <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Edit"
                              onClick={() => openEdit(pks)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {!pks.isTerminated && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title={pks.isComplete ? "Kembalikan ke Draft" : "Tandai Complete"}
                              onClick={() => handleToggleComplete(pks)}
                            >
                              {pks.isComplete
                                ? <CircleDashed className="h-3.5 w-3.5 text-muted-foreground" />
                                : <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />}
                            </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Upload PKS Bertanda Tangan"
                              onClick={() => openUploadDoc(pks)}
                            >
                              <Upload className={`h-3.5 w-3.5 ${pks.hasSignedDoc ? "text-green-600" : "text-blue-500"}`} />
                            </Button>
                            </>
                            )}
                            {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Hapus"
                              onClick={() => openDelete(pks)}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
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
                    if (i > 0 && p - arr[i - 1] > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p) =>
                    p === "…" ? (
                      <span key="ellipsis" className="px-1 text-muted-foreground text-xs">…</span>
                    ) : (
                      <Button
                        key={p}
                        variant={page === p ? "default" : "outline"}
                        size="sm"
                        className="w-8 h-8 p-0 text-xs"
                        onClick={() => setPage(p)}
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
          <PksFormFields
            formData={form}
            setFormData={handleFormChange}
            onSubmit={handleEdit}
            submitLabel="Simpan Perubahan"
            previewId={selected?.id ?? ""}
            investors={investors}
            onInvestorSelect={handleInvestorSelect}
            onBrokerSelect={handleBrokerSelect}
            brokerOptions={brokers.map((b) => ({ id: b.id, name: b.name }))}
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
                  {(() => {
                    if (isUploading) return "Mengunggah…";
                    if (uploadDocTarget?.hasSignedDoc) return "Timpa & Upload Ulang";
                    return "Upload & Aktifkan";
                  })()}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Dialog TTD Investor ── */}
      <Dialog open={isTtdOpen} onOpenChange={(o) => { if (!o) { setIsTtdOpen(false); setTtdTarget(null); setTtdPreview(""); } }}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Tanda Tangan Pihak Kedua</DialogTitle>
            <DialogDescription>
              Upload tanda tangan Anda untuk PKS{" "}
              <strong>{ttdTarget?.id}</strong>. Format JPEG / PNG / WebP, maks. 200 KB.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {ttdPreview ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Preview tanda tangan:</p>
                <div className="flex items-center gap-3 p-3 border rounded-md bg-muted/30">
                  <img
                    src={ttdPreview}
                    alt="Preview TTD"
                    className="h-16 w-auto object-contain border rounded bg-white"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setTtdPreview("")}
                  >
                    Hapus
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Upload File Tanda Tangan</Label>
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="cursor-pointer"
                  onChange={handleTtdFileChange}
                />
                <p className="text-[11px] text-muted-foreground">JPEG / PNG / WebP · Maks. 200 KB</p>
              </div>
            )}
          </div>

          <DialogFooter className="pt-3 border-t">
            <Button variant="outline" onClick={() => setIsTtdOpen(false)}>Batal</Button>
            <Button
              onClick={handleSaveTtd}
              disabled={isSavingTtd || (!ttdPreview && !ttdTarget?.esignPihakKedua)}
            >
              {isSavingTtd && "Menyimpan..."}
              {!isSavingTtd && !ttdPreview && ttdTarget?.esignPihakKedua && "Hapus Tanda Tangan"}
              {!isSavingTtd && !((!ttdPreview && ttdTarget?.esignPihakKedua)) && "Simpan Tanda Tangan"}
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
