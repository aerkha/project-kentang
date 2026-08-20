"use client";

import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from "react";
import pb from "./pocketbase";

export interface MasterBandar { 
  id: string; 
  kode: string; 
  nama: string; 
  tipe_pemasok: string;
  alamat_pembayaran: string;
  telp_bisnis: string;
  hp_whatsapp: string;
  email: string;
  nama_bank: string;
  nomor_rekening: string;
  syarat_pembayaran: string;
  default_diskon: number;
  deskripsi: string;
  akun_utang: string;
  akun_uang_muka: string;
  pajak_termasuk: boolean;
  tipe_id_pajak: string;
  nomor_wajib_pajak: string;
  nama_wajib_pajak: string;
  nitku: string;
  tipe_transaksi: string;
  alamat_pajak_sama: boolean;
  alamat_pajak: string;
  // Legacy fields for backward compatibility
  telepon?: string;
  alamat?: string;
}
export interface MasterBuyer { id: string; kode: string; nama: string; kategori: string; telepon: string; alamat: string; perusahaan?: string; npwp?: string; }
export interface InvPembelian { id: string; batch_id: string; tanggal: string; bandar: string; tonase_lapangan: number; tonase_gudang: number; harga_per_kg: number; total_harga: number; tujuan: string; status: string; }
export interface InvSortir { id: string; batch_id?: string; pembelian_id: string; tanggal_sortir: string; grade_a: number; grade_b: number; grade_c: number; grade_baby: number; grade_reject: number; susut: number; pic_sortir: string; }
export interface InvPengiriman { id: string; batch_id: string; sj_id?: string; invoice_id?: string; tanggal: string; tujuan?: string; supir?: string; plat_nomor: string; buyer: string; qty_grade_a: number; qty_grade_b: number; qty_grade_c: number; qty_grade_baby: number; qty_campur?: number; }
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
  addInvoice: (data: Partial<InvInvoice>, pengirimanIds?: string[]) => Promise<void>;
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
    sortirs.forEach((s) => {
      gradeA += s.grade_a;
      gradeB += s.grade_b;
      gradeC += s.grade_c;
      baby += s.grade_baby;
      reject += s.grade_reject;
    });
    pengirimans.forEach((p) => {
      gradeA -= p.qty_grade_a;
      gradeB -= p.qty_grade_b;
      gradeC -= p.qty_grade_c;
      baby -= p.qty_grade_baby;
    });
    return { gradeA, gradeB, gradeC, baby, reject };
  }, [sortirs, pengirimans]);

  const addPembelian = async (data: Partial<InvPembelian>) => {
    // PATCH (kritis #3): sebelumnya `(data as { batch_id?: string }).batch_id = undefined`
    // memutasi object input pemanggil. Sekarang gunakan salinan lokal.
    const isBatchIdConflict = (err: unknown): boolean => {
      if (!err || typeof err !== "object") return false;
      const e = err as { data?: { data?: { batch_id?: { code?: string } } } };
      return e.data?.data?.batch_id?.code === "validation_not_unique";
    };

    const localData: Partial<InvPembelian> = { ...data };
    const baseId = localData.batch_id;
    let forceAuto = !baseId;
    for (let attempt = 0; attempt < 5; attempt++) {
      const batchId = forceAuto || !localData.batch_id
        ? `PB-AUTO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
        : localData.batch_id;
      const enriched = { ...localData, batch_id: batchId };
      try {
        const record = await pb.collection("inv_pembelian").create(enriched);
        setPembelians((prev) => [record as unknown as InvPembelian, ...prev]);
        return;
      } catch (err) {
        if (isBatchIdConflict(err) && attempt < 4) {
          forceAuto = true;
          continue;
        }
        throw err;
      }
    }
    throw new Error("addPembelian: gagal membuat batch_id unik setelah 5 percobaan");
  };

  const saveSortir = async (mode: "create" | "update", id: string | undefined, data: Partial<InvSortir>) => {
    const response = await fetch("/api/inventory/sortir", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pb.authStore.token}`,
      },
      body: JSON.stringify({ mode, id, data }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Gagal menyimpan hasil sortir.");
    return result.record as InvSortir;
  };

  const addSortir = async (data: Partial<InvSortir>) => {
    const record = await saveSortir("create", undefined, data);
    setSortirs((prev) => [record, ...prev]);
    setPembelians((prev) =>
      prev.map((p) => (p.id === data.pembelian_id ? { ...p, status: "Selesai" } : p)),
    );
  };

  const updateSortir = async (id: string, data: Partial<InvSortir>) => {
    const record = await saveSortir("update", id, data);
    setSortirs((prev) => prev.map((s) => (s.id === id ? record : s)));
    setPembelians((prev) =>
      prev.map((p) => (p.id === record.pembelian_id ? { ...p, status: "Selesai" } : p)),
    );
  };

  const savePengiriman = async (mode: "create" | "update", id: string | undefined, data: Partial<InvPengiriman>) => {
    const response = await fetch("/api/inventory/pengiriman", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pb.authStore.token}`,
      },
      body: JSON.stringify({ mode, id, data }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Gagal menyimpan pengiriman.");
    return result.record as InvPengiriman;
  };

  const addPengiriman = async (data: Partial<InvPengiriman>) => {
    const record = await savePengiriman("create", undefined, data);
    setPengirimans((prev) => [record, ...prev]);
  };

  const updatePengiriman = async (id: string, data: Partial<InvPengiriman>) => {
    const record = await savePengiriman("update", id, data);
    setPengirimans((prev) => prev.map((p) => (p.id === id ? record : p)));
  };

  const addInvoice = async (data: Partial<InvInvoice>, pengirimanIds: string[] = []) => {
    const response = await fetch("/api/inventory/invoice", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pb.authStore.token}`,
      },
      body: JSON.stringify({ invoice: data, pengirimanIds }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Gagal menerbitkan invoice.");
    setInvoices((prev) => [result.record as InvInvoice, ...prev]);
    if (pengirimanIds.length > 0) {
      setPengirimans((prev) => prev.map((p) =>
        pengirimanIds.includes(p.id)
          ? { ...p, invoice_id: (result.record as InvInvoice).id }
          : p,
      ));
    }
  };

  const updateInvoice = async (id: string, data: Partial<InvInvoice>) => {
    try {
      const record = await pb.collection("inv_invoice").update(id, data);
      setInvoices((prev) => prev.map((inv) => (inv.id === id ? (record as unknown as InvInvoice) : inv)));
    } catch (err) {
      console.error("Gagal update invoice:", err);
      throw err;
    }
  };

  const addBandar = async (data: Partial<MasterBandar>) => {
    const record = await pb.collection("master_bandar").create(data);
    setBandars((prev) =>
      [...prev, record as unknown as MasterBandar].sort((a, b) => a.nama.localeCompare(b.nama))
    );
  };

  const addBuyer = async (data: Partial<MasterBuyer>) => {
    const record = await pb.collection("master_buyer").create(data);
    setBuyers((prev) =>
      [...prev, record as unknown as MasterBuyer].sort((a, b) => a.nama.localeCompare(b.nama))
    );
  };

  const updateBandar = async (id: string, data: Partial<MasterBandar>) => {
    const record = await pb.collection("master_bandar").update(id, data);
    setBandars((prev) => prev.map((b) => (b.id === id ? (record as unknown as MasterBandar) : b)));
  };

  const updateBuyer = async (id: string, data: Partial<MasterBuyer>) => {
    const record = await pb.collection("master_buyer").update(id, data);
    setBuyers((prev) => prev.map((b) => (b.id === id ? (record as unknown as MasterBuyer) : b)));
  };

  const formatYYMMDD = (dateStr: string) => {
    const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
    return `${String(y).slice(-2)}${String(m).padStart(2, "0")}${String(d).padStart(2, "0")}`;
  };

  const generatePembelianId = (bandarKode: string, date: string) => {
    const count = pembelians.filter((p) => p.batch_id.startsWith(`PB-${formatYYMMDD(date)}-${bandarKode}-`)).length;
    return `PB-${formatYYMMDD(date)}-${bandarKode}-${String(count + 1).padStart(3, "0")}`;
  };

  const generatePengirimanId = (buyerKode: string, date: string) => {
    const count = pengirimans.filter((p) => p.batch_id.startsWith(`DL-${formatYYMMDD(date)}-${buyerKode}-`)).length;
    return `DL-${formatYYMMDD(date)}-${buyerKode}-${String(count + 1).padStart(3, "0")}`;
  };

  return (
    <InventoryContext.Provider
      value={{
        bandars,
        buyers,
        pembelians,
        sortirs,
        pengirimans,
        currentStock,
        invoices,
        isLoading,
        addPembelian,
        addSortir,
        updateSortir,
        addPengiriman,
        updatePengiriman,
        addBandar,
        addBuyer,
        updateBandar,
        updateBuyer,
        addInvoice,
        updateInvoice,
        generatePembelianId,
        generatePengirimanId,
      }}
    >
      {children}
    </InventoryContext.Provider>
  );
}

export function useInventory() {
  const ctx = useContext(InventoryContext);
  if (!ctx) throw new Error("useInventory must be used within an InventoryProvider");
  return ctx;
}
