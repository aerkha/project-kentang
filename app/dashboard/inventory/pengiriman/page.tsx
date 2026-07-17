"use client";

import { useState, type FormEvent } from "react";
import { useInventory } from "@/lib/inventory-context";
import { todayWibStr } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Truck, Plus, Printer, AlertTriangle, UserCheck } from "lucide-react";
import { toast } from "sonner";

const formatKg = (n: number) => `${new Intl.NumberFormat("id-ID").format(n || 0)} Kg`;

// 👇 KONSTANTA OPSI PERUSAHAAN (KOP SURAT) 👇
const COMPANY_OPTIONS = {
  berkah: {
    name: "PT. BERKAH SEJAHTERA FARM",
    address: "JL. PTPN VIII, Kp Rancamanyar Margamukti, Kec Pangalengan, Kab Bandung",
  },
  madani: {
    name: "PT. MADANI AGRI LESTARI",
    address: "Kp Rancamanyar, Desa Margamukti, Kec Pangalengan, Kab Bandung",
  },
};

export default function PengirimanPage() {
  const { pengirimans, sortirs, addPengiriman, updatePengiriman, isLoading, buyers = [] } = useInventory();
  
  const [isDoOpen, setIsDoOpen] = useState(false);
  const [doForm, setDoForm] = useState({ 
    tanggal: todayWibStr().slice(0, 10),
    batch_id: "", 
    buyer_id: "", 
    qty_grade_a: "", 
    qty_grade_b: "", 
    qty_grade_c: "", 
    qty_grade_baby: "" 
  });

  const [isSjOpen, setIsSjOpen] = useState(false);
  const [selectedDo, setSelectedDo] = useState<any>(null);
  const [sjForm, setSjForm] = useState({ supir: "", plat_nomor: "" });

  const [previewData, setPreviewData] = useState<any>(null);

  // 👇 STATE UNTUK PILIHAN KOP SURAT 👇
  const [headerCompany, setHeaderCompany] = useState<"berkah" | "madani">("berkah");

  if (isLoading) return <div className="animate-pulse">Memuat...</div>;

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

  const inputA = parseFloat(doForm.qty_grade_a) || 0;
  const inputB = parseFloat(doForm.qty_grade_b) || 0;
  const inputC = parseFloat(doForm.qty_grade_c) || 0;
  const inputBaby = parseFloat(doForm.qty_grade_baby) || 0;

  const isValidA = inputA <= stock.a;
  const isValidB = inputB <= stock.b;
  const isValidC = inputC <= stock.c;
  const isValidBaby = inputBaby <= stock.baby;
  
  const hasInput = inputA > 0 || inputB > 0 || inputC > 0 || inputBaby > 0;
  const isDoFormValid = isValidA && isValidB && isValidC && isValidBaby && hasInput && doForm.buyer_id !== "";

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

  const handleDoSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isDoFormValid) return toast.error("Periksa kembali form DO. Stok tidak mencukupi atau pembeli kosong!");

    try {
      const finalBatchId = doForm.batch_id.trim() !== "" ? doForm.batch_id.trim() : generateDOId(doForm.tanggal);
      const selectedBuyer = buyers.find((b: any) => b.id === doForm.buyer_id);
      
      const buyerName = selectedBuyer ? (selectedBuyer.perusahaan || selectedBuyer.nama) : "";

      await addPengiriman({
        batch_id: finalBatchId,
        tanggal: doForm.tanggal + " 00:00:00",
        buyer: doForm.buyer_id,        
        tujuan: buyerName,           
        qty_grade_a: inputA,
        qty_grade_b: inputB,
        qty_grade_c: inputC,
        qty_grade_baby: inputBaby,
        qty_campur: 0, 
        supir: "",
        plat_nomor: "",
        sj_id: ""
      } as any);

      toast.success("Delivery Order (DO) berhasil dibuat!"); 
      setIsDoOpen(false);
      setDoForm({ ...doForm, batch_id: "", buyer_id: "", qty_grade_a: "", qty_grade_b: "", qty_grade_c: "", qty_grade_baby: "" });
    } catch (err: any) { 
      toast.error("Gagal membuat Delivery Order."); 
    }
  };

  const handleSjSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedDo || !sjForm.supir || !sjForm.plat_nomor) return toast.error("Lengkapi data supir dan plat nomor!");

    try {
      const newSjId = generateSJId(selectedDo.tanggal);
      await updatePengiriman(selectedDo.id, {
        sj_id: newSjId,
        supir: sjForm.supir,
        plat_nomor: sjForm.plat_nomor
      });

      toast.success(`Surat Jalan ${newSjId} berhasil diterbitkan!`);
      setIsSjOpen(false);
      setSelectedDo(null);
      setSjForm({ supir: "", plat_nomor: "" });
    } catch (err: any) {
      toast.error("Gagal menerbitkan Surat Jalan.");
    }
  };

  const handlePrintSJ = (dataObj: any) => {
    const d = dataObj || previewData;
    if (!d) return;

    const matchedBuyer = buyers.find((b: any) => b.id === d.buyer);
    const namaTujuan = matchedBuyer 
      ? (matchedBuyer.perusahaan ? `${matchedBuyer.perusahaan} (${matchedBuyer.nama})` : matchedBuyer.nama) 
      : (d.tujuan || "Tidak Diketahui");

    // 👇 Ambil profil perusahaan berdasarkan state pilihan 👇
    const comp = COMPANY_OPTIONS[headerCompany];

    const items = [
      { name: "Kentang Granola - Grade A", qty: d.qty_grade_a || 0 },
      { name: "Kentang Granola - Grade B", qty: d.qty_grade_b || 0 },
      { name: "Kentang Granola - Grade C", qty: d.qty_grade_c || 0 },
      { name: "Kentang Granola - Baby", qty: d.qty_grade_baby || 0 },
      { name: "Kentang Granola - Campur (Karungan)", qty: d.qty_campur || 0 }, 
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
          <div class="w-2/3">
            <h1 class="text-xl font-black tracking-tight uppercase">${comp.name}</h1>
            <p class="text-[10px] text-gray-600 mt-0.5 pr-4">${comp.address}</p>
          </div>
          <div class="text-right w-1/3">
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
            <p class="text-xs font-bold border-b border-black pb-0.5 inline-block min-w-[120px]">Bag. Pengiriman</p>
            <p class="text-[9px] mt-1 text-gray-500 max-w-[120px] mx-auto uppercase">${comp.name}</p>
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
          <p className="text-sm text-muted-foreground mt-1">Kelola Delivery Order (DO) dan terbitkan Surat Jalan (SJ).</p>
        </div>
        <Button onClick={() => setIsDoOpen(true)} className="bg-slate-800 hover:bg-slate-900"><Plus className="h-4 w-4 mr-2"/> Buat Delivery Order</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="p-4">Dokumen ID</th>
                  <th className="p-4">Tanggal DO</th>
                  <th className="p-4">Tujuan (Pembeli)</th>
                  <th className="p-4">Total Berat</th>
                  <th className="p-4">Status Pengiriman</th>
                  <th className="p-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {pengirimans.map(p => {
                  const totalBerat = (p.qty_grade_a || 0) + (p.qty_grade_b || 0) + (p.qty_grade_c || 0) + (p.qty_grade_baby || 0) + (p.qty_campur || 0);
                  const pAny = p as any;
                  
                  const matchedBuyer = buyers.find((b: any) => b.id === p.buyer);
                  const displayTujuan = matchedBuyer 
                    ? (matchedBuyer.perusahaan ? `${matchedBuyer.perusahaan} (${matchedBuyer.nama})` : matchedBuyer.nama) 
                    : (p.tujuan || p.buyer);
                  
                  const hasSj = !!p.sj_id && !!p.supir;

                  return (
                    <tr key={p.id} className="border-b hover:bg-muted/30">
                      <td className="p-4">
                        <div className="flex flex-col gap-1.5">
                          <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded w-fit border shadow-sm" title="Delivery Order">DO: {p.batch_id}</span>
                          {hasSj && <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded w-fit border border-blue-200 shadow-sm" title="Surat Jalan">SJ: {p.sj_id}</span>}
                        </div>
                      </td>
                      <td className="p-4 align-top pt-5">{p.tanggal.slice(0,10)}</td>
                      <td className="p-4 align-top pt-5 font-semibold uppercase">
                        {displayTujuan} 
                        {(p.qty_campur || 0) > 0 && <span className="ml-2 bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0.5 rounded-full border border-purple-200">Cross-Docking</span>}
                      </td>
                      <td className="p-4 align-top pt-5 font-semibold">{formatKg(totalBerat)}</td>
                      <td className="p-4 align-top pt-4">
                        {hasSj ? (
                          <div className="flex flex-col">
                            <span className="text-xs text-green-700 font-bold mb-0.5 flex items-center gap-1"><Truck className="w-3 h-3"/> Menuju Lokasi</span>
                            <span className="font-medium text-xs">{p.supir}</span>
                            <span className="text-[10px] text-muted-foreground uppercase">{pAny.plat_nomor}</span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-xs text-amber-700 font-semibold bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-md shadow-sm">
                            Menunggu Supir
                          </span>
                        )}
                      </td>
                      <td className="p-4 align-top pt-4 text-center">
                        {hasSj ? (
                          <Button variant="outline" size="sm" onClick={() => setPreviewData(p)} className="h-8 text-xs border-blue-200 text-blue-700 hover:bg-blue-50">
                            <Printer className="w-3 h-3 mr-1.5" /> Pratinjau SJ
                          </Button>
                        ) : (
                          <Button 
                            size="sm" 
                            onClick={() => { setSelectedDo(p); setIsSjOpen(true); }} 
                            className="h-8 text-xs bg-amber-500 hover:bg-amber-600 text-white shadow-sm"
                          >
                            Tugaskan Supir
                          </Button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {pengirimans.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Belum ada riwayat DO atau Pengiriman</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDoOpen} onOpenChange={setIsDoOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Buat Delivery Order (DO)</DialogTitle>
            <DialogDescription>DO akan membukukan pesanan dan memotong stok di gudang.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleDoSubmit} className="space-y-6 mt-2">
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Tanggal DO</Label><Input type="date" value={doForm.tanggal} onChange={e=>setDoForm({...doForm, tanggal: e.target.value})} required/></div>
              <div className="space-y-1">
                <Label>Tujuan (Pembeli / Mitra)</Label>
                <Select value={doForm.buyer_id} onValueChange={v=>setDoForm({...doForm, buyer_id: v})} required>
                  <SelectTrigger className={doForm.buyer_id ? "" : "border-red-300 ring-red-100"}>
                    <SelectValue placeholder="Pilih Mitra/Pembeli" />
                  </SelectTrigger>
                  <SelectContent>
                    {buyers.length === 0 ? (
                      <SelectItem value="empty" disabled>Belum ada data pembeli</SelectItem>
                    ) : (
                      buyers.map((b: any) => {
                        const displayLabel = b.perusahaan ? `${b.perusahaan} (${b.nama})` : b.nama;
                        return <SelectItem key={b.id} value={b.id}>{displayLabel}</SelectItem>;
                      })
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label>ID Delivery Order (Opsional)</Label>
              <Input type="text" value={doForm.batch_id} onChange={e=>setDoForm({...doForm, batch_id: e.target.value})} placeholder="Biarkan kosong agar sistem membuatkan ID otomatis" className="font-mono text-sm" />
            </div>

            <div className="space-y-3 bg-muted/30 p-4 rounded-lg border">
              <div className="flex justify-between items-end border-b pb-2">
                <Label className="text-xs uppercase tracking-widest text-slate-600 font-bold">Rincian Barang Keluar (Memotong Stok Gudang)</Label>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                
                <div className="space-y-1.5">
                  <Label>Grade A (Kg)</Label>
                  <Input type="number" value={doForm.qty_grade_a} onChange={e=>setDoForm({...doForm, qty_grade_a: e.target.value})} placeholder="0" className={!isValidA ? "border-red-500 bg-red-50 focus-visible:ring-red-500" : ""} />
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground font-medium">Stok: {formatKg(stock.a)}</span>
                    {!isValidA && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Grade B (Kg)</Label>
                  <Input type="number" value={doForm.qty_grade_b} onChange={e=>setDoForm({...doForm, qty_grade_b: e.target.value})} placeholder="0" className={!isValidB ? "border-red-500 bg-red-50 focus-visible:ring-red-500" : ""} />
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground font-medium">Stok: {formatKg(stock.b)}</span>
                    {!isValidB && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Grade C (Kg)</Label>
                  <Input type="number" value={doForm.qty_grade_c} onChange={e=>setDoForm({...doForm, qty_grade_c: e.target.value})} placeholder="0" className={!isValidC ? "border-red-500 bg-red-50 focus-visible:ring-red-500" : ""} />
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground font-medium">Stok: {formatKg(stock.c)}</span>
                    {!isValidC && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Baby (Kg)</Label>
                  <Input type="number" value={doForm.qty_grade_baby} onChange={e=>setDoForm({...doForm, qty_grade_baby: e.target.value})} placeholder="0" className={!isValidBaby ? "border-red-500 bg-red-50 focus-visible:ring-red-500" : ""} />
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground font-medium">Stok: {formatKg(stock.baby)}</span>
                    {!isValidBaby && <AlertTriangle className="w-3.5 h-3.5 text-red-600" />}
                  </div>
                </div>

              </div>
            </div>

            <DialogFooter>
              <Button type="submit" disabled={!isDoFormValid} className="bg-slate-800 hover:bg-slate-900">
                {!isDoFormValid && hasInput ? "Stok Kurang!" : "Simpan Delivery Order"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isSjOpen} onOpenChange={setIsSjOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tugaskan Supir</DialogTitle>
            <DialogDescription>Menerbitkan Surat Jalan untuk DO: <strong className="text-black">{selectedDo?.batch_id}</strong></DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSjSubmit} className="space-y-4 mt-2">
            
            <div className="space-y-1.5">
              <Label>Nama Supir</Label>
              <Input type="text" value={sjForm.supir} onChange={e=>setSjForm({...sjForm, supir: e.target.value})} placeholder="Contoh: Mang Mamat" required />
            </div>
            
            <div className="space-y-1.5">
              <Label>Plat Nomor Kendaraan</Label>
              <Input type="text" value={sjForm.plat_nomor} onChange={e=>setSjForm({...sjForm, plat_nomor: e.target.value})} placeholder="Contoh: D 1234 ABC" required className="uppercase" />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setIsSjOpen(false)}>Batal</Button>
              <Button type="submit" className="bg-amber-500 hover:bg-amber-600 text-white">
                <UserCheck className="w-4 h-4 mr-2" /> Terbitkan Surat Jalan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewData} onOpenChange={() => setPreviewData(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          {/* 👇 HEADER MODAL DENGAN DROPDOWN PILIHAN KOP SURAT 👇 */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 border-b pb-4 sticky top-0 bg-background z-10 gap-4">
            <DialogTitle>Pratinjau Surat Jalan</DialogTitle>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Kop Surat:</Label>
                <Select value={headerCompany} onValueChange={(v: "berkah" | "madani") => setHeaderCompany(v)}>
                  <SelectTrigger className="w-[180px] h-8 text-xs bg-white">
                    <SelectValue placeholder="Pilih PT" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="berkah">PT Berkah Sejahtera</SelectItem>
                    <SelectItem value="madani">PT Madani Agri</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => handlePrintSJ(null)} className="bg-blue-600 hover:bg-blue-700 h-8">
                <Printer className="w-4 h-4 mr-2"/> Cetak / Simpan PDF
              </Button>
            </div>
          </div>
          
          {previewData && (() => {
            const matchedBuyer = buyers.find((b: any) => b.id === previewData.buyer);
            const displayTujuan = matchedBuyer 
              ? (matchedBuyer.perusahaan ? `${matchedBuyer.perusahaan} (${matchedBuyer.nama})` : matchedBuyer.nama) 
              : (previewData.tujuan || previewData.buyer);
            
            return (
              <div className="bg-white text-black p-6 font-sans border rounded-lg shadow-sm">
                <div className="flex justify-between items-start border-b-2 border-black pb-2 mb-4">
                  <div className="w-2/3">
                    {/* 👇 MENAMPILKAN KOP SURAT SESUAI PILIHAN 👇 */}
                    <h1 className="text-xl font-black tracking-tight uppercase text-blue-900">{COMPANY_OPTIONS[headerCompany].name}</h1>
                    <p className="text-[10px] text-gray-600 mt-0.5 pr-4">{COMPANY_OPTIONS[headerCompany].address}</p>
                  </div>
                  <div className="text-right w-1/3">
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
                        { name: "Kentang Granola - Grade A", qty: previewData.qty_grade_a || 0 },
                        { name: "Kentang Granola - Grade B", qty: previewData.qty_grade_b || 0 },
                        { name: "Kentang Granola - Grade C", qty: previewData.qty_grade_c || 0 },
                        { name: "Kentang Granola - Baby", qty: previewData.qty_grade_baby || 0 },
                        { name: "Kentang Granola - Campur (Karungan)", qty: previewData.qty_campur || 0 },
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
                          {(previewData.qty_grade_a || 0) + (previewData.qty_grade_b || 0) + (previewData.qty_grade_c || 0) + (previewData.qty_grade_baby || 0) + (previewData.qty_campur || 0)} Kg
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
                    <p className="text-xs font-bold border-b border-black pb-0.5 inline-block min-w-[120px]">Bag. Pengiriman</p>
                    <p className="text-[9px] mt-1 text-gray-500 uppercase max-w-[120px] mx-auto">{COMPANY_OPTIONS[headerCompany].name}</p>
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