"use client";

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import pb from "./pocketbase";
import { TreeLoader } from "@/components/ui/tree-loader";

/**
 * Failsafe: lepas loading screen setelah N ms meskipun authRefresh masih
 * menggantung. Mencegah UI stuck selamanya kalau PocketBase unreachable
 * (mis. reverse-proxy mati saat deploy ke VPS, atau PB server down).
 *
 * 8 detik sudah cukup untuk kebanyakan respons PB; di atas itu kita anggap
 * unreachable dan lepas loading agar user bisa login ulang.
 */
const AUTH_TIMEOUT_MS = 8_000;

interface User {
  username:    string;
  name:        string;
  role:        string;         // primary role dari DB (e.g. "broker")
  activeRole:  string;        // role aktif untuk view switching (hybrid user)
  investorId:  string;
  brokerId:    string;
  hasDualRole: boolean;       // true kalau punya BOTH investorId & brokerId
}

interface AuthContextType {
  user: User | null;
  /** m-13: true kalau role eksternal (investor/broker) tapi field PK-nya kosong */
  needsLinking: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  /** Switch active role untuk hybrid user (punya investorId & brokerId) */
  switchRole: (role: "investor" | "broker") => void;
  isAuthenticated: boolean;
  isAdmin:    boolean;
  isOwner:    boolean;
  isInvestor: boolean;
  isBroker:   boolean;
  canEdit:    boolean; // admin atau owner
}

const ACTIVE_ROLE_STORAGE_KEY = "minbun_activeRole";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** m-13 Opsi A: Validasi kelengkapan PK untuk role eksternal.
 *  Investor harus punya investorId, broker harus punya brokerId. Bila tidak,
 *  kembalikan null — accessor di AuthProvider akan menyimpan ini dan mengekspos
 *  `needsLinking = true` sehingga halaman /hubungi-admin dapat ditampilkan.
 */
function modelToUser(model: Record<string, string>): User | null {
  const role     = model.role || "user";
  const investor = model.investorId || "";
  const broker   = model.brokerId   || "";

  if (role === "investor" && !investor) return null;
  if (role === "broker"   && !broker)   return null;

  // Hybrid user: punya BOTH investorId & brokerId → bisa switch role
  const hasDualRole = !!investor && !!broker;

  // Untuk hybrid user, restore activeRole dari localStorage (default = primary role)
  let activeRole = role;
  if (hasDualRole && typeof window !== "undefined") {
    const stored = window.localStorage.getItem(ACTIVE_ROLE_STORAGE_KEY);
    if (stored === "investor" || stored === "broker") {
      activeRole = stored;
    }
  }

  return {
    username:    model.username || model.email || "",
    name:        model.name     || model.username || model.email || "",
    role,
    activeRole,
    investorId:  investor,
    brokerId:    broker,
    hasDualRole,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]         = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  // M-5: SDK fires onChange during authRefresh. Guard dengan applyingRef
  // untuk mencegah double-setUser.
  const applyingRef = useRef(false);

  useEffect(() => {
    // Dengarkan perubahan auth (login / logout / token expired)
    const unsubscribe = pb.authStore.onChange((_token, record) => {
      if (applyingRef.current) return;
      setUser(record ? modelToUser(record as Record<string, string>) : null);
    });

    // Failsafe: lepas loading screen setelah AUTH_TIMEOUT_MS agar UI tidak
    // menggantung selamanya kalau PocketBase unreachable.
    const failsafe = setTimeout(() => {
      setIsLoading((current) => {
        if (current) console.warn("[auth] authRefresh timeout — releasing loading screen");
        return false;
      });
    }, AUTH_TIMEOUT_MS);

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
          // dsb.) JANGAN logout paksa — biarkan user mencoba recover, atau
          // biarkan user login ulang dari halaman login (loading screen
          // sudah terlepas via failsafe / finally di bawah).
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
      clearTimeout(failsafe);
      setIsLoading(false);
    };

    restore();

    return () => {
      clearTimeout(failsafe);
      unsubscribe();
    };
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const auth = await pb.collection("users").authWithPassword(username, password);
      const loggedInUser = modelToUser(auth.record as Record<string, string>);
      setUser(loggedInUser);

      // m-13: kalau login sukses tapi role=investor/broker tanpa PK linkage,
      // arahkan ke halaman "akun belum terhubung". Halaman ini memandu user
      // menghubungi admin. Tanpa guard ini mereka akan melihat UI kosong
      // karena semua data lain memfilter investorId mereka.
      if (!loggedInUser) {
        router.push("/hubungi-admin");
      } else if (loggedInUser.activeRole === "investor" || loggedInUser.activeRole === "broker") {
        router.push("/dashboard");
      } else {
        router.push("/portal");
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
      localStorage.removeItem(ACTIVE_ROLE_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent("app:logout"));
    }
    router.push("/");
  };

  /** Switch active role untuk hybrid user (punya investorId & brokerId).
   *  Persist ke localStorage agar bertahan setelah refresh. */
  const switchRole = (newRole: "investor" | "broker") => {
    setUser((prev) => {
      if (!prev || !prev.hasDualRole) return prev;
      if (typeof window !== "undefined") {
        localStorage.setItem(ACTIVE_ROLE_STORAGE_KEY, newRole);
      }
      return { ...prev, activeRole: newRole };
    });
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
  const isInvestor = user?.activeRole === "investor";
  const isBroker   = user?.activeRole === "broker";
  const canEdit    = isAdmin || isOwner;

  // m-13: cek apakah user ada tapi field PK-nya kosong untuk role eksternal.
  // Untuk hybrid user, cek field PK berdasarkan activeRole.
  const needsLinking =
    !!user &&
    ((user.activeRole === "investor" && !user.investorId) ||
     (user.activeRole === "broker"   && !user.brokerId));

  return (
    <AuthContext.Provider value={{
      user,
      needsLinking,
      login,
      logout,
      switchRole,
      isAuthenticated: !!user,
      isAdmin, isOwner, isInvestor, isBroker, canEdit,
    }}>
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
