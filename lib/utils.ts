import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Zona waktu aplikasi: WIB (Asia/Jakarta, UTC+7) ──────────────────────────
// Semua perhitungan "hari ini" memakai kalender WIB agar konsisten
// di mana pun aplikasi/server berjalan (browser user maupun Vercel UTC).
// Pakai Intl.DateTimeFormat("en-CA") dengan timeZone eksplisit — lebih
// robust terhadap bug TZ di V8/Node dibanding toLocaleDateString.

/** Tanggal kalender WIB hari ini sebagai "YYYY-MM-DD" */
export function todayWibStr(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}
