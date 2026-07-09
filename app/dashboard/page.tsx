import { InventoryContent } from "@/components/inventory-content";

export const metadata = { 
  title: "Dashboard Analitik | MinBun ERP" 
};

export default function DashboardPage() {
  return (
    <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard Analitik</h1>
        <p className="text-muted-foreground mt-1">Ringkasan performa dan operasional MinBun.</p>
      </div>
      
      {/* Catatan: Jika sebelumnya Anda memiliki komponen grafik 
        (misalnya <DashboardContent />), silakan import dan masukkan kembali di sini.
      */}
      <div className="p-12 text-center bg-muted/20 rounded-xl border-2 border-dashed border-muted">
        <p className="text-muted-foreground">
          Halaman Dashboard Utama. Anda bisa menambahkan grafik atau metrik ringkasan di sini nanti.
        </p>
      </div>
    </div>
  );
}