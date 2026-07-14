"use client";

import { useState, useMemo } from "react";
import { useInventory } from "@/lib/inventory-context";
import { todayWibStr } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { FileText, Plus, Printer, CheckCircle2, Clock } from "lucide-react";
import { toast } from "sonner";

const formatKg = (n: number) => `${new Intl.NumberFormat("id-ID").format(n || 0)} Kg`;
const formatRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n || 0);

export default function InvoicePage() {
  // Asumsi 'invoices' dan 'addInvoice' sudah Anda tambahkan di context
  const { buyers = [], pengirimans = [], invoices = [], addInvoice, updateInvoice, isLoading } = useInventory();
  
  const [isOpen, setIsOpen] = useState(false);

  const [form, setForm] = useState({ 
    tanggal: todayWibStr().slice(0, 10),
    jatuh_tempo: "",
    buyer_id: "",
    selected_sj: [] as string[],
    harga_a: "", harga_b: "", harga_c: "", harga_baby: "", harga_campur: ""
  });

  // 1. FILTER: Cari Surat Jalan (Pengiriman) yang sudah jalan (punya SJ ID) untuk buyer yang dipilih
  const availableSj = useMemo(() => {
    if (!form.buyer_id) return [];
    return pengirimans.filter(p => p.buyer === form.buyer_id && p.sj_id !== "");
  }, [form.buyer_id, pengirimans]);

  // 2. REKAP TOTAL KG DARI SJ YANG DICEKLIS
  const rekap = useMemo(() => {
    const selectedSjData = pengirimans.filter(p => form.selected_sj.includes(p.id));
    return {
      sj_list: selectedSjData.map(s => s.sj_id).join(", "),
      qty_a: selectedSjData.reduce((sum, p) => sum + (p.qty_grade_a || 0), 0),
      qty_b: selectedSjData.reduce((sum, p) => sum + (p.qty_grade_b || 0), 0),
      qty_c: selectedSjData.reduce((sum, p) => sum + (p.qty_grade_c || 0), 0),
      qty_baby: selectedSjData.reduce((sum, p) => sum + (p.qty_grade_baby || 0), 0),
      qty_campur: selectedSjData.reduce((sum, p) => sum + (p.qty_campur || 0), 0),
    };
  }, [form.selected_sj, pengirimans]);

  // 3. KALKULASI TAGIHAN
  const hgA = parseFloat(form.harga_a) || 0;
  const hgB = parseFloat(form.harga_b) || 0;
  const hgC = parseFloat(form.harga_c) || 0;
  const hgBaby = parseFloat(form.harga_baby) || 0;
  const hgCampur = parseFloat(form.harga_campur) || 0;

  const totalTagihan = 
    (rekap.qty_a * hgA) + (rekap.qty_b * hgB) + (rekap.qty_c * hgC) + 
    (rekap.qty_baby * hgBaby) + (rekap.qty_campur * hgCampur);

  const isFormValid = form.buyer_id !== "" && form.selected_sj.length > 0 && form.jatuh_tempo !== "" && totalTagihan > 0;

  // GENERATOR ID INVOICE
  const generateInvoiceId = (dateStr: string) => {
    const ym = dateStr.slice(2, 10).replace(/-/g, ""); 
    const prefix = `INV-${ym}-`;
    const todayInv = invoices.filter((i:any) => i.invoice_id?.startsWith(prefix));
    return `${prefix}${String(todayInv.length + 1).padStart(3, "0")}`;
  };

  const handleSjToggle = (sjId: string) => {
    setForm(prev => ({
      ...prev,
      selected_sj: prev.selected_sj.includes(sjId) 
        ? prev.selected_sj.filter(id => id !== sjId) 
        : [...prev.selected_sj, sjId]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return toast.error("Pilih Minimal 1 Surat Jalan, isi Jatuh Tempo & Harga!");

    try {
      const newInvId = generateInvoiceId(form.tanggal);
      
      const payload = {
        invoice_id: newInvId,
        tanggal: form.tanggal + " 00:00:00",
        jatuh_tempo: form.jatuh_tempo + " 00:00:00",
        buyer: form.buyer_id,
        ref_sj: rekap.sj_list,
        qty_a: rekap.qty_a, harga_a: hgA,
        qty_b: rekap.qty_b, harga_b: hgB,
        qty_c: rekap.qty_c, harga_c: hgC,
        qty_baby: rekap.qty_baby, harga_baby: hgBaby,
        qty_campur: rekap.qty_campur, harga_campur: hgCampur,
        total_tagihan: totalTagihan,
        status: "Belum Dibayar"
      };

      if(addInvoice) {
        await addInvoice(payload as any);
      } else {
        toast.warning("Fungsi addInvoice belum tersedia di context, data disimulasikan sukses.");
      }

      toast.success(`Invoice ${newInvId} berhasil diterbitkan!`);
      setIsOpen(false);
      setForm({ tanggal: todayWibStr().slice(0, 10), jatuh_tempo: "", buyer_id: "", selected_sj: [], harga_a: "", harga_b: "", harga_c: "", harga_baby: "", harga_campur: "" });
    } catch (err: any) {
      toast.error("Gagal menerbitkan Invoice.");
    }
  };

  const handleMarkLunas = async (id: string, currentInvoiceId: string) => {
    // Memunculkan konfirmasi dialog bawaan browser
    if (window.confirm(`Apakah Anda yakin ingin menandai Invoice ${currentInvoiceId} menjadi LUNAS?`)) {
      try {
        if (updateInvoice) {
          await updateInvoice(id, { status: "Lunas" });
          toast.success(`Invoice ${currentInvoiceId} berhasil dilunasi!`);
        }
      } catch (err) {
        toast.error("Gagal mengubah status invoice.");
      }
    }
  };

  const handlePrint = (dataObj: any) => {
    const d = dataObj
    if (!d) return;

    const matchedBuyer = buyers.find((b: any) => b.id === d.buyer);
    const namaTujuan = matchedBuyer ? matchedBuyer.nama : "Tidak Diketahui";
    const namaPerusahaan = matchedBuyer?.perusahaan ? matchedBuyer.perusahaan : namaTujuan;
    const alamatTujuan = matchedBuyer ? matchedBuyer.alamat : "-";
    const npwpTujuan = matchedBuyer?.npwp ? matchedBuyer.npwp : "-";

    const items = [
      { name: "Kentang granola - Grade A", qty: d.qty_a || 0, price: d.harga_a || 0 },
      { name: "Kentang granola - Grade B", qty: d.qty_b || 0, price: d.harga_b || 0 },
      { name: "Kentang granola - Grade C", qty: d.qty_c || 0, price: d.harga_c || 0 },
      { name: "Kentang granola - Baby", qty: d.qty_baby || 0, price: d.harga_baby || 0 },
      { name: "Kentang granola - Campur", qty: d.qty_campur || 0, price: d.harga_campur || 0 },
    ].filter(item => item.qty > 0);

    const itemsHtml = items.map((item, index) => `
      <tr>
        <td class="py-2 px-3 border-b border-gray-300 text-sm text-center">${index + 1}</td>
        <td class="py-2 px-3 border-b border-gray-300 text-sm font-medium">${item.name}</td>
        <td class="py-2 px-3 border-b border-gray-300 text-sm text-center">${item.qty} Kg</td>
        <td class="py-2 px-3 border-b border-gray-300 text-sm text-right">${formatRp(item.price)}</td>
        <td class="py-2 px-3 border-b border-gray-300 text-sm text-right font-bold">${formatRp(item.qty * item.price)}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>Invoice - ${d.invoice_id}</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <style>
          @media print {
            @page { margin: 15mm; size: A4 portrait; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body class="bg-white text-black font-sans p-4">
        
        <div class="flex justify-between items-start border-b-4 border-slate-800 pb-4 mb-6">
          <div>
            <h1 class="text-4xl font-black tracking-tight uppercase text-slate-800">MINBUN ERP</h1>
            <p class="text-sm text-gray-600 font-medium">Distributor Komoditas Hasil Bumi</p>
            <p class="text-xs text-gray-500 mt-1">Jl. Raya Pasar Induk No. 123, Jawa Barat</p>
          </div>
          <div class="text-right">
            <h2 class="text-3xl font-bold text-blue-800 uppercase tracking-widest mb-1">INVOICE</h2>
            <table class="text-sm text-right ml-auto">
              <tr><td class="text-gray-500 pr-3">No. Invoice:</td><td class="font-bold text-slate-800">${d.invoice_id}</td></tr>
              <tr><td class="text-gray-500 pr-3">Tanggal:</td><td class="font-bold">${new Date(d.tanggal).toLocaleDateString("id-ID")}</td></tr>
              <tr><td class="text-gray-500 pr-3">Jatuh Tempo:</td><td class="font-bold text-red-600">${new Date(d.jatuh_tempo).toLocaleDateString("id-ID")}</td></tr>
            </table>
          </div>
        </div>

        <div class="flex justify-between mb-8">
          <div class="w-1/2 bg-slate-50 p-4 rounded-lg border border-slate-200">
            <p class="text-xs text-gray-500 mb-1 uppercase font-bold tracking-wider">Ditagihkan Kepada:</p>
            <p class="text-lg font-black uppercase text-slate-800">${namaPerusahaan}</p>
            ${matchedBuyer?.perusahaan ? `<p class="text-sm font-semibold text-gray-700 mt-0.5">Attn: ${namaTujuan}</p>` : ''}
            <p class="text-sm text-gray-600 mt-1">${alamatTujuan}</p>
            <p class="text-sm text-gray-600 font-mono mt-1 font-semibold">NPWP: ${npwpTujuan}</p>
          </div>
          <div class="w-1/2 text-right flex flex-col justify-end">
            <p class="text-xs text-gray-500 mb-0.5">Referensi Surat Jalan (DO):</p>
            <p class="text-sm font-mono font-semibold bg-blue-50 text-blue-800 p-2 rounded border border-blue-100 inline-block ml-auto">${d.ref_sj}</p>
          </div>
        </div>

        <table class="w-full mb-6 border-collapse">
          <thead>
            <tr class="bg-slate-800 text-white">
              <th class="py-3 px-3 text-center text-sm font-bold w-12 rounded-tl-lg">No</th>
              <th class="py-3 px-3 text-left text-sm font-bold">Deskripsi Barang</th>
              <th class="py-3 px-3 text-center text-sm font-bold w-24">Kuantitas</th>
              <th class="py-3 px-3 text-right text-sm font-bold w-32">Harga / Kg</th>
              <th class="py-3 px-3 text-right text-sm font-bold w-40 rounded-tr-lg">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="flex justify-end mb-8">
          <div class="w-1/2 sm:w-1/3">
            <div class="flex justify-between py-2 border-b-2 border-slate-800">
              <span class="font-bold text-slate-800">TOTAL TAGIHAN</span>
              <span class="font-black text-xl text-blue-800">${formatRp(d.total_tagihan)}</span>
            </div>
          </div>
        </div>

        <div class="flex justify-between items-end border-t border-gray-300 pt-6 mt-12">
          <div class="w-2/3">
            <p class="text-sm font-bold text-slate-800 mb-2 flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-landmark"><line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7 12 2"/></svg>
              Instruksi Pembayaran
            </p>
            <div class="bg-blue-50 p-3 rounded-lg border border-blue-100 text-sm">
              <p class="text-gray-600 mb-1">Mohon lakukan transfer ke rekening berikut:</p>
              <p class="font-bold text-slate-800">Bank BCA - 1234567890</p>
              <p class="font-bold text-slate-800">a.n. PT. MINBUN NUSANTARA</p>
            </div>
          </div>
          <div class="w-1/3 text-center">
            <p class="text-sm mb-16">Hormat Kami,</p>
            <p class="text-sm font-bold border-b border-black pb-1 inline-block min-w-[150px]">Finance MinBun</p>
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
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  if (isLoading) return <div className="animate-pulse">Memuat...</div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6 text-indigo-600"/> Tagihan / Invoice</h1>
          <p className="text-sm text-muted-foreground mt-1">Terbitkan tagihan ke Mitra berdasarkan Surat Jalan (SJ) yang telah dikirim.</p>
        </div>
        <Button onClick={() => setIsOpen(true)} className="bg-indigo-600 hover:bg-indigo-700"><Plus className="h-4 w-4 mr-2"/> Buat Invoice Baru</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="p-4">No. Invoice</th>
                  <th className="p-4">Tanggal / Jatuh Tempo</th>
                  <th className="p-4">Mitra / Buyer</th>
                  <th className="p-4 text-right">Total Tagihan</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv: any) => {
                  const matchedBuyer = buyers.find((b: any) => b.id === inv.buyer);
                  const displayTujuan = matchedBuyer ? matchedBuyer.nama : "-";
                  const isLunas = inv.status === "Lunas";

                  return (
                    <tr key={inv.id} className="border-b hover:bg-muted/30">
                      <td className="p-4">
                        <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-200">{inv.invoice_id}</span>
                        <div className="text-[10px] text-muted-foreground mt-1.5 font-mono truncate max-w-[150px]" title={inv.ref_sj}>Ref: {inv.ref_sj}</div>
                      </td>
                      <td className="p-4 align-top pt-5">
                        <div>{new Date(inv.tanggal).toLocaleDateString("id-ID")}</div>
                        <div className="text-xs text-red-600 mt-0.5 flex items-center gap-1"><Clock className="w-3 h-3"/> {new Date(inv.jatuh_tempo).toLocaleDateString("id-ID")}</div>
                      </td>
                      <td className="p-4 align-top pt-5 font-semibold uppercase">{displayTujuan}</td>
                      <td className="p-4 align-top pt-5 text-right font-black text-slate-800">{formatRp(inv.total_tagihan)}</td>
                      <td className="p-4 align-top pt-4 text-center">
                        {isLunas ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700 font-bold bg-green-100 px-2.5 py-1 rounded-full"><CheckCircle2 className="w-3 h-3"/> Lunas</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700 font-bold bg-amber-100 px-2.5 py-1 rounded-full">Belum Dibayar</span>
                        )}
                      </td>
                      <td className="p-4 align-top pt-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {!isLunas && (
                            <Button variant="outline" size="sm" onClick={() => handleMarkLunas(inv.id, inv.invoice_id)} className="h-8 text-xs border-green-200 text-green-700 hover:bg-green-50">
                              <CheckCircle2 className="w-3 h-3 mr-1.5" /> Pelunasan
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => handlePrint(inv)} className="h-8 text-xs border-indigo-200 text-indigo-700 hover:bg-indigo-50">
                            <Printer className="w-3 h-3 mr-1.5" /> Cetak / PDF
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {invoices.length === 0 && (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Belum ada riwayat Invoice diterbitkan.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* FORM MODAL BUAT INVOICE */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-indigo-800 flex items-center gap-2"><FileText className="w-5 h-5"/> Terbitkan Invoice Baru</DialogTitle>
            <DialogDescription>Pilih mitra untuk melihat Surat Jalan yang belum ditagihkan.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 mt-2">
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-4 rounded-lg border">
              <div className="space-y-1.5">
                <Label>Pilih Mitra / Buyer <span className="text-red-500">*</span></Label>
                <Select value={form.buyer_id} onValueChange={v=>{ setForm({...form, buyer_id: v, selected_sj: []}); }} required>
                  <SelectTrigger className="bg-white"><SelectValue placeholder="Pilih Buyer..." /></SelectTrigger>
                  <SelectContent>
                    {buyers.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.nama}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Tanggal Invoice</Label><Input type="date" value={form.tanggal} onChange={e=>setForm({...form, tanggal: e.target.value})} required className="bg-white"/></div>
              <div className="space-y-1.5"><Label className="text-red-600 font-bold">Jatuh Tempo <span className="text-red-500">*</span></Label><Input type="date" value={form.jatuh_tempo} onChange={e=>setForm({...form, jatuh_tempo: e.target.value})} required className="bg-white border-red-200"/></div>
            </div>

            {form.buyer_id && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* KOLOM KIRI: PILIH SURAT JALAN */}
                <div className="space-y-3">
                  <Label className="text-sm font-bold text-slate-700">1. Pilih Surat Jalan (DO) yang akan ditagih:</Label>
                  <div className="border rounded-md overflow-hidden bg-white max-h-[300px] overflow-y-auto">
                    {availableSj.length === 0 ? (
                      <div className="p-6 text-center text-sm text-muted-foreground italic">Tidak ada Surat Jalan yang tersedia untuk Mitra ini.</div>
                    ) : (
                      availableSj.map(sj => (
                        <div key={sj.id} className="flex items-start space-x-3 p-3 border-b hover:bg-slate-50 transition-colors">
                          <Checkbox id={sj.id} checked={form.selected_sj.includes(sj.id)} onCheckedChange={() => handleSjToggle(sj.id)} className="mt-1" />
                          <div className="grid gap-1.5 leading-none">
                            <label htmlFor={sj.id} className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2">
                              <span className="font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border">{sj.sj_id}</span>
                              <span className="text-xs text-gray-500">{new Date(sj.tanggal).toLocaleDateString('id-ID')}</span>
                            </label>
                            <p className="text-xs text-muted-foreground">
                              Total: {formatKg((sj.qty_grade_a||0) + (sj.qty_grade_b||0) + (sj.qty_grade_c||0) + (sj.qty_grade_baby||0) + (sj.qty_campur||0))}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* KOLOM KANAN: INPUT HARGA & REKAP */}
                <div className="space-y-3">
                  <Label className="text-sm font-bold text-slate-700">2. Input Harga Kesepakatan (Rp / Kg):</Label>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-md p-4 space-y-4">
                    
                    {rekap.qty_a > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <div className="w-1/2 text-sm font-medium">Grade A <span className="text-xs text-gray-500 block">{formatKg(rekap.qty_a)}</span></div>
                        <Input type="number" placeholder="Harga/Kg" value={form.harga_a} onChange={e=>setForm({...form, harga_a: e.target.value})} className="w-1/2 bg-white" />
                      </div>
                    )}
                    {rekap.qty_b > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <div className="w-1/2 text-sm font-medium">Grade B <span className="text-xs text-gray-500 block">{formatKg(rekap.qty_b)}</span></div>
                        <Input type="number" placeholder="Harga/Kg" value={form.harga_b} onChange={e=>setForm({...form, harga_b: e.target.value})} className="w-1/2 bg-white" />
                      </div>
                    )}
                    {rekap.qty_c > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <div className="w-1/2 text-sm font-medium">Grade C <span className="text-xs text-gray-500 block">{formatKg(rekap.qty_c)}</span></div>
                        <Input type="number" placeholder="Harga/Kg" value={form.harga_c} onChange={e=>setForm({...form, harga_c: e.target.value})} className="w-1/2 bg-white" />
                      </div>
                    )}
                    {rekap.qty_baby > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <div className="w-1/2 text-sm font-medium">Grade Baby <span className="text-xs text-gray-500 block">{formatKg(rekap.qty_baby)}</span></div>
                        <Input type="number" placeholder="Harga/Kg" value={form.harga_baby} onChange={e=>setForm({...form, harga_baby: e.target.value})} className="w-1/2 bg-white" />
                      </div>
                    )}
                    {rekap.qty_campur > 0 && (
                      <div className="flex items-center justify-between gap-4">
                        <div className="w-1/2 text-sm font-medium">Campur (Cross-Docking) <span className="text-xs text-gray-500 block">{formatKg(rekap.qty_campur)}</span></div>
                        <Input type="number" placeholder="Harga/Kg" value={form.harga_campur} onChange={e=>setForm({...form, harga_campur: e.target.value})} className="w-1/2 bg-white" />
                      </div>
                    )}

                    {form.selected_sj.length === 0 && (
                      <div className="text-sm text-center text-indigo-400 italic py-4">Pilih Surat Jalan di sebelah kiri terlebih dahulu.</div>
                    )}

                    <div className="border-t border-indigo-200 pt-3 mt-4">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-800">TOTAL TAGIHAN</span>
                        <span className="text-xl font-black text-indigo-700">{formatRp(totalTagihan)}</span>
                      </div>
                    </div>

                  </div>
                </div>

              </div>
            )}

            <DialogFooter className="pt-4 border-t">
              <Button type="submit" disabled={!isFormValid} className="bg-indigo-600 hover:bg-indigo-700 w-full sm:w-auto">
                <FileText className="w-4 h-4 mr-2" /> Terbitkan Invoice
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}