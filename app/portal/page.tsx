"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PackageSearch, Receipt, Wallet, ShieldAlert, Sprout, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PortalPage() {
  const { user, logout } = useAuth();
  const router = useRouter();

  // Proteksi: Jika investor/broker nyasar ke sini, langsung lempar ke dashboard
  useEffect(() => {
    if (user?.role === "investor" || user?.role === "broker") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  if (!user) return null; // Loading state

  const isAdmin = user.role === "admin";
  const isUser = user.role === "user";
  const isOwner = user.role === "owner";

  // Definisi Modul Portal
  const modules = [
    {
      id: "transaksi",
      title: "Pengelolaan Investasi",
      description: "Dashboard analitik, kelola investor, broker, PKS, catatan transaksi, dan reminder harian.",
      icon: Receipt,
      href: "/dashboard",
      color: "text-blue-600",
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
      show: true, // Semua role portal bisa melihat ini
    },
    {
      id: "gudang",
      title: "Gudang & Operasional",
      description: "Penerimaan barang, manajemen stok, dan pengiriman barang.",
      icon: PackageSearch,
      href: "/dashboard/inventory",
      color: "text-emerald-600",
      bgColor: "bg-emerald-100 dark:bg-emerald-900/30",
      show: isAdmin || isUser || isOwner,
    },
    {
      id: "keuangan",
      title: "Keuangan",
      description: "Pencatatan arus kas dana operasional MinBun.",
      icon: Wallet,
      href: "/dashboard/cash-flow",
      color: "text-orange-600",
      bgColor: "bg-orange-100 dark:bg-orange-900/30",
      show: isAdmin || isUser, // Disembunyikan dari owner
    },
    {
      id: "it",
      title: "IT & Admin",
      description: "Manajemen akun pengguna, konfigurasi hak akses, dan pengaturan utama sistem (RBAC).",
      icon: ShieldAlert,
      href: "/dashboard/users",
      color: "text-purple-600",
      bgColor: "bg-purple-100 dark:bg-purple-900/30",
      show: isAdmin, // Hanya admin
    },
  ];

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      {/* ── Header Portal ── */}
      <header className="h-16 bg-background border-b flex items-center justify-between px-6 lg:px-12 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-primary">
            <Sprout className="w-5 h-5 text-primary-foreground" />
          </div>
          <span className="font-bold text-lg text-foreground">MinBun Portal</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs text-muted-foreground capitalize mt-0.5">{user.role}</p>
          </div>
          <Button variant="outline" size="sm" onClick={logout}>
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      {/* ── Main Content ── */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-6 lg:p-12">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Selamat Datang, {user.name.split(" ")[0]}!</h1>
          <p className="text-muted-foreground mt-2">Silakan pilih modul aplikasi yang ingin Anda akses hari ini.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {modules.map((mod) => {
            if (!mod.show) return null;
            const Icon = mod.icon;
            
            return (
              <Link key={mod.id} href={mod.href} className="group">
                <Card className="h-full border-border/50 transition-all hover:border-primary/50 hover:shadow-md cursor-pointer bg-background">
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <div className={`p-3 rounded-lg ${mod.bgColor} transition-colors group-hover:scale-105`}>
                        <Icon className={`w-6 h-6 ${mod.color}`} />
                      </div>
                      <CardTitle className="text-xl group-hover:text-primary transition-colors">{mod.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-sm leading-relaxed text-muted-foreground">
                      {mod.description}
                    </CardDescription>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}