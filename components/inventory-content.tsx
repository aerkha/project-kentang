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
import { PackageSearch, Truck, CheckSquare, Send, Plus, ArrowDownToLine, Scale, ArrowUpRight, Database, Users, Building2 } from "lucide-react";

const formatKg = (n: number) => `${new Intl.NumberFormat("id-ID").format(n)} Kg`;

export function InventoryContent() {
  const { 
    bandars, buyers, pembelians, sortirs, pengirimans, currentStock, isLoading, 
    addPembelian, addSortir, addPengiriman, addBandar, addBuyer,
    generatePembelianId, generatePengirimanId 
  } = useInventory();

  // Dialog States
  const [isPembelianOpen, setIsPembelianOpen] = useState(false);
  const [isSortirOpen, setIsSortirOpen] = useState(false);
  const [isPengirimanOpen, setIsPengirimanOpen] = useState(false);
  const [isBandarOpen, setIsBandarOpen] = useState(false);
  const [isBuyerOpen, setIsBuyerOpen] = useState(false);

  // Form States
  const defaultDate = todayWibStr().slice(0, 10);
  const [formPb, setFormPb] = useState({ tanggal: defaultDate, bandar: "", tonase_lapangan: "", tonase_gudang: "", harga_per_kg: "" });
  const [formSortir, setFormSortir] = useState({ pembelian_id: "", tanggal_sortir: defaultDate, grade_a: "", grade_b: "", grade_c: "", grade_baby: "", grade_reject: "" });
  const [formDl, setFormDl] = useState({ tanggal: defaultDate, buyer: "", qty_grade_a: "", qty_grade_b: "", qty_grade_c: "", qty_grade_baby: "" });
  const [formBandar, setFormBandar] = useState({ kode: "", nama: "", telepon: "", alamat: "" });
  const [formBuyer, setFormBuyer] = useState({ kode: "", nama: "", kategori: "Pasar Induk", telepon: "", alamat: "" });

  if (isLoading) return <div className="text-center py-20 animate-pulse text-muted-foreground">Memuat data gudang...</div>;

  // ── HANDLERS MASTER DATA ──
  const handleSimpanBandar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addBandar({ ...formBandar, kode: formBandar.kode.toUpperCase() });
      toast.success("Bandar berhasil ditambahkan!");
      setIsBandarOpen(false);
      setFormBandar({ kode: "", nama: "", telepon: "", alamat: "" });
    } catch (err) { toast.error("Gagal menyimpan Bandar. Pastikan Kode belum dipakai."); }
  };

  const handleSimpanBuyer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addBuyer({ ...formBuyer, kode: formBuyer.kode.toUpperCase() });
      toast.success("Buyer berhasil ditambahkan!");
      setIsBuyerOpen(false);
      setFormBuyer({ kode: "", nama: "", kategori: "Pasar Induk", telepon: "", alamat: "" });
    } catch (err) { toast.error("Gagal menyimpan Buyer. Pastikan Kode belum dipakai."); }
  };

  // ── HANDLERS TRANSAKSI GUDANG ──
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
        batch_id: batchId, tanggal: formPb.tanggal + " 00:00:00", bandar: bandar.id,
        tonase_lapangan: tonaseL, tonase_gudang: tonaseG, harga_per_kg: harga,
        total_harga: tonaseL * harga, tujuan: "Gudang (Sortir)", status: "Menunggu Sortir"
      });
      toast.success(`Berhasil mencatat batch ${batchId}`);
      setIsPembelianOpen(false);
    } catch (err) { toast.error("Gagal menyimpan pembelian"); }
  };

  const handleSimpanSortir = async (e: React.FormEvent) => {
    e.preventDefault();
    const pb = pembelians.find(p => p.id === formSortir.pembelian_id);
    if (!pb) return toast.error("Pilih Batch Pembelian");

    const a = parseFloat(formSortir.grade_a) || 0; const b = parseFloat(formSortir.grade_b) || 0;
    const c = parseFloat(formSortir.grade_c) || 0; const baby = parseFloat(formSortir.grade_baby) || 0;
    const reject = parseFloat(formSortir.grade_reject) || 0;
    const susut = pb.tonase_gudang - (a + b + c + baby + reject);

    try {
      await addSortir({
        pembelian_id: pb.id, tanggal_sortir: formSortir.tanggal_sortir + " 00:00:00",
        grade_a: a, grade_b: b, grade_c: c, grade_baby: baby, grade_reject: reject, susut: susut,
      });
      toast.success("Hasil sortir berhasil dicatat, stok gudang bertambah.");
      setIsSortirOpen(false);
    } catch (err) { toast.error("Gagal menyimpan sortir"); }
  };

  const handleSimpanPengiriman = async (e: React.FormEvent) => {
    e.preventDefault();
    const buyer = buyers.find(b => b.id === formDl.buyer);
    if (!buyer) return toast.error("Pilih Buyer");

    const a = parseFloat(formDl.qty_grade_a) || 0; const b = parseFloat(formDl.qty_grade_b) || 0;
    const c = parseFloat(formDl.qty_grade_c) || 0; const baby = parseFloat(formDl.qty_grade_baby) || 0;

    if (a > currentStock.gradeA || b > currentStock.gradeB || c > currentStock.gradeC || baby > currentStock.baby) {
      return toast.error("Gagal: Jumlah pengiriman melebihi sisa stok di gudang!");
    }

    const batchId = generatePengirimanId(buyer.kode, formDl.tanggal);
    try {
      await addPengiriman({
        batch_id: batchId, tanggal: formDl.tanggal + " 00:00:00", buyer: buyer.id,
        qty_grade_a: a, qty_grade_b: b, qty_grade_c: c, qty_grade_baby: baby, status: "Dalam Perjalanan"
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
        {/* Tambahan Tab Master Data di ujung */}
        <TabsList className="bg-muted/50 p-1 flex-wrap h-auto">
          <TabsTrigger value="stok"><PackageSearch className="h-4 w-4 mr-2" /> Stok Tersedia</TabsTrigger>
          <TabsTrigger value="pembelian"><ArrowDownToLine className="h-4 w-4 mr-2" /> Barang Masuk</TabsTrigger>
          <TabsTrigger value="sortir"><CheckSquare className="h-4 w-4 mr-2" /> Proses Sortir</TabsTrigger>
          <TabsTrigger value="pengiriman"><ArrowUpRight className="h-4 w-4 mr-2" /> Pengiriman</TabsTrigger>
          <TabsTrigger value="master"><Database className="h-4 w-4 mr-2" /> Master Data</TabsTrigger>
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

        {/* ── TAB 5: MASTER DATA (BARU) ── */}
        <TabsContent value="master" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Tabel Master Bandar */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg flex items-center gap-2"><Users className="w-5 h-5"/> Daftar Bandar</CardTitle>
                <Button size="sm" onClick={() => setIsBandarOpen(true)}><Plus className="h-4 w-4 mr-1"/> Tambah</Button>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm text-left mt-2">
                  <thead className="bg-muted/50 border-b"><tr><th className="p-2">Kode</th><th className="p-2">Nama Bandar</th><th className="p-2">Telepon</th></tr></thead>
                  <tbody>
                    {bandars.map(b => (
                      <tr key={b.id} className="border-b"><td className="p-2 font-mono">{b.kode}</td><td className="p-2 font-semibold">{b.nama}</td><td className="p-2">{b.telepon || "-"}</td></tr>
                    ))}
                    {bandars.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">Belum ada data bandar</td></tr>}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Tabel Master Buyer */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg flex items-center gap-2"><Building2 className="w-5 h-5"/> Daftar Buyer</CardTitle>
                <Button size="sm" onClick={() => setIsBuyerOpen(true)}><Plus className="h-4 w-4 mr-1"/> Tambah</Button>
              </CardHeader>
              <CardContent>
                <table className="w-full text-sm text-left mt-2">
                  <thead className="bg-muted/50 border-b"><tr><th className="p-2">Kode</th><th className="p-2">Nama Buyer</th><th className="p-2">Kategori</th></tr></thead>
                  <tbody>
                    {buyers.map(b => (
                      <tr key={b.id} className="border-b"><td className="p-2 font-mono">{b.kode}</td><td className="p-2 font-semibold">{b.nama}</td><td className="p-2">{b.kategori}</td></tr>
                    ))}
                    {buyers.length === 0 && <tr><td colSpan={3} className="p-4 text-center text-muted-foreground">Belum ada data buyer</td></tr>}
                  </tbody>
                </table>
              </CardContent>
            </Card>

          </div>
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
                <SelectTrigger><SelectValue placeholder="Pilih Batch Pembelian" /></SelectTrigger>
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

      {/* 4. Form Tambah Bandar */}
      <Dialog open={isBandarOpen} onOpenChange={setIsBandarOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tambah Data Bandar Baru</DialogTitle></DialogHeader>
          <form onSubmit={handleSimpanBandar} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Kode (Misal: UJG)</Label><Input value={formBandar.kode} onChange={e=>setFormBandar({...formBandar, kode: e.target.value})} maxLength={4} required placeholder="Maks 4 Huruf" className="uppercase"/></div>
              <div className="space-y-1"><Label>Nama Bandar</Label><Input value={formBandar.nama} onChange={e=>setFormBandar({...formBandar, nama: e.target.value})} required/></div>
              <div className="col-span-2 space-y-1"><Label>No. Telepon / WA (Opsional)</Label><Input type="tel" value={formBandar.telepon} onChange={e=>setFormBandar({...formBandar, telepon: e.target.value})}/></div>
              <div className="col-span-2 space-y-1"><Label>Alamat (Opsional)</Label><Input value={formBandar.alamat} onChange={e=>setFormBandar({...formBandar, alamat: e.target.value})}/></div>
            </div>
            <DialogFooter><Button type="submit">Simpan Bandar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 5. Form Tambah Buyer */}
      <Dialog open={isBuyerOpen} onOpenChange={setIsBuyerOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tambah Data Buyer Baru</DialogTitle></DialogHeader>
          <form onSubmit={handleSimpanBuyer} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Kode (Misal: LTM)</Label><Input value={formBuyer.kode} onChange={e=>setFormBuyer({...formBuyer, kode: e.target.value})} maxLength={6} required placeholder="Maks 6 Huruf" className="uppercase"/></div>
              <div className="space-y-1"><Label>Kategori Buyer</Label>
                <Select value={formBuyer.kategori} onValueChange={v=>setFormBuyer({...formBuyer, kategori: v})} required>
                  <SelectTrigger><SelectValue placeholder="Pilih Kategori" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pasar Induk">Pasar Induk</SelectItem>
                    <SelectItem value="Modern Trade">Modern Trade / Supermarket</SelectItem>
                    <SelectItem value="Ekspor">Ekspor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1"><Label>Nama Buyer / Perusahaan</Label><Input value={formBuyer.nama} onChange={e=>setFormBuyer({...formBuyer, nama: e.target.value})} required/></div>
              <div className="col-span-2 space-y-1"><Label>No. Telepon (Opsional)</Label><Input type="tel" value={formBuyer.telepon} onChange={e=>setFormBuyer({...formBuyer, telepon: e.target.value})}/></div>
              <div className="col-span-2 space-y-1"><Label>Alamat (Opsional)</Label><Input value={formBuyer.alamat} onChange={e=>setFormBuyer({...formBuyer, alamat: e.target.value})}/></div>
            </div>
            <DialogFooter><Button type="submit">Simpan Buyer</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}