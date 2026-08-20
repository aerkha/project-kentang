"use client";
import { useState, useEffect, type FormEvent } from "react";
import { useInventory } from "@/lib/inventory-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Database, Users, Building2, Plus, Edit } from "lucide-react";
import { toast } from "sonner";

export default function MasterDataPage() {
  // Tambahkan fungsi updateBandar dan updateBuyer dari context
  const { bandars, buyers, addBandar, addBuyer, updateBandar, updateBuyer, isLoading } = useInventory();
  
  const [isBandarOpen, setIsBandarOpen] = useState(false);
  const [isBuyerOpen, setIsBuyerOpen] = useState(false);
  
  // State form ditambahkan properti 'id' untuk mendeteksi mode Edit/Tambah
  const initialBandar = { 
    id: "", 
    kode: "", 
    nama: "",
    tipe_pemasok: "perorangan",
    alamat_pembayaran: "",
    telp_bisnis: "",
    hp_whatsapp: "",
    email: "",
    nama_bank: "",
    nomor_rekening: "",
    syarat_pembayaran: "COD",
    default_diskon: 0,
    deskripsi: "",
    akun_utang: "",
    akun_uang_muka: "",
    pajak_termasuk: false,
    tipe_id_pajak: "NPWP",
    nomor_wajib_pajak: "",
    nama_wajib_pajak: "",
    nitku: "",
    tipe_transaksi: "Perolehan Dalam Negri",
    alamat_pajak_sama: true,
    alamat_pajak: ""
  };
  const initialBuyer = { 
    id: "", 
    kode: "", 
    nama: "",
    alamat_penagihan: "",
    telp_bisnis: "",
    hp_whatsapp: "",
    email: "",
    alamat_pengiriman_sama: true,
    alamat_pengiriman: "",
    harga: 0,
    diskon: 0,
    syarat_pembayaran: "COD",
    deskripsi: "",
    konsinyasi: false,
    akun_piutang: "",
    akun_uang_muka: "",
    akun_penjualan: "",
    akun_diskon_barang: "",
    akun_beban_pokok_penjualan: "",
    akun_retur_penjualan: "",
    akun_diskon_penjualan: "",
    pajak_termasuk: false,
    tipe_id_pajak: "NPWP",
    nomor_wajib_pajak: "",
    nama_wajib_pajak: "",
    nitku: "",
    kode_negara: "",
    tipe_transaksi: "Faktur Pajak",
    alamat_pajak_sama: true,
    alamat_pajak: ""
  };

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
      if (formBuyer.nama) {
        const autoKode = generateSmartKode(formBuyer.nama, "BYR", buyers);
        setFormBuyer(prev => ({ ...prev, kode: autoKode }));
      } else {
        setFormBuyer(prev => ({ ...prev, kode: "" }));
      }
    }
  }, [formBuyer.nama, isBuyerOpen, buyers, formBuyer.id]);


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

      {/* Ringkasan Total (Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Bandar</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{bandars.length}</div>
            <p className="text-xs text-muted-foreground">Pemasok aktif terdaftar</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Buyer</CardTitle>
            <Building2 className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{buyers.length}</div>
            <p className="text-xs text-muted-foreground">Pelanggan aktif terdaftar</p>
          </CardContent>
        </Card>
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
                       <td className="p-2">{b.hp_whatsapp || b.telp_bisnis || "-"}</td>
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
                  <tr><th className="p-2">Kode</th><th className="p-2">Nama</th><th className="p-2">Telepon</th><th className="p-2 text-center w-16">Aksi</th></tr>
                </thead>
                <tbody>
                  {buyers.map((b: any) => (
                    <tr key={b.id} className="border-b hover:bg-muted/30">
                      <td className="p-2 font-mono text-indigo-700 font-bold">{b.kode}</td>
                      <td className="p-2 font-semibold">{b.nama}</td>
                      <td className="p-2">{b.hp_whatsapp || b.telp_bisnis || "-"}</td>
                      <td className="p-2 text-center">
                        <Button variant="ghost" size="icon" onClick={() => handleEditBuyer(b)} className="h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50" title="Edit Data">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {buyers.length === 0 && <tr><td colSpan={4} className="p-4 text-center text-muted-foreground">Belum ada data Buyer.</td></tr>}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* MODAL FORM BANDAR */}
      <Dialog open={isBandarOpen} onOpenChange={setIsBandarOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{formBandar.id ? "Edit Data Bandar" : "Tambah Data Bandar"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSimpanBandar} className="space-y-4">
            <Tabs defaultValue="umum" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="umum">Umum</TabsTrigger>
                <TabsTrigger value="pembelian">Pembelian</TabsTrigger>
                <TabsTrigger value="pajak">Pajak</TabsTrigger>
              </TabsList>

              {/* TAB UMUM */}
              <TabsContent value="umum" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1">
                    <Label>Nama <span className="text-red-500">*</span></Label>
                    <Input placeholder="Ketik nama untuk mengenerate kode..." value={formBandar.nama} onChange={e => setFormBandar({ ...formBandar, nama: e.target.value })} required />
                  </div>
                  <div className="space-y-1">
                    <Label>ID Pemasok <span className="text-red-500">*</span></Label>
                    <Input value={formBandar.kode} onChange={e => setFormBandar({ ...formBandar, kode: e.target.value })} required className="uppercase font-mono font-bold text-indigo-700" placeholder="Isi otomatis" />
                  </div>
                  <div className="space-y-1">
                    <Label>Tipe Pemasok <span className="text-red-500">*</span></Label>
                    <Select value={formBandar.tipe_pemasok} onValueChange={v => setFormBandar({ ...formBandar, tipe_pemasok: v })} required>
                      <SelectTrigger><SelectValue placeholder="Pilih Tipe" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="perorangan">Perorangan</SelectItem>
                        <SelectItem value="perusahaan">Perusahaan</SelectItem>
                        <SelectItem value="pemerintah">Pemerintah</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label>Alamat Pembayaran</Label>
                    <Textarea placeholder="Alamat lengkap..." value={formBandar.alamat_pembayaran} onChange={e => setFormBandar({ ...formBandar, alamat_pembayaran: e.target.value })} rows={2} />
                  </div>
                  <div className="space-y-1">
                    <Label>No. Telp. Bisnis</Label>
                    <Input type="tel" placeholder="021-12345678" value={formBandar.telp_bisnis} onChange={e => setFormBandar({ ...formBandar, telp_bisnis: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Handphone/Whatsapp</Label>
                    <Input type="tel" placeholder="08123456789" value={formBandar.hp_whatsapp} onChange={e => setFormBandar({ ...formBandar, hp_whatsapp: e.target.value })} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label>Email</Label>
                    <Input type="email" placeholder="email@example.com" value={formBandar.email} onChange={e => setFormBandar({ ...formBandar, email: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Nama Bank</Label>
                    <Input placeholder="Contoh: Bank BCA" value={formBandar.nama_bank} onChange={e => setFormBandar({ ...formBandar, nama_bank: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Nomor Rekening</Label>
                    <Input placeholder="1234567890" value={formBandar.nomor_rekening} onChange={e => setFormBandar({ ...formBandar, nomor_rekening: e.target.value })} />
                  </div>
                </div>
              </TabsContent>

              {/* TAB PEMBELIAN */}
              <TabsContent value="pembelian" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Syarat Pembayaran <span className="text-red-500">*</span></Label>
                    <Select value={formBandar.syarat_pembayaran} onValueChange={v => setFormBandar({ ...formBandar, syarat_pembayaran: v })} required>
                      <SelectTrigger><SelectValue placeholder="Pilih Syarat" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="COD">COD</SelectItem>
                        <SelectItem value="Set manual">Set manual</SelectItem>
                        <SelectItem value="TOP 15">TOP 15</SelectItem>
                        <SelectItem value="TOP 21">TOP 21</SelectItem>
                        <SelectItem value="TOP 30">TOP 30</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Default Diskon (%)</Label>
                    <Input type="number" min="0" max="100" step="0.01" placeholder="0" value={formBandar.default_diskon} onChange={e => setFormBandar({ ...formBandar, default_diskon: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label>Deskripsi</Label>
                    <Textarea placeholder="Catatan tambahan tentang pemasok..." value={formBandar.deskripsi} onChange={e => setFormBandar({ ...formBandar, deskripsi: e.target.value })} rows={3} />
                  </div>
                  <div className="space-y-1">
                    <Label>Akun Utang</Label>
                    <Input placeholder="Kode akun utang" value={formBandar.akun_utang} onChange={e => setFormBandar({ ...formBandar, akun_utang: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Akun Uang Muka</Label>
                    <Input placeholder="Kode akun uang muka" value={formBandar.akun_uang_muka} onChange={e => setFormBandar({ ...formBandar, akun_uang_muka: e.target.value })} />
                  </div>
                </div>
              </TabsContent>

              {/* TAB PAJAK */}
              <TabsContent value="pajak" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 flex items-center space-x-2">
                    <Checkbox 
                      id="pajak_termasuk" 
                      checked={formBandar.pajak_termasuk} 
                      onCheckedChange={(checked) => setFormBandar({ ...formBandar, pajak_termasuk: checked as boolean })} 
                    />
                    <Label htmlFor="pajak_termasuk" className="cursor-pointer font-normal">Default Faktur sudah termasuk Pajak</Label>
                  </div>
                  <div className="space-y-1">
                    <Label>Tipe ID Pajak <span className="text-red-500">*</span></Label>
                    <Select value={formBandar.tipe_id_pajak} onValueChange={v => setFormBandar({ ...formBandar, tipe_id_pajak: v })} required>
                      <SelectTrigger><SelectValue placeholder="Pilih Tipe" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NIK">NIK</SelectItem>
                        <SelectItem value="NPWP">NPWP</SelectItem>
                        <SelectItem value="Passpor">Passpor</SelectItem>
                        <SelectItem value="Lainnya">Lainnya</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Nomor Wajib Pajak</Label>
                    <Input placeholder="12.345.678.9-012.000" value={formBandar.nomor_wajib_pajak} onChange={e => setFormBandar({ ...formBandar, nomor_wajib_pajak: e.target.value })} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label>Nama Wajib Pajak</Label>
                    <Input placeholder="Nama sesuai dokumen pajak" value={formBandar.nama_wajib_pajak} onChange={e => setFormBandar({ ...formBandar, nama_wajib_pajak: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>NITKU</Label>
                    <Input placeholder="Nomor NITKU" value={formBandar.nitku} onChange={e => setFormBandar({ ...formBandar, nitku: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Tipe Transaksi <span className="text-red-500">*</span></Label>
                    <Select value={formBandar.tipe_transaksi} onValueChange={v => setFormBandar({ ...formBandar, tipe_transaksi: v })} required>
                      <SelectTrigger><SelectValue placeholder="Pilih Tipe" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Digunggung">Digunggung</SelectItem>
                        <SelectItem value="Tidak dikreditkan">Tidak dikreditkan</SelectItem>
                        <SelectItem value="Perolehan Dalam Negri">Perolehan Dalam Negri</SelectItem>
                        <SelectItem value="Impor">Impor</SelectItem>
                        <SelectItem value="Faktur Pajak">Faktur Pajak</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 flex items-center space-x-2">
                    <Checkbox 
                      id="alamat_pajak_sama" 
                      checked={formBandar.alamat_pajak_sama} 
                      onCheckedChange={(checked) => setFormBandar({ ...formBandar, alamat_pajak_sama: checked as boolean })} 
                    />
                    <Label htmlFor="alamat_pajak_sama" className="cursor-pointer font-normal">Alamat pajak sama dengan alamat pembayaran</Label>
                  </div>
                  {!formBandar.alamat_pajak_sama && (
                    <div className="col-span-2 space-y-1">
                      <Label>Alamat Pajak</Label>
                      <Textarea placeholder="Alamat untuk keperluan pajak..." value={formBandar.alamat_pajak} onChange={e => setFormBandar({ ...formBandar, alamat_pajak: e.target.value })} rows={2} />
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-6">
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700">
                {formBandar.id ? "Simpan Perubahan" : "Simpan Bandar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL FORM BUYER */}
      <Dialog open={isBuyerOpen} onOpenChange={setIsBuyerOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{formBuyer.id ? "Edit Data Buyer" : "Tambah Data Buyer"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSimpanBuyer} className="space-y-4">
            <Tabs defaultValue="umum" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="umum">Umum</TabsTrigger>
                <TabsTrigger value="pengiriman">Pengiriman</TabsTrigger>
                <TabsTrigger value="penjualan">Penjualan</TabsTrigger>
                <TabsTrigger value="pajak">Pajak</TabsTrigger>
              </TabsList>

              {/* TAB UMUM */}
              <TabsContent value="umum" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 space-y-1">
                    <Label>Nama <span className="text-red-500">*</span></Label>
                    <Input placeholder="Ketik nama untuk mengenerate kode..." value={formBuyer.nama} onChange={e => setFormBuyer({ ...formBuyer, nama: e.target.value })} required />
                  </div>
                  <div className="space-y-1">
                    <Label>ID Pelanggan <span className="text-red-500">*</span></Label>
                    <Input value={formBuyer.kode} onChange={e => setFormBuyer({ ...formBuyer, kode: e.target.value })} required className="uppercase font-mono font-bold text-indigo-700" placeholder="Isi otomatis" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label>Alamat Penagihan</Label>
                    <Textarea placeholder="Alamat lengkap..." value={formBuyer.alamat_penagihan} onChange={e => setFormBuyer({ ...formBuyer, alamat_penagihan: e.target.value })} rows={2} />
                  </div>
                  <div className="space-y-1">
                    <Label>No. Telp. Bisnis</Label>
                    <Input type="tel" placeholder="021-12345678" value={formBuyer.telp_bisnis} onChange={e => setFormBuyer({ ...formBuyer, telp_bisnis: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Handphone/Whatsapp</Label>
                    <Input type="tel" placeholder="08123456789" value={formBuyer.hp_whatsapp} onChange={e => setFormBuyer({ ...formBuyer, hp_whatsapp: e.target.value })} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label>Email</Label>
                    <Input type="email" placeholder="email@example.com" value={formBuyer.email} onChange={e => setFormBuyer({ ...formBuyer, email: e.target.value })} />
                  </div>
                </div>
              </TabsContent>

              {/* TAB PENGIRIMAN */}
              <TabsContent value="pengiriman" className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="alamat_pengiriman_sama" 
                      checked={formBuyer.alamat_pengiriman_sama} 
                      onCheckedChange={(checked) => setFormBuyer({ ...formBuyer, alamat_pengiriman_sama: checked as boolean })} 
                    />
                    <Label htmlFor="alamat_pengiriman_sama" className="cursor-pointer font-normal">Sama dengan alamat penagihan</Label>
                  </div>
                  {!formBuyer.alamat_pengiriman_sama && (
                    <div className="space-y-1">
                      <Label>Alamat Pengiriman</Label>
                      <Textarea placeholder="Alamat untuk pengiriman barang..." value={formBuyer.alamat_pengiriman} onChange={e => setFormBuyer({ ...formBuyer, alamat_pengiriman: e.target.value })} rows={3} />
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* TAB PENJUALAN */}
              <TabsContent value="penjualan" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Harga</Label>
                    <Input type="number" min="0" step="0.01" placeholder="0" value={formBuyer.harga} onChange={e => setFormBuyer({ ...formBuyer, harga: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Diskon (%)</Label>
                    <Input type="number" min="0" max="100" step="0.01" placeholder="0" value={formBuyer.diskon} onChange={e => setFormBuyer({ ...formBuyer, diskon: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Syarat Pembayaran <span className="text-red-500">*</span></Label>
                    <Select value={formBuyer.syarat_pembayaran} onValueChange={v => setFormBuyer({ ...formBuyer, syarat_pembayaran: v })} required>
                      <SelectTrigger><SelectValue placeholder="Pilih Syarat" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="COD">COD</SelectItem>
                        <SelectItem value="TOP 15">TOP 15</SelectItem>
                        <SelectItem value="TOP 21">TOP 21</SelectItem>
                        <SelectItem value="TOP 30">TOP 30</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label>Deskripsi</Label>
                    <Textarea placeholder="Catatan tambahan tentang pelanggan..." value={formBuyer.deskripsi} onChange={e => setFormBuyer({ ...formBuyer, deskripsi: e.target.value })} rows={2} />
                  </div>
                  <div className="col-span-2 flex items-center space-x-2">
                    <Checkbox 
                      id="konsinyasi" 
                      checked={formBuyer.konsinyasi} 
                      onCheckedChange={(checked) => setFormBuyer({ ...formBuyer, konsinyasi: checked as boolean })} 
                    />
                    <Label htmlFor="konsinyasi" className="cursor-pointer font-normal">Ya, Perusahaan menitipkan barang ke Pelanggan ini</Label>
                  </div>
                  <div className="space-y-1">
                    <Label>Akun Piutang</Label>
                    <Input placeholder="Kode akun piutang" value={formBuyer.akun_piutang} onChange={e => setFormBuyer({ ...formBuyer, akun_piutang: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Akun Uang Muka</Label>
                    <Input placeholder="Kode akun uang muka" value={formBuyer.akun_uang_muka} onChange={e => setFormBuyer({ ...formBuyer, akun_uang_muka: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Akun Penjualan</Label>
                    <Input placeholder="Kode akun penjualan" value={formBuyer.akun_penjualan} onChange={e => setFormBuyer({ ...formBuyer, akun_penjualan: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Akun Diskon Barang</Label>
                    <Input placeholder="Kode akun diskon barang" value={formBuyer.akun_diskon_barang} onChange={e => setFormBuyer({ ...formBuyer, akun_diskon_barang: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Akun Beban Pokok Penjualan</Label>
                    <Input placeholder="Kode akun beban pokok" value={formBuyer.akun_beban_pokok_penjualan} onChange={e => setFormBuyer({ ...formBuyer, akun_beban_pokok_penjualan: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Akun Retur Penjualan</Label>
                    <Input placeholder="Kode akun retur" value={formBuyer.akun_retur_penjualan} onChange={e => setFormBuyer({ ...formBuyer, akun_retur_penjualan: e.target.value })} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label>Akun Diskon Penjualan</Label>
                    <Input placeholder="Kode akun diskon penjualan" value={formBuyer.akun_diskon_penjualan} onChange={e => setFormBuyer({ ...formBuyer, akun_diskon_penjualan: e.target.value })} />
                  </div>
                </div>
              </TabsContent>

              {/* TAB PAJAK */}
              <TabsContent value="pajak" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2 flex items-center space-x-2">
                    <Checkbox 
                      id="pajak_termasuk_buyer" 
                      checked={formBuyer.pajak_termasuk} 
                      onCheckedChange={(checked) => setFormBuyer({ ...formBuyer, pajak_termasuk: checked as boolean })} 
                    />
                    <Label htmlFor="pajak_termasuk_buyer" className="cursor-pointer font-normal">Default Total Faktur sudah termasuk Pajak</Label>
                  </div>
                  <div className="space-y-1">
                    <Label>Tipe ID Pajak <span className="text-red-500">*</span></Label>
                    <Select value={formBuyer.tipe_id_pajak} onValueChange={v => setFormBuyer({ ...formBuyer, tipe_id_pajak: v })} required>
                      <SelectTrigger><SelectValue placeholder="Pilih Tipe" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NIK">NIK</SelectItem>
                        <SelectItem value="NPWP">NPWP</SelectItem>
                        <SelectItem value="Passpor">Passpor</SelectItem>
                        <SelectItem value="Lainnya">Lainnya</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Nomor Wajib Pajak</Label>
                    <Input placeholder="12.345.678.9-012.000" value={formBuyer.nomor_wajib_pajak} onChange={e => setFormBuyer({ ...formBuyer, nomor_wajib_pajak: e.target.value })} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label>Nama Wajib Pajak</Label>
                    <Input placeholder="Nama sesuai dokumen pajak" value={formBuyer.nama_wajib_pajak} onChange={e => setFormBuyer({ ...formBuyer, nama_wajib_pajak: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>NITKU</Label>
                    <Input placeholder="Nomor NITKU" value={formBuyer.nitku} onChange={e => setFormBuyer({ ...formBuyer, nitku: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Kode Negara</Label>
                    <Input placeholder="ID, SG, MY, dll" value={formBuyer.kode_negara} onChange={e => setFormBuyer({ ...formBuyer, kode_negara: e.target.value })} />
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label>Tipe Transaksi <span className="text-red-500">*</span></Label>
                    <Select value={formBuyer.tipe_transaksi} onValueChange={v => setFormBuyer({ ...formBuyer, tipe_transaksi: v })} required>
                      <SelectTrigger><SelectValue placeholder="Pilih Tipe" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Digunggung">Digunggung</SelectItem>
                        <SelectItem value="Ekspor">Ekspor</SelectItem>
                        <SelectItem value="Dokumen Tertentu">Dokumen Tertentu</SelectItem>
                        <SelectItem value="Faktur Pajak">Faktur Pajak</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 flex items-center space-x-2">
                    <Checkbox 
                      id="alamat_pajak_sama_buyer" 
                      checked={formBuyer.alamat_pajak_sama} 
                      onCheckedChange={(checked) => setFormBuyer({ ...formBuyer, alamat_pajak_sama: checked as boolean })} 
                    />
                    <Label htmlFor="alamat_pajak_sama_buyer" className="cursor-pointer font-normal">Sama dengan alamat penagihan</Label>
                  </div>
                  {!formBuyer.alamat_pajak_sama && (
                    <div className="col-span-2 space-y-1">
                      <Label>Alamat Pajak</Label>
                      <Textarea placeholder="Alamat untuk keperluan pajak..." value={formBuyer.alamat_pajak} onChange={e => setFormBuyer({ ...formBuyer, alamat_pajak: e.target.value })} rows={2} />
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-6">
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