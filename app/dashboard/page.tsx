"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { DashboardContent } from "@/components/dashboard-content";

export default function DashboardPage() {
  const { user } = useAuth();
  const router   = useRouter();

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/dashboard/modal");
    }
  }, [user, router]);

  if (!user || user.role !== "admin") return null;
  return <DashboardContent />;
}
