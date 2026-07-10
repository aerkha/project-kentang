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
  const [form, setForm] = useState({ 
    pembelian_id: "", 
    tanggal_sortir: todayWibStr().slice(0, 10), 
    grade_a: "", grade_b: "", grade_c: "", grade_baby: "", grade_reject: "" 
  });

  if (isLoading) return <div className="animate-pulse">Memuat...</div>;
  const unSorted = pembelians.filter(p => p.status === "Menunggu Sortir");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const pb = pembelians.find(p => p.id === form.pembelian_id);
    if (!pb) return;
    
    try {
      const a = parseFloat(form.grade_a) || 0; 
      const b = parseFloat(form.grade_b) || 0; 
      const c = parseFloat(form.grade_c) || 0;
      const baby = parseFloat(form.grade_baby) || 0; 
      const reject = parseFloat(form.grade_reject) || 0;
      
      // Kita tidak mengirim batch_id lagi, karena ID diwariskan dari pembelian_id
      await addSortir({
        pembelian_id: pb.id, 
        tanggal_sortir: form.tanggal_sortir + " 00:00:00",
        grade_a: a, grade_b: b, grade_c: c, grade_baby: baby, grade_reject: reject,
        susut: pb.tonase_gudang - (a + b + c + baby + reject),
      });
      
      toast.success("Hasil sortir berhasil dicatat!"); 
      setIsOpen(false);
      
      setForm({
        ...form,
        pembelian_id: "", grade_a: "", grade_b: "", grade_c: "", grade_baby: "", grade_reject: ""
      });

    } catch (err: any) { 
      console.error(err);
      toast.error("Gagal mencatat data sortir."); 
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CheckSquare className="h-6 w-6 text-amber-600"/> Proses Sortir</h1>
          <p className="text-sm text-muted-foreground mt-1">Pemilahan barang berdasarkan grade</p>
        </div>
        <Button onClick={() => setIsOpen(true)} className="bg-amber-600 hover:bg-amber-700"><Scale className="h-4 w-4 mr-2"/> Catat Sortir</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="p-4">Tgl Sortir</th>
                  <th className="p-4">Batch Induk (Barang Masuk)</th>
                  <th className="p-4">Grade A</th>
                  <th className="p-4">Grade B</th>
                  <th className="p-4">Grade C</th>
                  <th className="p-4">Baby</th>
                  <th className="p-4">Reject</th>
                  <th className="p-4 text-red-600">Susut</th>
                </tr>
              </thead>
              <tbody>
                {sortirs.map(s => {
                  const parentBatch = pembelians.find(p=>p.id===s.pembelian_id)?.batch_id || "UNKNOWN";
                  
                  return (
                    <tr key={s.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-4 align-top pt-5">{s.tanggal_sortir.slice(0,10)}</td>
                      
                      <td className="p-4 align-top pt-5">
                        <div className="font-mono text-primary font-semibold bg-primary/10 px-2 py-1 rounded w-fit">
                          {parentBatch}
                        </div>
                      </td>
                      
                      <td className="p-4 align-top">
                        {s.grade_a > 0 ? (
                          <div className="flex flex-col gap-1.5">
                            <span className="font-bold text-[15px] text-blue-700">{formatKg(s.grade_a)}</span>
                            <span className="text-[10px] font-mono text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded w-fit cursor-help" title={`ID Lengkap: ${parentBatch}-A`}>
                              Sub: <b>-A</b>
                            </span>
                          </div>
                        ) : <span className="text-muted-foreground pt-1 block">-</span>}
                      </td>
                      
                      <td className="p-4 align-top">
                        {s.grade_b > 0 ? (
                          <div className="flex flex-col gap-1.5">
                            <span className="font-bold text-[15px] text-emerald-700">{formatKg(s.grade_b)}</span>
                            <span className="text-[10px] font-mono text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded w-fit cursor-help" title={`ID Lengkap: ${parentBatch}-B`}>
                              Sub: <b>-B</b>
                            </span>
                          </div>
                        ) : <span className="text-muted-foreground pt-1 block">-</span>}
                      </td>

                      <td className="p-4 align-top">
                        {s.grade_c > 0 ? (
                          <div className="flex flex-col gap-1.5">
                            <span className="font-bold text-[15px] text-amber-700">{formatKg(s.grade_c)}</span>
                            <span className="text-[10px] font-mono text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded w-fit cursor-help" title={`ID Lengkap: ${parentBatch}-C`}>
                              Sub: <b>-C</b>
                            </span>
                          </div>
                        ) : <span className="text-muted-foreground pt-1 block">-</span>}
                      </td>

                      <td className="p-4 align-top">
                        {s.grade_baby > 0 ? (
                          <div className="flex flex-col gap-1.5">
                            <span className="font-bold text-[15px] text-purple-700">{formatKg(s.grade_baby)}</span>
                            <span className="text-[10px] font-mono text-purple-600 bg-purple-50 border border-purple-100 px-1.5 py-0.5 rounded w-fit cursor-help" title={`ID Lengkap: ${parentBatch}-BY`}>
                              Sub: <b>-BY</b>
                            </span>
                          </div>
                        ) : <span className="text-muted-foreground pt-1 block">-</span>}
                      </td>

                      <td className="p-4 align-top">
                        {s.grade_reject > 0 ? (
                          <div className="flex flex-col gap-1.5">
                            <span className="font-bold text-[15px] text-slate-700">{formatKg(s.grade_reject)}</span>
                            <span className="text-[10px] font-mono text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded w-fit cursor-help" title={`ID Lengkap: ${parentBatch}-RJ`}>
                              Sub: <b>-RJ</b>
                            </span>
                          </div>
                        ) : <span className="text-muted-foreground pt-1 block">-</span>}
                      </td>

                      <td className="p-4 align-top pt-5">
                        <div className="flex items-center gap-1.5 text-red-600">
                          <span className="font-bold">{formatKg(s.susut)}</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {sortirs.length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Belum ada data sortir</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Catat Hasil Sortir & Grade</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1"><Label>Batch Belum Sortir</Label>
              <Select value={form.pembelian_id} onValueChange={v=>setForm({...form, pembelian_id: v})} required>
                <SelectTrigger><SelectValue placeholder="Pilih Batch Pembelian" /></SelectTrigger>
                <SelectContent>{unSorted.map(p => <SelectItem key={p.id} value={p.id}>{p.batch_id} — {formatKg(p.tonase_gudang)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            
            <div className="p-3 bg-muted/40 rounded-md border border-border mt-2 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground border-b pb-2">Hasil Timbangan (Kosongkan jika tidak ada)</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="space-y-1"><Label>Grade A (Kg)</Label><Input type="number" value={form.grade_a} onChange={e=>setForm({...form, grade_a: e.target.value})} placeholder="0"/></div>
                <div className="space-y-1"><Label>Grade B (Kg)</Label><Input type="number" value={form.grade_b} onChange={e=>setForm({...form, grade_b: e.target.value})} placeholder="0"/></div>
                <div className="space-y-1"><Label>Grade C (Kg)</Label><Input type="number" value={form.grade_c} onChange={e=>setForm({...form, grade_c: e.target.value})} placeholder="0"/></div>
                <div className="space-y-1"><Label>Baby (Kg)</Label><Input type="number" value={form.grade_baby} onChange={e=>setForm({...form, grade_baby: e.target.value})} placeholder="0"/></div>
                <div className="space-y-1"><Label>Reject / Buang (Kg)</Label><Input type="number" value={form.grade_reject} onChange={e=>setForm({...form, grade_reject: e.target.value})} placeholder="0"/></div>
              </div>
            </div>
            
            <DialogFooter><Button type="submit" className="bg-amber-600 hover:bg-amber-700">Simpan Sortir</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}