"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ModalSummaryContent } from "@/components/modal-summary-content";

export default function ModalPage() {
  const { user } = useAuth();
  const router   = useRouter();

  useEffect(() => {
    if (user && user.role !== "admin" && user.role !== "owner" && user.role !== "user") {
      router.replace("/dashboard/investors");
    }
  }, [user, router]);

  if (!user || (user.role !== "admin" && user.role !== "owner" && user.role !== "user")) return null;
  return <ModalSummaryContent />;
}
