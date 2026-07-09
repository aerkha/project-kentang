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
import { ArrowDownToLine, Plus, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import pb from "@/lib/pocketbase";

const formatKg = (n: number) => `${new Intl.NumberFormat("id-ID").format(n)} Kg`;
const formatRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

export default function PembelianPage() {
  const { bandars, pembelians, addPembelian, generatePembelianId, isLoading } = useInventory();
  const [isOpen, setIsOpen] = useState(false);
  const [fileTf, setFileTf] = useState<File | null>(null);
  
  const [form, setForm] = useState({ 
    tanggal: todayWibStr().slice(0, 10), 
    bandar: "", 
    tonase_lapangan: "", 
    tonase_gudang: "", 
    harga_per_kg: "" 
  });

  if (isLoading) return <div className="animate-pulse">Memuat...</div>;

  // Hitung preview total harga (Berdasarkan laporan tonase lapangan sesuai diagram bisnis)
  const previewTonaseL = parseFloat(form.tonase_lapangan) || 0;
  const previewHarga = parseFloat(form.harga_per_kg) || 0;
  const previewTotal = previewTonaseL * previewHarga;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const bandar = bandars.find(b => b.id === form.bandar);
    if (!bandar) return toast.error("Pilih Bandar!");
    
    try {
      const batchId = generatePembelianId(bandar.kode, form.tanggal);
      const tonaseG = parseFloat(form.tonase_gudang) || 0;

      const dataToSubmit: Record<string, any> = {
        batch_id: batchId,
        tanggal: form.tanggal + " 00:00:00",
        bandar: bandar.id,
        tonase_lapangan: previewTonaseL,
        tonase_gudang: tonaseG,
        harga_per_kg: previewHarga,
        total_harga: previewTotal,
        tujuan: "Gudang (Sortir)",
        status: "Menunggu Sortir" // <-- Pastikan teks ini ada di opsi database!
      };

      if (fileTf) {
        const formData = new FormData();
        for (const key in dataToSubmit) {
          formData.append(key, dataToSubmit[key]);
        }
        formData.append("bukti_transfer", fileTf);
        await addPembelian(formData as any);
      } else {
        await addPembelian(dataToSubmit);
      }

      toast.success("Barang masuk berhasil dicatat!"); 
      setIsOpen(false);
      setFileTf(null);
      setForm({ ...form, tonase_lapangan: "", tonase_gudang: "", harga_per_kg: "" });
      
    } catch (err: any) { 
      // 👇 TAMBAHKAN PENANGKAP ERROR DETAIL INI 👇
      console.error("Error dari PocketBase:", err.response?.data);
      
      let errorMsg = "Gagal mencatat barang masuk.";
      if (err.response?.data) {
        // Mengambil pesan error pertama dari kolom yang bermasalah
        const firstErrorKey = Object.keys(err.response.data)[0];
        if (firstErrorKey) {
          errorMsg = `Error di kolom '${firstErrorKey}': ${err.response.data[firstErrorKey].message}`;
        }
      }
      toast.error(errorMsg); 
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ArrowDownToLine className="h-6 w-6 text-primary"/> Barang Masuk</h1>
          <p className="text-sm text-muted-foreground mt-1">Penerimaan kentang dari Bandar dan pencatatan pembayaran.</p>
        </div>
        <Button onClick={() => setIsOpen(true)}><Plus className="h-4 w-4 mr-2"/> Terima Barang</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="p-4">ID Batch</th>
                  <th className="p-4">Tanggal</th>
                  <th className="p-4">Bandar</th>
                  <th className="p-4">Tonase Gudang</th>
                  <th className="p-4">Harga / Kg</th>
                  <th className="p-4">Total Harga</th>
                  <th className="p-4 text-center">Bukti TF</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {pembelians.map(p => {
                  const pAny = p as any; // Akses fleksibel untuk kolom file (bukti_transfer)
                  return (
                    <tr key={p.id} className="border-b hover:bg-muted/30">
                      <td className="p-4 font-mono text-primary font-medium">{p.batch_id}</td>
                      <td className="p-4">{p.tanggal.slice(0,10)}</td>
                      <td className="p-4 font-semibold">{bandars.find(b => b.id === p.bandar)?.nama}</td>
                      <td className="p-4 font-semibold">{formatKg(p.tonase_gudang)}</td>
                      <td className="p-4 text-muted-foreground">{formatRp(p.harga_per_kg)}</td>
                      <td className="p-4 font-semibold">{formatRp(p.total_harga)}</td>
                      <td className="p-4 text-center">
                        {pAny.bukti_transfer ? (
                          <a 
                            href={pb.files.getUrl(p, pAny.bukti_transfer)} 
                            target="_blank" 
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline bg-blue-50 px-2 py-1 rounded"
                          >
                            <ReceiptText className="w-3 h-3" /> Lihat
                          </a>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="p-4">
                        {p.status === "Selesai" ? 
                          <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium">Disortir</span> : 
                          <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full text-xs font-medium">Menunggu</span>
                        }
                      </td>
                    </tr>
                  )
                })}
                {pembelians.length === 0 && (
                  <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Belum ada catatan barang masuk</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) setFileTf(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Terima Barang dari Bandar</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Tanggal Masuk</Label><Input type="date" value={form.tanggal} onChange={e=>setForm({...form, tanggal: e.target.value})} required/></div>
              <div className="space-y-1"><Label>Bandar Asal</Label>
                <Select value={form.bandar} onValueChange={v=>setForm({...form, bandar: v})} required>
                  <SelectTrigger><SelectValue placeholder="Pilih Bandar"/></SelectTrigger>
                  <SelectContent>{bandars.map(b=><SelectItem key={b.id} value={b.id}>{b.nama}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Tonase Info Lapangan (Kg)</Label><Input type="number" value={form.tonase_lapangan} onChange={e=>setForm({...form, tonase_lapangan: e.target.value})} required/></div>
              <div className="space-y-1"><Label>Tonase Timbang Gudang (Kg)</Label><Input type="number" value={form.tonase_gudang} onChange={e=>setForm({...form, tonase_gudang: e.target.value})} required/></div>
              
              <div className="space-y-1"><Label>Harga Beli per Kg (Rp)</Label><Input type="number" value={form.harga_per_kg} onChange={e=>setForm({...form, harga_per_kg: e.target.value})} required/></div>
              <div className="space-y-1">
                <Label>Total Harga (Berdasarkan Lapangan)</Label>
                <div className="px-3 py-2 bg-muted rounded-md font-semibold text-sm h-9 flex items-center">
                  {previewTotal > 0 ? formatRp(previewTotal) : "Rp 0"}
                </div>
              </div>

              <div className="col-span-2 space-y-1">
                <Label>Unggah Bukti Transfer (Opsional)</Label>
                <Input type="file" accept="image/*,.pdf" onChange={e => setFileTf(e.target.files?.[0] || null)} />
                <p className="text-[10px] text-muted-foreground mt-1">Format yang didukung: JPG, PNG, PDF.</p>
              </div>
            </div>
            <DialogFooter><Button type="submit">Catat & Simpan</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}