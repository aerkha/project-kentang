"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  Sprout, Users, BarChart3, LogOut, User, FileText, Receipt, 
  UserCog, Menu, X, Wallet, Bell, PackageSearch, ArrowLeft
} from "lucide-react";
import { 
  Database, ArrowDownToLine, CheckSquare, ArrowUpRight
} from "lucide-react";

export function AppSidebar() {
  const pathname  = usePathname();
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const close = () => setIsOpen(false);

  const isAdmin = user?.role === "admin";
  const isUser  = user?.role === "user";
  const isOwner = user?.role === "owner";
  
  // Hanya role ini yang punya akses ke halaman Portal
  const isPortalUser = isAdmin || isUser || isOwner;

  // 1. Deteksi Modul Aktif berdasarkan URL Path saat ini
  let activeModule = "transaksi"; // Default module
  if (pathname.startsWith("/dashboard/inventory")) activeModule = "gudang";
  else if (pathname.startsWith("/dashboard/cash-flow")) activeModule = "keuangan";
  else if (pathname.startsWith("/dashboard/users")) activeModule = "it";

  // 2. Siapkan Menu Sesuai Modul Aktif
  let moduleTitle = "";
  let currentMenus = [];

  if (activeModule === "gudang") {
    moduleTitle = "Gudang & Logistik";
    currentMenus = [
      { name: "Manajemen Stok",   href: "/dashboard/inventory",             icon: PackageSearch,   show: true },
      { name: "Master Data",      href: "/dashboard/inventory/master-data", icon: Database,        show: true },
      { name: "Barang Masuk",     href: "/dashboard/inventory/pembelian",   icon: ArrowDownToLine, show: true },
      { name: "Proses Sortir",    href: "/dashboard/inventory/sortir",      icon: CheckSquare,     show: true },
      { name: "Pengiriman",       href: "/dashboard/inventory/pengiriman",  icon: ArrowUpRight,    show: true },
      {title: "Tagihan / Invoice",  href: "/inventory/invoice",             icon: Receipt,         show: true }, // <-- Menu baru untuk Invoice
    ];
  } else if (activeModule === "keuangan") {
    moduleTitle = "Keuangan";
    currentMenus = [
      { name: "Cash Flow", href: "/dashboard/cash-flow", icon: Wallet, show: true },
    ];
  } else if (activeModule === "it") {
    moduleTitle = "IT & Sistem";
    currentMenus = [
      { name: "Manajemen User", href: "/dashboard/users", icon: UserCog, show: true },
    ];
  } else {
    // Transaksi & Operasional (Default)
    moduleTitle = "Transaksi & Operasional";
    currentMenus = [
      { name: "Dashboard Analitik", href: "/dashboard",           icon: BarChart3, show: true },
      { name: "Investor & Broker",  href: "/dashboard/investors", icon: Users,     show: true },
      { name: "PKS (MoU)",          href: "/dashboard/mou",       icon: FileText,  show: true },
      { name: "Transaksi",          href: "/dashboard/transaksi", icon: Receipt,   show: true },
      { name: "Reminder",           href: "/dashboard/reminder",  icon: Bell,      show: isAdmin || isUser || isOwner },
    ];
  }

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-30 h-14 bg-sidebar border-b border-sidebar-border flex items-center gap-3 px-4 md:hidden">
        <button onClick={() => setIsOpen(true)} className="text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors">
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-sidebar-primary">
            <Sprout className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
          <span className="font-bold text-sidebar-foreground text-sm">MinBun ERP</span>
        </div>
      </header>

      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/50 transition-opacity duration-300 md:hidden",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={close}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col",
          "transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-sidebar-primary shrink-0">
            <Sprout className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sidebar-foreground">MinBun</h1>
            <p className="text-xs text-sidebar-foreground/60">ERP System</p>
          </div>
          <button onClick={close} className="md:hidden text-sidebar-foreground/70 hover:text-sidebar-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
          {/* Tombol Kembali ke Portal (Hanya untuk Admin/User/Owner) */}
          {isPortalUser && (
            <div className="pb-4 mb-2 border-b border-sidebar-border/50">
              <Link href="/portal" onClick={close}>
                <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 group h-9">
                  <ArrowLeft className="w-4 h-4 mr-2 group-hover:-translate-x-1 transition-transform" />
                  Kembali ke Portal
                </Button>
              </Link>
            </div>
          )}

          {/* Render Menu Modul Aktif */}
          <div className="space-y-1">
            <h3 className="px-3 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/50 mb-2">
              Modul: {moduleTitle}
            </h3>
            <div className="space-y-1">
              {currentMenus.map((item) => {
                if (!item.show) return null;
                const isActive = 
                  pathname === item.href || 
                  (item.href !== "/dashboard" && item.href !== "/dashboard/inventory" && pathname.startsWith(item.href));
                
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={close}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                    )}
                  >
                    <item.icon className="w-5 h-5 shrink-0" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>

        <div className="px-3 py-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-sidebar-accent shrink-0">
              <User className="w-4 h-4 text-sidebar-accent-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.name}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate capitalize">{user?.role}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            onClick={logout}
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </aside>
    </>
  );
}