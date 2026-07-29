"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ReminderContent } from "@/components/reminder-content";

export default function ReminderPage() {
  const { user } = useAuth();
  const router   = useRouter();

  // Akses diberikan ke admin, user, dan owner. Owner boleh memantau &
  // menjalankan reminder untuk mengawasi proses bagi hasil investasi.
  useEffect(() => {
    if (user && user.role !== "admin" && user.role !== "user" && user.role !== "owner") {
      router.replace("/dashboard/investors");
    }
  }, [user, router]);

  if (!user || (user.role !== "admin" && user.role !== "user" && user.role !== "owner")) return null;
  return <ReminderContent />;
}
