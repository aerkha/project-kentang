"use client";

import { useEffect } from "react";
import { redirect } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { InvestorsProvider } from "@/lib/investors-context";
import { BrokersProvider } from "@/lib/brokers-context";
import { PksProvider } from "@/lib/pks-context";
import { TransaksiProvider } from "@/lib/transaksi-context";
import { PengeluaranProvider } from "@/lib/cashflow-context";
import { SettingsProvider } from "@/lib/settings-context";
import { ReminderLogsProvider } from "@/lib/reminder-logs-context";
import { ModalEntriesProvider } from "@/lib/modal-entries-context";
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
        <PksProvider>
          <TransaksiProvider>
          <PengeluaranProvider>
          <SettingsProvider>
          <ReminderLogsProvider>
          <ModalEntriesProvider>
            <div className="min-h-screen bg-background">
              <AppSidebar />
              {/* pt-14 = tinggi mobile top bar; md:pt-0 = desktop tidak perlu padding atas */}
              <main className="ml-0 md:ml-64 pt-14 md:pt-0 p-4 md:p-6">
                {children}
              </main>
            </div>
          </ModalEntriesProvider>
          </ReminderLogsProvider>
          </SettingsProvider>
          </PengeluaranProvider>
          </TransaksiProvider>
        </PksProvider>
      </BrokersProvider>
    </InvestorsProvider>
  );
}
