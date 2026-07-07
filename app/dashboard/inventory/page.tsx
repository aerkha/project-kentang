import { PackageSearch } from "lucide-react";

export const metadata = {
  title: "Manajemen Gudang | MinBun ERP",
};

export default function InventoryPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center space-y-4">
      <div className="h-20 w-20 bg-primary/10 text-primary rounded-full flex items-center justify-center">
        <PackageSearch className="h-10 w-10" />
      </div>
      <div className="space-y-2 max-w-md">
        <h1 className="text-2xl font-bold text-foreground">Manajemen Gudang & Logistik</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          Modul ini sedang dalam tahap persiapan. Nantinya Anda dapat mencatat penerimaan barang, mengelola stok, hingga pengiriman barang di sini.
        </p>
      </div>
    </div>
  );
}