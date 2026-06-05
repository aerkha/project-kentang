"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { DashboardContent } from "@/components/dashboard-content";

export default function DashboardPage() {
  const { user } = useAuth();
  const router   = useRouter();

  useEffect(() => {
    if (user && user.role !== "admin" && user.role !== "owner") {
      router.replace("/dashboard/investors");
    }
  }, [user, router]);

  if (!user || (user.role !== "admin" && user.role !== "owner")) return null;
  return <DashboardContent />;
}
