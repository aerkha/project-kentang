import { DashboardContent } from "@/components/dashboard-content";

export const metadata = { 
  title: "Dashboard Analitik | MinBun ERP" 
};

export default function DashboardPage() {
  return (
    <div className="space-y-6 p-4 md:p-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard Analitik</h1>
        <p className="text-muted-foreground mt-1">Ringkasan portfolio investor MinBun.</p>
      </div>
      <DashboardContent />
    </div>
  );
}