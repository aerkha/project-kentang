"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { InvestorsContent } from "@/components/investors-content";

export default function InvestorsPage() {
  const { user } = useAuth();
  const router   = useRouter();

  useEffect(() => {
    if (user && user.role !== "admin" && user.role !== "user" && user.role !== "investor") {
      router.replace("/dashboard/modal");
    }
  }, [user, router]);

  if (!user || (user.role !== "admin" && user.role !== "user" && user.role !== "investor")) return null;
  return <InvestorsContent />;
}
