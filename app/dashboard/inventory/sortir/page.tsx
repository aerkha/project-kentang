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
import { CheckSquare, Scale } from "lucide-react";
import { toast } from "sonner";

const formatKg = (n: number) => `${new Intl.NumberFormat("id-ID").format(n)} Kg`;

export default function SortirPage() {
  const { sortirs, pembelians, addSortir, isLoading } = useInventory();
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ pembelian_id: "", tanggal_sortir: todayWibStr().slice(0, 10), grade_a: "", grade_b: "", grade_c: "", grade_baby: "", grade_reject: "" });

  if (isLoading) return <div className="animate-pulse">Memuat...</div>;
  const unSorted = pembelians.filter(p => p.status !== "Selesai");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pb = pembelians.find(p => p.id === form.pembelian_id);
    if (!pb) return;
    try {
      const a = parseFloat(form.grade_a)||0; const b = parseFloat(form.grade_b)||0; const c = parseFloat(form.grade_c)||0;
      const baby = parseFloat(form.grade_baby)||0; const reject = parseFloat(form.grade_reject)||0;
      await addSortir({
        pembelian_id: pb.id, tanggal_sortir: form.tanggal_sortir + " 00:00:00",
        grade_a: a, grade_b: b, grade_c: c, grade_baby: baby, grade_reject: reject,
        susut: pb.tonase_gudang - (a+b+c+baby+reject),
      });
      toast.success("Sortir dicatat!"); setIsOpen(false);
    } catch { toast.error("Gagal mencatat"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CheckSquare className="h-6 w-6 text-amber-600"/> Proses Sortir</h1>
          <p className="text-sm text-muted-foreground mt-1">Pemecahan ukuran kentang menjadi Grade.</p>
        </div>
        <Button onClick={() => setIsOpen(true)} className="bg-amber-600 hover:bg-amber-700"><Scale className="h-4 w-4 mr-2"/> Catat Sortir</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 border-b"><tr><th className="p-4">Tgl Sortir</th><th className="p-4">Sumber Batch</th><th className="p-4">Grade A</th><th className="p-4">Grade B</th><th className="p-4 text-red-600">Susut</th></tr></thead>
            <tbody>
              {sortirs.map(s => (
                <tr key={s.id} className="border-b"><td className="p-4">{s.tanggal_sortir.slice(0,10)}</td><td className="p-4 font-mono text-xs">{pembelians.find(p=>p.id===s.pembelian_id)?.batch_id}</td><td className="p-4">{formatKg(s.grade_a)}</td><td className="p-4">{formatKg(s.grade_b)}</td><td className="p-4 font-medium text-red-600">{formatKg(s.susut)}</td></tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Catat Hasil Sortir & Grade</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1"><Label>Batch Belum Sortir</Label>
              <Select value={form.pembelian_id} onValueChange={v=>setForm({...form, pembelian_id: v})} required>
                <SelectTrigger><SelectValue placeholder="Pilih Batch Pembelian" /></SelectTrigger>
                <SelectContent>{unSorted.map(p => <SelectItem key={p.id} value={p.id}>{p.batch_id} — {formatKg(p.tonase_gudang)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Grade A (Kg)</Label><Input type="number" value={form.grade_a} onChange={e=>setForm({...form, grade_a: e.target.value})}/></div>
              <div className="space-y-1"><Label>Grade B (Kg)</Label><Input type="number" value={form.grade_b} onChange={e=>setForm({...form, grade_b: e.target.value})}/></div>
              <div className="space-y-1"><Label>Grade C (Kg)</Label><Input type="number" value={form.grade_c} onChange={e=>setForm({...form, grade_c: e.target.value})}/></div>
              <div className="space-y-1"><Label>Baby (Kg)</Label><Input type="number" value={form.grade_baby} onChange={e=>setForm({...form, grade_baby: e.target.value})}/></div>
            </div>
            <DialogFooter><Button type="submit" className="bg-amber-600 hover:bg-amber-700">Simpan Sortir</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}