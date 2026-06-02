"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";
import type { PbErrorInfo } from "@/lib/pb-error";

interface ErrorDialogProps {
  open: boolean;
  onClose: () => void;
  error: PbErrorInfo | null;
  /** Judul dialog, default "Gagal menyimpan data" */
  title?: string;
}

export function ErrorDialog({ open, onClose, error, title = "Gagal menyimpan data" }: ErrorDialogProps) {
  if (!error) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5 shrink-0" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Pesan utama */}
          <p className="text-sm text-muted-foreground">{error.title}</p>

          {/* Detail per-field jika ada */}
          {error.fields.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 space-y-1.5">
              {error.fields.map((f) => (
                <div key={f.field} className="text-xs">
                  <span className="font-semibold font-mono text-destructive">{f.field}</span>
                  <span className="text-muted-foreground"> — {f.message}</span>
                  <span className="ml-1 text-[10px] text-muted-foreground/60">({f.code})</span>
                </div>
              ))}
            </div>
          )}

          {/* Saran umum */}
          <p className="text-xs text-muted-foreground">
            Periksa koneksi dan konfigurasi PocketBase. Detail lengkap tersedia di konsol browser.
          </p>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Tutup</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
