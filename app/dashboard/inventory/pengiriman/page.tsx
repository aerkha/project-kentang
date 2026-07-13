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
import { Truck, Plus, Printer, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

const formatKg = (n: number) => `${new Intl.NumberFormat("id-ID").format(n || 0)} Kg`;

export default function PengirimanPage() {
  const { pengirimans, sortirs, addPengiriman, isLoading, buyers = [] } = useInventory();
  
  const [isOpen, setIsOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);

  const [form, setForm] = useState({ 
    tanggal: todayWibStr().slice(0, 10),
    batch_id: "", // Sebagai Delivery Order (DO) ID
    buyer_id: "", 
    supir: "",
    plat_nomor: "",
    qty_grade_a: "", 
    qty_grade_b: "", 
    qty_grade_c: "", 
    qty_grade_baby: "" 
  });

  if (isLoading) return <div className="animate-pulse">Memuat...</div>;

  // =========================================================================
  // LOGIKA SINKRONISASI STOK REAL-TIME
  // =========================================================================
  const totalMasuk = {
    a: sortirs.reduce((sum, s: any) => sum + (s.grade_a || 0), 0),
    b: sortirs.reduce((sum, s: any) => sum + (s.grade_b || 0), 0),
    c: sortirs.reduce((sum, s: any) => sum + (s.grade_c || 0), 0),
    baby: sortirs.reduce((sum, s: any) => sum + (s.grade_baby || 0), 0),
  };

  const totalKeluar = {
    a: pengirimans.reduce((sum, p) => sum + (p.qty_grade_a || 0), 0),
    b: pengirimans.reduce((sum, p) => sum + (p.qty_grade_b || 0), 0),
    c: pengirimans.reduce((sum, p) => sum + (p.qty_grade_c || 0), 0),
    baby: pengirimans.reduce((sum, p) => sum + (p.qty_grade_baby || 0), 0),
  };

  const stock = {
    a: Math.max(0, totalMasuk.a - totalKeluar.a),
    b: Math.max(0, totalMasuk.b - totalKeluar.b),
    c: Math.max(0, totalMasuk.c - totalKeluar.c),
    baby: Math.max(0, totalMasuk.baby - totalKeluar.baby),
  };

  const inputA = parseFloat(form.qty_grade_a) || 0;
  const inputB = parseFloat(form.qty_grade_b) || 0;
  const inputC = parseFloat(form.qty_grade_c) || 0;
  const inputBaby = parseFloat(form.qty_grade_baby) || 0;

  const isValidA = inputA <= stock.a;
  const isValidB = inputB <= stock.b;
  const isValidC = inputC <= stock.c;
  const isValidBaby = inputBaby <= stock.baby;
  
  const hasInput = inputA > 0 || inputB > 0 || inputC > 0 || inputBaby > 0;
  const isFormValid = isValidA && isValidB && isValidC && isValidBaby && hasInput && form.buyer_id !== "";

  // =========================================================================

  const generateSJId = (dateStr: string) => {
    const ym = dateStr.slice(2, 10).replace(/-/g, ""); 
    const prefix = `SJ-${ym}-`;
    const todaySJ = pengirimans.filter(p => p.sj_id?.startsWith(prefix));
    return `${prefix}${String(todaySJ.length + 1).padStart(3, "0")}`;
  };

  const generateDOId = (dateStr: string) => {
    const ym = dateStr.slice(2, 10).replace(/-/g, ""); 
    const prefix = `DO-${ym}-`;
    const todayDO = pengirimans.filter(p => p.batch_id?.startsWith(prefix));
    return `${prefix}${String(todayDO.length + 1).padStart(3, "0")}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return toast.error("Periksa kembali form. Pastikan pembeli dipilih dan stok mencukupi!");

    try {
      const newSjId = generateSJId(form.tanggal);
      
      // Jika input DO dikosongkan, sistem akan generate otomatis. Jika diisi, ikuti ketikan manual.
      const finalBatchId = form.batch_id.trim() !== "" ? form.batch_id.trim() : generateDOId(form.tanggal);
      
      const selectedBuyer = buyers.find((b: any) => b.id === form.buyer_id);
      const buyerName = selectedBuyer ? selectedBuyer.nama : "";

      await addPengiriman({
        sj_id: newSjId,
        batch_id: finalBatchId, // DO / Delivery ID yang dikembalikan fungsinya
        tanggal: form.tanggal + " 00:00:00",
        buyer: form.buyer_id,        
        tujuan: buyerName,           
        supir: form.supir,
        plat_nomor: form.plat_nomor,
        qty_grade_a: inputA,
        qty_grade_b: inputB,
        qty_grade_c: inputC,
        qty_grade_baby: inputBaby
      } as any);

      toast.success("Surat Jalan & Delivery Order berhasil dicatat!"); 
      setIsOpen(false);
      setForm({ ...form, batch_id: "", buyer_id: "", supir: "", plat_nomor: "", qty_grade_a: "", qty_grade_b: "", qty_grade_c: "", qty_grade_baby: "" });
    } catch (err: any) { 
      let errorMsg = "Gagal mencatat pengiriman.";
      if (err.response?.data) {
        const firstErrorKey = Object.keys(err.response.data)[0];
        if (firstErrorKey) errorMsg = `Error di kolom '${firstErrorKey}': ${err.response.data[firstErrorKey].message}`;
      }
      toast.error(errorMsg); 
    }
  };

  const handlePrintSJ = (dataObj: any) => {
    const d = dataObj || previewData;
    if (!d) return;

    const matchedBuyer = buyers.find((b: any) => b.id === d.buyer);
    const namaTujuan = matchedBuyer ? matchedBuyer.nama : (d.tujuan || "Tidak Diketahui");

    const items = [
      { name: "Kentang Segar - Grade A", qty: d.qty_grade_a || 0 },
      { name: "Kentang Segar - Grade B", qty: d.qty_grade_b || 0 },
      { name: "Kentang Segar - Grade C", qty: d.qty_grade_c || 0 },
      { name: "Kentang Segar - Baby", qty: d.qty_grade_baby || 0 },
    ].filter(item => item.qty > 0);

    const totalQty = items.reduce((sum, item) => sum + item.qty, 0);

    const itemsHtml = items.map((item, index) => `
      <tr>
        <td class="py-1.5 px-2 border-b border-black text-xs text-center">${index + 1}</td>
        <td class="py-1.5 px-2 border-b border-black text-xs font-medium">${item.name}</td>
        <td class="py-1.5 px-2 border-b border-black text-xs text-center font-bold">${item.qty} Kg</td>
        <td class="py-1.5 px-2 border-b border-black text-xs text-center"></td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>Surat Jalan - ${d.sj_id}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @media print {
            @page { margin: 10mm; size: A5 landscape; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body class="bg-white text-black font-sans">
        
        <div class="flex justify-between items-start border-b-2 border-black pb-2 mb-3">
          <div>
            <h1 class="text-xl font-black tracking-tight uppercase">MINBUN ERP</h1>
            <p class="text-[10px] text-gray-600">Distributor Komoditas Hasil Bumi</p>
          </div>
          <div class="text-right">
            <h2 class="text-lg font-bold text-gray-800 uppercase tracking-widest">Surat Jalan</h2>
            <p class="text-xs font-mono mt-0.5 text-gray-600">No. SJ: ${d.sj_id}</p>
            <p class="text-xs font-mono text-gray-600">Ref DO: ${d.batch_id}</p>
            <p class="text-[10px] text-gray-500 mt-0.5">Tgl: ${new Date(d.tanggal).toLocaleDateString("id-ID", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        <div class="flex justify-between mb-3">
          <div class="w-1/2">
            <p class="text-[11px] text-gray-600 mb-0.5">Kepada Yth:</p>
            <p class="text-sm font-bold uppercase">${namaTujuan}</p>
          </div>
          <div class="w-1/2 text-right">
            <p class="text-[11px] text-gray-600 mb-0.5">Informasi Pengiriman:</p>
            <p class="text-xs font-semibold">Supir: ${d.supir || '-'}</p>
            <p class="text-xs font-semibold">Plat No: <span class="uppercase">${d.plat_nomor || '-'}</span></p>
          </div>
        </div>

        <table class="w-full mb-3 border-collapse border-2 border-black">
          <thead>
            <tr class="bg-gray-100 border-b-2 border-black">
              <th class="py-1 px-2 text-center text-xs font-bold w-10 border-r border-black">No</th>
              <th class="py-1 px-2 text-left text-xs font-bold border-r border-black">Nama Barang / Deskripsi</th>
              <th class="py-1 px-2 text-center text-xs font-bold w-24 border-r border-black">Kuantitas</th>
              <th class="py-1 px-2 text-center text-xs font-bold w-32">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
            <tr class="bg-gray-50">
              <td colspan="2" class="py-1.5 px-2 text-right text-xs font-bold border-r border-black">TOTAL BERAT:</td>
              <td class="py-1.5 px-2 text-center text-xs font-black border-r border-black">${totalQty} Kg</td>
              <td></td>
            </tr>
          </tbody>
        </table>

        <div class="text-[10px] text-gray-600 mb-4 italic">
          * Mohon dicek kembali kesesuaian barang. Surat jalan ini merupakan bukti sah serah terima fisik barang.
        </div>
        
        <div class="flex justify-between text-center mt-4 px-2">
          <div class="w-1/3">
            <p class="text-xs mb-10">Penerima,</p>
            <p class="text-xs font-bold border-b border-black pb-0.5 inline-block min-w-[120px]"></p>
            <p class="text-[10px] mt-1 text-gray-500">(Nama Jelas & Cap)</p>
          </div>
          <div class="w-1/3">
            <p class="text-xs mb-10">Pengantar / Sopir,</p>
            <p class="text-xs font-bold border-b border-black pb-0.5 inline-block min-w-[120px] uppercase">${d.supir || ''}</p>
            <p class="text-[10px] mt-1 text-gray-500">(Tanda Tangan)</p>
          </div>
          <div class="w-1/3">
            <p class="text-xs mb-10">Hormat Kami,</p>
            <p class="text-xs font-bold border-b border-black pb-0.5 inline-block min-w-[120px]">Gudang MinBun</p>
            <p class="text-[10px] mt-1 text-gray-500">(Bagian Pengiriman)</p>
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
          <h1 className="text-2xl font-bold flex items-center gap-2"><Truck className="h-6 w-6 text-blue-600"/> Pengiriman Barang</h1>
          <p className="text-sm text-muted-foreground mt-1">Buat Surat Jalan dan catat pengiriman ke Mitra/Pasar.</p>
        </div>
        <Button onClick={() => setIsOpen(true)} className="bg-blue-600 hover:bg-blue-700"><Plus className="h-4 w-4 mr-2"/> Buat Pengiriman</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="p-4">Dokumen ID</th>
                  <th className="p-4">Tanggal</th>
                  <th className="p-4">Tujuan (Pembeli)</th>
                  <th className="p-4">Supir & Plat</th>
                  <th className="p-4">Total Berat</th>
                  <th className="p-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {pengirimans.map(p => {
                  const totalBerat = (p.qty_grade_a || 0) + (p.qty_grade_b || 0) + (p.qty_grade_c || 0) + (p.qty_grade_baby || 0);
                  const pAny = p as any;
                  
                  const matchedBuyer = buyers.find((b: any) => b.id === p.buyer);
                  const displayTujuan = matchedBuyer ? matchedBuyer.nama : (p.tujuan || p.buyer);

                  return (
                    <tr key={p.id} className="border-b hover:bg-muted/30">
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded w-fit border" title="Delivery Order">DO: {p.batch_id}</span>
                          <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded w-fit border border-blue-100" title="Surat Jalan">SJ: {p.sj_id || '-'}</span>
                        </div>
                      </td>
                      <td className="p-4 align-top pt-5">{p.tanggal.slice(0,10)}</td>
                      <td className="p-4 align-top pt-5 font-semibold uppercase">{displayTujuan}</td>
                      <td className="p-4 align-top pt-5">
                        <div className="flex flex-col">
                          <span className="font-medium">{p.supir || '-'}</span>
                          <span className="text-xs text-muted-foreground uppercase">{pAny.plat_nomor || '-'}</span>
                        </div>
                      </td>
                      <td className="p-4 align-top pt-5 font-semibold">{formatKg(totalBerat)}</td>
                      <td className="p-4 align-top pt-5 text-center">
                        <Button variant="outline" size="sm" onClick={() => setPreviewData(p)} className="h-8 text-xs border-blue-200 text-blue-700 hover:bg-blue-50">
                          <Printer className="w-3 h-3 mr-1.5" /> Pratinjau SJ
                        </Button>
                      </td>
                    </tr>
                  )
                })}
                {pengirimans.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Belum ada riwayat pengiriman</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Buat Surat Jalan Baru</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 mt-2">
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Tanggal Pengiriman</Label><Input type="date" value={form.tanggal} onChange={e=>setForm({...form, tanggal: e.target.value})} required/></div>
              <div className="space-y-1">
                <Label>Tujuan (Pembeli / Mitra)</Label>
                <Select value={form.buyer_id} onValueChange={v=>setForm({...form, buyer_id: v})} required>
                  <SelectTrigger className={form.buyer_id ? "" : "border-red-300 ring-red-100"}>
                    <SelectValue placeholder="Pilih Mitra/Pembeli" />
                  </SelectTrigger>
                  <SelectContent>
                    {buyers.length === 0 ? (
                      <SelectItem value="empty" disabled>Belum ada data pembeli</SelectItem>
                    ) : (
                      buyers.map((b: any) => (
                        <SelectItem key={b.id} value={b.id}>{b.nama}</SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg border">
              <div className="space-y-1">
                <Label>ID Delivery Order (DO)</Label>
                <Input type="text" value={form.batch_id} onChange={e=>setForm({...form, batch_id: e.target.value})} placeholder="Otomatis jika kosong" className="placeholder:text-[11px] font-mono text-sm" />
              </div>
              <div className="space-y-1"><Label>Nama Supir</Label><Input type="text" value={form.supir} onChange={e=>setForm({...form, supir: e.target.value})} placeholder="Contoh: Mang Udin" required/></div>
              <div className="space-y-1"><Label>Plat Nomor Kendaraan</Label><Input type="text" value={form.plat_nomor} onChange={e=>setForm({...form, plat_nomor: e.target.value})} placeholder="Contoh: D 1234 ABC" required className="uppercase"/></div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-end border-b pb-2">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Rincian Barang Keluar (Berdasarkan Stok Tersedia)</Label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                
                <div className="space-y-1.5">
                  <Label>Grade A (Kg)</Label>
                  <Input type="number" value={form.qty_grade_a} onChange={e=>setForm({...form, qty_grade_a: e.target.value})} placeholder="0" className={!isValidA ? "border-red-500 bg-red-50 focus-visible:ring-red-500" : ""} />
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground font-medium">Stok: {formatKg(stock.a)}</span>
                    {!isValidA && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Grade B (Kg)</Label>
                  <Input type="number" value={form.qty_grade_b} onChange={e=>setForm({...form, qty_grade_b: e.target.value})} placeholder="0" className={!isValidB ? "border-red-500 bg-red-50 focus-visible:ring-red-500" : ""} />
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground font-medium">Stok: {formatKg(stock.b)}</span>
                    {!isValidB && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Grade C (Kg)</Label>
                  <Input type="number" value={form.qty_grade_c} onChange={e=>setForm({...form, qty_grade_c: e.target.value})} placeholder="0" className={!isValidC ? "border-red-500 bg-red-50 focus-visible:ring-red-500" : ""} />
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground font-medium">Stok: {formatKg(stock.c)}</span>
                    {!isValidC && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Baby (Kg)</Label>
                  <Input type="number" value={form.qty_grade_baby} onChange={e=>setForm({...form, qty_grade_baby: e.target.value})} placeholder="0" className={!isValidBaby ? "border-red-500 bg-red-50 focus-visible:ring-red-500" : ""} />
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground font-medium">Stok: {formatKg(stock.baby)}</span>
                    {!isValidBaby && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                  </div>
                </div>

              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={!isFormValid} className="bg-blue-600 hover:bg-blue-700">
                {!isFormValid && (inputA > 0 || inputB > 0 || inputC > 0 || inputBaby > 0) ? "Stok Kurang / Pembeli Kosong!" : "Simpan & Buat Surat Jalan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewData} onOpenChange={() => setPreviewData(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4 border-b pb-4 sticky top-0 bg-background z-10">
            <DialogTitle>Pratinjau Surat Jalan</DialogTitle>
            <Button onClick={() => handlePrintSJ(null)} className="bg-blue-600 hover:bg-blue-700">
              <Printer className="w-4 h-4 mr-2"/> Cetak / Simpan PDF
            </Button>
          </div>
          
          {previewData && (() => {
            const matchedBuyer = buyers.find((b: any) => b.id === previewData.buyer);
            const displayTujuan = matchedBuyer ? matchedBuyer.nama : (previewData.tujuan || previewData.buyer);
            
            return (
              <div className="bg-white text-black p-6 font-sans border rounded-lg shadow-sm">
                <div className="flex justify-between items-start border-b-2 border-black pb-2 mb-4">
                  <div>
                    <h1 className="text-xl font-black tracking-tight uppercase">MINBUN ERP</h1>
                    <p className="text-[10px] text-gray-600">Distributor Komoditas Hasil Bumi</p>
                  </div>
                  <div className="text-right">
                    <h2 className="text-lg font-bold text-gray-800 uppercase tracking-widest">Surat Jalan</h2>
                    <p className="text-xs font-mono mt-0.5 text-gray-600">No. SJ: {previewData.sj_id}</p>
                    <p className="text-xs font-mono text-gray-600">Ref DO: {previewData.batch_id}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Tgl: {new Date(previewData.tanggal).toLocaleDateString("id-ID", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-between mb-4 gap-2">
                  <div className="w-full sm:w-1/2">
                    <p className="text-[11px] text-gray-600 mb-0.5">Kepada Yth:</p>
                    <p className="text-sm font-bold uppercase">{displayTujuan}</p>
                  </div>
                  <div className="w-full sm:w-1/2 sm:text-right">
                    <p className="text-[11px] text-gray-600 mb-0.5">Informasi Pengiriman:</p>
                    <p className="text-xs font-semibold">Supir: {previewData.supir || '-'}</p>
                    <p className="text-xs font-semibold">Plat No: <span className="uppercase">{previewData.plat_nomor || '-'}</span></p>
                  </div>
                </div>

                <div className="overflow-x-auto mb-4">
                  <table className="w-full min-w-[400px] border-collapse border-2 border-black">
                    <thead>
                      <tr className="bg-gray-100 border-b-2 border-black">
                        <th className="py-1 px-2 text-center text-xs font-bold w-10 border-r border-black">No</th>
                        <th className="py-1 px-2 text-left text-xs font-bold border-r border-black">Nama Barang / Deskripsi</th>
                        <th className="py-1 px-2 text-center text-xs font-bold w-24 border-r border-black">Kuantitas</th>
                        <th className="py-1 px-2 text-center text-xs font-bold w-32">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { name: "Kentang Segar - Grade A", qty: previewData.qty_grade_a || 0 },
                        { name: "Kentang Segar - Grade B", qty: previewData.qty_grade_b || 0 },
                        { name: "Kentang Segar - Grade C", qty: previewData.qty_grade_c || 0 },
                        { name: "Kentang Segar - Baby", qty: previewData.qty_grade_baby || 0 },
                      ].filter(item => item.qty > 0).map((item, index) => (
                        <tr key={index}>
                          <td className="py-1.5 px-2 border-b border-black text-xs text-center">{index + 1}</td>
                          <td className="py-1.5 px-2 border-b border-black text-xs font-medium">{item.name}</td>
                          <td className="py-1.5 px-2 border-b border-black text-xs text-center font-bold">{item.qty} Kg</td>
                          <td className="py-1.5 px-2 border-b border-black text-xs text-center"></td>
                        </tr>
                      ))}
                      <tr className="bg-gray-50">
                        <td colSpan={2} className="py-1.5 px-2 text-right text-xs font-bold border-r border-black">TOTAL BERAT:</td>
                        <td className="py-1.5 px-2 text-center text-xs font-black border-r border-black">
                          {(previewData.qty_grade_a || 0) + (previewData.qty_grade_b || 0) + (previewData.qty_grade_c || 0) + (previewData.qty_grade_baby || 0)} Kg
                        </td>
                        <td></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                <div className="flex flex-col sm:flex-row justify-between text-center mt-6 gap-4">
                  <div className="w-full sm:w-1/3">
                    <p className="text-xs mb-10">Penerima,</p>
                    <p className="text-xs font-bold border-b border-black pb-0.5 inline-block min-w-[120px]"></p>
                    <p className="text-[10px] mt-1 text-gray-500">(Nama Jelas & Cap)</p>
                  </div>
                  <div className="w-full sm:w-1/3">
                    <p className="text-xs mb-10">Pengantar / Sopir,</p>
                    <p className="text-xs font-bold border-b border-black pb-0.5 inline-block min-w-[120px] uppercase">{previewData.supir || ''}</p>
                    <p className="text-[10px] mt-1 text-gray-500">(Tanda Tangan)</p>
                  </div>
                  <div className="w-full sm:w-1/3">
                    <p className="text-xs mb-10">Hormat Kami,</p>
                    <p className="text-xs font-bold border-b border-black pb-0.5 inline-block min-w-[120px]">Gudang MinBun</p>
                    <p className="text-[10px] mt-1 text-gray-500">(Bagian Pengiriman)</p>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}