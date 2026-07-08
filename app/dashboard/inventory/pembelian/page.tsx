"use client";
import { useState } from "react";
import { useInventory } from "@/lib/inventory-context";
import { todayWibStr } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowDownToLine, Plus } from "lucide-react";
import { toast } from "sonner";

const formatKg = (n: number) => `${new Intl.NumberFormat("id-ID").format(n)} Kg`;

export default function PembelianPage() {
  const { bandars, pembelians, addPembelian, generatePembelianId, isLoading } = useInventory();
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ tanggal: todayWibStr().slice(0, 10), bandar: "", tonase_lapangan: "", tonase_gudang: "", harga_per_kg: "" });

  if (isLoading) return <div className="animate-pulse">Memuat...</div>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const bandar = bandars.find(b => b.id === form.bandar);
    if (!bandar) return;
    try {
      const tonaseL = parseFloat(form.tonase_lapangan) || 0;
      await addPembelian({
        batch_id: generatePembelianId(bandar.kode, form.tanggal),
        tanggal: form.tanggal + " 00:00:00", bandar: bandar.id,
        tonase_lapangan: tonaseL, tonase_gudang: parseFloat(form.tonase_gudang) || 0,
        harga_per_kg: parseFloat(form.harga_per_kg) || 0, total_harga: tonaseL * (parseFloat(form.harga_per_kg) || 0),
        tujuan: "Gudang (Sortir)", status: "Menunggu Sortir"
      });
      toast.success("Barang masuk dicatat!"); setIsOpen(false);
    } catch { toast.error("Gagal mencatat"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ArrowDownToLine className="h-6 w-6 text-primary"/> Barang Masuk</h1>
          <p className="text-sm text-muted-foreground mt-1">Penerimaan kentang dari Bandar.</p>
        </div>
        <Button onClick={() => setIsOpen(true)}><Plus className="h-4 w-4 mr-2"/> Terima Barang</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 border-b"><tr><th className="p-4">ID Batch</th><th className="p-4">Tanggal</th><th className="p-4">Bandar</th><th className="p-4">Tonase (Gudang)</th><th className="p-4">Status</th></tr></thead>
            <tbody>
              {pembelians.map(p => (
                <tr key={p.id} className="border-b"><td className="p-4 font-mono text-primary">{p.batch_id}</td><td className="p-4">{p.tanggal.slice(0,10)}</td><td className="p-4">{bandars.find(b => b.id === p.bandar)?.nama}</td><td className="p-4 font-semibold">{formatKg(p.tonase_gudang)}</td><td className="p-4">{p.status === "Selesai" ? <span className="text-green-600">Selesai Disortir</span> : <span className="text-amber-600">Menunggu Sortir</span>}</td></tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Terima Barang dari Bandar</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Tanggal Masuk</Label><Input type="date" value={form.tanggal} onChange={e=>setForm({...form, tanggal: e.target.value})} required/></div>
              <div className="space-y-1"><Label>Bandar</Label>
                <Select value={form.bandar} onValueChange={v=>setForm({...form, bandar: v})} required>
                  <SelectTrigger><SelectValue placeholder="Pilih Bandar"/></SelectTrigger>
                  <SelectContent>{bandars.map(b=><SelectItem key={b.id} value={b.id}>{b.nama}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Tonase Lapangan (Kg)</Label><Input type="number" value={form.tonase_lapangan} onChange={e=>setForm({...form, tonase_lapangan: e.target.value})} required/></div>
              <div className="space-y-1"><Label>Tonase Gudang (Kg)</Label><Input type="number" value={form.tonase_gudang} onChange={e=>setForm({...form, tonase_gudang: e.target.value})} required/></div>
              <div className="col-span-2 space-y-1"><Label>Harga Beli per Kg (Rp)</Label><Input type="number" value={form.harga_per_kg} onChange={e=>setForm({...form, harga_per_kg: e.target.value})} required/></div>
            </div>
            <DialogFooter><Button type="submit">Simpan</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}