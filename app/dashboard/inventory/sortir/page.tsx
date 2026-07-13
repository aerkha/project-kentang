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
import { CheckSquare, Scale, AlertTriangle } from "lucide-react";
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

  // 1. Ambil data pembelian/batch yang sedang dipilih di form
  const selectedPembelian = pembelians.find((p: any) => p.id === form.pembelian_id);
  const mentahBatch = selectedPembelian?.tonase_gudang || 0;

  // 2. Filter riwayat sortir yang menggunakan pembelian_id yang sama persis
  const sortedInBatch = sortirs.filter((s: any) => s.pembelian_id === form.pembelian_id);

  // 3. Hitung total yang sudah disortir (Grade + Reject/Susut) pada batch ini sebelumnya
  const totalSudahDisortirBatch = sortedInBatch.reduce((sum, s: any) => {
    return sum + (s.grade_a || 0) + (s.grade_b || 0) + (s.grade_c || 0) + (s.grade_baby || 0) + (s.reject || s.susut || 0);
  }, 0);

  // 4. Sisa kentang mentah murni untuk batch ini
  const sisaBelumDisortir = Math.max(0, mentahBatch - totalSudahDisortirBatch);

  // 5. Kalkulasi inputan form sortir saat ini
  const inputA = parseFloat(form.grade_a) || 0;
  const inputB = parseFloat(form.grade_b) || 0;
  const inputC = parseFloat(form.grade_c) || 0;
  const inputBaby = parseFloat(form.grade_baby) || 0;
  const inputReject = parseFloat(form.grade_reject) || 0;
  
  const totalInputSekarang = inputA + inputB + inputC + inputBaby + inputReject;

  // 6. Validasi Guard Per Batch
  const isValidSortir = form.pembelian_id !== "" && totalInputSekarang > 0 && totalInputSekarang <= sisaBelumDisortir;

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
      
      await addSortir({
        pembelian_id: pb.id, 
        tanggal_sortir: form.tanggal_sortir + " 00:00:00",
        grade_a: a, grade_b: b, grade_c: c, grade_baby: baby, grade_reject: reject,
        susut: pb.tonase_gudang - (a + b + c + baby + reject),
      });
      
      toast.success("Hasil sortir berhasil dicatat!"); 
      setIsOpen(false);
      setForm({ ...form, pembelian_id: "", grade_a: "", grade_b: "", grade_c: "", grade_baby: "", grade_reject: "" });
    } catch (err: any) {
      // 👇 RADAR ERROR AKTIF 👇
      console.error("PocketBase Error Detail Sortir:", err.response?.data);
      let errorMsg = "Gagal mencatat data sortir.";
      if (err.response?.data) {
        const firstErrorKey = Object.keys(err.response.data)[0];
        if (firstErrorKey) {
          errorMsg = `Error DB (Kolom '${firstErrorKey}'): ${err.response.data[firstErrorKey].message}`;
        }
      }
      toast.error(errorMsg);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CheckSquare className="h-6 w-6 text-amber-600"/> Proses Sortir</h1>
          <p className="text-sm text-muted-foreground mt-1">Ringkasan hasil pemecahan batch komoditas dan kalkulasi penyusutan.</p>
        </div>
        <Button onClick={() => setIsOpen(true)} className="bg-amber-600 hover:bg-amber-700"><Scale className="h-4 w-4 mr-2"/> Catat Sortir</Button>
      </div>

      <Card className="border-border/60 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-muted/60 border-b text-muted-foreground font-medium">
                <tr>
                  <th className="p-4">Tanggal Sortir</th>
                  <th className="p-4">Batch Induk</th>
                  <th className="p-4">Sub-Batch ID</th>
                  <th className="p-4">Berat (Kg)</th>
                  <th className="p-4 text-right">Penyusutan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {sortirs.map(s => {
                  const parentBatch = pembelians.find(p=>p.id===s.pembelian_id)?.batch_id || "UNKNOWN";
                  
                  // Filter array hanya untuk grade yang memiliki nilai timbangan di atas 0
                  const activeGrades = [
                    { label: "Grade A", qty: s.grade_a, suffix: "-A", color: "text-blue-700 bg-blue-50 border-blue-100" },
                    { label: "Grade B", qty: s.grade_b, suffix: "-B", color: "text-emerald-700 bg-emerald-50 border-emerald-100" },
                    { label: "Grade C", qty: s.grade_c, suffix: "-C", color: "text-amber-700 bg-amber-50 border-amber-100" },
                    { label: "Baby", qty: s.grade_baby, suffix: "-BY", color: "text-purple-700 bg-purple-50 border-purple-100" },
                    { label: "Reject", qty: s.grade_reject, suffix: "-RJ", color: "text-slate-700 bg-slate-100 border-slate-200" },
                  ].filter(g => g.qty > 0);

                  return (
                    <tr key={s.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-4 align-top font-medium text-foreground/80 pt-5">{s.tanggal_sortir.slice(0,10)}</td>
                      
                      <td className="p-4 align-top pt-5">
                        <div className="font-mono text-xs font-semibold text-primary bg-primary/5 border border-primary/10 px-2.5 py-1.5 rounded w-fit">
                          {parentBatch}
                        </div>
                      </td>
                      
                      {/* KOLOM SUB-BATCH ID */}
                      <td className="p-4 align-top">
                        <div className="flex flex-col gap-2">
                          {activeGrades.map((grade, idx) => (
                            <div key={idx} className="h-7 flex items-center font-mono text-[11px] bg-muted/30 border px-2.5 rounded w-fit text-muted-foreground">
                              {parentBatch}<strong className="text-foreground ml-0.5">{grade.suffix}</strong>
                            </div>
                          ))}
                        </div>
                      </td>
                      
                      {/* KOLOM BERAT (KG) */}
                      <td className="p-4 align-top">
                        <div className="flex flex-col gap-2">
                          {activeGrades.map((grade, idx) => (
                            <div key={idx} className={`h-7 flex items-center px-2.5 rounded-md text-xs font-bold w-fit border shadow-sm ${grade.color}`}>
                              <span className="w-16 inline-block">{formatKg(grade.qty)}</span>
                              <span className="ml-1 opacity-70 font-normal">({grade.label})</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      
                      <td className="p-4 align-top text-right pt-5">
                        <div className="inline-flex items-center gap-1.5 font-bold text-red-600 bg-red-50/60 border border-red-100 px-2.5 py-1.5 rounded text-xs">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {formatKg(s.susut)}
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {sortirs.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Belum ada data riwayat sortir</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Catat Hasil Sortir & Grade</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 mt-2">
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-md mb-4 flex justify-between items-center">
              <span className="text-sm text-blue-800 font-medium">Sisa Komoditas Siap Sortir:</span>
              <span className="text-lg font-bold text-blue-900">{sisaBelumDisortir} Kg</span>
            </div>

            {totalInputSekarang > sisaBelumDisortir && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-md mb-4 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Input hasil sortir ({totalInputSekarang} Kg) melebihi stok mentah di gudang!
              </div>
            )}
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
            
            <DialogFooter>
              <Button type="submit" disabled={!isValidSortir} className="bg-blue-600 hover:bg-blue-700">
                {!isValidSortir && totalInputSekarang > 0 ? "Batas Stok Terlampaui!" : "Simpan Hasil Sortir"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}