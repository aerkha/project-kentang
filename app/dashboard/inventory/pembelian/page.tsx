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
import { ArrowDownToLine, Plus, ReceiptText, AlertCircle, CheckCircle2, Printer } from "lucide-react";
import { toast } from "sonner";
import pb from "@/lib/pocketbase";

const formatKg = (n: number) => `${new Intl.NumberFormat("id-ID").format(n || 0)} Kg`;
const formatRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n || 0);

export default function PembelianPage() {
  const { bandars, pembelians, addPembelian, generatePembelianId, isLoading } = useInventory();
  const [isOpen, setIsOpen] = useState(false);
  const [fileTf, setFileTf] = useState<File | null>(null);
  
  // State untuk menyimpan data yang akan dicetak
  const [printData, setPrintData] = useState<any>(null);

  const [form, setForm] = useState({ 
    tanggal: todayWibStr().slice(0, 10), 
    bandar: "", 
    tonase_lapangan: "", 
    tonase_aktual: "", 
    qty_gudang: "",    
    qty_pasar: "",     
    harga_per_kg: "" 
  });

  if (isLoading) return <div className="animate-pulse">Memuat...</div>;

  const tLapangan = parseFloat(form.tonase_lapangan) || 0;
  const tAktual = parseFloat(form.tonase_aktual) || 0;
  const qGudang = parseFloat(form.qty_gudang) || 0;
  const qPasar = parseFloat(form.qty_pasar) || 0;
  const harga = parseFloat(form.harga_per_kg) || 0;
  
  const totalAlokasi = qGudang + qPasar;
  const selisih = tAktual - totalAlokasi;
  const isAlokasiValid = tAktual > 0 && selisih === 0;

  let autoTujuan = "Belum Ditentukan";
  let autoStatus = "Menunggu Sortir";

  if (qGudang > 0 && qPasar > 0) {
    autoTujuan = "Gudang & Pasar (Split)";
    autoStatus = "Menunggu Sortir"; 
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
        tonase_gudang: qGudang,     
        tonase_langsung: qPasar,    
        harga_per_kg: harga,
        total_harga: tLapangan * harga,
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
      let errorMsg = "Gagal mencatat barang masuk.";
      if (err.response?.data) {
        const firstErrorKey = Object.keys(err.response.data)[0];
        if (firstErrorKey) errorMsg = `Error di kolom '${firstErrorKey}': ${err.response.data[firstErrorKey].message}`;
      }
      toast.error(errorMsg); 
    }
  };

  // Fungsi untuk memicu print browser
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Tombol Halaman (Hanya Tampil di Layar, Hilang Saat Print) */}
      <div className="flex justify-between items-center print:hidden">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ArrowDownToLine className="h-6 w-6 text-primary"/> Barang Masuk</h1>
          <p className="text-sm text-muted-foreground mt-1">Penerimaan dari Bandar ke Gudang atau Langsung Pasar Induk.</p>
        </div>
        <Button onClick={() => setIsOpen(true)}><Plus className="h-4 w-4 mr-2"/> Terima Barang</Button>
      </div>

      {/* Tabel Utama (Hanya Tampil di Layar, Hilang Saat Print) */}
      <Card className="print:hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="p-4">ID Batch</th>
                  <th className="p-4">Tanggal</th>
                  <th className="p-4">Bandar</th>
                  <th className="p-4">Total Timbang</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {pembelians.map(p => {
                  const pAny = p as any;
                  const tLangsung = pAny.tonase_langsung || 0;
                  const tGudang = p.tonase_gudang || 0;
                  const totalAktual = tGudang + tLangsung;
                  
                  return (
                    <tr key={p.id} className="border-b hover:bg-muted/30">
                      <td className="p-4 font-mono text-primary font-medium">{p.batch_id}</td>
                      <td className="p-4">{p.tanggal.slice(0,10)}</td>
                      <td className="p-4 font-semibold">{bandars.find(b => b.id === p.bandar)?.nama}</td>
                      <td className="p-4 font-semibold">{formatKg(totalAktual)}</td>
                      <td className="p-4">
                        {p.status === "Selesai" ? <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium">Selesai (Disortir)</span> : 
                         p.status === "Langsung Kirim" ? <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded-full text-xs font-medium">Terkirim (Psr Induk)</span> :
                         <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded-full text-xs font-medium">Menunggu Sortir</span>}
                      </td>
                      <td className="p-4 text-center">
                        <Button variant="outline" size="sm" onClick={() => setPrintData({...p, total_aktual: totalAktual, bndr: bandars.find(b => b.id === p.bandar)})} className="h-8 text-xs">
                          <Printer className="w-3 h-3 mr-1.5" /> Cetak Nota
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* MODAL FORM INPUT (Hidden on Print) */}
      <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) setFileTf(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto print:hidden">
          <DialogHeader><DialogTitle>Terima Barang dari Bandar</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 mt-2">
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Tanggal Masuk</Label><Input type="date" value={form.tanggal} onChange={e=>setForm({...form, tanggal: e.target.value})} required/></div>
              <div className="space-y-1"><Label>Bandar Asal</Label>
                <Select value={form.bandar} onValueChange={v=>setForm({...form, bandar: v})} required>
                  <SelectTrigger><SelectValue placeholder="Pilih Bandar"/></SelectTrigger>
                  <SelectContent>{bandars.map(b=><SelectItem key={b.id} value={b.id}>{b.nama}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border rounded-lg space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1"><Label>Tonase Info Lapangan (Kg)</Label><Input type="number" value={form.tonase_lapangan} onChange={e=>setForm({...form, tonase_lapangan: e.target.value})} required/></div>
                <div className="space-y-1"><Label className="text-blue-700 font-bold">Tonase Aktual/Total (Kg)</Label><Input type="number" value={form.tonase_aktual} onChange={e=>setForm({...form, tonase_aktual: e.target.value})} className="border-blue-300 bg-blue-50" required/></div>
              </div>

              <div className="pt-2 border-t grid grid-cols-2 gap-4 relative">
                <div className="space-y-1"><Label>Alokasi: Masuk Gudang (Kg)</Label><Input type="number" value={form.qty_gudang} onChange={e=>setForm({...form, qty_gudang: e.target.value})} placeholder="0"/></div>
                <div className="space-y-1"><Label>Alokasi: Langsung Kirim (Kg)</Label><Input type="number" value={form.qty_pasar} onChange={e=>setForm({...form, qty_pasar: e.target.value})} placeholder="0"/></div>
              </div>

              {tAktual > 0 && (
                <div className={`text-xs p-2 rounded flex items-center gap-2 ${selisih === 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {selisih === 0 ? <CheckCircle2 className="w-4 h-4"/> : <AlertCircle className="w-4 h-4"/>}
                  {selisih === 0 ? "Alokasi pas." : `Selisih ${Math.abs(selisih)} Kg!`}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Harga Beli per Kg (Rp)</Label><Input type="number" value={form.harga_per_kg} onChange={e=>setForm({...form, harga_per_kg: e.target.value})} required/></div>
              <div className="space-y-1">
                <Label>Total Harga (Berdasarkan Lapangan)</Label>
                <div className="px-3 py-2 bg-muted rounded-md font-semibold text-sm h-9 flex items-center">
                  {tLapangan > 0 && harga > 0 ? formatRp(tLapangan * harga) : "Rp 0"}
                </div>
              </div>
            </div>

            <div className="p-4 bg-muted/40 border rounded-lg grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Tujuan & Status</Label><div className="px-3 py-2 bg-white border rounded-md text-sm font-medium h-9 flex items-center text-muted-foreground">{autoTujuan}</div></div>
              <div className="space-y-1"><Label>Unggah Bukti Transfer</Label><Input type="file" accept="image/*,.pdf" onChange={e => setFileTf(e.target.files?.[0] || null)} /></div>
            </div>

            <DialogFooter><Button type="submit" disabled={!isAlokasiValid && tAktual > 0}>Catat & Simpan</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* AREA PRINT NOTA (Hanya tampil di dalam modal atau saat diprint) */}
      {/* ================================================================= */}
      
      {/* CSS Khusus agar area ini tercetak layar penuh saat window.print() dipanggil */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * { visibility: hidden; }
          #print-area, #print-area * { visibility: visible; }
          #print-area { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
          .print-hide { display: none !important; }
        }
      `}} />

      <Dialog open={!!printData} onOpenChange={() => setPrintData(null)}>
        <DialogContent className="max-w-3xl print-hide">
          <div className="flex justify-between items-center mb-4 border-b pb-4">
            <DialogTitle>Pratinjau Nota Terima</DialogTitle>
            <Button onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700"><Printer className="w-4 h-4 mr-2"/> Print / PDF</Button>
          </div>
          
          {/* Bagian ini yang akan ditangkap oleh printer */}
          {printData && (
            <div id="print-area" className="bg-white text-black p-8 font-sans border rounded-lg shadow-sm">
              <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
                <div>
                  <h1 className="text-3xl font-black tracking-tight uppercase">MINBUN ERP</h1>
                  <p className="text-sm text-gray-600">Distributor Komoditas Hasil Bumi</p>
                </div>
                <div className="text-right">
                  <h2 className="text-2xl font-bold text-gray-800 uppercase tracking-widest">Nota Terima</h2>
                  <p className="text-sm font-mono mt-1 text-gray-600">ID: {printData.batch_id}</p>
                  <p className="text-sm text-gray-600">Tanggal: {new Date(printData.tanggal).toLocaleDateString("id-ID", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
              </div>

              <div className="mb-8">
                <p className="text-sm text-gray-600 mb-1">Diterima dari Bandar:</p>
                <p className="text-lg font-bold">{printData.bndr?.nama || "Tidak Diketahui"}</p>
                <p className="text-sm text-gray-600">Kode Bandar: {printData.bndr?.kode || "-"}</p>
              </div>

              <table className="w-full mb-8 border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-y-2 border-black">
                    <th className="py-3 px-4 text-left text-sm font-bold w-10">No</th>
                    <th className="py-3 px-4 text-left text-sm font-bold">Keterangan</th>
                    <th className="py-3 px-4 text-right text-sm font-bold">Berat (Kg)</th>
                    <th className="py-3 px-4 text-right text-sm font-bold">Harga/Kg</th>
                    <th className="py-3 px-4 text-right text-sm font-bold">Total Harga</th>
                  </tr>
                </thead>
                <tbody className="border-b-2 border-black">
                  <tr>
                    <td className="py-4 px-4 text-sm">1</td>
                    <td className="py-4 px-4 text-sm">Kentang Segar (Informasi Lapangan)</td>
                    <td className="py-4 px-4 text-right text-sm font-medium">{printData.tonase_lapangan} Kg</td>
                    <td className="py-4 px-4 text-right text-sm font-medium">{formatRp(printData.harga_per_kg)}</td>
                    <td className="py-4 px-4 text-right text-sm font-bold">{formatRp(printData.total_harga)}</td>
                  </tr>
                </tbody>
              </table>

              <div className="flex justify-between items-start mt-12">
                <div className="text-xs text-gray-500 w-1/2">
                  <p className="font-semibold text-gray-700 mb-1">Catatan Operasional:</p>
                  <p>Tonase Timbang Aktual Gudang: {printData.total_aktual} Kg</p>
                  <p>Masuk Gudang: {printData.tonase_gudang} Kg | Langsung Pasar: {printData.tonase_langsung || 0} Kg</p>
                  <p className="mt-2 italic">*Nota ini sah sebagai bukti penerimaan barang dan dasar perhitungan pembayaran.</p>
                </div>
                
                <div className="flex gap-16 text-center">
                  <div>
                    <p className="text-sm mb-16">Pihak Bandar</p>
                    <p className="text-sm font-bold border-b border-black pb-1 inline-block min-w-[120px]">{printData.bndr?.nama}</p>
                  </div>
                  <div>
                    <p className="text-sm mb-16">Admin MinBun</p>
                    <p className="text-sm font-bold border-b border-black pb-1 inline-block min-w-[120px]">_____________</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}