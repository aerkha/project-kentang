import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Zona waktu aplikasi: WIB (UTC+7) ────────────────────────────────────────
// Semua perhitungan "hari ini" memakai kalender WIB agar konsisten
// di mana pun aplikasi/server berjalan (browser user maupun Vercel UTC).

const WIB_OFFSET_MS = 7 * 3_600_000;

/** Tanggal kalender WIB hari ini sebagai "YYYY-MM-DD" */
export function todayWibStr(): string {
  return new Date(Date.now() + WIB_OFFSET_MS).toISOString().slice(0, 10)
}
