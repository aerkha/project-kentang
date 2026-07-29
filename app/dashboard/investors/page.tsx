"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { InvestorsContent } from "@/components/investors-content";

export default function InvestorsPage() {
  const { user } = useAuth();
  const router   = useRouter();

  // Akses diberikan ke admin, user, owner, dan investor/broker yang terikat ke
  // master (lihat auth-context.tsx needsLinking). Owner boleh melihat semua
  // data investor sebagai pemegang saham mayoritas / pengawasan.
  useEffect(() => {
    if (user && user.role !== "admin" && user.role !== "user" && user.role !== "owner" && user.role !== "investor") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  if (!user || (user.role !== "admin" && user.role !== "user" && user.role !== "owner" && user.role !== "investor")) return null;
  return <InvestorsContent />;
}
