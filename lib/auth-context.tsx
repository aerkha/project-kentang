"use client";

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation"; // <-- TAMBAHAN: Untuk mengarahkan halaman
import pb from "./pocketbase";
import { TreeLoader } from "@/components/ui/tree-loader";

interface User {
  username:   string;
  name:       string;
  role:       string;
  investorId: string;
  brokerId?:  string;
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin:    boolean;
  isOwner:    boolean;
  isInvestor: boolean;
  isBroker:   boolean;
  canEdit:    boolean; // admin atau owner
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function modelToUser(model: Record<string, string>): User {
  return {
    username:   model.username   || model.email || "",
    name:       model.name       || model.username || model.email || "",
    role:       model.role       || "user",
    investorId: model.investorId || "",
    brokerId:   model.brokerId   || "", // <-- PERBAIKAN: Menyimpan data brokerId ke memori
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]         = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter(); // <-- TAMBAHAN: Inisialisasi router

  // M-5: SDK fires onChange during authRefresh. Guard dengan applyingRef
  // untuk mencegah double-setUser.
  const applyingRef = useRef(false);

  useEffect(() => {
    // Dengarkan perubahan auth (login / logout / token expired)
    const unsubscribe = pb.authStore.onChange((_token, record) => {
      if (applyingRef.current) return;
      setUser(record ? modelToUser(record as Record<string, string>) : null);
    });

    // Restore session: validasi token ke server supaya tidak pakai token stale
    const restore = async () => {
      if (pb.authStore.isValid) {
        try {
          applyingRef.current = true;
          // authRefresh memverifikasi token ke PocketBase dan memperbarui record
          await pb.collection("users").authRefresh();
          if (pb.authStore.record) {
            setUser(modelToUser(pb.authStore.record as Record<string, string>));
          }
        } catch (err) {
          // C-2: Hanya bersihkan auth pada token benar-benar invalid/expired
          // (status 401/403). Untuk error lain (network, koleksi belum ada,
          // dsb.) JANGAN logout paksa — biarkan user mencoba recover.
          const status = (err as { status?: number } | null)?.status;
          if (status === 401 || status === 403) {
            pb.authStore.clear();
            setUser(null);
          } else {
            console.warn("[auth] authRefresh gagal non-401:", err);
          }
        } finally {
          applyingRef.current = false;
        }
      }
      setIsLoading(false);
    };

    restore();

    return () => unsubscribe();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const auth = await pb.collection("users").authWithPassword(username, password);
      const loggedInUser = modelToUser(auth.record as Record<string, string>);
      setUser(loggedInUser);

      // ── LOGIKA REDIRECT SETELAH LOGIN BERHASIL ──
      if (loggedInUser.role === "investor" || loggedInUser.role === "broker") {
        router.push("/dashboard"); // Langsung masuk ke Transaksi / Dashboard utama
      } else {
        router.push("/portal"); // Admin, User, dan Owner diarahkan ke halaman Portal 4 Kartu
      }

      return true;
    } catch {
      return false;
    }
  };

  const logout = () => {
    pb.authStore.clear();
    setUser(null);
    // M-2 Sinyal ke seluruh konteks untuk membersihkan pbIdMap lokal
    // (mencegah leakage record id antar sesi user pada browser yang sama).
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("app:logout"));
    }
    router.push("/"); // Memastikan saat logout otomatis dikembalikan ke form login
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <TreeLoader />
      </div>
    );
  }

  const isAdmin    = user?.role === "admin";
  const isOwner    = user?.role === "owner";
  const isInvestor = user?.role === "investor";
  const isBroker   = user?.role === "broker";
  const canEdit    = isAdmin || isOwner;

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, isAdmin, isOwner, isInvestor, isBroker, canEdit }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}