"use client";

import { useState } from "react";
import { useInventory } from "@/lib/inventory-context";
import { todayWibStr } from "@/lib/utils";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PackageSearch, CheckSquare, Send, Plus, ArrowDownToLine, Scale, ArrowUpRight } from "lucide-react";

const formatKg = (n: number) => `${new Intl.NumberFormat("id-ID").format(n)} Kg`;

export function InventoryContent() {
  const { 
    bandars, buyers, pembelians, sortirs, pengirimans, currentStock, isLoading, 
    addPembelian, addSortir, addPengiriman, generatePembelianId, generatePengirimanId 
  } = useInventory();

  // Dialog States
  const [isPembelianOpen, setIsPembelianOpen] = useState(false);
  const [isSortirOpen, setIsSortirOpen] = useState(false);
  const [isPengirimanOpen, setIsPengirimanOpen] = useState(false);

  // Form States
  const defaultDate = todayWibStr().slice(0, 10);
  const [formPb, setFormPb] = useState({ tanggal: defaultDate, bandar: "", tonase_lapangan: "", tonase_gudang: "", harga_per_kg: "" });
  const [formSortir, setFormSortir] = useState({ pembelian_id: "", tanggal_sortir: defaultDate, grade_a: "", grade_b: "", grade_c: "", grade_baby: "", grade_reject: "" });
  const [formDl, setFormDl] = useState({ tanggal: defaultDate, buyer: "", qty_grade_a: "", qty_grade_b: "", qty_grade_c: "", qty_grade_baby: "" });

  if (isLoading) return <div className="text-center py-20 animate-pulse text-muted-foreground">Memuat data gudang...</div>;

  // ── HANDLERS ──
  const handleSimpanPembelian = async (e: React.FormEvent) => {
    e.preventDefault();
    const bandar = bandars.find(b => b.id === formPb.bandar);
    if (!bandar) return toast.error("Pilih bandar");
    
    const tonaseL = parseFloat(formPb.tonase_lapangan) || 0;
    const tonaseG = parseFloat(formPb.tonase_gudang) || 0;
    const harga = parseFloat(formPb.harga_per_kg) || 0;
    const batchId = generatePembelianId(bandar.kode, formPb.tanggal);

    try {
      await addPembelian({
        batch_id: batchId,
        tanggal: formPb.tanggal + " 00:00:00",
        bandar: bandar.id,
        tonase_lapangan: tonaseL,
        tonase_gudang: tonaseG,
        harga_per_kg: harga,
        total_harga: tonaseL * harga, // Owner bayar berdasar laporan lapangan
        tujuan: "Gudang (Sortir)",
        status: "Menunggu Sortir"
      });
      toast.success(`Berhasil mencatat batch ${batchId}`);
      setIsPembelianOpen(false);
    } catch (err) { toast.error("Gagal menyimpan pembelian"); }
  };

  const handleSimpanSortir = async (e: React.FormEvent) => {
    e.preventDefault();
    const pb = pembelians.find(p => p.id === formSortir.pembelian_id);
    if (!pb) return toast.error("Pilih Batch Pembelian");

    const a = parseFloat(formSortir.grade_a) || 0;
    const b = parseFloat(formSortir.grade_b) || 0;
    const c = parseFloat(formSortir.grade_c) || 0;
    const baby = parseFloat(formSortir.grade_baby) || 0;
    const reject = parseFloat(formSortir.grade_reject) || 0;
    const totalSortir = a + b + c + baby + reject;
    const susut = pb.tonase_gudang - totalSortir; // Hitung otomatis

    try {
      await addSortir({
        pembelian_id: pb.id,
        tanggal_sortir: formSortir.tanggal_sortir + " 00:00:00",
        grade_a: a, grade_b: b, grade_c: c, grade_baby: baby, grade_reject: reject,
        susut: susut,
      });
      toast.success("Hasil sortir berhasil dicatat, stok gudang bertambah.");
      setIsSortirOpen(false);
    } catch (err) { toast.error("Gagal menyimpan sortir"); }
  };

  const handleSimpanPengiriman = async (e: React.FormEvent) => {
    e.preventDefault();
    const buyer = buyers.find(b => b.id === formDl.buyer);
    if (!buyer) return toast.error("Pilih Buyer");

    const a = parseFloat(formDl.qty_grade_a) || 0;
    const b = parseFloat(formDl.qty_grade_b) || 0;
    const c = parseFloat(formDl.qty_grade_c) || 0;
    const baby = parseFloat(formDl.qty_grade_baby) || 0;

    // Validasi Sisa Stok
    if (a > currentStock.gradeA || b > currentStock.gradeB || c > currentStock.gradeC || baby > currentStock.baby) {
      return toast.error("Gagal: Jumlah pengiriman melebihi sisa stok di gudang!");
    }

    const batchId = generatePengirimanId(buyer.kode, formDl.tanggal);
    try {
      await addPengiriman({
        batch_id: batchId,
        tanggal: formDl.tanggal + " 00:00:00",
        buyer: buyer.id,
        qty_grade_a: a, qty_grade_b: b, qty_grade_c: c, qty_grade_baby: baby,
        status: "Dalam Perjalanan"
      });
      toast.success(`Pengiriman ${batchId} berhasil dibuat, stok berkurang.`);
      setIsPengirimanOpen(false);
    } catch (err) { toast.error("Gagal menyimpan pengiriman"); }
  };

  const unSortedPembelians = pembelians.filter(p => p.status !== "Selesai");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <PackageSearch className="h-6 w-6 text-primary" /> Manajemen Gudang
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Lacak barang dari bandar, proses sortir, hingga pengiriman.</p>
        </div>
      </div>

      <Tabs defaultValue="stok" className="space-y-6">
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="stok"><PackageSearch className="h-4 w-4 mr-2" /> Stok Tersedia</TabsTrigger>
          <TabsTrigger value="pembelian"><ArrowDownToLine className="h-4 w-4 mr-2" /> Barang Masuk</TabsTrigger>
          <TabsTrigger value="sortir"><CheckSquare className="h-4 w-4 mr-2" /> Proses Sortir</TabsTrigger>
          <TabsTrigger value="pengiriman"><ArrowUpRight className="h-4 w-4 mr-2" /> Pengiriman</TabsTrigger>
        </TabsList>

        {/* ── TAB 1: STOK TERSEDIA ── */}
        <TabsContent value="stok">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {[
              { label: "Grade A", value: currentStock.gradeA, color: "text-blue-600" },
              { label: "Grade B", value: currentStock.gradeB, color: "text-emerald-600" },
              { label: "Grade C", value: currentStock.gradeC, color: "text-amber-600" },
              { label: "Baby", value: currentStock.baby, color: "text-purple-600" },
              { label: "Reject", value: currentStock.reject, color: "text-red-600" },
            ].map(s => (
              <Card key={s.label}>
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{s.label}</CardTitle></CardHeader>
                <CardContent><div className={`text-2xl font-bold ${s.color}`}>{formatKg(s.value)}</div></CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ── TAB 2: BARANG MASUK ── */}
        <TabsContent value="pembelian" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-lg">Riwayat Penerimaan (Purchase Batch)</h3>
            <Button onClick={() => setIsPembelianOpen(true)}><Plus className="h-4 w-4 mr-2"/> Terima Barang</Button>
          </div>
          <Card>
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b"><tr>
                <th className="p-3">ID Batch</th><th className="p-3">Tanggal</th><th className="p-3">Bandar</th><th className="p-3">Tonase (Gudang)</th><th className="p-3">Status</th>
              </tr></thead>
              <tbody>
                {pembelians.map(p => (
                  <tr key={p.id} className="border-b">
                    <td className="p-3 font-mono text-primary">{p.batch_id}</td>
                    <td className="p-3">{p.tanggal.slice(0,10)}</td>
                    <td className="p-3">{bandars.find(b => b.id === p.bandar)?.nama}</td>
                    <td className="p-3 font-semibold">{formatKg(p.tonase_gudang)}</td>
                    <td className="p-3">{p.status === "Selesai" ? <span className="text-green-600 font-medium">Selesai Disortir</span> : <span className="text-amber-600 font-medium">Menunggu Sortir</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {/* ── TAB 3: PROSES SORTIR ── */}
        <TabsContent value="sortir" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-lg">Riwayat Pemrosesan Grade</h3>
            <Button onClick={() => setIsSortirOpen(true)} className="bg-amber-600 hover:bg-amber-700"><Scale className="h-4 w-4 mr-2"/> Catat Hasil Sortir</Button>
          </div>
          <Card>
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b"><tr>
                <th className="p-3">Tanggal Sortir</th><th className="p-3">Sumber Batch</th><th className="p-3">Grade A</th><th className="p-3">Grade B</th><th className="p-3">Grade C</th><th className="p-3 text-red-600">Susut</th>
              </tr></thead>
              <tbody>
                {sortirs.map(s => (
                  <tr key={s.id} className="border-b">
                    <td className="p-3">{s.tanggal_sortir.slice(0,10)}</td>
                    <td className="p-3 font-mono text-xs">{pembelians.find(p=>p.id===s.pembelian_id)?.batch_id}</td>
                    <td className="p-3">{formatKg(s.grade_a)}</td><td className="p-3">{formatKg(s.grade_b)}</td><td className="p-3">{formatKg(s.grade_c)}</td>
                    <td className="p-3 text-red-600 font-medium">{formatKg(s.susut)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {/* ── TAB 4: PENGIRIMAN KELUAR ── */}
        <TabsContent value="pengiriman" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-lg">Riwayat Pengiriman (Delivery Batch)</h3>
            <Button onClick={() => setIsPengirimanOpen(true)} className="bg-emerald-600 hover:bg-emerald-700"><Send className="h-4 w-4 mr-2"/> Buat Pengiriman</Button>
          </div>
          <Card>
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b"><tr>
                <th className="p-3">ID Delivery</th><th className="p-3">Tanggal</th><th className="p-3">Buyer Tujuan</th><th className="p-3">Total Grade A</th><th className="p-3">Status</th>
              </tr></thead>
              <tbody>
                {pengirimans.map(p => (
                  <tr key={p.id} className="border-b">
                    <td className="p-3 font-mono text-emerald-600">{p.batch_id}</td>
                    <td className="p-3">{p.tanggal.slice(0,10)}</td>
                    <td className="p-3 font-semibold">{buyers.find(b => b.id === p.buyer)?.nama}</td>
                    <td className="p-3">{formatKg(p.qty_grade_a)}</td>
                    <td className="p-3"><span className="text-blue-600 font-medium">{p.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── DIALOG FORMS ── */}
      {/* 1. Form Pembelian */}
      <Dialog open={isPembelianOpen} onOpenChange={setIsPembelianOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Terima Barang dari Bandar</DialogTitle></DialogHeader>
          <form onSubmit={handleSimpanPembelian} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Tanggal Masuk</Label><Input type="date" value={formPb.tanggal} onChange={e=>setFormPb({...formPb, tanggal: e.target.value})} required/></div>
              <div className="space-y-1"><Label>Bandar Asal</Label>
                <Select value={formPb.bandar} onValueChange={v=>setFormPb({...formPb, bandar: v})} required>
                  <SelectTrigger><SelectValue placeholder="Pilih Bandar" /></SelectTrigger>
                  <SelectContent>{bandars.map(b => <SelectItem key={b.id} value={b.id}>{b.nama} ({b.kode})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Tonase Lapangan (Kg)</Label><Input type="number" value={formPb.tonase_lapangan} onChange={e=>setFormPb({...formPb, tonase_lapangan: e.target.value})} required/></div>
              <div className="space-y-1"><Label>Tonase Timbang Gudang (Kg)</Label><Input type="number" value={formPb.tonase_gudang} onChange={e=>setFormPb({...formPb, tonase_gudang: e.target.value})} required/></div>
              <div className="col-span-2 space-y-1"><Label>Harga Beli per Kg (Rp)</Label><Input type="number" value={formPb.harga_per_kg} onChange={e=>setFormPb({...formPb, harga_per_kg: e.target.value})} required/></div>
            </div>
            <DialogFooter><Button type="submit">Catat Penerimaan</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 2. Form Sortir */}
      <Dialog open={isSortirOpen} onOpenChange={setIsSortirOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Catat Hasil Sortir & Grade</DialogTitle></DialogHeader>
          <form onSubmit={handleSimpanSortir} className="space-y-4">
            <div className="space-y-1"><Label>Pilih Batch yang Belum Disortir</Label>
              <Select value={formSortir.pembelian_id} onValueChange={v=>setFormSortir({...formSortir, pembelian_id: v})} required>
                <SelectTrigger><SelectValue placeholder="Pilih Batch Pembelian (PB-...)" /></SelectTrigger>
                <SelectContent>{unSortedPembelians.map(p => <SelectItem key={p.id} value={p.id}>{p.batch_id} — {formatKg(p.tonase_gudang)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Grade A (Kg)</Label><Input type="number" value={formSortir.grade_a} onChange={e=>setFormSortir({...formSortir, grade_a: e.target.value})}/></div>
              <div className="space-y-1"><Label>Grade B (Kg)</Label><Input type="number" value={formSortir.grade_b} onChange={e=>setFormSortir({...formSortir, grade_b: e.target.value})}/></div>
              <div className="space-y-1"><Label>Grade C (Kg)</Label><Input type="number" value={formSortir.grade_c} onChange={e=>setFormSortir({...formSortir, grade_c: e.target.value})}/></div>
              <div className="space-y-1"><Label>Baby (Kg)</Label><Input type="number" value={formSortir.grade_baby} onChange={e=>setFormSortir({...formSortir, grade_baby: e.target.value})}/></div>
              <div className="space-y-1"><Label>Reject / Buang (Kg)</Label><Input type="number" value={formSortir.grade_reject} onChange={e=>setFormSortir({...formSortir, grade_reject: e.target.value})}/></div>
            </div>
            <DialogFooter><Button type="submit" className="bg-amber-600 hover:bg-amber-700">Simpan & Update Stok</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 3. Form Pengiriman */}
      <Dialog open={isPengirimanOpen} onOpenChange={setIsPengirimanOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Buat Surat Jalan (Delivery)</DialogTitle></DialogHeader>
          <form onSubmit={handleSimpanPengiriman} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Tanggal Kirim</Label><Input type="date" value={formDl.tanggal} onChange={e=>setFormDl({...formDl, tanggal: e.target.value})} required/></div>
              <div className="space-y-1"><Label>Buyer Tujuan</Label>
                <Select value={formDl.buyer} onValueChange={v=>setFormDl({...formDl, buyer: v})} required>
                  <SelectTrigger><SelectValue placeholder="Pilih Buyer" /></SelectTrigger>
                  <SelectContent>{buyers.map(b => <SelectItem key={b.id} value={b.id}>{b.nama} ({b.kategori})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Kirim Grade A (Max: {currentStock.gradeA})</Label><Input type="number" value={formDl.qty_grade_a} onChange={e=>setFormDl({...formDl, qty_grade_a: e.target.value})}/></div>
              <div className="space-y-1"><Label>Kirim Grade B (Max: {currentStock.gradeB})</Label><Input type="number" value={formDl.qty_grade_b} onChange={e=>setFormDl({...formDl, qty_grade_b: e.target.value})}/></div>
            </div>
            <DialogFooter><Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">Buat Pengiriman</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}