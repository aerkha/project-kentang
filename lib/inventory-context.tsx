"use client";

import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react";
import pb from "./pocketbase";

export interface MasterBandar { id: string; kode: string; nama: string; telepon: string; alamat: string; }
export interface MasterBuyer  { id: string; kode: string; nama: string; kategori: string; telepon: string; alamat: string; }
export interface InvPembelian { id: string; batch_id: string; tanggal: string; bandar: string; tonase_lapangan: number; tonase_gudang: number; harga_per_kg: number; total_harga: number; tujuan: string; status: string; }
export interface InvSortir    { id: string; batch_id?: string; pembelian_id: string; tanggal_sortir: string; grade_a: number; grade_b: number; grade_c: number; grade_baby: number; grade_reject: number; susut: number; pic_sortir: string; }
export interface InvPengiriman{ id: string; batch_id: string; sj_id?: string; tanggal: string; tujuan?: string; supir?: string; plat_nomor: string; buyer: string; qty_grade_a: number; qty_grade_b: number; qty_grade_c: number; qty_grade_baby: number; qty_campur?: number; }
export interface StockData {
  gradeA: number; gradeB: number; gradeC: number; baby: number; reject: number;
}

interface InventoryContextType {
  bandars: MasterBandar[]; buyers: MasterBuyer[];
  pembelians: InvPembelian[]; sortirs: InvSortir[]; pengirimans: InvPengiriman[];
  currentStock: StockData;
  updatePengiriman: (id: string, data: Partial<InvPengiriman>) => Promise<void>;
  isLoading: boolean;
  addPembelian: (data: Partial<InvPembelian>) => Promise<void>;
  addSortir: (data: Partial<InvSortir>) => Promise<void>;
  addPengiriman: (data: Partial<InvPengiriman>) => Promise<void>;
  addBandar: (data: Partial<MasterBandar>) => Promise<void>;
  addBuyer: (data: Partial<MasterBuyer>) => Promise<void>;
  generatePembelianId: (bandarKode: string, date: string) => string;
  generatePengirimanId: (buyerKode: string, date: string) => string;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [bandars, setBandars] = useState<MasterBandar[]>([]);
  const [buyers, setBuyers] = useState<MasterBuyer[]>([]);
  const [pembelians, setPembelians] = useState<InvPembelian[]>([]);
  const [sortirs, setSortirs] = useState<InvSortir[]>([]);
  const [pengirimans, setPengirimans] = useState<InvPengiriman[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [resBandar, resBuyer, resPembelian, resSortir, resPengiriman] = await Promise.all([
          pb.collection("master_bandar").getFullList({ sort: "nama" }),
          pb.collection("master_buyer").getFullList({ sort: "nama" }),
          pb.collection("inv_pembelian").getFullList({ sort: "-tanggal" }),
          pb.collection("inv_sortir").getFullList({ sort: "-tanggal_sortir" }),
          pb.collection("inv_pengiriman").getFullList({ sort: "-tanggal" }),
        ]);
        
        setBandars(resBandar as unknown as MasterBandar[]);
        setBuyers(resBuyer as unknown as MasterBuyer[]);
        setPembelians(resPembelian as unknown as InvPembelian[]);
        setSortirs(resSortir as unknown as InvSortir[]);
        setPengirimans(resPengiriman as unknown as InvPengiriman[]);
      } catch (err) {
        console.error("Gagal memuat data inventory:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const currentStock = useMemo(() => {
    let gradeA = 0, gradeB = 0, gradeC = 0, baby = 0, reject = 0;
    sortirs.forEach(s => { gradeA += s.grade_a; gradeB += s.grade_b; gradeC += s.grade_c; baby += s.grade_baby; reject += s.grade_reject; });
    pengirimans.forEach(p => { gradeA -= p.qty_grade_a; gradeB -= p.qty_grade_b; gradeC -= p.qty_grade_c; baby -= p.qty_grade_baby; });
    return { gradeA, gradeB, gradeC, baby, reject };
  }, [sortirs, pengirimans]);

  const addPembelian = async (data: Partial<InvPembelian>) => {
    const record = await pb.collection("inv_pembelian").create(data);
    setPembelians(prev => [record as unknown as InvPembelian, ...prev]);
  };

  const addSortir = async (data: Partial<InvSortir>) => {
    const record = await pb.collection("inv_sortir").create(data);
    await pb.collection("inv_pembelian").update(data.pembelian_id!, { status: "Selesai" });
    setSortirs(prev => [record as unknown as InvSortir, ...prev]);
    setPembelians(prev => prev.map(p => p.id === data.pembelian_id ? { ...p, status: "Selesai" } : p));
  };

  const addPengiriman = async (data: Partial<InvPengiriman>) => {
    const record = await pb.collection("inv_pengiriman").create(data);
    setPengirimans(prev => [record as unknown as InvPengiriman, ...prev]);
  };

  const updatePengiriman = async (id: string, data: Partial<InvPengiriman>) => {
    const record = await pb.collection("inv_pengiriman").update(id, data);
    setPengirimans(prev => prev.map(p => p.id === id ? record as unknown as InvPengiriman : p));
  };

  // ── TAMBAHAN FUNGSI BARU ──
  const addBandar = async (data: Partial<MasterBandar>) => {
    const record = await pb.collection("master_bandar").create(data);
    setBandars(prev => [...prev, record as unknown as MasterBandar].sort((a, b) => a.nama.localeCompare(b.nama)));
  };

  const addBuyer = async (data: Partial<MasterBuyer>) => {
    const record = await pb.collection("master_buyer").create(data);
    setBuyers(prev => [...prev, record as unknown as MasterBuyer].sort((a, b) => a.nama.localeCompare(b.nama)));
  };

  const formatYYMMDD = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toISOString().slice(2, 10).replace(/-/g, ""); 
  };

  const generatePembelianId = (bandarKode: string, date: string) => {
    const count = pembelians.filter(p => p.batch_id.startsWith(`PB-${formatYYMMDD(date)}-${bandarKode}-`)).length;
    return `PB-${formatYYMMDD(date)}-${bandarKode}-${String(count + 1).padStart(3, "0")}`;
  };

  const generatePengirimanId = (buyerKode: string, date: string) => {
    const count = pengirimans.filter(p => p.batch_id.startsWith(`DL-${formatYYMMDD(date)}-${buyerKode}-`)).length;
    return `DL-${formatYYMMDD(date)}-${buyerKode}-${String(count + 1).padStart(3, "0")}`;
  };

  return (
    <InventoryContext.Provider value={{ 
      bandars, buyers, pembelians, sortirs, pengirimans, currentStock, isLoading, 
      addPembelian, addSortir, addPengiriman, updatePengiriman, addBandar, addBuyer, // <-- Jangan lupa diekspor
      generatePembelianId, generatePengirimanId 
    }}>
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error("useInventory must be used within an InventoryProvider");
  return ctx;
}