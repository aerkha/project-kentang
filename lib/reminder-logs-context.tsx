"use client";

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import pb from "./pocketbase";

// ── Tipe ─────────────────────────────────────────────────────────────────────

export type ChannelStatus = "sent" | "failed" | "skipped";

export interface ReminderLog {
  id:           string;
  mouCustomId:  string;
  cycleNumber:  number;
  sentAt:       string;       // ISO string
  investorName: string;
  emailStatus:  ChannelStatus;
  waStatus:     ChannelStatus;
  errorMessage: string;
  triggeredBy:  "cron" | "manual";
}

interface ReminderLogsContextType {
  logs:       ReminderLog[];
  isLoading:  boolean;
  refresh:    () => Promise<void>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ReminderLogsContext = createContext<ReminderLogsContextType | undefined>(undefined);

function recordToLog(r: Record<string, unknown>): ReminderLog {
  return {
    id:           r.id           as string,
    mouCustomId:  r.mouCustomId  as string,
    cycleNumber:  (r.cycleNumber as number) || 0,
    sentAt:       r.sentAt       as string,
    investorName: (r.investorName as string) || "",
    emailStatus:  (r.emailStatus as ChannelStatus) || "skipped",
    waStatus:     (r.waStatus    as ChannelStatus) || "skipped",
    errorMessage: (r.errorMessage as string) || "",
    triggeredBy:  (r.triggeredBy as "cron" | "manual") || "cron",
  };
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ReminderLogsProvider({ children }: { children: ReactNode }) {
  const [logs,      setLogs]      = useState<ReminderLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const records = await pb.collection("reminder_logs").getFullList({
        sort: "-sentAt",
      });
      setLogs(records.map((r) => recordToLog(r as Record<string, unknown>)));
    } catch {
      // Collection belum ada atau belum ada data — bukan error kritis
      setLogs([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <ReminderLogsContext.Provider value={{ logs, isLoading, refresh }}>
      {children}
    </ReminderLogsContext.Provider>
  );
}

export function useReminderLogs() {
  const ctx = useContext(ReminderLogsContext);
  if (!ctx) throw new Error("useReminderLogs must be used within ReminderLogsProvider");
  return ctx;
}
