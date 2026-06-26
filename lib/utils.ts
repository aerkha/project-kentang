import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Zona waktu aplikasi: WIB (Asia/Jakarta, UTC+7) ──────────────────────────
// Semua perhitungan "hari ini" memakai kalender WIB agar konsisten
// di mana pun aplikasi/server berjalan (browser user maupun Vercel UTC).
// Pakai toLocaleDateString("sv-SE") untuk dapat "YYYY-MM-DD" langsung
// tanpa perlu offset manual yang rapuh di sekitar tengah malam.

/** Tanggal kalender WIB hari ini sebagai "YYYY-MM-DD" */
export function todayWibStr(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Jakarta" })
}
