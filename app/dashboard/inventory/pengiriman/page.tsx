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
import { ArrowUpRight, Send } from "lucide-react";
import { toast } from "sonner";

const formatKg = (n: number) => `${new Intl.NumberFormat("id-ID").format(n)} Kg`;

export default function PengirimanPage() {
  const { buyers, pengirimans, currentStock, addPengiriman, generatePengirimanId, isLoading } = useInventory();
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState({ tanggal: todayWibStr().slice(0, 10), buyer: "", qty_grade_a: "", qty_grade_b: "", qty_grade_c: "", qty_grade_baby: "" });

  if (isLoading) return <div className="animate-pulse">Memuat...</div>;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const buyer = buyers.find(b => b.id === form.buyer);
    if (!buyer) return;
    
    const a = parseFloat(form.qty_grade_a)||0; const b = parseFloat(form.qty_grade_b)||0; 
    const c = parseFloat(form.qty_grade_c)||0; const baby = parseFloat(form.qty_grade_baby)||0;
    if (a>currentStock.gradeA || b>currentStock.gradeB || c>currentStock.gradeC || baby>currentStock.baby) return toast.error("Melebihi Stok Gudang!");

    try {
      await addPengiriman({
        batch_id: generatePengirimanId(buyer.kode, form.tanggal),
        tanggal: form.tanggal + " 00:00:00", buyer: buyer.id,
        qty_grade_a: a, qty_grade_b: b, qty_grade_c: c, qty_grade_baby: baby, status: "Dalam Perjalanan"
      });
      toast.success("Pengiriman dibuat!"); setIsOpen(false);
    } catch { toast.error("Gagal mencatat"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ArrowUpRight className="h-6 w-6 text-emerald-600"/> Pengiriman</h1>
          <p className="text-sm text-muted-foreground mt-1">Pembuatan Delivery Batch ke Buyer.</p>
        </div>
        <Button onClick={() => setIsOpen(true)} className="bg-emerald-600 hover:bg-emerald-700"><Send className="h-4 w-4 mr-2"/> Buat Pengiriman</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 border-b"><tr><th className="p-4">ID Delivery</th><th className="p-4">Tanggal</th><th className="p-4">Buyer Tujuan</th><th className="p-4">Total Grade A</th><th className="p-4">Status</th></tr></thead>
            <tbody>
              {pengirimans.map(p => (
                <tr key={p.id} className="border-b"><td className="p-4 font-mono text-emerald-600">{p.batch_id}</td><td className="p-4">{p.tanggal.slice(0,10)}</td><td className="p-4 font-semibold">{buyers.find(b => b.id === p.buyer)?.nama}</td><td className="p-4">{formatKg(p.qty_grade_a)}</td><td className="p-4 text-blue-600 font-medium">{p.status}</td></tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Buat Surat Jalan (Delivery)</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Tanggal Kirim</Label><Input type="date" value={form.tanggal} onChange={e=>setForm({...form, tanggal: e.target.value})} required/></div>
              <div className="space-y-1"><Label>Buyer Tujuan</Label>
                <Select value={form.buyer} onValueChange={v=>setForm({...form, buyer: v})} required>
                  <SelectTrigger><SelectValue placeholder="Pilih Buyer" /></SelectTrigger>
                  <SelectContent>{buyers.map(b => <SelectItem key={b.id} value={b.id}>{b.nama}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Kirim Grade A (Max: {currentStock.gradeA})</Label><Input type="number" value={form.qty_grade_a} onChange={e=>setForm({...form, qty_grade_a: e.target.value})}/></div>
              <div className="space-y-1"><Label>Kirim Grade B (Max: {currentStock.gradeB})</Label><Input type="number" value={form.qty_grade_b} onChange={e=>setForm({...form, qty_grade_b: e.target.value})}/></div>
            </div>
            <DialogFooter><Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">Buat Pengiriman</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}