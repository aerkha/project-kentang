"use client";

import { useState } from "react";
import { useInventory } from "@/lib/inventory-context";
import { todayWibStr } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Truck, Plus, Printer } from "lucide-react";
import { toast } from "sonner";

const formatKg = (n: number) => `${new Intl.NumberFormat("id-ID").format(n || 0)} Kg`;

export default function PengirimanPage() {
  const { pengirimans, addPengiriman, isLoading } = useInventory();
  const [isOpen, setIsOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);

  const [form, setForm] = useState({ 
    tanggal: todayWibStr().slice(0, 10), 
    tujuan: "", 
    supir: "",
    plat_nomor: "",
    grade_a: "", 
    grade_b: "", 
    grade_c: "", 
    grade_baby: "" 
  });

  if (isLoading) return <div className="animate-pulse">Memuat...</div>;

  // Fungsi generate ID Surat Jalan (Contoh: SJ-260713-001)
  const generateSJId = (dateStr: string) => {
    const ym = dateStr.slice(2, 10).replace(/-/g, ""); 
    const prefix = `SJ-${ym}-`;
    const todaySJ = pengirimans.filter(p => p.sj_id?.startsWith(prefix));
    return `${prefix}${String(todaySJ.length + 1).padStart(3, "0")}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const a = parseFloat(form.grade_a) || 0;
      const b = parseFloat(form.grade_b) || 0;
      const c = parseFloat(form.grade_c) || 0;
      const baby = parseFloat(form.grade_baby) || 0;
      
      if (a + b + c + baby === 0) return toast.error("Minimal satu grade harus diisi!");

      const newSjId = generateSJId(form.tanggal);

      await addPengiriman({
        sj_id: newSjId,
        tanggal: form.tanggal + " 00:00:00",
        tujuan: form.tujuan,
        supir: form.supir,
        plat_nomor: form.plat_nomor,
        grade_a: a,
        grade_b: b,
        grade_c: c,
        grade_baby: baby,
        status: "Terkirim"
      });

      toast.success("Surat Jalan berhasil dibuat!"); 
      setIsOpen(false);
      setForm({ ...form, tujuan: "", supir: "", plat_nomor: "", grade_a: "", grade_b: "", grade_c: "", grade_baby: "" });
    } catch (err: any) { 
      toast.error("Gagal mencatat pengiriman. Cek kolom di PocketBase."); 
    }
  };

  // =========================================================================
  // LOGIKA CETAK SURAT JALAN (TANPA HARGA, DENGAN TAB BARU)
  // =========================================================================
  const handlePrintSJ = (dataObj: any) => {
    const d = dataObj || previewData;
    if (!d) return;

    // Filter baris barang yang jumlahnya > 0
    const items = [
      { name: "Kentang Segar - Grade A", qty: d.grade_a || 0 },
      { name: "Kentang Segar - Grade B", qty: d.grade_b || 0 },
      { name: "Kentang Segar - Grade C", qty: d.grade_c || 0 },
      { name: "Kentang Segar - Baby", qty: d.grade_baby || 0 },
    ].filter(item => item.qty > 0);

    const totalQty = items.reduce((sum, item) => sum + item.qty, 0);

    const itemsHtml = items.map((item, index) => `
      <tr>
        <td class="py-3 px-4 border-b border-black text-sm text-center">${index + 1}</td>
        <td class="py-3 px-4 border-b border-black text-sm font-medium">${item.name}</td>
        <td class="py-3 px-4 border-b border-black text-sm text-center font-bold">${item.qty} Kg</td>
        <td class="py-3 px-4 border-b border-black text-sm text-center"></td>
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
            @page { margin: 15mm; size: A5 landscape; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body class="bg-white text-black font-sans p-6">
        <div class="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
          <div>
            <h1 class="text-2xl font-black tracking-tight uppercase">MINBUN ERP</h1>
            <p class="text-xs text-gray-600">Distributor Komoditas Hasil Bumi</p>
          </div>
          <div class="text-right">
            <h2 class="text-2xl font-bold text-gray-800 uppercase tracking-widest">Surat Jalan</h2>
            <p class="text-sm font-mono mt-1 text-gray-600">No. SJ: ${d.sj_id}</p>
            <p class="text-sm text-gray-600">Tanggal: ${new Date(d.tanggal).toLocaleDateString("id-ID", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
        </div>

        <div class="flex justify-between mb-6">
          <div class="w-1/2">
            <p class="text-sm text-gray-600 mb-1">Kepada Yth:</p>
            <p class="text-lg font-bold uppercase">${d.tujuan}</p>
          </div>
          <div class="w-1/2 text-right">
            <p class="text-sm text-gray-600 mb-1">Informasi Pengiriman:</p>
            <p class="text-sm font-semibold">Supir: ${d.supir || '-'}</p>
            <p class="text-sm font-semibold">Plat No: <span class="uppercase">${d.plat_nomor || '-'}</span></p>
          </div>
        </div>

        <table class="w-full mb-6 border-collapse border-2 border-black">
          <thead>
            <tr class="bg-gray-100 border-b-2 border-black">
              <th class="py-2 px-4 text-center text-sm font-bold w-12 border-r border-black">No</th>
              <th class="py-2 px-4 text-left text-sm font-bold border-r border-black">Nama Barang / Deskripsi</th>
              <th class="py-2 px-4 text-center text-sm font-bold w-32 border-r border-black">Kuantitas</th>
              <th class="py-2 px-4 text-center text-sm font-bold w-48">Keterangan</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
            <tr class="bg-gray-50">
              <td colspan="2" class="py-3 px-4 text-right text-sm font-bold border-r border-black">TOTAL BERAT:</td>
              <td class="py-3 px-4 text-center text-sm font-black border-r border-black">${totalQty} Kg</td>
              <td></td>
            </tr>
          </tbody>
        </table>

        <div class="text-xs text-gray-600 mb-8 italic">
          * Mohon dicek kembali kesesuaian barang. Surat jalan ini merupakan bukti sah serah terima fisik barang.
        </div>
        
        <div class="flex justify-between text-center mt-8 px-4">
          <div class="w-1/3">
            <p class="text-sm mb-16">Penerima,</p>
            <p class="text-sm font-bold border-b border-black pb-1 inline-block min-w-[150px]"></p>
            <p class="text-xs mt-1 text-gray-500">(Nama Jelas & Cap)</p>
          </div>
          <div class="w-1/3">
            <p class="text-sm mb-16">Pengantar / Sopir,</p>
            <p class="text-sm font-bold border-b border-black pb-1 inline-block min-w-[150px] uppercase">${d.supir || ''}</p>
            <p class="text-xs mt-1 text-gray-500">(Tanda Tangan)</p>
          </div>
          <div class="w-1/3">
            <p class="text-sm mb-16">Hormat Kami,</p>
            <p class="text-sm font-bold border-b border-black pb-1 inline-block min-w-[150px]">Gudang MinBun</p>
            <p class="text-xs mt-1 text-gray-500">(Bagian Pengiriman)</p>
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
                  <th className="p-4">No. SJ</th>
                  <th className="p-4">Tanggal</th>
                  <th className="p-4">Tujuan</th>
                  <th className="p-4">Supir & Plat</th>
                  <th className="p-4">Total Berat</th>
                  <th className="p-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {pengirimans.map(p => {
                  const totalBerat = (p.grade_a || 0) + (p.grade_b || 0) + (p.grade_c || 0) + (p.grade_baby || 0);
                  const pAny = p as any;
                  return (
                    <tr key={p.id} className="border-b hover:bg-muted/30">
                      <td className="p-4 font-mono text-blue-700 font-bold">{pAny.sj_id || '-'}</td>
                      <td className="p-4">{p.tanggal.slice(0,10)}</td>
                      <td className="p-4 font-semibold uppercase">{pAny.tujuan}</td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="font-medium">{pAny.supir || '-'}</span>
                          <span className="text-xs text-muted-foreground uppercase">{pAny.plat_nomor || '-'}</span>
                        </div>
                      </td>
                      <td className="p-4 font-semibold">{formatKg(totalBerat)}</td>
                      <td className="p-4 text-center">
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

      {/* FORM MODAL - BUAT SURAT JALAN */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Buat Surat Jalan Baru</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 mt-2">
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Tanggal Pengiriman</Label><Input type="date" value={form.tanggal} onChange={e=>setForm({...form, tanggal: e.target.value})} required/></div>
              <div className="space-y-1"><Label>Tujuan (Mitra / Pasar)</Label><Input type="text" value={form.tujuan} onChange={e=>setForm({...form, tujuan: e.target.value})} placeholder="Contoh: Pasar Induk Kramat Jati" required/></div>
            </div>

            <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border">
              <div className="space-y-1"><Label>Nama Supir</Label><Input type="text" value={form.supir} onChange={e=>setForm({...form, supir: e.target.value})} placeholder="Contoh: Mang Udin" required/></div>
              <div className="space-y-1"><Label>Plat Nomor Kendaraan</Label><Input type="text" value={form.plat_nomor} onChange={e=>setForm({...form, plat_nomor: e.target.value})} placeholder="Contoh: D 1234 ABC" required className="uppercase"/></div>
            </div>

            <div className="space-y-3">
              <Label className="text-xs uppercase tracking-widest text-muted-foreground">Rincian Barang Keluar (Isi yang dikirim saja)</Label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1"><Label>Grade A (Kg)</Label><Input type="number" value={form.grade_a} onChange={e=>setForm({...form, grade_a: e.target.value})} placeholder="0"/></div>
                <div className="space-y-1"><Label>Grade B (Kg)</Label><Input type="number" value={form.grade_b} onChange={e=>setForm({...form, grade_b: e.target.value})} placeholder="0"/></div>
                <div className="space-y-1"><Label>Grade C (Kg)</Label><Input type="number" value={form.grade_c} onChange={e=>setForm({...form, grade_c: e.target.value})} placeholder="0"/></div>
                <div className="space-y-1"><Label>Baby (Kg)</Label><Input type="number" value={form.grade_baby} onChange={e=>setForm({...form, grade_baby: e.target.value})} placeholder="0"/></div>
              </div>
            </div>

            <DialogFooter><Button type="submit" className="bg-blue-600 hover:bg-blue-700">Simpan & Buat Surat Jalan</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL PRATINJAU SJ (UI) */}
      <Dialog open={!!previewData} onOpenChange={() => setPreviewData(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-4 border-b pb-4 sticky top-0 bg-background z-10">
            <DialogTitle>Pratinjau Surat Jalan</DialogTitle>
            <Button onClick={() => handlePrintSJ(null)} className="bg-blue-600 hover:bg-blue-700">
              <Printer className="w-4 h-4 mr-2"/> Cetak / Simpan PDF
            </Button>
          </div>
          
          {previewData && (
            <div className="bg-white text-black p-6 sm:p-8 font-sans border rounded-lg shadow-sm">
              <div className="flex justify-between items-start border-b-2 border-black pb-4 mb-6">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black tracking-tight uppercase">MINBUN ERP</h1>
                  <p className="text-xs text-gray-600">Distributor Komoditas Hasil Bumi</p>
                </div>
                <div className="text-right">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-800 uppercase tracking-widest">Surat Jalan</h2>
                  <p className="text-sm font-mono mt-1 text-gray-600">No. SJ: {previewData.sj_id}</p>
                  <p className="text-sm text-gray-600">Tanggal: {new Date(previewData.tanggal).toLocaleDateString("id-ID", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-between mb-6 gap-4">
                <div className="w-full sm:w-1/2">
                  <p className="text-sm text-gray-600 mb-1">Kepada Yth:</p>
                  <p className="text-lg font-bold uppercase">{previewData.tujuan}</p>
                </div>
                <div className="w-full sm:w-1/2 sm:text-right">
                  <p className="text-sm text-gray-600 mb-1">Informasi Pengiriman:</p>
                  <p className="text-sm font-semibold">Supir: {previewData.supir || '-'}</p>
                  <p className="text-sm font-semibold">Plat No: <span className="uppercase">{previewData.plat_nomor || '-'}</span></p>
                </div>
              </div>

              <div className="overflow-x-auto mb-6">
                <table className="w-full min-w-[500px] border-collapse border-2 border-black">
                  <thead>
                    <tr className="bg-gray-100 border-b-2 border-black">
                      <th className="py-2 px-4 text-center text-sm font-bold w-12 border-r border-black">No</th>
                      <th className="py-2 px-4 text-left text-sm font-bold border-r border-black">Nama Barang / Deskripsi</th>
                      <th className="py-2 px-4 text-center text-sm font-bold w-32 border-r border-black">Kuantitas</th>
                      <th className="py-2 px-4 text-center text-sm font-bold w-48">Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { name: "Kentang Segar - Grade A", qty: previewData.grade_a || 0 },
                      { name: "Kentang Segar - Grade B", qty: previewData.grade_b || 0 },
                      { name: "Kentang Segar - Grade C", qty: previewData.grade_c || 0 },
                      { name: "Kentang Segar - Baby", qty: previewData.grade_baby || 0 },
                    ].filter(item => item.qty > 0).map((item, index) => (
                      <tr key={index}>
                        <td className="py-3 px-4 border-b border-black text-sm text-center">{index + 1}</td>
                        <td className="py-3 px-4 border-b border-black text-sm font-medium">{item.name}</td>
                        <td className="py-3 px-4 border-b border-black text-sm text-center font-bold">{item.qty} Kg</td>
                        <td className="py-3 px-4 border-b border-black text-sm text-center"></td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50">
                      <td colSpan={2} className="py-3 px-4 text-right text-sm font-bold border-r border-black">TOTAL BERAT:</td>
                      <td className="py-3 px-4 text-center text-sm font-black border-r border-black">
                        {(previewData.grade_a || 0) + (previewData.grade_b || 0) + (previewData.grade_c || 0) + (previewData.grade_baby || 0)} Kg
                      </td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              
              <div className="flex flex-col sm:flex-row justify-between text-center mt-12 gap-8">
                <div className="w-full sm:w-1/3">
                  <p className="text-sm mb-16">Penerima,</p>
                  <p className="text-sm font-bold border-b border-black pb-1 inline-block min-w-[150px]"></p>
                  <p className="text-xs mt-1 text-gray-500">(Nama Jelas & Cap)</p>
                </div>
                <div className="w-full sm:w-1/3">
                  <p className="text-sm mb-16">Pengantar / Sopir,</p>
                  <p className="text-sm font-bold border-b border-black pb-1 inline-block min-w-[150px] uppercase">{previewData.supir || ''}</p>
                  <p className="text-xs mt-1 text-gray-500">(Tanda Tangan)</p>
                </div>
                <div className="w-full sm:w-1/3">
                  <p className="text-sm mb-16">Hormat Kami,</p>
                  <p className="text-sm font-bold border-b border-black pb-1 inline-block min-w-[150px]">Gudang MinBun</p>
                  <p className="text-xs mt-1 text-gray-500">(Bagian Pengiriman)</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}