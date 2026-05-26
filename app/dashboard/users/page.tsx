"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { UsersContent } from "@/components/users-content";

export default function UsersPage() {
  const { user } = useAuth();
  const router   = useRouter();

  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/dashboard/investors");
    }
  }, [user, router]);

  if (!user || user.role !== "admin") return null;

  return <UsersContent />;
}
