import { InventoryContent } from "@/components/inventory-content";

export const metadata = {
  title: "Gudang & Logistik | MinBun ERP",
};

export default function InventoryPage() {
  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
      <InventoryContent />
    </div>
  );
}