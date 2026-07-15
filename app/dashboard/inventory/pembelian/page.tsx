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
import { ArrowDownToLine, Plus, AlertCircle, CheckCircle2, Printer, Truck } from "lucide-react";
import { toast } from "sonner";

const formatKg = (n: number) => `${new Intl.NumberFormat("id-ID").format(n || 0)} Kg`;
const formatRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n || 0);

export default function PembelianPage() {
  // 👇 Hapus generatePembelianId dari sini karena kita akan menggunakan fungsi lokal
  const { bandars, pembelians, addPembelian, isLoading, addPengiriman, pengirimans, buyers = [] } = useInventory();
  
  const [isOpen, setIsOpen] = useState(false);
  const [fileTf, setFileTf] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);

  const [form, setForm] = useState({ 
    tanggal: todayWibStr().slice(0, 10), 
    bandar: "", 
    tonase_lapangan: "", 
    tonase_aktual: "", 
    qty_gudang: "",    
    qty_pasar: "",     
    harga_per_kg: "",
    tujuan_pasar: "" 
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

  // 👇 FUNGSI BARU: Generator ID Pembelian Lokal
  const generateBatchIdLocal = (tanggalStr: string, bandarKode: string) => {
    if (!tanggalStr) return "";
    
    // Ubah format menjadi YYMMDD
    const dateObj = new Date(tanggalStr);
    const yy = String(dateObj.getFullYear()).slice(-2);
    const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
    const dd = String(dateObj.getDate()).padStart(2, "0");
    const dateStr = `${yy}${mm}${dd}`;
    
    const prefixHariIni = `PB-${dateStr}`;

    // Filter SEMUA transaksi di hari ini (Abaikan kode bandar)
    const transaksiHariIni = pembelians.filter((p: any) => 
      p.batch_id && p.batch_id.startsWith(prefixHariIni)
    );

    // Nomor urut global per hari
    const urutan = transaksiHariIni.length + 1;
    const suffix = String(urutan).padStart(3, "0");

    return `${prefixHariIni}-${bandarKode}-${suffix}`;
  };

  const generateDOId = (dateStr: string) => {
    const ym = dateStr.slice(2, 10).replace(/-/g, ""); 
    const prefix = `DO-${ym}-`;
    const todayDO = pengirimans.filter(p => p.batch_id?.startsWith(prefix));
    return `${prefix}${String(todayDO.length + 1).padStart(3, "0")}`;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isAlokasiValid) return toast.error("Total alokasi harus sama dengan Tonase Aktual!");
    
    if (qPasar > 0 && form.tujuan_pasar === "") {
      return toast.error("Silakan pilih Mitra/Buyer Tujuan untuk DO Cross-Docking!");
    }

    const bandar = bandars.find(b => b.id === form.bandar);
    if (!bandar) return toast.error("Pilih Bandar!");
    
    try {
      // 👇 Gunakan Fungsi Lokal di Sini
      const batchId = generateBatchIdLocal(form.tanggal, bandar.kode);

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

      if (qPasar > 0) {
        const newDoId = generateDOId(form.tanggal);
        const selectedBuyer = buyers.find((b: any) => b.id === form.tujuan_pasar);
        const buyerName = selectedBuyer ? selectedBuyer.nama : "Cross-Docking";

        await addPengiriman({
          batch_id: newDoId,
          tanggal: form.tanggal + " 00:00:00",
          buyer: form.tujuan_pasar, 
          tujuan: buyerName,        
          qty_campur: qPasar, 
          qty_grade_a: 0, 
          qty_grade_b: 0, 
          qty_grade_c: 0, 
          qty_grade_baby: 0,
        } as any);
      }

      toast.success(qPasar > 0 ? "Barang masuk & DO otomatis berhasil dicatat!" : "Barang masuk berhasil dicatat!"); 
      setIsOpen(false);
      setFileTf(null);
      setForm({ ...form, tonase_lapangan: "", tonase_aktual: "", qty_gudang: "", qty_pasar: "", harga_per_kg: "", tujuan_pasar: "" });
    } catch (err: any) { 
      console.error("PocketBase Error Detail:", err.response?.data);
      let errorMsg = "Gagal mencatat data.";
      if (err.response?.data) {
        const firstErrorKey = Object.keys(err.response.data)[0];
        if (firstErrorKey) errorMsg = `Error DO Otomatis (Kolom '${firstErrorKey}'): ${err.response.data[firstErrorKey].message}`;
      }
      toast.error(errorMsg); 
    }
  };

  const handlePrint = (dataObj: any) => {
    const d = dataObj || previewData;
    if (!d) return;

    const html = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>Nota Terima - ${d.batch_id}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @media print {
            @page { margin: 15mm; size: A4 portrait; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body class="bg-white text-black font-sans p-8">
        <div class="flex flex-col sm:flex-row justify-between items-start border-b-2 border-black pb-4 mb-6">
          <div class="mb-4 sm:mb-0">
            <h1 class="text-3xl font-black tracking-tight uppercase">MINBUN ERP</h1>
            <p class="text-sm text-gray-600">Distributor Komoditas Hasil Bumi</p>
          </div>
          <div class="text-right">
            <h2 class="text-2xl font-bold text-gray-800 uppercase tracking-widest">Nota Terima</h2>
            <p class="text-sm font-mono mt-1 text-gray-600">ID: ${d.batch_id}</p>
            <p class="text-sm text-gray-600">Tanggal: ${new Date(d.tanggal).toLocaleDateString("id-ID", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        <div class="mb-6">
          <p class="text-sm text-gray-600 mb-1">Diterima dari Bandar:</p>
          <p class="text-lg font-bold">${d.bndr?.nama || "Tidak Diketahui"}</p>
          <p class="text-sm text-gray-600">Kode Bandar: ${d.bndr?.kode || "-"}</p>
        </div>

        <table class="w-full mb-8 border-collapse">
          <thead>
            <tr class="bg-gray-100 border-y-2 border-black">
              <th class="py-3 px-4 text-left text-sm font-bold w-10">No</th>
              <th class="py-3 px-4 text-left text-sm font-bold">Keterangan</th>
              <th class="py-3 px-4 text-right text-sm font-bold">Berat (Kg)</th>
              <th class="py-3 px-4 text-right text-sm font-bold">Harga/Kg</th>
              <th class="py-3 px-4 text-right text-sm font-bold">Total Harga</th>
            </tr>
          </thead>
          <tbody class="border-b-2 border-black">
            <tr>
              <td class="py-4 px-4 text-sm">1</td>
              <td class="py-4 px-4 text-sm">Kentang Segar (Informasi Lapangan)</td>
              <td class="py-4 px-4 text-right text-sm font-medium">${d.tonase_lapangan} Kg</td>
              <td class="py-4 px-4 text-right text-sm font-medium">${formatRp(d.harga_per_kg)}</td>
              <td class="py-4 px-4 text-right text-sm font-bold">${formatRp(d.total_harga)}</td>
            </tr>
          </tbody>
        </table>

        <div class="flex justify-between items-start mt-12 gap-8">
          <div class="text-xs text-gray-500 w-1/2">
            <p class="font-semibold text-gray-700 mb-1">Catatan Operasional:</p>
            <p>Tonase Timbang Aktual Gudang: ${d.total_aktual} Kg</p>
            <p>Masuk Gudang: ${d.tonase_gudang} Kg | Langsung Pasar: ${d.tonase_langsung || 0} Kg</p>
            <p class="mt-2 italic">*Nota ini sah sebagai bukti penerimaan barang dan dasar perhitungan pembayaran.</p>
          </div>
          
          <div class="flex gap-16 text-center w-1/2 justify-end">
            <div>
              <p class="text-sm mb-20">Pihak Bandar</p>
              <p class="text-sm font-bold border-b border-black pb-1 inline-block min-w-[120px]">${d.bndr?.nama || ""}</p>
            </div>
            <div>
              <p class="text-sm mb-20">Admin MinBun</p>
              <p class="text-sm font-bold border-b border-black pb-1 inline-block min-w-[120px]">_____________</p>
            </div>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 500);
          };
        </script>
      </body>
      </html>
    `;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, "_blank");
    if (w) w.focus();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><ArrowDownToLine className="h-6 w-6 text-primary"/> Pembelian</h1>
          <p className="text-sm text-muted-foreground mt-1">Pembelian komoditas dari supplier/petani</p>
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
                        <Button variant="outline" size="sm" onClick={() => setPreviewData({...p, total_aktual: totalAktual, bndr: bandars.find(b => b.id === p.bandar)})} className="h-8 text-xs">
                          <Printer className="w-3 h-3 mr-1.5" /> Pratinjau Nota
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

      <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) setFileTf(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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

              {qPasar > 0 && (
                <div className="pt-3 border-t mt-2 space-y-2">
                  <Label className="text-purple-700 font-bold flex items-center gap-1.5">
                    <Truck className="w-4 h-4"/> Tujuan Cross-Docking (Mitra/Pasar) <span className="text-destructive">*</span>
                  </Label>
                  <Select value={form.tujuan_pasar} onValueChange={v=>setForm({...form, tujuan_pasar: v})} required>
                    <SelectTrigger className="border-purple-300 bg-purple-50 text-purple-900 font-medium">
                      <SelectValue placeholder="Pilih Mitra/Pembeli Tujuan"/>
                    </SelectTrigger>
                    <SelectContent>
                      {buyers.length === 0 ? (
                        <SelectItem value="empty" disabled>Belum ada data Master Buyer</SelectItem>
                      ) : (
                        buyers.map((b: any) => {
                          const displayLabel = b.perusahaan ? `${b.perusahaan} (${b.nama})` : b.nama;
                          
                          return (
                            <SelectItem key={b.id} value={b.id}>
                              {displayLabel}
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-[10.5px] text-muted-foreground italic">Pilihan ini akan otomatis membuat Delivery Order (DO) atas nama pembeli ini.</p>
                </div>
              )}

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

      <Dialog open={!!previewData} onOpenChange={() => setPreviewData(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4 border-b pb-4 sticky top-0 bg-background z-10">
            <DialogTitle>Pratinjau Nota Terima</DialogTitle>
            <Button onClick={() => handlePrint(null)} className="bg-blue-600 hover:bg-blue-700">
              <Printer className="w-4 h-4 mr-2"/> Cetak / Simpan PDF
            </Button>
          </div>
          
          {previewData && (
            <div className="bg-white text-black p-6 sm:p-8 font-sans border rounded-lg shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-black pb-4 mb-6">
                <div className="mb-4 sm:mb-0">
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase">MINBUN ERP</h1>
                  <p className="text-sm text-gray-600">Distributor Komoditas Hasil Bumi</p>
                </div>
                <div className="sm:text-right">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-800 uppercase tracking-widest">Nota Terima</h2>
                  <p className="text-sm font-mono mt-1 text-gray-600">ID: {previewData.batch_id}</p>
                  <p className="text-sm text-gray-600">Tanggal: {new Date(previewData.tanggal).toLocaleDateString("id-ID", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
              </div>

              <div className="mb-6">
                <p className="text-sm text-gray-600 mb-1">Diterima dari Bandar:</p>
                <p className="text-lg font-bold">{previewData.bndr?.nama || "Tidak Diketahui"}</p>
                <p className="text-sm text-gray-600">Kode Bandar: {previewData.bndr?.kode || "-"}</p>
              </div>

              <div className="overflow-x-auto mb-6">
                <table className="w-full min-w-[500px] border-collapse">
                  <thead>
                    <tr className="bg-gray-100 border-y-2 border-black">
                      <th className="py-2 px-3 text-left text-sm font-bold w-10">No</th>
                      <th className="py-2 px-3 text-left text-sm font-bold">Keterangan</th>
                      <th className="py-2 px-3 text-right text-sm font-bold">Berat (Kg)</th>
                      <th className="py-2 px-3 text-right text-sm font-bold">Harga/Kg</th>
                      <th className="py-2 px-3 text-right text-sm font-bold">Total Harga</th>
                    </tr>
                  </thead>
                  <tbody className="border-b-2 border-black">
                    <tr>
                      <td className="py-3 px-3 text-sm">1</td>
                      <td className="py-3 px-3 text-sm">Kentang Segar (Info Lapangan)</td>
                      <td className="py-3 px-3 text-right text-sm font-medium">{previewData.tonase_lapangan} Kg</td>
                      <td className="py-3 px-3 text-right text-sm font-medium">{formatRp(previewData.harga_per_kg)}</td>
                      <td className="py-3 px-3 text-right text-sm font-bold">{formatRp(previewData.total_harga)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col sm:flex-row justify-between items-start mt-8 gap-8">
                <div className="text-xs text-gray-500 w-full sm:w-1/2">
                  <p className="font-semibold text-gray-700 mb-1">Catatan Operasional:</p>
                  <p>Tonase Timbang Aktual Gudang: {previewData.total_aktual} Kg</p>
                  <p>Masuk Gudang: {previewData.tonase_gudang} Kg | Langsung Pasar: {previewData.tonase_langsung || 0} Kg</p>
                  <p className="mt-2 italic">*Nota ini sah sebagai bukti penerimaan barang dan dasar perhitungan pembayaran.</p>
                </div>
                
                <div className="flex gap-8 sm:gap-16 text-center w-full sm:w-auto justify-around sm:justify-end">
                  <div>
                    <p className="text-sm mb-12 sm:mb-16">Pihak Bandar</p>
                    <p className="text-sm font-bold border-b border-black pb-1 inline-block min-w-[100px] sm:min-w-[120px]">{previewData.bndr?.nama}</p>
                  </div>
                  <div>
                    <p className="text-sm mb-12 sm:mb-16">Admin MinBun</p>
                    <p className="text-sm font-bold border-b border-black pb-1 inline-block min-w-[100px] sm:min-w-[120px]">_____________</p>
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