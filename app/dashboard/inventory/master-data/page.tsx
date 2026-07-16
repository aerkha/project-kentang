"use client";
import { useState, useEffect, type FormEvent } from "react";
import { useInventory } from "@/lib/inventory-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Database, Users, Building2, Plus, Edit } from "lucide-react";
import { toast } from "sonner";

export default function MasterDataPage() {
  // Tambahkan fungsi updateBandar dan updateBuyer dari context
  const { bandars, buyers, addBandar, addBuyer, updateBandar, updateBuyer, isLoading } = useInventory();
  
  const [isBandarOpen, setIsBandarOpen] = useState(false);
  const [isBuyerOpen, setIsBuyerOpen] = useState(false);
  
  // State form ditambahkan properti 'id' untuk mendeteksi mode Edit/Tambah
  const initialBandar = { id: "", kode: "", nama: "", telepon: "", alamat: "" };
  const initialBuyer = { id: "", kode: "", nama: "", kategori: "Pasar Induk", perusahaan: "", npwp: "", telepon: "", alamat: "" };

  const [formBandar, setFormBandar] = useState(initialBandar);
  const [formBuyer, setFormBuyer] = useState(initialBuyer);

  // -----------------------------------------------------------------
  // 1. GENERATOR SMART ID (KODE OTOMATIS)
  // -----------------------------------------------------------------
  const generateSmartKode = (inputText: string, prefix: string, dataList: any[]) => {
    if (!inputText) return "";
    let cleanText = inputText.replace(/^(PT\.?|CV\.?|UD\.?|TOKO)\s+/i, "").trim();
    let consonants = cleanText.replace(/[AIUEOaiueo\s\.\,\-\_]/g, "");
    if (consonants.length < 3) consonants = cleanText.replace(/[\s\.\,\-\_]/g, "");
    
    let abbr = consonants.substring(0, 3).toUpperCase();
    while (abbr.length < 3) abbr += "X";
    const baseKode = `${prefix}-${abbr}`;

    const existing = dataList.filter(item => item.kode && item.kode.startsWith(baseKode));
    if (existing.length === 0) return baseKode; 

    let maxSuffix = 0;
    existing.forEach(item => {
      const parts = item.kode.split('-');
      if (parts.length === 3) {
        const num = parseInt(parts[2], 10);
        if (!isNaN(num) && num > maxSuffix) maxSuffix = num;
      }
    });
    return `${baseKode}-${String(maxSuffix + 1).padStart(3, "0")}`;
  };

  // -----------------------------------------------------------------
  // 2. EFFECT HOOKS UNTUK AUTO-TYPING KODE
  // -----------------------------------------------------------------
  
  useEffect(() => {
    // Generate HANYA jika sedang Tambah Baru (id kosong)
    if (isBandarOpen && !formBandar.id) {
      if (formBandar.nama) {
        const autoKode = generateSmartKode(formBandar.nama, "BND", bandars);
        setFormBandar(prev => ({ ...prev, kode: autoKode }));
      } else {
        setFormBandar(prev => ({ ...prev, kode: "" }));
      }
    }
  }, [formBandar.nama, isBandarOpen, bandars, formBandar.id]);

  useEffect(() => {
    // Generate HANYA jika sedang Tambah Baru (id kosong)
    if (isBuyerOpen && !formBuyer.id) {
      const textAcuan = formBuyer.perusahaan || formBuyer.nama;
      if (textAcuan) {
        const autoKode = generateSmartKode(textAcuan, "BYR", buyers);
        setFormBuyer(prev => ({ ...prev, kode: autoKode }));
      } else {
        setFormBuyer(prev => ({ ...prev, kode: "" }));
      }
    }
  }, [formBuyer.perusahaan, formBuyer.nama, isBuyerOpen, buyers, formBuyer.id]);


  // -----------------------------------------------------------------
  // 3. HANDLER BUKA MODAL EDIT
  // -----------------------------------------------------------------
  const handleEditBandar = (bandar: any) => {
    setFormBandar({ ...bandar }); // Isi form dengan data yang dipilih
    setIsBandarOpen(true);
  };

  const handleEditBuyer = (buyer: any) => {
    setFormBuyer({ ...buyer }); // Isi form dengan data yang dipilih
    setIsBuyerOpen(true);
  };

  // -----------------------------------------------------------------
  // 4. HANDLER SUBMIT (TAMBAH & UPDATE)
  // -----------------------------------------------------------------
  if (isLoading) return <div className="animate-pulse p-8 text-center text-primary font-medium">Memuat Data Master...</div>;

  const handleSimpanBandar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const payload = { ...formBandar, kode: formBandar.kode.toUpperCase() };
      
      if (formBandar.id) {
        // Mode UPDATE
        const { id, ...updateData } = payload;
        if (updateBandar) await updateBandar(id, updateData);
        toast.success("Data Bandar berhasil diperbarui!");
      } else {
        // Mode TAMBAH
        const { id, ...createData } = payload;
        await addBandar(createData);
        toast.success("Bandar baru ditambahkan!"); 
      }
      setIsBandarOpen(false); 
      setFormBandar(initialBandar);
    } catch { toast.error("Gagal menyimpan data Bandar."); }
  };

  const handleSimpanBuyer = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const payload = { ...formBuyer, kode: formBuyer.kode.toUpperCase() };

      if (formBuyer.id) {
        // Mode UPDATE
        const { id, ...updateData } = payload;
        if (updateBuyer) await updateBuyer(id, updateData);
        toast.success("Data Buyer berhasil diperbarui!");
      } else {
        // Mode TAMBAH
        const { id, ...createData } = payload;
        await addBuyer(createData);
        toast.success("Buyer baru ditambahkan!"); 
      }
      setIsBuyerOpen(false); 
      setFormBuyer(initialBuyer);
    } catch { toast.error("Gagal menyimpan data Buyer."); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Database className="h-6 w-6 text-primary" /> Master Data</h1>
        <p className="text-sm text-muted-foreground mt-1">Kelola daftar Bandar (Pemasok) dan Buyer (Pelanggan).</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* TABEL BANDAR */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg flex items-center gap-2"><Users className="w-5 h-5" /> Daftar Bandar</CardTitle>
            <Button size="sm" onClick={() => { setFormBandar(initialBandar); setIsBandarOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Tambah</Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left mt-2">
                <thead className="bg-muted/50 border-b">
                  <tr><th className="p-2">Kode</th><th className="p-2">Nama</th><th className="p-2">Telepon</th><th className="p-2 text-center w-16">Aksi</th></tr>
                </thead>
                <tbody>
                  {bandars.map((b: any) => (
                    <tr key={b.id} className="border-b hover:bg-muted/30">
                      <td className="p-2 font-mono text-indigo-700 font-bold">{b.kode}</td>
                      <td className="p-2 font-semibold">{b.nama}</td>
                      <td className="p-2">{b.telepon || "-"}</td>
                      <td className="p-2 text-center">
                        <Button variant="ghost" size="icon" onClick={() => handleEditBandar(b)} className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50" title="Edit Data">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {bandars.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Belum ada data Bandar.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* TABEL BUYER */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg flex items-center gap-2"><Building2 className="w-5 h-5" /> Daftar Buyer</CardTitle>
            <Button size="sm" onClick={() => { setFormBuyer(initialBuyer); setIsBuyerOpen(true); }}><Plus className="h-4 w-4 mr-1" /> Tambah</Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left mt-2 whitespace-nowrap">
                <thead className="bg-muted/50 border-b">
                  <tr><th className="p-2">Kode</th><th className="p-2">Perusahaan & PIC</th><th className="p-2">Kategori</th><th className="p-2">NPWP</th><th className="p-2 text-center w-16">Aksi</th></tr>
                </thead>
                <tbody>
                  {buyers.map((b: any) => (
                    <tr key={b.id} className="border-b hover:bg-muted/30">
                      <td className="p-2 font-mono text-indigo-700 font-bold">{b.kode}</td>
                      <td className="p-2">
                        <div className="font-bold text-slate-800">{b.perusahaan || "-"}</div>
                        <div className="text-xs text-muted-foreground">Attn: {b.nama}</div>
                      </td>
                      <td className="p-2">{b.kategori}</td>
                      <td className="p-2 font-mono text-xs">{b.npwp || "-"}</td>
                      <td className="p-2 text-center">
                        <Button variant="ghost" size="icon" onClick={() => handleEditBuyer(b)} className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50" title="Edit Data">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {buyers.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Belum ada data Buyer.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* MODAL FORM BANDAR */}
      <Dialog open={isBandarOpen} onOpenChange={setIsBandarOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{formBandar.id ? "Edit Data Bandar" : "Tambah Data Bandar"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSimpanBandar} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Nama Bandar</Label>
                <Input placeholder="Ketik nama untuk mengenerate kode..." value={formBandar.nama} onChange={e => setFormBandar({ ...formBandar, nama: e.target.value })} required />
              </div>
              <div className="space-y-1">
                <Label>Kode Bandar</Label>
                <Input value={formBandar.kode} onChange={e => setFormBandar({ ...formBandar, kode: e.target.value })} required className="uppercase font-mono font-bold text-indigo-700" />
              </div>
              <div className="space-y-1">
                <Label>No. Telepon / WA</Label>
                <Input type="tel" value={formBandar.telepon || ""} onChange={e => setFormBandar({ ...formBandar, telepon: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">
                {formBandar.id ? "Simpan Perubahan" : "Simpan Bandar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL FORM BUYER */}
      <Dialog open={isBuyerOpen} onOpenChange={setIsBuyerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{formBuyer.id ? "Edit Data Buyer" : "Tambah Data Buyer"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSimpanBuyer} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              
              <div className="space-y-1.5">
                <Label>Nama Perusahaan / PT</Label>
                <Input placeholder="Contoh: PT. Sayur Segar Makmur" value={formBuyer.perusahaan || ""} onChange={e => setFormBuyer({ ...formBuyer, perusahaan: e.target.value })} />
              </div>
              
              <div className="space-y-1.5">
                <Label>Kategori</Label>
                <Select value={formBuyer.kategori} onValueChange={v => setFormBuyer({ ...formBuyer, kategori: v })} required>
                  <SelectTrigger><SelectValue placeholder="Pilih Kategori" /></SelectTrigger>
                  <SelectContent><SelectItem value="Pasar Induk">Pasar Induk</SelectItem><SelectItem value="Modern Trade">Modern Trade / Supermarket</SelectItem><SelectItem value="Ekspor">Ekspor</SelectItem></SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Nama PIC / Pembeli <span className="text-red-500">*</span></Label>
                <Input placeholder="Nama penanggung jawab" value={formBuyer.nama} onChange={e => setFormBuyer({ ...formBuyer, nama: e.target.value })} required />
              </div>

              <div className="space-y-1.5">
                <Label>Kode Buyer</Label>
                <Input value={formBuyer.kode} onChange={e => setFormBuyer({ ...formBuyer, kode: e.target.value })} required className="uppercase font-mono font-bold text-indigo-700" />
              </div>

              <div className="col-span-2 grid grid-cols-2 gap-4 pt-2 border-t mt-2">
                <div className="space-y-1.5">
                  <Label>Nomor NPWP</Label>
                  <Input placeholder="12.345.678.9-012.000" value={formBuyer.npwp || ""} onChange={e => setFormBuyer({ ...formBuyer, npwp: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>No. Telp / WhatsApp</Label>
                  <Input type="tel" placeholder="081234567890" value={formBuyer.telepon || ""} onChange={e => setFormBuyer({ ...formBuyer, telepon: e.target.value })} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label>Alamat Lengkap</Label>
                  <Input placeholder="Contoh: Jl. Pasar Induk Blok A No. 1..." value={formBuyer.alamat || ""} onChange={e => setFormBuyer({ ...formBuyer, alamat: e.target.value })} />
                </div>
              </div>

            </div>
            <DialogFooter>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">
                {formBuyer.id ? "Simpan Perubahan" : "Simpan Buyer"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}