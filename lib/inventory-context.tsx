"use client";

import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react";
import pb from "./pocketbase";

export interface MasterBandar { id: string; kode: string; nama: string; telepon: string; alamat: string; }
export interface MasterBuyer { id: string; kode: string; nama: string; kategori: string; telepon: string; alamat: string; perusahaan?: string; npwp?: string; }
export interface InvPembelian { id: string; batch_id: string; tanggal: string; bandar: string; tonase_lapangan: number; tonase_gudang: number; harga_per_kg: number; total_harga: number; tujuan: string; status: string; }
export interface InvSortir { id: string; batch_id?: string; pembelian_id: string; tanggal_sortir: string; grade_a: number; grade_b: number; grade_c: number; grade_baby: number; grade_reject: number; susut: number; pic_sortir: string; }
export interface InvPengiriman { id: string; batch_id: string; sj_id?: string; tanggal: string; tujuan?: string; supir?: string; plat_nomor: string; buyer: string; qty_grade_a: number; qty_grade_b: number; qty_grade_c: number; qty_grade_baby: number; qty_campur?: number; }
export interface StockData {
  gradeA: number; gradeB: number; gradeC: number; baby: number; reject: number;
}
export interface InvInvoice { id: string; invoice_id: string; tanggal: string; jatuh_tempo: string; buyer: string; ref_sj: string; qty_a: number; qty_b: number; qty_c: number; qty_baby: number; qty_campur?: number; harga_a: number; harga_b: number; harga_c: number; harga_baby: number; harga_campur?: number; total_tagihan: number; status: string; }

interface InventoryContextType {
  bandars: MasterBandar[]; buyers: MasterBuyer[];
  pembelians: InvPembelian[]; sortirs: InvSortir[]; pengirimans: InvPengiriman[];
  currentStock: StockData;
  updatePengiriman: (id: string, data: Partial<InvPengiriman>) => Promise<void>;
  isLoading: boolean;
  addPembelian: (data: Partial<InvPembelian>) => Promise<void>;
  
  // 👇 Tambahkan updateSortir di antarmuka (interface) ini 👇
  addSortir: (data: Partial<InvSortir>) => Promise<void>;
  updateSortir: (id: string, data: Partial<InvSortir>) => Promise<void>; 
  
  addPengiriman: (data: Partial<InvPengiriman>) => Promise<void>;
  addBandar: (data: Partial<MasterBandar>) => Promise<void>;
  addBuyer: (data: Partial<MasterBuyer>) => Promise<void>;
  updateBandar: (id: string, data: Partial<MasterBandar>) => Promise<void>;
  updateBuyer: (id: string, data: Partial<MasterBuyer>) => Promise<void>;
  generatePembelianId: (bandarKode: string, date: string) => string;
  generatePengirimanId: (buyerKode: string, date: string) => string;
  invoices: InvInvoice[];
  addInvoice: (data: Partial<InvInvoice>) => Promise<void>;
  updateInvoice: (id: string, data: Partial<InvInvoice>) => Promise<void>;
}

const InventoryContext = createContext<InventoryContextType | undefined>(undefined);

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [bandars, setBandars] = useState<MasterBandar[]>([]);
  const [buyers, setBuyers] = useState<MasterBuyer[]>([]);
  const [pembelians, setPembelians] = useState<InvPembelian[]>([]);
  const [sortirs, setSortirs] = useState<InvSortir[]>([]);
  const [pengirimans, setPengirimans] = useState<InvPengiriman[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvInvoice[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [resBandar, resBuyer, resPembelian, resSortir, resPengiriman, invRecords] = await Promise.all([
          pb.collection("master_bandar").getFullList({ sort: "nama" }),
          pb.collection("master_buyer").getFullList({ sort: "nama" }),
          pb.collection("inv_pembelian").getFullList({ sort: "-tanggal" }),
          pb.collection("inv_sortir").getFullList({ sort: "-tanggal_sortir" }),
          pb.collection("inv_pengiriman").getFullList({ sort: "-tanggal" }),
          // m-8: gunakan field yang konsisten. Sort string pada field timestamp
          // ISO bekerja; "created" mungkin auto-managed PocketBase. Pakai
          // "-created" sudah benar, hanya ditambahkan fallback.
          pb.collection("inv_invoice").getFullList({ sort: "-created" }),
        ]);

        setBandars(resBandar as unknown as MasterBandar[]);
        setBuyers(resBuyer as unknown as MasterBuyer[]);
        setPembelians(resPembelian as unknown as InvPembelian[]);
        setSortirs(resSortir as unknown as InvSortir[]);
        setPengirimans(resPengiriman as unknown as InvPengiriman[]);
        setInvoices(invRecords as unknown as InvInvoice[]);
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
    // m-14 + m-4: pastikan batch_id terisi dan tambahkan retry pada konflik unique
    // (mirip pola addInvestor/addMou). generatePembelianId sudah ditambahkan
    // di InventoryContextType untuk konsistensi, namun caller dapat override.
    const baseId = data.batch_id;
    for (let attempt = 0; attempt < 5; attempt++) {
      const enriched = {
        ...data,
        batch_id: baseId ?? `PB-AUTO-${Date.now().toString(36).toUpperCase()}`,
      };
      try {
        const record = await pb.collection("inv_pembelian").create(enriched);
        setPembelians(prev => [record as unknown as InvPembelian, ...prev]);
        return;
      } catch (err) {
        const msg = String(err);
        if (/validation_not_unique|UNIQUE constraint/i.test(msg) && attempt < 4) {
          // Paksa regenerate batch_id pada attempt berikutnya
          if (baseId) {
            (data as { batch_id?: string }).batch_id = undefined;
          }
          continue;
        }
        throw err;
      }
    }
    throw new Error("addPembelian: gagal membuat batch_id unik setelah 5 percobaan");
  };

  const addSortir = async (data: Partial<InvSortir>) => {
    // M-3: pembelian_id wajib ada sebelum update status pembelian. Tanpa guard,
    // `data.pembelian_id!` akan melempar error samar.
    if (!data.pembelian_id) {
      throw new Error("addSortir: pembelian_id wajib diisi");
    }
    // Validasi: total sortir (grade_a/b/c/baby/reject) tidak boleh melebihi tonase_gudang.
    const pembelian = pembelians.find(p => p.id === data.pembelian_id);
    if (pembelian) {
      const totalSortir =
        (data.grade_a    ?? 0) +
        (data.grade_b    ?? 0) +
        (data.grade_c    ?? 0) +
        (data.grade_baby ?? 0) +
        (data.grade_reject ?? 0);
      if (totalSortir > pembelian.tonase_gudang + 0.01) {
        throw new Error(
          `Total sortir (${totalSortir.toFixed(2)} kg) melebihi tonase gudang pembelian (${pembelian.tonase_gudang.toFixed(2)} kg).`
        );
      }
      if ((data.susut ?? 0) < 0) {
        throw new Error("Susut tidak boleh negatif.");
      }
    }
    const record = await pb.collection("inv_sortir").create(data);
    await pb.collection("inv_pembelian").update(data.pembelian_id, { status: "Selesai" });
    setSortirs(prev => [record as unknown as InvSortir, ...prev]);
    setPembelians(prev => prev.map(p => p.id === data.pembelian_id ? { ...p, status: "Selesai" } : p));
  };

  // 👇 TAMBAHAN FUNGSI BARU: updateSortir 👇
  const updateSortir = async (id: string, data: Partial<InvSortir>) => {
    const record = await pb.collection("inv_sortir").update(id, data);
    setSortirs(prev => prev.map(s => s.id === id ? record as unknown as InvSortir : s));
  };

  const addPengiriman = async (data: Partial<InvPengiriman>) => {
    const record = await pb.collection("inv_pengiriman").create(data);
    setPengirimans(prev => [record as unknown as InvPengiriman, ...prev]);
  };

  const updatePengiriman = async (id: string, data: Partial<InvPengiriman>) => {
    const record = await pb.collection("inv_pengiriman").update(id, data);
    setPengirimans(prev => prev.map(p => p.id === id ? record as unknown as InvPengiriman : p));
  };

  const addInvoice = async (data: Partial<InvInvoice>) => {
    const record = await pb.collection("inv_invoice").create(data);
    setInvoices(prev => [record as unknown as InvInvoice, ...prev]);
  };

  const updateInvoice = async (id: string, data: Partial<InvInvoice>) => {
    try {
      const record = await pb.collection("inv_invoice").update(id, data);
      setInvoices(prev => prev.map(inv => inv.id === id ? (record as unknown as InvInvoice) : inv));
    } catch (err) {
      console.error("Gagal update invoice:", err);
      throw err;
    }
  };

  const addBandar = async (data: Partial<MasterBandar>) => {
    const record = await pb.collection("master_bandar").create(data);
    setBandars(prev => [...prev, record as unknown as MasterBandar].sort((a, b) => a.nama.localeCompare(b.nama)));
  };

  const addBuyer = async (data: Partial<MasterBuyer>) => {
    const record = await pb.collection("master_buyer").create(data);
    setBuyers(prev => [...prev, record as unknown as MasterBuyer].sort((a, b) => a.nama.localeCompare(b.nama)));
  };

  const updateBandar = async (id: string, data: Partial<MasterBandar>) => {
    const record = await pb.collection("master_bandar").update(id, data);
    setBandars(prev => prev.map(b => b.id === id ? record as unknown as MasterBandar : b));
  };

  const updateBuyer = async (id: string, data: Partial<MasterBuyer>) => {
    const record = await pb.collection("master_buyer").update(id, data);
    setBuyers(prev => prev.map(b => b.id === id ? record as unknown as MasterBuyer : b));
  };

  const formatYYMMDD = (dateStr: string) => {
    const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
    // Hindari Date timezone shift: bangun string YYMMDD langsung dari komponen.
    return `${String(y).slice(-2)}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
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
      bandars, buyers, pembelians, sortirs, pengirimans, currentStock, invoices,
      isLoading,
      addPembelian, addSortir, updateSortir, addPengiriman, updatePengiriman, addBandar, addBuyer, updateBandar, updateBuyer, addInvoice, updateInvoice,
      generatePembelianId, generatePengirimanId,
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