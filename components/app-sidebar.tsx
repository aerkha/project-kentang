"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Sprout, Users, BarChart3, LogOut, User, FileText, Receipt, UserCog, Menu, X, Wallet, Bell, Banknote } from "lucide-react";

// roles: null = semua, array = hanya role tersebut
const allNavigation = [
  { name: "Dashboard Analitik",  href: "/dashboard",           icon: BarChart3, roles: ["admin"] },
  { name: "Investor",            href: "/dashboard/investors", icon: Users,     roles: ["admin", "user"] },
  { name: "Transaksi",           href: "/dashboard/transaksi", icon: Receipt,   roles: null },
  { name: "Perjanjian Kerjasama",href: "/dashboard/mou",       icon: FileText,  roles: null },
  { name: "Ringkasan Modal",     href: "/dashboard/modal",     icon: Banknote,  roles: ["admin", "owner", "user"] },
  { name: "Reminder",            href: "/dashboard/reminder",  icon: Bell,      roles: ["admin", "user"] },
  { name: "Cash Flow",           href: "/dashboard/cash-flow", icon: Wallet,    roles: ["admin", "user"] },
  { name: "Manajemen User",      href: "/dashboard/users",     icon: UserCog,   roles: ["admin"] },
];

export function AppSidebar() {
  const pathname  = usePathname();
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const navigation = allNavigation.filter((item) =>
    item.roles === null || (user?.role && item.roles.includes(user.role))
  );

  const close = () => setIsOpen(false);

  return (
    <>
      {/* ── Mobile top bar ─────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-30 h-14 bg-sidebar border-b border-sidebar-border flex items-center gap-3 px-4 md:hidden">
        <button
          onClick={() => setIsOpen(true)}
          className="text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
          aria-label="Buka menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-md bg-sidebar-primary">
            <Sprout className="w-4 h-4 text-sidebar-primary-foreground" />
          </div>
          <span className="font-bold text-sidebar-foreground text-sm">MinBun ERP</span>
        </div>
      </header>

      {/* ── Backdrop (mobile only) ─────────────────────────────── */}
      <div
        className={cn(
          "fixed inset-0 z-30 bg-black/50 transition-opacity duration-300 md:hidden",
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={close}
        aria-hidden="true"
      />

      {/* ── Sidebar ────────────────────────────────────────────── */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar border-r border-sidebar-border flex flex-col",
          "transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-sidebar-primary shrink-0">
            <Sprout className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-sidebar-foreground">MinBun</h1>
            <p className="text-xs text-sidebar-foreground/60">ERP System</p>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={close}
            className="md:hidden text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
            aria-label="Tutup menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
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
        </nav>

        {/* User section */}
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
