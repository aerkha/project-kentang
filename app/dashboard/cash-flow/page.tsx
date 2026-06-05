"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { PengeluaranContent } from "@/components/pengeluaran-content";

export default function CashFlowPage() {
  const { user } = useAuth();
  const router   = useRouter();

  useEffect(() => {
    if (user && user.role !== "admin" && user.role !== "user") {
      router.replace("/dashboard/investors");
    }
  }, [user, router]);

  if (!user || (user.role !== "admin" && user.role !== "user")) return null;
  return <PengeluaranContent />;
}
