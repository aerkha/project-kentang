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
import { ArrowDownToLine, Plus, ReceiptText, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import pb from "@/lib/pocketbase";

const formatKg = (n: number) => `${new Intl.NumberFormat("id-ID").format(n || 0)} Kg`;
const formatRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n || 0);

export default function PembelianPage() {
  const { bandars, pembelians, addPembelian, generatePembelianId, isLoading } = useInventory();
  const [isOpen, setIsOpen] = useState(false);
  const [fileTf, setFileTf] = useState<File | null>(null);
  
  const [form, setForm] = useState({ 
    tanggal: todayWibStr().slice(0, 10), 
    bandar: "", 
    tonase_lapangan: "", 
    tonase_aktual: "", // <-- Total timbangan riil 
    qty_gudang: "",    // <-- Alokasi masuk gudang
    qty_pasar: "",     // <-- Alokasi langsung ke pasar
    harga_per_kg: "" 
  });

  if (isLoading) return <div className="animate-pulse">Memuat...</div>;

  // -- KALKULASI & VALIDASI REAL-TIME --
  const tLapangan = parseFloat(form.tonase_lapangan) || 0;
  const tAktual = parseFloat(form.tonase_aktual) || 0;
  const qGudang = parseFloat(form.qty_gudang) || 0;
  const qPasar = parseFloat(form.qty_pasar) || 0;
  const harga = parseFloat(form.harga_per_kg) || 0;
  
  const totalAlokasi = qGudang + qPasar;
  const selisih = tAktual - totalAlokasi;
  const isAlokasiValid = tAktual > 0 && selisih === 0;

  // -- OTOMATISASI TUJUAN & STATUS --
  let autoTujuan = "Belum Ditentukan";
  let autoStatus = "Menunggu Sortir";

  if (qGudang > 0 && qPasar > 0) {
    autoTujuan = "Gudang & Pasar (Split)";
    autoStatus = "Menunggu Sortir"; // Karena bagian gudangnya butuh disortir
  } else if (qGudang === 0 && qPasar > 0) {
    autoTujuan = "Pasar Induk";
    autoStatus = "Langsung Kirim";
  } else if (qGudang > 0 && qPasar === 0) {
    autoTujuan = "Gudang (Sortir)";
    autoStatus = "Menunggu Sortir";
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAlokasiValid) return toast.error("Total alokasi harus sama dengan Tonase Aktual!");
    
    const bandar = bandars.find(b => b.id === form.bandar);
    if (!bandar) return toast.error("Pilih Bandar!");
    
    try {
      const batchId = generatePembelianId(bandar.kode, form.tanggal);

      const dataToSubmit: Record<string, any> = {
        batch_id: batchId,
        tanggal: form.tanggal + " 00:00:00",
        bandar: bandar.id,
        tujuan: autoTujuan,
        status: autoStatus, 
        tonase_lapangan: tLapangan,
        tonase_gudang: qGudang,     // Yg dikirim ke Sortir hanya bagian Gudang
        tonase_langsung: qPasar,    // Disimpan ke kolom baru di DB
        harga_per_kg: harga,
        total_harga: tLapangan * harga, // Pembayaran tetap berdasarkan info lapangan
      };

      if (fileTf) {
        const formData = new FormData();
        for (const key in dataToSubmit) { formData.append(key, dataToSubmit[key]); }
        formData.append("bukti_transfer", fileTf);
        await addPembelian(formData as any);
      } else {
        await addPembelian(dataToSubmit);
      }

      toast.success("Barang masuk berhasil dicatat!"); 
      setIsOpen(false);
      setFileTf(null);
      setForm({ ...form, tonase_lapangan: "", tonase_aktual: "", qty_gudang: "", qty_pasar: "", harga_per_kg: "" });
    } catch (err: any) { 
      console.error(err);
      toast.error("Gagal mencatat barang masuk. Cek kolom database di PocketBase."); 
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ArrowDownToLine className="h-6 w-6 text-primary"/> Barang Masuk</h1>
          <p className="text-sm text-muted-foreground mt-1">Pembelian dari Bandar</p>
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
                  <th className="p-4">Total Timbang</th>
                  <th className="p-4">Masuk Gudang</th>
                  <th className="p-4">Langsung Pasar</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {pembelians.map(p => {
                  const pAny = p as any;
                  const tLangsung = parseFloat(pAny.tonase_langsung) || 0;
                  const tGudang = p.tonase_gudang || 0;
                  
                  return (
                    <tr key={p.id} className="border-b hover:bg-muted/30">
                      <td className="p-4 font-mono text-primary font-medium">{p.batch_id}</td>
                      <td className="p-4">{p.tanggal.slice(0,10)}</td>
                      <td className="p-4 font-semibold">{bandars.find(b => b.id === p.bandar)?.nama}</td>
                      <td className="p-4 font-semibold">{formatKg(tGudang + tLangsung)}</td>
                      <td className="p-4 text-blue-600 font-medium">{formatKg(tGudang)}</td>
                      <td className="p-4 text-purple-600 font-medium">{formatKg(tLangsung)}</td>
                      <td className="p-4">
                        {p.status === "Selesai" ? <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium">Selesai (Disortir)</span> : 
                         p.status === "Langsung Kirim" ? <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs font-medium">Terkirim (Psr Induk)</span> :
                         <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full text-xs font-medium">Menunggu Sortir</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) setFileTf(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Terima Barang dari Bandar</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 mt-2">
            
            {/* Bagian 1: Informasi Dasar */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Tanggal Masuk</Label><Input type="date" value={form.tanggal} onChange={e=>setForm({...form, tanggal: e.target.value})} required/></div>
              <div className="space-y-1"><Label>Bandar Asal</Label>
                <Select value={form.bandar} onValueChange={v=>setForm({...form, bandar: v})} required>
                  <SelectTrigger><SelectValue placeholder="Pilih Bandar"/></SelectTrigger>
                  <SelectContent>{bandars.map(b=><SelectItem key={b.id} value={b.id}>{b.nama}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            {/* Bagian 2: Timbangan & Alokasi (Ide Split Shipment Anda) */}
            <div className="p-4 bg-slate-50 border rounded-lg space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><Label>Tonase Info Lapangan (Kg)</Label><Input type="number" value={form.tonase_lapangan} onChange={e=>setForm({...form, tonase_lapangan: e.target.value})} required/></div>
                <div className="space-y-1"><Label className="text-blue-700 font-bold">Tonase Aktual/Total Timbang (Kg)</Label><Input type="number" value={form.tonase_aktual} onChange={e=>setForm({...form, tonase_aktual: e.target.value})} className="border-blue-300 bg-blue-50" required/></div>
              </div>

              <div className="pt-2 border-t grid grid-cols-2 gap-4 relative">
                <div className="space-y-1"><Label>Alokasi: Masuk Gudang (Kg)</Label><Input type="number" value={form.qty_gudang} onChange={e=>setForm({...form, qty_gudang: e.target.value})} placeholder="0"/></div>
                <div className="space-y-1"><Label>Alokasi: Langsung Kirim (Kg)</Label><Input type="number" value={form.qty_pasar} onChange={e=>setForm({...form, qty_pasar: e.target.value})} placeholder="0"/></div>
              </div>

              {/* Teks Validasi UX */}
              {tAktual > 0 && (
                <div className={`text-xs p-2 rounded flex items-center gap-2 ${selisih === 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {selisih === 0 ? <CheckCircle2 className="w-4 h-4"/> : <AlertCircle className="w-4 h-4"/>}
                  {selisih === 0 ? "Alokasi sesuai dengan Total Timbang." : `Selisih ${Math.abs(selisih)} Kg! Total alokasi harus sama dengan Tonase Aktual.`}
                </div>
              )}
            </div>

            {/* Bagian 3: Finansial */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Harga Beli per Kg (Rp)</Label><Input type="number" value={form.harga_per_kg} onChange={e=>setForm({...form, harga_per_kg: e.target.value})} required/></div>
              <div className="space-y-1">
                <Label>Total Harga (Berdasarkan Lapangan)</Label>
                <div className="px-3 py-2 bg-muted rounded-md font-semibold text-sm h-9 flex items-center">
                  {tLapangan > 0 && harga > 0 ? formatRp(tLapangan * harga) : "Rp 0"}
                </div>
              </div>
            </div>

            {/* Bagian 4: Kesimpulan Tujuan & Bukti TF (Sesuai Permintaan Anda) */}
            <div className="p-4 bg-muted/40 border rounded-lg grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Tujuan & Status (Otomatis)</Label>
                <div className="px-3 py-2 bg-white border rounded-md text-sm font-medium h-9 flex items-center text-muted-foreground">
                  {autoTujuan}
                </div>
              </div>
              <div className="space-y-1">
                <Label>Unggah Bukti Transfer (Opsional)</Label>
                <Input type="file" accept="image/*,.pdf" onChange={e => setFileTf(e.target.files?.[0] || null)} />
              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={!isAlokasiValid && tAktual > 0}>Catat & Simpan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}