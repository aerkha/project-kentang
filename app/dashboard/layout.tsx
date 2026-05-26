"use client";

import { useEffect } from "react";
import { redirect } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { InvestorsProvider } from "@/lib/investors-context";
import { BrokersProvider } from "@/lib/brokers-context";
import { MouProvider } from "@/lib/mou-context";
import { TransaksiProvider } from "@/lib/transaksi-context";
import { AppSidebar } from "@/components/app-sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (!isAuthenticated) {
      redirect("/");
    }
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return null;
  }

  // Provider di-mount di sini, SETELAH auth terkonfirmasi.
  // Ini mencegah getFullList() dipanggil sebelum user login.
  return (
    <InvestorsProvider>
      <BrokersProvider>
        <MouProvider>
          <TransaksiProvider>
            <div className="min-h-screen bg-background">
              <AppSidebar />
              {/* pt-14 = tinggi mobile top bar; md:pt-0 = desktop tidak perlu padding atas */}
              <main className="ml-0 md:ml-64 pt-14 md:pt-0 p-4 md:p-6">
                {children}
              </main>
            </div>
          </TransaksiProvider>
        </MouProvider>
      </BrokersProvider>
    </InvestorsProvider>
  );
}
