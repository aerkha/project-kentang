"use client";

import { useInventory } from "@/lib/inventory-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PackageSearch } from "lucide-react";

const formatKg = (n: number) => {
  // m-2: warn if stock drops below 0 — more shipments than inventory.
  const formatted = `${new Intl.NumberFormat("id-ID").format(n)} Kg`;
  return n < 0 ? `${formatted} ⚠` : formatted;
};

export function InventoryContent() {
  const { currentStock, isLoading } = useInventory();

  if (isLoading) return <div className="text-center py-20 animate-pulse text-muted-foreground">Memuat data stok...</div>;

  const hasNegative = (
    currentStock.gradeA < 0 ||
    currentStock.gradeB < 0 ||
    currentStock.gradeC < 0 ||
    currentStock.baby   < 0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <PackageSearch className="h-6 w-6 text-primary" /> Stok Tersedia
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Pantau ketersediaan stok kentang di gudang secara real-time.</p>
      </div>

      {hasNegative && (
        // m-2: tampilkan banner peringatan supaya admin tahu data stok inkonsisten.
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive font-medium">
          ⚠ Peringatan: salah satu grade memiliki nilai negatif — jumlah pengiriman melebihi sortir yang tercatat.
          Periksa data sortir & pengiriman untuk diperbaiki.
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "Grade A", value: currentStock.gradeA, color: "text-blue-600" },
          { label: "Grade B", value: currentStock.gradeB, color: "text-emerald-600" },
          { label: "Grade C", value: currentStock.gradeC, color: "text-amber-600" },
          { label: "Baby", value: currentStock.baby, color: "text-purple-600" },
          { label: "Reject", value: currentStock.reject, color: "text-red-600" },
        ].map(s => (
          <Card key={s.label}>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{s.label}</CardTitle></CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${s.value < 0 ? "text-destructive" : s.color}`}>
                {formatKg(s.value)}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}