import { InventoryProvider } from "@/lib/inventory-context";

export default function InventoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <InventoryProvider>
      <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto">
        {children}
      </div>
    </InventoryProvider>
  );
}