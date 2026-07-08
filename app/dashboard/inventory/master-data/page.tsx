"use client";
import { useState } from "react";
import { useInventory } from "@/lib/inventory-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Database, Users, Building2, Plus } from "lucide-react";
import { toast } from "sonner";

export default function MasterDataPage() {
  const { bandars, buyers, addBandar, addBuyer, isLoading } = useInventory();
  const [isBandarOpen, setIsBandarOpen] = useState(false);
  const [isBuyerOpen, setIsBuyerOpen] = useState(false);
  const [formBandar, setFormBandar] = useState({ kode: "", nama: "", telepon: "", alamat: "" });
  const [formBuyer, setFormBuyer] = useState({ kode: "", nama: "", kategori: "Pasar Induk", telepon: "", alamat: "" });

  if (isLoading) return <div className="animate-pulse">Memuat...</div>;

  const handleSimpanBandar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addBandar({ ...formBandar, kode: formBandar.kode.toUpperCase() });
      toast.success("Bandar ditambahkan!"); setIsBandarOpen(false); setFormBandar({ kode: "", nama: "", telepon: "", alamat: "" });
    } catch { toast.error("Gagal menyimpan Bandar."); }
  };

  const handleSimpanBuyer = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addBuyer({ ...formBuyer, kode: formBuyer.kode.toUpperCase() });
      toast.success("Buyer ditambahkan!"); setIsBuyerOpen(false); setFormBuyer({ kode: "", nama: "", kategori: "Pasar Induk", telepon: "", alamat: "" });
    } catch { toast.error("Gagal menyimpan Buyer."); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Database className="h-6 w-6 text-primary"/> Master Data</h1>
        <p className="text-sm text-muted-foreground mt-1">Kelola daftar Bandar (Pemasok) dan Buyer (Pelanggan).</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg flex items-center gap-2"><Users className="w-5 h-5"/> Daftar Bandar</CardTitle>
            <Button size="sm" onClick={() => setIsBandarOpen(true)}><Plus className="h-4 w-4 mr-1"/> Tambah</Button>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm text-left mt-2">
              <thead className="bg-muted/50 border-b"><tr><th className="p-2">Kode</th><th className="p-2">Nama</th><th className="p-2">Telepon</th></tr></thead>
              <tbody>
                {bandars.map(b => (
                  <tr key={b.id} className="border-b"><td className="p-2 font-mono">{b.kode}</td><td className="p-2 font-semibold">{b.nama}</td><td className="p-2">{b.telepon || "-"}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg flex items-center gap-2"><Building2 className="w-5 h-5"/> Daftar Buyer</CardTitle>
            <Button size="sm" onClick={() => setIsBuyerOpen(true)}><Plus className="h-4 w-4 mr-1"/> Tambah</Button>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm text-left mt-2">
              <thead className="bg-muted/50 border-b"><tr><th className="p-2">Kode</th><th className="p-2">Nama</th><th className="p-2">Kategori</th></tr></thead>
              <tbody>
                {buyers.map(b => (
                  <tr key={b.id} className="border-b"><td className="p-2 font-mono">{b.kode}</td><td className="p-2 font-semibold">{b.nama}</td><td className="p-2">{b.kategori}</td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Form Dialog Bandar */}
      <Dialog open={isBandarOpen} onOpenChange={setIsBandarOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tambah Data Bandar</DialogTitle></DialogHeader>
          <form onSubmit={handleSimpanBandar} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Kode (Misal: UJG)</Label><Input value={formBandar.kode} onChange={e=>setFormBandar({...formBandar, kode: e.target.value})} maxLength={4} required className="uppercase"/></div>
              <div className="space-y-1"><Label>Nama Bandar</Label><Input value={formBandar.nama} onChange={e=>setFormBandar({...formBandar, nama: e.target.value})} required/></div>
              <div className="col-span-2 space-y-1"><Label>No. Telepon / WA</Label><Input type="tel" value={formBandar.telepon} onChange={e=>setFormBandar({...formBandar, telepon: e.target.value})}/></div>
            </div>
            <DialogFooter><Button type="submit">Simpan</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Form Dialog Buyer */}
      <Dialog open={isBuyerOpen} onOpenChange={setIsBuyerOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Tambah Data Buyer</DialogTitle></DialogHeader>
          <form onSubmit={handleSimpanBuyer} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Kode (Misal: LTM)</Label><Input value={formBuyer.kode} onChange={e=>setFormBuyer({...formBuyer, kode: e.target.value})} maxLength={6} required className="uppercase"/></div>
              <div className="space-y-1"><Label>Kategori</Label>
                <Select value={formBuyer.kategori} onValueChange={v=>setFormBuyer({...formBuyer, kategori: v})} required>
                  <SelectTrigger><SelectValue placeholder="Pilih Kategori" /></SelectTrigger>
                  <SelectContent><SelectItem value="Pasar Induk">Pasar Induk</SelectItem><SelectItem value="Modern Trade">Modern Trade / Supermarket</SelectItem><SelectItem value="Ekspor">Ekspor</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1"><Label>Nama Buyer / Perusahaan</Label><Input value={formBuyer.nama} onChange={e=>setFormBuyer({...formBuyer, nama: e.target.value})} required/></div>
            </div>
            <DialogFooter><Button type="submit">Simpan</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}