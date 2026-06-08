"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import pb from "./pocketbase";
import { TreeLoader } from "@/components/ui/tree-loader";

interface User {
  username:   string;
  name:       string;
  role:       string;
  investorId: string; // customId investor (e.g. "INV-0001"), diisi hanya untuk role "investor"
}

interface AuthContextType {
  user: User | null;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin:    boolean;
  isOwner:    boolean;
  isInvestor: boolean;
  canEdit:    boolean; // admin atau owner
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function modelToUser(model: Record<string, string>): User {
  return {
    username:   model.username   || model.email || "",
    name:       model.name       || model.username || model.email || "",
    role:       model.role       || "user",
    investorId: model.investorId || "",
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]         = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Dengarkan perubahan auth (login / logout / token expired)
    const unsubscribe = pb.authStore.onChange((_token, record) => {
      setUser(record ? modelToUser(record as Record<string, string>) : null);
    });

    // Restore session: validasi token ke server supaya tidak pakai token stale
    const restore = async () => {
      if (pb.authStore.isValid) {
        try {
          // authRefresh memverifikasi token ke PocketBase dan memperbarui record
          await pb.collection("users").authRefresh();
          if (pb.authStore.record) {
            setUser(modelToUser(pb.authStore.record as Record<string, string>));
          }
        } catch {
          // Token expired / invalid / tidak ada collection context → paksa logout
          pb.authStore.clear();
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
      setUser(modelToUser(auth.record as Record<string, string>));
      return true;
    } catch {
      return false;
    }
  };

  const logout = () => {
    pb.authStore.clear();
    setUser(null);
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
  const canEdit    = isAdmin || isOwner;

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, isAdmin, isOwner, isInvestor, canEdit }}>
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
