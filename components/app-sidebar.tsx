"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Sprout, Users, BarChart3, LogOut, User, FileText, Receipt,
  UserCog, Menu, X, Wallet, Bell, PackageSearch, ArrowLeft,
  Briefcase, TrendingUp, Repeat, KeyRound, Loader2, Eye, EyeOff
} from "lucide-react";
import {
  Database, ArrowDownToLine, CheckSquare, ArrowUpRight
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import pb from "@/lib/pocketbase";

export function AppSidebar() {
  const pathname = usePathname();
  const { user, logout, switchRole } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const close = () => setIsOpen(false);

  // Change Password dialog state
  const [isPwOpen, setIsPwOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ oldPassword: "", password: "", passwordConfirm: "" });
  const [pwError, setPwError] = useState("");
  const [isPwSaving, setIsPwSaving] = useState(false);
  const [showOldPw, setShowOldPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const resetPwForm = () => {
    setPwForm({ oldPassword: "", password: "", passwordConfirm: "" });
    setPwError("");
    setShowOldPw(false);
    setShowNewPw(false);
    setShowConfirmPw(false);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    if (!pwForm.oldPassword) {
      setPwError("Password lama wajib diisi");
      return;
    }
    if (pwForm.password !== pwForm.passwordConfirm) {
      setPwError("Password baru tidak cocok");
      return;
    }
    if (pwForm.password.length < 8) {
      setPwError("Password baru minimal 8 karakter");
      return;
    }
    if (pwForm.oldPassword === pwForm.password) {
      setPwError("Password baru harus berbeda dari password lama");
      return;
    }

    setIsPwSaving(true);
    try {
      const res = await fetch("/api/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pb.authStore.token}`,
        },
        body: JSON.stringify(pwForm),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPwError(data?.error || "Gagal mengganti password");
        return;
      }
      toast.success("Password berhasil diubah");
      setIsPwOpen(false);
      resetPwForm();
    } catch {
      setPwError("Terjadi kesalahan jaringan");
    } finally {
      setIsPwSaving(false);
    }
  };

  const isAdmin = user?.role === "admin";
  const isUser = user?.role === "user";
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
    moduleTitle = "Gudang & Operasional";
    currentMenus = [
      { name: "Manajemen Stok", href: "/dashboard/inventory", icon: PackageSearch, show: true },
      { name: "Master Data", href: "/dashboard/inventory/master-data", icon: Database, show: true },
      { name: "Pembelian", href: "/dashboard/inventory/pembelian", icon: ArrowDownToLine, show: true },
      { name: "Proses Sortir", href: "/dashboard/inventory/sortir", icon: CheckSquare, show: true },
      { name: "Pengiriman", href: "/dashboard/inventory/pengiriman", icon: ArrowUpRight, show: true },
      { name: "Tagihan / Invoice", href: "/dashboard/inventory/invoice", icon: Receipt, show: true }, // <-- Menu baru untuk Invoice
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
    moduleTitle = "Investasi & Mapping Modal";
    currentMenus = [
      { name: "Dashboard Analitik", href: "/dashboard", icon: BarChart3, show: true },
      { name: "Investor & Broker", href: "/dashboard/investors", icon: Users, show: true },
      { name: "PKS", href: "/dashboard/pks", icon: FileText, show: true },
      { name: "Mapping Modal", href: "/dashboard/transaksi", icon: Receipt, show: true },
      { name: "Reminder", href: "/dashboard/reminder", icon: Bell, show: isAdmin || isUser || isOwner },
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
          {/* Role Switcher untuk hybrid user (punya investorId & brokerId) */}
          {user?.hasDualRole && (
            <div className="mb-3">
              <div className="flex items-center gap-1.5 px-1 mb-1.5">
                <Repeat className="w-3.5 h-3.5 text-sidebar-foreground/50" />
                <span className="text-[11px] font-medium text-sidebar-foreground/50 uppercase tracking-wide">
                  Switch Role
                </span>
              </div>
              <div className="flex items-center gap-1 p-1 bg-sidebar-accent/30 rounded-lg">
                <button
                  onClick={() => switchRole("broker")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 text-xs py-2 px-2 rounded-md font-medium transition-colors",
                    user.activeRole === "broker"
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  Broker
                </button>
                <button
                  onClick={() => switchRole("investor")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 text-xs py-2 px-2 rounded-md font-medium transition-colors",
                    user.activeRole === "investor"
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  Investor
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-sidebar-accent shrink-0">
              <User className="w-4 h-4 text-sidebar-accent-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{user?.name}</p>
              <p className="text-xs text-sidebar-foreground/60 truncate capitalize">{user?.activeRole}</p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            onClick={() => { resetPwForm(); setIsPwOpen(true); }}
          >
            <KeyRound className="w-4 h-4" />
            Change Password
          </Button>
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

      {/* Dialog Change Password */}
      <Dialog
        open={isPwOpen}
        onOpenChange={(o) => {
          setIsPwOpen(o);
          if (!o) resetPwForm();
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              Change Password
            </DialogTitle>
            <DialogDescription>
              Ubah password akun Anda. Password lama diperlukan untuk verifikasi.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleChangePassword} className="space-y-4 mt-2">
            {/* Password Lama */}
            <div className="space-y-1.5">
              <Label htmlFor="oldPassword">Password Lama</Label>
              <div className="relative">
                <Input
                  id="oldPassword"
                  type={showOldPw ? "text" : "password"}
                  autoComplete="current-password"
                  value={pwForm.oldPassword}
                  onChange={(e) => setPwForm((f) => ({ ...f, oldPassword: e.target.value }))}
                  className="pr-10"
                  disabled={isPwSaving}
                />
                <button
                  type="button"
                  onClick={() => setShowOldPw((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showOldPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Password Baru */}
            <div className="space-y-1.5">
              <Label htmlFor="newPassword">Password Baru</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={pwForm.password}
                  onChange={(e) => setPwForm((f) => ({ ...f, password: e.target.value }))}
                  className="pr-10"
                  disabled={isPwSaving}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPw((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Minimal 8 karakter.</p>
            </div>

            {/* Konfirmasi Password */}
            <div className="space-y-1.5">
              <Label htmlFor="passwordConfirm">Konfirmasi Password Baru</Label>
              <div className="relative">
                <Input
                  id="passwordConfirm"
                  type={showConfirmPw ? "text" : "password"}
                  autoComplete="new-password"
                  value={pwForm.passwordConfirm}
                  onChange={(e) => setPwForm((f) => ({ ...f, passwordConfirm: e.target.value }))}
                  className="pr-10"
                  disabled={isPwSaving}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPw((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showConfirmPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {pwError && (
              <p className="text-sm text-destructive">{pwError}</p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsPwOpen(false)}
                disabled={isPwSaving}
              >
                Batal
              </Button>
              <Button type="submit" disabled={isPwSaving}>
                {isPwSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  "Simpan"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}